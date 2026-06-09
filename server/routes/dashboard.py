from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from database import get_db
import models
from datetime import datetime

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    # Active clients — only those with at least one approved order
    active_clients = db.query(models.Client).join(models.Order).join(models.BatchOrder).filter(
        models.BatchOrder.status == models.BatchOrderStatusEnum.APPROVED
    ).distinct().count()

    # Approval rate
    total_batch_orders = db.query(models.BatchOrder).count()
    approved_orders = db.query(models.BatchOrder).filter(
        models.BatchOrder.status == models.BatchOrderStatusEnum.APPROVED
    ).count()
    approval_rate = round((approved_orders / total_batch_orders * 100)) if total_batch_orders > 0 else 0

    # Pending resubmission
    pending = db.query(models.BatchOrder).filter(
        models.BatchOrder.status == models.BatchOrderStatusEnum.REJECTED
    ).count()

    # Expected monthly income
    approved_orders_usd = db.query(models.Order).join(models.BatchOrder).filter(
        models.BatchOrder.status == models.BatchOrderStatusEnum.APPROVED,
        models.Order.currency == models.CurrencyEnum.USD
    ).all()
    approved_orders_zwl = db.query(models.Order).join(models.BatchOrder).filter(
        models.BatchOrder.status == models.BatchOrderStatusEnum.APPROVED,
        models.Order.currency == models.CurrencyEnum.ZWL
    ).all()

    monthly_usd = sum(o.monthly_instalment for o in approved_orders_usd)
    monthly_zwl = sum(o.monthly_instalment for o in approved_orders_zwl)

    # Recent batches
    recent_batches = db.query(models.Batch).order_by(
        models.Batch.created_at.desc()
    ).limit(5).all()

    return {
        "active_clients": active_clients,
        "approval_rate": approval_rate,
        "pending_resubmission": pending,
        "monthly_income_usd": round(monthly_usd, 2),
        "monthly_income_zwl": round(monthly_zwl, 2),
        "recent_batches": [
            {
                "batch_number": b.batch_number,
                "status": b.status,
            }
            for b in recent_batches
        ]
    }

@router.get("/forecast")
def get_forecast(db: Session = Depends(get_db)):
    months = []
    now = datetime.utcnow()

    for i in range(6):
        month = (now.month + i - 1) % 12 + 1
        year = now.year + ((now.month + i - 1) // 12)
        month_name = datetime(year, month, 1).strftime("%b")

        # Sum all active approved instalments for this month
        usd_total = db.query(func.sum(models.Order.monthly_instalment)).join(
            models.BatchOrder
        ).filter(
            models.BatchOrder.status == models.BatchOrderStatusEnum.APPROVED,
            models.Order.currency == models.CurrencyEnum.USD
        ).scalar() or 0

        zwl_total = db.query(func.sum(models.Order.monthly_instalment)).join(
            models.BatchOrder
        ).filter(
            models.BatchOrder.status == models.BatchOrderStatusEnum.APPROVED,
            models.Order.currency == models.CurrencyEnum.ZWL
        ).scalar() or 0

        months.append({
            "month": month_name,
            "usd": round(usd_total, 2),
            "zwl": round(zwl_total, 2),
        })

    return {"forecast": months}