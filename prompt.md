# NJ India System — Backend Build Prompts (OpenCode + DeepSeek v4 Flash)

> **Purpose:** Copy each PHASE prompt below, one at a time, into OpenCode (DeepSeek v4 Flash). Run them **in order**. Do not skip. Each prompt is fully self-contained — it repeats the context the model needs, because a small/free model forgets earlier turns and must not guess.
>
> **Golden rules baked into every prompt (the model is told these each time):**
> 1. Match the EXACT field names the React frontend already uses. Never rename a field.
> 2. Store data as JSON exactly as the frontend sends it. No shape translation.
> 3. After writing code, show the file and the exact command to test it.
> 4. Do not add features, auth, Docker, or libraries that are not requested.
> 5. If unsure, choose the simplest option that makes the test pass.

---

## How to use this file

- The backend lives in: `E:\IMP projects\NJ\backend\`
- The existing React frontend lives in: `E:\IMP projects\NJ\frontend\`
- Work through **Phase 0 → Phase 11** in order.
- After each phase, run the **Verification** command. Only move on when it passes.
- If a phase fails, paste the error back into OpenCode with: *"This command gave this error: <paste>. Fix only the cause. Do not change anything else."*

---

## CRITICAL REFERENCE — The exact data shapes (the backend must mirror these)

The frontend currently saves ONE object to `localStorage` under key `nj_app_data_v2`. The backend stores the same object, split into a config part and two history lists.

```jsonc
// CONFIG part (edited in Settings) — stored as one row in app_config
{
  "company":  { "name": "...", "address": "...", "phone": "...", "website": "..." },
  "settings": {
    "taxEnabled": true, "taxRate": 18, "discountEnabled": true,
    "quotationPrefix": "NJ-Q", "warrantyPrefix": "NJ-W",
    "pinEnabled": false, "pin": "1234",
    "termsText": "....",
    "currencySymbol": "₹"
  },
  "classes": [
    { "id": "c1", "name": "NJ Premium Laminated", "subtitle": "Asphalt Shingles",
      "description": "...", "warrantyId": "nj_laminated", "color": "#6e3f32", "type": "tiles" }
    // type is "tiles" or "tools"
  ],
  "varieties": [
    { "id": "v1", "classId": "c1", "name": "Laminated Standard", "description": "...",
      "basePrice": 85, "unit": "sqft",
      "colors": [ { "name": "Autumn Brown", "hex": "#6e3f32", "offset": 0 } ] }
  ],
  "warranties": [
    // NOTE: warranties is an ARRAY. Each has a string "id" like "docke","nj_laminated",
    // "ceramic","stone_coated","heatout". Classes link to it via class.warrantyId.
    { "id": "docke", "title": "...", "logo": "...", "duration": "...", "opening": "...",
      "sections": [
        { "title": "...", "content": "...", "isBullets": true }
      ],
      "showSeriesTable": false,
      "seriesTable": [ { "series": "PIE Classic", "duration": "10 years" } ] }
  ]
}
```

```jsonc
// A QUOTATION snapshot (frontend sends this whole object to be saved)
{
  "id": "NJ-Q-123456",
  "items": [
    { "cartId": 1716800000000, "id": "v1", "name": "Laminated Standard",
      "className": "NJ Premium Laminated", "price": 85, "qty": 1170,
      "unit": "sqft", "color": "Autumn Brown", "image": "" }
  ],
  "customer": { "name": "Salim P P", "phone": "...", "email": "", "address": "..." },
  "subtotal": 99450, "taxRate": 18, "taxAmount": 17901, "grandTotal": 117351,
  "date": "26/05/2026"
}
```

```jsonc
// A WARRANTY CERTIFICATE snapshot (frontend sends this whole object)
{
  "id": "NJ-W-123456-1",
  "quotationId": "NJ-Q-123456",
  "items": [ /* same cart items */ ],
  "customer": { "name": "...", "phone": "...", "email": "", "address": "..." },
  "date": "26/05/2026",
  "warrantyNo": "NJ-W-123456-1",
  "template": { /* the full warranty object from the warranties array */ },
  "certData": {
    "sellerName": "NOUFAL & JABBAR INTERNATIONAL LLP",
    "batchNo": "", "purchaseDate": "26/05/2026", "siteAddress": "...",
    "productName": "Laminated Standard", "productColor": "Autumn Brown",
    "productQty": 1170, "productUnit": "sqft", "selectedCartId": 1716800000000
  }
}
```

**The backend never reshapes these. It stores and returns them as-is.**

---

# PHASE 0 — Project setup and environment

**Paste this into OpenCode:**

```
You are setting up a Python FastAPI backend for an offline desktop app called the
"NJ India Quotation & Warranty System". It runs on ONE Windows PC. No cloud, no auth,
no Docker. Python 3.11+.

Create this exact folder structure under E:\IMP projects\NJ\backend\ :

backend/
  main.py
  database.py
  models.py
  seed_data.py
  routers/
    __init__.py
    config.py
    quotations.py
    warranties.py
    uploads.py
    pdf.py
  templates/
    quotation.html
    warranty.html
  uploads/            (empty folder, will hold uploaded images)
  requirements.txt

For THIS phase, only do these steps:

1. Create the folder structure above. Make empty placeholder files for now
   (each .py file can contain just a comment line like "# placeholder").
   routers/__init__.py must be completely empty.

2. Create requirements.txt with EXACTLY these lines:
   fastapi
   uvicorn[standard]
   sqlalchemy
   jinja2
   weasyprint
   python-multipart

3. Print the two commands the user must run in PowerShell to:
   (a) create a virtual environment named .venv inside the backend folder
   (b) activate it and install requirements.txt

Do NOT write any application logic yet. Do NOT install anything yourself.
Just create files and print the commands.
```

**Verification (run in PowerShell):**
```powershell
cd "E:\IMP projects\NJ\backend"
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
> If WeasyPrint install fails on Windows, that is normal — note it and continue. We will handle WeasyPrint's GTK dependency in Phase 7. The other packages must install cleanly.

---

# PHASE 1 — FastAPI skeleton, health check, CORS, run

**Paste this into OpenCode:**

```
Context: FastAPI backend for the NJ India app. Folder is E:\IMP projects\NJ\backend\.
The React frontend runs in dev mode on http://localhost:5173 and in production is
served as static files by this same backend.

Task: Write backend/main.py so the server starts and answers a health check.

Requirements for main.py:
1. Create a FastAPI app instance:  app = FastAPI(title="NJ India System")
2. Add CORS middleware allowing all origins, all methods, all headers
   (this is a single-PC offline app, so wide-open CORS is fine).
   Use: from fastapi.middleware.cors import CORSMiddleware
3. Add a route:  GET /api/health  that returns  {"status": "ok"}
4. Add an entry point so the file can be run directly:
   if __name__ == "__main__":
       import uvicorn
       uvicorn.run("main:app", host="127.0.0.1", port=8888, reload=True)

Do not add database code, routers, or anything else in this phase.
After writing the file, print the exact PowerShell command to start the server
(assume the .venv is already activated).
```

**Verification:**
```powershell
# with .venv activated, inside backend/
python main.py
# then in a browser or new terminal:
# open http://127.0.0.1:8888/api/health  → must show {"status":"ok"}
# open http://127.0.0.1:8888/docs         → must show the Swagger UI
```

---

# PHASE 2 — Database setup (SQLAlchemy + SQLite)

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\. We use SQLite via SQLAlchemy.
The whole database is ONE file named nj_india.db in the backend folder.

We store data as JSON text columns to exactly mirror what the React frontend sends.
Do NOT design normalized tables. Use these THREE tables only.

Task A — Write backend/database.py:
- Create a SQLAlchemy engine for sqlite:///nj_india.db
  Use: connect_args={"check_same_thread": False}
- Create SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
- Create Base = declarative_base()
- Add a FastAPI dependency function get_db() that yields a session and closes it in finally.

Task B — Write backend/models.py with these three SQLAlchemy models (import Base from database):

1. class AppConfig(Base):
     __tablename__ = "app_config"
     id = Column(Integer, primary_key=True, default=1)   # always exactly one row, id=1
     data = Column(Text, nullable=False)                 # JSON string: {company,settings,classes,varieties,warranties}

2. class Quotation(Base):
     __tablename__ = "quotations"
     id = Column(String, primary_key=True)               # e.g. "NJ-Q-123456" (comes from frontend)
     customer_name = Column(String, default="")
     grand_total = Column(Float, default=0)
     date = Column(String, default="")                   # display date string like "26/05/2026"
     created_at = Column(DateTime, default=datetime.utcnow)
     data = Column(Text, nullable=False)                 # the FULL quotation JSON snapshot

3. class WarrantyCertificate(Base):
     __tablename__ = "warranty_certificates"
     id = Column(String, primary_key=True)               # e.g. "NJ-W-123456-1"
     quotation_id = Column(String, default="")
     customer_name = Column(String, default="")
     date = Column(String, default="")
     created_at = Column(DateTime, default=datetime.utcnow)
     data = Column(Text, nullable=False)                 # the FULL warranty JSON snapshot

Import the right things: from sqlalchemy import Column, Integer, String, Float, Text, DateTime
and from datetime import datetime.

Task C — In backend/main.py, on startup create the tables:
   from database import engine, Base
   import models
   Base.metadata.create_all(bind=engine)
Place this AFTER the app is created. Keep the /api/health route and the __main__ block.

Do not write any routers yet. After writing, print the command to run the server and
explain that nj_india.db will be created automatically on first run.
```

**Verification:**
```powershell
python main.py
# Server starts with no error. A file nj_india.db appears in the backend folder.
```

---

# PHASE 3 — Seed data + Config API (GET/PUT /api/config)

> This is the most important phase for correctness. The seed data MUST byte-match the frontend's `DEFAULT_DATA` in `frontend/src/data.js`. The prompt below embeds the exact values.

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\. Tables already exist (app_config,
quotations, warranty_certificates) and store JSON text. The React frontend reads the app
configuration (company, settings, classes, varieties, warranties) from this backend.

IMPORTANT FIELD-NAME RULES (do not change any name):
- classes use the key "warrantyId" (NOT warrantyType). class.type is "tiles" or "tools".
- "warranties" is an ARRAY of objects, each with a string "id"
  (one of: docke, nj_laminated, ceramic, stone_coated, heatout).
- varieties use "classId", "basePrice", "unit", and a "colors" array of {name,hex,offset}.

Task A — Write backend/seed_data.py containing a single Python dict named DEFAULT_DATA
with EXACTLY these keys and values (copy verbatim):

DEFAULT_DATA = {
  "company": {
    "name": "NJ India Trading Pvt. Ltd.",
    "address": "KNH Building, Neelithod Bridge, Parakkal, Bypass Road\nRamanattukara PO, Kozhikode — 673633, Kerala",
    "phone": "+91 73566 08633",
    "website": "www.njindia.in"
  },
  "settings": {
    "taxEnabled": True, "taxRate": 18, "discountEnabled": True,
    "quotationPrefix": "NJ-Q", "warrantyPrefix": "NJ-W",
    "pinEnabled": False, "pin": "1234",
    "termsText": "1. All payments must be made in advance.\n2. Goods once sold will not be taken back.\n3. Subject to Kozhikode jurisdiction.",
    "currencySymbol": "₹"
  },
  "classes": [
    {"id":"c1","name":"NJ Premium Laminated","subtitle":"Asphalt Shingles","description":"Premium dual-layer asphalt shingles for dimensional appearance.","warrantyId":"nj_laminated","color":"#6e3f32","type":"tiles"},
    {"id":"c2","name":"Docke PIE","subtitle":"Bitumen Shingles","description":"High-quality European bitumen shingles.","warrantyId":"docke","color":"#3a506b","type":"tiles"},
    {"id":"c3","name":"NJ Premium Ceramic","subtitle":"Ceramic Roof Tiles","description":"Classic clay ceramic roofing.","warrantyId":"ceramic","color":"#b95c3a","type":"tiles"},
    {"id":"c4","name":"NJ Stone Coated","subtitle":"Metal Tiles","description":"Durable metal roofing with natural stone chip coating.","warrantyId":"stone_coated","color":"#4b4b4b","type":"tiles"},
    {"id":"c5","name":"Heatout","subtitle":"Insulated Ceilings","description":"Thermal insulation ceiling panels.","warrantyId":"heatout","color":"#4f755a","type":"tiles"},
    {"id":"cls_tools","name":"Tools & Accessories","subtitle":"Installation Hardware","description":"Screws, silicone, touch-up kits, ridges, gutters and all installation accessories.","warrantyId":None,"color":"#8a857a","type":"tools"}
  ],
  "varieties": [
    {"id":"v1","classId":"c1","name":"Laminated Standard","description":"Classic dual-layer","basePrice":85,"unit":"sqft","colors":[{"name":"Autumn Brown","hex":"#6e3f32","offset":0},{"name":"Estate Gray","hex":"#5b5b5b","offset":0}]},
    {"id":"v2","classId":"c2","name":"PIE Classic","description":"Standard single layer","basePrice":70,"unit":"sqft","colors":[{"name":"Red","hex":"#8b2525","offset":0}]},
    {"id":"v3","classId":"c3","name":"Mediterranean Curve","description":"Curved profile","basePrice":45,"unit":"pcs","colors":[{"name":"Natural Terracotta","hex":"#b95c3a","offset":0}]},
    {"id":"v4","classId":"c4","name":"Stone Coated Tile","description":"Stone chip coated metal tile","basePrice":115,"unit":"sqft","colors":[{"name":"Charcoal","hex":"#4b4b4b","offset":0}]},
    {"id":"v5","classId":"c5","name":"Veeti","description":"Insulated ceiling panel","basePrice":125,"unit":"sqft","colors":[]},
    {"id":"v10","classId":"cls_tools","name":"Roofing Screw","description":"Galvanised steel screws, 2 inch","basePrice":6,"unit":"nos","colors":[]},
    {"id":"v11","classId":"cls_tools","name":"Silicone Tube","description":"Weather-grade silicone sealant","basePrice":250,"unit":"nos","colors":[]},
    {"id":"v12","classId":"cls_tools","name":"Touch-up Kit","description":"Colour-matched touch-up paint kit","basePrice":800,"unit":"pcs","colors":[]},
    {"id":"v13","classId":"cls_tools","name":"Rain Gutter","description":"Roof rain gutter","basePrice":265,"unit":"mtr","colors":[]},
    {"id":"v14","classId":"cls_tools","name":"Inner Clamp 90°","description":"90 degree inner clamp","basePrice":250,"unit":"pcs","colors":[]},
    {"id":"v15","classId":"cls_tools","name":"Connector","description":"Gutter connector","basePrice":250,"unit":"pcs","colors":[]},
    {"id":"v16","classId":"cls_tools","name":"End Drop","description":"Gutter end drop","basePrice":250,"unit":"pcs","colors":[]},
    {"id":"v17","classId":"cls_tools","name":"Nut and Bolt","description":"Fixing nut and bolt","basePrice":4,"unit":"pcs","colors":[]}
  ],
  "warranties": [ ... SEE NEXT INSTRUCTION ... ],
  "quotations": [],
  "warranty_certificates": []
}

For the "warranties" array, copy the 5 warranty objects EXACTLY from the file
E:\IMP projects\NJ\frontend\src\data.js (the array named warranties inside DEFAULT_DATA).
Open that file, copy the 5 objects (ids: docke, nj_laminated, ceramic, stone_coated, heatout)
with all their fields (title, logo, duration, manufacturerDetails, certifications,
productInfo, validityConditions, exclusions, guarantees, seriesTable) and convert JS to
Python (true→True, false→False, null→None). Do not invent warranty text; use the file.

Task B — Write backend/routers/config.py with an APIRouter that has:

  GET /api/config
    - Open a DB session. Read the single AppConfig row (id=1).
    - If it does NOT exist: create it with data = json.dumps(DEFAULT_DATA minus the
      "quotations" and "warranty_certificates" keys), commit, then return that config dict.
    - Return the parsed JSON (a dict with keys company, settings, classes, varieties, warranties).

  PUT /api/config
    - Accept a JSON body (a dict with company, settings, classes, varieties, warranties).
    - Save it: set the AppConfig row's data = json.dumps(body). Create the row if missing.
    - Commit. Return {"status": "saved"}.

  Use the get_db dependency from database.py. Use json from the standard library.
  Accept the body with:  body: dict = Body(...)   (from fastapi import Body)

Task C — In backend/main.py, include the router:
   from routers import config
   app.include_router(config.router)

After writing, print the curl/PowerShell commands to test GET and PUT.
```

**Verification:**
```powershell
python main.py
# In a new terminal:
curl http://127.0.0.1:8000/api/config
# → returns JSON with company, settings, classes (6), varieties (14), warranties (5)
```

---

# PHASE 4 — Quotations API

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\. The Quotation table has columns:
id (String PK), customer_name, grand_total, date, created_at, data (Text = full JSON).
The frontend sends a quotation snapshot object that looks EXACTLY like this:

{
  "id": "NJ-Q-123456",
  "items": [ { "cartId":..., "id":"v1","name":"...","className":"...","price":85,
               "qty":1170,"unit":"sqft","color":"...","image":"" } ],
  "customer": { "name":"...","phone":"...","email":"","address":"..." },
  "subtotal": 99450, "taxRate": 18, "taxAmount": 17901, "grandTotal": 117351,
  "date": "26/05/2026"
}

Task — Write backend/routers/quotations.py with an APIRouter (use get_db, json, and the
Quotation model). Endpoints:

  GET /api/quotations
    - Return a LIST of all quotation snapshots (the parsed data column for each row),
      newest first (order by created_at descending).
    - Each list element is the full snapshot dict, NOT the table columns.

  GET /api/quotations/{qid}
    - Return the single quotation snapshot dict whose id == qid.
    - If not found, raise HTTPException(status_code=404, detail="Quotation not found").

  POST /api/quotations
    - Accept the full snapshot as body: dict = Body(...).
    - Read body["id"], body["customer"]["name"], body["grandTotal"], body["date"].
      Use .get() with safe defaults so missing fields never crash
      (default id is required though — if missing, raise 400).
    - If a row with that id already exists, UPDATE its data; otherwise INSERT a new row.
    - Set customer_name, grand_total, date from the body; set data = json.dumps(body).
    - Commit. Return the saved snapshot dict (the same body).

  DELETE /api/quotations
    - Delete ALL rows from the quotations table. Commit.
    - Return {"status": "cleared"}.
    - (This matches the frontend "Clear Quotation History" button.)

In backend/main.py include the router:
   from routers import quotations
   app.include_router(quotations.router)

Do not change any field names. Do not normalize items into a separate table — keep the
whole snapshot in the data column. After writing, print test commands for POST then GET.
```

**Verification:**
```powershell
# POST a sample then list:
curl -X POST http://127.0.0.1:8000/api/quotations -H "Content-Type: application/json" -d "{\"id\":\"NJ-Q-TEST1\",\"items\":[],\"customer\":{\"name\":\"Test\"},\"subtotal\":100,\"taxRate\":18,\"taxAmount\":18,\"grandTotal\":118,\"date\":\"01/01/2026\"}"
curl http://127.0.0.1:8000/api/quotations
# → list containing the NJ-Q-TEST1 snapshot
```

---

# PHASE 5 — Warranty certificates API

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\. The WarrantyCertificate table has:
id (String PK), quotation_id, customer_name, date, created_at, data (Text = full JSON).
The frontend sends a warranty snapshot that looks EXACTLY like this:

{
  "id": "NJ-W-123456-1",
  "quotationId": "NJ-Q-123456",
  "items": [ ... ],
  "customer": { "name":"...","phone":"...","email":"","address":"..." },
  "date": "26/05/2026",
  "warrantyNo": "NJ-W-123456-1",
  "template": { "id":"nj_laminated","title":"...", ...full warranty object... },
  "certData": {
     "sellerName":"...","batchNo":"","purchaseDate":"...","siteAddress":"...",
     "productName":"...","productColor":"...","productQty":1170,"productUnit":"sqft",
     "selectedCartId":...
  }
}

Task — Write backend/routers/warranties.py with an APIRouter (get_db, json,
WarrantyCertificate model). Endpoints (MIRROR the quotations router exactly):

  GET /api/warranties
    - Return a LIST of all warranty snapshot dicts, newest first (created_at desc).

  GET /api/warranties/{wid}
    - Return the single snapshot whose id == wid, else 404 "Warranty not found".

  POST /api/warranties
    - body: dict = Body(...). Require body["id"] (else 400).
    - Extract quotation_id = body.get("quotationId",""), 
      customer_name = body.get("customer",{}).get("name",""),
      date = body.get("date","").
    - Upsert by id (update data if row exists, else insert). data = json.dumps(body).
    - Commit. Return body.

  DELETE /api/warranties
    - Delete ALL rows. Commit. Return {"status":"cleared"}.

In backend/main.py include the router:
   from routers import warranties
   app.include_router(warranties.router)

Same rules: never rename fields, keep the whole snapshot in data. Print test commands.
```

**Verification:**
```powershell
curl -X POST http://127.0.0.1:8000/api/warranties -H "Content-Type: application/json" -d "{\"id\":\"NJ-W-TEST1\",\"quotationId\":\"NJ-Q-TEST1\",\"customer\":{\"name\":\"Test\"},\"date\":\"01/01/2026\",\"template\":{},\"certData\":{}}"
curl http://127.0.0.1:8000/api/warranties
```

---

# PHASE 6 — Image uploads (logo, seal, signature, product photos)

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\. There is an empty folder
backend/uploads/. We need to accept image uploads and serve them back.

Task A — Write backend/routers/uploads.py with an APIRouter:

  POST /api/uploads
    - Accept a single file: file: UploadFile = File(...)   (from fastapi import UploadFile, File)
    - Make a safe unique filename: f"{int(time.time()*1000)}_{file.filename}" but strip any
      path separators from file.filename (keep only the base name) to avoid path traversal.
    - Save the bytes to backend/uploads/<safe_name>.
    - Return {"url": f"/uploads/{safe_name}", "filename": safe_name}.
    - Wrap file writing in try/except; on error raise HTTPException(500, "Upload failed").

  Use pathlib to build the uploads path relative to this file's parent's parent
  (so it always points at backend/uploads regardless of working directory).

Task B — In backend/main.py, mount the uploads folder as static files so images are served:
   from fastapi.staticfiles import StaticFiles
   from pathlib import Path
   UPLOADS_DIR = Path(__file__).parent / "uploads"
   UPLOADS_DIR.mkdir(exist_ok=True)
   app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
   And include the router:
   from routers import uploads
   app.include_router(uploads.router)

Print a curl command that uploads a test image and the resulting URL to open in a browser.
```

**Verification:**
```powershell
curl -X POST http://127.0.0.1:8000/api/uploads -F "file=@C:\path\to\any\image.png"
# → {"url":"/uploads/...png","filename":"...png"}
# open http://127.0.0.1:8000/uploads/<filename> in browser → image shows
```

---

# PHASE 7 — Quotation PDF (WeasyPrint + Jinja2)

> WeasyPrint needs the GTK runtime on Windows. If `import weasyprint` fails, install the GTK3 runtime (search "GTK3 runtime Windows installer"), then retry. The prompt tells the model to fail gracefully so the rest of the app still runs.

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\. We generate a print-perfect A4
PDF for a saved quotation using WeasyPrint + a Jinja2 HTML template. The quotation JSON
snapshot (stored in the quotations table) looks like:

{ "id","items":[{"name","className","price","qty","unit","color"}],
  "customer":{"name","phone","email","address"},
  "subtotal","taxRate","taxAmount","grandTotal","date" }

Company info comes from the config (GET the AppConfig row, parse JSON, use config["company"]
and config["settings"]). Currency symbol is config["settings"].get("currencySymbol","₹").
Terms come from config["settings"].get("termsText","").

Task A — Write backend/templates/quotation.html as a Jinja2 template for an A4 page.
Layout, in this order (use simple inline CSS in a <style> block, A4 width, serif font,
print margins):
  1. Centered header: company.name (large), company.address (small, preserve line breaks
     by replacing \n with <br>), company.phone, company.website. A solid bottom border.
  2. A row: left = "Quotation To: {{customer.name}}" plus phone and address;
     right = "Date: {{quotation.date}}" and "Ref: {{quotation.id}}".
  3. A centered band titled "PRODUCT DETAILS".
  4. An items table with columns: SI NO | PRODUCT | QUANTITY | PRICE/UNIT | TOTAL.
     - PRODUCT cell shows item.name and, if item.color is set and not "N/A"/"Standard",
       a smaller line with the colour.
     - QUANTITY shows "{{item.qty}} {{item.unit}}".
     - PRICE/UNIT shows currency + item.price.
     - TOTAL shows currency + (item.price * item.qty).
     Table header row has dark background, white text.
  5. Right-aligned totals block: Subtotal, then GST ({{quotation.taxRate}}%) if taxAmount>0,
     then a dark TOTAL box with currency + grandTotal.
  6. A "TERMS AND CONDITIONS" section: split settings.termsText on newlines, render each
     non-empty line as a bullet.
  7. Footer: two signature lines — "Customer Acceptance" and "For NJ India".
  Format money with Indian grouping if easy; otherwise plain number with commas is fine.
  Keep it on one page for typical sizes; allow natural overflow to a 2nd page.

Task B — Write backend/routers/pdf.py with an APIRouter. At the top, import weasyprint
inside a try/except; if it fails, set a module flag WEASY_OK = False so the endpoint can
return a clear error instead of crashing the whole server.

  GET /api/quotations/{qid}/pdf
    - Load the quotation row by id (404 if missing).
    - Load the AppConfig row, parse to get company + settings.
    - Render templates/quotation.html with Jinja2 (use jinja2.Environment with a
      FileSystemLoader pointing at the templates folder; pass quotation=snapshot,
      company=..., settings=..., currency=...).
    - If WEASY_OK is False, raise HTTPException(500, "WeasyPrint not installed. Install GTK3 runtime.").
    - Convert the rendered HTML to PDF bytes with weasyprint.HTML(string=html).write_pdf().
    - Return a fastapi.responses.Response(content=pdf_bytes, media_type="application/pdf",
      headers={"Content-Disposition": f'inline; filename="{qid}.pdf"'}).

Task C — In backend/main.py include the router:
   from routers import pdf
   app.include_router(pdf.router)

After writing, print the URL to open a generated quotation PDF in the browser.
```

**Verification:**
```powershell
# First POST a quotation (Phase 4 verification), then:
# open http://127.0.0.1:8000/api/quotations/NJ-Q-TEST1/pdf  → a PDF renders with company header + table
```

---

# PHASE 8 — Warranty PDF (all 5 types from one template)

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\. Same WeasyPrint setup as the
quotation PDF. A warranty certificate snapshot (in the warranty_certificates table) has:

{ "id","warrantyNo","date","customer":{...},
  "template": { "title","logo","duration","manufacturerDetails","certifications",
                "productInfo","validityConditions","exclusions","guarantees",
                "seriesTable":[{"series","duration"}] },
  "certData": { "sellerName","batchNo","purchaseDate","siteAddress",
                "productName","productColor","productQty","productUnit" } }

The fields validityConditions, exclusions, guarantees, certifications, manufacturerDetails
are multi-line strings (newline-separated). The same template renders all 5 warranty types
because all the per-type content lives in template.* — we just display whatever is there.

Task A — Write backend/templates/warranty.html as a Jinja2 A4 template:
  1. Centered big logo text = template.logo. Below it, smaller = template.title.
  2. A bordered title bar: "WARRANTY CERTIFICATE".
  3. "Dear Customer," + the standard congratulations paragraph.
  4. Section "MANUFACTURER / COMPANY DETAILS": template.manufacturerDetails (\n → <br>).
  5. Section "CERTIFICATIONS": split template.certifications on \n, bullet each line
     (skip if empty).
  6. Section "WARRANTY DURATION": template.duration.
  7. Section "PRODUCT INFORMATION": template.productInfo (\n → <br>).
  8. Section "CONDITIONS FOR WARRANTY VALIDITY": bullets from template.validityConditions.
  9. Section "WARRANTY EXCLUSIONS": bullets from template.exclusions.
 10. Section "MANUFACTURER GUARANTEES": bullets from template.guarantees.
 11. "WARRANTY PERIOD" table: two columns Series | Duration, one row per
     template.seriesTable item. If seriesTable is empty, render 4 blank rows.
 12. "CERTIFICATE DETAILS" key/value block from certData:
     Address = certData.siteAddress, Product Name & Colour = productName + " — " + productColor,
     Batch Number = certData.batchNo (only show this row if batchNo is non-empty OR
     template.id in ["docke","ceramic"]), Date = certData.purchaseDate,
     Seller's Name = certData.sellerName,
     Trading Organization = "NOUFAL & JABBAR INTERNATIONAL LLP",
     Certificate Ref = warranty id.
 13. Footer: left signature line "Seller's Signature"; right a circular "SEAL" placeholder.
  Use the same A4 + serif + print styling approach as quotation.html.

Task B — In backend/routers/pdf.py ADD a second endpoint (keep the existing one):

  GET /api/warranties/{wid}/pdf
    - Load the warranty_certificates row by id (404 if missing). Parse its data JSON.
    - If WEASY_OK is False, raise 500 "WeasyPrint not installed. Install GTK3 runtime."
    - Render templates/warranty.html with cert=snapshot, template=snapshot["template"],
      certData=snapshot["certData"], customer=snapshot["customer"].
    - write_pdf() and return as application/pdf inline with filename "{wid}.pdf".

Do not duplicate the Jinja2 Environment setup — reuse the one from Phase 7 (refactor it
into a small helper if needed, but do not break the quotation endpoint).

Print the URL to open a generated warranty PDF.
```

**Verification:**
```powershell
# POST a warranty (Phase 5 verification) then:
# open http://127.0.0.1:8000/api/warranties/NJ-W-TEST1/pdf
```

---

# PHASE 9 — Connect the React frontend to the backend (replace localStorage)

> This phase edits the **frontend**. The goal: keep all UI exactly the same, but load/save through the API instead of `localStorage`. Do it carefully — one file at a time.

**Paste this into OpenCode:**

```
Context: A React 19 + Vite app at E:\IMP projects\NJ\frontend\. It currently stores all
state in localStorage under key "nj_app_data_v2" via AppContext.jsx. A FastAPI backend now
runs at http://127.0.0.1:8000 with these endpoints:

  GET  /api/config                  -> { company, settings, classes, varieties, warranties }
  PUT  /api/config                  (body = same object) -> {"status":"saved"}
  GET  /api/quotations              -> [ quotation snapshot, ... ] newest first
  POST /api/quotations              (body = quotation snapshot) -> snapshot
  DELETE /api/quotations            -> {"status":"cleared"}
  GET  /api/warranties              -> [ warranty snapshot, ... ] newest first
  POST /api/warranties              (body = warranty snapshot) -> snapshot
  DELETE /api/warranties            -> {"status":"cleared"}
  POST /api/uploads (multipart "file") -> { url, filename }

Task A — Create frontend/src/api.js, a tiny fetch wrapper. Define:
  const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  export async function getConfig()         -> GET  /api/config
  export async function saveConfig(cfg)     -> PUT  /api/config (JSON body)
  export async function listQuotations()    -> GET  /api/quotations
  export async function createQuotation(q)  -> POST /api/quotations
  export async function clearQuotations()   -> DELETE /api/quotations
  export async function listWarranties()    -> GET  /api/warranties
  export async function createWarranty(w)   -> POST /api/warranties
  export async function clearWarranties()   -> DELETE /api/warranties
  export async function uploadImage(file)   -> POST /api/uploads (FormData)
  Each uses fetch, sets Content-Type application/json for JSON calls, and throws on !res.ok.
  Keep it dependency-free (no axios).

Task B — Edit frontend/src/AppContext.jsx with MINIMAL changes:
  1. Keep the same state variables and the same value object keys (do not rename anything
     the components consume: data, setData, quotations lists are read via data.quotations
     and data.warranty_certificates today).
  2. Replace the initial localStorage load: instead of reading localStorage, initialize
     data to DEFAULT_DATA, then in a useEffect on mount, call getConfig() and the two list
     endpoints, and merge into data:
        const cfg = await getConfig();
        const quotations = await listQuotations();
        const warranty_certificates = await listWarranties();
        setData(prev => ({ ...prev, ...cfg, quotations, warranty_certificates }));
     Wrap in try/catch; on failure show a toast "Backend offline — using defaults" and keep
     DEFAULT_DATA so the UI still loads.
  3. REMOVE the useEffect that writes the whole data object to localStorage. We no longer
     persist the whole blob automatically.
  4. Keep showToast, cart logic, addToCart, etc. UNCHANGED.

Do NOT change any component files in this task. Only create api.js and edit AppContext.jsx.
After editing, run "npm run dev" and confirm the app loads with the seeded classes.
```

**Then paste this follow-up prompt:**

```
Context: same frontend. api.js exists and AppContext loads config from the backend.
Now wire the WRITE paths so saves go to the backend. Make these specific edits:

1. frontend/src/components/Checkout.jsx — in handleGenerateQuotation:
   After building `snapshot` and `generatedCerts`, instead of ONLY calling setData,
   also persist to the backend:
     import { createQuotation, createWarranty } from '../api';
     await createQuotation(snapshot);
     for (const cert of generatedCerts) { await createWarranty(cert); }
   Keep the existing setData call so the in-memory lists update immediately.
   Make handleGenerateQuotation async. Wrap the awaits in try/catch and on error
   showToast("Saved locally, backend sync failed", "error") but still proceed to the
   document view. Do the same pattern in handleGenerateWarrantyInstant (await createWarranty).

2. frontend/src/components/History.jsx — in handleClearHistory:
   import { clearQuotations, clearWarranties } from '../api';
   When isQuotation, await clearQuotations(); else await clearWarranties();
   Then keep the existing setData that empties the list in memory. Make the handler async,
   wrap in try/catch with an error toast.

3. Settings save (whichever component saves company/settings/classes/varieties/warranties):
   import { saveConfig } from '../api';
   After the user edits and the local `data` is updated via setData, call
   saveConfig({ company, settings, classes, varieties, warranties }) using the latest data.
   If the Settings components update `data` through setData, add a "Save to Server" call:
   create a helper in AppContext named persistConfig() that reads current data and calls
   saveConfig with the 5 config keys, and call it after settings mutations.
   Wrap in try/catch + toast.

Do not change any visual layout, styles, or field names. Only add the API calls described.
After editing, test: generate a quotation, refresh the page — it must still appear in
Quotation History (proving it persisted to the backend, not localStorage).
```

**Verification:**
```powershell
# Terminal 1: backend running (python main.py)
# Terminal 2:
cd "E:\IMP projects\NJ\frontend"
npm run dev
# Open the Vite URL. Generate a quotation. Refresh browser (F5).
# The quotation must still show in History → proves backend persistence.
```

---

# PHASE 10 — Production build (one server serves everything)

**Paste this into OpenCode:**

```
Context: FastAPI backend at E:\IMP projects\NJ\backend\ and React app at
E:\IMP projects\NJ\frontend\. For production on the NJ India PC we want ONE process:
FastAPI serves the API AND the built React app, so the seller just opens one URL.

Task A — In frontend, ensure the production build outputs to frontend/dist (Vite default).
Run "npm run build" (print the command; the user will run it).

Task B — In backend/main.py, AFTER all /api routers and the /uploads mount are included,
serve the React build as static files at the root. Use this approach so /api/* still works:
   from fastapi.staticfiles import StaticFiles
   from pathlib import Path
   DIST = Path(__file__).parent.parent / "frontend" / "dist"
   if DIST.exists():
       app.mount("/", StaticFiles(directory=str(DIST), html=True), name="spa")
   IMPORTANT: this mount("/") MUST be the LAST thing added in main.py, after every router,
   or it will swallow the /api routes. Add a comment saying so.

Task C — Create backend/start.bat with EXACTLY this content (Windows):
   @echo off
   title NJ India System
   cd /d %~dp0
   call .venv\Scripts\activate.bat
   start "" http://127.0.0.1:8000
   uvicorn main:app --host 127.0.0.1 --port 8000

Explain to the user: after "npm run build", double-clicking start.bat launches the whole
app and opens the browser at http://127.0.0.1:8000.

Do not use reload=True in production start.bat. Keep the __main__ block in main.py as-is
for development.
```

**Verification:**
```powershell
cd "E:\IMP projects\NJ\frontend"; npm run build
cd "E:\IMP projects\NJ\backend"; .\start.bat
# Browser opens http://127.0.0.1:8000 showing the full app, served by FastAPI.
# Generating quotations + PDFs all work from this single URL.
```

---

# PHASE 11 — Backup, polish, and optional .exe

**Paste this into OpenCode:**

```
Context: Working FastAPI + React app at E:\IMP projects\NJ\. Final hardening.

Task A — Add data backup endpoints in a new router backend/routers/backup.py:
  GET /api/backup
    - Build a dict: { "config": <parsed AppConfig data>, "quotations": [...all snapshots...],
      "warranty_certificates": [...all snapshots...] }.
    - Return it as a downloadable JSON file:
      Response(content=json.dumps(payload, ensure_ascii=False, indent=2),
               media_type="application/json",
               headers={"Content-Disposition": 'attachment; filename="nj_backup.json"'})
  POST /api/restore
    - Accept body: dict with the same shape as the backup.
    - Overwrite AppConfig.data with json.dumps(body["config"]).
    - Delete all quotations + warranty_certificates rows, then insert each from the body.
    - Commit. Return {"status":"restored"}.
  Include this router in main.py (BEFORE the mount("/") line).

Task B — Tell the user the simplest backup is to copy two things while the app is stopped:
   backend\nj_india.db   and   backend\uploads\
  Print a one-line PowerShell copy command for both into a dated folder.

Task C (OPTIONAL, only if user asks) — Explain how to bundle a single .exe with PyInstaller:
   pip install pyinstaller
   pyinstaller --onefile --add-data "templates;templates" \
       --add-data "../frontend/dist;frontend/dist" main.py
  Note the path caveats (the StaticFiles paths must be resolved relative to the bundle at
  runtime using sys._MEIPASS when frozen). Only implement if requested.

Do not implement Task C unless explicitly asked. Finish Tasks A and B.
```

**Verification:**
```powershell
# open http://127.0.0.1:8000/api/backup → downloads nj_backup.json containing everything
```

---

# Appendix — Field-name cheat sheet (give this to the model if it ever guesses wrong)

| Concept | EXACT key the frontend uses | Notes |
|---|---|---|
| Class → its warranty | `warrantyId` | NOT warrantyType. Value matches a warranty's `id`. |
| Class kind | `type` | `"tiles"` or `"tools"` |
| Warranty collection | `warranties` | An **array**, each item has string `id` |
| Variety → its class | `classId` | |
| Variety price | `basePrice` | number |
| Variety colours | `colors` | array of `{ name, hex, offset }` |
| Cart line item | `cartId, id, name, className, price, qty, unit, color, image` | |
| Quotation totals | `subtotal, taxRate, taxAmount, grandTotal` | numbers |
| Quotation date | `date` | display string `dd/mm/yyyy` |
| Warranty cert fields | `certData.sellerName, batchNo, purchaseDate, siteAddress, productName, productColor, productQty, productUnit, selectedCartId` | |
| Warranty cert link | `quotationId`, `warrantyNo`, `template` | `template` is the full warranty object |
| Config storage key (old) | `localStorage["nj_app_data_v2"]` | replaced by `/api/config` in Phase 9 |

# Appendix — Known mismatch to watch (per-class Terms & Conditions)

The actual NJ India PDFs show DIFFERENT terms & conditions per product class (Shingles vs
Stone Coated vs Heatout). The current frontend only has ONE global `settings.termsText`.
For now the backend uses the global `termsText` in the quotation PDF (Phase 7). When the
frontend later adds a per-class terms editor, add a `termsText` field to each class object
and update the quotation PDF template to print the terms of the class(es) present in the
items list. This is a planned enhancement — do NOT build it unless asked. See DECISIONS.md
ADR-012 and DATABASE.md for the rationale.
```
