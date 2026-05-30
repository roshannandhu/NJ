# UI_UX.md
# Design System and Component Specification

---

## 1. Design Philosophy

**Premium. Warm. Professional.**

Not corporate-cold. Not Silicon Valley blue. Echoes of high-end Kerala home-care brand sensibility:
- Warm cream backgrounds instead of flat white
- Dark charcoal sidebar instead of light grey
- Burnt terracotta orange as the accent (earthy, premium)
- Generous whitespace and restrained typography
- Every element feels considered, not templated

**Target feeling:** The app should feel like a quality business tool — not a spreadsheet, not a generic SaaS dashboard.

---

## 2. Colour Palette

```css
:root {
  /* Backgrounds */
  --bg:           #faf8f4;  /* Main background — warm off-white */
  --bg-warm:      #f4efe6;  /* Hover backgrounds, card insets */
  --surface:      #ffffff;  /* Cards and surfaces */

  /* Text */
  --ink:          #1a1a1a;  /* Primary text — deep charcoal */
  --ink-mid:      #4a463f;  /* Secondary text */
  --ink-soft:     #8a857a;  /* Tertiary text, labels, placeholders */

  /* Borders */
  --line:         #e5e1d8;  /* Standard borders */
  --line-soft:    #efeae0;  /* Subtle dividers */

  /* Accent (Burnt Terracotta Orange) */
  --accent:       #c2410c;  /* Primary accent */
  --accent-soft:  #fef3e9;  /* Accent backgrounds */
  --accent-deep:  #7c2d12;  /* Dark accent for prices, important values */

  /* Companions */
  --gold:         #b8862a;  /* Gold companion for gradients */
  --green:        #4a6b3a;  /* Success, done states */
  --red:          #a3392d;  /* Error, delete states */

  /* Shadows */
  --shadow-sm:    0 1px 2px rgba(60, 50, 30, 0.04);
  --shadow-md:    0 4px 20px rgba(60, 50, 30, 0.06);
  --shadow-lg:    0 20px 60px rgba(60, 50, 30, 0.12);

  /* Radii */
  --radius-sm:    6px;
  --radius:       10px;
  --radius-lg:    16px;

  /* Fonts */
  --font-display: 'Fraunces', Georgia, serif;
  --font-body:    'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
}
```

### Colour Usage Rules

| Context | Colour |
|---------|--------|
| Page background | `--bg` |
| Cards, modals, inputs | `--surface` |
| Hover states | `--bg-warm` |
| Primary text | `--ink` |
| Muted text, labels | `--ink-soft` |
| Prices, important values | `--accent-deep` |
| Buttons (hover state) | `--accent` |
| Success / Complete | `--green` |
| Delete / Error | `--red` |
| Quotation ID, timestamps | `--font-mono` |

---

## 3. Typography

### Font Families

| Role | Font | Weight | Use |
|------|------|--------|-----|
| Display | Fraunces (serif) | 400, 500, 600 | Page titles, card titles, quotation document headers |
| Warranty Display | Playfair Display (serif) | 400–900 | Warranty certificate brand logo heading |
| Body | Inter (sans-serif) | 300–700 | All UI text, labels, descriptions |
| Mono | JetBrains Mono | 400, 500 | IDs, timestamps, codes |

### Type Scale

| Token | Size | Weight | Case | Use |
|-------|------|--------|------|-----|
| `page-title` | 24px | 400 | Normal | Topbar page title (Fraunces) |
| `section-title` | 22px | 400 | Normal | Card section titles (Fraunces) |
| `body` | 14px | 400 | Normal | General text |
| `label` | 10–11px | 500–600 | UPPERCASE | Form labels, section badges |
| `meta` | 11–12px | 400–500 | Normal | Supporting info |
| `mono` | 12px | 400 | Normal | IDs, dates (JetBrains Mono) |
| `document-header` | 28px | 600 | Normal | Company name on PDF (Fraunces) |
| `document-body` | 12–13px | 400 | Normal | PDF content (Times New Roman serif) |

---

## 4. Component Specifications

### 4.1 Sidebar

```
Width: 240px
Background: #1a1a1a (dark charcoal)
Position: sticky, full height
Border-right: 1px solid #2a2a2a

Brand area:
  - Logo: "NJ." in Fraunces 28px, white; dot in --accent
  - Tag: "Home Care · Kerala" in 10px uppercase, #8a857a

Navigation items:
  - Padding: 11px 14px
  - Border-radius: 8px
  - Default colour: #a8a298
  - Hover: background #252525, text #f0ebe1
  - Active: background #faf8f4, text #1a1a1a (white pill)
  - Icon: 18px, stroke 1.5, currentColor

Footer:
  - Company name + address in 11px, #6a6558
```

### 4.2 Topbar

```
Height: ~70px
Background: rgba(250, 248, 244, 0.92) + backdrop-filter: blur(10px)
Border-bottom: 1px solid var(--line)
Position: sticky top:0, z-index:50
Left: page title (Fraunces 24px, weight 400) + subtitle (12px, ink-soft)
Right: Cart button (pill shape with badge)
```

### 4.3 Class Card (Home Grid)

```
Background: var(--surface)
Border: 1px solid var(--line)
Border-radius: var(--radius-lg) = 16px
Overflow: hidden
Cursor: pointer

Hover:
  transform: translateY(-2px)
  box-shadow: var(--shadow-md)
  border-color: var(--ink-soft)

Image area: 180px height, background var(--bg-warm)
Arrow button: 36px circle, top-right, white → accent on card hover
Card body: class label (accent, uppercase) + title (Fraunces 22px) + desc (14px, ink-mid)
```

### 4.4 Variety Card

```
Background: var(--surface)
Border: 1px solid var(--line)
Border-radius: var(--radius) = 10px
Image area: 140px height
Body: variety name (Fraunces 17px) + price (accent-deep, 13px) + unit (ink-soft)

Hover:
  border-color: var(--accent)
  box-shadow: var(--shadow-sm)
```

### 4.5 Colour Swatch

```
Border: 1.5px solid var(--line)
Border-radius: var(--radius-sm) = 6px
Padding: 10px

Swatch preview: 40px height, border-radius: 4px
Name: 11px, weight 500
Offset: 10px, ink-soft

Hover: border-color: var(--accent)
Selected: border-color: var(--accent) + background: var(--accent-soft)
```

### 4.6 Primary Button (`.btn-primary`)

```
Background: var(--ink) → var(--accent) on hover
Color: white
Padding: 14px 28px
Font: 13px, weight 500, uppercase, letter-spacing 0.04em
Border-radius: var(--radius-sm)
Transition: 0.2s all

Variants:
  - Green variant: background: var(--green) (for Done, Next Warranty)
  - Danger: background: var(--red) (for delete confirmations)
```

### 4.7 Secondary Button (`.btn-secondary`)

```
Background: var(--surface)
Color: var(--ink)
Border: 1px solid var(--line)
Padding: 11px 20px
Border-radius: var(--radius-sm)

Hover: border-color: var(--ink)
```

### 4.8 Cart Drawer

```
Width: 440px
Position: fixed right:0, top:0, bottom:0
Background: var(--bg)
Box-shadow: -10px 0 40px rgba(0,0,0,0.1)
Transform: translateX(100%) → translateX(0) when .open
Transition: 0.35s cubic-bezier(0.4, 0, 0.2, 1)

Header: padding 24px 28px, border-bottom
Body: flex:1, overflow-y:auto, padding 8px 0
Footer: border-top, background surface, padding 20px 28px

Cart item grid: 60px icon | 1fr info | auto price
Qty mini: 24px × 26px buttons, 40px × 26px input

Total: Fraunces 30px
Actions: 2-column grid (Keep Adding | Generate)
```

### 4.9 Modal

```
Overlay: rgba(20,18,12,0.5), fixed inset:0
Modal box: max-width 640px, max-height 90vh, overflow-y auto
Border-radius: var(--radius-lg) = 20px
Box-shadow: var(--shadow-lg)

Header: padding 24px 32px 16px, border-bottom, flex space-between
Body: padding 24px 32px
Footer: padding 16px 32px 24px, border-top, flex end, gap 10px
```

### 4.10 Settings Tabs

```
Tab bar: border-bottom 1px var(--line)
Each tab: padding 12px 20px, 13px weight 500
Inactive: color ink-soft
Hover: color ink
Active: color ink + border-bottom 2px solid var(--accent)
```

### 4.11 Toggle

```
Width: 40px, height: 22px
Background (off): var(--line)
Background (on): var(--accent)
Knob: 18px × 18px white circle
Transition: 0.2s background
Knob translate (on): translateX(18px)
Border-radius: 100px
```

### 4.12 Toast

```
Position: fixed bottom:30px right:30px
Background: var(--ink)
Color: white
Padding: 14px 22px
Border-radius: var(--radius) = 10px
Font: 13px, weight 500
Box-shadow: var(--shadow-lg)
Z-index: 3000

Animation:
  Start: opacity:0, translateY(20px)
  End: opacity:1, translateY(0)
  Duration: 0.3s
  Auto-dismiss: 2.4 seconds
```

### 4.13 History Table

```
Container: var(--surface), border var(--line), border-radius radius-lg

Header row: background var(--bg-warm), 11px uppercase, ink-soft, padding 14px 22px
Grid: 110px 1fr 1fr 110px 120px 120px

Data row: padding 16px 22px, border-bottom line-soft
Hover: background var(--bg-warm)
ID column: font-mono, 12px, ink-soft
Name column: font-weight 500
Amount column: font-weight 500
```

---

## 5. Document Styles (Quotation & Warranty PDFs)

### Quotation Document

```
Container: white, padding 50px 60px, width 794px (A4)
Font: Times New Roman, serif
Color: #1a1a1a

Header: text-center, border-bottom 2px solid #1a1a1a
  Company name: Fraunces 28px, weight 600
  Address: 11px, #444, line-height 1.6

Meta row: flex space-between, 13px
  Left: "Quotation To:" bold + customer info
  Right: "Date:" + ID aligned right

Section title: text-center, Fraunces 18px uppercase, background #f4efe6, top+bottom border

Product box: 2-column grid (info | image 200px)

Table headers: background #1a1a1a, white text, 11px, letter-spacing
Table cells: border-bottom #e0dac9, numeric columns right-aligned

Tax rows: right-aligned, 12px, #444
Total box: background #1a1a1a, white, Fraunces 22px amount

Terms: h4 uppercase with bottom border, li with ◆ bullet in accent

Footer: 2-column signature lines
```

### Warranty Document (Numbered-Section Format)

```
Container: white, padding 48px 56px, width 794px, min-height 1120px
Font: Times New Roman, Georgia, serif
Font-size: 11px, line-height: 1.65

Header (.wd-header):
  Brand logo: Playfair Display 36px weight 800, text-center
  Product line: 12px uppercase, #7c2d12, letter-spacing 0.22em
  Separator: border-bottom 2.5px solid #1a1a1a

Banner (.wd-banner):
  text-center, 14px, letter-spacing 0.25em, uppercase
  Double border: top+bottom 2px solid #1a1a1a

Opening (.wd-opening):
  "Dear Customer," in italic + congratulatory paragraph
  Font-size 11px, justified text

Numbered Sections (.wd-section):
  Section heading (.wd-section-head):
    10px uppercase, weight 800, letter-spacing 0.14em
    border-bottom 1px solid #bbb
    Number badge (.num): 18×18px, background #1a1a1a, white text,
      border-radius 3px, margin-right 8px
  Section body (.wd-body):
    11px, line-height 1.7, color #333
    <pre> for manufacturer details, <ul> for bullet lists
    <p> for product info paragraphs

Duration callout (.wd-duration):
  background #fdf7f4, border-left 4px solid #7c2d12
  font-size 12px, font-weight 700, color #7c2d12
  Micro label: 8px uppercase, opacity 0.7

Two-column layout (.wd-two-col):
  grid-template-columns: 1fr 1fr, gap: 16px
  Used for Conditions (§4) + Exclusions (§5) side-by-side

Series table (.wd-table):
  width: 100%, border-collapse: collapse
  Header row: background #1a1a1a, white text, 9px uppercase
  Duration cell: font-weight 700, color #7c2d12

Certificate details (.wd-cert-details):
  border-top 2px solid #1a1a1a
  Key-value grid: 180px labels | 1fr values
  Label: color #555, weight 500
  Value: weight 700, color #1a1a1a
  Row divider: 1px dotted #ccc
  Inline-editable in standalone WarrantyDocument view

Footer (.wd-footer): 2-column grid
  Left: Seller's Signature line (150px border-bottom)
  Right: Circular stamp (78px, double border #7c2d12)
    NOUFAL & JABBAR / INTERNATIONAL LLP / RAMANATTUKARA / NJINDIA.IN

Watermark (.wd-watermark):
  position absolute, centered, rotated -32deg
  font-size 80px, color rgba(124,45,18,0.025)

Print CSS: hides sidebar, topbar, action bars, edit hints
  @page { size: A4; margin: 0; }
  padding: 14mm 18mm
```

Section numbering is dynamic — only sections with content get a number badge.

Per-template section heading overrides:
| Template | Section 1 | Product Info | Guarantees |
|----------|-----------|-------------|------------|
| Docke PIE | "Warrantor" | Paragraph | "Manufacturer Guarantees" |
| NJ Laminated | "Warrantor" | Paragraph | "Manufacturer Guarantees" |
| Stone Coated | "Manufacturer / Company Details" | Bullet list | "Remedy & Transferability" |
| Heatout | "Manufacturer / Company Details" | Paragraph | "Graduated Liability Schedule & Color Warranty" |
| Ceramic | "Manufacturer / Company Details" | Paragraph | "Manufacturer Guarantees" |

---

## 6. Animation System

All animations use `cubic-bezier(0.4, 0, 0.2, 1)` — the standard "ease-in-out-quad".

| Element | Animation | Duration |
|---------|-----------|---------|
| Class cards (initial) | fadeUp (opacity + translateY(8px)) | 0.3s, staggered 50ms |
| Variety cards | fadeUp staggered 40ms | 0.3s |
| Cart drawer | translateX(100% → 0) | 0.35s |
| Modal | display:none → flex (no animation — instant for modals) | — |
| Hover on cards | transform, box-shadow, border-color | 0.15–0.25s |
| Toggle | background, transform | 0.2s |
| Toast | opacity + translateY | 0.3s |
| Progress bar fill | width | 0.4s |

---

## 7. Layout System

```
App shell:
  display: grid
  grid-template-columns: 240px 1fr

Main content:
  display: flex
  flex-direction: column
  min-height: 100vh

Content area:
  padding: 32px 40px 80px

Customer card:
  display: grid
  grid-template-columns: repeat(4, 1fr)
  gap: 20px

Class grid:
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))
  gap: 18px

Variety grid:
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))
  gap: 16px

Variety detail:
  display: grid
  grid-template-columns: 1.2fr 1fr
  gap: 32px

Cart item:
  display: grid
  grid-template-columns: 60px 1fr auto
  gap: 14px
```

---

## 8. Empty States

Every list has a centred empty state:

```
Icon: 56px, stroke currentColor, opacity 0.3
Title: Fraunces 22px, weight 400
Description: 14px, ink-soft
CTA button: btn-primary with relevant action
```

Example:
```
[document icon]
No quotations yet
Generate your first quotation from the home page.
[Start New Quotation]
```

---

## 9. Responsive Considerations

Primary target: **Desktop 1280px+** (single workstation screen)

Secondary support: **1024px** (smaller monitors)

Not a priority: mobile or tablet (single internal tool)

At 1024px: customer card reduces to 2-column grid. Class cards may stack earlier.

No hamburger menu — sidebar is always visible.

---

## 10. Print Media CSS

```css
@media print {
  .sidebar, .topbar, .cart-drawer, .cart-overlay,
  .modal-overlay, .btn-primary, .btn-secondary,
  .cert-actions-bar, .cert-edit-hint { display: none !important; }
  .content { padding: 0; }
  .doc-output, .warranty-doc {
    box-shadow: none;
    margin: 0;
    border: none;
    width: 100% !important;
    max-width: 100% !important;
  }
  .warranty-doc { padding: 14mm 18mm !important; }
  @page { size: A4; margin: 0; }
}
```
