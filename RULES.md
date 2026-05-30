# RULES.md
# Coding Standards, Conventions, and Architectural Rules

> These rules exist to maintain consistency when AI-assisted development adds new features.
> Every AI prompt MUST reference this file before generating code.

---

## 1. Non-Negotiable Rules (Never Break These)

```
RULE-1: ALL user data rendered via innerHTML MUST use escapeHTML()
RULE-2: NEVER use JSON.stringify(object) inside inline onclick attributes
         — pass IDs only, look up object inside the function
RULE-3: EVERY DATA mutation MUST be followed by saveData()
RULE-4: EVERY quotation/warranty must use the SNAPSHOT principle
         — data is frozen at generation time, never re-read from live DATA
RULE-5: New functions MUST be tested against all relevant checklists in TESTING.md
RULE-6: IDs passed between functions MUST be string IDs, never full objects
```

---

## 2. File Structure Rules

### v1 — Single File Structure

```
nj-quotation-warranty-system.html
│
├── <head>
│   ├── meta charset, viewport
│   ├── Google Fonts link
│   ├── CDN: jspdf, html2canvas (pinned versions)
│   └── <style> ALL CSS in one block
│
└── <body>
    ├── <!-- PIN OVERLAY -->
    ├── <div class="app">
    │   ├── <aside class="sidebar">
    │   └── <main class="main">
    │       ├── <header class="topbar">
    │       └── <div id="content">   ← Dynamic mount point
    ├── <!-- CART DRAWER -->
    ├── <!-- MODAL OVERLAY -->
    ├── <!-- TOAST -->
    └── <script> ALL JavaScript in one block
        ├── DATA MODEL & STORAGE
        ├── UTILITY
        ├── SVG/PLACEHOLDER
        ├── NAVIGATION
        ├── HOME MODULE
        ├── CLASS/VARIETY MODULE
        ├── CART MODULE
        ├── CHECKOUT MODULE
        ├── QUOTATION MODULE
        ├── WARRANTY MODULE
        ├── HISTORY MODULE
        ├── SETTINGS MODULE
        ├── DATA MANAGEMENT MODULE
        ├── MODAL MODULE
        ├── PIN MODULE
        └── INIT
```

### v1.5 — Modular Structure (if file exceeds 300KB)

```
index.html                  ← Entry point + HTML structure only
css/
  variables.css             ← CSS custom properties (design tokens)
  layout.css                ← App shell, sidebar, topbar, content
  components.css            ← Buttons, inputs, cards, toggles
  home.css                  ← Class grid, variety grid, detail
  cart.css                  ← Cart drawer + cart items
  modal.css                 ← Modals and overlays
  settings.css              ← Settings tabs and forms
  document.css              ← Quotation and warranty PDF styles
  print.css                 ← @media print overrides
js/
  data.js                   ← DEFAULT_DATA + DATA schema
  storage.js                ← loadData(), saveData()
  state.js                  ← APP_STATE + STORAGE_KEY
  utils.js                  ← $, el, escapeHTML, formatINR, uid, toast
  svg.js                    ← placeholderSVG, getClassPattern
  nav.js                    ← navigate, setPageHeader
  home.js                   ← renderHome, updateCustomer, tools
  class-variety.js          ← selectClass, selectVariety, selectColor, addToCart
  cart.js                   ← cart CRUD functions
  checkout.js               ← goToCheckout
  quotation.js              ← generateQuotation, showQuotationDocument, PDF
  warranty.js               ← showWarrantyForm, generateWarrantyDoc, PDF
  history.js                ← renderQuotationHistory, renderWarrantyHistory
  settings.js               ← all settings tabs and CRUD
  data-mgmt.js              ← exportData, importData, resetData
  modal.js                  ← showModal, closeModal
  pin.js                    ← checkPin
  main.js                   ← init(), DOMContentLoaded handler
libs/
  jspdf.umd.min.js          ← Bundled locally for offline use
  html2canvas.min.js        ← Bundled locally
```

---

## 3. JavaScript Conventions

### Variable and Function Naming

```javascript
// ✓ Functions: camelCase, descriptive verb-noun
function generateQuotation() {}
function renderWarrantyHistory() {}
function addToolToCart() {}
function showWarrantyForm() {}

// ✓ Constants: UPPER_SNAKE_CASE
const STORAGE_KEY = 'nj_app_data_v2';
const DEFAULT_DATA = { ... };

// ✓ Variables: camelCase
let subtotal, taxAmount, grandTotal;
const isNew = !varietyId;

// ✗ Never: abbreviated names that lose meaning
function rndH() {}     // Bad
function addWC() {}    // Bad
```

### Function Signature Rules

```javascript
// ✓ Pass IDs, look up objects inside functions
function editClass(classId) {
  const cls = DATA.classes.find(c => c.id === classId);
  // ...
}

// ✗ Never: pass full objects as inline onclick parameters
onclick="editClass({id:'cls_shingles', name:'...'})";  // WRONG

// ✓ Correct pattern:
onclick="editClass('cls_shingles')";

// ✓ Defensive normalisation (accept both):
function showWarrantyForm(q, idx) {
  if (typeof q === 'string') q = DATA.quotations.find(x => x.id === q);
  if (!q) return;
  // ...
}
```

### Data Mutation Rules

```javascript
// ✓ Always follow mutation with saveData()
function saveCompany() {
  DATA.company.name = $('cName').value;    // Mutate
  DATA.company.address = $('cAddr').value; // Mutate
  saveData();                               // ✓ Persist immediately
  toast('Company info saved');             // Notify
}

// ✗ Never mutate and forget to save
function badSave() {
  DATA.company.name = $('cName').value;
  // MISSING saveData() — data will be lost on refresh
}
```

### ID Generation

```javascript
// Sequential IDs for public-facing documents:
const qid = DATA.settings.quotationPrefix + '-' +
  String(DATA.quotations.length + 1).padStart(4, '0');
// → "NJ-Q-0001"

// Random IDs for internal records (cart items, new classes/varieties):
function uid() {
  return 'id_' + Math.random().toString(36).slice(2, 10);
}
```

---

## 4. HTML/CSS Conventions

### Class Naming (BEM-inspired, but flat)

```css
/* ✓ Block-level: descriptive, lowercase, hyphenated */
.class-card { }
.cart-drawer { }
.variety-grid { }
.warranty-doc { }

/* ✓ Element modifier: double hyphen */
.cart-item .item-info { }
.cart-item .item-price { }

/* ✓ State modifier: class addition */
.cart-drawer.open { }
.toggle.on { }
.nav-item.active { }
.color-swatch.selected { }

/* ✗ Never use ID selectors in CSS (IDs are for JS targeting only) */
#cartBody { }  /* WRONG in CSS — acceptable in JS only */
```

### CSS Variables Usage

```css
/* ✓ Always use design tokens for colours */
background: var(--bg);
color: var(--ink);
border-color: var(--line);

/* ✗ Never hardcode colours that exist as tokens */
background: #faf8f4;  /* WRONG — use var(--bg) */
color: #1a1a1a;       /* WRONG — use var(--ink) */

/* ✓ Exception: document styles (quotation/warranty) use hardcoded colours
   because they must render consistently in PDF regardless of theme */
.doc-output { color: #1a1a1a; }  /* OK — this is a document, not UI */
```

### Inline Styles — Limited Use

```javascript
// ✓ Allowed for dynamic values only
card.style.animationDelay = (i * 0.05) + 's';
card.style.background = cls.color;  // Brand colour from data

// ✗ Avoid for static layout that belongs in CSS
el.style.display = 'flex';        // Move to CSS class
el.style.marginTop = '24px';      // Move to CSS class
```

---

## 5. Security Rules

```javascript
// RULE: All user data → innerHTML MUST use escapeHTML()

// ✓ Correct:
card.innerHTML = `<div>${escapeHTML(cls.name)}</div>`;
modal.innerHTML = `<h2>${escapeHTML(v.name)}</h2>`;

// ✗ Always wrong — never skip escaping:
card.innerHTML = `<div>${cls.name}</div>`;

// ✓ Exception: When you know content is safe (app-generated, numeric):
priceDisplay.textContent = formatINR(v.basePrice);  // textContent is safe
badge.textContent = APP_STATE.cart.length;          // Number, no escaping needed

// ✓ Prefer textContent for simple text nodes:
const div = document.createElement('div');
div.textContent = cls.name;  // Safe, no escaping needed
```

---

## 6. Document Builder Rules

```javascript
// Rule: buildQuotationHTML() and buildWarrantyHTML() MUST:
// ✓ Accept a frozen record object (quotation or certificate)
// ✓ Only read from the record (not from live DATA) for customer/item details
// ✓ May read from DATA.company for the header (company info is not snapshotted)
// ✓ May read from DATA.warranties[warrantyType] for warranty template text
// ✓ Must escapeHTML() all interpolated values

function buildQuotationHTML(q) {
  // q = frozen QuotationRecord
  // DATA.company = OK to read (header always uses current company info)
  return `
    <div class="company">${escapeHTML(DATA.company.name)}</div>
    <div class="customer">${escapeHTML(q.customer.name)}</div>  <!-- from snapshot -->
    <td>${formatINR(item.price)}</td>  <!-- from snapshot, numeric = safe -->
  `;
}
```

---

## 7. Error Handling Rules

```javascript
// Rule: User-facing errors MUST use toast(), not alert() or console.error()

// ✓ Correct:
toast('Customer name is required');

// ✗ Wrong:
alert('Customer name is required');

// Rule: All async operations (PDF generation) MUST have try/catch
async function downloadQuotationPDF(qid) {
  try {
    const canvas = await html2canvas(docEl, { scale: 2 });
    // ...
    toast('PDF downloaded');
  } catch (e) {
    console.error(e);           // OK for developer debugging
    toast('PDF generation failed. Try printing instead.');  // User notification
  }
}

// Rule: Defensive null checks for ID lookups
function reopenQuotation(qid) {
  const q = DATA.quotations.find(x => x.id === qid);
  if (!q) return;  // Silent fail — history table shouldn't have invalid IDs
  showQuotationDocument(q);
}
```

---

## 8. Modal Rules

```javascript
// Rule: showModal() is the ONLY way to show modal content
// Never manipulate #modal or #modalOverlay directly

// ✓ Correct:
showModal(
  'Edit Warranty — ' + w.title,  // Title
  `<div class="form-grid">...</div>`,  // Body HTML (use escapeHTML in content)
  () => { /* onSave callback */ },  // Save function (or null for info modals)
  'Close'  // Override cancel button label (optional)
);

// Rule: onSave callback MUST call closeModal() only implicitly
// showModal() calls closeModal() before the callback IF modalSave is clicked
// Don't call closeModal() manually inside the callback

// Rule: Modal body CAN call other functions (like addColorRow, addSeriesRow)
// These modify DOM inside the modal body
```

---

## 9. Settings Module Rules

```javascript
// Rule: Each settings render function receives the body element as parameter
function renderCompanySettings(body) { ... }
function renderProductSettings(body) { ... }
// etc.

// Rule: Settings save functions read from specific IDs, update DATA, call saveData()
// Rule: After save, renderSettings() is called to re-render the full settings page
// This ensures tab state and all UI are consistent

// Rule: The settingsTab state is in APP_STATE.settingsTab
// Changing tabs sets APP_STATE.settingsTab then calls renderSettings()
```

---

## 10. Git Workflow

### Branch Strategy

```
main          ← Production-ready code only
├── dev       ← Integration branch
└── feature/  ← Feature branches
    ├── feature/image-upload
    ├── feature/discount-on-checkout
    └── feature/customer-database
```

### Commit Message Format

```
<type>(<scope>): <short description>

Types:
  feat     — New feature
  fix      — Bug fix
  style    — CSS/UI changes
  refactor — Code restructure (no feature change)
  docs     — Documentation only
  test     — Test additions/changes
  chore    — Build, config, dependencies

Examples:
  feat(warranty): add progress bar for multi-warranty flow
  fix(warranty): resolve qid undefined in showWarrantyForm
  fix(cart): add customer name validation before checkout
  feat(home): add tools quick-add section
  style(history): add warranty status badge to quotation table
  docs: add RULES.md and TESTING.md
```

---

## 11. AI Coding Prompt Rules

When asking AI to add features, ALWAYS include:

```
Context from these files:
- RULES.md — coding conventions (this file)
- DATABASE.md — data schema
- API.md — function signatures
- ARCHITECTURE.md — module structure

Requirements for any new function:
1. Must follow naming conventions (camelCase, verb-noun)
2. Must use escapeHTML() for all innerHTML with user data
3. Must pass IDs (not objects) between functions
4. Must call saveData() after any DATA mutation
5. Must use toast() for user notifications, not alert()
6. Must add defensive null check for any ID lookup
7. Must be placed in the correct module section of the script

Do NOT:
- Break existing function signatures
- Use JSON.stringify(object) in inline onclick
- Hardcode colours that exist as CSS variables
- Skip snapshot principle for document builders
- Forget to update TESTING.md checklist for the new feature
```

---

## 12. Documentation Rules

- Every major function must have a corresponding entry in `API.md`
- Every new feature must have a test checklist in `TESTING.md`
- Every architectural decision must be recorded in `DECISIONS.md`
- This `RULES.md` must be updated when new patterns are established
- `PLAN.md` task status must be updated as phases complete
