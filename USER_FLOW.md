# USER_FLOW.md
# All User Journeys and Navigation Flows

---

## Navigation Map

```
                    ┌──────────────┐
                    │  PIN SCREEN  │ (if pinEnabled)
                    └──────┬───────┘
                           │ Correct PIN
                           ▼
┌──────────────────────────────────────────────────────────┐
│                      SIDEBAR (Always Visible)            │
│  Home  |  Quotation History  |  Warranty History  |  Settings │
└────────────────────────────┬─────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │                             │
         ┌────▼────┐                  ┌────▼────┐
         │  HOME   │                  │SETTINGS │
         └────┬────┘                  └─────────┘
              │
    ┌─────────┼──────────────┐
    │         │              │
┌───▼───┐ ┌──▼──┐     ┌─────▼─────┐
│ Class │ │Tools│     │   Cart    │
│  Grid │ │ Add │     │  Drawer   │
└───┬───┘ └─────┘     └─────┬─────┘
    │                        │
┌───▼───────┐          ┌─────▼──────┐
│ Varieties │          │  Checkout  │
│   Grid    │          │   Page     │
└───┬───────┘          └─────┬──────┘
    │                        │
┌───▼───────┐          ┌─────▼──────────┐
│  Variety  │          │  Quotation Doc │
│  Detail   │          │   + PDF        │
└───────────┘          └─────┬──────────┘
                             │ (if warranties)
                        ┌────▼───────────┐
                        │ Warranty Form  │
                        │ (1 per type)   │
                        └────┬───────────┘
                             │
                        ┌────▼───────────┐
                        │ Warranty Doc   │
                        │   + PDF        │
                        └────────────────┘
```

---

## Flow A — Primary Flow: Single-Class Quotation + Warranty

**Most common daily scenario. Customer buys Shingles only.**

```
Step  Action                              State After
────  ──────────────────────────────────  ──────────────────────────────
1     App opens (no PIN)                  Home page loads
2     Type "Salim P P" in Customer Name   APP_STATE.customer.name = "Salim P P"
3     Type "9633707686" in Phone          APP_STATE.customer.phone set
4     Type site address                   APP_STATE.customer.address set
5     Click "NJ Premium Laminated" card   Navigate to variety grid
6     Click "Laminated Standard" variety  Navigate to variety detail page
7     Click "Charcoal Black" swatch       selectedColor = Charcoal, price = ₹120
8     Type "1170" in Qty                  qtyInput.value = 1170
9     Click "Add to Cart"                 Item added, cart drawer opens
10    Click "Keep Adding" (close cart)    Back at variety grid
11    Click class card → variety → detail Add "Ridge Long Type" 48 Rft
12    Add to Cart                         Cart now has 2 items
13    Go to Home → Tools section          Tools quick-add visible
14    Type "800" → Click "Add" (Screws)   Tool added to cart
15    Add Silicone Tube × 4, Touch-up × 1  Cart now has 5 items
16    Click Cart button                   Cart drawer opens
17    Review: 5 items, Total ₹1,54,920    All items confirmed
18    Click "Generate"                     → Checkout page (name validated)
19    Checkout: GST shown, W Detected: 1  Review complete
20    Click "Generate Quotation"           NJ-Q-0001 saved + NJ-W-XXXX-1 auto-generated
21    Quotation document view shows        Two tabs: Quotation | Warranty (1)
22    Click "Warranty" tab                 Warranty certificate renders (numbered sections)
23    Review certificate: batch no empty   Click batch number → type "BATCH-2026-001"
24    Click "Download PDF" on warranty     NJ_Warranty_NJ-W-XXXX-1_Salim_P_P.pdf saved
25    Click "New Order"                    Home resets, ready for next customer
```

**Total time: ~90 seconds**

**Key change from v1:** No separate warranty wizard form. Warranties are auto-generated with the quotation. Certificate details (batch number, seller name, etc.) are edited directly on the warranty document via click-to-edit fields.

---

## Flow B — Multi-Class Quotation + Multiple Warranties

**Customer buys Stone Coated tiles AND Heatout ceilings.**

```
Steps 1-15: Same product selection (items from cls_stone + cls_heatout)
Step 16: Cart shows items from 2 classes
Step 17: Click Generate → Checkout
Step 18: "Warranties Detected: 2 — Stone Coated + Heatout"
Step 19: Click "Generate Quotation" → NJ-Q-0002 saved

WARRANTY AUTO-GENERATION:
Step 20: Click "Generate Quotation"
         NJ-Q-0002 saved + 2 warranties auto-generated (NJ-W-XXXX-1, NJ-W-XXXX-2)
         Toast: "Quotation & 2 Warranties generated!"
Step 21: Quotation document opens with tabs: Quotation | Stone Coated | Heatout
Step 22: Click "Stone Coated" tab → Numbered-section certificate renders
         Review all sections (§1 Manufacturer → §7 Series Table)
         Edit batch number if needed (click → type → blur to save)
Step 23: Click "Heatout" tab → Heatout certificate with graduated liability schedule
Step 24: Click "Print" or "Download PDF" for each warranty
Step 25: Click "New Order" to reset
```

**Critical:** Each warranty is a separate document/tab. The user can also navigate to the standalone WarrantyDocument view for inline editing.

---

## Flow C — Reprint Past Quotation

```
1. Click "Quotation History" in sidebar
2. Search "Salim" in search box
3. Row filtered to matching quotations
4. Row shows: NJ-Q-0001 | Salim P P | 5 items W:1/1 ✓ | ₹1,82,806 | 26/05/2026
5. Click "View" → Quotation document renders (from snapshot)
6. Click "Download PDF" → Re-generates PDF from snapshot data
```

**Snapshot guarantee:** Document looks identical to original even if prices have changed since.

---

## Flow D — Edit Product Price

```
1. Click "Settings" → "Products & Classes" tab
2. Find class row (e.g. Stone Coated)
3. Click Varieties icon → Modal opens listing all varieties
4. Click Edit on "Milano Profile"
5. Change Base Price from ₹230 to ₹245
6. Click Save → Modal confirms update
7. Toast: "Variety updated"
8. Next quotation uses new ₹245 price
9. Past quotation NJ-Q-0002 still shows ₹230 (snapshot)
```

---

## Flow E — Add New Variety with Colours

```
1. Settings → Products & Classes → Varieties icon on "Ceramic"
2. Click "+ Add Variety"
3. Fill:
   Name: "Spanish Curve"
   Description: "Traditional Spanish style ceramic"
   Base Price: 105
   Unit: pcs
4. Click "+ Add Colour" three times:
   - Terracotta (#c46e3a) — offset: 0
   - Antique White (#e8d8b8) — offset: +8
   - Aged Brown (#6b3e26) — offset: +5
5. Click "Save"
6. Variety appears in list
7. Visible on Home → Ceramic → Variety Grid
```

---

## Flow F — Edit Warranty Template

```
1. Settings → Warranties tab
2. Click "NJ Stone Coated Roof Tiles" card
3. Edit modal opens with all fields:
   - Title, Logo, Duration
   - Manufacturer Details
   - Certifications
   - Product Information
   - Validity Conditions (textarea, one per line)
   - Exclusions (textarea, one per line)
   - Guarantees (textarea, one per line)
   - Series Table (add/remove rows)
4. Edit the Exclusions text — add new line
5. Click "Save"
6. New warranties use updated text
7. Old warranties unchanged (snapshot)
```

---

## Flow G — Data Backup & Restore

```
BACKUP:
1. Settings → Security tab
2. Click "Export Data (JSON)"
3. File downloads: nj_backup_2026-05-26.json

RESTORE (new machine or after reset):
1. Open app → Settings → Security
2. Click "Import Data"
3. Select nj_backup_2026-05-26.json
4. Confirm dialog: "Replace current data?"
5. Click Yes → All data restored
6. Toast: "Data imported"
```

---

## Flow H — Enable PIN Lock

```
SETUP:
1. Settings → Security
2. Toggle "Enable PIN Protection" ON
3. PIN input appears (default: 1234)
4. Change to: 7886
5. Save changes (auto-save on change)

ON NEXT APP OPEN:
1. PIN overlay covers entire app
2. User types: 7886
3. Press Enter
4. App unlocks, navigates to Home
```

---

## Flow I — Tools-Only Quotation (Edge Case)

```
1. Customer wants only accessories
2. Add: Roofing Screws × 800, Silicone × 4, Touch-up × 2
3. Click Generate → Checkout
4. "Warranties Detected: 0" — no warranty section shown
5. Generate Quotation → NJ-Q-0003 saved
6. No "Generate Warranty" button appears
7. Download PDF → Done
```

---

## Error Flows

### Empty Cart
```
User clicks "Generate" in cart with no items
→ Toast: "Cart is empty"
→ Cart stays open
```

### No Customer Name (Cart)
```
User clicks "Generate" in cart without entering name
→ Toast: "Enter customer name first"
→ Cart closes
→ Home page shown
→ Customer Name field gets focus
```

### No Customer Name (Checkout)
```
User clears name on checkout, clicks Generate Quotation
→ Toast: "Customer name is required"
→ Focus set to name field
```

### Missing Batch Number (Warranty Certificate)
```
Docke or Ceramic warranty displayed
→ Batch Number field shows "⚠ required" label
→ User clicks the empty batch field → types batch number
→ Field saves on blur/Enter
→ Certificate now complete for print/download
```

### Invalid JSON Import
```
User selects wrong file for import
→ JSON parse fails
→ Toast: "Import failed"
→ Data unchanged
```

### Wrong PIN
```
User enters wrong PIN
→ Toast: "Wrong PIN"
→ Input cleared
→ Overlay stays
```

---

## Page State Reference

| Page | Header Title | Header Sub |
|------|-------------|------------|
| Home | "Home" | "Build a quotation — start with the customer" |
| Variety Grid | `{className}` | `{classSubtitle}` |
| Variety Detail | `{varietyName}` | `{className}` |
| Checkout | "Review & Generate" | "Confirm details before generating documents" |
| Quotation Doc | "Quotation {qid}" | "Generated {date}" |
| Warranty Form | "Warranty Certificate" | "{warrantyTitle} · {N} of {M}" |
| Warranty Doc | "Warranty {wid}" | "{warrantyTitle}" |
| Quotation History | "Quotation History" | "{N} quotations on record" |
| Warranty History | "Warranty History" | "{N} certificates on record" |
| Settings | "Settings" | "Configure products, warranties and company details" |
