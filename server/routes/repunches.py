from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from pydantic import BaseModel
from typing import Optional
import models
from datetime import datetime

router = APIRouter(prefix="/api/repunches", tags=["repunches"])

@router.get("/")
@router.get("/")
def get_repunches(db: Session = Depends(get_db)):
    # Get all batches that have rejected or pending orders after a response
    batches = db.query(models.Batch).filter(
        models.Batch.status == models.BatchStatusEnum.IN_PROGRESS
    ).order_by(models.Batch.created_at.desc()).all()

    result = []
    for batch in batches:
        rejected_orders = [
            bo for bo in batch.batch_orders
            if bo.status in [
                models.BatchOrderStatusEnum.REJECTED,
                models.BatchOrderStatusEnum.ADJUSTED
            ]
        ]
        if not rejected_orders:
            continue

        orders = []
        for bo in rejected_orders:
            orders.append({
                "batch_order_id": bo.id,
                "order_id": bo.order.id,
                "status": bo.status,
                "rejection_reason": bo.rejection_reason,
                "adjusted_term_months": bo.adjusted_term_months,
                "adjusted_instalment": bo.adjusted_instalment,
                "client": {
                    "full_name": bo.order.client.full_name,
                    "ec_number": bo.order.client.ec_number,
                    "id_number": bo.order.client.id_number,
                },
                "amount": bo.order.amount,
                "currency": bo.order.currency,
                "term_months": bo.order.term_months,
                "monthly_instalment": bo.order.monthly_instalment,
                "reference_number": bo.order.reference_number,
                "start_date": bo.order.start_date,
                "end_date": bo.order.end_date,
            })

        result.append({
            "batch_id": batch.id,
            "batch_number": batch.batch_number,
            "status": batch.status,
            "created_at": batch.created_at,
            "total_rejected": len(rejected_orders),
            "fixed_count": sum(1 for bo in rejected_orders if bo.status == models.BatchOrderStatusEnum.ADJUSTED),
            "orders": orders,
        })

    return result


class AdjustOrder(BaseModel):
    adjusted_term_months: int
    adjusted_instalment: float
    new_start_date: Optional[str] = None
    new_end_date: Optional[str] = None


@router.put("/{batch_order_id}/adjust")
def adjust_order(batch_order_id: int, data: AdjustOrder, db: Session = Depends(get_db)):
    batch_order = db.query(models.BatchOrder).filter(
        models.BatchOrder.id == batch_order_id
    ).first()
    if not batch_order:
        raise HTTPException(status_code=404, detail="Record not found")

    batch_order.adjusted_term_months = data.adjusted_term_months
    batch_order.adjusted_instalment = data.adjusted_instalment
    batch_order.status = models.BatchOrderStatusEnum.ADJUSTED

    if data.new_start_date:
        batch_order.order.start_date = data.new_start_date
    if data.new_end_date:
        batch_order.order.end_date = data.new_end_date

    db.commit()
    return {"message": "Order adjusted successfully"}


@router.post("/{batch_id}/resubmit")
def resubmit_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    adjusted_orders = [
        bo for bo in batch.batch_orders
        if bo.status == models.BatchOrderStatusEnum.ADJUSTED
    ]

    if not adjusted_orders:
        raise HTTPException(status_code=400, detail="No adjusted orders to resubmit")

    # Create new batch for resubmission
    date_str = datetime.now().strftime("%Y%m%d")
    currency = adjusted_orders[0].order.currency.value
    count = db.query(models.Batch).filter(
        models.Batch.batch_number.like(f"{currency}-%")
    ).count()
    new_batch_number = f"{currency}-{date_str}-RPX-{str(count + 1).zfill(3)}"

    new_batch = models.Batch(
    batch_number=new_batch_number,
    status=models.BatchStatusEnum.OPEN
)
    db.add(new_batch)
    db.flush()

    for bo in adjusted_orders:
        bo.order.term_months = bo.adjusted_term_months
        bo.order.monthly_instalment = bo.adjusted_instalment

        new_bo = models.BatchOrder(
            batch_id=new_batch.id,
            order_id=bo.order.id,
        )
        db.add(new_bo)

    db.commit()
    db.refresh(new_batch)

    return {
        "message": "Resubmission batch created",
        "new_batch_number": new_batch.batch_number,
        "new_batch_id": new_batch.id,
        "orders_count": len(adjusted_orders),
    }

    
class FixDataRequest(BaseModel):
    id_number: Optional[str] = None
    ec_number: Optional[str] = None

@router.put("/{batch_order_id}/fix-data")
def fix_data(batch_order_id: int, data: FixDataRequest, db: Session = Depends(get_db)):
    batch_order = db.query(models.BatchOrder).filter(
        models.BatchOrder.id == batch_order_id
    ).first()
    if not batch_order:
        raise HTTPException(status_code=404, detail="Record not found")

    client = batch_order.order.client
    if data.id_number:
        client.id_number = data.id_number
    if data.ec_number:
        client.ec_number = data.ec_number

    batch_order.status = models.BatchOrderStatusEnum.ADJUSTED
    db.commit()

    return {"message": "Data fixed successfully"}