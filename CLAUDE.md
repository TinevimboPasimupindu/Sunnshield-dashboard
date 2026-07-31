# Sun N' Shield SSB Management System

## Project Overview
Internal management system for Sun N' Shield Apparel — a Zimbabwean clothing business that sells to civil servants on credit. Customers fill out paper SSB deduction forms. The app automates data capture, batch submission to Ndasenda (a salary deduction processor), and tracks approvals and rejections.

## Tech Stack
- **Frontend:** React (Vite) + Tailwind CSS — runs on `http://localhost:5173`
- **Backend:** Python FastAPI — runs on `http://localhost:8000`
- **Database:** PostgreSQL — database name `sunnshield`
- **AI Scanning:** Anthropic Claude API (`claude-sonnet-4-5`) for reading handwritten forms
- **Excel:** openpyxl for generating Ndasenda-compatible export files
- **Auth:** JWT tokens with bcrypt password hashing

## Project Structure
```
Sunnshield-dashboard/
  client/                          # React frontend (Vite)
    src/
      pages/
        SplashScreen.jsx           # Landing page
        Login.jsx                  # Login screen
        Register.jsx               # Register screen
        Dashboard.jsx              # Main dashboard with real DB data
        FormIntake.jsx             # AI form scanning + manual entry
        SubmittedBatches.jsx       # Batch management + export + response import
        Repunches.jsx              # Rejected records workflow
        SalesInformation.jsx       # Car/team performance (mock data for now)
      components/
        Layout.jsx                 # Sidebar + topbar wrapper
      context/
        AuthContext.jsx            # JWT auth state management
    tailwind.config.js
    vite.config.js

  server/                          # Python FastAPI backend
    main.py                        # App entry, registers all routers
    database.py                    # PostgreSQL connection via SQLAlchemy
    models.py                      # All database table definitions
    routes/
      auth.py                      # /api/auth — register, login
      orders.py                    # /api/orders — scan form, create order
      batches.py                   # /api/batches — CRUD, export, response import
      repunches.py                 # /api/repunches — rejected records workflow
      dashboard.py                 # /api/dashboard — summary and forecast
    services/
      auth.py                      # bcrypt hashing, JWT creation/verification
    .env                           # Secrets — never commit
    requirements.txt
    venv/                          # Python virtual environment — never commit
```

## Environment Variables (server/.env)
```
DATABASE_URL=postgresql://postgres:123456@localhost:5432/sunnshield
ANTHROPIC_API_KEY=sk-ant-api03-...
SECRET_KEY=sunnshield-secret-key-2025
```

## Database Schema

### users
- id, first_name, surname, email, hashed_password, created_at

### clients
- id, full_name, id_number (unique), ec_number (unique), employer, created_at

### vehicles
- id, name, plate_number, driver_name, created_at

### orders
- id, client_id (FK), vehicle_id (FK), reference_number, amount (monthly instalment), currency (USD/ZWL), term_months, monthly_instalment, start_date (string DD/MM/YYYY), end_date (string DD/MM/YYYY), scanned_form_path, created_at

### batches
- id, batch_number (e.g. USD-20260609-001), status (OPEN/SUBMITTED/IN_PROGRESS/APPROVED), notes, submitted_at, created_at

### batch_orders
- id, batch_id (FK), order_id (FK), status (PENDING/APPROVED/REJECTED/ADJUSTED), rejection_reason, adjusted_term_months, adjusted_instalment

## Key Business Logic

### Batch Naming
Format: `{CURRENCY}-{YYYYMMDD}-{###}` e.g. `USD-20260609-001`
- USD orders go into open USD batches
- ZWL orders go into open ZWL batches
- Repunch batches are named `{CURRENCY}-{YYYYMMDD}-RPX-{###}`

### Form Scanning Workflow
1. User uploads photo of white SSB form (not the pink invoice)
2. Image sent to Claude API with extraction prompt
3. Claude returns JSON with: ec_number, id_number, reference_number, start_date, end_date, amount
4. Amount format on forms: `8-75` or `875` both mean `$8.75` (last 2 digits are cents)
5. Zimbabwean ID format: digits + letter + 2 digits e.g. `12139005V12`
6. Fields pre-filled for user review before saving
7. On save: client created/updated, order created, auto-assigned to open batch for that currency

### Excel Export Format (Ndasenda)
Columns: `Reference | IdNumber | EcNumber | Type | StartDate | EndDate | Amount`
- StartDate/EndDate from the form (DD/Mon/YYYY format not required, string stored as-is)
- Amount = monthly_instalment
- Type = "NEW" for new submissions

### Ndasenda Response Import
- Global import: upload any response file, system matches by EC number across all batches
- Status values in response files: `SUCCESS` = approved, `FAILED` or `REJECTED` = rejected
- After import: batch status updated to IN_PROGRESS (has pending/rejected) or APPROVED (all approved)

### Repunches Workflow
- Batches with IN_PROGRESS status appear in Repunches
- Insufficient funds: user adjusts term with +/- buttons, picks new start date, system calculates new end date and new monthly instalment
- Math: total = original_amount × original_term_months, new_monthly = total ÷ new_term
- Invalid ID/EC: user corrects inline
- After fixing: records marked ADJUSTED
- Resubmit: creates new batch with just the ADJUSTED records

## What Still Needs to Be Built

### 1. Batch Photo Upload (Priority)
- Allow uploading multiple photos at once (50-100 forms per session)
- Process each image sequentially through Claude API
- Show progress (e.g. "Scanning 3 of 47...")
- Each successful scan pre-fills for quick review OR auto-saves with a bulk review mode
- Failed scans flagged for manual entry
- All saved to current open batch for that currency

### 2. Scan Accuracy Improvements (Priority)
Current issues:
- Dates being read from legal notice text at bottom instead of FROM DATE/TO DATE fields
- Spaces inserted in EC/ID numbers
- Amount strikethrough boxes being read as part of the number
- Rotated images (sales reps photographing sideways)

The prompt is in `server/routes/orders.py` in the `scan_form` function.
Key insight: the form has a legal notice at the bottom with dates in it — Claude reads those instead of the labeled date fields.

### 3. PENDING Records Handling
Records in a batch that Ndasenda never responded about stay as PENDING after import.
Need: a way to handle these — either show them separately or allow manual status update.

### 4. Sales Information — Real Data
`SalesInformation.jsx` currently uses hardcoded mock data.
Vehicles table exists in DB but has no data yet.
Need: API endpoint for vehicle/car performance metrics once vehicles are added.

### 5. Dashboard Forecast — Real Calculation
Currently shows the same total for all 6 months.
Should calculate month by month based on which orders are still active (start_date to end_date).

## Running the Project

### Backend
```powershell
cd server
venv\Scripts\activate
uvicorn main:app --reload
```

### Frontend
```powershell
cd client
npm run dev
```

### API Docs
Available at `http://localhost:8000/docs` when server is running.

## Known Issues & Notes
- `.env` file must be loaded using `pathlib.Path(__file__).parent / ".env"` pattern to resolve correctly regardless of where uvicorn is launched
- Claude API responses sometimes wrapped in markdown backticks — strip before JSON parsing
- `venv/` and `.env` are in `.gitignore` — never commit them
- Forms should be photographed in portrait orientation, just the white SSB form (not alongside the pink proforma invoice)
- The pink proforma invoice is a separate document — do not scan it, only scan the white SSB deduction form
