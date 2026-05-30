# ARCHITECTURE.md
# System Architecture Design

---

## 1. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                 SINGLE DESKTOP APPLICATION                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Browser / Electron                   │    │
│  │                                                      │    │
│  │  ┌────────────────┐    ┌──────────────────────────┐ │    │
│  │  │  Presentation  │    │      State Layer          │ │    │
│  │  │     Layer      │◄──►│                          │ │    │
│  │  │  (HTML/CSS/JS) │    │  DATA (persistent)       │ │    │
│  │  │                │    │  APP_STATE (transient)   │ │    │
│  │  └────────────────┘    └────────────┬─────────────┘ │    │
│  │                                     │ saveData()     │    │
│  │  ┌────────────────┐                 ▼               │    │
│  │  │  PDF Generator │    ┌──────────────────────────┐ │    │
│  │  │  (html2canvas  │    │   localStorage           │ │    │
│  │  │   + jsPDF)     │    │   "nj_app_data_v2"       │ │    │
│  │  └────────────────┘    └──────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  Downloaded PDFs  │
                  │  (local machine)  │
                  └──────────────────┘
```

---

## 2. Architectural Layers

### 2.1 Presentation Layer

Responsible for all DOM rendering and user interaction.

**Components:**
- `sidebar` — persistent left navigation
- `topbar` — page title + cart button
- `content` — main dynamic area (re-rendered per page)
- `cart-drawer` — slide-in right panel
- `modal-overlay` — generic modal system
- `toast` — notification system
- `pin-overlay` — authentication screen

**Key principle:** The `content` div is the single mount point. Every `render*()` function clears it and repopulates it. No virtual DOM — direct DOM manipulation.

### 2.2 State Layer

Two objects govern all application state:

```javascript
// PERSISTENT STATE — saved to localStorage on every mutation
DATA = {
  company:              { ... },
  settings:             { ... },
  classes:              [ ... ],
  varieties:            [ ... ],
  warranties:           { ... },
  quotations:           [ ... ],
  warranty_certificates:[ ... ]
}

// TRANSIENT STATE — in-memory only, lost on refresh
APP_STATE = {
  customer:             { name, phone, email, address },
  selectedClassId:      null,
  selectedVarietyId:    null,
  selectedColor:        null,
  cart:                 [],
  page:                 'home',
  settingsTab:          'company'
}
```

**Save trigger:** `saveData()` is called after every mutation to `DATA`. `APP_STATE` is never saved.

### 2.3 Persistence Layer

```
localStorage
├── Key: "nj_app_data_v2"
└── Value: JSON.stringify(DATA)
```

**Version suffix (`v2`):** Allows future schema migration without corrupting old data.

**Capacity:** ~5MB per origin. At ~5KB per quotation, supports 1,000+ quotations before any concern.

---

## 3. Data Flow Diagram

```
User Action (click/input)
        │
        ▼
Event Handler (onclick/oninput)
        │
        ├─► Modify APP_STATE (if transient: cart, selectedColor, etc.)
        │
        ├─► Modify DATA (if persistent: add quotation, edit variety, etc.)
        │      └─► saveData() → localStorage update
        │
        └─► Re-render affected UI component
              ├─► navigate(page) → full page re-render
              ├─► renderCart() → cart drawer update only
              ├─► updateCartBadge() → badge count only
              └─► showModal() → modal update only
```

---

## 4. Module Map

```
index.html
├── <style>                      → All CSS (design system)
└── <script>
    ├── Storage Module
    │   ├── STORAGE_KEY
    │   ├── DEFAULT_DATA
    │   ├── loadData()
    │   └── saveData()
    │
    ├── Utility Module
    │   ├── $()                  → getElementById shorthand
    │   ├── el()                 → createElement helper
    │   ├── escapeHTML()         → XSS prevention
    │   ├── formatINR()          → Indian number formatting
    │   ├── uid()                → Random ID generator
    │   └── toast()              → Notification display
    │
    ├── SVG Module
    │   ├── placeholderSVG()     → Pattern-based product images
    │   └── getClassPattern()    → Maps class to SVG pattern
    │
    ├── Navigation Module
    │   ├── navigate()           → Page router
    │   └── setPageHeader()      → Title/subtitle updater
    │
    ├── Home Module
    │   ├── renderHome()         → Full home page
    │   ├── updateCustomer()     → Customer field sync
    │   ├── adjustToolQty()      → Tool qty control
    │   └── addToolToCart()      → Quick-add tool to cart
    │
    ├── Class/Variety Module
    │   ├── selectClass()        → Navigate to variety grid
    │   ├── selectVariety()      → Navigate to detail page
    │   ├── selectColor()        → Update selected colour
    │   ├── adjustQty()          → Qty ± in detail
    │   └── addToCart()          → Add variety item to cart
    │
    ├── Cart Module
    │   ├── updateCartBadge()    → Update badge count
    │   ├── openCart()           → Show drawer
    │   ├── closeCart()          → Hide drawer
    │   ├── renderCart()         → Build cart contents
    │   ├── adjustCartItem()     → ± qty in cart
    │   ├── setCartQty()         → Set qty from input
    │   └── removeCartItem()     → Remove item by index
    │
    ├── Checkout Module
    │   └── goToCheckout()       → Validate + render checkout
    │
    ├── Quotation Module
    │   ├── generateQuotation()  → Create + save quotation
    │   ├── showQuotationDocument() → Render quotation view
    │   ├── buildQuotationHTML() → HTML template builder
    │   ├── downloadQuotationPDF() → html2canvas + jsPDF
    │   └── printDoc()           → window.print()
    │
    ├── Warranty Module
    │   ├── WarrantyDocument.jsx    → Standalone A4 certificate renderer
    │   │   ├── Numbered sections (§1–§7) matching physical PDF format
    │   │   ├── Per-template heading logic (Docke/Laminated/StoneCoated/Heatout/Ceramic)
    │   │   ├── Inline-editable certificate details (EditableCell component)
    │   │   └── PDF download (html2canvas + jsPDF)
    │   ├── QuotationDocument.jsx   → Warranty tab renders same numbered-section format
    │   ├── Checkout.jsx            → Auto-generates warranty snapshots on quotation creation
    │   └── History.jsx             → Warranty history list + reopen
    │
    ├── History Module
    │   ├── renderQuotationHistory()  → Quotation list page
    │   ├── renderWarrantyHistory()   → Warranty list page
    │   ├── filterHistory()           → Client-side search
    │   ├── reopenQuotation()         → View past quotation
    │   └── reopenWarranty()          → View past warranty
    │
    ├── Settings Module
    │   ├── renderSettings()          → Settings page + tabs
    │   ├── renderCompanySettings()   → Company tab
    │   ├── saveCompany()             → Save company data
    │   ├── renderProductSettings()   → Products tab
    │   ├── editClass()               → Class CRUD
    │   ├── deleteClass()             → Class deletion
    │   ├── manageVarieties()         → Variety list modal
    │   ├── editVariety()             → Variety CRUD
    │   ├── addColorRow()             → Dynamic colour row
    │   ├── deleteVariety()           → Variety deletion
    │   ├── renderWarrantySettings()  → Warranties tab
    │   ├── editWarranty()            → Warranty template edit
    │   ├── addSeriesRow()            → Dynamic series row
    │   ├── renderQuotationSettings() → Quotation tab
    │   └── renderSecuritySettings()  → Security tab
    │
    ├── Data Management Module
    │   ├── exportData()       → JSON download
    │   ├── importData()       → JSON restore
    │   └── resetData()        → Factory reset
    │
    ├── Modal Module
    │   ├── showModal()        → Generic modal renderer
    │   └── closeModal()       → Hide modal
    │
    ├── PIN Module
    │   └── checkPin()         → PIN validation
    │
    └── Init Module
        └── init()             → App bootstrap
```

---

## 5. Technology Stack

### 5.1 Current Stack (v1 — Single File)

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| UI | Vanilla HTML + CSS + JS | ES2020 | Zero dependency, max portability |
| PDF Generation | jsPDF | 2.5.1 | Mature, CDN-available |
| Canvas Render | html2canvas | 1.4.1 | Best HTML → canvas conversion |
| Fonts | Google Fonts (Inter, Fraunces, JetBrains Mono, Playfair Display) | CDN | Premium look, zero hosting |
| Storage | Browser localStorage | — | Offline, simple, sufficient for scale |
| Hosting | None (local file / Electron) | — | No server cost, full offline |

### 5.2 Upgrade Path (v2 — Electron)

| Layer | Technology | Benefit |
|-------|-----------|---------|
| Shell | Electron | Native .exe, native file dialogs |
| Storage | Same localStorage | Zero migration |
| Distribution | electron-builder | Cross-platform installers |
| Updates | electron-updater | Auto-update support |

### 5.3 Upgrade Path (v3 — Framework)

| Layer | Technology | Benefit |
|-------|-----------|---------|
| UI | Vue 3 + TypeScript | Type safety, component reuse |
| Build | Vite | Fast HMR, small bundles |
| State | Pinia | Reactive state management |
| Storage | Same localStorage + Pinia persistence | |

---

## 6. PDF Architecture

```
User clicks "Download PDF"
        │
        ▼
const docEl = document.getElementById('quotationDoc')
        │
        ▼
html2canvas(docEl, { scale: 2, backgroundColor: '#fff' })
        │  Renders DOM to canvas at 2× resolution
        ▼
canvas.toDataURL('image/png')
        │  Canvas → base64 PNG
        ▼
new jsPDF('p', 'mm', 'a4')
        │  Create A4 portrait PDF
        ▼
pdf.addImage(imgData, pdfWidth, pdfHeight)
        │  Add canvas as image
        │
        ├─► If content height > one page:
        │   Loop: addPage() + addImage() with offset
        │
        ▼
pdf.save(`${id}_${customerName}.pdf`)
        │  Triggers browser download
        ▼
toast('PDF downloaded')
```

**Filename convention:**
- Quotation: `NJ-Q-0001_Salim_P_P.pdf`
- Warranty: `NJ-W-0001_Salim_P_P.pdf`

---

## 7. Key Architectural Decisions

See `DECISIONS.md` for full decision log. Summary:

| Decision | Choice | Reason |
|----------|--------|--------|
| Single file vs modular | Single file | Portability — email/USB distribution |
| LocalStorage vs IndexedDB | localStorage | Simpler API, sufficient capacity |
| HTML render vs native PDF | HTML → canvas → PDF | WYSIWYG, no PDF layout engine needed |
| No server | Intentional | Offline, free, no data privacy risk |
| Snapshot principle | All data frozen at generation | Legal correctness, reprint accuracy |
| Vanilla JS vs framework | Vanilla | No build step, simpler deployment |

---

## 8. Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| Large localStorage payload | Quota checked; export reminder if near limit |
| Slow PDF generation | Toast "Generating..." while async operation runs |
| DOM re-renders | Full re-render per page is fast for this scale |
| Memory: large cart objects | Objects are small (< 1KB each) |
| Fonts CDN failure | Fallback system fonts defined in CSS |
