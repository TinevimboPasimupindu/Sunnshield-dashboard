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
import pathlib
from dotenv import load_dotenv
from PIL import Image
import io as io_module

# Load .env from the server directory
load_dotenv(dotenv_path=pathlib.Path(__file__).parent / ".env")

router = APIRouter(prefix="/api/orders", tags=["orders"])



class OrderCreate(BaseModel):
    ec_number: str
    id_number: str
    reference_number: Optional[str] = None
    start_date: str
    end_date: str
    amount: float
    currency: str = "USD"
    vehicle_id: Optional[int] = None

@router.post("/scan")
async def scan_form(file: UploadFile = File(...)):

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    contents = await file.read()
    # Auto-rotate image based on EXIF data
    try:
        img = Image.open(io_module.BytesIO(contents))
        exif = img.getexif()
        orientation = exif.get(274)
        rotations = {3: 180, 6: 270, 8: 90}
        if orientation in rotations:
            img = img.rotate(rotations[orientation], expand=True)
        output = io_module.BytesIO()
        img.save(output, format="JPEG")
        contents = output.getvalue()
    except Exception:
        pass
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
        model="claude-sonnet-4-5",
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
                        "text": """You are reading a Zimbabwean civil servant salary deduction form. Extract exactly these fields:

- ec_number: labeled EC NUMBER (may include a letter e.g. 2012368F)
- id_number: labeled I.D NUMBER (Zimbabwean format with a letter before last 2 digits e.g. 12139005V12)
- reference_number: labeled REFERENCE NUMBER
- start_date: labeled FROM DATE (format DD/MM/YYYY)
- end_date: labeled TO DATE (format DD/MM/YYYY)
- amount: labeled AMOUNT — the monthly instalment. It is written with a dash or full stop separating rands/dollars from cents. For example 8-75 means 8.75, 875 means 8.75, 12-50 means 12.50. The number before the dash is the main amount and the 2 digits after are cents. Return as a decimal number.

Return ONLY a valid JSON object with these exact keys: ec_number, id_number, reference_number, start_date, end_date, amount
No markdown, no backticks, no explanation. Just the JSON."""
                    }
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()

    # Strip markdown code blocks if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

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
    from datetime import datetime

    # Parse dates
    try:
        start = datetime.strptime(data.start_date, "%d/%m/%Y")
        end = datetime.strptime(data.end_date, "%d/%m/%Y")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use DD/MM/YYYY")

    # Calculate term in months for internal tracking
    term_months = (end.year - start.year) * 12 + (end.month - start.month)
    if term_months <= 0:
        term_months = 1

    # Find or create client
    existing_client = db.query(models.Client).filter(
        models.Client.ec_number == data.ec_number
    ).first()

    if existing_client:
        client_obj = existing_client
        # Update ID number if changed
        client_obj.id_number = data.id_number
    else:
        client_obj = models.Client(
            full_name="",
            id_number=data.id_number,
            ec_number=data.ec_number,
            employer=None,
        )
        db.add(client_obj)
        db.flush()

    order = models.Order(
        client_id=client_obj.id,
        vehicle_id=data.vehicle_id,
        reference_number=data.reference_number,
        amount=data.amount,
        currency=data.currency,
        term_months=term_months,
        monthly_instalment=data.amount,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(order)
    db.flush()

    # Find open batch for this currency or create one
    date_str = datetime.now().strftime("%Y%m%d")
    currency_prefix = data.currency

    open_batch = db.query(models.Batch).filter(
        models.Batch.status == models.BatchStatusEnum.OPEN,
        models.Batch.batch_number.like(f"{currency_prefix}-%")
    ).first()

    if not open_batch:
        count = db.query(models.Batch).filter(
            models.Batch.batch_number.like(f"{currency_prefix}-%")
        ).count()
        batch_number = f"{currency_prefix}-{date_str}-{str(count + 1).zfill(3)}"
        open_batch = models.Batch(batch_number=batch_number)
        db.add(open_batch)
        db.flush()

    batch_order = models.BatchOrder(
        batch_id=open_batch.id,
        order_id=order.id,
    )
    db.add(batch_order)
    db.commit()
    db.refresh(order)

    return {
        "message": "Order saved successfully",
        "order_id": order.id,
        "client_id": client_obj.id,
        "monthly_instalment": data.amount,
        "term_months": term_months,
        "batch_number": open_batch.batch_number,
    }