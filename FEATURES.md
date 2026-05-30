# FEATURES.md
# Complete Feature Specification

---

## Feature Categories

```
FEATURES
├── MVP (Must have for v1)
├── Core (Fully implemented)
├── Advanced (Next iteration)
└── Future (Roadmap)
```

---

## MVP Features (v1 — Core System)

### F1 — Customer Entry
- **F1.1** Four customer fields: Name (required), Phone, Email, Site Address
- **F1.2** Fields persist in memory across product selection
- **F1.3** Name syncs live to cart drawer header
- **F1.4** Fields reset only after quotation is generated and user clicks "New Quotation"
- **F1.5** Validation: customer name required before checkout can proceed
- **F1.6** Validation: customer name required before cart "Generate" button works

### F2 — Product Class Navigation
- **F2.1** Home page shows 5 product class cards in a responsive grid
- **F2.2** Each class card shows: placeholder image, class name, subtitle, description, variety count
- **F2.3** Tools & Accessories shown in a separate section below product classes
- **F2.4** Click class card → navigate to variety grid for that class

### F3 — Variety Selection
- **F3.1** Variety grid shows all varieties under selected class
- **F3.2** Each variety card shows: image, name, base price, unit
- **F3.3** Click variety → navigate to detail page

### F4 — Variety Detail Page
- **F4.1** Large placeholder image (colour-responsive)
- **F4.2** Class name, variety name, description displayed
- **F4.3** Price display: base price + selected colour offset
- **F4.4** Colour grid: clickable swatches — selects colour, updates price and image
- **F4.5** Quantity control: − input + with minimum of 1
- **F4.6** "Add to Cart" button → adds item, returns to class variety list, opens cart
- **F4.7** Back button → return to variety grid

### F5 — Tools Quick-Add Section
- **F5.1** Tools appear on home page below class cards
- **F5.2** Each tool shows: name, description, price/unit
- **F5.3** Inline quantity input (default: 1)
- **F5.4** "Add to Cart" button adds immediately without navigating away
- **F5.5** − / + buttons adjust quantity before adding

### F6 — Cart Drawer
- **F6.1** Slides in from right; accessible via top-right Cart button
- **F6.2** Badge on button shows item count (updates instantly)
- **F6.3** Shows "For: [Customer Name]" header
- **F6.4** Lists all cart items: colour indicator, name, unit price, qty controls, line total, remove
- **F6.5** Inline quantity controls (− / input / +) recalculate totals instantly
- **F6.6** Remove button deletes individual items
- **F6.7** Grand Total display (sum of all line totals — no tax applied here)
- **F6.8** "Keep Adding" → closes cart, stays on current page
- **F6.9** "Generate" → validates customer name → navigates to checkout
- **F6.10** Overlay click closes cart

### F7 — Checkout / Review Page
- **F7.1** Customer details editable at this stage (not read-only)
- **F7.2** Itemised table: SI No, Product, Qty+Unit, Rate, Total
- **F7.3** Subtotal row
- **F7.4** GST row (only if taxEnabled in settings) with rate shown
- **F7.5** Grand Total (large, prominent)
- **F7.6** "Warranties Detected" section listing each auto-detected warranty type
- **F7.7** "Back to Home" and "Generate Quotation" action buttons

### F8 — Quotation Generation
- **F8.1** Creates quotation record with sequential ID (e.g. `NJ-Q-0001`)
- **F8.2** ID format: `{quotationPrefix}-{sequenceNumber:0000}`
- **F8.3** Snapshot principle: all prices, customer details, tax rate frozen at generation time
- **F8.4** Clears cart after generation
- **F8.5** Saves to localStorage immediately
- **F8.6** Shows success toast

### F9 — Quotation Document View
- **F9.1** Renders full A4-format quotation document in browser
- **F9.2** Company header: name, address, phone, website
- **F9.3** Customer details + date + quotation ID
- **F9.4** Product class info box with image
- **F9.5** Itemised table with all products
- **F9.6** Subtotal, GST, Grand Total
- **F9.7** Terms & Conditions (from settings)
- **F9.8** Signature area (Customer + For NJ India)
- **F9.9** "New Quotation" button
- **F9.10** "Print" button (uses CSS print media query)
- **F9.11** "Download PDF" button (html2canvas + jsPDF)
- **F9.12** "Generate Warranty (N)" button — shown only if warrantyTypes detected

### F10 — PDF Download
- **F10.1** Quotation PDF: renders at 2× scale for sharpness
- **F10.2** Multi-page support: content taller than A4 auto-splits across pages
- **F10.3** Filename: `{quotationId}_{CustomerName}.pdf`
- **F10.4** Warranty PDF: same generation method, single page
- **F10.5** Filename: `{warrantyId}_{CustomerName}.pdf`
- **F10.6** Toast notifications for "Generating..." and "Downloaded"

### F11 — Warranty Generation Flow
- **F11.1** Auto-detects all unique warranty types from cart items based on class → warrantyId mapping
- **F11.2** Warranties auto-generated when quotation is generated (no separate wizard form)
- **F11.3** Auto-fills: customer name, address, product name+colour, seller name, purchase date from checkout context
- **F11.4** Batch Number field — editable inline, shown only for Docke and Ceramic types
- **F11.5** Date of Purchase — defaults to today, editable inline on the certificate
- **F11.6** Seller's Name — auto-filled from company data, editable inline
- **F11.7** Generates warranty record with ID: `{warrantyPrefix}-{timestamp-based-suffix}`
- **F11.8** Warranty certificates saved to `data.warranty_certificates[]` array
- **F11.9** Shows warranty document in Quotation Hub (warranty tab) and as standalone view
- **F11.10** "Instant Warranty" button on Checkout generates a single warranty for a specific template
- **F11.11** Toast notification shows count of warranties generated with quotation

### F12 — Warranty Document View (Numbered-Section Physical PDF Format)
- **F12.1** Brand logo in Playfair Display 36px serif, centred at top
- **F12.2** Product subtitle in uppercase dark-red (e.g. "DOCKE PIE — BITUMEN SHINGLE")
- **F12.3** "WARRANTY CERTIFICATE" banner bar with double-border top+bottom
- **F12.4** "Dear Customer" opening paragraph (italic salutation + congratulatory text)
- **F12.5** Section ❶ — Warrantor / Manufacturer Details (numbered badge, pre-formatted text)
- **F12.6** Section ❷ — Certificate Quality Compliance / Certifications (numbered badge)
- **F12.7** Warranty Duration — dark-red accent callout block (left-bordered, not numbered)
- **F12.8** Section ❸ — Product Information (paragraph for most types; bullet list for Stone Coated)
- **F12.9** Sections ❹+❺ — Two-column layout: Conditions for Warranty Validity | Warranty Exclusions
- **F12.10** Section ❻ — Guarantees / Remedies / Graduated Liability (per-template heading)
- **F12.11** Section ❼ — Warranty Period by Series (dark-header table with series + duration)
- **F12.12** Certificate Details registry: customer name, address, product+colour, batch number (Docke/Ceramic only), date of purchase, seller's name, trading organization, certificate ref. no.
- **F12.13** All Certificate Details fields are inline-editable (click to edit, blur/Enter to save) in standalone WarrantyDocument view
- **F12.14** Footer: Seller's Signature line + Authorized Stamp (circular seal: NOUFAL & JABBAR INTERNATIONAL LLP)
- **F12.15** Subtle diagonal "WARRANTY" watermark in background (3% opacity)

### F13 — Quotation History
- **F13.1** Table of all generated quotations, newest first
- **F13.2** Columns: ID, Customer, Items + warranty status, Amount, Date, Actions
- **F13.3** Warranty status badge: orange "W: 0/2" → green "W: 2/2"
- **F13.4** Search box filters by name, ID, amount (client-side, instant)
- **F13.5** "View" reopens quotation document from snapshot data
- **F13.6** Empty state with CTA

### F14 — Warranty History
- **F14.1** Table of all warranty certificates, newest first
- **F14.2** Columns: ID, Customer, Warranty Type, Date, Actions
- **F14.3** Search box filters by name, ID, type
- **F14.4** "View" reopens warranty document
- **F14.5** Empty state

### F15 — Settings: Company Tab
- **F15.1** Company Name (displayed on all documents)
- **F15.2** Full Address (multi-line)
- **F15.3** Phone number
- **F15.4** Website
- **F15.5** Save button with toast confirmation

### F16 — Settings: Products & Classes Tab
- **F16.1** List all classes with: image, name, subtitle, variety count, warranty assignment
- **F16.2** "Varieties" icon → opens variety management modal for that class
- **F16.3** "Edit" icon → edit class properties (name, subtitle, description, colour, type, warranty assignment)
- **F16.4** "Delete" icon → confirm → deletes class and all its varieties
- **F16.5** "+ Add Class" button
- **F16.6** Variety management modal: list, add, edit, delete varieties
- **F16.7** Variety edit: name, description, base price, unit, colour rows (colour picker + name + offset + remove)
- **F16.8** "+ Add Colour" adds new colour row dynamically

### F17 — Settings: Warranties Tab
- **F17.1** Lists all 5 warranty templates as clickable cards
- **F17.2** Shows: title, duration badge
- **F17.3** Edit modal: all template fields editable (title, logo, duration, manufacturer, certifications, product info, validity conditions, exclusions, guarantees, series table)
- **F17.4** Series table rows: add/remove dynamically

### F18 — Settings: Quotation Settings Tab
- **F18.1** GST/Tax toggle (on/off)
- **F18.2** Tax rate input (shown when toggled on)
- **F18.3** Discount toggle (on/off)
- **F18.4** Quotation ID Prefix input (e.g. "NJ-Q")
- **F18.5** Warranty ID Prefix input (e.g. "NJ-W")
- **F18.6** Terms & Conditions textarea (one condition per line)

### F19 — Settings: Security Tab
- **F19.1** PIN Lock toggle
- **F19.2** PIN input (4–6 digits, when enabled)
- **F19.3** Export Data → downloads full JSON backup
- **F19.4** Import Data → file picker → confirm → restore
- **F19.5** Reset Everything → double confirmation → wipes and reloads defaults
- **F19.6** Live data summary: classes / varieties / quotations / warranties count

### F20 — PIN Lock System
- **F20.1** Full-screen overlay when pinEnabled and app loads
- **F20.2** NJ India brand header, masked PIN input
- **F20.3** Enter key submits PIN
- **F20.4** Wrong PIN → toast "Wrong PIN" + input cleared
- **F20.5** Correct PIN → overlay hidden → app loads

### F21 — Toast Notifications
- **F21.1** Appears bottom-right, auto-dismisses in 2.4 seconds
- **F21.2** Used for: added to cart, quotation generated, warranty generated, saved, wrong PIN, validation errors

---

## Advanced Features (v1.5 — Next Sprint)

| Feature | Description |
|---------|-------------|
| **A1 — Image Uploads** | Upload real product images per variety; class logo, company seal, signature |
| **A2 — Discount on Checkout** | Percentage or flat amount discount before GST |
| **A3 — Customer Database** | Save customer info as reusable records; autocomplete on name |
| **A4 — Quotation Status Tracking** | Mark as: Sent / Accepted / Rejected / Converted to Sale |
| **A5 — Multi-page PDF** | Explicit repeated headers + "Page X of Y" footer for long quotations |

---

## Future Features (v2+)

| Feature | Description | Version |
|---------|-------------|---------|
| **F-V2-1** | Electron .exe packager | v2 |
| **F-V2-2** | Native file save dialogs | v2 |
| **F-V3-1** | Analytics dashboard (revenue, top products, trends) | v3 |
| **F-V3-2** | Bulk price update (% change across entire class) | v3 |
| **F-V4-1** | WhatsApp PDF sharing | v4 |
| **F-V4-2** | Multi-language: Malayalam for UI | v4 |
| **F-V5-1** | Multi-device sync (cloud backend) | v5 |
| **F-V5-2** | Quote-to-invoice conversion | v5 |

---

## Feature Priority Matrix

```
HIGH VALUE + LOW EFFORT (Do Now):
  - Image uploads (A1)
  - Discount on checkout (A2)
  - Print CSS refinements

HIGH VALUE + HIGH EFFORT (Plan):
  - Customer database (A3)
  - Electron packaging (F-V2-1)
  - Analytics dashboard (F-V3-1)

LOW VALUE + LOW EFFORT (Nice to Have):
  - Dark mode
  - Keyboard shortcuts

LOW VALUE + HIGH EFFORT (Defer):
  - Multi-language
  - Cloud sync
```
