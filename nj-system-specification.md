# NJ India — Quotation & Warranty Management System
## Complete System Specification

> **Document version:** 1.0
> **Last updated:** May 2026
> **Purpose:** A single-source-of-truth specification for the NJ India Quotation & Warranty Management Software. This document describes every screen, every flow, every data structure, and every business rule. Anyone reading this should be able to build the system from scratch.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Business Problem](#2-the-business-problem)
3. [System Goals](#3-system-goals)
4. [Glossary](#4-glossary)
5. [Architecture Overview](#5-architecture-overview)
6. [Data Model](#6-data-model)
7. [Page-by-Page Specification](#7-page-by-page-specification)
8. [Detailed User Flows](#8-detailed-user-flows)
9. [Business Rules & Logic](#9-business-rules--logic)
10. [The 5 Warranty Templates](#10-the-5-warranty-templates)
11. [The Quotation Document Format](#11-the-quotation-document-format)
12. [PDF Generation](#12-pdf-generation)
13. [Settings Module](#13-settings-module)
14. [Security & PIN Lock](#14-security--pin-lock)
15. [Data Storage & Persistence](#15-data-storage--persistence)
16. [UI/UX Design System](#16-uiux-design-system)
17. [Recommended Tech Stack](#17-recommended-tech-stack)
18. [Build Phases & Milestones](#18-build-phases--milestones)
19. [Edge Cases & Error Handling](#19-edge-cases--error-handling)
20. [Future Enhancements](#20-future-enhancements)

---

## 1. Executive Summary

The **NJ India Quotation & Warranty Management System** is a single-device, offline-first desktop application designed exclusively for internal use at NJ India Trading Pvt. Ltd., a Kerala-based home care and roofing products company.

The software replaces the company's current manual workflow — creating quotations and warranty certificates in Canva and PowerPoint — with an automated, professional, click-and-generate system. The seller selects products visually, fills in customer details, and the system generates both the quotation PDF and the appropriate warranty certificates in fixed, professional formats. All data lives locally on a single workstation.

**Core promise:** What currently takes 15–30 minutes per customer (designing in Canva, copying details, exporting) becomes a 2-minute task with consistent, professional output every time.

---

## 2. The Business Problem

### 2.1 Current Workflow (Before)

NJ India sells roofing products and home care materials. For each customer enquiry the workflow is:

1. Seller talks to customer, decides which products they need
2. Opens Canva or PowerPoint
3. Manually creates a quotation by editing a template (customer name, product lines, quantities, prices, total)
4. Exports as PDF, prints or emails to customer
5. After sale, opens another template for the appropriate warranty certificate
6. Manually fills the warranty details (customer, product, batch number, date, seller name)
7. Exports warranty PDF separately

**Pain points:**
- Slow — easily 15–30 minutes per quotation
- Inconsistent formatting between sellers
- Hard to track historical quotations or warranties
- Risk of errors: wrong product names, wrong totals, missing warranty fields
- Wrong warranty template gets used by mistake (e.g. Docke warranty for a Stone Coated sale)
- No central record of what was sold to whom

### 2.2 Product Catalogue

NJ India sells products in **5 distinct product classes**, each with multiple varieties and multiple colour options per variety, plus a **6th separate category for Tools & Accessories**:

| # | Class            | Sub-brand                  | Pricing units      | Warranty |
|---|------------------|----------------------------|--------------------|----------|
| 1 | Shingles         | NJ Premium Laminated       | sqft, Rft, nos     | NJ Laminated Warranty |
| 2 | Docke            | Docke PIE Bitumen Shingles | sqft               | Docke Warranty |
| 3 | Ceramic          | NJ Premium Ceramic Tiles   | pcs, nos           | Ceramic Warranty |
| 4 | Stone Coated     | NJ Stone Coated Metal      | sqft               | Stone Coated Warranty |
| 5 | Heatout          | Heatout Insulated Ceilings | sqft               | Heatout Warranty |
| — | Tools            | Hardware & Accessories     | nos, pcs, box      | (None) |

Within each class, multiple **varieties** exist (e.g. Docke has PIE Classic, PIE Jazz, PIE Lux). Each variety can have multiple **colours/types**, and each colour can have a `±₹` offset from the variety's base price.

### 2.3 Warranty Complexity

NJ India issues **5 different warranty certificates**, one per product class. Each warranty has its own template, its own legal text, its own series table, and its own format. The Docke warranty is from a Russian manufacturer (OOO DHS); the others are NJ India's own. The Heatout warranty has a graduated liability schedule across 25 years.

**Critical business rule:** A single sale can include products from multiple classes. If a customer buys both Stone Coated tiles AND Heatout ceiling, the seller needs to issue **two separate warranty certificates**, one per class. The system must detect this and walk the seller through generating each one.

---

## 3. System Goals

### 3.1 Primary Goals

| Goal | Description |
|------|-------------|
| **G1. Speed** | A complete quotation should take under 2 minutes from start to PDF |
| **G2. Consistency** | Every quotation and warranty must follow the exact same format |
| **G3. Zero training** | A beginner-level seller must be able to use it on day one |
| **G4. Accuracy** | Auto-calculation eliminates math errors; auto-warranty-mapping eliminates wrong-template errors |
| **G5. Offline-first** | Works on a single PC with no internet required — Kerala power/internet can be unreliable |
| **G6. History & traceability** | All past quotations and warranties searchable and reprintable |
| **G7. Full self-management** | Every product, price, colour, warranty text, and term should be editable in Settings — no developer needed for content changes |

### 3.2 Non-Goals (Out of Scope)

- Multi-user / multi-device synchronization (single workstation only)
- Customer-facing portal or website
- Inventory management (no stock tracking)
- Accounting integration (no Tally/QuickBooks export)
- Email sending (PDFs are downloaded and shared manually)
- Mobile app (desktop-only)
- Cloud backup (manual JSON export/import only)

---

## 4. Glossary

| Term | Definition |
|------|-----------|
| **Class** | Top-level product category. There are 5 classes (Shingles, Docke, Ceramic, Stone Coated, Heatout) + 1 Tools category |
| **Variety** | A specific product within a class. E.g. "PIE Classic" is a variety under the Docke class |
| **Colour / Type** | A sub-variant of a variety. E.g. PIE Classic has Red, Brown, Green options. Each colour can have a `±₹` price adjustment from the variety's base price |
| **Tool** | An accessory or hardware item (screws, silicone, touch-up kit). Stored separately from classes. No varieties, no colours |
| **Cart** | The temporary cart holding selected products before generating a quotation |
| **Quotation** | The formal price document given to a customer before sale |
| **Warranty Certificate** | The post-sale legal document covering the product. 1 page per warranty type |
| **Warranty Type** | One of 5 templates: `docke`, `nj_laminated`, `ceramic`, `stone_coated`, `heatout` |
| **Series Table** | The table inside each warranty showing each product series and its duration |
| **PIN Lock** | Optional 4-digit code required to open the app |
| **Trading Organization** | The legal LLP that signs warranties: "NOUFAL & JABBAR INTERNATIONAL LLP" |

---

## 5. Architecture Overview

### 5.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SINGLE DESKTOP APPLICATION                   │
│  ┌──────────────────────┐                                       │
│  │   Browser / Electron │                                       │
│  │  ┌────────────────┐  │   ┌─────────────────────────────┐    │
│  │  │   Frontend UI  │──┼──▶│  In-memory Application State│    │
│  │  │  (HTML/CSS/JS) │  │   │  (DATA + APP_STATE objects) │    │
│  │  └────────────────┘  │   └─────────────┬───────────────┘    │
│  │  ┌────────────────┐  │                 │                    │
│  │  │ PDF Generator  │  │                 ▼                    │
│  │  │ (jsPDF +       │  │   ┌─────────────────────────────┐    │
│  │  │  html2canvas)  │  │   │   Browser localStorage      │    │
│  │  └────────────────┘  │   │   (Persistent storage)      │    │
│  └──────────────────────┘   └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │  Downloaded PDFs │
                │  (Quotations +   │
                │   Warranties)    │
                └──────────────────┘
```

### 5.2 Layers

The application has three logical layers:

1. **Presentation Layer** — All UI rendering: sidebar, pages, modals, cart drawer, document previews. Written in vanilla HTML/CSS/JS or a framework like Vue/React.
2. **State Layer** — Two main objects in memory:
   - `DATA` — all persistent business data (classes, varieties, warranties, customers, quotations, certificates)
   - `APP_STATE` — temporary UI state (current page, expanded strip, cart contents, selected colour, etc.)
3. **Persistence Layer** — `localStorage` (or IndexedDB) under a single key (e.g. `nj_app_data_v2`). On every change, the `DATA` object is serialised to JSON and saved.

### 5.3 No Backend, No Server

The system runs entirely in the browser/Electron environment. There is no API, no database server, no authentication service. All data lives on the device. This is intentional:

- Eliminates server costs
- Works offline
- No security concerns about transmitted customer data
- Simpler to deploy (single HTML file or Electron .exe)
- No dependency on internet uptime

The trade-off: data is tied to one machine. Mitigated by manual JSON export/import for backups.

---

## 6. Data Model

### 6.1 Top-Level Data Structure

```javascript
DATA = {
  company:       { ... },           // Company info shown on docs
  settings:      { ... },           // Tax, discount, PIN, prefixes, terms
  classes:       [ ... ],           // 5 product classes
  varieties:     [ ... ],           // Varieties belonging to classes
  tools:         [ ... ],           // Tools (no class, no warranty)
  warranties:    { ... },           // 5 warranty templates keyed by warrantyType
  quotations:    [ ... ],           // All generated quotations
  warranty_certificates: [ ... ]    // All generated warranty PDFs
}
```

### 6.2 Schema: `company`

```javascript
{
  name:    "NJ INDIA TRADING PVT.LTD",
  address: "KNH Building, Neelithod Bridge, Parakkal, Bypass Road,
            Ramanattukara PO, Kozhikode - 673633",
  phone:   "+91 73566 08633",
  website: "www.njindia.in"
}
```

Used in: quotation header, warranty header.

### 6.3 Schema: `settings`

```javascript
{
  pinEnabled:        false,           // Boolean — show PIN screen on open?
  pin:               "1234",          // 4–6 digit string
  taxEnabled:        true,            // Apply GST to totals?
  taxRate:           18,              // % rate
  discountEnabled:   true,            // Allow per-quotation discount entry
  quotationPrefix:   "NJ-Q",          // Quotation ID format
  warrantyPrefix:    "NJ-W",          // Warranty ID format
  termsText:         "..."            // Multi-line T&C, one condition per line
}
```

Quotation IDs are generated as `{prefix}-{0000}` zero-padded sequentially. E.g. `NJ-Q-0001`, `NJ-Q-0002`, etc.

### 6.4 Schema: `classes[]`

```javascript
{
  id:           "cls_shingles",      // Stable unique ID
  name:         "Shingles",          // Display name
  subtitle:     "NJ Premium Laminated", // Secondary label
  description:  "35 years warranty. 10 years free service.",
  warrantyType: "nj_laminated",      // FK to warranties[] OR null
  color:        "#7c4a2d",           // Brand colour for the strip icon
  pattern:      "shingle"            // SVG pattern type: shingle|tile|stone|ceiling
}
```

- `warrantyType` is the link between a class and its warranty template. When a product from this class is in the cart, the matching warranty becomes available for generation.
- `color` and `pattern` are used to generate placeholder SVG visuals so the system works even without uploaded images.

### 6.5 Schema: `varieties[]`

```javascript
{
  id:          "v1",
  classId:     "cls_shingles",        // FK to classes
  name:        "Laminated Standard",
  description: "Multi-layer asphalt with mineral granules",
  basePrice:   120,                   // ₹ at unit
  unit:        "sqft",                // sqft|Rft|nos|pcs|box|m2
  colors:      [                      // Array — may be empty
    { name: "Charcoal",       hex: "#2a2a2a", offset: 0 },
    { name: "Heritage Brown", hex: "#6b3e26", offset: 5 },
    { name: "Forest Green",   hex: "#3d5a3d", offset: 5 }
  ]
}
```

**Pricing rule:** Final unit price = `variety.basePrice + selectedColor.offset`. If no colour is selected (variety has empty `colors[]`), price is just `basePrice`.

### 6.6 Schema: `tools[]`

```javascript
{
  id:          "t1",
  name:        "Roofing Screw",
  description: "Galvanised steel, 2 inch",
  basePrice:   6,
  unit:        "nos"
}
```

Tools are intentionally simple. No classId. No colours. No warranty assignment. They appear in a separate UI section on the home page below the class strips.

### 6.7 Schema: `warranties` (object, not array)

```javascript
warranties: {
  docke:        { ...template },
  nj_laminated: { ...template },
  ceramic:      { ...template },
  stone_coated: { ...template },
  heatout:      { ...template }
}
```

Each template:

```javascript
{
  title:               "Docke PIE — Bitumen Shingle",
  logo:                "Döcke",              // Text or image path
  duration:            "10 Year Service Warranty",
  manufacturerDetails: "OOO 'DHS' INN ...",  // Multi-line address
  certifications:      "Cert of Conformity GOST R\n...",
  productInfo:         "The roofing piece material...",
  validityConditions:  "...\n...",           // One per line
  exclusions:          "...\n...",           // One per line
  guarantees:          "...\n...",           // One per line
  seriesTable: [
    { series: "PIE Classic", duration: "10 years" },
    { series: "PIE Comfort", duration: "15 years" },
    { series: "PIE Lux",     duration: "25 years" }
  ]
}
```

Every field is editable in Settings. The warranty PDF builder reads these fields verbatim.

### 6.8 Schema: `quotations[]`

```javascript
{
  id:           "NJ-Q-0001",
  date:         "2026-05-26T10:23:14.000Z",  // ISO timestamp
  customer:     {
    name:    "Salim P P",
    phone:   "9633707686",
    email:   "salim@example.com",
    address: "Mannat, Near Federal Bank, Walkway Mahe, Pin 673310"
  },
  items: [                                    // Snapshot of cart at generation time
    {
      id:        "cart_item_xyz",
      type:      "variety",                   // "variety" | "tool"
      varietyId: "v1",                        // For variety items
      toolId:    null,                        // For tool items
      classId:   "cls_shingles",              // null for tools
      name:      "Laminated Standard — Charcoal",
      unit:      "sqft",
      price:     120,                         // ₹ per unit (incl colour offset)
      qty:       1170,
      color:     "#2a2a2a"                    // hex or null
    },
    ...
  ],
  subtotal:        140400,
  tax:             25272,                     // 0 if taxEnabled=false at time of gen
  taxRate:         18,                        // Snapshot
  total:           165672,
  warrantyTypes:   ["nj_laminated"],          // Detected from items[].classId
  warrantiesGenerated: ["NJ-W-0001"]          // IDs of generated warranties
}
```

**Snapshot principle:** When a quotation is generated, all item details, prices, and totals are **frozen** into the quotation object. Future edits to product prices in Settings do NOT change historical quotations.

### 6.9 Schema: `warranty_certificates[]`

```javascript
{
  id:            "NJ-W-0001",
  quotationId:   "NJ-Q-0001",          // Link back to source quotation
  warrantyType:  "nj_laminated",
  date:          "2026-05-26T10:24:30.000Z",
  customer:      { name, phone, email, address },
  certData: {
    address: "Full installation address",
    product: "Laminated Standard — Charcoal",
    batch:   "BTH-2026-0457",           // Optional, only for Docke and Ceramic
    date:    "2026-05-26",              // Date of sale (user-editable)
    seller:  "Ramshad"
  },
  title:         "NJ Laminated — Asphalt Shingle"  // Snapshot of warranty title
}
```

### 6.10 Entity Relationships

```
       ┌────────────┐
       │  classes   │ ◀──────────┐
       └─────┬──────┘            │
             │ 1:N               │ 1:1
             ▼                   │
       ┌────────────┐      ┌──────────────┐
       │ varieties  │      │  warranties  │ (5 fixed)
       └─────┬──────┘      └──────────────┘
             │                   ▲
             │                   │ 1:N
             │                   │
             ▼ used in           │
       ┌────────────┐            │
       │  cart      │            │
       │ (transient)│            │
       └─────┬──────┘            │
             │                   │
             │ generates         │
             ▼                   │
       ┌────────────┐            │
       │ quotations │            │
       └─────┬──────┘            │
             │ generates 0-N     │
             ▼                   │
  ┌──────────────────────┐       │
  │ warranty_certificates│───────┘
  └──────────────────────┘

  ┌────────────┐
  │   tools    │  (standalone, no class, no warranty)
  └────────────┘
```

---

## 7. Page-by-Page Specification

The application has **5 main pages**, navigable from a left sidebar:

| Page | Purpose | Path |
|------|---------|------|
| Home | Build a quotation (browse products, add to cart) | `/home` |
| Quotation History | Search and reprint past quotations | `/quotations` |
| Warranty History | Search and reprint past warranty certificates | `/warranties` |
| Settings | Configure all data (classes, varieties, warranties, etc.) | `/settings` |
| _(Modal)_ Variety Detail | Slides in from right when a variety is clicked | (overlay) |
| _(Modal)_ Cart Drawer | Slides in from right when cart is opened | (overlay) |
| _(Modal)_ Checkout/Review | Before quotation is generated | (full page) |
| _(Modal)_ Warranty Form | One per warranty type | (full page) |
| _(Modal)_ Document Preview | Generated quotation or warranty PDF preview | (full page) |

### 7.1 Sidebar (Always Visible)

The sidebar is dark charcoal (`#1c1917`) with warm muted text. It contains:

```
┌─────────────────────┐
│  [NJ]  NJ India     │   Brand area
│        HOME CARE    │
├─────────────────────┤
│  MAIN               │   Section label
│  • Home             │
│  + New Quotation    │
│                     │
│  RECORDS            │   Section label
│  • Quotation Hist.  │
│  • Warranty Hist.   │
│                     │
│  SYSTEM             │   Section label
│  • Settings         │
├─────────────────────┤
│  NJ India Trading   │   Footer
│  Ramanattukara,     │
│  Kozhikode          │
└─────────────────────┘
```

The active page has an orange left-border indicator and slightly elevated background.

### 7.2 Topbar (Always Visible)

Shows current page title + subtitle on the left, and the **Cart button** on the right. The cart button shows a badge with the count of items currently in the cart.

### 7.3 Home Page

The most important page. Has 3 sections stacked vertically:

#### 7.3.1 Customer Card (top)

A horizontal white card with 4 input fields:

- **Customer Name** (required)
- **Phone** (optional)
- **Email** (optional)
- **Site Address** (optional)

Has a person-icon on the left in an orange-tinted circle. A thin orange-to-gold gradient bar runs down the left edge.

These fields auto-sync to `APP_STATE.customer` on every keystroke. They do NOT persist to localStorage until a quotation is generated.

#### 7.3.2 Product Class Strips

Below the customer card, a section labelled **"Product Classes"**.

5 horizontal strips, one per class (Shingles, Ceramic, Stone Coated, Heatout, Docke). Each strip is a clickable card showing:

```
┌─────────────────────────────────────────────────────────────┐
│ [pattern  ]  Class Name                  [3 varieties]  ▼   │
│ [icon img ]  Sub-brand                                      │
└─────────────────────────────────────────────────────────────┘
```

**Behaviour:**
- Click the strip head → it expands smoothly (max-height transition, 0.4s)
- Only one strip can be expanded at a time. Opening a second strip closes the first.
- When expanded, the strip shows a border in accent orange with a soft glow ring.
- The chevron rotates 180° and turns orange.
- The count badge turns solid orange.
- Inside the expanded strip, variety cards slide in with a staggered animation (each card 40ms after the previous).
- The expanded strip scrolls into view automatically after a short delay.

**Variety cards inside the strip:**

```
┌──────────────────┐
│                  │
│   [SVG image]    │  120px high, with gradient overlay
│                  │
├──────────────────┤
│ Variety Name     │
│ ₹120 /sqft   +Add│  Price + hover hint
└──────────────────┘
```

Click any variety → opens the **Variety Detail Panel** (slides in from right).

#### 7.3.3 Tools & Accessories Section

Below the strips, a separate section labelled **"Tools & Accessories"**.

A single white card containing a grid of small tool cards. Each tool card has:

- A small icon (wrench/screwdriver)
- Tool name + description
- Price + unit
- A quantity input (default 1) + an "Add to Cart" button

Clicking "Add to Cart" immediately adds the tool with the chosen quantity. No detail panel, no colours, no extra steps. This is intentional — tools should be fast to add.

### 7.4 Variety Detail Panel (Side Drawer)

Slides in from the right (420px wide) when a variety is clicked. Has:

- A large image preview (220px)
- Class name (orange uppercase label)
- Variety name (large, bold)
- Description text
- Price box with large bold price + unit
- **Colours grid** — clickable swatches. Click changes the preview image colour and updates the price (base + offset).
- **Quantity selector** with − / number / +
- "Add to Cart" button at the bottom (full width, dark, hovers to orange)

When added, the panel closes and the cart drawer opens automatically with a toast confirmation.

### 7.5 Cart Drawer (Side Drawer)

Slides in from the right (420px wide). Always accessible from the top-right cart button.

**Structure:**

```
┌────────────────────────────────────┐
│  Your Cart                      ×  │
│  For: Salim P P                    │
├────────────────────────────────────┤
│  [img] Laminated Std — Charcoal    │
│        ₹120/sqft                   │
│        [− 1170 +]      ₹1,40,400 × │
├────────────────────────────────────┤
│  [img] Ridge Long Type             │
│        ₹165/Rft                    │
│        [− 48 +]          ₹7,920 ×  │
├────────────────────────────────────┤
│  ... (more items) ...              │
├────────────────────────────────────┤
│  GRAND TOTAL          ₹1,65,672    │
│                                    │
│  [Keep Adding]    [Generate    ]   │
└────────────────────────────────────┘
```

**Behaviours:**
- Each item shows: color swatch image, name, unit price, quantity controls, line total, remove button.
- Quantity controls (`− input +`) instantly recalculate the total.
- The "×" remove button removes that single line.
- "Keep Adding" closes the drawer, leaves the cart intact, and returns to whatever page was open.
- "Generate" moves to the **Checkout/Review** page (only if customer name is filled — otherwise a toast prompts to enter it).

### 7.6 Checkout / Review Page

Full-page screen reached by clicking "Generate" in the cart. Shows:

1. **Customer summary** — name + contact details (read-only at this point; edit must happen on Home)
2. **Itemised table** with all cart items (SI No, Product, Qty + unit, Rate, Line Total)
3. **Subtotal + GST + Grand Total**
4. **Warranties Detected** — a small section listing each unique warranty type implied by the items. E.g.:
   ```
   Warranties Detected (2):
   • Stone Coated   →  NJ Stone Coated Roof Tiles  [10yr/50yr]
   • Heatout        →  Heatout Ceilings            [25yr]
   ```
5. **Back** and **Generate Quotation** buttons at the bottom

### 7.7 Generated Quotation View

After clicking "Generate Quotation":
- A new quotation record is created and saved to localStorage
- The cart is cleared
- The user is shown the **finished quotation document** rendered in the exact NJ India format (see §11)
- Action buttons at top: **New Quotation**, **Print**, **Download PDF**, **Generate Warranty (N)** if applicable

### 7.8 Warranty Generation Flow

Warranties are **auto-generated** alongside the quotation. When the user clicks "Generate Quotation":

1. The system detects all unique warranty types from the cart items (via class → warrantyId mapping)
2. For each warranty type, a certificate record is created with:
   - Customer details (name, phone, email, address) from the checkout form
   - Product name & colour from the first matching item in that warranty class
   - Seller's name (from company data, editable inline)
   - Date of purchase (defaults to today, editable inline)
   - Batch number (empty for Docke/Ceramic — must be filled via inline editing)
3. All warranty certificates are saved to `data.warranty_certificates[]`
4. The quotation document view shows tabs for each warranty alongside the quotation tab
5. Each warranty certificate renders in **numbered-section format** (§1–§7) matching physical PDFs:
   - §1: Warrantor / Manufacturer Details
   - §2: Certificate Quality Compliance
   - Duration callout block
   - §3: Product Information
   - §4 + §5: Conditions + Exclusions (two-column)
   - §6: Guarantees / Remedies
   - §7: Warranty Period by Series (table)
   - Certificate Details registry (inline-editable)
   - Footer with signature + authorized stamp
6. Certificate details (batch number, seller name, etc.) can be edited directly on the document via click-to-edit fields
7. Each warranty can be printed or downloaded as a separate PDF

### 7.9 Quotation History Page

A searchable table of all generated quotations. Columns:

| ID | Customer | Items | Amount | Date | Actions |
|----|----------|-------|--------|------|---------|

The "Items" column also shows warranty status: `Warranty: 1/2` (in progress) or `Warranty: 2/2 ✓` (complete) or empty (no warranties needed).

Clicking "View" on any row reopens the quotation document for reprinting/downloading.

A search box at the top filters by name, ID, or amount.

### 7.10 Warranty History Page

A searchable table of all generated warranty certificates. Columns:

| ID | Customer | Warranty Type | Date | Actions |
|----|----------|---------------|------|---------|

Clicking "View" reopens the warranty document.

### 7.11 Settings Page

A tabbed interface with 6 tabs. See [§13. Settings Module](#13-settings-module).

---

## 8. Detailed User Flows

### 8.1 Flow A — Single-Class Quotation + Warranty

The most common case. Example: customer buys only Shingles.

1. User opens app (Home page loads)
2. User types "Salim P P" in Customer Name, optionally fills phone/address
3. User clicks the **Shingles** strip → it expands, showing varieties
4. User clicks **Laminated Standard** variety → detail panel slides in
5. User picks **Charcoal** colour swatch (price stays at ₹120/sqft, offset 0)
6. User enters quantity **1170**
7. User clicks **Add to Cart** → panel closes, cart opens automatically with item
8. User clicks **Shingles** strip again → expands → adds **Ridge Long Type** at 48 Rft
9. User scrolls to Tools section, finds **Roofing Screw**, types **800**, clicks Add
10. User adds **Silicone Tube × 4** and **Touch-up Kit × 1** the same way
11. User opens cart, reviews items, clicks **Generate**
12. Checkout page shows: 5 items, subtotal ₹1,54,120, GST ₹27,742, total ₹1,81,862. Warranties Detected: **1 — NJ Laminated**.
13. User clicks **Generate Quotation** → quotation `NJ-Q-0001` saved + warranty auto-generated
14. Quotation document view opens with tabs: **Quotation** | **NJ Laminated**
15. User clicks **Download PDF** on quotation → file `NJ-Q-0001_Salim_P_P.pdf` downloads
16. User clicks **NJ Laminated** tab → warranty certificate renders with numbered sections
17. User reviews certificate, clicks batch number to edit if needed
18. User clicks **Download PDF** on warranty → warranty PDF downloads
19. User clicks **New Order** → returns to Home, ready for next customer

**Total time:** ~90 seconds for a typical sale.

**Key design change:** No separate warranty wizard form. Warranties auto-generate with the quotation. Edits happen inline on the certificate itself.

### 8.2 Flow B — Multi-Class Quotation + Multiple Warranties

Example: customer buys both Stone Coated tiles AND Heatout ceilings.

Steps 1–11 are similar, but the cart ends up with items from **2 different classes**.

12. Checkout shows: Warranties Detected: **2 — NJ Stone Coated + Heatout**.
13. User clicks **Generate Quotation** → quotation saved + 2 warranties auto-generated.
14. Quotation document opens with tabs: **Quotation** | **Stone Coated** | **Heatout**
15. User clicks **Stone Coated** tab → numbered-section certificate renders (§1 Manufacturer → §7 Series Table)
16. User edits batch number inline (Docke/Ceramic). Downloads PDF.
17. User clicks **Heatout** tab → Heatout certificate with graduated liability schedule renders.
18. User downloads Heatout warranty PDF.
19. User clicks **New Order** → ready for next customer.

**Critical:** Each warranty is a separate document/tab and a separate PDF. The system never combines them — they are legally separate documents.

### 8.3 Flow C — Reprint a Past Quotation

1. User clicks **Quotation History** in sidebar
2. Searches "Salim" in the search box → row filters to matching quotations
3. Clicks **View** on `NJ-Q-0001`
4. The original quotation renders exactly as it did when generated (snapshot data)
5. User clicks **Download PDF** to regenerate the PDF and reshare

### 8.4 Flow D — Edit a Product's Price

1. User clicks **Settings** → **Classes & Varieties** tab
2. Sees the list of 5 classes. Clicks the **Varieties** icon on "Stone Coated"
3. Modal opens listing all varieties under that class
4. User clicks the **Edit** pencil on "Milano Profile"
5. Edit modal opens. User changes Base Price from ₹230 to ₹245. Clicks Save.
6. Modal closes. New price is saved.
7. Next time a quotation is generated, Milano Profile will use ₹245.
8. **Important:** Past quotations still show the old ₹230 because of snapshot principle (see §6.8).

### 8.5 Flow E — Add a New Variety with Colours

1. Settings → Classes & Varieties → click Varieties icon on "Ceramic"
2. Click **+ Add Variety**
3. Fill: Name = "Spanish Curve", Description, Base Price = 105, Unit = pcs
4. Click **+ Add Colour** three times. For each row, pick a swatch colour, name it, set offset (e.g. +₹8 for premium colours).
5. Click **Save**. New variety appears in the list.
6. New variety is now visible in the Ceramic strip on the home page.

### 8.6 Flow F — Edit a Warranty Template

1. Settings → **Warranties** tab → click on "NJ Stone Coated Roof Tiles"
2. Edit modal opens with all fields: title, logo (image upload or text fallback), duration, manufacturer details, certifications, product info, validity conditions (multi-line, one per line), exclusions, guarantees, series table.
3. User edits, say, the exclusions text — adds a new line.
4. Click Save.
5. From now on, all newly generated Stone Coated warranties use the updated text. Past warranties keep their original text (since they're rendered from saved certificate data).

### 8.7 Flow G — Backup & Restore

1. User opens Settings → **Security** tab
2. Clicks **Export Data** → JSON file `nj_backup_2026-05-26.json` downloads
3. (Months later, after machine failure or migration)
4. On new machine, opens app, goes to Settings → Security
5. Clicks **Import Data**, picks the backup JSON
6. Confirms replacement → all data restored

### 8.8 Flow H — Enable PIN Lock

1. Settings → Security → toggle **Enable PIN** on
2. PIN input appears showing current PIN (default `1234`). User changes to `7886`.
3. User closes the app
4. Next open → PIN screen appears first. User types `7886`, presses Enter.
5. App unlocks.

---

## 9. Business Rules & Logic

### 9.1 Pricing Calculation

```
For each cart item:
  unit_price = variety.basePrice + selectedColor.offset (or 0 for tools)
  line_total = unit_price × quantity

subtotal = sum of all line_totals
tax      = round(subtotal × taxRate / 100)   // only if taxEnabled
total    = subtotal + tax
```

Rounding: All currency values are rounded to nearest integer rupee when displayed and stored in the final quotation.

### 9.10 Product-Class-Specific Terms & Conditions

**Critical discovery from actual PDFs:** Terms & Conditions are NOT uniform across all product classes. Each class uses its own T&C set. The app must support per-class terms, not a single global terms field.

**Class 1 — NJ Premium Laminated (Shingles):**
- Payment 50% advance, 50% at delivery
- Installation starts ONLY after 100% payment received
- Quantity is approximate
- Rates include GST, transportation, and installation
- Transport subject to vehicle arrival at site
- Verify shingles box count at unloading — subsequent complaints not accepted
- Surface for shingle fixing must be smooth, bone dry, clean, uniform base plaster
- Recommended: install bitumen membrane on fiber cement board before shingles
- Used material quantity based on shingle box count

**Class 2 — NJ Stone Coated Metal:**
- Delivery within 60 working days from confirmation of order
- Payment 50% advance, 50% before dispatch of materials
- Transportation at customer's cost; unloading by customer's workers
- Quote valid only for 20 days
- Prices include GST
- Product notes: 1 tile = 6 sqft, 1 bundle = 12 tiles = 72 sqft; Ridge = 6.6 rft; Valley = 6.6 rft
- For overlapping: +15% extra for shingles pattern; +20% extra for shake pattern

**Class 3 — Heatout Insulated Ceilings:**
- Payment 30% advance, 60% at time of materials at site, remaining after completion of work
- Scaffolding/crane: if required for installation, client provides or rental charged at actuals
- Client provides safe and secure storage place on site
- Customer responsible for free and safe working environment
- Labour union issues/costs under customer scope
- MS Section, structure, or additional work charged to client at actual cost
- Extra aluminium channel approximately measured
- Square footage calculated based on materials usage

**Implication for the app (React+FastAPI build):** Each product class record must have its own `termsText` field. The quotation builder must render the terms from the class(es) in the cart, not from a global settings field. If cart has items from multiple classes, each class's terms are shown under a labelled section.

### 9.2 Warranty Auto-Detection

When the user clicks Generate, the system computes the set of warranty types needed:

```javascript
warrantyTypes = [...new Set(
  cart
    .filter(item => item.classId !== null)              // exclude tools
    .map(item => classes.find(c => c.id === item.classId).warrantyType)
    .filter(wt => wt !== null)                          // exclude classes without warranty
)]
```

Result is an array of unique warranty type keys, in deterministic order (first occurrence in cart). E.g. `["stone_coated", "heatout"]`.

The user then walks through them in order.

### 9.3 ID Generation

```
quotationId = "{quotationPrefix}-{sequenceNumber:0000}"
              where sequenceNumber = total existing quotations + 1

warrantyId  = "{warrantyPrefix}-{sequenceNumber:0000}"
              where sequenceNumber = total existing warranties + 1
```

IDs are immutable once generated. Even after deletion (if ever implemented), the next ID continues from the highest seen number.

### 9.4 Snapshot Principle (Critical)

Every quotation and every warranty certificate stores a **complete snapshot** of all relevant data at the moment of generation:

- Customer name, phone, email, address — frozen
- Each line item: name, price, quantity, unit — frozen
- Tax rate, totals — frozen
- Warranty title — frozen (so renaming the warranty in Settings later doesn't change old certificates)

Reprinting a past document uses ONLY the data inside the document record. It does NOT re-read from `classes` or `varieties` or current `settings`.

This guarantees that **a quotation given to a customer in 2025 will print identically in 2027**, even after products, prices, and warranty terms have changed many times.

### 9.5 Mandatory vs Optional Fields

| Field | Required? |
|-------|-----------|
| Customer Name | YES — quotation cannot be generated without it |
| Customer Phone/Email/Address | Optional |
| Cart must have ≥1 item | YES |
| Warranty: Customer Name | Auto-filled, editable, required |
| Warranty: Customer Address | Optional |
| Warranty: Product Name & Colour | Auto-filled, editable |
| Warranty: Batch Number | Required ONLY for Docke and Ceramic |
| Warranty: Date of Sale | Defaults to today, required |
| Warranty: Seller's Name | Required |

### 9.6 Strip Expansion Rule

Only one class strip can be expanded at a time. Opening strip B automatically collapses strip A. Clicking an already-open strip's header collapses it.

This is intentional to keep the home page uncluttered and focused.

### 9.7 Cart Persistence

The cart contents persist in memory while the user navigates within the app. They are **cleared automatically** the moment a quotation is generated. They are **NOT** saved to localStorage — refreshing the browser clears the cart. This prevents stale carts from previous sessions.

### 9.8 Customer Field Sync

The customer fields on the Home page are bound to `APP_STATE.customer` and synced to the cart drawer's "For:" label in real time. They reset only when the user explicitly navigates to **New Quotation** after a successful generation.

### 9.9 Toast Messages

Short, non-blocking confirmations appear at the bottom-center for ~2.2 seconds for:
- Item added to cart
- Quotation generated
- Warranty generated
- Saved (settings)
- Wrong PIN
- Customer name required

---

## 10. The 5 Warranty Templates

Each warranty is a 1-page A4 PDF with a strict structure. All 5 follow the same skeleton but with different content.

### 10.1 Common Structure (every warranty)

```
┌────────────────────────────────────────────────────┐
│                    [Brand Logo]                    │  Centred, large
│                Product Sub-Title                   │  Smaller, uppercase
├────────────────────────────────────────────────────┤
│              WARRANTY CERTIFICATE                  │  Top + bottom border
├────────────────────────────────────────────────────┤
│ Dear Customer,                                     │
│ Congratulations on your purchase. ...              │
├────────────────────────────────────────────────────┤
│ MANUFACTURER / COMPANY DETAILS                     │
│ ...                                                │
├────────────────────────────────────────────────────┤
│ CERTIFICATIONS                                     │
│ ...                                                │
├────────────────────────────────────────────────────┤
│ WARRANTY DURATION                                  │
│ 10 Year Service Warranty                           │
├────────────────────────────────────────────────────┤
│ PRODUCT INFORMATION                                │
│ ...                                                │
├────────────────────────────────────────────────────┤
│ CONDITIONS FOR WARRANTY VALIDITY                   │
│ • ...  • ...  • ...                                │
├────────────────────────────────────────────────────┤
│ WARRANTY EXCLUSIONS                                │
│ • ...  • ...                                       │
├────────────────────────────────────────────────────┤
│ MANUFACTURER GUARANTEES                            │
│ • ...                                              │
├────────────────────────────────────────────────────┤
│ WARRANTY PERIOD TABLE                              │
│ ┌──────────────┬──────────────┐                   │
│ │ Series       │ Duration     │                   │
│ ├──────────────┼──────────────┤                   │
│ │ ...          │ ...          │                   │
│ └──────────────┴──────────────┘                   │
├────────────────────────────────────────────────────┤
│ CERTIFICATE DETAILS                                │
│   Customer Name        : ...                       │
│   Address              : ...                       │
│   Product & Colour     : ...                       │
│   Batch Number         : ... (Docke/Ceramic only) │
│   Date of Purchase     : 26/05/2026                │
│   Seller's Name        : ...                       │
│   Trading Organization : NOUFAL & JABBAR ...       │
│   Certificate Ref      : NJ-W-0001                 │
├────────────────────────────────────────────────────┤
│  ────────────              [ SEAL ]                │
│  Seller's Signature       Authorized Stamp         │
└────────────────────────────────────────────────────┘
```

### 10.2 Template 1 — Docke PIE (Bitumen Shingle)

- **Manufacturer:** OOO "DHS" INN 7713741050, Russia, Vladimir Region
- **Duration:** 10 Year Service Warranty
- **Certifications:** GOST R, Fire Safety, DoP
- **Special:** Batch Number is mandatory
- **Series table:** PIE Classic (10yr), PIE Comfort (15yr), PIE Lux (25yr)

### 10.3 Template 2 — NJ Laminated (Asphalt Shingle)

- **Manufacturer:** NJ India Trading Pvt. Ltd.
- **Duration:** 10 Year Service Warranty
- **Certifications:** GOST R, Fire Safety, DoP, EN 544:2011
- **Series table:** NJ Premium 35 (35yr), NJ Standard (20yr)

### 10.4 Template 3 — NJ Ceramic Roof Tiles

- **Manufacturer:** NJ INDIA, KNH Building, Calicut
- **Duration:** As per Series Table
- **Certifications:** ISO 9001:2015, ISO 14001:2015, CE
- **Special:** Batch Number is mandatory
- **Series table:** Mediterranean (15yr), Flat Premium (20yr)

### 10.5 Template 4 — NJ Stone Coated Roof Tiles

The most complex warranty. Has additional sections:
- **Duration:** 10 Year Service + 50 Year Rust Warranty
- **Specifically Warrants section** — 4 explicit guarantees (surface coating, 120mph wind, no warp, 2.5" hailstone resistance)
- **Remedy section** — different remedies for years 1–10 vs years 11–50
- **Transfer clause** — warranty transfers to subsequent property owners
- **Series table:** Milano, Romana, Bond — all 10yr service / 50yr rust

### 10.6 Template 5 — Heatout Ceilings

- **Duration:** 25 Year Graduated Liability Schedule
- **Unique structure:** Liability decreases over time:
  - Years 0–10: 100% liability
  - Years 10–12: 50%
  - Years 12–18: 40%
  - Years 18–20: 30%
  - Years 20–21: 20%
  - Years 21–25: 10%
- **Color Warranty:** 10 years interior / 5 years exterior
- **Claim procedure:** Specific 14-day response + 60-day fulfilment commitment

---

## 11. The Quotation Document Format

A multi-row A4 document with the exact structure currently produced manually in Canva.

```
═══════════════════════════════════════════════════════════════
                NJ INDIA TRADING PVT.LTD
   KNH Building, Neelithod Bridge, Parakkal, Bypass Road
                Ramanattukara PO, Kozhikode - 673633
                       Ph: +91 73566 08633
                          www.njindia.in
═══════════════════════════════════════════════════════════════

Quotation To: Salim P P                    Date: 26/05/2026
   Mannat, Near Federal Bank, Mahe            Ref: NJ-Q-0001
   Ph: 9633707686

         ━━━━━━━━━━ PRODUCT DETAILS ━━━━━━━━━━

┌─────────────────────────────────────┬──────────────┐
│ NJ Premium Laminated                │              │
│ 35 years warranty.                  │   [IMAGE]    │
│ 10 years free service.              │              │
└─────────────────────────────────────┴──────────────┘

┌─────┬────────────────────┬──────────┬─────────┬───────────┐
│ SI  │ PRODUCT            │ QUANTITY │ PRICE/U │   TOTAL   │
├─────┼────────────────────┼──────────┼─────────┼───────────┤
│  1  │ Laminated Standard │ 1170 sqft│   ₹120  │ ₹1,40,400 │
│     │ — Charcoal         │          │         │           │
│  2  │ Ridge Long Type    │ 48 Rft   │   ₹165  │ ₹7,920    │
│  3  │ Roofing Screw      │ 800 nos  │   ₹6    │ ₹4,800    │
│  4  │ Silicone Tube       │ 4 nos    │   ₹250  │ ₹1,000    │
│  5  │ Touch-up Kit        │ 1 pcs    │   ₹800  │ ₹800      │
└─────┴────────────────────┴──────────┴─────────┴───────────┘

                              Subtotal: ₹1,54,920
                              GST 18% :   ₹27,886
                       ┌─────────────────────────────┐
                       │   TOTAL    ₹1,82,806        │
                       └─────────────────────────────┘

──────────── TERMS & CONDITIONS ─────────────────────
• Payment 50% advance along with the confirmed order.
  Balance 50% at the time of delivery of materials.
• Shingles installation can be started only after 100%
  of total amount is received.
• ... (all conditions from settings.termsText)

────────────────              ────────────────
CUSTOMER                       FOR NJ INDIA
Acceptance & Signature         Authorised Signatory
```

### 11.1 Layout Specifications

- **Page:** A4 portrait, 794px wide at standard DPI
- **Font:** Times New Roman (serif)
- **Margins:** ~45px top/bottom, 55px left/right
- **Colour:** Body text `#1a1a1a` on white. Headers have dark background with white text.
- **Logo area:** Supports both uploaded logo images (base64) and text logo fallback.
- **Table header row:** Dark background `#1a1a1a`, white text, small caps
- **Total box:** Dark `#1a1a1a` background, white text, larger font for amount

### 11.2 Layout Rules

- If product image upload exists for the class, render it in the right-side product info box. If not, render a placeholder SVG pattern.
- Up to ~12 line items fit on one page comfortably; beyond that, items overflow to a second page (the PDF generator handles this with `addPage()`).
- Terms & Conditions can wrap to multiple lines per bullet; if total content exceeds the page, allow a second page.

---

## 12. PDF Generation

### 12.1 Technology

PDFs are generated client-side using:

- **html2canvas** — renders the HTML document preview to a high-resolution `<canvas>`
- **jsPDF** — wraps the canvas into a PDF document

Process:

```javascript
// 1. Take the rendered document HTML
const docEl = document.getElementById('quotationDoc');

// 2. Render to canvas at 2× scale for sharpness
const canvas = await html2canvas(docEl, {
  scale: 2,
  useCORS: true,
  backgroundColor: '#fff'
});

// 3. Convert canvas to image data
const imgData = canvas.toDataURL('image/png');

// 4. Create A4 PDF
const pdf = new jsPDF('p', 'mm', 'a4');
const pdfWidth = pdf.internal.pageSize.getWidth();    // 210mm
const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

// 5. If content is taller than 1 page, split across pages
let position = 0, heightLeft = pdfHeight;
pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
heightLeft -= pdf.internal.pageSize.getHeight();
while (heightLeft > 0) {
  position -= pdf.internal.pageSize.getHeight();
  pdf.addPage();
  pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
  heightLeft -= pdf.internal.pageSize.getHeight();
}

// 6. Save
pdf.save(`${quotation.id}_${customer.name.replace(/\s+/g, '_')}.pdf`);
```

### 12.2 Filename Convention

- Quotation: `NJ-Q-0001_Salim_P_P.pdf`
- Warranty:  `NJ-W-0001_Salim_P_P.pdf`

Spaces in the customer name are replaced with underscores. Special characters are stripped.

### 12.3 Print vs Download

Both options exist:
- **Print** triggers `window.print()`. The CSS `@media print` rules hide the sidebar, topbar, and modals so only the document is printed.
- **Download** generates a PDF file.

---

## 13. Settings Module

Settings has **6 tabs**:

### 13.1 Tab 1 — Company

Edit:
- Company name
- Full address (multi-line textarea)
- Phone
- Website

These appear on every quotation header and (some) warranty footer.

### 13.2 Tab 2 — Classes & Varieties

Lists all 5 classes (plus any custom ones added) as rows. Each row shows:
- Class icon (SVG pattern)
- Name + subtitle + variety count + warranty assignment

Row actions:
- **Varieties icon** — opens a modal listing all varieties under this class. From there, the user can Add / Edit / Delete varieties.
- **Edit icon** — edit the class itself (name, subtitle, description, brand colour, pattern, warranty assignment).
- **Delete icon** — delete the class AND all its varieties. Confirmation prompt.

#### Class Edit Modal Fields:
- Class Name (required)
- Subtitle
- Description (textarea)
- Brand Colour (HTML color picker)
- Visual Pattern (dropdown: shingle / tile / stone / ceiling)
- Assigned Warranty (dropdown: 5 warranty types + "No warranty")

#### Variety Edit Modal Fields:
- Variety Name (required)
- Description (textarea)
- Base Price ₹
- Pricing Unit (dropdown: sqft / Rft / nos / pcs / box / m²)
- Colours grid — each row: colour picker + name + offset ₹ + remove button. "+ Add Colour" button below.

### 13.3 Tab 3 — Tools

A separate tab because tools are not under any class. List of all tool items with Add / Edit / Delete actions.

#### Tool Edit Modal Fields:
- Tool Name (required)
- Description
- Base Price ₹
- Pricing Unit (dropdown: nos / pcs / box / sqft / Rft)

### 13.4 Tab 4 — Warranties

Lists all 5 warranty templates. Each is a clickable row showing:
- Brand logo letter avatar (using the class colour)
- Title + duration
- Linked class indicator (e.g. "Linked to Stone Coated" or red "Not linked to any class")

Clicking a row opens the full edit modal.

#### Warranty Edit Modal Fields (all editable):
- Title
- Brand / Logo Image Upload (or text fallback)
- Warranty Duration
- Manufacturer / Company Details (textarea)
- Certifications (textarea)
- Product Information (textarea)
- Validity Conditions (textarea, one per line → renders as bulleted list in PDF)
- Exclusions (textarea, one per line)
- Manufacturer Guarantees (textarea, one per line)
- Warranty Period Table — Series + Duration rows, add/remove

### 13.5 Tab 5 — Quotation

Settings related to quotation generation:

- **Tax & Discount:**
  - Toggle: GST/Tax on/off
  - If on: Tax Rate (%) input
  - Toggle: Discount on/off
- **Numbering:**
  - Quotation ID Prefix (e.g. "NJ-Q")
  - Warranty ID Prefix (e.g. "NJ-W")
- **Terms & Conditions:** Large multi-line textarea. One condition per line. These appear on every quotation document.

### 13.6 Tab 6 — Security

- **PIN Lock:**
  - Toggle: Enable PIN
  - If on: PIN input field (4–6 digits, type=password)
- **Data Management:**
  - **Export Data** button → downloads full DATA as JSON
  - **Import Data** button → file picker → confirms before replacing
  - **Reset Everything** button (red) → double confirmation → wipes localStorage and reloads defaults
- **Current data summary:** Live count of classes / varieties / tools / quotations / warranties

---

## 14. Security & PIN Lock

### 14.1 PIN Lock Flow

When `DATA.settings.pinEnabled === true`:

1. On app load, show full-screen overlay (`pin-overlay`) covering the entire app
2. Display NJ logo + "Enter PIN to continue" + masked input
3. User types PIN. Press Enter or click Unlock.
4. If PIN matches `DATA.settings.pin`, hide overlay and proceed to Home.
5. If wrong, clear input, show toast "Wrong PIN".

### 14.2 Limitations

This is **device-level access control**, not encryption. Data on disk (localStorage) is still plaintext JSON. The PIN's purpose is to prevent casual access by walk-by people, not to protect from forensic data extraction.

For genuine security, an Electron-wrapped version could encrypt the localStorage payload using a key derived from the PIN.

### 14.3 PIN Reset

If the user forgets the PIN, the only recovery is to clear browser localStorage manually (DevTools → Application → Local Storage → delete key). This wipes all data. There is no "Forgot PIN" link by design — this is a single-user device.

---

## 15. Data Storage & Persistence

### 15.1 Storage Mechanism

All persistent data is stored under a single localStorage key:

```
Key:   "nj_app_data_v2"
Value: JSON.stringify(DATA)
```

Why a versioned key (`v2`): allows future schema migrations without breaking on old saved data.

### 15.2 Save Triggers

`saveData()` is called immediately after every mutation:
- Adding/editing/deleting a class
- Adding/editing/deleting a variety
- Adding/editing/deleting a tool
- Editing a warranty template
- Toggling tax/discount/PIN
- Changing terms text
- Generating a quotation
- Generating a warranty

### 15.3 Storage Limits

`localStorage` has a ~5 MB cap per origin in most browsers. Given typical NJ India usage (~100 quotations per month, each ~5 KB serialised), this provides at least 8 years of storage before any limit becomes a concern.

If storage approaches the limit, the system could migrate to IndexedDB transparently (same key/value model, much larger capacity).

### 15.4 Export Format

The export is a complete JSON dump of the `DATA` object — every class, variety, warranty template, quotation, and certificate. This file is portable: imported on another device, the app is fully restored.

### 15.5 Import Behaviour

Import:
1. Parses the JSON
2. Shows a confirm dialog: "Replace current data with imported data?"
3. On Yes, replaces `DATA` entirely and saves
4. Re-renders the current page

There is currently no merge mode (only full replace). If two devices have been used in parallel and both have new quotations, merging requires a manual operation outside the app.

---

## 16. UI/UX Design System

### 16.1 Design Philosophy

**Premium, warm, professional.** Not corporate-cold. Not Silicon Valley. Echoes of high-end Kerala home-care brand sensibility: warm cream backgrounds, dark charcoal sidebar, accents of burnt terracotta orange and gold. Restrained typography. Generous whitespace.

### 16.2 Colour Palette

| Variable | Hex | Use |
|----------|-----|-----|
| `--bg` | `#f7f5f2` | Main background (warm off-white) |
| `--bg-white` | `#ffffff` | Cards and surfaces |
| `--bg-soft` | `#f0ede8` | Subtle dividers, hover backgrounds |
| `--ink` | `#1c1917` | Primary text (deep charcoal) |
| `--ink-mid` | `#57534e` | Secondary text |
| `--ink-soft` | `#a8a29e` | Tertiary text, labels |
| `--line` | `#e7e2db` | Borders |
| `--line-strong` | `#d6cfc6` | Stronger borders |
| `--accent` | `#c2410c` | Primary accent (burnt terracotta) |
| `--accent-light` | `#fff7ed` | Accent backgrounds |
| `--accent-mid` | `#ea580c` | Hover state |
| `--gold` | `#b45309` | Gradient companion to accent |
| `--success` | `#16a34a` | Success indicators |
| `--danger` | `#dc2626` | Errors, delete buttons |
| `--sidebar-bg` | `#1c1917` | Sidebar dark background |
| `--sidebar-text` | `#e7e2db` | Sidebar light text |
| `--sidebar-soft` | `#78716c` | Sidebar muted text |

### 16.3 Typography

- **Body font:** Inter (300, 400, 500, 600, 700)
- **Mono font:** JetBrains Mono (for IDs and timestamps)
- **Sizes:**
  - Page titles: 18px / weight 600
  - Section titles: 15px / weight 600
  - Body: 13–14px / weight 400
  - Labels: 10–11px / weight 600 / uppercase / letter-spacing 0.1em
  - Document body (quotation/warranty): Times New Roman, serif

### 16.4 Border Radius

- Pills/badges: 100px
- Buttons, inputs: 8–10px
- Cards: 10–16px
- Modals: 20px

### 16.5 Shadow System

| Token | Use |
|-------|-----|
| `--shadow-sm` | Cards at rest |
| `--shadow` | Hover state on cards |
| `--shadow-md` | Modals, popovers, cart drawer |
| `--shadow-lg` | Side panels, top-most layers |

### 16.6 Animation

All animations use `cubic-bezier(0.4, 0, 0.2, 1)` for natural motion.

- Strip expansion: 0.4s max-height transition
- Variety boxes: staggered slideIn (40ms delay each)
- Drawers: 0.34s slide-in from right
- Modal: 0.25s fade-in
- Hover: 0.15–0.2s transitions
- Toast: 0.28s fade and lift

### 16.7 Responsive Considerations

Primary target is desktop (1280px+). The app is designed for a single workstation screen. Tablet/mobile responsiveness is a secondary concern — the strip-based layout would degrade reasonably well to tablet but is not a priority.

---

## 17. Recommended Tech Stack

### 17.1 Option A — Single HTML File (current implementation)

**Stack:**
- Vanilla HTML + CSS + JavaScript
- `jsPDF` + `html2canvas` for PDF generation
- localStorage for persistence

**Pros:**
- Zero install / zero setup — double-click HTML file to run
- No build step
- Works on any modern browser
- Easy to share via email or USB

**Cons:**
- No package management for libraries (must use CDN or inline)
- File can grow large (~130 KB at current state — still fine)
- Not a "real desktop app" — runs in browser

### 17.2 Option B — Electron Wrapper

**Stack:**
- Same HTML/CSS/JS core
- Electron wraps it as a desktop `.exe` / `.dmg` / `.AppImage`

**Pros:**
- Looks and feels like a real desktop application
- Can be installed via standard installers
- File system access (better for export/import)
- Custom window chrome, system tray, etc.

**Cons:**
- Build step required (electron-builder)
- ~100 MB installer size

### 17.3 Option C — Modern Framework (Vue/React + Vite)

**Stack:**
- Vue 3 or React 18 with TypeScript
- Vite for dev server / build
- Pinia or Redux for state management
- Same PDF libs

**Pros:**
- Better code organization for large feature sets
- Type safety
- Easier testing
- Component reuse

**Cons:**
- Build step required
- More complex setup for non-developer maintainers

### 17.4 Option D — React + FastAPI (CHOSEN — v2 rebuild)

**Stack:**
- **Frontend:** React 18 (Vite) — replaces vanilla HTML/CSS/JS
- **Backend:** FastAPI (Python) + SQLite — runs locally on `localhost:8000`
- **PDF Generation:** WeasyPrint or reportlab (server-side, proper vector PDF)
- **Images:** Real file uploads stored in `uploads/` folder

**Why this is better than vanilla HTML:**

| Concern | Vanilla (html2canvas) | React + FastAPI |
|---|---|---|
| PDF output | Screenshot of HTML — not selectable text | True vector PDF — selectable, smaller files, print-perfect |
| Images | SVG placeholders only | Real file uploads (logo, seal, signature, product photos) |
| Data storage | localStorage — wiped by browser cache clear | SQLite file — backup = copy one `.db` file |
| Maintainability | 3200-line single file | Separate React components + FastAPI routes |
| Product-class T&C | Single global field | Per-class `termsText` field in SQLite |

**Deployment on NJ India PC:**
```
npm run build  →  React static files in dist/
FastAPI        →  serves dist/ as static files + /api/* routes
uvicorn        →  one Python process on localhost:8000
Seller         →  bookmarks localhost:8000 in Chrome
```

**Optional .exe paths:**
- PyInstaller — bundle FastAPI + React build into single `.exe`
- Electron wrapper — most native desktop feel

### 17.5 Recommendation (Updated May 2026)

**Option D (React + FastAPI)** is the chosen path. The vanilla HTML prototype (`nj-system-v3.html`) served as a working proof-of-concept and is now reference-only. The React + FastAPI rebuild is the production target.

### 17.6 Required Libraries (React + FastAPI build)

**Frontend (npm):**
- `react`, `react-dom` — UI
- `vite` — build tool
- `react-router-dom` — routing
- `axios` or `fetch` — API calls

**Backend (pip):**
- `fastapi` — API framework
- `uvicorn` — ASGI server
- `sqlalchemy` — ORM
- `weasyprint` or `reportlab` — server-side PDF generation
- `python-multipart` — file uploads
- `pillow` — image processing

---

## 18. Build Phases & Milestones

A 5-phase incremental build plan, each phase usable on its own.

### Phase 1 — Settings & Data Engine (Week 1)
- Set up project (HTML/JS/CSS or framework)
- Build `DATA` schema and `localStorage` persistence
- Build Settings page: Company, Classes & Varieties, Tools, Warranties (5 templates with default content), Quotation Settings, Security
- Pre-seed default data for 5 classes, sample varieties, sample tools, 5 warranty templates with NJ-supplied text
- **Deliverable:** A working settings interface. No quotation flow yet, but all configuration possible.

### Phase 2 — Home Page & Cart (Week 2)
- Sidebar + topbar layout
- Customer card (top of home)
- Class strips with expansion animation
- Variety grid inside strips
- Variety detail slide-in panel
- Tools section with quick-add
- Cart drawer with quantity controls and totals
- **Deliverable:** Full product browsing and cart flow. No quotation output yet.

### Phase 3 — Quotation Generation (Week 3)
- Checkout / Review page
- Quotation document rendering (HTML version)
- PDF generation via html2canvas + jsPDF
- Quotation History page with search
- Reopen + reprint past quotations
- **Deliverable:** End-to-end quotation creation, save, and reprint.

### Phase 4 — Warranty System (Week 4)
- Warranty type auto-detection from cart
- Warranty form flow (one per detected type)
- Progress bar across multiple warranties
- Warranty document rendering
- Warranty PDF generation
- Warranty History page
- **Deliverable:** Complete warranty workflow with multi-warranty support.

### Phase 5 — Polish & Edge Cases (Week 5)
- PIN lock implementation
- Export / Import data
- Reset Everything
- Toast notifications throughout
- All keyboard shortcuts (Enter on PIN, Esc to close modals)
- Empty states for all lists
- Loading states
- Error handling for malformed imports
- Print CSS
- Final UI polish, animations, accessibility checks
- **Deliverable:** Production-ready release.

### Optional Phase 6 — Electron Packaging
- Wrap in Electron
- Build installers for Windows/macOS
- Auto-update mechanism
- Code signing
- Distribution

---

## 19. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| User clicks Generate with empty cart | Toast: "Cart is empty" |
| User clicks Generate with no customer name | Toast: "Customer name required" + focus on the name field |
| User imports invalid JSON | Toast: "Import failed" |
| Variety has no colours array | Detail panel hides the colours section, price stays at base |
| Class has no varieties | Strip body shows "No varieties yet — add some in Settings" |
| Class has no warranty assigned | Items from that class don't trigger warranty generation |
| Tools-only quotation (no class items) | Quotation generates fine. Zero warranties detected. No warranty button shown. |
| Two varieties have the same name | Allowed — they're distinguished by ID internally |
| User tries to delete a class that has past quotations referencing it | Allowed (the quotation snapshot doesn't depend on the class still existing). New quotations just won't show the deleted class. |
| Storage quota exceeded | Browser throws; we should catch and show "Storage full — please export and reset" |
| PDF generation fails (memory issue with very long quotations) | Catch and show toast: "PDF generation failed. Try fewer items or use Print." |
| User refreshes mid-flow (e.g. between adding to cart and generating) | Cart is lost; customer fields are lost. Acceptable for a single-session tool. |
| User exports backup, then keeps using the app, then re-imports an older backup | New data is overwritten. Confirmation dialog warns first. |
| Network outage during use | No impact — fully offline. CDN-loaded jsPDF/html2canvas must be cached; for production, bundle them locally. |
| PIN is set but user clears localStorage | App reloads with defaults (no PIN). This is acceptable — local data is gone anyway. |

---

## 20. Future Enhancements

Items not in v1, ranked by likely value:

### High Value
1. **Image uploads** — supports real image uploads for warranty logos, seal, and signatures stored as base64. Variety image uploads are planned next.
2. **Multi-page quotation overflow** — explicit handling for quotations with >12 line items, including repeating headers and "Page X of Y" footers.
3. **Discount field on quotation** — currently discount toggle exists in settings but the discount input on the checkout page isn't fully wired. Add %/flat discount input on checkout that subtracts from subtotal before tax.
4. **Customer database** — save customer contact info as reusable records. Autocomplete on customer name from past entries.
5. **Quotation status tracking** — mark quotations as Sent / Accepted / Rejected / Converted to Sale.

### Medium Value
6. **Bulk price update** — apply a % change across an entire class or all products.
7. **Quote-to-invoice conversion** — if NJ India later wants to track sales (not just quotes), the same items could be converted to a sale invoice.
8. **WhatsApp / Email send** — direct share of generated PDF from the app (would require internet and breaks offline-first principle — only optional).
9. **Multi-language support** — Malayalam version for sellers, English for documents.
10. **Audit log** — record every settings change with timestamp.

### Low Value (Nice-to-have)
11. **Dark mode** — for evening use.
12. **Custom themes per Trading Organization** — if NJ India ever has multiple trading entities with different brand colours.
13. **Analytics dashboard** — total revenue, top products, monthly trends.
14. **Multi-currency** — for export sales.

---

## Appendix A — Default Seed Data

The application ships with the following default data so it's immediately usable on first launch.

### Default Classes (5)
1. Shingles — NJ Premium Laminated — warranty: `nj_laminated`
2. Ceramic — NJ Premium Ceramic Tiles — warranty: `ceramic`
3. Stone Coated — NJ Stone Coated Metal — warranty: `stone_coated`
4. Heatout — Insulated Ceilings — warranty: `heatout`
5. Docke — Docke PIE Bitumen Shingles — warranty: `docke`

### Default Varieties (sample)
- Shingles: Laminated Standard (₹120/sqft), Ridge Long Type (₹165/Rft)
- Docke: PIE Classic (₹145/sqft), PIE Jazz (₹175/sqft)
- Ceramic: Mediterranean Curve (₹95/pcs), Flat Premium (₹110/pcs)
- Stone Coated: Milano (₹230/sqft), Romana (₹245/sqft)
- Heatout: Veeti Panel (₹165/sqft)

### Default Tools (4)
- Roofing Screw — ₹6/nos
- Silicone Tube — ₹250/nos
- Touch-up Kit — ₹800/pcs
- Underlayment Roll — ₹2400/nos

### Default Settings
- Tax: ON, 18% GST
- Discount: ON (but no value, manual entry per quote)
- PIN: OFF (default `1234` if enabled)
- Quotation Prefix: `NJ-Q`
- Warranty Prefix: `NJ-W`
- Terms: 9 standard NJ India conditions pre-loaded

### Default Warranty Templates
All 5 templates are pre-filled with the exact legal text supplied by NJ India (as in the original PDF warranties they were creating manually).

---

## Appendix B — File Structure (if building from scratch)

```
nj-system/
├── index.html                  # Main entry point
├── assets/
│   ├── fonts/                  # Inter, JetBrains Mono (optional local copy)
│   └── icons/                  # SVG icon library
├── css/
│   ├── variables.css           # Design tokens
│   ├── layout.css              # Sidebar, topbar, content
│   ├── components.css          # Buttons, inputs, cards
│   ├── home.css                # Class strips, variety boxes, tools
│   ├── cart.css                # Cart drawer
│   ├── detail.css              # Variety detail panel
│   ├── modal.css               # Modals and overlays
│   ├── settings.css            # Settings tabs and sections
│   ├── document.css            # Quotation and warranty PDF styles
│   └── print.css               # Print-specific overrides
├── js/
│   ├── data.js                 # DATA schema and defaults
│   ├── state.js                # APP_STATE management
│   ├── storage.js              # localStorage save/load
│   ├── pages/
│   │   ├── home.js
│   │   ├── quotations.js
│   │   ├── warranties.js
│   │   └── settings.js
│   ├── cart.js
│   ├── detail-panel.js
│   ├── modal.js
│   ├── pdf.js                  # PDF generation
│   ├── utils.js                # Helpers (formatINR, escapeHTML, uid)
│   └── main.js                 # Init + routing
└── libs/                       # Or use CDN
    ├── jspdf.umd.min.js
    └── html2canvas.min.js
```

(Note: the current shipped version is a single `index.html` with everything inlined, for portability. The above is the recommended structure if growing the codebase.)

---

## Appendix C — Key Function Reference

The current implementation exposes these top-level functions (all global for simplicity):

| Function | Purpose |
|----------|---------|
| `loadData()` | Read DATA from localStorage or load defaults |
| `saveData()` | Persist DATA to localStorage |
| `navigate(page)` | Switch top-level page |
| `renderHome()` | Build the home page DOM |
| `renderQuotationHistory()` | Build quotation history table |
| `renderWarrantyHistory()` | Build warranty history table |
| `renderSettings()` | Build the settings tabs |
| `toggleStrip(classId)` | Expand/collapse a class strip |
| `openVariety(varietyId)` | Open the variety detail panel |
| `selectColor(idx)` | Pick a colour in detail panel |
| `addToCartFromDetail()` | Add the selected variety+colour+qty to cart |
| `addToolToCart(toolId)` | Quick-add a tool |
| `openCart()` / `closeCart()` | Toggle cart drawer |
| `renderCart()` | Build cart drawer contents |
| `goToCheckout()` | Move to checkout page |
| `generateQuotation()` | Create quotation record + show document |
| `showQuotationDoc(q)` | Render a quotation document |
| `downloadQuotationPDF(qid)` | Generate PDF for quotation |
| `startWarrantyGeneration(qid)` | Begin warranty wizard |
| `showWarrantyForm(qid, idx)` | Show form for warranty N of M |
| `finishWarrantyForm(qid, idx)` | Save warranty record |
| `showWarrantyDoc(cert, qid, idx)` | Render warranty document |
| `downloadWarrantyPDF(wid)` | Generate PDF for warranty |
| `editClass(classId)` / `deleteClass(classId)` | Manage classes |
| `manageVarieties(classId)` | List varieties for a class |
| `editVariety(classId, vid)` / `deleteVariety(vid)` | Manage varieties |
| `editTool(toolId)` / `deleteTool(toolId)` | Manage tools |
| `editWarranty(key)` | Edit warranty template |
| `exportData()` / `importData(file)` / `resetData()` | Backup operations |
| `checkPin()` | PIN unlock |
| `toast(msg)` | Show a toast notification |

---

## Appendix D — Contact / Ownership

**Software is for:** NJ India Trading Pvt. Ltd.
**Address:** KNH Building, Neelithod Bridge, Parakkal, Bypass Road, Ramanattukara PO, Kozhikode — 673633
**Phone:** +91 73566 08633
**Website:** www.njindia.in
**Trading Organization (for warranties):** NOUFAL & JABBAR INTERNATIONAL LLP

---

---

## Appendix E — Real Data from Actual PDFs (Source of Truth)

This appendix captures the exact data extracted from actual NJ India PDF documents (`Warranty.pdf`, `Warranty_2.pdf`, `quotation_1.pdf`, `quotation_2.pdf`, `quotation_3.pdf`). Where this conflicts with earlier sections, **this appendix takes precedence** — it is ground truth from real issued documents.

### E.1 Company Phone Numbers (Multiple)

Three different phone numbers appear on actual quotations. These are likely per-product-line WhatsApp/sales numbers:

| Used on | Phone Number |
|---------|-------------|
| NJ Laminated / Shingles quotations | +91 73566 08633 |
| Stone Coated quotations | +91 81389 23033 |
| Heatout Ceiling quotations | +91 80894 75333 |

**Implication:** The company settings should store multiple contact numbers, and the quotation template should print the number matching the product class in the cart — or the seller selects which number to print.

### E.2 Confirmed Pricing from Issued Quotations

These are prices actually charged in real quotations (may change over time — stored in Settings):

**NJ Premium Laminated (Shingles) — from `quotation_3.pdf`:**
| Product | Unit | Price |
|---------|------|-------|
| Shingles (Laminated Standard) | sqft | ₹120 |
| Ridge — Long type | Rft | ₹165 |
| Roofing Screw | nos | ₹6 |
| Silicone Tube | nos | ₹250 |
| Touch-up Kit | pcs | (no charge — included) |

**Stone Coated Metal — from `quotation_1.pdf`:**
| Product | Unit | Price |
|---------|------|-------|
| Stone coated tile | sqft | ₹115 |
| Ridge | ft | ₹160 |
| Screw | pc | ₹6 |
| Rain gutter | mtr | ₹265 |
| Inner clamp 90 degree | pcs | ₹250 |
| Connector | pcs | ₹250 |
| End drop | pcs | ₹250 |
| Silicone | pcs | ₹300 |
| Nut and bolt | pcs | ₹4 |

Note: Stone coated price in spec (₹230–245) reflects a different variety/profile. ₹115/sqft is the base stone coated tile price seen in actual quotation.

**Heatout Ceilings — from `quotation_2.pdf`:**
| Product | Unit | Price |
|---------|------|-------|
| NJ Premium Ceiling | sqft | ₹125 |

### E.3 Stone Coated Accessories (Missing from main spec)

Stone coated quotations include accessories not listed in the main product catalogue. These must be added as default tools or class-specific accessories:

- **Rain Gutter** — sold by metre (mtr), ₹265/mtr
- **Inner Clamp 90 degree** — pcs, ₹250/pcs
- **Connector** — pcs, ₹250/pcs
- **End Drop** — pcs, ₹250/pcs
- **Nut and Bolt** — pcs, ₹4/pcs

### E.4 Stone Coated Product Technical Notes

From actual quotation (`quotation_1.pdf`), to be shown in the product info box on quotations:
```
One Bundle : 72 sq/ft
           : 12 Tiles
Ridge      : 6.6 RFT per tile
Valley     : 6.6 RFT per tile
50 years Warranty, 10 years free service

For overlapping: add 15% extra for shingles pattern
                 add 20% extra for shake pattern
```

### E.5 Confirmed Warranty Certificate Fields (from PDFs)

**NJ Laminated Warranty (`Warranty.pdf` page 1):**
- Certificate fields: Address, Product Name & Color, Date, Seller's Name & Signature
- No Batch Number field
- Trading Organization: NOUFAL & JABBAR INTERNATIONAL LLP (pre-printed)
- Company seal: Circular stamp — NOUFAL & JABBAR INTERNATIONAL LLP, NJINDIA.IN, Bypass Road Ramanattukara

**NJ Stone Coated Warranty (`Warranty.pdf` page 2):**
- Certificate fields: Address, Product Name (complete including color), Date, Seller's Name & Signature
- No Batch Number field
- Trading Organization: NOUFAL & JABBAR INTERNATIONAL LLP (pre-printed)

**Docke PIE Warranty (`Warranty.pdf` page 3):**
- Certificate fields: Address, Product Name & Color, **Batch Number** (required), Date, Seller's Name & Signature
- Has Döcke manufacturer logo (not NJ logo) at top
- Manufacturer: OOO'DHS"INN, Tax ID 7713741050, Russia, Vladimir Region, Kirzhachsky District, Fedorovskoe Village, Selskya Street, 51/1

**NJ Ceramic Warranty (`Warranty.pdf` page 4):**
- Certificate fields: Address, Product Name (complete including color), **Batch Number** (required), Trading Organization, Date, Seller's Name & Signature
- Template has date "20/19/2025" which is a typo (month 19 is impossible) — app must allow date override
- Certifications: ISO 9001:2015, ISO 14001:2015, CE
- Address: KNH Building, Near Neelithod Bridge, NH66 Service Road, Ramanattukara, Calicut – Kerala 673633

**Heatout Warranty (`Warranty_2.pdf`):**
- Certificate fields: Address, Product Name (complete including color), Date, Seller's Name & Signature
- NO batch number
- Graduated liability schedule (confirmed): 0–10yr 100%, 10–12yr 50%, 12–18yr 40%, 18–20yr 30%, 20–21yr 20%, 21–25yr 10%
- Color warranty: 10 years (exterior color: 5 years)
- Example filled certificate (actual issued document):
  - Customer: Salim P P, "Mannat" Near Federal Bank, Walkway Mahe, Ph: 9633707686, Pin 673310
  - Product: **veeti** (confirmed real Heatout product name)
  - Date: 23/5/2026
  - Seller: RAMSHAD

### E.6 Confirmed Real Heatout Product Name

From the filled warranty in `Warranty_2.pdf`: the product sold was **"veeti"**. This is a confirmed real variety name under the Heatout class. It must be in the seed data.

Confirmed seed data for Heatout:
- Variety name: **Veeti** (₹125/sqft based on `quotation_2.pdf`)

### E.7 Quotation Validity

From Stone Coated quotation: *"This quote is valid only for 20 days."*  
This was not in the main spec. Quotation validity period should be configurable per class or globally in settings.

---

*End of specification.*
