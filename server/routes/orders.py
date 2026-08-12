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
import re
import pathlib
from dotenv import load_dotenv
from PIL import Image, ImageEnhance
import io as io_module

# Load .env from the server directory
load_dotenv(dotenv_path=pathlib.Path(__file__).parent / ".env")

router = APIRouter(prefix="/api/orders", tags=["orders"])


def normalize_date(date_str):
    """Ensure a date string is DD/MM/YYYY.

    Handles common AI misreads of grid-box dates: bare digit strings missing
    slashes (6-8 digits), 2-digit years, and dot/dash separators. Returns
    None when the input is too ambiguous to reconstruct reliably (fewer than
    6 digits, or exactly 7); returns the original value unchanged when it
    doesn't match any known malformed shape.
    """
    if not date_str:
        return date_str

    # Pure digit strings (no separators) — length tells us what's missing
    if re.fullmatch(r"\d+", date_str):
        length = len(date_str)
        if length < 6:
            # Too few digits to reliably reconstruct DD/MM/YYYY
            return None
        if length == 6:
            # DDMMYY -> DD/MM/20YY
            return f"{date_str[0:2]}/{date_str[2:4]}/20{date_str[4:6]}"
        if length == 7:
            # One digit short — can't tell which field lost a digit
            return None
        if length == 8:
            # DDMMYYYY -> DD/MM/YYYY
            return f"{date_str[0:2]}/{date_str[2:4]}/{date_str[4:8]}"
        return date_str

    # Normalize dot/dash separators to slashes
    normalized = re.sub(r"[.\-]", "/", date_str)

    # DD/MM/YY -> DD/MM/20YY
    match = re.fullmatch(r"(\d{2})/(\d{2})/(\d{2})", normalized)
    if match:
        day, month, year = match.groups()
        return f"{day}/{month}/20{year}"

    # Already DD/MM/YYYY once separators are normalized
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", normalized):
        return normalized

    return date_str



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
    # Auto-rotate, boost contrast, and normalize to RGB before sending to Claude
    try:
        img = Image.open(io_module.BytesIO(contents))
        exif = img.getexif()
        orientation = exif.get(274)
        rotations = {3: 180, 6: 270, 8: 90}
        if orientation in rotations:
            img = img.rotate(rotations[orientation], expand=True)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img = ImageEnhance.Contrast(img).enhance(1.2)
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
        model="claude-opus-5",
        max_tokens=2048,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
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
                        "text": """The attached image may be rotated 90, 180, or 270 degrees, and may contain multiple documents, background clutter, a pink proforma invoice, or only a partial view of the form you need. Read the content regardless of orientation. Do not assume the image is a clean, isolated photo of a single form.

Your task: scan the ENTIRE image looking specifically for a white SSB salary deduction form, and within it, these labeled fields:

- "EC NUMBER" or "EC No" — followed by grid boxes containing the employee code
- "I.D NUMBER" or "ID NUMBER" — followed by grid boxes containing the ID number
- "FROM DATE" — followed by grid boxes containing the start date
- "TO DATE" — followed by grid boxes containing the end date
- "REFERENCE NUMBER" — followed by grid boxes containing the reference
- "AMOUNT" — followed by a row of boxes where the actual amount is written at the right end, after empty/crossed-out boxes

RULES:
- Find each field by its LABEL, not by its position in the image. Do not assume a field is "in the middle" or "near the top" — locate the label text first, then read the boxes next to it.
- Ignore everything that is not next to one of the six labels above. This includes: the pink proforma invoice (if visible), the legal notice text at the bottom of the form, PAYEE CODE, STATION CODE, DEP CODE, and any other CODE fields.
- EC numbers and ID numbers are continuous strings with NO spaces, e.g. 2012368F not 2 0 1 2 3 6 8 F.
- Zimbabwean ID format: digits, then a letter, then 2 digits, e.g. 12139005V12.
- FROM DATE and TO DATE: only read values from fields with those exact labels. Never read dates from the legal notice text, even if no FROM DATE/TO DATE field is visible.
- FROM DATE and TO DATE each have exactly 8 digit boxes arranged as DD MM YYYY — two boxes for day, two for month, four for year. Read all 8 digits carefully and return in DD/MM/YYYY format. Double-check you have exactly 8 digits before returning.
- AMOUNT: The AMOUNT field has individual grid boxes. Look for the last boxes in the AMOUNT row that contain handwritten digits. The format is always written as two parts separated by a dash e.g. 8-75 where 8 is dollars and 75 is cents, giving 8.75. If you see digits like 11-00 that means 11.00. Ignore any boxes that are empty or have only a horizontal strikethrough line through them.
- If a field's label is not visible in the image, or its value is illegible, return null for that field. Do not guess.

VALIDATION — before returning your JSON, check each field against these rules and correct if wrong:
- ec_number: typically 6-10 alphanumeric characters, may end in a letter. If you see repeated digits like 99 or 222, double-check you read all the boxes — do not drop repeated characters.
- id_number: Zimbabwean format is digits + letter + 2 digits. Total length is typically 11 characters. Common pattern: 8 digits, then a letter like V or R or U, then 2 digits e.g. 12139005V12. If your extracted value is shorter than 10 characters, re-examine the image carefully.
- reference_number: typically 6-10 alphanumeric characters mixing digits and uppercase letters.
- start_date and end_date: must be DD/MM/YYYY with exactly 8 digits. If you have fewer than 8 digits, re-examine the date boxes carefully.
- amount: a decimal number. The dash separates main amount from cents e.g. 8-75 = 8.75. Should not be a large number like 400 or 8777.

If any field fails its rule, look at the image again for that field specifically and correct it before returning the JSON.

Return ONLY valid JSON with exactly these keys: ec_number, id_number, reference_number, start_date, end_date, amount
No markdown, no backticks, no explanation. Just the JSON."""
                    }
                ],
            }
        ],
    )

    text_block = next((block for block in message.content if block.type == "text"), None)
    raw = text_block.text.strip() if text_block else ""

    # Strip markdown code fences if the model wraps the JSON in them
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()

    try:
        extracted = json.loads(raw)
        extracted["start_date"] = normalize_date(extracted.get("start_date"))
        extracted["end_date"] = normalize_date(extracted.get("end_date"))
    except json.JSONDecodeError:
        extracted = {
            "ec_number": None,
            "id_number": None,
            "reference_number": None,
            "start_date": None,
            "end_date": None,
            "amount": None,
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

    # Find or create client — match by ec_number first, then fall back to id_number
    existing_client = db.query(models.Client).filter(
        models.Client.ec_number == data.ec_number
    ).first()

    if not existing_client:
        existing_client = db.query(models.Client).filter(
            models.Client.id_number == data.id_number
        ).first()

    if existing_client:
        client_obj = existing_client
        # Update with latest values from the form in case of corrections
        client_obj.ec_number = data.ec_number
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
    else:
        # Reject if this EC number already has an order in the current open batch
        duplicate = db.query(models.BatchOrder).join(models.Order).join(models.Client).filter(
            models.BatchOrder.batch_id == open_batch.id,
            models.Client.ec_number == data.ec_number
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="This EC number already has an order in the current batch")

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