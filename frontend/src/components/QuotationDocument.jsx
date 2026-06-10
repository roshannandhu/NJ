import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, RotateCcw, ShieldCheck, FileText, Download, Edit3, Share2, ImagePlus, X, Eye, EyeOff, Palette, Wallet } from 'lucide-react';
import { mediaUrl, createQuotation, createWarranty, uploadImage } from '../api';
import { elementToPdf, elementToPdfFile, elementsToPdf, elementsToPdfFile, shareFiles, quotationFileName, warrantyFileName, beginPdfSave, finishPdfSave } from '../share';
import { buildWarrantyCertsForQuotation } from '../warranty';
import BrandWatermark from './BrandWatermark';
import { watermarkBrandForItems } from '../brands';
import WarrantyCertificate from './WarrantyCertificate';

// Preset design colors offered on the quotation page (first is the original plum).
const THEME_PRESETS = ['#8a1856', '#1e3a8a', '#14532d', '#c2410c', '#1f2937'];

// ── Inline-Editable Cell (click text on the quotation to edit in place) ──────
function EditableCell({ value, onSave, multiline = false, numeric = false, style = {}, renderValue, placeholder = 'click to edit' }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const startEditing = () => { setDraft(value ?? ''); setEditing(true); document.body.setAttribute('data-quotation-editing', 'true'); };
  const stopEditing  = () => { setEditing(false); document.body.removeAttribute('data-quotation-editing'); };
  const commit = () => { stopEditing(); if (String(draft) !== String(value ?? '')) onSave(numeric ? (parseFloat(draft) || 0) : draft); };

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
    <span onClick={startEditing} title="Click to edit" className="q-editable" style={{ cursor: 'text', ...style }}>
      {display}
    </span>
  );
}

// ── Single-page "fit engine" for the quotation sheet ─────────────────────────
// The sheet is a fixed A4 page (794×1123px, overflow:hidden). The header band
// (logo + company details) is a FIXED size on every quotation. Everything below
// — the whole body, INCLUDING terms & conditions — is scaled by one continuous
// CSS variable `--q-fit`, applied to every font/padding/margin/image size via
// calc(). A measure-and-converge layout effect grows short content to fill the
// page and shrinks long content so it never spills to page 2. Because the scale
// is font/length based (not a CSS transform, which the PDF engine neutralises),
// the exported PDF matches the screen exactly. Mirrors WarrantyCertificate's
// --wc-term-scale engine, but simpler: the fixed header means the available
// height is constant, so `ideal = qFit × avail / natural` is a near-direct solve.
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
// Fit-engine tunables. Q_MAX caps how large a sparse quote grows (so a 1-item
// quote fills the page without looking comical); Q_MIN is the densest a long
// quote shrinks to before the clip guard accepts it. Damped to absorb the small
// non-linearities from image boxes and text re-wrapping at the column edges.
const Q_MIN = 0.42, Q_MAX = 1.6, Q_DAMP = 0.6, Q_ITER_MAX = 18, A4 = 1123;

// One installation-guide page: its own fixed A4 (overflow:hidden, so content and
// the brand watermark are clipped to the page — same as the quotation sheet and
// warranty certificate). The header band (label + class name) and footer are a
// FIXED size; the guidance body is scaled by a per-page --q-fit so short guidance
// grows to fill the page and long guidance shrinks to one page. Each page owns its
// own fit loop (one per in-cart class), mirroring the quotation engine above.
function InstallPage({ c, brand, companyName, docId, onSave }) {
  const pageRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const [iFit, setIFit] = React.useState(1);
  const [tick, setTick] = React.useState(0);
  const stRef = React.useRef({ iter: 0, frozen: false });

  // Reset to 1 for a different class; re-arm (keep scale) when its text/fonts change.
  React.useLayoutEffect(() => { stRef.current = { iter: 0, frozen: false }; setIFit(1); }, [c.key]);
  React.useLayoutEffect(() => { stRef.current = { iter: 0, frozen: false }; }, [c.text, tick]);

  React.useLayoutEffect(() => {
    const st = stRef.current;
    if (st.frozen) return;
    const page = pageRef.current, body = bodyRef.current;
    if (!page || !body) return;
    if (document.body.getAttribute('data-quotation-editing') === 'true') return;
    const headEl = page.querySelector('.nj-install-head');
    const footEl = page.querySelector('.nj-install-foot');
    const headH = headEl ? headEl.offsetHeight : 0;
    const footH = footEl ? footEl.offsetHeight : 0;
    const cs = getComputedStyle(page);
    const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const avail = A4 - padV - headH - footH - 2;   // CONSTANT — header/footer fixed
    const natural = body.scrollHeight;
    if (natural < 1 || avail < 40) return;
    st.iter += 1;
    const ideal = iFit * (avail / natural);
    if (natural > avail) {
      if (iFit <= Q_MIN + 0.0005) { st.frozen = true; return; }
      setIFit(+Math.max(Q_MIN, ideal).toFixed(3));
      return;
    }
    const next = +Math.min(Q_MAX, Math.max(Q_MIN, iFit + (ideal - iFit) * Q_DAMP)).toFixed(3);
    if (st.iter >= Q_ITER_MAX || Math.abs(next - iFit) < 0.004) { st.frozen = true; return; }
    setIFit(next);
  }, [iFit, c.text, tick]);

  React.useEffect(() => {
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) setTick(t => t + 1); });
    return () => { alive = false; };
  }, []);

  return (
    <div ref={pageRef} className="nj-install-page" style={{
      width: '794px', maxWidth: '794px', height: '1123px', boxSizing: 'border-box',
      background: '#FFFFFF', color: '#1A1A1A', padding: '64px',
      fontFamily: '"Inter", system-ui, sans-serif', position: 'relative',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 20px 40px rgba(0,0,0,0.07)', border: '1px solid #E5E7EB',
    }}>
      <BrandWatermark brand={brand} fallbackText="" />
      <div className="nj-install-head" style={{ flexShrink: 0, borderBottom: '2px solid #1A1A1A', paddingBottom: '14px', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#c2410c', fontWeight: 700 }}>Installation Guide</div>
        <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>{c.name}</div>
      </div>
      <div ref={bodyRef} style={{ flexShrink: 0, fontSize: QFIT(14.5), lineHeight: 1.75, color: '#27272a', '--q-fit': iFit }}>
        <EditableCell
          value={c.text}
          onSave={onSave}
          multiline
          placeholder="click to add installation guidance"
          renderValue={(val) => <div style={{ whiteSpace: 'pre-wrap' }}>{val}</div>}
          style={{ display: 'block', width: '100%' }}
        />
      </div>
      {/* Spacer pins the footer to the bottom; shrinks to ~0 as the body fills. */}
      <div style={{ flex: '1 1 auto' }} />
      <div className="nj-install-foot" style={{ flexShrink: 0, marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #E5E7EB', fontSize: '11px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
        <span>{companyName}</span>
        <span>Quotation {docId}</span>
      </div>
    </div>
  );
}

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
    activeTab,
    setActiveTab,
    showToast,
    persistConfig
  } = useAppContext();

  const settings = data.settings || {};
  const company  = data.company  || {};
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
    const items = updatedDoc.items || [];
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
  // Per-quotation installation-guidance override (edited inline on the 2nd+ page).
  const updateInstallOverride = (key, value) => commitDoc({ installOverrides: { ...(generatedDoc.installOverrides || {}), [key]: value } });
  // Per-quotation product image for a class (overrides the catalogue), keyed like
  // classDescriptions. Stored on the doc so it only affects THIS quotation.
  const updateClassImage = (key, url) => commitDoc({ classImages: { ...(generatedDoc.classImages || {}), [key]: url } });
  const updateTerms     = (text) => commitDoc({ terms: text.split('\n') });
  const updateBankField = (field, value) => commitDoc({ bank: { ...(generatedDoc.bank || {}), [field]: value } });
  // Set a line's unit price. With no active offers, keep price == actualPrice so the
  // single "Actual Price" column drives the total; otherwise edit each independently.
  const setItemUnitPrice = (cartId, v) => commitDoc({ items: generatedDoc.items.map(it => it.cartId === cartId ? { ...it, price: v, actualPrice: v } : it) });

  const startNew = () => {
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
      // One engine: full-size, multi-page A4 (never shrunk). Identical to Share.
      // With installation guidance on, append one clean page per class.
      const els = collectQuotationPdfEls();
      const pdf = els.length > 1 ? await elementsToPdf(els) : await elementToPdf(element);
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


  const quotationSheetRef = React.useRef(null);
  const qBodyRef = React.useRef(null);
  // Continuous body scale (the value of the `--q-fit` CSS variable on `.q-body`).
  const [qFit, setQFit] = React.useState(1);
  // Last-resort content reduction: when a quote is so dense it can't fit even at
  // the minimum scale, the SUPPLEMENTARY "Product details with image" table is
  // dropped so the ESSENTIAL items + total + terms are always visible (they must
  // never be clipped). Mirrors the old densest tier, which also dropped it.
  const [dropSpec, setDropSpec] = React.useState(false);
  // Bumped once fonts / images finish loading, to re-fit against final heights.
  const [qFontTick, setQFontTick] = React.useState(0);
  // Per-content convergence budget. `frozen` stops re-entry once we've settled or
  // hit the floor, so the loop can never cascade renders.
  const qFitStRef = React.useRef({ iter: 0, frozen: false });

  // Reset the scale to 1 for a genuinely different document (new/imported/loaded
  // quotation), keyed on id so an inline edit re-fits from the CURRENT scale
  // instead of snapping back to 1 (no flicker).
  React.useLayoutEffect(() => {
    qFitStRef.current = { iter: 0, frozen: false };
    setQFit(1);
    setDropSpec(false);
  }, [generatedDoc?.id]);

  // Re-arm the convergence budget whenever the document content (any edit), the
  // font/image tick, or the dropped-spec state changes — WITHOUT resetting the
  // scale — so edits and the content-reduction step re-fit smoothly.
  React.useLayoutEffect(() => {
    qFitStRef.current = { iter: 0, frozen: false };
  }, [generatedDoc, qFontTick, dropSpec]);

  // The fit loop: measure the body's natural height against the constant space
  // below the fixed header, then grow (to fill) or shrink (to never overflow).
  React.useLayoutEffect(() => {
    const st = qFitStRef.current;
    if (st.frozen) return;
    const body = qBodyRef.current, sheet = quotationSheetRef.current;
    if (!body || !sheet) return;
    // Never re-fit mid-edit (would reflow under the caret).
    if (document.body.getAttribute('data-quotation-editing') === 'true') return;

    const headerEl = sheet.querySelector('.q-header-band');
    const headerH = headerEl ? headerEl.offsetHeight : 0;
    const cs = getComputedStyle(sheet);
    const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const avail = A4 - headerH - padV - 2;        // CONSTANT — header is fixed
    const natural = body.scrollHeight;             // moves with --q-fit
    if (natural < 1 || avail < 40) return;

    st.iter += 1;
    const ideal = qFit * (avail / natural);

    // Clip guard: while the body overflows the page, always shrink (never accept
    // an overflowing scale until we're already at the floor).
    if (natural > avail) {
      if (qFit <= Q_MIN + 0.0005) {
        // Can't shrink further. As a last resort, drop the supplementary product-
        // detail image table so the items + total + terms are never clipped, then
        // let the loop re-fit (and grow) the lighter body.
        const canDropSpec = settings.showClassSpecBox !== false && tileClasses.length > 0 && !dropSpec;
        if (canDropSpec) { setDropSpec(true); return; }
        st.frozen = true; return;
      }
      setQFit(+Math.max(Q_MIN, ideal).toFixed(3));
      return;
    }
    // Fits — damped step toward filling the page.
    const next = +Math.min(Q_MAX, Math.max(Q_MIN, qFit + (ideal - qFit) * Q_DAMP)).toFixed(3);
    if (st.iter >= Q_ITER_MAX || Math.abs(next - qFit) < 0.004) { st.frozen = true; return; }
    setQFit(next);
  }, [qFit, generatedDoc, qFontTick, dropSpec]);

  // Re-fit once web fonts are ready (font metrics change line wrapping/heights).
  React.useEffect(() => {
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) setQFontTick(t => t + 1); });
    return () => { alive = false; };
  }, []);

  // Re-fit once the body's images (thumbnails, brand logo, bank QR) finish loading
  // — the first measure often runs before they have size, under-filling the page.
  React.useEffect(() => {
    const body = qBodyRef.current;
    if (!body) return;
    const imgs = Array.from(body.querySelectorAll('img'));
    if (imgs.every(im => im.complete)) return;
    let done = false;
    const onDone = () => {
      if (done) return;
      if (imgs.every(im => im.complete)) { done = true; setQFontTick(t => t + 1); }
    };
    imgs.forEach(im => { im.addEventListener('load', onDone); im.addEventListener('error', onDone); });
    return () => imgs.forEach(im => { im.removeEventListener('load', onDone); im.removeEventListener('error', onDone); });
  }, [generatedDoc]);

  // Preview-fit (screen only): scale the settled 794px sheet down to its on-screen
  // pane. This is a CSS transform, which the PDF engine neutralises per capture,
  // so the export stays full-size. Kept separate from the fit loop, which measures
  // untransformed layout heights and is unaffected by this.
  React.useLayoutEffect(() => {
    const el = quotationSheetRef.current;
    if (!el) return;
    el.style.transform = 'none';
    el.style.transformOrigin = 'top center';
    el.style.marginBottom = '0';
    if (document.body.getAttribute('data-quotation-editing') === 'true') return;
    const parent = el.parentElement;
    const availW = parent ? parent.clientWidth : el.offsetWidth;
    const naturalW = el.offsetWidth;
    const s = Math.min(1, availW / naturalW);
    if (s < 1) {
      const naturalH = el.scrollHeight;
      el.style.transform = `scale(${s})`;
      el.style.transformOrigin = 'top center';
      el.style.marginBottom = `${(naturalH * s - naturalH)}px`;
    }
  }, [generatedDoc, qFit]);

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
  const applicableCerts = buildWarrantyCertsForQuotation(generatedDoc, data, settings);
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
        const els = collectQuotationPdfEls();
        file = els.length > 1
          ? await elementsToPdfFile(els, quotationFileName(generatedDoc, custName))
          : await elementToPdfFile(document.getElementById('quotationSheet'), quotationFileName(generatedDoc, custName));
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
      {
        const els = collectQuotationPdfEls();
        files.push(els.length > 1
          ? await elementsToPdfFile(els, quotationFileName(generatedDoc, custName))
          : await elementToPdfFile(document.getElementById('quotationSheet'), quotationFileName(generatedDoc, custName)));
      }
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
    new Set(doc.items.map(i => i.className))
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

  // Installation guidance for a class (settings.classInstall, keyed like classSpecs).
  const getInstallText = (className) => {
    const kwKey = resolveClassKey(className);
    const idKey = data.classes?.find(c => c.name === className)?.id;
    const t = settings.classInstall?.[idKey] ?? settings.classInstall?.[kwKey];
    return (typeof t === 'string' ? t : '').trim();
  };
  // Classes in THIS quotation that have non-empty guidance (one PDF page each),
  // only when the per-quotation toggle is on. Empty-guidance classes are skipped.
  // Per-quotation override (edited inline on the installation page) wins over the
  // catalogue text. Keyed like classDescriptions (classDescKey → class.id).
  const installTextFor = (className) => {
    const key = classDescKey(className);
    const ov = doc.installOverrides?.[key];
    return (ov != null && ov !== '') ? ov : getInstallText(className);
  };
  // One visible + printed A4 page per in-cart class that has guidance (toggle on).
  const installClasses = doc.includeInstallation
    ? tileClasses.map(name => ({ name, key: classDescKey(name), text: installTextFor(name) })).filter(c => c.text)
    : [];

  // Build the ordered element list for the PDF: page 1 (sheet) + one page per
  // install class. Used by download + share so both produce the same document.
  const collectQuotationPdfEls = () => {
    const sheet = document.getElementById('quotationSheet');
    const pages = installClasses.length
      ? Array.from(document.querySelectorAll('.nj-install-page'))
      : [];
    return [sheet, ...pages].filter(Boolean);
  };

  // Preview-fit the visible installation pages to the pane width, mirroring the
  // quotation sheet's scaling. The PDF engine neutralises this transform per
  // captured page, so export stays full-size. Skipped while a field is being
  // edited so editing never reflows.
  const installPagesRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = installPagesRef.current;
    if (!el) return;
    el.style.transform = 'none';
    el.style.transformOrigin = 'top center';
    el.style.marginBottom = '0';
    if (document.body.getAttribute('data-quotation-editing') === 'true') return;
    const parent = el.parentElement;
    const availW = parent ? parent.clientWidth : el.offsetWidth;
    const s = Math.min(1, availW / 794);
    if (s < 1) {
      const naturalH = el.scrollHeight;
      el.style.transform = `scale(${s})`;
      el.style.marginBottom = `${(naturalH * s - naturalH)}px`;
    }
  });

  // Resolve the Parent Brand for a class on the quotation. Prefers the per-item
  // brand snapshot (historical accuracy: rename-proof), then the live class→brand
  // link. Logo comes from the current brand record. Null when no brand info.
  const getBrandForClass = (className) => {
    const item = doc.items.find(i => i.className === className && (i.brandId || i.brandName));
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
  const certWmEnabled = activeCert ? (activeCert.watermarkEnabled ?? settings.watermarkEnabled ?? true) : true;
  // Advance Received row only shows when turned on. Default-on for quotations
  // that already carry an advance (set at checkout or before this toggle existed).
  const advanceOn = doc.advanceEnabled ?? ((doc.advanceReceived || 0) > 0);
  const curr = settings.currencySymbol || '₹';

  // ── Offer-price helpers (backward compatible) ────────────────────────────
  // Old quotations have items with only `price` (no actualPrice) → no offer,
  // so the document renders exactly as it always did.
  const hasOffer = (item) => item.actualPrice != null && item.actualPrice > 0 && item.price < item.actualPrice;
  const rowActualUnit = (item) => (hasOffer(item) ? item.actualPrice : item.price);
  const docAnyOffer = doc.hasOffers ?? doc.items.some(hasOffer);
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
        body[data-quotation-editing="true"] #quotationSheet { transform: none !important; margin-bottom: 0 !important; }

        .warranty-doc .wd-wm, #quotationSheet .wd-wm, .nj-install-page .wd-wm {
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
          .printable-sheet, .warranty-doc {
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
          /* Reset the on-screen single-page fit-scale so the quotation prints at
             full size and flows across multiple pages (matching Download/Share). */
          #quotationSheet { transform: none !important; margin-bottom: 0 !important; }
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
                title="Show or hide the faint brand-name watermark on this quotation (and its installation pages)"
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
              {activeCert && (
                <button onClick={() => persistCert({ ...activeCert, watermarkEnabled: !certWmEnabled })} className="hover-lift"
                  title="Show or hide the faint brand-name watermark on this certificate"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', background: certWmEnabled ? 'var(--accent-soft)' : 'var(--surface)', color: certWmEnabled ? 'var(--accent-deep)' : 'var(--ink-soft)', border: `1px solid ${certWmEnabled ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                  {certWmEnabled ? <Eye size={18} /> : <EyeOff size={18} />} Watermark: {certWmEnabled ? 'On' : 'Off'}
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
              // Body sizes are scaled by the `--q-fit` variable on `.q-body`; the
              // header band uses fixed `HDR` constants. See the fit engine above.
              const D = QD;
              return (
            <div
              className="printable-sheet"
              id="quotationSheet"
              ref={quotationSheetRef}
              style={{
                width: '794px', maxWidth: '794px', height: '1123px', boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                background: '#FFFFFF',
                padding: PAGE_PAD, boxShadow: '0 20px 40px rgba(0,0,0,0.07)',
                color: '#1A1A1A', fontFamily: '"Inter", system-ui, sans-serif',
                border: '1px solid #E5E7EB', position: 'relative',
              }}>

              {/* ── Brand watermark (faint, behind content; nothing if no brand or toggled off) ── */}
              {wmEnabled && <BrandWatermark brand={watermarkBrandForItems(doc.items, data)} fallbackText="" />}

              {/* ── HEADER BAND (FIXED size on every quotation — never scaled) ── */}
              <div className="q-header-band" style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: HDR.divMb }}>
                <div style={{
                  width: HDR.h, height: HDR.h, border: '1px solid #E5E7EB', borderRadius: '14px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flexShrink: 0,
                  overflow: 'hidden', padding: settings.quotationLogo ? '8px' : 0, boxSizing: 'border-box',
                }}>
                  {settings.quotationLogo ? (
                    <img
                      src={settings.quotationLogo}
                      alt="Quotation logo"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  ) : (
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
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <h1 style={{ fontSize: HDR.h1, fontWeight: '900', margin: '0 0 4px 0', letterSpacing: '-0.01em', color: '#1A1A1A', textTransform: 'uppercase' }}>
                    {company.name || 'NJ India Trading Pvt. Ltd.'}
                  </h1>
                  <div style={{ fontSize: HDR.info, lineHeight: HDR.lh, color: '#555' }}>
                    {(company.address || 'KNH Building, Neelithod Bridge, Parakkal\nRamanattukara PO, Kozhikode — 673633')
                      .split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}
                    Ph: {company.phone || '+91 73566 08633'} &nbsp;|&nbsp; {company.website || 'www.njindia.in'}
                  </div>
                </div>
              </div>

              {/* Thick divider */}
              <div style={{ borderBottom: '2.5px solid #1A1A1A', marginBottom: HDR.divMb }} />
              </div>
              {/* ── SCALABLE BODY (everything below the header fits to one page) ── */}
              <div className="q-body" ref={qBodyRef} style={{ '--q-fit': qFit, flexShrink: 0 }}>

              {/* Customer + Date */}
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

              {/* TABLE 1 — PRODUCT DETAILS WITH IMAGE */}
              {settings.showClassSpecBox !== false && tileClasses.length > 0 && !dropSpec && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb, pageBreakInside: 'avoid' }}>
                  <thead>
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
                    {tileClasses.map((className, idx) => {
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
                        <tr key={idx}>
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
              )}

              {/* TABLE 2 — ITEMISED ESTIMATE (image + actual/offer pricing) */}
              {(() => {
                // Base thumbnail size; rendered scaled by --q-fit (QFIT). All column
                // widths scale by the same factor so the table stays aligned.
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
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb }}>
                <thead>
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
                  {doc.items.map((item, i) => {
                    const offer = hasOffer(item);
                    const actualUnit = rowActualUnit(item);
                    const itemClass = data.classes?.find(c => c.name === item.className);
                    const brandColor = itemClass ? itemClass.color : PLUM;
                    const imgSrc = item.image ? mediaUrl(item.image) : '';
                    return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
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
              })()}

              {/* Add line item (edit affordance, hidden in print/PDF) */}
              <div className="q-edit-only" data-html2canvas-ignore="true" style={{ marginTop: `calc(-1 * ${D.tblMb})`, marginBottom: D.tblMb }}>
                <button onClick={addItemRow}
                  style={{ padding: '6px 12px', border: '1.5px dashed #c9b3c0', borderRadius: '6px', background: 'transparent', color: PLUM, fontWeight: 700, fontSize: D.subFont, cursor: 'pointer' }}>
                  + Add line item
                </button>
              </div>

              {/* ── PAYMENT (left, plain text) + TOTALS (right) ── */}
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
                              style={{ width: QFIT(78), height: 'auto', objectFit: 'contain', flexShrink: 0 }} />
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

                  {/* Grand Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${QFIT(12)} ${QFIT(14)}`, background: PLUM }}>
                    <span style={{ fontSize: D.rowFont, fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>TOTAL</span>
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

              {/* Delivery / Notes (optional, per-quotation) */}
              {/* Delivery & Notes — filled rows print; empty rows are edit-only (excluded from PDF) */}
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

              {/* Terms and Conditions — always 2-column, scaled with the body (D.*) */}
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
                  renderValue={() => {
                    const terms = quotationTerms;
                    const mid = Math.ceil(terms.length / 2);
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${QFIT(20)}` }}>
                        <ol style={{ margin: 0, paddingLeft: QFIT(14), fontSize: D.termsFs, lineHeight: D.termsLH, color: '#1A1A1A' }}>
                          {terms.slice(0, mid).map((term, i) => (
                            <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                          ))}
                        </ol>
                        <ol start={mid + 1} style={{ margin: 0, paddingLeft: QFIT(14), fontSize: D.termsFs, lineHeight: D.termsLH, color: '#1A1A1A' }}>
                          {terms.slice(mid).map((term, i) => (
                            <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                          ))}
                        </ol>
                      </div>
                    );
                  }}
                />
              </div>

              {/* Footer */}
              <div style={{
                borderTop: '2px solid #1A1A1A', marginTop: D.footMt, paddingTop: QFIT(14),
                fontSize: D.subFont, color: '#777', display: 'flex', justifyContent: 'space-between', fontWeight: 500,
              }}>
                <div>Valid for <EditableCell value={doc.validityDays ?? settings.validityDays ?? 30} numeric onSave={v => updateField('validityDays', v)} style={{ width: '40px', textAlign: 'center' }} /> days from date of issue.</div>
                <div>{settings.footerNote || 'NJ Quotation System'}</div>
              </div>

              </div>{/* ── /SCALABLE BODY ── */}
            </div>
            );
            })()}

            {/* ── Installation guidance pages — visible 2nd+ pages, inline-editable,
                   captured into the PDF. One page per in-cart class with guidance. ── */}
            {installClasses.length > 0 && (
              <div ref={installPagesRef} className="nj-install-pages" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', marginTop: '24px', transformOrigin: 'top center' }}>
                {installClasses.map((c, i) => (
                  <InstallPage
                    key={c.key || i}
                    c={c}
                    brand={wmEnabled ? watermarkBrandForItems(doc.items, data) : null}
                    companyName={company.name || 'NJ India'}
                    docId={doc.id}
                    onSave={v => updateInstallOverride(c.key, v)}
                  />
                ))}
              </div>
            )}
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
              brand={watermarkBrandForItems(activeCert?.items || doc.items, data)}
              watermarkEnabled={certWmEnabled}
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
