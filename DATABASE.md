# DATABASE.md
# Data Model & Schema Specification

---

## Storage Overview

### v2 (React + FastAPI — ACTIVE)

Storage is SQLite via SQLAlchemy. Single `.db` file on disk. FastAPI reads/writes it. Backup = copy the file.

```
nj_india.db   ← single SQLite file, all tables
uploads/      ← uploaded images (logo, seal, product photos)
```

See SQLite Schema section below.

### v1 (Vanilla HTML Prototype — reference only)

All data lived in a single localStorage entry:

```
Key:   "nj_app_data_v2"
Value: JSON.stringify(DATA)
```

The `DATA` object was the entire database, loaded on app start and written on every mutation. This approach is no longer the target — see v2 schema below.

---

## SQLite Schema (v2 — React + FastAPI)

### Table: `company`

```sql
CREATE TABLE company (
  id        INTEGER PRIMARY KEY DEFAULT 1,
  name      TEXT NOT NULL DEFAULT 'NJ INDIA TRADING PVT.LTD',
  address   TEXT NOT NULL,
  phone_main    TEXT,
  phone_shingles TEXT,      -- +91 73566 08633 (laminated quotations)
  phone_stone    TEXT,      -- +91 81389 23033 (stone coated quotations)
  phone_heatout  TEXT,      -- +91 80894 75333 (heatout quotations)
  website   TEXT DEFAULT 'www.njindia.in',
  logo_path      TEXT,      -- path in uploads/
  seal_path      TEXT,      -- path in uploads/ (circular stamp)
  signature_path TEXT       -- path in uploads/
);
```

Note: Multiple phone numbers because different product lines use different contact numbers (confirmed from actual PDFs).

### Table: `settings`

```sql
CREATE TABLE settings (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  pin_enabled      BOOLEAN DEFAULT FALSE,
  pin              TEXT DEFAULT '1234',
  tax_enabled      BOOLEAN DEFAULT TRUE,
  tax_rate         REAL DEFAULT 18.0,
  discount_enabled BOOLEAN DEFAULT TRUE,
  quotation_prefix TEXT DEFAULT 'NJ-Q',
  warranty_prefix  TEXT DEFAULT 'NJ-W',
  quote_validity_days INTEGER DEFAULT 20   -- from Stone Coated PDF: "valid 20 days"
);
```

### Table: `product_classes`

```sql
CREATE TABLE product_classes (
  id            TEXT PRIMARY KEY,    -- 'cls_shingles', 'cls_docke', etc.
  name          TEXT NOT NULL,       -- 'NJ Premium Laminated'
  subtitle      TEXT,                -- 'Asphalt Shingles'
  description   TEXT,
  warranty_type TEXT,                -- FK to warranty_templates.key (nullable)
  color_hex     TEXT DEFAULT '#7c4a2d',
  terms_text    TEXT,                -- PER-CLASS T&C (see ADR-012) — replaces global field
  sort_order    INTEGER DEFAULT 0
);
```

**Critical:** `terms_text` is per-class (ADR-012). Each class has its own T&C set because:
- Shingles: 50/50 payment, transport included
- Stone Coated: 50/50 split, transport at customer cost, 60-day delivery, 20-day validity
- Heatout: 30/60/10 payment, scaffolding/union costs at client

### Table: `varieties`

```sql
CREATE TABLE varieties (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES product_classes(id),
  name        TEXT NOT NULL,
  description TEXT,
  base_price  REAL NOT NULL DEFAULT 0,
  unit        TEXT NOT NULL DEFAULT 'sqft',  -- sqft|Rft|nos|pcs|box|mtr|m2
  image_path  TEXT                            -- path in uploads/
);
```

### Table: `colors`

```sql
CREATE TABLE colors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  variety_id  TEXT NOT NULL REFERENCES varieties(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,    -- 'Charcoal Black'
  hex         TEXT NOT NULL,    -- '#2a2a2a'
  price_offset REAL DEFAULT 0   -- ₹ added to base_price
);
```

### Table: `tools`

```sql
CREATE TABLE tools (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  base_price  REAL NOT NULL DEFAULT 0,
  unit        TEXT NOT NULL DEFAULT 'nos'
);
```

### Table: `warranty_templates`

```sql
CREATE TABLE warranty_templates (
  key                   TEXT PRIMARY KEY,  -- 'docke'|'nj_laminated'|'ceramic'|'stone_coated'|'heatout'
  title                 TEXT NOT NULL,
  logo_text             TEXT,              -- Large header text (e.g. 'Döcke', 'LAMINATED')
  duration              TEXT,
  manufacturer_details  TEXT,
  certifications        TEXT,
  product_info          TEXT,
  validity_conditions   TEXT,              -- Newline-separated → bullet list in PDF
  exclusions            TEXT,
  guarantees            TEXT,
  requires_batch_number BOOLEAN DEFAULT FALSE  -- TRUE for docke and ceramic
);
```

### Table: `warranty_series`

```sql
CREATE TABLE warranty_series (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  warranty_key TEXT NOT NULL REFERENCES warranty_templates(key) ON DELETE CASCADE,
  series_name  TEXT NOT NULL,
  duration     TEXT NOT NULL,
  sort_order   INTEGER DEFAULT 0
);
```

### Table: `quotations`

```sql
CREATE TABLE quotations (
  id                   TEXT PRIMARY KEY,     -- 'NJ-Q-0001'
  created_at           DATETIME NOT NULL,
  customer_name        TEXT NOT NULL,
  customer_phone       TEXT,
  customer_email       TEXT,
  customer_address     TEXT,
  subtotal             REAL NOT NULL,
  tax_rate             REAL NOT NULL,        -- snapshot at generation
  tax_amount           REAL NOT NULL,
  discount_amount      REAL DEFAULT 0,
  total                REAL NOT NULL,
  warranty_types       TEXT NOT NULL,        -- JSON array: '["nj_laminated"]'
  warranties_generated TEXT DEFAULT '[]'     -- JSON array of warranty IDs
);
```

### Table: `quotation_items`

```sql
CREATE TABLE quotation_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  item_type   TEXT NOT NULL,    -- 'variety' | 'tool'
  variety_id  TEXT,             -- informational only (snapshot below)
  class_id    TEXT,             -- informational only
  name        TEXT NOT NULL,    -- frozen: 'Laminated Standard — Charcoal'
  unit        TEXT NOT NULL,    -- frozen
  unit_price  REAL NOT NULL,    -- frozen
  quantity    REAL NOT NULL,
  color_hex   TEXT,
  line_total  REAL NOT NULL,
  sort_order  INTEGER DEFAULT 0
);
```

### Table: `warranty_certificates`

```sql
CREATE TABLE warranty_certificates (
  id               TEXT PRIMARY KEY,     -- 'NJ-W-0001'
  quotation_id     TEXT NOT NULL REFERENCES quotations(id),
  warranty_key     TEXT NOT NULL,        -- 'nj_laminated' | 'docke' | etc.
  created_at       DATETIME NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  customer_address TEXT,
  cert_address     TEXT,                 -- installation address
  cert_product     TEXT,                 -- product name + colour
  cert_batch       TEXT,                 -- batch number (docke + ceramic only)
  cert_date        DATE NOT NULL,        -- date of sale
  cert_seller      TEXT NOT NULL,        -- seller's name
  warranty_title   TEXT NOT NULL         -- frozen snapshot of warranty template title
);
```

### Table: `uploads`

Files stored on disk in `uploads/` folder. This table tracks what's been uploaded.

```sql
CREATE TABLE uploads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL UNIQUE,
  purpose     TEXT NOT NULL,    -- 'logo'|'seal'|'signature'|'product_image'
  variety_id  TEXT,             -- set for product_image purpose
  uploaded_at DATETIME NOT NULL
);
```

---

## Default Seed Data (v2)

### Classes

| id | name | warranty_type |
|----|------|--------------|
| cls_shingles | NJ Premium Laminated | nj_laminated |
| cls_docke | Docke PIE | docke |
| cls_ceramic | NJ Premium Ceramic | ceramic |
| cls_stone | NJ Stone Coated Metal | stone_coated |
| cls_heatout | Heatout Insulated Ceilings | heatout |

### Varieties (confirmed from actual PDFs)

| class | name | price | unit |
|-------|------|-------|------|
| cls_shingles | Laminated Standard | 120 | sqft |
| cls_shingles | Ridge — Long Type | 165 | Rft |
| cls_stone | Stone Coated | 115 | sqft |
| cls_stone | Ridge | 160 | ft |
| cls_heatout | Veeti | 125 | sqft |

### Tools (confirmed from PDFs)

| name | price | unit |
|------|-------|------|
| Roofing Screw | 6 | nos |
| Silicone Tube | 250 | nos |
| Touch-up Kit | 0 | pcs |
| Rain Gutter | 265 | mtr |
| Inner Clamp 90° | 250 | pcs |
| Connector | 250 | pcs |
| End Drop | 250 | pcs |
| Nut and Bolt | 4 | pcs |
| Underlayment Roll | 2400 | nos |

Note: Rain Gutter, Inner Clamp, Connector, End Drop, Nut and Bolt confirmed from `quotation_1.pdf` (Stone Coated quotation).

---

---

## Top-Level Schema

```javascript
DATA = {
  company:               CompanyRecord,
  settings:              SettingsRecord,
  classes:               ClassRecord[],
  varieties:             VarietyRecord[],
  warranties:            WarrantyMap,           // object, not array
  quotations:            QuotationRecord[],
  warranty_certificates: CertificateRecord[]
}
```

---

## Table 1: `company`

**Purpose:** Company details printed on every quotation and warranty document.

```typescript
interface CompanyRecord {
  name:      string;   // "NJ INDIA TRADING PVT.LTD"
  address:   string;   // Multi-line address string
  phone:     string;   // "+91 73566 08633"
  website:   string;   // "www.njindia.in"
  logo:      string;   // base64 image OR empty string (future)
  seal:      string;   // base64 image OR empty string (future)
  signature: string;   // base64 image OR empty string (future)
}
```

**Default:**
```json
{
  "name": "NJ INDIA TRADING PVT.LTD",
  "address": "KNH Building, Neelithod Bridge, Parakkal, Bypass Road, Ramanattukara PO, Kozhikode - 673633",
  "phone": "+91 73566 08633",
  "website": "www.njindia.in",
  "logo": "",
  "seal": "",
  "signature": ""
}
```

---

## Table 2: `settings`

**Purpose:** Application-wide configuration options.

```typescript
interface SettingsRecord {
  pinEnabled:        boolean;  // Show PIN screen on open?
  pin:               string;   // "1234" (4-6 digits)
  taxEnabled:        boolean;  // Apply GST to totals?
  taxRate:           number;   // Percentage (18)
  discountEnabled:   boolean;  // Allow discount entry?
  quotationPrefix:   string;   // "NJ-Q"
  warrantyPrefix:    string;   // "NJ-W"
  termsText:         string;   // Multi-line T&C, one per line
}
```

**ID Generation Rule:**
```
quotationId = `${quotationPrefix}-${String(quotations.length + 1).padStart(4, '0')}`
              → "NJ-Q-0001", "NJ-Q-0002", ...
warrantyId  = `${warrantyPrefix}-${String(warranty_certificates.length + 1).padStart(4, '0')}`
              → "NJ-W-0001", "NJ-W-0002", ...
```

**IDs are immutable once generated.** Even if records are deleted (future feature), counter never resets.

---

## Table 3: `classes[]`

**Purpose:** Top-level product categories. 5 main classes + Tools.

```typescript
interface ClassRecord {
  id:           string;   // Stable unique ID: "cls_shingles", "cls_docke", etc.
  name:         string;   // Display name: "NJ Premium Laminated"
  subtitle:     string;   // "Asphalt Shingles"
  description:  string;   // Shown on class card and quotation product box
  warrantyType: string | null;  // FK → warranties key: "nj_laminated" | null
  color:        string;   // Hex color for SVG pattern: "#7c4a2d"
  type:         string;   // "tiles" | "tools"
}
```

**Relationships:**
- `warrantyType` → foreign key to `warranties` object key
- `id` → referenced by `varieties[].classId` and `quotations[].items[].classId`

**Default Classes:**
```json
[
  { "id": "cls_shingles", "name": "NJ Premium Laminated", "subtitle": "Asphalt Shingles", "warrantyType": "nj_laminated", "type": "tiles" },
  { "id": "cls_docke",    "name": "Docke PIE",             "subtitle": "Bitumen Shingles",  "warrantyType": "docke",        "type": "tiles" },
  { "id": "cls_ceramic",  "name": "Ceramic Roof Tiles",    "subtitle": "NJ Premium Ceramic","warrantyType": "ceramic",      "type": "tiles" },
  { "id": "cls_stone",    "name": "Stone Coated Metal",    "subtitle": "NJ Stone Coated",   "warrantyType": "stone_coated", "type": "tiles" },
  { "id": "cls_heatout",  "name": "Heatout Ceilings",      "subtitle": "Insulated Ceilings","warrantyType": "heatout",      "type": "tiles" },
  { "id": "cls_tools",    "name": "Tools & Accessories",   "subtitle": "Hardware",          "warrantyType": null,           "type": "tools" }
]
```

---

## Table 4: `varieties[]`

**Purpose:** Individual products within each class.

```typescript
interface VarietyRecord {
  id:          string;   // uid(): "v1", "v2", or random "id_abc123"
  classId:     string;   // FK → classes[].id
  name:        string;   // "Laminated Standard"
  description: string;   // "Multi-layer asphalt with mineral granules"
  basePrice:   number;   // ₹ per unit (e.g. 120)
  unit:        string;   // "sqft" | "Rft" | "nos" | "pcs" | "box" | "m2"
  image:       string;   // base64 image OR "" (empty = use SVG placeholder)
  colors:      ColorOption[];
}

interface ColorOption {
  name:   string;  // "Charcoal Black"
  hex:    string;  // "#2a2a2a"
  offset: number;  // ₹ offset from basePrice (can be negative)
}
```

**Pricing Rule:**
```
unit_price = variety.basePrice + (selectedColor?.offset ?? 0)
line_total = unit_price × quantity
```

**Default Varieties (sample):**
```json
[
  { "id": "v1", "classId": "cls_shingles", "name": "Laminated Standard", "basePrice": 120, "unit": "sqft",
    "colors": [
      { "name": "Charcoal Black", "hex": "#2a2a2a", "offset": 0 },
      { "name": "Heritage Brown", "hex": "#6b3e26", "offset": 5 }
    ]
  },
  { "id": "v2", "classId": "cls_shingles", "name": "Ridge — Long Type", "basePrice": 165, "unit": "Rft", "colors": [] }
]
```

---

## Table 5: `warranties` (Object Map)

**Purpose:** 5 warranty certificate templates, keyed by warranty type.

```typescript
type WarrantyKey = "docke" | "nj_laminated" | "ceramic" | "stone_coated" | "heatout";

interface WarrantyMap {
  [key: WarrantyKey]: WarrantyTemplate;
}

interface WarrantyTemplate {
  title:               string;     // "Docke PIE — Bitumen Shingle"
  logo:                string;     // Large header text: "Döcke"
  duration:            string;     // "10 Year Service Warranty"
  manufacturerDetails: string;     // Multi-line text (use \n)
  certifications:      string;     // Multi-line text
  productInfo:         string;     // Multi-line text
  validityConditions:  string;     // One per line → bullet list in PDF
  exclusions:          string;     // One per line → bullet list in PDF
  guarantees:          string;     // One per line → bullet list in PDF
  seriesTable:         SeriesRow[];
}

interface SeriesRow {
  series:   string;  // "PIE Classic"
  duration: string;  // "10 years"
}
```

**Special rules per warranty type:**

| Warranty | Batch Number | Special Structure |
|---------|-------------|-------------------|
| `docke` | Required | Standard |
| `nj_laminated` | Not shown | Standard |
| `ceramic` | Required | Standard |
| `stone_coated` | Not shown | Extended: remedy schedule in guarantees |
| `heatout` | Not shown | Extended: graduated liability in guarantees |

---

## Table 6: `quotations[]`

**Purpose:** Complete snapshot of every generated quotation. Immutable after creation.

```typescript
interface QuotationRecord {
  id:                  string;      // "NJ-Q-0001"
  date:                string;      // ISO 8601: "2026-05-26T10:23:14.000Z"
  customer:            CustomerSnapshot;
  items:               CartItemSnapshot[];
  subtotal:            number;      // ₹ integer
  tax:                 number;      // ₹ integer (0 if taxEnabled=false)
  taxRate:             number;      // Snapshot of rate at generation time
  total:               number;      // subtotal + tax
  warrantyTypes:       string[];    // e.g. ["nj_laminated"] or ["stone_coated", "heatout"]
  warrantiesGenerated: string[];    // IDs of generated warranties: ["NJ-W-0001"]
}

interface CustomerSnapshot {
  name:    string;
  phone:   string;
  email:   string;
  address: string;
}

interface CartItemSnapshot {
  id:        string;        // cart item uid
  varietyId: string;        // FK → varieties[].id (informational — not re-read)
  classId:   string | null; // FK → classes[].id (informational — not re-read)
  name:      string;        // Frozen: "Laminated Standard — Charcoal Black"
  unit:      string;        // Frozen: "sqft"
  price:     number;        // Frozen: unit price at generation time
  qty:       number;        // Quantity
  color:     string | null; // Hex color or null
}
```

**Critical — Snapshot Principle:**
Every field in a quotation is frozen at generation time. Future changes to `classes`, `varieties`, or `settings` do NOT affect historical quotations.

---

## Table 7: `warranty_certificates[]`

**Purpose:** Each generated warranty certificate. One record per certificate.

```typescript
interface CertificateRecord {
  id:           string;           // "NJ-W-{timestamp}-{index}"
  quotationId:  string;           // FK → quotations[].id
  warrantyNo:   string;           // Display reference: "NJ-W-{timestamp}-{index}"
  warrantyType: string;           // "nj_laminated" | "docke" | etc.
  date:         string;           // ISO 8601 timestamp
  customer:     CustomerSnapshot; // Copied from quotation at generation time
  template:     WarrantyTemplate; // Frozen snapshot of the full warranty template at generation time
  certData: {
    productName:   string;  // Product name: "Laminated Standard"
    productColor:  string;  // Colour: "Charcoal Black" or "N/A"
    siteAddress:   string;  // Installation address (from customer.address)
    purchaseDate:  string;  // Date of purchase: "27/05/2026"
    sellerName:    string;  // Seller's name: auto-filled from company or editable
    batchNo:       string;  // Batch number (or empty; required for docke/ceramic)
  };
}
```

---

## Entity Relationship Diagram

```
┌──────────────┐
│   company    │  (1 record, singleton)
└──────────────┘

┌──────────────┐
│   settings   │  (1 record, singleton)
└──────────────┘

┌──────────────┐         ┌──────────────────┐
│   classes    │◄────────│    warranties    │
│    (6)       │  1:1    │    (5 fixed)     │
└──────┬───────┘  wType  └──────────────────┘
       │                          ▲
       │ 1:N classId              │ 1:N warrantyType
       ▼                          │
┌──────────────┐         ┌────────────────────────┐
│  varieties   │         │  warranty_certificates  │
└──────┬───────┘         └────────────┬────────────┘
       │                              │
       │ used in cart items           │ N:1 quotationId
       ▼                              │
┌──────────────┐         ┌────────────▼────────────┐
│    cart      │         │      quotations          │
│ (transient)  │──────►  │                         │
└──────────────┘ gen.    └─────────────────────────┘
```

---

## Naming Conventions

| Entity | ID Format | Example |
|--------|-----------|---------|
| Class | `cls_{name}` | `cls_shingles`, `cls_docke` |
| Variety | `v{number}` or `uid()` | `v1`, `id_abc123` |
| Quotation | `{prefix}-{0000}` | `NJ-Q-0001` |
| Warranty Certificate | `{prefix}-{0000}` | `NJ-W-0001` |
| Warranty Template Key | `snake_case` | `nj_laminated`, `stone_coated` |

---

## Data Validation Rules

| Field | Rule |
|-------|------|
| `customer.name` | Required — quotation cannot generate without it |
| `customer.phone`, `email`, `address` | Optional |
| `variety.basePrice` | Must be ≥ 0 |
| `color.offset` | Can be negative (discount colour) |
| `settings.pin` | 4–6 digits if pinEnabled |
| `settings.taxRate` | 0–100 |
| `certData.sellerName` | Auto-filled from company data — editable inline on certificate |
| `certData.batchNo` | Required for `docke` and `ceramic` — filled via inline editing on certificate |

---

## Backup Format

Export JSON is the complete `DATA` object:

```json
{
  "company": { ... },
  "settings": { ... },
  "classes": [ ... ],
  "varieties": [ ... ],
  "warranties": { ... },
  "quotations": [ ... ],
  "warranty_certificates": [ ... ]
}
```

Import replaces the entire `DATA` object. No partial merge — full replace only.
