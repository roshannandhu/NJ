# PLAN.md
# Phase-by-Phase Development Roadmap

---

## Roadmap Overview

### v1 — Vanilla HTML Prototype (COMPLETE — reference only)

```
Phase 1 — Settings & Data Engine          ✓ COMPLETE
Phase 2 — Home Page & Cart               ✓ COMPLETE
Phase 3 — Quotation Generation           ✓ COMPLETE
Phase 4 — Warranty System                ✓ COMPLETE (bugs fixed May 2026)
Phase 5 — Polish & Edge Cases            🔄 PARTIAL (superseded by v2 rebuild)
```

The vanilla HTML prototype (`nj-system-v3.html`) proved all flows. **It is now reference-only. Do not continue building it.**

### v2 — React + FastAPI Rebuild (ACTIVE — production target)

```
v2 Phase 1 — Project Setup + Database          🔄 IN PROGRESS
v2 Phase 2 — FastAPI Core (models, CRUD)       📋 PLANNED
v2 Phase 3 — React Frontend (Home + Cart)      📋 PLANNED
v2 Phase 4 — Quotation + PDF generation        📋 PLANNED
v2 Phase 5 — Warranty system                   📋 PLANNED
v2 Phase 6 — Settings + image uploads          📋 PLANNED
v2 Phase 7 — History + reprint                 📋 PLANNED
v2 Phase 8 — Polish + local deployment         📋 PLANNED
```

---

---

## v2 React + FastAPI — Detailed Phase Plan

### v2 Phase 1 — Project Setup + Database 🔄

**Goal:** Working FastAPI server with SQLite schema and React app scaffolded.

**Backend tasks:**
- [ ] `pip install fastapi uvicorn sqlalchemy weasyprint python-multipart pillow`
- [ ] Define SQLAlchemy models: `Company`, `Settings`, `ProductClass`, `Variety`, `Color`, `Tool`, `WarrantyTemplate`, `SeriesRow`, `Quotation`, `QuotationItem`, `WarrantyCertificate`
- [ ] Add `terms_text` column to `ProductClass` (per-class T&C — see ADR-012)
- [ ] Seed database with 5 default classes, default varieties (including "Veeti" for Heatout), 5 warranty templates
- [ ] `GET /api/health` route — confirm server running
- [ ] FastAPI configured to serve React `dist/` as static files

**Frontend tasks:**
- [ ] `npm create vite@latest frontend -- --template react`
- [ ] Install: `react-router-dom`, `axios`
- [ ] Sidebar + topbar layout components
- [ ] Basic routing: Home / Quotations / Warranties / Settings

**Deliverable:** `uvicorn main:app` starts. Browser opens `localhost:8000`. Sidebar renders.

---

### v2 Phase 2 — FastAPI CRUD Routes

**Goal:** All API endpoints for products, settings, quotations, warranties.

**Routes to build:**
```
GET/PUT   /api/company
GET       /api/classes
POST/PUT  /api/classes/{id}
DELETE    /api/classes/{id}
GET       /api/classes/{id}/varieties
POST/PUT  /api/varieties/{id}
GET/POST  /api/tools
GET       /api/warranties
PUT       /api/warranties/{key}
POST      /api/quotations
GET       /api/quotations
GET       /api/quotations/{id}
POST      /api/warranties/generate
GET       /api/warranty-certificates
GET       /api/warranty-certificates/{id}
POST      /api/uploads/logo
POST      /api/uploads/seal
POST      /api/uploads/product-image/{varietyId}
GET       /api/uploads/{filename}
```

**Deliverable:** All data CRUD works via API. Can test with Postman/curl.

---

### v2 Phase 3 — React Frontend: Home + Cart

**Goal:** Complete product browsing and cart building in React.

**Components:**
- `CustomerCard` — 4 inputs, syncs to React state
- `ProductClassStrip` — expandable, shows variety grid
- `VarietyCard` — click to open detail panel
- `VarietyDetailPanel` — colour swatches, qty, Add to Cart
- `ToolsSection` — quick-add tools
- `CartDrawer` — slide-in, qty controls, totals, Generate button

**State:** React context or Zustand for cart + customer state.

**Deliverable:** Full product selection flow in browser. Cart works with real data from FastAPI.

---

### v2 Phase 4 — Quotation Generation + PDF

**Goal:** End-to-end quotation creation and server-side PDF download.

**Tasks:**
- [ ] Checkout page: itemised table, subtotal, GST, total
- [ ] Per-class T&C section (reads `terms_text` from each class in cart)
- [ ] `POST /api/quotations` — saves frozen snapshot to SQLite
- [ ] Quotation document HTML template (server-rendered via Jinja2 or returned as HTML)
- [ ] `GET /api/quotations/{id}/pdf` — WeasyPrint renders to PDF, returns file
- [ ] Quotation history page with search

**PDF format:** Matches exactly the NJ India quotation format documented in §11 of the spec. Company header, product info box with image, itemised table, per-class T&C, signature lines.

**Deliverable:** Quotation PDF downloads with selectable text, correct layout.

---

### v2 Phase 5 — Warranty System

**Goal:** Complete warranty generation with all 5 template types.

**Tasks:**
- [ ] Warranty form (pre-filled from quotation snapshot)
- [ ] Batch number field for Docke + Ceramic only
- [ ] Progress bar for multi-warranty flow
- [ ] `POST /api/warranty-certificates` — saves certificate to SQLite
- [ ] `GET /api/warranty-certificates/{id}/pdf` — WeasyPrint renders warranty PDF
- [ ] Warranty history page

**PDF format:** All 5 template types match the exact PDFs in `Warranty.pdf` and `Warranty_2.pdf`.

**Deliverable:** All 5 warranty types generate correct PDFs. Multi-warranty sequential flow works.

---

### v2 Phase 6 — Settings + Image Uploads

**Goal:** All settings editable; real images on documents.

**Tasks:**
- [ ] Company settings (name, address, phones, website)
- [ ] Per-class T&C editor (new — not in v1)
- [ ] Classes + varieties CRUD with colour management
- [ ] Warranty template editor (all 5 templates, series table)
- [ ] Tools CRUD
- [ ] Logo upload → stored in `uploads/`, shown on quotation header
- [ ] Company seal upload → shown on warranty bottom (circular stamp)
- [ ] Product image upload per variety → shown in product box
- [ ] Signature upload

**Deliverable:** Every piece of content on quotations/warranties editable without a developer.

---

### v2 Phase 7 — History + Reprint

**Goal:** All past documents searchable and reprintable from snapshots.

**Tasks:**
- [ ] Quotation history table (search by name, ID, amount)
- [ ] Warranty history table (search by name, ID, type)
- [ ] Reprint quotation from frozen snapshot (GET /api/quotations/{id}/pdf)
- [ ] Reprint warranty from frozen snapshot (GET /api/warranty-certificates/{id}/pdf)

**Deliverable:** Any past document can be reprinted exactly as issued.

---

### v2 Phase 8 — Polish + Local Deployment

**Goal:** Production-ready; installable on NJ India PC.

**Tasks:**
- [ ] PIN lock screen (optional, configurable)
- [ ] Toast notifications throughout
- [ ] Empty states for all lists
- [ ] Error handling: validation toasts, API error banners
- [ ] `npm run build` → confirm FastAPI serves `dist/` correctly
- [ ] Write startup script (`start.bat` or `start.cmd`) for NJ India PC:
  ```batch
  @echo off
  cd /d %~dp0
  uvicorn main:app --host 127.0.0.1 --port 8000
  ```
- [ ] Optional: PyInstaller `.exe` build
- [ ] Data export (full SQLite backup as JSON or `.db` download)
- [ ] Data import / restore

**Deliverable:** Seller double-clicks `start.bat`. Chrome opens. App works.

---

## v1 Phases (Archive — Complete)

### Phase 1 — Settings & Data Engine ✓

**Goal:** Build the complete data model, localStorage persistence, and the Settings UI so all content is configurable before any quotation flow exists.

**Tasks:**
- [x] Define `DATA` schema (company, settings, classes, varieties, warranties, quotations, certs)
- [x] Define `DEFAULT_DATA` with all 5 classes, sample varieties, 5 warranty templates
- [x] `loadData()` — read from localStorage or fall back to defaults
- [x] `saveData()` — serialise and persist DATA
- [x] Settings page with 5 tabs: Company, Products, Warranties, Quotation, Security
- [x] Company tab: edit name, address, phone, website
- [x] Products tab: CRUD for classes and varieties (including colour management)
- [x] Warranties tab: edit all 5 template fields + series table
- [x] Quotation tab: tax toggle, rate, prefixes, terms & conditions
- [x] Security tab: PIN toggle, export, import, reset

**Files Involved:**
- `nj-quotation-warranty-system.html` — all sections

**Expected Output:**
Working Settings interface where all data can be configured. No quotation flow yet, but the data foundation is solid.

**Testing Checklist:**
- [ ] All 5 classes appear in Products tab
- [ ] Add/Edit/Delete varieties with colours works
- [ ] All 5 warranty templates editable and saveable
- [ ] Tax toggle affects settings correctly
- [ ] Export JSON → valid JSON downloadable
- [ ] Import JSON → data restored correctly
- [ ] Reset → defaults restored
- [ ] PIN enable/disable works

---

## Phase 2 — Home Page & Cart ✓

**Goal:** Complete product browsing and cart building flow.

**Tasks:**
- [x] Sidebar + topbar layout (sticky, persistent)
- [x] Customer card with 4 fields (live sync to APP_STATE)
- [x] Product class grid (5 cards + navigation to varieties)
- [x] Variety grid (per class, with back navigation)
- [x] Variety detail page (image, colours, qty, add-to-cart)
- [x] Colour selection (swatch click, price update, image update)
- [x] Tools quick-add section on home page
- [x] Cart drawer (slide-in, qty controls, totals, remove)
- [x] Cart badge (count updates)
- [x] Customer name validation before checkout

**Files Involved:**
- CSS: sidebar, topbar, customer-card, class-grid, variety-grid, detail-layout, cart-drawer
- JS: renderHome, selectClass, selectVariety, selectColor, addToCart, addToolToCart, cart module

**Expected Output:**
Seller can browse all products, select colours, set quantities, and build a cart. Cart drawer shows live totals.

**Testing Checklist:**
- [ ] All class cards render with SVG patterns
- [ ] Click class → variety grid with back button
- [ ] Click variety → detail with colour swatches
- [ ] Colour click updates price and image
- [ ] Add to cart → item appears in drawer
- [ ] Tool quick-add works without navigation
- [ ] Qty controls in cart update totals in real time
- [ ] Remove item from cart
- [ ] Generate blocked with no customer name

---

## Phase 3 — Quotation Generation ✓

**Goal:** End-to-end quotation creation, document rendering, PDF download, and history.

**Tasks:**
- [x] Checkout page (customer edit + item table + tax + grand total)
- [x] Warranty detection display on checkout
- [x] `generateQuotation()` — create frozen snapshot record
- [x] Sequential ID generation (NJ-Q-0001, etc.)
- [x] Snapshot principle implementation
- [x] Quotation document HTML builder (`buildQuotationHTML`)
- [x] PDF generation (html2canvas + jsPDF + multi-page support)
- [x] Quotation History page with search
- [x] Reprint from history (snapshot)
- [x] Cart clear after generation

**Files Involved:**
- CSS: doc-output styles, history-table
- JS: goToCheckout, generateQuotation, showQuotationDocument, buildQuotationHTML, downloadQuotationPDF, renderQuotationHistory, filterHistory, reopenQuotation

**Expected Output:**
Complete quotation workflow: select → cart → checkout → generate → PDF → reprint.

**Testing Checklist:**
- [ ] Checkout shows correct subtotal, GST, grand total
- [ ] Quotation ID increments correctly
- [ ] Snapshot prices unchanged after product price edit
- [ ] PDF renders professionally (A4, company header, terms)
- [ ] Filename format: NJ-Q-0001_Customer_Name.pdf
- [ ] History shows all quotations with correct data
- [ ] Search works by name, ID, amount
- [ ] View from history renders snapshot correctly

---

## Phase 4 — Warranty System ✓

**Goal:** Complete warranty certificate generation with multi-warranty sequential flow.

**Tasks:**
- [x] Auto-detect warranty types from cart items (class → warrantyId mapping)
- [x] Auto-generate warranty certificates when quotation is generated (no separate wizard)
- [x] Pre-fill certData: customer, address, product, seller, purchase date from checkout context
- [x] Batch number field for Docke/Ceramic only (inline-editable on certificate)
- [x] Warranty certificate rendering with numbered sections (§1–§7) matching physical PDFs
- [x] Per-template section headings (Warrantor vs Manufacturer, Guarantees vs Remedy, etc.)
- [x] Two-column layout for Conditions + Exclusions
- [x] Playfair Display serif font for brand logo header
- [x] Inline-editable certificate details (click-to-edit in standalone WarrantyDocument view)
- [x] Both views (standalone WarrantyDocument + QuotationDocument warranty tab) render identically
- [x] PDF generation for warranties (html2canvas + jsPDF)
- [x] Warranty History page with search
- [x] Reprint from warranty history

**Key Bug Fixes Applied:**
- [x] Fixed: duplicate `availableWarrantyTemplates` declaration in Checkout.jsx
- [x] Fixed: `&amp;` HTML entity in JSX text content
- [x] Fixed: warranty CSS class name conflicts (w-* → wd-* prefix)

**Files Involved:**
- CSS: warranty-doc styles
- JS: generateWarranties, showWarrantyForm, generateWarrantyDoc, showWarrantyDocument, buildWarrantyHTML, downloadWarrantyPDF, renderWarrantyHistory, reopenWarranty

**Expected Output:**
Complete warranty workflow including multi-warranty sequential flow with progress bar.

**Testing Checklist:**
- [ ] Single warranty: form → generate → PDF → Done
- [ ] Multi-warranty: 2 forms → progress 1/2 → 2/2 → Done
- [ ] Each warranty type has correct template content
- [ ] Batch number shown only for Docke/Ceramic
- [ ] Certificate details section complete
- [ ] Warranty IDs recorded in quotation.warrantiesGenerated
- [ ] History shows all certificates
- [ ] View from history renders correctly
- [ ] Next Warranty button doesn't crash on names with apostrophes

---

## Phase 5 — Polish & Edge Cases 🔄 IN PROGRESS

**Goal:** Production-ready finish: all edge cases handled, all empty states polished, all validations complete.

**Tasks:**
- [x] Toast notifications throughout
- [x] Empty states: quotation history, warranty history, variety grid
- [x] Customer name validation in cart Generate
- [x] Seller name validation in warranty form
- [x] Warranty status badges in quotation history (W: 0/2 → W: 2/2 ✓)
- [x] Progress bar in warranty flow
- [x] Discount: wire discount input to checkout calculation
- [x] Storage quota warning when approaching 4 MB
- [ ] Keyboard shortcut: Enter submits forms (PIN, warranty form)
- [x] Keyboard shortcut: Esc closes cart and modals
- [x] Print CSS testing and refinement (warranty + quotation @media print rules updated)
- [ ] PDF multi-page overflow testing (12+ items)
- [ ] LocalStorage version migration check
- [ ] Bundle CDN libraries locally for true offline
- [ ] Add SRI hashes to CDN tags
- [ ] Final UI pixel-perfect pass

**Files Involved:**
- All CSS sections for polish
- JS: goToCheckout validation, discount logic, keyboard handlers

**Expected Output:**
App ready for production handover to NJ India.

**Testing Checklist:**
- [ ] All items in Phase 1–4 testing checklists pass
- [ ] Discount calculation correct (if wired)
- [ ] Enter key works in PIN input ✓ (already implemented)
- [ ] Esc closes cart/modal
- [ ] 15+ item quotation PDF renders on 2 pages correctly
- [ ] CDN libraries load from local bundle
- [ ] All empty states look correct

---

## Phase 6 — Image Uploads 📋

**Goal:** Replace SVG placeholders with real product photos.

**Tasks:**
- [ ] Add image upload input to variety edit modal
- [ ] Convert uploaded image to base64 and store in `variety.image`
- [ ] Render real image in variety card and detail page
- [ ] Render real image in quotation product box
- [x] Add warranty logo upload option in Warranty settings
- [ ] Add company logo upload in Company settings
- [ ] Add company seal upload in Company settings
- [x] Render uploaded warranty logo in warranty documents
- [ ] Add signature image upload
- [ ] Handle large images (compress before storing to respect localStorage limits)

**Files Involved:**
- JS: editVariety modal (add `<input type="file">` + FileReader)
- JS: renderHome, selectVariety, buildQuotationHTML, buildWarrantyHTML
- JS: renderCompanySettings, saveCompany

**Expected Output:**
Real product images in all UI and PDF locations.

**Testing Checklist:**
- [ ] Upload JPG/PNG for a variety → appears on home grid
- [ ] Upload PNG for company logo → appears on quotation header
- [ ] Upload company seal → appears on warranty bottom
- [ ] Large image upload doesn't break localStorage (check compression)
- [ ] Missing image falls back to SVG placeholder

---

## Phase 7 — Discount & Customer Database 📋

**Goal:** Enable per-quotation discounts and save/reuse customer details.

### Phase 7A — Discount

**Tasks:**
- [ ] Add discount toggle and input to Checkout page (if `settings.discountEnabled`)
- [ ] Calculate: `discountAmount = subtotal × discountPercent / 100` OR flat amount
- [ ] Apply discount before GST: `taxableAmount = subtotal - discount`
- [ ] Show discount row in totals
- [ ] Store `discount` and `discountType` in QuotationRecord
- [ ] Show discount in quotation document

**Data change:**
```javascript
// Add to QuotationRecord:
discount:     number,   // ₹ amount
discountType: string,   // "percent" | "flat"
```

### Phase 7B — Customer Database

**Tasks:**
- [ ] Add `customers: []` to DATA schema
- [ ] Add `CustomerRecord { id, name, phone, email, address, createdAt, quotationCount }`
- [ ] On quotation generate: upsert customer record (match by name+phone)
- [ ] On Home page customer fields: autocomplete from customers[]
- [ ] Add "Customers" tab to Settings for management
- [ ] Show customer history (past quotations) from customer record

**Files Involved:**
- DB: `customers[]` array in DATA
- JS: generateQuotation (upsert customer), renderHome (autocomplete), settings customer tab

**Testing Checklist:**
- [ ] Discount reduces total before GST
- [ ] Discount shown in quotation PDF
- [ ] Customer autocomplete suggests matching names
- [ ] Returning customer auto-fills phone and address
- [ ] Customer record shows count of past quotations

---

## Phase 8 — Electron Packaging 📋

**Goal:** Distribute as a native Windows desktop application.

**Tasks:**
- [ ] Create Electron project structure (`package.json`, `main.js`, `preload.js`)
- [ ] Move HTML into Electron app
- [ ] Bundle jsPDF and html2canvas locally (remove CDN dependency)
- [ ] Replace Google Fonts CDN with local font files
- [ ] Configure `BrowserWindow` with correct dimensions and icon
- [ ] Disable default menu
- [ ] Configure `electron-builder` for Windows NSIS installer
- [ ] Create app icon (`.ico`, 256×256)
- [ ] Test installer build on Windows 10/11
- [ ] Test localStorage persistence across app restarts
- [ ] Write `DEPLOYMENT.md` Electron section

**Files Involved:**
- `main.js` (new)
- `package.json` (new)
- `assets/icon.ico` (new)
- Modified HTML: remove CDN links, add local lib paths

**Testing Checklist:**
- [ ] `npm start` opens Electron window
- [ ] `npm run build` produces `.exe`
- [ ] Installer installs without errors on Windows 10
- [ ] App opens after install
- [ ] Data persists across app restarts
- [ ] PDF download works via Electron
- [ ] App works offline (no CDN)

---

## Phase 9 — Analytics & Future Enhancements 📋

**Goal:** Business intelligence and quality-of-life improvements.

**Tasks:**
- [ ] Analytics dashboard page (summary cards + top products)
- [ ] Monthly quotation count chart
- [ ] Top 5 products by revenue
- [ ] Quotation status tracking (Sent / Accepted / Rejected)
- [ ] Bulk price update (% change across class or all products)
- [ ] Quote → Invoice conversion
- [ ] Dark mode toggle
- [ ] Keyboard shortcuts reference modal

---

## Current Sprint (Phase 5) — Detailed Task Tracker

| Task | Priority | Status | Assignee |
|------|----------|--------|---------|
| Wire discount to checkout | High | Done | Dev |
| localStorage quota warning | High | Done | Dev |
| Esc key closes cart/modal | Medium | Done | Dev |
| Bundle CDN libs locally | Medium | Open | Dev |
| Print CSS refinement | Medium | Open | Dev |
| PDF multi-page testing | Medium | Open | Dev |
| SRI hashes on CDN tags | Low | Open | Dev |

---

## Technical Debt Log

| Item | Impact | Resolution Plan |
|------|--------|----------------|
| Global function scope | Medium | Refactor to modules in v1.5 if file > 300KB |
| No automated tests | Medium | Add Playwright or Jest in v2 |
| CDN dependency | Medium | Bundle locally in Phase 5 |
| Discount UI exists but not wired | Low | Wire in Phase 5 |
| No multi-page PDF explicit handling | Low | Implement in Phase 5 |
| No localStorage quota monitoring | Low | Add in Phase 5 |
