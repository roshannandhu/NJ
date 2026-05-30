# API.md
# Internal Function API Reference

> This application has no HTTP API. All "API" refers to the internal JavaScript function interface.
> Functions are globally scoped (called from inline HTML onclick attributes).

---

## API Design Principles

1. **Global scope** — All functions are global for inline onclick compatibility
2. **ID-based references** — Functions pass IDs (strings), not objects (prevents serialisation bugs)
3. **Snapshot isolation** — Document builders read from frozen data, not live DATA
4. **Immediate persistence** — Any `DATA` mutation is followed immediately by `saveData()`
5. **No return values** — All functions produce side effects (DOM mutations or saves)

---

## Module: Storage

### `loadData() → DATA`
Reads from localStorage. Falls back to `DEFAULT_DATA` if absent or corrupt.

```javascript
// Input:  none
// Output: DATA object (either loaded or defaults)
// Side effects: none
```

### `saveData() → void`
Serialises `DATA` to localStorage.

```javascript
// Input:  none (reads global DATA)
// Output: none
// Side effects: localStorage write
// Throws: silent catch on quota exceeded
```

---

## Module: Navigation

### `navigate(page: string) → void`

```javascript
// page: "home" | "new" | "quotations" | "warranties" | "settings"
// Side effects:
//   - Updates APP_STATE.page
//   - Toggles .active on nav items
//   - Calls appropriate render function
```

### `setPageHeader(title: string, sub: string) → void`

```javascript
// Updates #pageTitle and #pageSub text content
```

---

## Module: Home

### `renderHome() → void`

```javascript
// Builds and mounts:
//   1. Customer card (4 input fields)
//   2. Product class grid (non-tools classes)
//   3. Tools quick-add section
// Side effects: clears #content, repopulates it
```

### `updateCustomer(field: string, value: string) → void`

```javascript
// field: "name" | "phone" | "email" | "address"
// Updates APP_STATE.customer[field]
// Updates cart drawer "For:" label
```

### `adjustToolQty(inputId: string, delta: number) → void`

```javascript
// inputId: "tool_qty_{varietyId}"
// delta: 1 or -1
// Clamps to minimum of 1
```

### `addToolToCart(varietyId: string) → void`

```javascript
// Reads qty from input#tool_qty_{varietyId}
// Pushes CartItem to APP_STATE.cart
// Calls updateCartBadge()
// Shows toast
```

---

## Module: Class / Variety

### `selectClass(classId: string) → void`

```javascript
// Sets APP_STATE.selectedClassId
// Renders variety grid for the class
```

### `selectVariety(varietyId: string) → void`

```javascript
// Sets APP_STATE.selectedVarietyId
// Sets APP_STATE.selectedColor to first color (or null)
// Renders variety detail page
```

### `selectColor(colorIndex: number) → void`

```javascript
// Updates APP_STATE.selectedColor to colors[colorIndex]
// Updates .color-swatch.selected class
// Updates #priceDisplay with new price (base + offset)
// Updates #detailImage SVG with new colour
```

### `adjustQty(delta: number) → void`

```javascript
// delta: 1 or -1
// Adjusts #qtyInput value, min 1
```

### `addToCart() → void`

```javascript
// Reads: APP_STATE.selectedVarietyId, APP_STATE.selectedColor, #qtyInput
// Computes: price = basePrice + offset
// Pushes CartItem to APP_STATE.cart
// Calls updateCartBadge()
// Opens cart drawer
// Shows toast
```

---

## Module: Cart

### `updateCartBadge() → void`

```javascript
// Sets #cartBadge.textContent = APP_STATE.cart.length
```

### `openCart() → void`

```javascript
// Updates #cartCustomer label
// Calls renderCart()
// Adds .open class to #cartDrawer and #cartOverlay
```

### `closeCart() → void`

```javascript
// Removes .open class from #cartDrawer and #cartOverlay
```

### `renderCart() → void`

```javascript
// Clears #cartBody
// If empty: renders empty state
// For each item: renders cart row with qty controls
// Updates #cartTotal with formatted sum
```

### `adjustCartItem(index: number, delta: number) → void`

```javascript
// Adjusts APP_STATE.cart[index].qty by delta, min 1
// Re-renders cart
```

### `setCartQty(index: number, value: string) → void`

```javascript
// Sets APP_STATE.cart[index].qty from input value, min 1
// Re-renders cart
```

### `removeCartItem(index: number) → void`

```javascript
// Splices APP_STATE.cart[index]
// Re-renders cart
// Updates badge
```

---

## Module: Checkout

### `goToCheckout() → void`

```javascript
// Validates: cart not empty
// Validates: customer.name not empty
// On fail: toast + focus redirect
// On success: closeCart() + renders checkout page
```

---

## Module: Quotation

### `generateQuotation() → void`

```javascript
// Reads: checkout form fields (coName, coPhone, coEmail, coAddr)
// Validates: customer name not empty
// Computes: subtotal, tax, total
// Creates QuotationRecord with:
//   - Sequential ID
//   - Frozen customer snapshot
//   - Frozen item snapshots
//   - Detected warrantyTypes
//   - Empty warrantiesGenerated[]
// Pushes to DATA.quotations (unshift = newest first)
// saveData()
// Clears APP_STATE.cart
// Calls showQuotationDocument(quotation)
```

### `showQuotationDocument(quotation: QuotationRecord) → void`

```javascript
// Renders action bar: New Quotation, Print, Download PDF, Generate Warranty(N)
// Renders quotation document via buildQuotationHTML()
// Clears cart, updates badge
```

### `buildQuotationHTML(q: QuotationRecord) → string`

```javascript
// Returns HTML string for the A4 quotation document
// Reads: DATA.company (for header)
// Reads: q (snapshot — never reads live DATA for document content)
// Returns: complete document HTML
```

### `downloadQuotationPDF(qid: string) → Promise<void>`

```javascript
// Finds quotation by ID
// toast('Generating PDF...')
// html2canvas(#quotationDoc, { scale: 2 })
// Creates jsPDF A4
// Adds canvas as image (multi-page if needed)
// pdf.save(`${qid}_${customerName}.pdf`)
// toast('PDF downloaded')
```

### `printDoc() → void`

```javascript
// window.print()
// CSS @media print hides sidebar, topbar, etc.
```

---

## Module: Warranty

### `generateWarranties(qid: string) → void`

```javascript
// Finds quotation by ID
// Calls showWarrantyForm(q, 0) to begin wizard at index 0
```

### `showWarrantyForm(q: QuotationRecord | string, warrantyIdx: number) → void`

```javascript
// If q is string: looks up quotation by ID (defensive normalisation)
// Gets warrantyType = q.warrantyTypes[warrantyIdx]
// Gets warranty template from DATA.warranties
// Gets class by warrantyType
// Filters items for that class (for pre-fill)
// Renders:
//   - Progress bar (if multiple warranties)
//   - Customer name (read-only)
//   - Address input (pre-filled)
//   - Product input (pre-filled from items)
//   - Batch number (only for docke/ceramic)
//   - Date of sale (defaults today)
//   - Seller name (required)
//   - Cancel + Generate buttons
```

### `generateWarrantyDoc(qid: string, idx: number) → void`

```javascript
// Finds quotation by ID
// Validates: seller name not empty
// Creates CertificateRecord with:
//   - Sequential warranty ID
//   - Frozen certData from form fields
//   - Frozen customer snapshot
//   - Frozen warranty title
// Pushes to DATA.warranty_certificates (unshift)
// Pushes warranty ID to q.warrantiesGenerated
// saveData()
// Calls showWarrantyDocument(cert, qid, idx)
```

### `showWarrantyDocument(cert: CertificateRecord, qid: string, idx: number) → void`

```javascript
// Looks up quotation by ID
// Renders progress bar (if multiple warranties)
// Renders action bar: Print, Download PDF, Next Warranty OR Done
// Renders warranty document via buildWarrantyHTML()
```

### `buildWarrantyHTML(cert: CertificateRecord) → string`

```javascript
// Returns HTML string for the A4 warranty document
// Reads: DATA.warranties[cert.warrantyType] (live template for display)
// Reads: cert (frozen certData for certificate details section)
// Returns: complete warranty HTML
```

### `downloadWarrantyPDF(wid: string) → Promise<void>`

```javascript
// Same pattern as downloadQuotationPDF
// Reads from #warrantyDoc element
// pdf.save(`${wid}_${customerName}.pdf`)
```

---

## Module: History

### `renderQuotationHistory() → void`

```javascript
// Renders search box + table
// For each quotation: renders row with warranty status badge
// Binds search input to filterHistory()
```

### `renderWarrantyHistory() → void`

```javascript
// Similar to quotation history for warranty_certificates
```

### `filterHistory(query: string, type?: string) → void`

```javascript
// Filters .history-row elements by data-search attribute
// Case-insensitive substring match
```

### `reopenQuotation(qid: string) → void`

```javascript
// Finds quotation by ID
// Calls showQuotationDocument(q)
```

### `reopenWarranty(wid: string) → void`

```javascript
// Finds certificate by ID
// Renders readonly warranty document view
```

---

## Module: Settings

### `renderSettings() → void`

```javascript
// Renders settings tab bar
// Delegates to active tab renderer
```

### `saveCompany() → void`

```javascript
// Reads: #cName, #cAddr, #cPhone, #cWeb
// Writes: DATA.company fields
// saveData()
// toast('Company info saved')
```

### `editClass(classId?: string) → void`

```javascript
// classId undefined = new class
// Shows modal with class edit form
// On save: updates or pushes to DATA.classes, saveData()
```

### `deleteClass(classId: string) → void`

```javascript
// Confirm dialog
// Removes from DATA.classes and all DATA.varieties with matching classId
// saveData()
// Re-renders settings
```

### `manageVarieties(classId: string) → void`

```javascript
// Opens modal listing varieties for the class
// Includes Add/Edit/Delete actions
```

### `editVariety(classId: string, varietyId?: string) → void`

```javascript
// varietyId undefined = new variety
// Shows modal with variety edit form including dynamic colour rows
// On save: updates or pushes to DATA.varieties, saveData()
```

### `addColorRow() → void`

```javascript
// Appends a new colour input row to #colorsContainer
```

### `deleteVariety(varietyId: string) → void`

```javascript
// Confirm dialog
// Removes from DATA.varieties
// saveData()
// Re-opens variety management modal for same class
```

### `editWarranty(key: string) → void`

```javascript
// Shows modal with all warranty template fields
// Includes dynamic series table rows
// On save: updates DATA.warranties[key], saveData()
```

### `addSeriesRow() → void`

```javascript
// Appends a new series input row to #seriesContainer
```

---

## Module: Data Management

### `exportData() → void`

```javascript
// Creates Blob from JSON.stringify(DATA)
// Creates object URL, triggers download
// Filename: nj_backup_{date}.json
```

### `importData(file: File) → void`

```javascript
// FileReader.readAsText
// JSON.parse result
// Confirm dialog
// On confirm: DATA = { ...DEFAULT_DATA, ...imported }
// saveData()
// Re-renders settings
```

### `resetData() → void`

```javascript
// Double confirmation
// localStorage.removeItem(STORAGE_KEY)
// DATA = JSON.parse(JSON.stringify(DEFAULT_DATA))
// saveData()
// Re-renders settings
```

---

## Module: Modal

### `showModal(title, body, onSave?, saveLabel?) → void`

```javascript
// title: string — modal header
// body: string — HTML content for modal body
// onSave: function | null — called when Save clicked (null = no save button)
// saveLabel: string — label for cancel button (default "Cancel")
// Shows #modalOverlay
```

### `closeModal() → void`

```javascript
// Removes .open from #modalOverlay
```

---

## Module: PIN

### `checkPin() → void`

```javascript
// Reads #pinInput.value
// Compares to DATA.settings.pin
// On match: hides #pinOverlay, calls init()
// On fail: toast('Wrong PIN'), clears input
```

---

## Module: Utilities

### `$(id: string) → HTMLElement`
```javascript
// Shorthand for document.getElementById(id)
```

### `el(tag, props, ...children) → HTMLElement`
```javascript
// Creates element with properties and children
```

### `escapeHTML(str: string) → string`
```javascript
// Escapes & < > " ' to HTML entities
// MUST be used on all user-supplied data in innerHTML
```

### `formatINR(n: number) → string`
```javascript
// Returns "₹1,23,456" using Indian locale formatting
// Math.round before display
```

### `uid() → string`
```javascript
// Returns "id_" + 8-char random base36 string
// Used for cart item IDs and new class/variety IDs
```

### `toast(msg: string) → void`
```javascript
// Shows #toast element with message for 2.4 seconds
```

### `placeholderSVG(label, color, pattern) → string`
```javascript
// Returns inline SVG string for product image placeholders
// pattern: "shingle" | "tile" | "stone" | "ceiling" | "tools"
```

### `getClassPattern(cls: ClassRecord) → string`
```javascript
// Maps class ID to SVG pattern name
```

---

## Error Handling Conventions

| Scenario | Handling |
|----------|----------|
| Empty cart | toast('Cart is empty') — do not proceed |
| Missing customer name | toast + focus redirect |
| Missing seller name | toast + focus redirect |
| PDF generation fail | catch → toast('PDF generation failed') |
| Invalid JSON import | catch → toast('Import failed') |
| localStorage quota | catch (silent) — future: explicit warning |
| Quotation not found by ID | Early return, no crash |
