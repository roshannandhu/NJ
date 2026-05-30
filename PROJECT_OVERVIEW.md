# PROJECT_OVERVIEW.md
# NJ India — Quotation & Warranty Management System

---

## Project Identity

| Field | Value |
|-------|-------|
| **Project Name** | NJ India Quotation & Warranty Management System |
| **Client** | NJ India Trading Pvt. Ltd. |
| **Location** | KNH Building, Neelithod Bridge, Parakkal, Bypass Road, Ramanattukara PO, Kozhikode — 673633, Kerala |
| **Phone** | +91 73566 08633 |
| **Website** | www.njindia.in |
| **Trading LLP** | NOUFAL & JABBAR INTERNATIONAL LLP |
| **Document Version** | 2.0 |
| **Last Updated** | May 2026 |

---

## Executive Summary

NJ India Trading Pvt. Ltd. is a Kerala-based company dealing in premium roofing and home care products. Their product catalogue spans 5 distinct product classes — Asphalt Shingles, Docke PIE Bitumen Shingles, Ceramic Roof Tiles, Stone Coated Metal Tiles, and Heatout Insulated Ceilings — plus a Tools & Accessories category.

**The Problem:** Every customer enquiry requires:
1. Creating a price quotation (manually in Canva or PowerPoint) — 10–20 minutes
2. Creating separate warranty certificates per product class purchased — 5–10 minutes each
3. Risk of using wrong warranty templates, calculation errors, and inconsistent formatting

**The Solution:** A single-device, offline-first desktop application that:
- Lets sellers select products visually in under 2 minutes
- Auto-calculates pricing with GST
- Generates a professional, print-ready A4 quotation PDF
- Auto-detects which warranty certificates are needed
- Guides the seller through generating each warranty PDF sequentially
- Stores all records locally for reprinting and history

**Core Promise:** What takes 15–30 minutes per customer becomes a **2-minute task** with consistent, professional output every time.

---

## Business Goals

| Goal | Description | Priority |
|------|-------------|----------|
| **Speed** | Complete quotation in under 2 minutes | Critical |
| **Consistency** | Every document follows exact same format | Critical |
| **Zero Training** | Beginner seller can use on day one | High |
| **Accuracy** | Auto-calculation, auto-warranty mapping, zero manual math | High |
| **Offline-First** | Works without internet on a single PC | High |
| **History** | All past quotations/warranties searchable and reprintable | High |
| **Self-Management** | All products, prices, and warranty text editable without a developer | Medium |

---

## Product Catalogue Structure

```
NJ India Products
│
├── Class 1: NJ Premium Laminated (Asphalt Shingles)
│   ├── Varieties: Laminated Standard, Ridge Long Type, etc.
│   ├── Units: sqft, Rft, nos
│   └── Warranty: NJ Laminated Warranty (nj_laminated)
│
├── Class 2: Docke PIE (Bitumen Shingles)
│   ├── Varieties: PIE Classic, PIE Jazz, PIE Lux, etc.
│   ├── Units: sqft
│   └── Warranty: Docke PIE Warranty (docke)
│
├── Class 3: NJ Premium Ceramic Tiles
│   ├── Varieties: Mediterranean Curve, Flat Premium, etc.
│   ├── Units: pcs, nos
│   └── Warranty: Ceramic Warranty (ceramic)
│
├── Class 4: NJ Stone Coated Metal Tiles
│   ├── Varieties: Milano, Romana, Bond profiles
│   ├── Units: sqft
│   └── Warranty: Stone Coated Warranty (stone_coated)
│
├── Class 5: Heatout Insulated Ceilings
│   ├── Varieties: Veeti Panel, etc.
│   ├── Units: sqft
│   └── Warranty: Heatout Warranty (heatout)
│
└── Tools & Accessories (No Warranty)
    ├── Roofing Screws, Silicone Tubes, Touch-up Kits, etc.
    └── Units: nos, pcs, box
```

---

## Warranty Complexity

NJ India issues **5 separate warranty certificate types**. A single sale may require multiple certificates:

| Warranty Key | Product Class | Duration | Special Fields |
|-------------|---------------|----------|----------------|
| `nj_laminated` | Shingles | 10-year service | Dynamic Sections (from DOCX) |
| `docke` | Docke PIE | 10-year service | Batch no. + Dynamic Sections |
| `ceramic` | Ceramic Tiles | Per series table | Batch no. + Dynamic Sections |
| `stone_coated` | Stone Coated | 10-yr service + 50-yr rust | Dynamic Sections (from DOCX) |
| `heatout` | Heatout Ceilings | 25-year graduated | Dynamic Sections (from DOCX) |

**Critical Features:** 
1. If a customer buys from 2 classes (e.g., Stone Coated + Heatout), the system must generate **2 separate warranty PDFs** and walk the seller through both.
2. The generated warranties must have **1:1 structural parity** with the physical DOCX templates, utilizing dynamic section arrays.
3. Every heading, paragraph, and bullet list must be fully **inline editable** by clicking directly on the certificate before printing.

---

## Non-Goals (Explicitly Out of Scope for v1)

- Multi-device synchronisation
- Customer-facing portal
- Inventory / stock management
- Accounting integration (Tally, QuickBooks)
- Email sending
- Mobile app
- Cloud backup (manual JSON export only)

---

## Target Users

| Role | Description |
|------|-------------|
| **Seller** | Primary user. Generates quotations and warranties daily. May not be tech-savvy. |
| **Manager/Owner** | Edits products, prices, warranty terms in Settings. Occasional user. |
| **No External Users** | This is a strictly internal single-device tool. |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to generate a quotation | < 2 minutes |
| Time to generate a warranty | < 60 seconds per certificate |
| Zero formatting inconsistencies | 100% of documents use same template |
| Zero wrong-warranty-template errors | System auto-detects correct templates |
| App uptime | 100% (offline, no server dependency) |

---

## Technology Approach

**Prototype (reference only):** `nj-system-v3.html` — single HTML file (vanilla HTML + CSS + JS + jsPDF + html2canvas). All flows proven and working. Not the production target.

**Production target (v2 rebuild — DECIDED May 2026):** React + FastAPI.

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 (Vite) | Component-based, replaces single-file HTML |
| Backend | FastAPI (Python) | Runs locally on `localhost:8000` |
| Database | SQLite | Single `.db` file; backup = copy file |
| PDF Generation | WeasyPrint / reportlab | Server-side, true vector PDF (not html2canvas screenshot) |
| Image uploads | FastAPI file upload | Logo, seal, signature, product photos stored in `uploads/` |
| Deployment | uvicorn | One process serves both API and React static build |

**Why React + FastAPI over vanilla HTML + Electron:**
- Server-side PDF = selectable text, smaller files, print-perfect output
- Real image uploads (company logo, seal, product photos)  
- SQLite = data safe from browser cache clear; easy backup
- Per-class terms & conditions (not possible with single global field)

**Local deployment:** Seller opens `localhost:8000` in Chrome. No cloud, no subscription, no internet required. Optional: PyInstaller `.exe` for native app feel.

---

## Project Status

| Phase | Status |
|-------|--------|
| Prototype — Single HTML (v3) | Complete — reference only |
| v2 Rebuild: React + FastAPI setup | In Progress |
| v2: Home + Cart + Quotation flow | Planned |
| v2: Warranty system | Planned |
| v2: Settings (classes, warranties, T&C per class) | Planned |
| v2: PDF generation (WeasyPrint) | Planned |
| v2: Image uploads (logo, seal, products) | In Progress (Warranty logo, seal, signature base64 upload complete) |
| v2: History + reprint | Planned |
| v2: Local deployment (.exe optional) | Planned |

---

## Document Dependencies

```
PROJECT_OVERVIEW.md (this file)
    └── IDEA.md                  ← Business context and problem framing
    └── FEATURES.md              ← Detailed feature list
    └── USER_FLOW.md             ← All user journeys
    └── ARCHITECTURE.md          ← System design
    └── DATABASE.md              ← Data model / schema
    └── API.md                   ← Internal function API (no HTTP)
    └── UI_UX.md                 ← Design system and components
    └── SECURITY.md              ← Security practices
    └── SCALING.md               ← Future growth path
    └── DEPLOYMENT.md            ← How to ship and distribute
    └── TESTING.md               ← Testing strategy
    └── RULES.md                 ← Coding standards
    └── DECISIONS.md             ← Architecture decision log
    └── PLAN.md                  ← Phase-by-phase roadmap
```
