import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, RotateCcw, ShieldCheck, FileText, Download, Edit3, Share2, ImagePlus, X, Eye, EyeOff, Palette, Wallet, PackagePlus } from 'lucide-react';
import { mediaUrl, createQuotation, createWarranty, uploadImage } from '../api';
import { elementToPdf, elementToPdfFile, elementsToPdf, elementsToPdfFile, shareFiles, quotationFileName, warrantyFileName, beginPdfSave, finishPdfSave } from '../share';
import { buildWarrantyCertsForQuotation } from '../warranty';
import { paginateQuotation } from '../quotationPagination';
import { addonItemsOf, addonTotalOf, addonSavingsOf, allItemsOf, formatAddedAt } from '../addons';
import BrandWatermark from './BrandWatermark';
import { watermarkBrandForItems, resolveQuotationBrand, companyProfileForBrand } from '../brands';
import WarrantyCertificate from './WarrantyCertificate';

// Preset design colors offered on the quotation page (first is the original plum).
const THEME_PRESETS = ['#8a1856', '#1e3a8a', '#14532d', '#c2410c', '#1f2937'];

// ── Inline-Editable Cell (click text on the quotation to edit in place) ──────
function EditableCell({ value, onSave, multiline = false, numeric = false, style = {}, renderValue, placeholder = 'click to edit' }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const downPos = React.useRef(null);

  const startEditing = () => { setDraft(value ?? ''); setEditing(true); document.body.setAttribute('data-quotation-editing', 'true'); };
  const stopEditing  = () => { setEditing(false); document.body.removeAttribute('data-quotation-editing'); };
  const commit = () => { stopEditing(); if (String(draft) !== String(value ?? '')) onSave(numeric ? (parseFloat(draft) || 0) : draft); };

  // A plain click opens edit mode, but dragging to highlight text — or clicking
  // while a selection is active — must NOT, or the <span> is swapped for an
  // <input> mid-selection and the value can never be copied. This guard keeps
  // single-click-to-edit while letting users select & Ctrl+C any displayed text.
  const onMouseDown = (e) => { downPos.current = { x: e.clientX, y: e.clientY }; };
  const handleClick = (e) => {
    const moved = downPos.current && (Math.abs(e.clientX - downPos.current.x) > 3 || Math.abs(e.clientY - downPos.current.y) > 3);
    const sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    const selecting = sel && !sel.isCollapsed && sel.toString().trim().length > 0;
    if (moved || selecting) return;
    startEditing();
  };

  if (editing) {
    const s = {
      width: '100%', border: 'none', borderBottom: '1.5px solid #8a1856',
      background: 'rgba(138,24,86,0.05)', padding: '1px 3px',
      fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit',
      color: 'inherit', textAlign: 'inherit', outline: 'none', boxSizing: 'border-box', ...style,
    };
    return multiline
      ? <textarea autoFocus value={draft} style={s}
          ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
          onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value ?? ''); stopEditing(); } }} />
      : <input autoFocus type={numeric ? 'number' : 'text'} value={draft} style={s}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); stopEditing(); } }} />;
  }

  const isEmpty = value == null || value === '';
  const display = renderValue ? renderValue(value) : (isEmpty ? <span style={{ color: '#bbb', fontStyle: 'italic' }}>{placeholder}</span> : value);
  return (
    <span onMouseDown={onMouseDown} onClick={handleClick} title="Click to edit · drag to select & copy"
      className="q-editable" style={{ cursor: 'text', userSelect: 'text', WebkitUserSelect: 'text', ...style }}>
      {display}
    </span>
  );
}

// ── Fixed-size, multi-page quotation layout ──────────────────────────────────
// Every quotation element renders at a FIXED size — fonts, row heights, spacing
// and logos never scale. When the content outgrows one A4 page (794×1123px) it
// flows onto additional pages with clean breaks (no row or section is ever
// cut): a layout effect measures each content block at its fixed size and a
// pure paginator (quotationPagination.js) assigns the FLOWING blocks (spec
// table, item rows, totals) to pages. Every page repeats the same fixed chrome
// — header band, customer block, Terms & Conditions, validity row and a slim
// "Page X of Y" footer — and because that chrome renders from the one shared
// document state, an edit made on ANY page reflects on every page.
//
// QFIT survives from the old single-page fit engine: with `--q-fit` never set,
// every QFIT(n) resolves to plain `n`px (the var's default is 1).
const QFIT = (n) => `calc(${n}px * var(--q-fit, 1))`;
// Fixed header band sizes (never scale) — the loosest legacy tier's values.
const HDR = { h: '90px', font: '42px', h1: '22px', info: '11px', lh: 1.65, divMb: '12px' };
// Fixed page padding (defines the A4 margins; excluded from the scaled body).
const PAGE_PAD = '40px 50px';
// Body sizes, each scaled by --q-fit. Line-heights stay unitless (they already
// scale with the font). Terms font matches the line-item rows ("same size as the
// quotation details"). Markup references these as `D.*` (see `const D = QD`).
const QD = {
  rowPad:  `${QFIT(13)} ${QFIT(8)}`,
  rowFont: QFIT(13),
  subFont: QFIT(11),
  tblMb:   QFIT(24),
  tcMt:    QFIT(28),
  footMt:  QFIT(36),
  specH:   QFIT(110),
  specPad: `${QFIT(18)} ${QFIT(24)}`,
  tcLineH: 1.65,
  tcFs:    QFIT(12),
  termsFs: QFIT(13),
  termsLH: 1.6,
  termsMb: QFIT(5),
  custMb:  QFIT(20),
};
// A4 page height in px at 96dpi (794×1123 = 210×297mm).
const A4 = 1123;

function QuotationDocumentInner() {
  const {
    activeQuotation: generatedDoc,
    data, 
    setData, 
    setCurrentView, 
    setCart, 
    setCustomer, 
    setActiveQuotation,
    setActiveWarranty,
    setActiveQuotationId,
    loadQuotationForEdit,
    startAddonOrder,
    cancelAddonOrder,
    activeTab,
    setActiveTab,
    showToast,
    persistConfig
  } = useAppContext();

  const settings = data.settings || {};
  // The quotation's PARENT BRAND drives all document branding (header, footer,
  // logo). Resolved LIVE from the line items (renaming a brand or editing its
  // profile updates every document); the brandId stored at checkout is only a
  // safety net for quotations whose items can no longer resolve a brand.
  const docBrand = resolveQuotationBrand(allItemsOf(generatedDoc), data)
    || (generatedDoc?.brandId ? (data.brands || []).find(b => b.id === generatedDoc.brandId) : null)
    || null;
  // Per-brand company profile; only the no-brand/NJ paths may show NJ data.
  const profile = companyProfileForBrand(docBrand, data);
  const njBranded = profile.isGlobalFallback || docBrand?.id === 'nj';
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);
  // Native color-picker draft: held locally while dragging, committed on close
  // so we don't fire a backend upsert per drag tick.
  const [draftColor, setDraftColor] = React.useState(null);

  // ── In-place quotation editing (CHANGE 3) — warranty-style inline editing ──
  // The quotation document itself is directly editable: click any field to edit
  // it on the sheet (see EditableCell). Each commit recomputes totals, updates
  // the active quotation + registry, and upserts to the backend. Edits affect
  // ONLY this quotation — master products/settings are never touched.
  const doc = generatedDoc;

  // ── Add-on Order derived values ──
  // Add-on batches live in doc.addons (see ../addons.js); the original `items`
  // array is never touched by the add-on flow. docAllItems is the whole order
  // for consumers that must see every product (brand, spec table, warranties).
  const docAddonItems = addonItemsOf(doc);
  const docHasAddons = docAddonItems.length > 0;
  const docAllItems = docHasAddons ? allItemsOf(doc) : (doc.items || []);

  // Recompute all totals from line items + tax/discount, mirroring Checkout math.
  const recomputeTotals = (d) => {
    const items = d.items || [];
    const isOffer = (it) => it.actualPrice != null && it.actualPrice > 0 && it.price < it.actualPrice;
    const actualUnit = (it) => (isOffer(it) ? it.actualPrice : it.price);
    const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
    const actualSubtotal = items.reduce((s, it) => s + actualUnit(it) * (Number(it.qty) || 0), 0);
    const productSavings = Math.max(0, Math.round((actualSubtotal - subtotal) * 100) / 100);
    const hasOffers = items.some(isOffer);
    const discountAmount = d.discountEnabled
      ? (d.discountType === 'percent' ? Math.round(subtotal * (Number(d.discountValue) || 0)) / 100 : Math.min(Number(d.discountValue) || 0, subtotal))
      : 0;
    const taxableAmount = subtotal - discountAmount;
    const taxRate = d.taxEnabled ? (Number(d.taxRate) || Number(settings.taxRate) || 0) : 0;
    const taxAmount = Math.round(taxableAmount * taxRate) / 100;
    const grandTotal = taxableAmount + taxAmount;

    // ── Add-on Order totals ──
    // The original section's math above never changes (it reads only the
    // untouched original inputs, so its result is frozen in effect). Add-ons
    // carry NO tax and NO discount: addonTotal is a plain sum, and the stored
    // grandTotal becomes original + add-on so History/backup keep working.
    if (Array.isArray(d.addons) && d.addons.length) {
      const addons = d.addons.filter(b => (b.items || []).length > 0); // drop emptied batches
      if (addons.length) {
        const addonTotal = addonTotalOf({ addons });
        const originalGrandTotal = Math.round(grandTotal * 100) / 100;
        const updatedGrand = Math.round((originalGrandTotal + addonTotal) * 100) / 100;
        const adv = Math.min(Math.max(0, Number(d.advanceReceived) || 0), updatedGrand);
        return {
          ...d, addons, subtotal, actualSubtotal, productSavings, hasOffers, taxRate, taxAmount, discountAmount,
          originalGrandTotal, addonTotal, grandTotal: updatedGrand,
          advanceReceived: adv, balanceDue: Math.round((updatedGrand - adv) * 100) / 100,
        };
      }
      // every add-on item removed → revert to the plain (legacy) shape
      d = { ...d, addons: [] };
    }

    // Advance received is a payment against the total, applied AFTER tax. It is
    // re-clamped on every edit so shrinking the order never leaves balanceDue < 0.
    const advanceReceived = Math.min(Math.max(0, Number(d.advanceReceived) || 0), grandTotal);
    const balanceDue = Math.round((grandTotal - advanceReceived) * 100) / 100;
    return { ...d, subtotal, actualSubtotal, productSavings, hasOffers, taxRate, taxAmount, discountAmount, grandTotal, advanceReceived, balanceDue };
  };

  // Refresh a linked warranty's snapshot from the edited quotation, WITHOUT
  // changing its id/template (so certificate numbers never churn). Customer and
  // line items are re-synced; the product the warranty points at is preserved
  // (selectedCartId) when that line still exists, otherwise re-derived. Any
  // field the user can't reach from the quotation (sellerName, batchNo, …) is
  // left untouched.
  const syncCertToQuotation = (cert, updatedDoc) => {
    const items = allItemsOf(updatedDoc); // originals + add-on items
    let sel = items.find(it => it.cartId === cert.certData?.selectedCartId);
    if (!sel) sel = items.find(it => it.className === cert.template?.forClass) || items[0] || null;
    return {
      ...cert,
      customer: { ...(updatedDoc.customer || {}) },
      items: items.map(it => ({ ...it })),
      certData: {
        ...cert.certData,
        siteAddress: (updatedDoc.customer || {}).address ?? cert.certData?.siteAddress ?? '',
        productName: sel?.name ?? cert.certData?.productName,
        productColor: sel?.color ?? cert.certData?.productColor,
        productQty: sel?.qty ?? cert.certData?.productQty,
        productUnit: sel?.unit ?? cert.certData?.productUnit,
        selectedCartId: sel?.cartId ?? cert.certData?.selectedCartId ?? '',
      },
    };
  };

  // Persist an updated quotation: context (active + registry) + backend upsert,
  // and keep its bundled warranties in sync so they never show stale customer
  // or line-item details after an inline edit.
  const persistDoc = (updatedDoc) => {
    const linked = (data.warranty_certificates || []).filter(w => w.quotationId === updatedDoc.id);
    const updatedCerts = linked.map(c => syncCertToQuotation(c, updatedDoc));
    const certById = new Map(updatedCerts.map(c => [c.id, c]));

    setActiveQuotation(updatedDoc);
    setData(prev => {
      const h = prev.quotations || [];
      const i = h.findIndex(q => q.id === updatedDoc.id);
      const nh = i !== -1 ? h.map(q => (q.id === updatedDoc.id ? updatedDoc : q)) : [updatedDoc, ...h];
      const certs = updatedCerts.length
        ? (prev.warranty_certificates || []).map(c => certById.get(c.id) || c)
        : prev.warranty_certificates;
      return { ...prev, quotations: nh, warranty_certificates: certs };
    });
    createQuotation(updatedDoc).catch(() => {}); // fire-and-forget; local copy already saved
    updatedCerts.forEach(c => createWarranty(c).catch(() => {}));
  };
  // Apply a top-level patch to the current quotation, recompute, and persist.
  const commitDoc = (patch) => persistDoc(recomputeTotals({ ...generatedDoc, ...patch }));

  // Persist a single warranty certificate (per-cert fields like watermarkEnabled)
  // without touching the quotation. Mirrors WarrantyDocument's persistWarranty.
  const persistCert = (updated) => {
    setData(prev => ({
      ...prev,
      warranty_certificates: (prev.warranty_certificates || []).map(c =>
        ((c.warrantyNo || c.id) === (updated.warrantyNo || updated.id)) ? updated : c),
    }));
    createWarranty(updated).catch(() => {}); // fire-and-forget; local copy already saved
  };

  // Set this quotation's theme color AND remember it as the default for new
  // quotations. The settings write MUST use the functional setData form so it
  // composes with the registry update commitDoc just queued (object form would
  // clobber it with a stale snapshot).
  const applyThemeColor = (c) => {
    commitDoc({ themeColor: c });
    setData(prev => ({ ...prev, settings: { ...prev.settings, quotationThemeColor: c } }));
    persistConfig({ ...data, settings: { ...data.settings, quotationThemeColor: c } });
  };

  // Field-level editing helpers
  const updateField     = (field, value) => commitDoc({ [field]: value });
  const updateCustomer  = (field, value) => commitDoc({ customer: { ...(generatedDoc.customer || {}), [field]: value } });
  const updateItemField = (cartId, field, value) => commitDoc({ items: generatedDoc.items.map(it => it.cartId === cartId ? { ...it, [field]: value } : it) });
  const removeItemRow   = (cartId) => commitDoc({ items: generatedDoc.items.filter(it => it.cartId !== cartId) });
  const addItemRow      = () => commitDoc({ items: [...generatedDoc.items, { cartId: 'custom_' + Date.now(), id: 'custom', name: 'Custom Service / Item', className: 'Custom', price: 0, actualPrice: 0, qty: 1, unit: 'nos', color: '' }] });
  const updateClassDesc = (key, value) => commitDoc({ classDescriptions: { ...(generatedDoc.classDescriptions || {}), [key]: value } });
  // Per-quotation product image for a class (overrides the catalogue), keyed like
  // classDescriptions. Stored on the doc so it only affects THIS quotation.
  const updateClassImage = (key, url) => commitDoc({ classImages: { ...(generatedDoc.classImages || {}), [key]: url } });
  // termsCustomized: hand-edited terms stick to THIS quotation; without the
  // flag, re-finalizing from Checkout refreshes terms from Settings.
  const updateTerms     = (text) => commitDoc({ terms: text.split('\n'), termsCustomized: true });
  const updateBankField = (field, value) => commitDoc({ bank: { ...(generatedDoc.bank || {}), [field]: value } });
  // Set a line's unit price. With no active offers, keep price == actualPrice so the
  // single "Actual Price" column drives the total; otherwise edit each independently.
  const setItemUnitPrice = (cartId, v) => commitDoc({ items: generatedDoc.items.map(it => it.cartId === cartId ? { ...it, price: v, actualPrice: v } : it) });

  // ── Add-on row editing (requirement: add-ons stay editable/removable) ──
  // Rows are addressed by (batchId, cartId) so edits land in the right batch;
  // recomputeTotals drops batches whose last item was removed.
  const updateAddonItemField = (batchId, cartId, field, value) => commitDoc({
    addons: (generatedDoc.addons || []).map(b => b.id !== batchId ? b
      : { ...b, items: (b.items || []).map(it => it.cartId === cartId ? { ...it, [field]: value } : it) }),
  });
  const removeAddonItemRow = (batchId, cartId) => commitDoc({
    addons: (generatedDoc.addons || []).map(b => b.id !== batchId ? b
      : { ...b, items: (b.items || []).filter(it => it.cartId !== cartId) }),
  });
  const setAddonItemUnitPrice = (batchId, cartId, v) => commitDoc({
    addons: (generatedDoc.addons || []).map(b => b.id !== batchId ? b
      : { ...b, items: (b.items || []).map(it => it.cartId === cartId ? { ...it, price: v, actualPrice: v } : it) }),
  });

  const startNew = () => {
    cancelAddonOrder?.(); // a pending add-on session must not leak into the new draft
    setCart([]);
    setCustomer({ name: '', phone: '', email: '', address: '' });
    setActiveQuotation(null);
    setActiveWarranty(null);
    setActiveQuotationId?.(null); // end the draft session → next generate mints a fresh id
    if (setActiveTab) setActiveTab('quotation');
    setCurrentView('quotation_desk');
  };

  const downloadQuotationPDF = async () => {
    if (isDownloading) return;

    const element = document.getElementById("quotationSheet");
    if (!element) {
      showToast("Quotation sheet element not found.", "error");
      return;
    }

    // Ask where to save FIRST (while the click is still "fresh"), then render.
    const qName = `NJ_Quotation_${generatedDoc.id || 'Draft'}_${generatedDoc.customer.name.replace(/\s+/g, '_')}.pdf`;
    const dest = await beginPdfSave(qName);
    if (dest.mode === 'cancelled') { showToast("Save cancelled", "info"); return; }

    setIsDownloading(true);
    showToast("Generating PDF...", "info");

    try {
      // One engine: full-size A4, one capture per quotation page (never shrunk).
      // Identical to Share. With installation guidance on, append one clean page
      // per class.
      const els = collectQuotationPdfEls();
      const pdf = await elementsToPdf(els);
      const r = await finishPdfSave(pdf, qName, dest);
      showToast(r === 'saved' ? "Quotation PDF saved!" : "Quotation PDF downloaded!", "success");
    } catch (error) {
      console.error("PDF download failed:", error);
      showToast("PDF generation failed.", "error");
    } finally {
      setIsDownloading(false);
    }
  };
  const warrantyInnerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const inner = warrantyInnerRef.current;
    if (!inner) return;
    const wrapper = inner.parentElement;
    const AVAIL_H = wrapper.clientHeight;
    const AVAIL_W = wrapper.clientWidth; // Typically 690px

    inner.style.transform = 'none';
    inner.style.width = AVAIL_W + 'px';
    
    let best_s = 1;
    inner.style.transform = 'none';
    inner.style.width = AVAIL_W + 'px';
    
    if (inner.offsetHeight > AVAIL_H) {
      let low = 0.4, high = 1.0;
      for (let i = 0; i < 15; i++) {
        let mid = (low + high) / 2;
        inner.style.width = (AVAIL_W / mid) + 'px';
        inner.style.transform = `scale(${mid})`;
        if (inner.offsetHeight * mid <= AVAIL_H) {
          best_s = mid;
          low = mid;
        } else {
          high = mid;
        }
      }
    }
    
    inner.style.width = (AVAIL_W / best_s) + 'px';
    inner.style.transform = `scale(${best_s})`;
  });


  // ── Pagination state ──
  // `pages` = array of pages, each an ordered list of typed segments (see
  // quotationPagination.js). `null` means "measuring pass": render EVERYTHING on
  // one (overflowing, clipped) page so the layout effect below can measure each
  // block at its fixed size before the first paint shows a settled layout.
  const qPagesWrapRef = React.useRef(null);
  const [qPages, setQPages] = React.useState(null);
  // Bumped once fonts / images finish loading, to re-measure final heights.
  const [layoutTick, setLayoutTick] = React.useState(0);
  // Re-render budget per content state — stops any measure/assign oscillation
  // (sub-pixel wrap jitter) from cascading renders.
  const qPagIterRef = React.useRef(0);

  // A genuinely different document (new/imported/loaded): restart from the
  // measuring pass.
  React.useLayoutEffect(() => {
    qPagIterRef.current = 0;
    setQPages(null);
  }, [generatedDoc?.id]);

  // Re-arm the budget on any content edit or font/image tick — WITHOUT dropping
  // back to the single measuring page (no flicker; blocks are re-measured in
  // place across the already-rendered pages).
  React.useLayoutEffect(() => {
    qPagIterRef.current = 0;
  }, [generatedDoc, layoutTick]);

  // Measure-and-assign: read every block's fixed-size height (offsetHeight is
  // transform-immune, so the on-screen preview scale can't pollute it), then ask
  // the pure paginator for the page assignment. Heights are position-independent
  // (constant content width on every page; items table is table-layout:fixed),
  // so the second pass measures identical values and converges.
  //
  // Fixed per-page chrome (header band, customer block, Terms & Conditions,
  // validity row, page footer) repeats on EVERY page — its height is subtracted
  // from the budget; only spec/item rows + totals flow between pages.
  React.useLayoutEffect(() => {
    if (document.body.getAttribute('data-quotation-editing') === 'true') return;
    const root = qPagesWrapRef.current;
    if (!root) return;
    if (qPagIterRef.current >= 8) return;

    const block = {};
    root.querySelectorAll('[data-q-block]').forEach(el => { block[el.dataset.qBlock] = el.offsetHeight; });
    const collectRows = (attr) => {
      const out = [];
      root.querySelectorAll(`[${attr}]`).forEach(el => {
        const i = parseInt(el.getAttribute(attr), 10);
        if (!Number.isNaN(i)) out[i] = el.offsetHeight;
      });
      return out;
    };
    const itemRows = collectRows('data-q-item-row');
    const specRows = collectRows('data-q-spec-row');
    const addonRows = collectRows('data-q-addon-row');
    const theadEl = (k) => root.querySelector(`[data-q-thead="${k}"]`);
    const headBandEl = root.querySelector('.q-header-band');
    const pageFootEl = root.querySelector('.q-page-footer');
    if (!headBandEl || itemRows.length !== doc.items.length
      || addonRows.length !== docAddonItems.length) return; // mid-update DOM; next render re-runs

    // Flowing-content budget: A4 minus the page padding (PAGE_PAD: 40px top +
    // bottom) and ALL the per-page chrome, plus a small safety margin for table
    // borders / sub-pixel rounding.
    const chromeH = headBandEl.offsetHeight
      + (block.cust || 0)
      + (block.termsBlock || 0)
      + (block.validity || 0)
      + (pageFootEl ? pageFootEl.offsetHeight : 0);
    const availH = A4 - 80 - chromeH - 6;
    if (availH < 100) return; // chrome alone fills the page — keep last assignment

    const next = paginateQuotation({
      availH,
      heights: {
        specHead: theadEl('spec') ? theadEl('spec').offsetHeight : 0,
        specRows,
        specMb: 24,           // the spec table's fixed bottom margin (QD.tblMb)
        itemsHead: theadEl('items') ? theadEl('items').offsetHeight : 0,
        itemRows,
        itemsMb: 24,          // the items table's fixed bottom margin (QD.tblMb)
        addonsHead: theadEl('addons') ? theadEl('addons').offsetHeight : 0,
        addonRows,
        addonsMb: 24,         // the add-on table's fixed bottom margin (QD.tblMb)
        addRow: block.addRow || 0,
        payTotals: block.payTotals || 0,
        // When Delivery/Notes are both empty the rows are screen-only edit
        // affordances (excluded from the PDF) — cost 0 so they can never force
        // an extra page that would export nearly empty.
        deliveryNotes: (doc.delivery || doc.notes) ? (block.deliveryNotes || 0) : 0,
      },
    });

    if (JSON.stringify(next) !== JSON.stringify(qPages)) {
      qPagIterRef.current += 1;
      setQPages(next);
    }
  }, [qPages, generatedDoc, layoutTick]);

  // Re-measure once web fonts are ready (font metrics change line wrapping).
  React.useEffect(() => {
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) setLayoutTick(t => t + 1); });
    return () => { alive = false; };
  }, []);

  // Re-measure once the pages' images (thumbnails, brand logo, bank QR) finish
  // loading — the first measure often runs before they have size.
  React.useEffect(() => {
    const root = qPagesWrapRef.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll('img'));
    if (imgs.every(im => im.complete)) return;
    let done = false;
    const onDone = () => {
      if (done) return;
      if (imgs.every(im => im.complete)) { done = true; setLayoutTick(t => t + 1); }
    };
    imgs.forEach(im => { im.addEventListener('load', onDone); im.addEventListener('error', onDone); });
    return () => imgs.forEach(im => { im.removeEventListener('load', onDone); im.removeEventListener('error', onDone); });
  }, [generatedDoc]);

  // Preview-fit (screen only): scale every 794px page down to the on-screen pane.
  // The transform is applied PER PAGE (not on the wrapper) so the PDF engine's
  // per-element neutralisation works unchanged, and measured offsetHeights are
  // unaffected (transforms don't change layout space).
  React.useLayoutEffect(() => {
    const root = qPagesWrapRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll('.q-sheet-page'));
    els.forEach(el => {
      el.style.transform = 'none';
      el.style.transformOrigin = 'top center';
      el.style.marginBottom = '0';
    });
    if (document.body.getAttribute('data-quotation-editing') === 'true') return;
    const parent = root.parentElement;
    const availW = parent ? parent.clientWidth : root.offsetWidth;
    const s = Math.min(1, availW / 794);
    if (s < 1) {
      els.forEach(el => {
        const naturalH = el.scrollHeight;
        el.style.transform = `scale(${s})`;
        el.style.transformOrigin = 'top center';
        el.style.marginBottom = `${(naturalH * s - naturalH)}px`;
      });
    }
  }, [generatedDoc, qPages]);

  // ── Per-class product image: click-to-upload + Ctrl+V paste ────────────────
  // `imgTargetKey` is the class image box the user last clicked; Ctrl+V drops a
  // clipboard image onto it. Mirrors the catalogue's upload/paste pattern.
  const [imgTargetKey, setImgTargetKey] = React.useState(null);
  const uploadClassImage = async (e, key) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { showToast('Uploading image…'); const up = await uploadImage(file); updateClassImage(key, up.url); showToast('Image added'); }
    catch { showToast('Image upload failed. Start the backend and try again.', 'error'); }
  };
  React.useEffect(() => {
    const onPaste = async (e) => {
      if (!imgTargetKey) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile(); if (!file) return;
      e.preventDefault();
      try { showToast('Uploading pasted image…'); const up = await uploadImage(file); updateClassImage(imgTargetKey, up.url); showToast('Image added'); }
      catch { showToast('Paste image upload failed', 'error'); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [imgTargetKey, generatedDoc]);


  // Find all bundled warranties generated in the background linked to this quotation
  const bundledWarranties = data.warranty_certificates?.filter(
    w => w.quotationId === generatedDoc.id
  ) || [];

  const activeTabId = activeTab || 'quotation';
  const activeCert = bundledWarranties.find(w => (w.warrantyNo || w.id) === activeTabId);

  // ── Create Warranty (explicit, from this quotation) ───────────────────────
  // Warranties are only ever created from a saved quotation. This builds one
  // certificate per applicable warranty template, skipping any that already
  // exist (deterministic ids) so a user's edits to an existing cert are never
  // overwritten. The quotation is already persisted, so each cert is linked.
  const [isCreatingWarranty, setIsCreatingWarranty] = React.useState(false);
  // Warranty templates consider the WHOLE order — add-on items can introduce
  // new warranty-linked classes (deterministic ids keep existing certs safe).
  const applicableCerts = buildWarrantyCertsForQuotation(
    docHasAddons ? { ...generatedDoc, items: docAllItems } : generatedDoc, data, settings);
  const missingCerts = applicableCerts.filter(
    c => !bundledWarranties.some(w => (w.id || w.warrantyNo) === c.id)
  );

  const handleCreateWarranty = async () => {
    if (applicableCerts.length === 0) {
      showToast('No warranty applies to these products', 'info');
      return;
    }
    if (missingCerts.length === 0) {
      // Everything already exists — just open the first one.
      setActiveTab(bundledWarranties[0].warrantyNo || bundledWarranties[0].id);
      showToast('Warranty already created', 'info');
      return;
    }
    if (!window.confirm('Do you want to create a warranty certificate for this quotation?')) return;

    setIsCreatingWarranty(true);
    try {
      for (const cert of missingCerts) {
        await createWarranty(cert).catch(() => {});
      }
      setData(prev => ({
        ...prev,
        warranty_certificates: [...missingCerts, ...(prev.warranty_certificates || [])],
      }));
      setActiveTab(missingCerts[0].warrantyNo || missingCerts[0].id);
      showToast(missingCerts.length > 1 ? `${missingCerts.length} warranties created` : 'Warranty created', 'success');
    } catch {
      showToast('Could not create warranty', 'error');
    } finally {
      setIsCreatingWarranty(false);
    }
  };

  // ── Share ───────────────────────────────────────────────────────────────
  const custName = generatedDoc.customer?.name || 'Customer';
  const _wait = (ms) => new Promise(r => setTimeout(r, ms));
  const shareItemStyle = { display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-soft)', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', cursor: 'pointer' };

  const shareCurrent = async () => {
    setShareOpen(false); setIsSharing(true);
    try {
      let file;
      if (activeTabId === 'quotation') {
        file = await elementsToPdfFile(collectQuotationPdfEls(), quotationFileName(generatedDoc, custName));
      } else {
        file = await elementToPdfFile(document.getElementById('warrantyDoc'), warrantyFileName(activeCert || { id: activeTabId }, custName));
      }
      const r = await shareFiles([file], { title: `NJ India — ${custName}`, text: 'Document from NJ India' });
      showToast(r === 'downloaded' ? 'Saved — attach it in WhatsApp/Email' : r === 'cancelled' ? 'Share cancelled' : 'Shared');
    } catch { showToast('Share failed', 'error'); }
    finally { setIsSharing(false); }
  };

  const shareFullSet = async () => {
    setShareOpen(false); setIsSharing(true);
    const prev = activeTabId;
    try {
      const files = [];
      setActiveTab('quotation'); await _wait(450);
      files.push(await elementsToPdfFile(collectQuotationPdfEls(), quotationFileName(generatedDoc, custName)));
      for (const w of bundledWarranties) {
        try {
          setActiveTab(w.warrantyNo || w.id); await _wait(450);
          const el = document.getElementById('warrantyDoc');
          if (el) files.push(await elementToPdfFile(el, warrantyFileName(w, custName)));
        } catch { /* skip a warranty that fails to render; keep the rest */ }
      }
      setActiveTab(prev); await _wait(50);
      const r = await shareFiles(files, { title: `NJ India — ${custName}`, text: 'Quotation & warranties' });
      showToast(r === 'downloaded' ? `Saved ${files.length} files — attach them in WhatsApp/Email` : r === 'cancelled' ? 'Share cancelled' : `Shared ${files.length} files`);
    } catch { setActiveTab(prev); showToast('Share failed', 'error'); }
    finally { setIsSharing(false); }
  };

  const downloadWarrantyPDF = async () => {
    if (!activeCert || isDownloading) return;

    const element = document.getElementById("warrantyDoc");
    if (!element) {
      showToast("Warranty sheet element not found.", "error");
      return;
    }

    const wName = `NJ_Warranty_${activeCert.warrantyNo || activeCert.id || 'NJ-W-0001'}_${activeCert.customer?.name.replace(/\s+/g, '_')}.pdf`;
    const dest = await beginPdfSave(wName);
    if (dest.mode === 'cancelled') { showToast("Save cancelled", "info"); return; }

    setIsDownloading(true);
    showToast("Generating PDF...", "info");

    try {
      // One engine: full-size, aspect-preserved, single A4 page, no page frame.
      // Identical to the standalone warranty Download and to Share.
      const pdf = await elementToPdf(element);
      const r = await finishPdfSave(pdf, wName, dest);
      showToast(r === 'saved' ? "Warranty PDF saved!" : "Warranty PDF downloaded successfully!", "success");
    } catch (error) {
      console.error("PDF download failed:", error);
      showToast("PDF generation failed. Using browser print as fallback.", "error");
    } finally {
      setIsDownloading(false);
    }
  };

  // Find all unique warranties matching tile items in this quotation (for checking template presence)
  // Tile classes only (exclude tools/accessories)
  const tileClasses = Array.from(
    new Set(docAllItems.map(i => i.className))
  ).filter(name => name !== 'Custom' && !name.toLowerCase().includes('tool'));

  // Class-key resolver (maps class name → settings key)
  const resolveClassKey = (className) => {
    const n = className.toLowerCase();
    if (n.includes('laminated') || n.includes('asphalt'))       return 'laminated';
    if (n.includes('stone') || n.includes('metal'))             return 'stone_coated';
    if (n.includes('heat') || n.includes('ceiling'))            return 'heatout';
    if (n.includes('ceramic') || n.includes('clay'))            return 'ceramic';
    if (n.includes('pie') || n.includes('bitumen') || n.includes('docke')) return 'docke';
    return 'default';
  };

  // Storage key for a class's description: prefer the stable class.id (matching how
  // Settings stores classSpecs), falling back to the keyword key for legacy configs.
  const classDescKey = (className) => {
    const itemClass = data.classes?.find(c => c.name === className);
    return itemClass?.id || resolveClassKey(className);
  };

  // Build the ordered element list for the PDF: every quotation page, in order.
  // Used by download + share so both produce the same document.
  const collectQuotationPdfEls = () =>
    Array.from(document.querySelectorAll('.q-sheet-page'));

  // Resolve the Parent Brand for a class on the quotation. Prefers the per-item
  // brand snapshot (historical accuracy: rename-proof), then the live class→brand
  // link. Logo comes from the current brand record. Null when no brand info.
  const getBrandForClass = (className) => {
    const item = docAllItems.find(i => i.className === className && (i.brandId || i.brandName));
    const itemClass = data.classes?.find(c => c.name === className);
    const brandId = item?.brandId || itemClass?.brandId;
    const brand = (data.brands || []).find(b => b.id === brandId);
    const name = item?.brandName || brand?.name || '';
    const logo = brand?.logo || '';
    return (name || logo) ? { name, logo } : null;
  };

  // Brand watermark across a set of line items: a single brand renders its faint
  // logo; two or more brands render the combined "Brand1 × Brand2" text. Shared
  // with the warranty view via ../brands (watermarkBrandForItems).

  // Table 1: Class Description cell. Priority: per-quotation override →
  // settings.classSpecs (string form) → legacy object form → hard fallback.
  const getClassSpecRow = (className) => {
    const kwKey = resolveClassKey(className);
    const idKey = data.classes?.find(c => c.name === className)?.id;
    const override = doc.classDescriptions?.[idKey] ?? doc.classDescriptions?.[kwKey];
    const savedRaw = settings.classSpecs?.[idKey] ?? settings.classSpecs?.[kwKey];
    const text = (override != null && override !== '') ? override : savedRaw;

    // Current storage form is a plain string: first line = title, rest = spec lines.
    if (typeof text === 'string' && text.trim()) {
      const lines = text.split('\n');
      const title = lines[0];
      const rest = lines.slice(1).join('\n');
      return (
        <>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px', textTransform: 'uppercase' }}>
            {title}
          </div>
          {rest.trim() && (
            <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
              {rest}
            </div>
          )}
        </>
      );
    }

    // Legacy object form { title, specs }
    if (text && text.specs) {
      return (
        <>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px', textTransform: 'uppercase' }}>
            {text.title || className}
          </div>
          <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
            {text.specs}
          </div>
        </>
      );
    }

    // Hard fallback definitions
    const n = className.toLowerCase();
    if (n.includes('laminated') || n.includes('asphalt')) return (
      <>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px' }}>NJ PREMIUM LAMINATED SHINGLES</div>
        <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.7' }}>
          One bundle shingles covers : 32.7 sq/ft<br />
          One bundle ridge covers : 32 RFT<br />
          Warranty : 35 years
        </div>
      </>
    );
    if (n.includes('stone') || n.includes('metal')) return (
      <>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px' }}>NJ STONE COATED METAL TILES</div>
        <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.7' }}>
          One Bundle : 72 sq/ft — 12 Tiles<br />
          Ridge : 1.3 RFT — 1 tile<br />
          <strong>50 years Warranty · 10 years free service</strong>
        </div>
      </>
    );
    if (n.includes('heat') || n.includes('ceiling')) return (
      <>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px' }}>NJ PREMIUM HEAT OUT CEILING</div>
        <div style={{ fontSize: '12px', color: '#444' }}>High thermal insulation &amp; ceiling panel technology<br />25 years graduated warranty</div>
      </>
    );
    if (n.includes('ceramic') || n.includes('clay')) return (
      <>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px' }}>NJ PREMIUM CERAMIC ROOF TILES</div>
        <div style={{ fontSize: '12px', color: '#444' }}>30 years warranty · 10 years free service</div>
      </>
    );
    if (n.includes('pie') || n.includes('bitumen') || n.includes('docke')) return (
      <>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px' }}>DOCKE PIE BITUMEN SHINGLES</div>
        <div style={{ fontSize: '12px', color: '#444' }}>30 years warranty · 10 years free service</div>
      </>
    );
    return <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>Standard Roofing Products</div>;
  };

  // Terms resolver (reads from settings.classTerms if available)
  const getTermsAndConditions = (items) => {
    const classKeys = Array.from(new Set(
      items.map(i => resolveClassKey(i.className || ''))
    ));

    // Priority order: heatout > stone_coated > laminated/docke/ceramic > default
    const priority = ['heatout', 'stone_coated', 'laminated', 'docke', 'ceramic', 'default'];
    for (const key of priority) {
      if (classKeys.includes(key)) {
        const saved = settings.classTerms?.[key];
        if (saved) return saved.split('\n').filter(l => l.trim());
      }
    }

    // Hard fallbacks from original PDFs
    const classes = items.map(i => (i.className || '').toLowerCase());
    const hasHeatout  = classes.some(c => c.includes('heatout') || c.includes('ceiling'));
    const hasStone    = classes.some(c => c.includes('stone') || c.includes('metal'));
    const hasShingles = classes.some(c => c.includes('laminated') || c.includes('bitumen') || c.includes('docke') || c.includes('pie'));

    if (hasHeatout) return [
      "Payment 30% advance along with the confirmed order. Balance 60% at the time of materials at your site, remaining amount after completion of work.",
      "If any Scaffolding / Crane or other equipment is needed to complete installation, this will be provided by client or rental costs will be charged extra at actuals.",
      "Safe and secure place would be provided on site by client to store products.",
      "Customer would be responsible to provide a free and safe working environment.",
      "Any Labour Union issues / associated costs would be under customer scope.",
      "Cost of MS Section or structure or additional work if required to the ceiling will be charged to Client at actual.",
    ];
    if (hasStone) return [
      "Delivery of materials within 60 Working Days from the confirmation of order.",
      "Payment 50% advance, 50% before dispatch of materials.",
      "Transportation will be at your cost. Item should be unloaded by your workers.",
      "This quote is valid only for 20 days.",
      "NJ metal tiles — one piece is 6 sq/ft, one bundle is 12 pieces and 72 sq/ft. Ridge 6.6 rft, valley 6.6 rft. Allow 15–20% extra for overlapping patterns.",
      "Prices are inclusive of GST.",
    ];
    if (hasShingles) return [
      "Payment 50% advance along with the confirmed order. Balance 50% at the time of delivery of materials at your site.",
      "Shingles installation can be started only after 100% of total amount is received.",
      "The quantity mentioned above is approximate.",
      "Quoted rates include GST, transportation and installation.",
      "Please make sure the number of shingles boxes is accurate when unloading materials at your site.",
      "The used material quantity is subject to the quantity of Shingle box used for installation.",
    ];
    return [
      "Payment 50% advance along with the confirmed order. Balance 50% at time of delivery.",
      "Valid for 30 days from date of issue.",
      "Goods once sold will not be returned.",
    ];
  };

  const TB   = { border: '1.5px solid #1A1A1A' };
  // Theme color: per-quotation pick → remembered default → original plum.
  const PLUM = doc.themeColor || settings.quotationThemeColor || '#8a1856';
  // Watermark visibility: per-document override → global Settings default → on.
  // `??` (not `||`) so an explicit per-doc false beats a global true.
  const wmEnabled = doc.watermarkEnabled ?? settings.watermarkEnabled ?? true;
  // Advance Received row only shows when turned on. Default-on for quotations
  // that already carry an advance (set at checkout or before this toggle existed).
  const advanceOn = doc.advanceEnabled ?? ((doc.advanceReceived || 0) > 0);
  const curr = settings.currencySymbol || '₹';

  // ── Offer-price helpers (backward compatible) ────────────────────────────
  // Old quotations have items with only `price` (no actualPrice) → no offer,
  // so the document renders exactly as it always did.
  const hasOffer = (item) => item.actualPrice != null && item.actualPrice > 0 && item.price < item.actualPrice;
  const rowActualUnit = (item) => (hasOffer(item) ? item.actualPrice : item.price);
  const docAnyOffer = (doc.hasOffers ?? doc.items.some(hasOffer)) || docAddonItems.some(hasOffer);
  const docActualSubtotal = doc.actualSubtotal
    ?? doc.items.reduce((s, it) => s + (rowActualUnit(it) * it.qty), 0);
  const docSavings = doc.productSavings
    ?? Math.max(0, docActualSubtotal - doc.subtotal);

  // Terms source: per-quotation `terms` array (CHANGE 2/3) → legacy per-class merge.
  // Quotations created after this feature always carry a `terms` array (even if edited
  // empty); only older quotations without the key fall back to the per-class merge.
  const quotationTerms = Array.isArray(doc.terms)
    ? doc.terms.filter(t => t && t.trim())
    : getTermsAndConditions(doc.items);

  // Resolved bank for this quotation (CHANGE 6-9); null/absent on older quotations.
  const docBank = doc.bank || null;

  // Construct tabs array for unified document viewer
  const documentTabs = [
    { id: 'quotation', label: 'Quotation Sheet', icon: <FileText size={16} /> },
    ...bundledWarranties.map(w => ({
      id: w.warrantyNo || w.id,
      label: `${(w.template?.logo && !w.template.logo.startsWith('data:image/')) ? w.template.logo : (w.template?.title ? w.template.title.replace('Warranty Certificate', '').replace('Performance', '').trim() : 'Product')} Warranty`,
      icon: <ShieldCheck size={16} />,
      isWarranty: true,
      cert: w
    }))
  ];

  // Banks available to switch this quotation to (active + the current one).
  const switchableBanks = (settings.banks || []).filter(b => b.active);
  if (doc.bank && doc.bankId && !switchableBanks.some(b => b.id === doc.bankId)) switchableBanks.push(doc.bank);

  return (
    <>
    <div className="animate-fade-up" style={{ paddingBottom: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* Unified Hub Styles supporting responsive tabs, sidebar panels and zero-margin printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        .document-tab-bar {
          display: flex;
          gap: 12px;
          border-bottom: 2px solid var(--line);
          padding-bottom: 12px;
          margin-bottom: 28px;
          width: 100%;
          align-self: center;
          flex-wrap: wrap;
        }
        .document-hub-layout {
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: flex-start;
          gap: 32px;
          width: 100%;
        }
        .cert-customizer-sidebar {
          flex: 0 0 360px;
          width: 360px;
          background: #FFFFFF;
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: sticky;
          top: 24px;
          align-self: flex-start;
          text-align: left;
        }
        .customizer-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .customizer-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--ink-soft);
        }
        .customizer-input, .customizer-select, .customizer-textarea {
          padding: 10px 12px;
          border: 1.5px solid var(--line);
          border-radius: var(--radius-sm);
          font-size: 14px;
          font-family: inherit;
          background: var(--bg);
          color: var(--ink);
          outline: none;
          transition: border-color 0.2s;
        }
        .customizer-input:focus, .customizer-select:focus, .customizer-textarea:focus {
          border-color: var(--accent);
        }
        .customizer-textarea {
          min-height: 70px;
          resize: vertical;
        }

        .warranty-doc {
          background: #fff;
          width: 794px; max-width: 794px;
          height: 1123px;
          padding: 36px 52px 32px;
          margin: 0 auto;
          font-family: 'Times New Roman', Times, Georgia, serif;
          color: #111;
          font-size: 11pt;
          line-height: 1.35;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          border: 1px solid #ccc;
          box-shadow: 0 4px 32px rgba(0,0,0,0.10);
          display: flex;
          flex-direction: column;
        }
        .warranty-doc .wd-header { text-align: center; padding-bottom: 7px; margin-bottom: 0; border-bottom: 2px solid #111; flex-shrink: 0; }
        .warranty-doc .wd-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: flex-end; flex-shrink: 0; margin-top: auto; }

        .warranty-doc.is-dense .wd-opening { font-size: 8pt; line-height: 1.15; margin-bottom: 6px; }
        .warranty-doc.is-dense .wd-section { margin-bottom: 2px; }
        .warranty-doc.is-dense .wd-section-head { font-size: 8pt; margin-bottom: 1px; padding-bottom: 1px; }
        .warranty-doc.is-dense .wd-body { font-size: 8pt; line-height: 1.15; }
        .warranty-doc.is-dense .wd-body p { margin-bottom: 1px; }
        .warranty-doc.is-dense .wd-body li { font-size: 7.5pt; line-height: 1.1; margin-bottom: 0; }
        .warranty-doc.is-dense .wd-body ul { margin: 1px 0 0; padding-left: 12px; }
        .warranty-doc.is-dense .wd-two-col { gap: 8px; margin-bottom: 6px; }
        .warranty-doc.is-dense .wd-banner { font-size: 10pt; padding: 4px 0; margin: 5px 0 7px; }
        .warranty-doc.is-dense .wd-duration { padding: 4px 10px; margin: 4px 0 6px; }
        .warranty-doc.is-dense .wd-table { font-size: 7.5pt; }
        .warranty-doc.is-dense .wd-table th { padding: 2px 5px; font-size: 7pt; }
        .warranty-doc.is-dense .wd-table td { padding: 2px 5px; }
        .warranty-doc.is-dense .wd-cert-block { margin-top: 4px; padding-top: 4px; }
        .warranty-doc.is-dense .wd-cert-title { margin-bottom: 2px; padding-bottom: 1px; }
        .warranty-doc.is-dense .wd-cert-row { font-size: 8.5pt; padding: 1px 0; }
        .warranty-doc.is-dense .wd-cert-lbl { font-size: 8pt; min-width: 160px; }

        /* Inline-editable affordance on the quotation sheet (hover only, so it
           never appears in the exported PDF / print). */
        .q-editable { border-radius: 2px; transition: background 0.15s, outline 0.15s; }
        .q-editable:hover { background: rgba(138,24,86,0.06); outline: 1px dashed rgba(138,24,86,0.4); }
        body[data-quotation-editing="true"] .q-sheet-page { transform: none !important; margin-bottom: 0 !important; }
        /* While typing, let a growing textarea near a page bottom stay visible
           (pagination recomputes on blur and re-clips). */
        body[data-quotation-editing="true"] .q-sheet-page { overflow: visible !important; }

        .warranty-doc .wd-wm, .q-sheet-page .wd-wm {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%) rotate(-30deg);
          font-size: 72pt; font-weight: 900; pointer-events: none; user-select: none;
          color: rgba(0,0,0,0.07); white-space: nowrap; letter-spacing: 0.1em;
          font-family: 'Times New Roman', serif;
        }
        .warranty-doc .wd-logo {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 82pt;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #111;
          margin: 0;
          line-height: 1.1;
        }
        .warranty-doc .wd-logo-sub {
          font-size: 9.5pt;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #444;
          font-weight: 700;
          margin: 3px 0 0;
          font-family: 'Times New Roman', Times, Georgia, serif;
        }

        .warranty-doc .wd-banner {
          text-align: center; font-size: 11.5pt; letter-spacing: 0.28em;
          font-weight: 700; padding: 6px 0;
          border-top: 2px solid #111; border-bottom: 2px solid #111;
          margin: 8px 0 10px; text-transform: uppercase; color: #111;
          font-family: 'Times New Roman', Times, Georgia, serif;
        }

        /* ── Opening ── */
        .warranty-doc .wd-opening { font-size: 11.5pt; line-height: 1.5; margin-bottom: 12px; text-align: justify; }
        .warranty-doc .wd-opening em { font-style: italic; display: block; margin-bottom: 6px; font-size: 12pt; }
        /* ── Sections ── */
        .warranty-doc .wd-section { margin-bottom: 8px; page-break-inside: avoid; }
        .warranty-doc .wd-section-head { font-size: 10.5pt; font-weight: 700; letter-spacing: 0.06em; color: #111; margin: 0 0 4px; padding-bottom: 2px; border-bottom: 1.5px solid #aaa; font-family: 'Times New Roman', Times, Georgia, serif; }
        .warranty-doc .wd-num { display: inline-flex; width: 17px; height: 17px; align-items: center; justify-content: center; background: #111; color: #fff; border-radius: 3px; font-size: 8pt; font-weight: 900; flex-shrink: 0; font-family: 'Times New Roman', Times, Georgia, serif; letter-spacing: 0; }
        .warranty-doc .wd-body { font-size: 11pt; line-height: 1.4; color: #222; }
        .warranty-doc .wd-body p { margin: 0 0 4px; text-align: justify; }
        .warranty-doc .wd-body ul { margin: 4px 0 0; padding-left: 18px; }
        .warranty-doc .wd-body li { margin-bottom: 3px; font-size: 10.5pt; text-align: justify; line-height: 1.35; }
        /* ── Duration callout ── */
        .warranty-doc .wd-duration { border: 1.5px solid #8b1a1a; border-left: 5px solid #8b1a1a; padding: 5px 14px; margin: 6px 0 8px; background: #fef9f9; }
        .warranty-doc .wd-duration-label { font-size: 8.5pt; letter-spacing: 0.08em; color: #8b1a1a; font-weight: 700; display: block; margin-bottom: 2px; font-family: 'Times New Roman', Times, Georgia, serif; }
        .warranty-doc .wd-duration-value { font-size: 13pt; font-weight: 700; color: #8b1a1a; font-family: 'Playfair Display', Georgia, serif; }
        /* ── Series / Liability table ── */
        .warranty-doc .wd-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9.5pt; }
        .warranty-doc .wd-table th { background: #111; color: #fff; padding: 5px 8px; text-align: left; font-size: 9pt; letter-spacing: 0.04em; font-family: 'Times New Roman', Times, Georgia, serif; border: 1px solid #111; }
        .warranty-doc .wd-table td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: middle; }
        .warranty-doc .wd-table tr:nth-child(odd) td { background: #fafafa; }
        .warranty-doc .td-dur { font-weight: 700; color: #8b1a1a; text-align: center; }
        .warranty-doc .td-pct { font-weight: 700; color: #8b1a1a; text-align: center; min-width: 80px; }
        .warranty-doc .wd-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
        .warranty-doc .wd-iso-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .warranty-doc .wd-iso-badge { border: 1.5px solid #111; border-radius: 4px; padding: 3px 8px; font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; font-family: 'Times New Roman', Times, Georgia, serif; color: #111; background: #f8f8f8; }
        /* ── Certificate details (fill-in style) ── */
        .warranty-doc .wd-cert-block { margin-top: 8px; padding-top: 8px; border-top: 2px solid #111; }
        .warranty-doc .wd-cert-title { font-size: 11pt; font-weight: 700; letter-spacing: 0.06em; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #aaa; font-family: 'Times New Roman', Times, Georgia, serif; color: #111; }
        .warranty-doc .wd-cert-row { display: flex; align-items: baseline; padding: 4px 0; border-bottom: 1px dotted #ccc; font-size: 11.5pt; gap: 10px; }
        .warranty-doc .wd-cert-lbl { min-width: 210px; color: #444; font-weight: 600; font-size: 11pt; flex-shrink: 0; }
        .warranty-doc .wd-cert-lbl::after { content: ':'; }
        .warranty-doc .wd-cert-val { font-weight: 700; color: #111; flex: 1; border-bottom: 1px solid #999; min-height: 20px; padding: 0 4px 1px; }
        .warranty-doc .wd-cert-val-static { font-weight: 700; color: #111; flex: 1; padding: 0 4px 1px; border-bottom: 1px solid #ddd; }
        
        .warranty-doc .wd-sig-block { text-align: center; font-size: 10pt; color: #555; }
        .warranty-doc .wd-sig-line { height: 80px; border-bottom: 1px solid #111; width: 200px; margin: 0 auto 4px; }
        .warranty-doc .wd-sig-name { color: #111; font-weight: 700; font-size: 10.5pt; padding-top: 3px; font-family: 'Times New Roman', Times, Georgia, serif; letter-spacing: 0.05em; }
        .warranty-doc .wd-seal-svg { display: block; margin: 0 auto 4px; width: 140px; height: 140px; }

        @media (max-width: 1220px) {
          .document-hub-layout {
            flex-direction: column;
            align-items: center;
          }
          .cert-customizer-sidebar {
            width: 100%;
            max-width: 794px;
            position: static;
          }
        }

        @media print {
          body, html { 
            background: #ffffff !important; 
            margin: 0 !important; 
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
          .actions-bar, .sidebar, .topbar, .document-tab-bar, .cert-customizer-sidebar, .q-edit-hint, .q-edit-only {
            display: none !important;
          }
          .q-editable { background: transparent !important; outline: none !important; }
          .document-hub-layout {
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .main-content-scroll-container {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .warranty-doc {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 10px 0px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
            overflow: visible !important;
            border: none !important;
            background: #ffffff !important;
          }
          /* Quotation pages are FIXED A4 sheets: print one per page, breaking
             cleanly between pages — matching Download/Share exactly. The zoom
             fits the 794px sheet into the printable width inside the @page
             margins (Chromium honours zoom in print; this app runs in WebView2). */
          .q-pages { gap: 0 !important; margin: 0 !important; }
          .q-sheet-page {
            width: 794px !important;
            max-width: 794px !important;
            height: 1123px !important;
            margin: 0 auto !important;
            overflow: hidden !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            zoom: 0.8;
            page-break-after: always;
            break-after: page;
          }
          .q-sheet-page:last-child { page-break-after: auto; break-after: auto; }
          .printable-sheet tr, .printable-sheet thead { page-break-inside: avoid; }
          @page {
            size: A4;
            margin: 15mm 20mm;
          }
        }
      `}} />

      {/* ── TOP: Document Hub Tab Switching System ── */}
      <div className="document-tab-bar" style={{ maxWidth: activeTabId === 'quotation' ? '860px' : '1200px' }}>
        {documentTabs.map(tab => {
          const isActive = activeTabId === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="hover-lift"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: 'var(--radius-full)',
                background: isActive ? 'var(--accent)' : 'var(--surface)',
                color: isActive ? 'white' : 'var(--ink-soft)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: isActive ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                transition: 'all 0.2s',
                border: isActive ? '1px solid var(--accent)' : '1px solid var(--line)'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Document Hub Page Layout dispatcher ── */}
      <div className="document-hub-layout" style={{ maxWidth: activeTabId === 'quotation' ? '860px' : '1200px' }}>
        
        {/* Certificate hint removed - Document is read-only in this view */}

        {/* ── Document Preview & Actions column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, width: '100%' }}>
          
          {/* Dispatcher Actions Bar */}
          {activeTabId === 'quotation' ? (
            /* ── Actions Bar for Quotation Tab ── */
            <>
            <div className="actions-bar" style={{ display: 'flex', gap: '16px', marginBottom: '24px', width: '100%', maxWidth: '860px' }}>
              <button onClick={() => loadQuotationForEdit(generatedDoc)} className="hover-lift"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                <ArrowLeft size={18} /> Edit in Checkout
              </button>
              {!generatedDoc.warrantyOnly && (
                <button onClick={() => startAddonOrder?.(generatedDoc)} className="hover-lift"
                  title="Add-on Order: the customer bought more later? Add the new products to this same quotation — the original items and amounts stay unchanged."
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#FDF6EC', color: '#b45309', border: '1px solid #b45309', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                  <PackagePlus size={18} /> Add More Products
                </button>
              )}
              <button onClick={downloadQuotationPDF} disabled={isDownloading} className="hover-lift"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 600,
                  cursor: isDownloading ? 'not-allowed' : 'pointer',
                  opacity: isDownloading ? 0.7 : 1,
                  marginLeft: 'auto'
                }}>
                <Download size={18} /> {isDownloading ? 'Downloading...' : 'Download PDF'}
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShareOpen(o => !o)} disabled={isSharing} className="hover-lift"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer', opacity: isSharing ? 0.7 : 1 }}>
                  <Share2 size={18} /> {isSharing ? 'Preparing…' : 'Share'}
                </button>
                {shareOpen && (<>
                  <div onClick={() => setShareOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 25 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', minWidth: 270, overflow: 'hidden' }}>
                    <button style={shareItemStyle} onClick={shareCurrent}>Share this quotation</button>
                    <button style={{ ...shareItemStyle, borderBottom: 'none' }} onClick={shareFullSet}>Share full set (quotation + all warranties)</button>
                  </div>
                </>)}
              </div>

              {/* ── Create / View Warranty ── */}
              {bundledWarranties.length > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '0 14px', color: '#15803d', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}
                    title={bundledWarranties.map(w => w.warrantyNo || w.id).join(', ')}>
                    <ShieldCheck size={18} /> Warranty Created
                  </div>
                  <button onClick={() => setActiveTab(bundledWarranties[0].warrantyNo || bundledWarranties[0].id)} className="hover-lift"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--accent-soft)', color: 'var(--accent-deep)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                    <ShieldCheck size={18} /> View Warranty
                  </button>
                  {missingCerts.length > 0 && (
                    <button onClick={handleCreateWarranty} disabled={isCreatingWarranty} className="hover-lift"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                      <ShieldCheck size={18} /> {isCreatingWarranty ? 'Creating…' : 'Create Remaining'}
                    </button>
                  )}
                </>
              ) : applicableCerts.length > 0 ? (
                <button onClick={handleCreateWarranty} disabled={isCreatingWarranty} className="hover-lift"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#15803d', color: 'white', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: isCreatingWarranty ? 'not-allowed' : 'pointer', opacity: isCreatingWarranty ? 0.7 : 1 }}>
                  <ShieldCheck size={18} /> {isCreatingWarranty ? 'Creating…' : 'Create Warranty'}
                </button>
              ) : null}

              <button onClick={startNew} className="hover-lift"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                <RotateCcw size={18} /> Start New
              </button>
            </div>

            {/* Inline-edit hint (hidden in print/PDF) */}
            <div className="q-edit-hint" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '10px 14px', background: 'rgba(138,24,86,0.05)', border: '1px solid rgba(138,24,86,0.18)', borderRadius: '8px', fontSize: '12px', color: '#8a1856', fontWeight: 600, width: '100%', maxWidth: '860px' }}>
              <Edit3 size={13} /> Click any text, price, quantity, or detail on the quotation below to edit it directly. Changes affect only this quotation.
            </div>

            {/* ── Document options: watermark toggle + design color (screen-only;
                   sits outside #quotationSheet so it never reaches the PDF) ── */}
            <div className="actions-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', width: '100%', maxWidth: '860px', flexWrap: 'wrap' }}>
              <button onClick={() => commitDoc({ watermarkEnabled: !wmEnabled })} className="hover-lift"
                title="Show or hide the faint brand-name watermark on this quotation"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: wmEnabled ? 'var(--accent-soft)' : 'var(--surface)', color: wmEnabled ? 'var(--accent-deep)' : 'var(--ink-soft)', border: `1px solid ${wmEnabled ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                {wmEnabled ? <Eye size={15} /> : <EyeOff size={15} />} Watermark: {wmEnabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => advanceOn ? commitDoc({ advanceEnabled: false, advanceReceived: 0 }) : commitDoc({ advanceEnabled: true })}
                className="hover-lift"
                title="Show or hide the Advance Received / Balance Due rows on this quotation"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: advanceOn ? 'rgba(29,78,216,0.08)' : 'var(--surface)', color: advanceOn ? '#1d4ed8' : 'var(--ink-soft)', border: `1px solid ${advanceOn ? '#1d4ed8' : 'var(--line)'}`, borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                <Wallet size={15} /> Advance: {advanceOn ? 'On' : 'Off'}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                <Palette size={15} style={{ color: 'var(--ink-soft)' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Design Color</span>
                {THEME_PRESETS.map(c => (
                  <button key={c} onClick={() => applyThemeColor(c)} title={c}
                    style={{ width: '22px', height: '22px', borderRadius: '50%', background: c, border: 'none', padding: 0, cursor: 'pointer', boxShadow: PLUM.toLowerCase() === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                ))}
                <input type="color" value={draftColor ?? PLUM} title="Custom color"
                  onChange={e => setDraftColor(e.target.value)}
                  onBlur={() => { if (draftColor && draftColor.toLowerCase() !== PLUM.toLowerCase()) applyThemeColor(draftColor); setDraftColor(null); }}
                  style={{ width: '30px', height: '26px', padding: 0, border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--surface)', cursor: 'pointer' }} />
              </div>
            </div>
            </>
          ) : (
            /* ── Actions Bar for Warranty Tab ── */
            <div className="actions-bar" style={{ display: 'flex', gap: '16px', marginBottom: '24px', width: '100%', maxWidth: '794px' }}>
              <button onClick={() => setActiveTab('quotation')} className="hover-lift"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                <ArrowLeft size={18} /> View Quotation
              </button>
              <button onClick={downloadWarrantyPDF} disabled={isDownloading} className="hover-lift"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 600,
                  cursor: isDownloading ? 'not-allowed' : 'pointer',
                  opacity: isDownloading ? 0.7 : 1,
                  marginLeft: 'auto'
                }}>
                <Download size={18} /> {isDownloading ? 'Downloading...' : 'Download PDF'}
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShareOpen(o => !o)} disabled={isSharing} className="hover-lift"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer', opacity: isSharing ? 0.7 : 1 }}>
                  <Share2 size={18} /> {isSharing ? 'Preparing…' : 'Share'}
                </button>
                {shareOpen && (<>
                  <div onClick={() => setShareOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 25 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', minWidth: 270, overflow: 'hidden' }}>
                    <button style={shareItemStyle} onClick={shareCurrent}>Share this warranty</button>
                    <button style={{ ...shareItemStyle, borderBottom: 'none' }} onClick={shareFullSet}>Share full set (quotation + all warranties)</button>
                  </div>
                </>)}
              </div>
              {activeCert && (
                <button
                  onClick={() => {
                    setActiveWarranty(activeCert);
                    setCurrentView('warranty_document');
                  }}
                  className="hover-lift"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--ink)', color: 'white', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                  <Edit3 size={18} /> Edit Warranty
                </button>
              )}
              <button onClick={startNew} className="hover-lift"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                <RotateCcw size={18} /> New Order
              </button>
            </div>
          )}

          {/* ── Document Dispatcher Render Preview Block ── */}
          {activeTabId === 'quotation' ? (
            <>
            {/* ── VIEW A: PRINTABLE QUOTATION SHEET (inline editable) ── */}
            {(() => {
              // All sizes are FIXED — QFIT resolves to plain px because `--q-fit`
              // is never set on the quotation. The body is split into typed
              // segments; the paginator assigns them to as many A4 pages as
              // needed (see the measure-and-assign effect + quotationPagination).
              const D = QD;
              const showSpec = settings.showClassSpecBox !== false && tileClasses.length > 0;

              // ── Fixed header band — repeated on every page ──
              // All branding comes from the quotation's PARENT BRAND `profile`
              // (see companyProfileForBrand). The hardcoded NJ strings survive
              // only on the no-brand/global-fallback path; a non-NJ brand shows
              // ONLY its own filled-in fields. Contact lines render
              // conditionally — the paginator measures the band live, so a
              // shorter/taller header is handled automatically.
              const brandLogoSrc = docBrand?.logo ? mediaUrl(docBrand.logo)
                : (njBranded && settings.quotationLogo) ? settings.quotationLogo : '';
              const headerContact = [
                profile.phone && `Ph: ${profile.phone}`,
                profile.email,
                profile.website,
              ].filter(Boolean);
              const headerBand = () => (
              <div className="q-header-band" style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: HDR.divMb }}>
                <div style={{
                  width: HDR.h, height: HDR.h, border: '1px solid #E5E7EB', borderRadius: '14px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flexShrink: 0,
                  overflow: 'hidden', padding: brandLogoSrc ? '8px' : 0, boxSizing: 'border-box',
                }}>
                  {brandLogoSrc ? (
                    <img
                      src={brandLogoSrc}
                      alt="Brand logo"
                      crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  ) : njBranded ? (
                    <>
                      <div style={{
                        fontSize: HDR.font, fontWeight: '900', lineHeight: '1',
                        background: `linear-gradient(135deg, ${PLUM} 0%, #3a506b 100%)`,
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      }}>N</div>
                      <div style={{ fontSize: '7px', fontWeight: '800', letterSpacing: '0.06em', color: PLUM, marginTop: '2px' }}>
                        NJINDIA.IN
                      </div>
                    </>
                  ) : (
                    // Non-NJ brand with no logo: its own initial, never the NJ mark.
                    <div style={{
                      fontSize: HDR.font, fontWeight: '900', lineHeight: '1',
                      background: `linear-gradient(135deg, ${PLUM} 0%, #3a506b 100%)`,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>{(docBrand?.name || '?').charAt(0).toUpperCase()}</div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <h1 style={{ fontSize: HDR.h1, fontWeight: '900', margin: '0 0 4px 0', letterSpacing: '-0.01em', color: '#1A1A1A', textTransform: 'uppercase' }}>
                    {profile.name || (profile.isGlobalFallback ? 'NJ India Trading Pvt. Ltd.' : docBrand?.name || '')}
                  </h1>
                  <div style={{ fontSize: HDR.info, lineHeight: HDR.lh, color: '#555' }}>
                    {(profile.address || (profile.isGlobalFallback ? 'KNH Building, Neelithod Bridge, Parakkal\nRamanattukara PO, Kozhikode — 673633' : ''))
                      .split('\n').filter(Boolean).map((l, i) => <span key={i}>{l}<br /></span>)}
                    {(headerContact.length > 0 || profile.isGlobalFallback) && (
                      <span>
                        {headerContact.length > 0
                          ? headerContact.map((part, i) => (
                              <span key={i}>{i > 0 && <> &nbsp;|&nbsp; </>}{part}</span>
                            ))
                          : <>Ph: +91 73566 08633 &nbsp;|&nbsp; www.njindia.in</>}
                      </span>
                    )}
                    {profile.gst && <><br />GSTIN: {profile.gst}</>}
                  </div>
                </div>
              </div>

              {/* Thick divider */}
              <div style={{ borderBottom: '2.5px solid #1A1A1A', marginBottom: HDR.divMb }} />
              </div>
              );

              // ── Customer + Date (atomic block) ──
              const renderCust = () => (
              <div data-q-block="cust" style={{ display: 'flow-root', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', fontSize: D.tcFs }}>
                <div>
                  <span style={{ color: '#555', fontWeight: '600' }}>Quotation To : </span>
                  <strong style={{ fontSize: D.rowFont }}>
                    <EditableCell value={doc.customer.name} onSave={v => updateCustomer('name', v)} placeholder="Customer name" />
                  </strong>
                  <div className={doc.customer.phone ? undefined : 'q-edit-only'} {...(doc.customer.phone ? {} : { 'data-html2canvas-ignore': 'true' })} style={{ color: '#555', marginTop: '1px' }}>
                    Ph: <EditableCell value={doc.customer.phone} onSave={v => updateCustomer('phone', v)} placeholder="add phone" />
                  </div>
                  <div className={doc.customer.address ? undefined : 'q-edit-only'} {...(doc.customer.address ? {} : { 'data-html2canvas-ignore': 'true' })} style={{ color: '#555', marginTop: '1px', maxWidth: '360px' }}>
                    <EditableCell value={doc.customer.address} onSave={v => updateCustomer('address', v)} multiline placeholder="add address" />
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: D.tcFs, fontWeight: '700' }}>
                  <div>Date: <EditableCell value={doc.date} onSave={v => updateField('date', v)} placeholder="date" /></div>
                  <div style={{ marginTop: '2px', color: '#555' }}>Manager: <EditableCell value={doc.managerName} onSave={v => updateField('managerName', v)} placeholder="manager" /></div>
                  {/* Auto-generated order identifier (read-only) — identifies this quotation/customer. */}
                  <div style={{ marginTop: '2px', color: '#555' }}>Quotation No: {doc.id}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: D.custMb }}>
                <div style={{ width: '100px', borderBottom: '3px solid #1A1A1A' }} />
              </div>
              </div>
              );

              // ── TABLE 1 — PRODUCT DETAILS WITH IMAGE (class rows [from, to);
              //    the header repeats on every page a chunk lands on) ──
              const renderSpec = (from, to) => (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb }}>
                  <thead data-q-thead="spec">
                    <tr>
                      <th colSpan="2" style={{
                        ...TB, background: PLUM, color: '#FFFFFF',
                        padding: `${QFIT(10)} ${QFIT(16)}`, fontWeight: '800', fontSize: D.subFont,
                        textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em',
                      }}>
                        PRODUCT DETAILS WITH IMAGE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tileClasses.slice(from, to).map((className, k) => {
                      const idx = from + k;
                      const itemClass = data.classes?.find(c => c.name === className);
                      const brandColor = itemClass ? itemClass.color : PLUM;
                      const imgKey = classDescKey(className);
                      // Product image, in priority: a per-quotation image the user added
                      // here → an item in this quotation that carries one. We intentionally
                      // do NOT fall back to the class's catalogue logo (that was rendering
                      // the small NJ mark); a missing image shows the placeholder instead.
                      const itemImg = doc.items.find(it => it.className === className && it.image)?.image;
                      const rawImg = doc.classImages?.[imgKey] || itemImg || '';
                      const imgSrc = rawImg ? mediaUrl(rawImg) : '';
                      const svgPlaceholder = (
                        <svg viewBox="0 0 100 60" style={{ width: '100%', height: '100%', background: '#f5f5f5', display: 'block' }}>
                          <rect width="100" height="60" fill={brandColor} opacity="0.1" />
                          <text x="50" y="32" fontSize="6" fontWeight="bold" fill={brandColor} textAnchor="middle" opacity="0.4">{className.toUpperCase()}</text>
                        </svg>
                      );
                      return (
                        <tr key={idx} data-q-spec-row={idx}>
                          <td style={{ ...TB, padding: D.specPad, width: '65%', verticalAlign: 'top' }}>
                            {(() => {
                              const brand = getBrandForClass(className);
                              if (!brand) return null;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                                  {brand.logo && (
                                    <img src={mediaUrl(brand.logo)} alt={brand.name} crossOrigin="anonymous"
                                      style={{ height: QFIT(20), width: 'auto', maxWidth: QFIT(70), objectFit: 'contain', display: 'block' }} />
                                  )}
                                  {brand.name && (
                                    <span style={{ fontSize: D.subFont, fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', color: PLUM }}>
                                      {brand.name}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            {(() => {
                              const key = classDescKey(className);
                              const raw = (doc.classDescriptions?.[key] != null)
                                ? doc.classDescriptions[key]
                                : (settings.classSpecs?.[key] ?? settings.classSpecs?.[resolveClassKey(className)] ?? '');
                              return (
                                <EditableCell
                                  value={raw}
                                  onSave={v => updateClassDesc(key, v)}
                                  multiline
                                  placeholder="click to add class description"
                                  renderValue={() => getClassSpecRow(className)}
                                  style={{ display: 'block', width: '100%' }}
                                />
                              );
                            })()}
                          </td>
                          <td style={{ ...TB, padding: '6px', width: '35%', verticalAlign: 'middle', background: '#FAFAFA', textAlign: 'center' }}>
                            <div
                              onClick={() => setImgTargetKey(imgKey)}
                              title="Click, then Ctrl+V to paste — or use Add"
                              style={{ position: 'relative', width: '100%', height: D.specH, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '6px', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                              {imgSrc ? (
                                <img src={imgSrc} alt={className} crossOrigin="anonymous"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                              ) : svgPlaceholder}

                              {/* Selection ring (edit-only, excluded from PDF/print) */}
                              {imgTargetKey === imgKey && (
                                <span className="q-edit-only" data-html2canvas-ignore="true"
                                  style={{ position: 'absolute', inset: 0, borderRadius: '6px', boxShadow: `0 0 0 2px ${PLUM} inset`, pointerEvents: 'none' }} />
                              )}

                              {/* Upload / change (edit-only) */}
                              <label className="q-edit-only" data-html2canvas-ignore="true"
                                onClick={e => { e.stopPropagation(); setImgTargetKey(imgKey); }}
                                style={{ position: 'absolute', bottom: '4px', right: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 7px', fontSize: '10px', fontWeight: 700, color: '#fff', background: 'rgba(26,26,26,0.78)', borderRadius: '999px', cursor: 'pointer' }}>
                                <ImagePlus size={11} /> {imgSrc ? 'Change' : 'Add'}
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadClassImage(e, imgKey)} />
                              </label>

                              {/* Remove (edit-only) — clears the per-quotation image */}
                              {doc.classImages?.[imgKey] && (
                                <button className="q-edit-only" data-html2canvas-ignore="true"
                                  onClick={e => { e.stopPropagation(); updateClassImage(imgKey, ''); }}
                                  title="Remove image"
                                  style={{ position: 'absolute', top: '4px', right: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', padding: 0, border: 'none', borderRadius: '999px', background: 'rgba(220,38,38,0.9)', color: '#fff', cursor: 'pointer' }}>
                                  <X size={11} />
                                </button>
                              )}

                              {/* Paste hint when selected + empty */}
                              {!imgSrc && imgTargetKey === imgKey && (
                                <span className="q-edit-only" data-html2canvas-ignore="true"
                                  style={{ position: 'absolute', top: '4px', left: '4px', fontSize: '9px', fontWeight: 700, color: PLUM, background: 'rgba(255,255,255,0.88)', padding: '2px 5px', borderRadius: '4px' }}>
                                  Ctrl+V to paste
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );

              // ── TABLE 2 — ITEMISED ESTIMATE (item rows [from, to); the header
              //    repeats on every page a chunk lands on) ──
              const renderItems = (from, to) => {
                // Fixed thumbnail size (QFIT resolves to plain px now).
                const thumb = 46;
                // Build columns dynamically; the OFFER PRICE column only appears
                // when at least one line carries an offer (keeps it uncluttered).
                const cols = [
                  { key: 'si',     label: 'SI NO',        align: 'center', w: QFIT(44) },
                  { key: 'img',    label: 'IMAGE',        align: 'center', w: QFIT(thumb + 16) },
                  { key: 'prod',   label: 'PRODUCT',      align: 'left',   w: 'auto' },
                  { key: 'qty',    label: 'QTY',          align: 'center', w: QFIT(84) },
                  { key: 'actual', label: 'ACTUAL PRICE', align: 'right',  w: QFIT(98) },
                  ...(docAnyOffer ? [{ key: 'offer', label: 'OFFER PRICE', align: 'right', w: QFIT(98) }] : []),
                  { key: 'total',  label: 'TOTAL',        align: 'right',  w: QFIT(106) },
                ];
                return (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb, tableLayout: 'fixed' }}>
                {/* Explicit column widths + table-layout:fixed keep every row's
                    height identical no matter which page's table instance hosts
                    it — required for stable pagination measurements. */}
                <colgroup>
                  {cols.map(col => <col key={col.key} style={col.w === 'auto' ? undefined : { width: col.w }} />)}
                </colgroup>
                <thead data-q-thead="items">
                  <tr>
                    {cols.map(col => (
                      <th key={col.key} style={{
                        ...TB, background: PLUM, color: '#FFFFFF',
                        padding: `${QFIT(11)} ${QFIT(10)}`,
                        textAlign: col.align, fontWeight: '800', fontSize: D.subFont,
                        letterSpacing: '0.05em', textTransform: 'uppercase', width: col.w,
                      }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doc.items.slice(from, to).map((item, k) => {
                    const i = from + k;
                    const offer = hasOffer(item);
                    const actualUnit = rowActualUnit(item);
                    const itemClass = data.classes?.find(c => c.name === item.className);
                    const brandColor = itemClass ? itemClass.color : PLUM;
                    const imgSrc = item.image ? mediaUrl(item.image) : '';
                    return (
                    <tr key={item.cartId ?? i} data-q-item-row={i} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'center', fontWeight: '600', fontSize: D.rowFont, color: '#333' }}>
                        {i + 1}
                      </td>
                      <td style={{ ...TB, padding: QFIT(4), textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ width: QFIT(thumb), height: QFIT(thumb), margin: '0 auto', borderRadius: '5px', overflow: 'hidden', border: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {imgSrc ? (
                            <img src={imgSrc} alt={item.name} crossOrigin="anonymous"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: brandColor, opacity: 0.85, color: '#FFFFFF', fontWeight: '800', fontSize: QFIT(Math.round(thumb / 2.6)) }}>
                              {(item.name || '?').trim().charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ ...TB, padding: D.rowPad }}>
                        <div style={{ fontSize: D.rowFont, fontWeight: '700', color: '#1A1A1A' }}>
                          <EditableCell value={item.name} onSave={v => updateItemField(item.cartId, 'name', v)} placeholder="item name" style={{ display: 'block', width: '100%' }} />
                        </div>
                        <div style={{ fontSize: D.subFont, color: '#777', fontWeight: '500', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{item.className}{item.color && item.color !== 'N/A' && item.color !== 'Standard' ? ` · ${item.color}` : ''}</span>
                          <button className="q-edit-only" data-html2canvas-ignore="true" onClick={() => removeItemRow(item.cartId)} title="Remove this line"
                            style={{ background: 'transparent', border: 'none', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: D.subFont, padding: 0 }}>✕ remove</button>
                        </div>
                      </td>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'center', fontWeight: '700', fontSize: D.rowFont, color: '#1A1A1A' }}>
                        <EditableCell value={item.qty} numeric onSave={v => updateItemField(item.cartId, 'qty', Math.max(0, v))} style={{ width: '48px', textAlign: 'center' }} />
                        &nbsp;<span style={{ fontSize: D.subFont, fontWeight: '500', color: '#666' }}>{item.unit}</span>
                      </td>
                      {/* ACTUAL PRICE — struck through when this row has an offer */}
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: offer ? '500' : '600', fontSize: D.rowFont, color: offer ? '#999' : '#333', fontFamily: 'var(--font-mono)', textDecoration: offer ? 'line-through' : 'none' }}>
                        {curr}<EditableCell value={actualUnit} numeric
                          onSave={v => (docAnyOffer ? updateItemField(item.cartId, 'actualPrice', v) : setItemUnitPrice(item.cartId, v))}
                          renderValue={() => actualUnit.toLocaleString('en-IN')}
                          style={{ width: '70px', textAlign: 'right', textDecoration: 'inherit' }} />
                      </td>
                      {/* OFFER PRICE — only when the column exists */}
                      {docAnyOffer && (
                        <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: '800', fontSize: D.rowFont, color: offer ? '#16a34a' : '#CCC', fontFamily: 'var(--font-mono)' }}>
                          {offer
                            ? <>{curr}<EditableCell value={item.price} numeric onSave={v => updateItemField(item.cartId, 'price', v)} renderValue={() => item.price.toLocaleString('en-IN')} style={{ width: '70px', textAlign: 'right' }} /></>
                            : <EditableCell value={item.price} numeric onSave={v => updateItemField(item.cartId, 'price', v)} renderValue={() => '—'} style={{ color: '#CCC' }} />}
                        </td>
                      )}
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: '800', fontSize: D.rowFont, color: '#1A1A1A', fontFamily: 'var(--font-mono)' }}>
                        {curr}{(item.price * item.qty).toLocaleString('en-IN')}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
                );
              };

              // ── TABLE 3 — ADD-ON PRODUCTS (rows [from, to); same fixed-layout
              //    discipline as the items table so pagination measurements stay
              //    stable). Rendered only when add-on batches exist; rows carry an
              //    "Added Later · date" badge and SI NO continues from the
              //    original table. Edits address (batchId, cartId). ──
              const renderAddonItems = (from, to) => {
                const thumb = 46;
                const AMBER = '#b45309';
                const cols = [
                  { key: 'si',     label: 'SI NO',        align: 'center', w: QFIT(44) },
                  { key: 'img',    label: 'IMAGE',        align: 'center', w: QFIT(thumb + 16) },
                  { key: 'prod',   label: 'PRODUCT',      align: 'left',   w: 'auto' },
                  { key: 'qty',    label: 'QTY',          align: 'center', w: QFIT(84) },
                  { key: 'actual', label: 'ACTUAL PRICE', align: 'right',  w: QFIT(98) },
                  ...(docAnyOffer ? [{ key: 'offer', label: 'OFFER PRICE', align: 'right', w: QFIT(98) }] : []),
                  { key: 'total',  label: 'TOTAL',        align: 'right',  w: QFIT(106) },
                ];
                return (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb, tableLayout: 'fixed' }}>
                <colgroup>
                  {cols.map(col => <col key={col.key} style={col.w === 'auto' ? undefined : { width: col.w }} />)}
                </colgroup>
                {/* Single banner row only — the column grid matches the items
                    table directly above, so repeating its column labels would
                    just eat page height. */}
                <thead data-q-thead="addons">
                  <tr>
                    <th colSpan={cols.length} style={{
                      ...TB, background: PLUM, color: '#FFFFFF',
                      padding: `${QFIT(11)} ${QFIT(10)}`, textAlign: 'left', fontWeight: '800',
                      fontSize: D.subFont, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>
                      Add-on Products — Added Later
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docAddonItems.slice(from, to).map((item, k) => {
                    const i = from + k;
                    const si = (doc.items?.length || 0) + i + 1; // numbering continues from the original table
                    const offer = hasOffer(item);
                    const actualUnit = rowActualUnit(item);
                    const itemClass = data.classes?.find(c => c.name === item.className);
                    const brandColor = itemClass ? itemClass.color : PLUM;
                    const imgSrc = item.image ? mediaUrl(item.image) : '';
                    return (
                    <tr key={`${item._batchId}-${item.cartId ?? i}`} data-q-addon-row={i} style={{ background: i % 2 === 0 ? '#FFFDF8' : '#FBF5EA' }}>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'center', fontWeight: '600', fontSize: D.rowFont, color: '#333' }}>
                        {si}
                      </td>
                      <td style={{ ...TB, padding: QFIT(4), textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ width: QFIT(thumb), height: QFIT(thumb), margin: '0 auto', borderRadius: '5px', overflow: 'hidden', border: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {imgSrc ? (
                            <img src={imgSrc} alt={item.name} crossOrigin="anonymous"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: brandColor, opacity: 0.85, color: '#FFFFFF', fontWeight: '800', fontSize: QFIT(Math.round(thumb / 2.6)) }}>
                              {(item.name || '?').trim().charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ ...TB, padding: D.rowPad }}>
                        <div style={{ fontSize: D.rowFont, fontWeight: '700', color: '#1A1A1A' }}>
                          <EditableCell value={item.name} onSave={v => updateAddonItemField(item._batchId, item.cartId, 'name', v)} placeholder="item name" style={{ display: 'block', width: '100%' }} />
                        </div>
                        {/* One compact sub-line (matches the items table's row
                            height): class · color, then the Added-Later date in
                            amber. Full date+time stays in the tooltip + data. */}
                        <div style={{ fontSize: D.subFont, color: '#777', fontWeight: '500', marginTop: '1px' }}>
                          <span>{item.className}{item.color && item.color !== 'N/A' && item.color !== 'Standard' ? ` · ${item.color}` : ''}</span>
                          <span title={item._addedAt ? `Added Later · ${formatAddedAt(item._addedAt)}` : 'Added Later'}
                            style={{ color: AMBER, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {' '}· Added {item._addedAt ? new Date(item._addedAt).toLocaleDateString('en-GB') : 'Later'}
                          </span>
                          <button className="q-edit-only" data-html2canvas-ignore="true" onClick={() => removeAddonItemRow(item._batchId, item.cartId)} title="Remove this add-on line"
                            style={{ background: 'transparent', border: 'none', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: D.subFont, padding: 0, marginLeft: '6px' }}>✕ remove</button>
                        </div>
                      </td>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'center', fontWeight: '700', fontSize: D.rowFont, color: '#1A1A1A' }}>
                        <EditableCell value={item.qty} numeric onSave={v => updateAddonItemField(item._batchId, item.cartId, 'qty', Math.max(0, v))} style={{ width: '48px', textAlign: 'center' }} />
                        &nbsp;<span style={{ fontSize: D.subFont, fontWeight: '500', color: '#666' }}>{item.unit}</span>
                      </td>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: offer ? '500' : '600', fontSize: D.rowFont, color: offer ? '#999' : '#333', fontFamily: 'var(--font-mono)', textDecoration: offer ? 'line-through' : 'none' }}>
                        {curr}<EditableCell value={actualUnit} numeric
                          onSave={v => (docAnyOffer ? updateAddonItemField(item._batchId, item.cartId, 'actualPrice', v) : setAddonItemUnitPrice(item._batchId, item.cartId, v))}
                          renderValue={() => actualUnit.toLocaleString('en-IN')}
                          style={{ width: '70px', textAlign: 'right', textDecoration: 'inherit' }} />
                      </td>
                      {docAnyOffer && (
                        <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: '800', fontSize: D.rowFont, color: offer ? '#16a34a' : '#CCC', fontFamily: 'var(--font-mono)' }}>
                          {offer
                            ? <>{curr}<EditableCell value={item.price} numeric onSave={v => updateAddonItemField(item._batchId, item.cartId, 'price', v)} renderValue={() => item.price.toLocaleString('en-IN')} style={{ width: '70px', textAlign: 'right' }} /></>
                            : <EditableCell value={item.price} numeric onSave={v => updateAddonItemField(item._batchId, item.cartId, 'price', v)} renderValue={() => '—'} style={{ color: '#CCC' }} />}
                        </td>
                      )}
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: '800', fontSize: D.rowFont, color: '#1A1A1A', fontFamily: 'var(--font-mono)' }}>
                        {curr}{(item.price * item.qty).toLocaleString('en-IN')}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
                );
              };

              // ── Add line item (edit affordance, hidden in print/PDF) ──
              const renderAddRow = () => (
              <div className="q-edit-only" data-q-block="addRow" data-html2canvas-ignore="true" style={{ display: 'flow-root' }}>
                <div style={{ marginTop: `calc(-1 * ${D.tblMb})`, marginBottom: D.tblMb }}>
                  <button onClick={addItemRow}
                    style={{ padding: '6px 12px', border: '1.5px dashed #c9b3c0', borderRadius: '6px', background: 'transparent', color: PLUM, fontWeight: 700, fontSize: D.subFont, cursor: 'pointer' }}>
                    + Add line item
                  </button>
                </div>
              </div>
              );

              // ── PAYMENT (left, plain text) + TOTALS (right) — atomic, never split ──
              const renderPayTotals = () => (
              <div data-q-block="payTotals" style={{ display: 'flow-root' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: QFIT(28), marginBottom: D.tblMb }}>

                {/* Payment block (left) — plain text, no box. Structured bank → legacy → picker. */}
                <div style={{ flex: '1 1 auto', minWidth: 0, paddingRight: '8px' }}>
                  {(() => {
                    const bankPicker = (settings.banks || []).length > 0 && (
                      <select className="q-edit-only" data-html2canvas-ignore="true" value={doc.bankId || ''}
                        onChange={e => { const b = (settings.banks || []).find(x => x.id === e.target.value) || null; commitDoc({ bank: b ? { ...b } : null, bankId: e.target.value || '' }); }}
                        style={{ marginTop: '6px', fontSize: '11px', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: '4px', background: '#fff', color: '#444', cursor: 'pointer' }}>
                        <option value="">No bank selected</option>
                        {switchableBanks.map(b => <option key={b.id} value={b.id}>{b.bankName || 'Bank'}{b.accountNumber ? ` · ${b.accountNumber}` : ''}</option>)}
                      </select>
                    );
                    if (docBank) {
                      const rows = [
                        ['accountName', 'Account Name', docBank.accountName],
                        ['accountNumber', 'A/C No', docBank.accountNumber],
                        ['ifsc', 'IFSC / SWIFT', docBank.ifsc],
                        ['branch', 'Branch', docBank.branch],
                        ['upiId', 'UPI', docBank.upiId],
                      ].filter(([, , v]) => v);
                      return (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', border: '1px solid #1A1A1A', borderRadius: '4px', padding: `${QFIT(12)} ${QFIT(14)}` }}>
                          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                            {(docBank.logo || docBank.bankName) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                                {docBank.logo && (
                                  <img src={docBank.logo} alt="" crossOrigin="anonymous"
                                    style={{ height: QFIT(22), width: 'auto', maxWidth: QFIT(90), objectFit: 'contain', display: 'block' }} />
                                )}
                                <span style={{ fontSize: D.rowFont, fontWeight: '800', color: '#1A1A1A' }}>
                                  <EditableCell value={docBank.bankName} onSave={v => updateBankField('bankName', v)} placeholder="bank name" />
                                </span>
                              </div>
                            )}
                            {/* Label/value grid — values align in one clean column */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '10px', rowGap: '1px', fontSize: D.tcFs, lineHeight: D.tcLineH }}>
                              {rows.map(([fkey, label, value]) => (
                                <React.Fragment key={fkey}>
                                  <span style={{ color: '#777', fontWeight: '600', whiteSpace: 'nowrap' }}>{label}</span>
                                  <span style={{ color: '#1A1A1A', fontWeight: '700', fontFamily: 'var(--font-mono)', wordBreak: 'break-word', minWidth: 0 }}>
                                    <EditableCell value={value} onSave={v => updateBankField(fkey, v)} />
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                            {bankPicker}
                          </div>
                          {docBank.qr && (
                            <img src={docBank.qr} alt="Payment QR" crossOrigin="anonymous"
                              style={{ width: QFIT(120), height: 'auto', objectFit: 'contain', flexShrink: 0 }} />
                          )}
                        </div>
                      );
                    }
                    return (
                      <>
                        {settings.bankDetails && (
                          <div style={{ fontSize: D.tcFs, color: '#444', lineHeight: D.tcLineH, fontFamily: 'var(--font-mono)' }}>
                            {settings.bankDetails.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                          </div>
                        )}
                        {bankPicker && <div className="q-edit-only" data-html2canvas-ignore="true" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Attach a bank account: {bankPicker}</div>}
                      </>
                    );
                  })()}
                </div>

                {/* Totals block (right) */}
                <div style={{ minWidth: QFIT(280), flexShrink: 0, border: `1.5px solid #1A1A1A`, borderRadius: '4px', overflow: 'hidden' }}>

                  {/* Actual Total + You Save — only when product offers exist */}
                  {docAnyOffer && docSavings > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                        <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>Actual Total</span>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#999', fontFamily: 'var(--font-mono)', marginLeft: '24px', textDecoration: 'line-through' }}>{curr}{docActualSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#16a34a' }}>You Save</span>
                        <span style={{ fontSize: D.tcFs, fontWeight: '800', color: '#16a34a', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>-{curr}{docSavings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}

                  {/* Subtotal (labelled "Offer Total" when offers are present) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                    <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>{docAnyOffer && docSavings > 0 ? 'Offer Total' : 'Subtotal'}</span>
                    <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#1A1A1A', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{doc.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {/* Discount */}
                  {doc.discountEnabled && doc.discountAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                      <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#16a34a' }}>Discount {doc.discountType === 'percent' ? `(${doc.discountValue}%)` : '(Fixed)'}</span>
                      <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#16a34a', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>-{curr}{doc.discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {/* GST */}
                  {(doc.taxEnabled ?? settings.taxEnabled) && doc.taxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                      <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>GST ({doc.taxRate}%)</span>
                      <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#1A1A1A', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{doc.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {/* Add-on breakdown — Original vs Add-on, only when add-ons exist */}
                  {docHasAddons && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#555' }}>Original Total</span>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#1A1A1A', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{(doc.originalGrandTotal ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {/* Offer savings inside add-on lines (same actual/offer rule as table 2) */}
                      {addonSavingsOf(doc) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                          <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#16a34a' }}>Add-on You Save</span>
                          <span style={{ fontSize: D.tcFs, fontWeight: '800', color: '#16a34a', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>-{curr}{addonSavingsOf(doc).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#FDF6EC', borderBottom: '1px solid #f3e3c8' }}>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#b45309' }}>Add-on Total <span style={{ fontWeight: 500 }}>(no tax / discount)</span></span>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#b45309', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>+{curr}{(doc.addonTotal ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}

                  {/* Grand Total (labelled "Updated Total" once add-ons exist) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(12)} ${QFIT(14)}`, background: PLUM }}>
                    <span style={{ fontSize: D.rowFont, fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{docHasAddons ? 'UPDATED TOTAL' : 'TOTAL'}</span>
                    <span style={{ fontSize: QFIT(16), fontWeight: '900', color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{doc.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {/* Advance Received — only when turned on (Advance pill above).
                      When on but still 0, the row is edit-only (visible on screen,
                      excluded from PDF/print) so the amount can be typed inline; once
                      > 0 it prints. Same edit-only gating as Delivery/Notes. */}
                  {advanceOn && (
                  <div
                    className={(doc.advanceReceived || 0) > 0 ? undefined : 'q-edit-only'}
                    {...((doc.advanceReceived || 0) > 0 ? {} : { 'data-html2canvas-ignore': 'true' })}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(9)} ${QFIT(14)}`, background: '#f0fdf4', borderTop: '1px solid #dcfce7' }}>
                    <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#16a34a' }}>Advance Received</span>
                    <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#16a34a', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>
                      -{curr}<EditableCell
                        value={doc.advanceReceived || 0}
                        numeric
                        onSave={v => updateField('advanceReceived', Math.max(0, v))}
                        renderValue={() => (doc.advanceReceived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        placeholder="0.00"
                      />
                    </span>
                  </div>
                  )}

                  {/* Balance Due — the figure the customer still owes; only when on and an advance exists */}
                  {advanceOn && (doc.advanceReceived || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(12)} ${QFIT(14)}`, background: PLUM }}>
                      <span style={{ fontSize: D.rowFont, fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>BALANCE DUE</span>
                      <span style={{ fontSize: QFIT(16), fontWeight: '900', color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{(doc.balanceDue ?? Math.max(0, doc.grandTotal - (doc.advanceReceived || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                </div>
              </div>
              </div>
              );

              // ── Delivery / Notes (optional, per-quotation) — atomic ──
              // Filled rows print; empty rows are edit-only (excluded from PDF).
              const renderDeliveryNotes = () => (
              <div data-q-block="deliveryNotes" style={{ display: 'flow-root' }}>
              <div style={{ marginTop: D.tcMt, fontSize: D.tcFs, color: '#444', lineHeight: D.tcLineH }}>
                <div className={doc.delivery ? undefined : 'q-edit-only'} {...(doc.delivery ? {} : { 'data-html2canvas-ignore': 'true' })}>
                  <strong style={{ color: '#1A1A1A' }}>Delivery: </strong>
                  <EditableCell value={doc.delivery} onSave={v => updateField('delivery', v)} placeholder="add delivery details" />
                </div>
                <div className={doc.notes ? undefined : 'q-edit-only'} {...(doc.notes ? {} : { 'data-html2canvas-ignore': 'true' })} style={{ whiteSpace: 'pre-line' }}>
                  <strong style={{ color: '#1A1A1A' }}>Notes: </strong>
                  <EditableCell value={doc.notes} onSave={v => updateField('notes', v)} multiline placeholder="add notes" />
                </div>
              </div>
              </div>
              );

              // ── Terms and Conditions — FIXED on every page (2-column, full
              //    list). Every page renders the SAME shared terms via the same
              //    EditableCell, so editing the terms on any page updates all
              //    pages at once. ──
              const renderTerms = () => {
                const terms = quotationTerms;
                const mid = Math.ceil(terms.length / 2);
                const olStyle = { margin: 0, paddingLeft: QFIT(14), fontSize: D.termsFs, lineHeight: D.termsLH, color: '#1A1A1A' };
                return (
                  <div data-q-block="termsBlock" style={{ display: 'flow-root', flexShrink: 0 }}>
                    <div style={{ marginTop: D.tcMt }}>
                      <h4 style={{
                        color: '#E53E3E', fontSize: D.subFont, fontWeight: '900',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        marginBottom: QFIT(10), borderBottom: '2px solid #1A1A1A', paddingBottom: '4px',
                      }}>
                        Terms and Conditions :
                      </h4>
                      <EditableCell
                        value={quotationTerms.join('\n')}
                        onSave={v => updateTerms(v)}
                        multiline
                        placeholder="click to add terms (one per line)"
                        style={{ display: 'block', width: '100%' }}
                        renderValue={() => (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${QFIT(20)}` }}>
                            <ol style={olStyle}>
                              {terms.slice(0, mid).map((term, i) => (
                                <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                              ))}
                            </ol>
                            <ol start={mid + 1} style={olStyle}>
                              {terms.slice(mid).map((term, i) => (
                                <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                );
              };

              // ── Validity / footer note row (atomic; last content block) ──
              const renderValidity = () => (
              <div data-q-block="validity" style={{ display: 'flow-root', flexShrink: 0 }}>
              <div style={{
                borderTop: '2px solid #1A1A1A', marginTop: D.footMt, paddingTop: QFIT(14),
                fontSize: D.subFont, color: '#777', display: 'flex', justifyContent: 'space-between', fontWeight: 500,
              }}>
                <div>Valid for <EditableCell value={doc.validityDays ?? settings.validityDays ?? 30} numeric onSave={v => updateField('validityDays', v)} style={{ width: '40px', textAlign: 'center' }} /> days from date of issue.</div>
              </div>
              </div>
              );

              // ── Segment dispatcher + page assembly. Only these segments FLOW
              //    between pages — header band, customer block, terms, validity
              //    and page footer are fixed chrome rendered on every page. ──
              const renderSegment = (seg, idx) => {
                switch (seg.type) {
                  case 'spec':          return showSpec ? <React.Fragment key={idx}>{renderSpec(seg.from, seg.to)}</React.Fragment> : null;
                  case 'items':         return <React.Fragment key={idx}>{renderItems(seg.from, seg.to)}</React.Fragment>;
                  case 'addonItems':    return <React.Fragment key={idx}>{renderAddonItems(seg.from, seg.to)}</React.Fragment>;
                  case 'addRow':        return <React.Fragment key={idx}>{renderAddRow()}</React.Fragment>;
                  case 'payTotals':     return <React.Fragment key={idx}>{renderPayTotals()}</React.Fragment>;
                  case 'deliveryNotes': return <React.Fragment key={idx}>{renderDeliveryNotes()}</React.Fragment>;
                  default:              return null;
                }
              };

              // Measuring pass (qPages === null): everything on one page so each
              // block can be measured; the page clips (overflow:hidden) and the
              // layout effect re-renders the settled assignment before paint.
              const allSegments = [
                ...(showSpec ? [{ type: 'spec', from: 0, to: tileClasses.length, withHead: true }] : []),
                { type: 'items', from: 0, to: doc.items.length, withHead: true },
                ...(docHasAddons ? [{ type: 'addonItems', from: 0, to: docAddonItems.length, withHead: true }] : []),
                { type: 'addRow' },
                { type: 'payTotals' },
                { type: 'deliveryNotes' },
              ];
              const pageList = (qPages && qPages.length) ? qPages : [allSegments];

              return (
            <div className="q-pages" ref={qPagesWrapRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', width: '100%' }}>
              {pageList.map((segs, pi) => (
              <div
                key={pi}
                className="printable-sheet q-sheet-page"
                id={pi === 0 ? 'quotationSheet' : undefined}
                style={{
                  width: '794px', maxWidth: '794px', height: '1123px', boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  background: '#FFFFFF',
                  padding: PAGE_PAD, boxShadow: '0 20px 40px rgba(0,0,0,0.07)',
                  color: '#1A1A1A', fontFamily: '"Inter", system-ui, sans-serif',
                  border: '1px solid #E5E7EB', position: 'relative', flexShrink: 0,
                }}>

                {/* ── Brand watermark (faint, behind content; on every page) ── */}
                {wmEnabled && <BrandWatermark brand={watermarkBrandForItems(docAllItems, data)} fallbackText="" />}

                {/* ── HEADER BAND (fixed, every page) ── */}
                {headerBand()}

                {/* ── CUSTOMER + DATE (fixed, every page — shared state, so an
                       edit on any page reflects on all pages) ── */}
                {renderCust()}

                {/* ── BODY — this page's flowing segments, at fixed sizes ── */}
                <div className="q-body" style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
                  {segs.map(renderSegment)}
                </div>

                {/* ── TERMS & CONDITIONS + VALIDITY (fixed, every page) ── */}
                {renderTerms()}
                {renderValidity()}

                {/* ── PAGE FOOTER (every page) ── */}
                <div className="q-page-footer" style={{ flexShrink: 0, borderTop: '1px solid #E5E7EB', paddingTop: '6px', fontSize: '10px', fontWeight: 600, color: '#999', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{profile.name || (profile.isGlobalFallback ? 'NJ India Trading Pvt. Ltd.' : docBrand?.name || '')} — Quotation {doc.id}</span>
                  <span>Page {pi + 1} of {pageList.length}</span>
                </div>
              </div>
              ))}
            </div>
            );
            })()}

            </>
          ) : (() => {
            /* ── VIEW B: WARRANTY CERTIFICATE (numbered sections matching physical PDF) ── */
            // Resolve template from current config so structural fields (the
            // warranty-period series table, heatout table) are never missing on
            // older saved certificates. Content (sections) prefers the saved cert.
            const _stored = (activeCert.template && typeof activeCert.template === 'object') ? activeCert.template : {};
            const _tid = (typeof activeCert.template === 'string') ? activeCert.template : _stored.id;
            let _matched = data.warranties?.find(w => w.id === _tid);
            if (!_matched) {
              const _n = (((activeCert.items && activeCert.items.length > 0) ? activeCert.items[0].className : '') || '').toLowerCase();
              let _fb = 'nj_laminated';
              if (_n.includes('stone') || _n.includes('metal')) _fb = 'stone_coated';
              else if (_n.includes('heat') || _n.includes('ceiling')) _fb = 'heatout';
              else if (_n.includes('ceramic') || _n.includes('clay')) _fb = 'ceramic';
              else if (_n.includes('pie') || _n.includes('bitumen') || _n.includes('docke')) _fb = 'docke';
              _matched = data.warranties?.find(w => w.id === _fb);
            }
            // Mirror the LIVE template (logo, seal, signature, opening, terms,
            // tables, duration) so template edits always reflect here; fall back to
            // the frozen snapshot only when the template was deleted. (Same rule as
            // WarrantyDocument.) Per-customer data stays in activeCert.certData.
            const tmpl = _matched ? { ..._matched } : { ..._stored };
            if (!tmpl.id) tmpl.id = _tid || _stored.id;
            const cd = activeCert.certData || {};

            return (
            <WarrantyCertificate
              template={tmpl}
              openingText={tmpl.opening || 'Congratulations on your purchase. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards. We strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.'}
              variant="certificate"
              customer={activeCert.customer || {}}
              certData={cd}
              fallbackDate={activeCert.date}
              warrantyNo={activeCert.warrantyNo || activeCert.id}
              orderNo={activeCert.quotationId || doc.id || ''}
            />
            ); })()}


        </div>

      </div>

    </div>

    </>
  );
}

// Outer guard: keeps all hooks in QuotationDocumentInner unconditional. The inner
// body only ever renders with an active quotation, so its hook order is stable
// across renders (no hooks-after-early-return violation).
export default function QuotationDocument() {
  const { activeQuotation, setCurrentView } = useAppContext();
  if (!activeQuotation) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginBottom: '16px' }}>No active quotation</h2>
        <button className="btn-primary" onClick={() => setCurrentView('quotation_desk')}>Return to Desk</button>
      </div>
    );
  }
  return <QuotationDocumentInner />;
}
