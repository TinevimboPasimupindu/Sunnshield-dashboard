from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from pydantic import BaseModel
from typing import Optional
import models
from datetime import datetime, timedelta
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font
import io


router = APIRouter(prefix="/api/batches", tags=["batches"])

class BatchCreate(BaseModel):
    notes: Optional[str] = None

@router.get("/")
def get_batches(db: Session = Depends(get_db)):
    batches = db.query(models.Batch).order_by(models.Batch.created_at.desc()).all()
    result = []
    for batch in batches:
        total_orders = len(batch.batch_orders)
        approved = sum(1 for bo in batch.batch_orders if bo.status == models.BatchOrderStatusEnum.APPROVED)
        rejected = sum(1 for bo in batch.batch_orders if bo.status == models.BatchOrderStatusEnum.REJECTED)
        total_amount_usd = sum(
            bo.order.amount for bo in batch.batch_orders
            if bo.order.currency == models.CurrencyEnum.USD
        )
        total_amount_zwl = sum(
            bo.order.amount for bo in batch.batch_orders
            if bo.order.currency == models.CurrencyEnum.ZWL
        )
        result.append({
            "id": batch.id,
            "batch_number": batch.batch_number,
            "status": batch.status,
            "notes": batch.notes,
            "submitted_at": batch.submitted_at,
            "created_at": batch.created_at,
            "total_orders": total_orders,
            "approved": approved,
            "rejected": rejected,
            "total_amount_usd": round(total_amount_usd, 2),
            "total_amount_zwl": round(total_amount_zwl, 2),
        })
    return result

@router.post("/")
def create_batch(data: BatchCreate, db: Session = Depends(get_db)):
    count = db.query(models.Batch).count()
    batch_number = f"BATCH-{datetime.now().year}-{str(count + 1).zfill(3)}"
    batch = models.Batch(
        batch_number=batch_number,
        notes=data.notes,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch

@router.get("/open")
def get_open_batch(db: Session = Depends(get_db)):
    batch = db.query(models.Batch).filter(
        models.Batch.status == models.BatchStatusEnum.OPEN
    ).first()
    if not batch:
        return {"batch": None}
    return {
        "batch": {
            "id": batch.id,
            "batch_number": batch.batch_number,
            "status": batch.status,
            "total_orders": len(batch.batch_orders),
        }
    }

@router.post("/{batch_id}/add-order/{order_id}")
def add_order_to_batch(batch_id: int, order_id: int, db: Session = Depends(get_db)):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    batch_order = models.BatchOrder(
        batch_id=batch_id,
        order_id=order_id,
    )
    db.add(batch_order)
    db.commit()
    return {"message": "Order added to batch"}

@router.put("/{batch_id}/status")
def update_batch_status(batch_id: int, status: str, db: Session = Depends(get_db)):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    try:
        batch.status = models.BatchStatusEnum(status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status")
    if status == "SUBMITTED":
        batch.submitted_at = datetime.utcnow()
    db.commit()
    return {"message": "Status updated"}

@router.get("/{batch_id}/orders")
def get_batch_orders(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    orders = []
    for bo in batch.batch_orders:
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
        })
    return {"batch_number": batch.batch_number, "status": batch.status, "orders": orders}

@router.get("/{batch_id}/export")
def export_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(models.Batch).filter(models.Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    # Header row styling
    headers = ["Reference", "IdNumber", "EcNumber", "Type", "StartDate", "EndDate", "Amount"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)

    # Column widths
    col_widths = [15, 20, 15, 10, 15, 15, 12]
    for i, width in enumerate(col_widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = width

    # Data rows
    for bo in batch.batch_orders:
        order = bo.order
        client = order.client

        start_date = order.created_at or datetime.utcnow()
        end_date = start_date + timedelta(days=30 * order.term_months)

        ws.append([
            order.reference_number or "",
            client.id_number,
            client.ec_number,
            "NEW",
            start_date.strftime("%d/%b/%Y"),
            end_date.strftime("%d/%b/%Y"),
            order.monthly_instalment,
    ])

    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"{batch.batch_number}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )