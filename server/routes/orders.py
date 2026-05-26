from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
import anthropic
import base64
import os
import json

router = APIRouter(prefix="/api/orders", tags=["orders"])

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

class OrderCreate(BaseModel):
    full_name: str
    id_number: str
    ec_number: str
    reference_number: Optional[str] = None
    employer: Optional[str] = None
    amount: float
    currency: str = "USD"
    term_months: int
    vehicle_id: Optional[int] = None

@router.post("/scan")
async def scan_form(file: UploadFile = File(...)):
    contents = await file.read()
    base64_image = base64.standard_b64encode(contents).decode("utf-8")

    extension = file.filename.split(".")[-1].lower()
    media_type_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }
    media_type = media_type_map.get(extension, "image/jpeg")

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64_image,
                        },
                    },
                    {
                        "type": "text",
                        "text": """Extract the following fields from this civil servant order form and return ONLY a valid JSON object with no extra text, no markdown, no backticks.

Fields to extract:
- full_name (string)
- id_number (string, SA ID number)
- ec_number (string, employee/payroll number)
- reference_number (string)
- employer (string, department or institution)
- amount (number, purchase amount)
- term_months (number, repayment period in months)
- currency (string, either USD or ZWL)

If a field is not found or unclear, set it to null.

Return only the JSON object."""
                    }
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()

    try:
        extracted = json.loads(raw)
    except json.JSONDecodeError:
        extracted = {
            "full_name": None,
            "id_number": None,
            "ec_number": None,
            "reference_number": None,
            "employer": None,
            "amount": None,
            "term_months": None,
            "currency": None,
        }

    return {"extracted": extracted}


@router.post("/")
def create_order(data: OrderCreate, db: Session = Depends(get_db)):
    existing_client = db.query(models.Client).filter(
        models.Client.ec_number == data.ec_number
    ).first()

    if existing_client:
        client_obj = existing_client
    else:
        client_obj = models.Client(
            full_name=data.full_name,
            id_number=data.id_number,
            ec_number=data.ec_number,
            employer=data.employer,
        )
        db.add(client_obj)
        db.flush()

    monthly_instalment = round(data.amount / data.term_months, 2)

    order = models.Order(
        client_id=client_obj.id,
        vehicle_id=data.vehicle_id,
        reference_number=data.reference_number,
        amount=data.amount,
        currency=data.currency,
        term_months=data.term_months,
        monthly_instalment=monthly_instalment,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        "message": "Order saved successfully",
        "order_id": order.id,
        "client_id": client_obj.id,
        "monthly_instalment": monthly_instalment,
    }