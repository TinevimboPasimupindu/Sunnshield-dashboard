from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
import anthropic
import os
import json
import re
import pathlib
from dotenv import load_dotenv
from PIL import Image, ImageEnhance
import io as io_module
from google.cloud import documentai_v1 as documentai
from google.oauth2 import service_account
from google.api_core.client_options import ClientOptions
import certifi
from services.zim_id_validator import parse, suggest_corrections

# Fix gRPC SSL certificate verification on Windows
os.environ["GRPC_DEFAULT_SSL_ROOTS_FILE_PATH"] = certifi.where()

# Load .env from the server directory
load_dotenv(dotenv_path=pathlib.Path(__file__).parent.parent / ".env")

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
    # Auto-rotate, boost contrast, and normalize to RGB before sending to Document AI
    converted_to_jpeg = False
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
        converted_to_jpeg = True
    except Exception:
        pass

    if converted_to_jpeg:
        # PIL re-saved the image as JPEG, so the bytes are always JPEG now
        media_type = "image/jpeg"
    else:
        extension = file.filename.split(".")[-1].lower()
        media_type_map = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
        }
        media_type = media_type_map.get(extension, "image/jpeg")

    # ---------- STAGE 1: Google Document AI extraction ----------
    credentials_path = pathlib.Path(__file__).parent.parent / os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    credentials = service_account.Credentials.from_service_account_file(str(credentials_path))
    docai_client = documentai.DocumentProcessorServiceClient(
        credentials=credentials,
        client_options=ClientOptions(api_endpoint="eu-documentai.googleapis.com")
    )

    processor_name = docai_client.processor_path(
        os.getenv("GOOGLE_PROJECT_ID"),
        os.getenv("GOOGLE_LOCATION"),
        os.getenv("GOOGLE_PROCESSOR_ID"),
    )

    docai_response = docai_client.process_document(
        request=documentai.ProcessRequest(
            name=processor_name,
            raw_document=documentai.RawDocument(content=contents, mime_type=media_type),
        )
    )
    document = docai_response.document

    # Custom Extractor processors return results as entities, not form_fields
    docai_fields = {}
    for entity in document.entities:
        name = entity.type_.strip().lower()
        value = entity.mention_text.strip() if entity.mention_text else None
        docai_fields[name] = value

    raw_data = {
        "row_ec_id": docai_fields.get("row_ec_id"),
        "row_dates": docai_fields.get("row_dates"),
        "reference_number": docai_fields.get("reference_number"),
        "amount": docai_fields.get("amount"),
        "sale_date": docai_fields.get("sale_date"),
    }

    # ---------- STAGE 2: Claude cleanup ----------
    cleanup_prompt = f"""You are cleaning and formatting raw OCR data extracted from a Zimbabwean civil servant SSB salary deduction form. Fix formatting issues and return structured JSON.

Raw extracted data:
{json.dumps(raw_data)}

RULES FOR EACH FIELD:

row_ec_id contains the EC NUMBER, CD letter, and ID NUMBER on one line. Split into:
- ec_number: first 7 digits + the CD letter combined e.g. '0132003 F' becomes '0132003F'. Always 8 characters total: 7 digits + 1 uppercase letter. If last character looks like 0 it might be O, if it looks like 5 it might be S.
- id_number: the remaining characters after EC and CD. Zimbabwean format: digits + 1 uppercase letter + 2 digits e.g. 12139005V12. The letter is always the 3rd character from the end. The last 2 characters must always be digits.

The character at the letter position (3rd from end) must always be an uppercase letter, never a digit. If you find a digit in that position, convert it to the most likely letter it resembles:
- 0 → Q
- 1 → I
- 2 → Z
- 4 → A
- 5 → S
- 6 → G
- 7 → T
- 8 → B
- 9 → G

Never apply these conversions to any other position in the ID number — only the 3rd character from the end. All other positions must remain as digits.

row_dates contains two dates. Split into:
- start_date: the earlier/smaller date. Set day to 01. Format as 01/MM/YYYY.
- end_date: the later/larger date. Set day to last day of that month. Format as DD/MM/YYYY.

reference_number: digits followed by either NH1 or B182. If you see an N or H in the suffix it is NH1. If you see a B or 18 in the suffix it is B182. Fix any misread characters to match one of these two endings exactly.

amount: a positive decimal number. Remove any negative signs. The format on the form uses a dash to separate main amount from cents e.g. 787-00 means 787.00. Remove strikethrough dashes. Return as a positive decimal number.

sale_date: the date the form was signed at the bottom. Normalize to DD/MM/YYYY format.

Return ONLY valid JSON with these exact keys: ec_number, id_number, reference_number, start_date, end_date, amount, sale_date
No markdown, no backticks, no explanation. Just the JSON."""

    message = client.messages.create(
        model="claude-opus-5",
        max_tokens=2048,
        thinking={"type": "adaptive"},
        output_config={"effort": "low"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": cleanup_prompt,
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

        # Validate/correct the ID number against the Zimbabwe ID checksum
        id_number = extracted.get("id_number")
        if id_number:
            parsed = parse(id_number)
            if not parsed.is_fully_valid:
                id_result = suggest_corrections(id_number)
                if len(id_result.corrections) == 1:
                    # Unambiguous fix — safe to apply automatically
                    corrected_id, _notes, _cost = id_result.corrections[0]
                    extracted["id_number"] = corrected_id.replace("-", "")
                # else: 0 corrections (uncorrectable) or multiple equally-plausible
                # corrections (ambiguous) — leave id_number as is for manual review
            # else: already valid, leave as is
    except json.JSONDecodeError:
        extracted = {
            "ec_number": None,
            "id_number": None,
            "reference_number": None,
            "start_date": None,
            "end_date": None,
            "amount": None,
            "sale_date": None,
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