# DECISIONS.md
# Architecture Decision Log

> Every major technical decision is recorded here with context, reasoning, and alternatives considered.
> This file prevents architecture drift and "why did we do this?" confusion.

---

## Decision Format

```
## ADR-XXX — [Title]

**Status:** [Decided | Superseded by ADR-XXX | Under Review]
**Date:** [When decided]
**Context:** Why this decision needed to be made
**Decision:** What we chose
**Alternatives Considered:** What else we evaluated
**Consequences:** What this means for the codebase
**Why NOT the alternatives:** Explicit rejection reasoning
```

---

## ADR-001 — Single HTML File vs Modular Project

**Status:** Decided  
**Date:** May 2026

**Context:**  
The NJ India app needs to be distributed to a single PC. The simplest possible distribution method was needed — no build steps, no npm, no server setup.

**Decision:**  
Single self-contained HTML file with all CSS and JavaScript inlined.

**Alternatives Considered:**
- Vue 3 + Vite build pipeline
- React + Create React App
- Plain HTML + separate CSS/JS files (multi-file without build)
- Electron app from the start

**Consequences:**
- File can be shared via WhatsApp, email, or USB
- No build step required
- File grows with features (currently ~200KB — well within acceptable range)
- No component-level hot module replacement in development
- All functions in global scope

**Why NOT the alternatives:**
- Vue/React: Requires build step, npm, and knowledge of the framework for maintenance. NJ India's developer support is minimal.
- Multi-file without build: Still requires a local server (CORS restrictions for `file://` protocol) or exact directory structure — more complex than one file.
- Electron from start: 100MB installer for an app that doesn't need it yet. Adds build complexity.

---

## ADR-002 — localStorage vs IndexedDB

**Status:** Decided (localStorage for v1, IndexedDB as upgrade path)  
**Date:** May 2026

**Context:**  
Application needs persistent client-side storage. Two main browser options: localStorage (~5 MB) and IndexedDB (much larger, async API).

**Decision:**  
Use `localStorage` for v1 under key `nj_app_data_v2`.

**Alternatives Considered:**
- IndexedDB with idb library
- SQLite via WebAssembly (sql.js)
- File system (requires Electron or File System Access API)

**Consequences:**
- Simple synchronous API: `localStorage.setItem(key, JSON.stringify(DATA))`
- 5 MB limit per origin
- At 100 quotations/month × 5KB each = 6 MB/year — will hit limit in ~12 months
- Migration path to IndexedDB is clean: only `saveData()` and `loadData()` need changing

**Why NOT IndexedDB:**
- Async API adds complexity to the codebase
- `await` everywhere or callback hell for first iteration
- 5 MB is sufficient for 1–2 years of NJ India use
- Migration is straightforward when needed

**Migration Trigger:**  
When localStorage usage approaches 4 MB (visible in Settings data summary).

---

## ADR-003 — HTML → Canvas → PDF vs Native PDF Generation

**Status:** Decided  
**Date:** May 2026

**Context:**  
Quotation and warranty documents need to be downloadable as PDFs that match the visual design exactly.

**Decision:**  
Use `html2canvas` to render the HTML document to a canvas, then use `jsPDF` to wrap it as a PDF.

**Alternatives Considered:**
- jsPDF with direct PDF drawing commands (text, lines, boxes)
- pdfmake (declarative PDF generation)
- Puppeteer/headless Chrome (server-side rendering)
- React-PDF

**Consequences:**
- PDF looks exactly like the HTML preview (WYSIWYG)
- Scale: 2× for sharpness (retina-quality text)
- PDF is an image of the HTML (not selectable text — acceptable for this use case)
- Generation takes 2–4 seconds for long quotations
- Works entirely client-side

**Why NOT the alternatives:**
- jsPDF direct drawing: Would require reimplementing the entire document layout as drawing commands — high maintenance burden when layout changes
- pdfmake: Another dependency, different mental model for layouts
- Puppeteer: Requires a server — violates offline-first requirement
- React-PDF: Requires React — violates vanilla JS requirement

---

## ADR-004 — Global Function Scope vs Module Pattern

**Status:** Decided  
**Date:** May 2026

**Context:**  
Single HTML file with `onclick="functionName()"` inline event handlers requires functions to be in global scope. Modern JavaScript prefers module patterns and event listeners.

**Decision:**  
Keep all functions in global scope (no `type="module"` on script tag).

**Alternatives Considered:**
- ES Module approach (`<script type="module">`) with `window.functionName = functionName`
- Event delegation pattern (one listener on document, switch by data attributes)
- Component class pattern (pseudo-OOP)

**Consequences:**
- Simpler to read and debug
- Inline onclick attributes work without additional wiring
- No name collision if naming conventions are followed (verb-noun, see RULES.md)
- Will need refactoring if project grows significantly

**Why NOT modules:**
- ES modules require a web server (no `file://` protocol support for imports)
- Adding `window.x = x` for every function defeats the purpose
- The project size doesn't warrant this complexity in v1

---

## ADR-005 — Snapshot Principle for Quotations and Warranties

**Status:** Decided  
**Date:** May 2026

**Context:**  
After a quotation is generated, product prices and warranty terms may change. If the system re-reads live data when reprinting, old documents would show wrong information.

**Decision:**  
Every quotation and warranty certificate stores a **complete frozen snapshot** of all relevant data at generation time. Reprinting reads ONLY from the frozen record.

**Consequences:**
- Past documents are legally defensible — they show exactly what was offered/warranted
- Historical records are accurate even after price changes
- Storage size increases (~5 KB per quotation vs ~1 KB for just the ID)
- No need for soft-delete or versioning — records are immutable

**Why this is critical:**  
If a customer disputes their warranty terms and the system re-read from current (possibly edited) templates, the displayed warranty would be wrong. This is a legal risk. The snapshot principle prevents it entirely.

---

## ADR-006 — ID Strategy: Sequential vs UUID

**Status:** Decided  
**Date:** May 2026

**Context:**  
Documents need human-readable IDs for customer communication and filing.

**Decision:**  
Sequential, prefixed IDs for public-facing documents. Random IDs (`uid()`) for internal records.

```
Public:  NJ-Q-0001, NJ-Q-0002, ... (quotations)
Public:  NJ-W-0001, NJ-W-0002, ... (warranties)
Internal: id_abc123xyz (cart items, new class/variety IDs)
```

**Consequences:**
- Customers can reference their quotation number (e.g. "Quotation 47")
- IDs are predictable but that's acceptable for a private tool
- Sequential IDs communicate history and volume (customer can see they're the 47th quote)

**Why NOT UUID:**
- `550e8400-e29b-41d4-a716-446655440000` is not customer-friendly
- Harder to reference in conversation or over the phone

---

## ADR-007 — No Backend, No Server

**Status:** Decided  
**Date:** May 2026

**Context:**  
The choice to build a server-based app vs a pure client-side app.

**Decision:**  
No server. Entirely client-side.

**Consequences:**
- Zero server costs
- Zero ongoing maintenance (no server to patch)
- Works completely offline (Kerala power/internet reliability)
- No transmitted customer data (privacy and compliance advantage)
- Data is device-local — if device fails, data is gone unless backed up
- Cannot support multiple simultaneous users

**Why this is right for NJ India:**
- Single device, single location use case
- No IT team to maintain a server
- Internet reliability in Kerala is inconsistent
- Customer data sensitivity: keeping it local reduces GDPR/DPDP risk

---

## ADR-008 — Object-Passing Bug Prevention: ID-Only Functions

**Status:** Decided  
**Date:** May 2026

**Context:**  
Early code passed full objects in inline onclick handlers using `JSON.stringify()`, which caused failures when object values contained single quotes, double quotes, or newlines.

```javascript
// BROKEN:
onclick='showWarrantyForm(${JSON.stringify(q)}, ${idx})'
// Fails if q.customer.name = "O'Brien" (apostrophe breaks the HTML attribute)
```

**Decision:**  
All functions called from inline onclick handlers MUST receive only primitive values (strings, numbers). Objects are looked up by ID inside the function.

```javascript
// CORRECT:
onclick="showWarrantyForm('${q.id}', ${idx})"

// Inside the function:
function showWarrantyForm(q, idx) {
  if (typeof q === 'string') q = DATA.quotations.find(x => x.id === q);
}
```

**Why the defensive normalisation:**  
Some internal calls pass the full object (e.g. `generateWarranties()` calls `showWarrantyForm(q, 0)` directly). The defensive normalisation allows both call patterns safely.

---

## ADR-009 — Vanilla JavaScript vs Frontend Framework

**Status:** Decided (v1), Under Review (v2)  
**Date:** May 2026

**Decision:**  
Vanilla JavaScript for v1. Evaluate Vue 3 for v2.

**Metrics for upgrading to Vue:**
- File size > 300 KB
- > 5 active developers on the project
- Need for component testing
- New features requiring complex reactive state

**Why Vue 3 (not React) if we upgrade:**
- Options API is closer to vanilla JS mentally
- Single File Components match the current "one file" philosophy
- Composition API is more ergonomic than hooks for newcomers
- Vite is fastest dev server available

---

## ADR-010 — Warranty Template Storage as Object Map vs Array

**Status:** Decided  
**Date:** May 2026

**Context:**  
Warranty templates could be stored as an array (`warranties: []`) or as an object with fixed keys (`warranties: { docke: {...}, nj_laminated: {...} }`).

**Decision:**  
Object map with fixed keys.

```javascript
DATA.warranties = {
  docke:        { ... },
  nj_laminated: { ... },
  ceramic:      { ... },
  stone_coated: { ... },
  heatout:      { ... }
}
```

**Why NOT array:**
- Lookup by type: `warranties["nj_laminated"]` vs `warranties.find(w => w.type === "nj_laminated")`
- Object lookup is O(1), array lookup is O(n)
- There will always be exactly 5 warranty types — fixed set doesn't benefit from array
- Key names match the `warrantyType` field in classes and certificates — clean foreign key relationship

**Consequences:**
- Adding a 6th warranty type requires adding a new key to the object
- Object structure is readable and predictable

---

## ADR-011 — React + FastAPI over Vanilla HTML + Electron (v2 Rebuild)

**Status:** Decided  
**Date:** May 2026  
**Supersedes:** ADR-001 (single HTML file), ADR-003 (html2canvas PDF), ADR-007 (no backend)

**Context:**  
The vanilla HTML prototype (`nj-system-v3.html`) proved all flows work. The decision was whether to ship that as-is (wrapped in Electron) or rebuild on a better stack. Three specific limitations of the vanilla approach drove this decision:

1. `html2canvas` produces an image-based PDF — text not selectable, files large, rendering fragile
2. No real image upload capability — logo, seal, product photos all missing
3. Single global T&C field cannot support the per-class terms structure required (confirmed from actual PDFs)

**Decision:**  
Rebuild with **React 18 (Vite) frontend + FastAPI (Python) backend + SQLite**. Runs locally on `localhost:8000`. No cloud.

**Alternatives Considered:**
- Vanilla HTML + Electron (original plan) — ruled out by the 3 limitations above
- Vue 3 + FastAPI — React chosen because Vite ecosystem is stronger and user already chose React
- React + Node.js backend — FastAPI chosen because WeasyPrint (Python PDF lib) is significantly better than any Node.js PDF solution
- React + SQLite via better-sqlite3 (Node) — FastAPI/Python chosen for WeasyPrint

**Consequences:**
- PDF generation moves server-side (FastAPI → WeasyPrint) — proper vector PDFs
- Real file uploads: company logo, seal, signature, product images stored in `uploads/`
- SQLite replaces localStorage — data survives browser cache clears; backup = copy `.db` file
- Per-class `termsText` field now possible in SQLite schema
- `localhost:8000` replaces file:// opening — seller bookmarks URL in Chrome
- Optional `.exe` via PyInstaller (bundles FastAPI + React build) for native app feel

**Why NOT Electron (original plan):**
- Electron was planned for the vanilla HTML file only
- Once choosing React + FastAPI, Electron would wrap a Python server — PyInstaller is cleaner for that
- PyInstaller produces a true standalone `.exe`; Electron + Python would need IPC and is significantly more complex

---

## ADR-012 — Per-Class Terms & Conditions (Discovered from PDFs)

**Status:** Decided  
**Date:** May 2026

**Context:**  
Reviewing actual issued quotation PDFs revealed that each product class uses a completely different set of terms and conditions. The original spec modelled T&C as a single global field in settings. This is wrong.

**Decision:**  
Each `ClassRecord` in the database gets its own `termsText` field (multi-line). The quotation PDF renders the terms from the class(es) present in the cart, grouped by class label if multiple classes.

**Evidence from PDFs:**
- Shingles: 50% advance, 50% at delivery; 100% before installation; GST+transport+installation included
- Stone Coated: 50% advance, 50% before dispatch; transport at customer cost; 60-day delivery; 20-day validity
- Heatout: 30%/60%/10% payment split; scaffolding at client; working environment at client; union costs at client

These are fundamentally different and cannot be handled by a single global field.

**Consequences:**
- `classes` table gains `terms_text TEXT` column
- Quotation builder fetches terms per unique class in the cart
- Settings UI shows T&C editor per class (not one global textarea)
- Old global `termsText` in settings is removed or kept as a fallback

---

## ADR-013 — Warranty Certificate: Numbered-Section Physical PDF Format

**Status:** Decided  
**Date:** May 2026

**Context:**  
The original warranty certificate renderer used generic section headers without numbering and a wizard-based generation flow. Reviewing the actual physical warranty PDFs (Canva-designed) revealed a distinct format: sequentially numbered sections (§1–§7), a formal serif layout, and specific per-template section headings. Users required "exact" match to these physical documents.

**Decision:**  
Warranty certificates use a numbered-section layout matching the physical PDF format. Sections are dynamically numbered — only sections with content receive a badge. The header uses **Playfair Display** serif (800 weight) for the brand logo, and **Times New Roman** for body text. Warranty generation is automatic at quotation creation (no separate wizard form), with inline editing for certificate details.

**Format Structure:**
```
Header:     Playfair Display 36px brand logo + uppercase product line
Banner:     "WARRANTY CERTIFICATE" with double border
Opening:    Italic "Dear Customer," + congratulatory text
§1:         Warrantor / Manufacturer Details
§2:         Certificate Quality Compliance
Duration:   Accent callout block (not numbered)
§3:         Product Information
§4 + §5:   Conditions + Exclusions (two-column layout)
§6:         Guarantees / Remedies
§7:         Warranty Period by Series (table)
Details:    Certificate Details registry (inline-editable)
Footer:     Signature line + Authorized stamp
```

**Per-template variations:**
| Template | §1 Heading | Product Info Style | §6 Heading |
|----------|-----------|-------------------|------------|
| Docke PIE | "Warrantor" | Paragraph | "Manufacturer Guarantees" |
| NJ Laminated | "Warrantor" | Paragraph | "Manufacturer Guarantees" |
| Stone Coated | "Manufacturer / Company Details" | Bullet list | "Remedy & Transferability" |
| Heatout | "Manufacturer / Company Details" | Paragraph | "Graduated Liability Schedule & Color Warranty" |
| Ceramic | "Manufacturer / Company Details" | Paragraph | "Manufacturer Guarantees" |

**Alternatives Considered:**
- Keep generic un-numbered sections (original approach) — rejected because it didn't match physical PDFs
- Wizard-based warranty form with sidebar + progress bar — rejected as "clunky"; users preferred auto-generation + inline editing
- PDF-first rendering (generate PDF directly, no HTML preview) — rejected because WYSIWYG preview is essential for the inline-edit workflow

**Consequences:**
- Both `WarrantyDocument.jsx` (standalone) and `QuotationDocument.jsx` (warranty tab) render identically
- CSS class names use `wd-` prefix (warranty-doc) to avoid conflicts
- Playfair Display font added to Google Fonts CDN import in `index.html`
- Inline editing via `EditableCell` component allows post-generation corrections
- Print/PDF output matches screen preview exactly via `@media print` rules
