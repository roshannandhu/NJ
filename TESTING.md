# TESTING.md
# Testing Strategy and QA Checklist

---

## 1. Testing Philosophy

This is a single-user offline tool. The testing approach prioritises:
1. **Manual functional testing** — the most effective for this project type
2. **Business rule verification** — especially warranty auto-detection and snapshot integrity
3. **Edge case coverage** — empty states, validation failures, large datasets
4. **Cross-browser testing** — Chrome, Edge, Firefox
5. **PDF output verification** — visual inspection of generated documents

Automated unit testing is possible but low-priority for v1. Test automation becomes important in v2+ when the codebase grows.

---

## 2. Pre-Release Manual Testing Checklist

### 2.1 App Launch

```
□ App opens in Chrome — no console errors
□ App opens in Edge — no console errors
□ App opens in Firefox — no console errors
□ Home page loads with class grid
□ Sidebar navigation items all visible
□ Cart button shows badge "0"
□ Fonts load correctly (Inter, Fraunces, JetBrains Mono, Playfair Display)
□ SVG placeholder images render in class cards
```

### 2.2 PIN Lock System

```
□ Settings → Security → Enable PIN
□ Close and reopen app
□ PIN overlay appears
□ Wrong PIN → toast "Wrong PIN", input cleared, app stays locked
□ Correct PIN → overlay hides, app loads
□ Press Enter on PIN input works (not just click)
□ Default PIN 1234 works
□ Changed PIN works after change
```

### 2.3 Customer Entry

```
□ Customer name field accepts text
□ Phone, email, address fields optional
□ "For: Guest" shows when name empty
□ "For: Salim P P" shows as name is typed (live sync)
□ Cart "Generate" with no name → toast + focus on name field
□ Cart "Generate" with name → proceeds to checkout
```

### 2.4 Class Navigation

```
□ All 5 product class cards visible (NJ Premium Laminated, Docke PIE, Ceramic, Stone Coated, Heatout)
□ Tools & Accessories section below product cards
□ Click class card → navigates to variety grid
□ Back button → returns to home
□ Class name shown in page header
□ Variety count in card label matches actual varieties
```

### 2.5 Tools Quick-Add

```
□ Tool name and description visible
□ Price and unit shown
□ Default qty is 1
□ − button decreases qty (min 1)
□ + button increases qty
□ Type quantity in input
□ "Add to Cart" → toast + badge increments
□ Same tool can be added multiple times with different qtys
```

### 2.6 Variety Selection

```
□ All varieties for selected class show
□ Variety name, base price, unit visible
□ Click variety → detail page
□ Back button → variety grid
□ Empty class → "No varieties yet" message
```

### 2.7 Variety Detail

```
□ Variety name, class name, description shown
□ Base price shown correctly
□ Colour swatches render (if variety has colours)
□ Click colour → swatch highlighted, price updates, image colour changes
□ Price = base + offset for colour
□ No colour section shown if variety has no colours
□ Qty input default is 1
□ − button min 1
□ + button increases
□ Manual qty entry works
□ "Add to Cart" → item added, cart drawer opens, toast shown
```

### 2.8 Cart Drawer

```
□ Cart opens via button
□ Cart opens automatically after "Add to Cart"
□ "For: [Customer Name]" header
□ Each item shows: colour circle, name, unit price, qty controls, line total, Remove
□ − / input / + controls update line total in real time
□ Grand Total updates correctly
□ "Remove" removes item, total updates
□ Empty cart shows empty state
□ "Keep Adding" closes cart
□ Overlay click closes cart
□ "Generate" with empty cart → toast "Cart is empty"
□ "Generate" with no customer name → closes + home + focus
□ "Generate" with name and items → checkout page
```

### 2.9 Checkout Page

```
□ All 4 customer fields pre-filled and editable
□ Item table shows all cart items
□ Subtotal correct
□ GST row shown only if taxEnabled
□ GST amount = subtotal × taxRate / 100 (rounded)
□ Grand Total = subtotal + tax
□ Warranties Detected section shows correct warranty types
□ No warranty section if tools-only cart
□ "Back to Home" returns without clearing cart
□ "Generate Quotation" with no name → toast + focus
□ "Generate Quotation" with name → quotation generated
```

### 2.10 Quotation Generation

```
□ Quotation ID sequential: NJ-Q-0001, NJ-Q-0002...
□ ID uses correct prefix from settings
□ Quotation saved to localStorage (inspect DevTools)
□ Cart cleared after generation (badge → 0)
□ Customer fields cleared? NO — they should reset only on explicit New Quotation
□ Quotation document rendered
□ Company header correct
□ Customer details correct
□ Date correct
□ Items table complete and correct
□ Subtotal, GST, Total correct
□ Terms & Conditions from settings shown
□ Signature lines present
□ "New Quotation" button resets app
□ "Print" triggers print dialog
□ "Download PDF" downloads correct filename
□ Warranty tab(s) appear in Quotation Hub for quotations with warranty types
□ No warranty tabs for tools-only quotation
```

### 2.11 PDF Quality (Quotation)

```
□ PDF opens successfully
□ Company name correct
□ Customer details correct
□ All products listed with correct prices and totals
□ GST calculation correct
□ Grand Total correct
□ Terms & Conditions complete
□ Professional appearance — no layout breaks
□ Text readable (not blurry)
□ For 12+ items: check if overflow handled (second page)
□ Filename: NJ-Q-0001_CustomerName.pdf
```

### 2.12 Warranty Auto-Generation

```
□ Quotation generated with warranty-eligible items → warranty certificates auto-created
□ Toast shows "Quotation & N Warranties generated!"
□ Quotation document shows warranty tabs (one per unique warranty type)
□ Warranty certificate renders numbered sections (§1–§7)
□ Customer name correct in certificate details
□ Product name + colour pre-filled from cart items
□ Seller name auto-filled from company data
□ Purchase date defaults to today's date
□ Batch number field shown for Docke/Ceramic (shows "⚠ required" if empty)
□ Batch number hidden for NJ Laminated, Stone Coated, Heatout
□ Inline editing: click seller name → editable → blur saves
□ Inline editing: click batch number → editable → blur saves
□ Inline editing: click purchase date → editable → blur saves
□ Inline editing: click site address → editable → blur saves
□ "New Order" button returns to home
```

### 2.13 Multi-Warranty Auto-Generation

```
□ Quotation with 2 product classes (e.g. Stone Coated + Heatout)
□ Checkout shows "Warranties Detected: 2"
□ "Generate Quotation" auto-creates 2 warranty certificates
□ Quotation Hub shows 3 tabs: Quotation | Stone Coated | Heatout
□ Stone Coated tab → numbered-section certificate with correct template content
□ Heatout tab → numbered-section certificate with graduated liability
□ Each warranty has its own section headings per template type:
  □ Docke/Laminated: §1 = "Warrantor"
  □ Stone Coated: §1 = "Manufacturer / Company Details"
  □ Stone Coated: §6 = "Remedy & Transferability"
  □ Heatout: §6 = "Graduated Liability Schedule & Color Warranty"
□ Both warranty certificates saved to data.warranty_certificates[]
```

### 2.14 PDF Quality (Warranty — Numbered-Section Format)

```
□ Brand logo at top in Playfair Display serif (e.g. "Döcke", "LAMINATED")
□ Product subtitle in dark-red uppercase
□ "WARRANTY CERTIFICATE" banner with double-border top+bottom
□ "Dear Customer," italic opening paragraph
□ §1: Numbered badge + Warrantor/Manufacturer heading + pre-formatted text
□ §2: Numbered badge + Certificate Quality Compliance + pre-formatted text
□ Duration callout: dark-red accent block with left border
□ §3: Numbered badge + Product Information (paragraph or bullet list)
□ §4+§5: Two-column layout: Conditions | Exclusions (both bulleted)
□ §6: Numbered badge + Guarantees/Remedies (bulleted)
□ §7: Numbered badge + Warranty Period by Series (dark-header table)
□ Certificate Details: customer name, address, product+colour, batch (Docke/Ceramic only)
□ Certificate Details: purchase date, seller's name, trading org, cert ref. no.
□ Trading org: "NOUFAL & JABBAR INTERNATIONAL LLP"
□ Signature line at bottom-left
□ Circular authorized stamp at bottom-right
□ Subtle "WARRANTY" watermark in background
□ Professional print output via @media print rules
```

### 2.15 Quotation History

```
□ History page shows all quotations (newest first)
□ Columns: ID, Customer, Items, Amount, Date, Actions
□ Warranty status badge: shows W:0/1 (orange) before warranty, W:1/1 ✓ (green) after
□ Search by name filters correctly
□ Search by ID filters correctly
□ Search by amount filters correctly
□ "View" reopens quotation document from snapshot
□ Reprinted quotation uses snapshot prices (not current prices)
□ Empty state shown when no quotations
```

### 2.16 Warranty History

```
□ History shows all certificates
□ Columns: ID, Customer, Warranty Type, Date, Actions
□ "View" reopens warranty document
□ Reprinted warranty uses certificate data (not live template data)
□ Empty state shown when no certificates
```

### 2.17 Settings — Company

```
□ All 4 fields editable
□ Save → toast confirmation
□ Changes reflected immediately in new quotations
□ Old quotations use snapshot (old company name)
```

### 2.18 Settings — Products & Classes

```
□ All 6 classes listed
□ Variety count correct per class
□ Warranty assignment shown
□ "Varieties" icon opens variety modal
□ Variety modal lists all varieties for class
□ "+ Add Variety" opens empty form
□ Add variety with colours → appears in home page
□ Edit variety → price update reflected in next quotation
□ Delete variety → removed from home grid
□ Edit class → name/subtitle/colour/warranty assignment update
□ Delete class → class + all varieties removed
□ "+ Add Class" creates new class visible on home
```

### 2.19 Settings — Warranties

```
□ All 5 warranty templates listed
□ Click card → edit modal opens
□ All fields editable
□ Validity conditions: one per line → bulleted in PDF
□ Add series table row → appears in table
□ Remove series row → removed
□ Save → changes in next warranty document
□ Old warranty certificates unaffected (snapshot)
```

### 2.20 Settings — Quotation Settings

```
□ Tax toggle works
□ Tax rate input updates calculation in next quotation
□ Discount toggle (UI toggle — functional wiring in v1.5)
□ Quotation prefix changes next generated ID
□ Warranty prefix changes next generated warranty ID
□ Terms text saved → appears in next quotation PDF
```

### 2.21 Settings — Security

```
□ PIN toggle enables PIN input
□ Change PIN → confirmed on next app load
□ Export Data → nj_backup_{date}.json downloads
□ Import Data → file picker → confirm → data restored → toast
□ Import invalid JSON → toast "Import failed", data unchanged
□ Reset Everything → double confirm → data wiped → defaults loaded
□ Data summary count accurate
```

---

## 3. Regression Testing (After Any Code Change)

Run this quick regression checklist after every code change:

```
□ App loads without errors
□ Add item to cart (from variety detail)
□ Add tool to cart (from home tools section)
□ Generate quotation
□ Download quotation PDF
□ Generate quotation with warranty-eligible items → warranties auto-generated
□ Download warranty PDF from warranty tab
□ Check quotation history shows new record
□ Check warranty history shows new record
□ View past quotation from history
□ Save in Settings → Company
```

---

## 4. Business Logic Test Cases

### Pricing Calculation

```
Test: Variety basePrice=120, colour offset=5, qty=100
Expected: unit_price = 125, line_total = 12,500

Test: Tax enabled, rate=18%, subtotal=10,000
Expected: tax = 1,800, total = 11,800

Test: Tax disabled
Expected: tax = 0, total = subtotal

Test: Multiple items
Items: [₹120 × 100 = 12,000] [₹165 × 50 = 8,250] [₹6 × 200 = 1,200]
Expected subtotal: 21,450
Expected GST (18%): 3,861
Expected total: 25,311
```

### Warranty Auto-Detection

```
Test: Cart with only Shingles items
Expected warrantyTypes: ["nj_laminated"]

Test: Cart with Shingles + Heatout
Expected warrantyTypes: ["nj_laminated", "heatout"]

Test: Cart with tools only
Expected warrantyTypes: []

Test: Cart with Docke + Ceramic + tools
Expected warrantyTypes: ["docke", "ceramic"]

Test: Cart with Stone Coated + Stone Coated (two varieties, same class)
Expected warrantyTypes: ["stone_coated"] (deduplicated)
```

### ID Sequential Generation

```
Test: 0 quotations → generate → ID = "NJ-Q-0001"
Test: 1 quotation → generate → ID = "NJ-Q-0002"
Test: 9 quotations → generate → ID = "NJ-Q-0010"
Test: 99 quotations → generate → ID = "NJ-Q-0100"

Test: Prefix "ABC" → ID = "ABC-0001"
```

### Snapshot Integrity

```
Test:
1. Add variety Laminated Standard at ₹120
2. Generate quotation with 100 sqft → total ₹12,000
3. Change Laminated Standard price to ₹150
4. View historical quotation
Expected: Still shows ₹120, total ₹12,000
```

---

## 5. Cross-Browser Testing Matrix

| Feature | Chrome 120+ | Edge 120+ | Firefox 120+ |
|---------|------------|-----------|-------------|
| App loads | ✓ | ✓ | ✓ |
| localStorage | ✓ | ✓ | ✓ |
| CSS Grid | ✓ | ✓ | ✓ |
| PDF generation | ✓ | ✓ | ✓ |
| File download | ✓ | ✓ | ✓ |
| Google Fonts | ✓ | ✓ | ✓ |
| Scrollbar styling | ✓ | ✓ | Partial |

---

## 6. Known Issues Log

| ID | Description | Status | Priority |
|----|-------------|--------|---------|
| BUG-001 | qid undefined in showWarrantyForm | Fixed (May 2026) | Critical |
| BUG-002 | JSON.stringify(q) in Next Warranty onclick | Fixed (May 2026) | High |
| BUG-003 | No customer name validation in cart Generate | Fixed (May 2026) | Medium |
| BUG-004 | Duplicate availableWarrantyTemplates in Checkout.jsx | Fixed (May 2026) | High |
| BUG-005 | &amp; HTML entity in JSX text content | Fixed (May 2026) | Medium |
| BUG-006 | Warranty CSS class name conflicts (w-* prefix) | Fixed (May 2026) | Medium |
| GAP-001 | Discount field toggle exists but not wired in checkout | Open | Medium |
| GAP-002 | No image upload for varieties | Open | Low |
| GAP-003 | PDF multi-page may clip content on very long quotations | Open | Low |
