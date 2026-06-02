import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, RotateCcw, ShieldCheck, FileText, Download, Edit3, FileType2, Share2 } from 'lucide-react';
import { downloadWarrantyDocx, createWarranty } from '../api';
import { elementToPdf, elementToPdfFile, shareFiles, warrantyFileName, beginPdfSave, finishPdfSave } from '../share';

// ── Inline-Editable Cell ───────────────────────────────────────────────────
function EditableCell({ value, onSave, multiline = false, style = {}, renderValue, hideIcon }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');
  React.useEffect(() => { setDraft(value || ''); }, [value]);

  const startEditing = () => {
    setEditing(true);
    document.body.setAttribute('data-warranty-editing', 'true');
  };

  const stopEditing = () => {
    setEditing(false);
    document.body.removeAttribute('data-warranty-editing');
  };

  const commit = () => { stopEditing(); if (draft !== value) onSave(draft); };

  if (editing) {
    const s = {
      width: '100%', border: 'none', borderBottom: '1.5px solid #8b1a1a',
      background: 'rgba(139,26,26,0.04)', padding: '2px 4px',
      fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit',
      color: 'inherit', outline: 'none', boxSizing: 'border-box', overflow: 'hidden', ...style
    };
    return multiline
      ? <textarea autoFocus value={draft}
          style={s}
          ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
          onChange={e => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value || ''); stopEditing(); } }} />
      : <input autoFocus type="text" value={draft} style={s}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); stopEditing(); } }} />;
  }
  
  // Optional custom renderer for the display state
  const displayContent = renderValue ? renderValue(value) : (value || <span style={{ color: '#aaa', fontStyle: 'italic' }}>click to fill</span>);

  return (
    <span onClick={startEditing} title="Click to edit" className="wd-editable" style={{ cursor: 'text', display: 'inline-block', width: '100%', ...style }}>
      {displayContent}
      {hideIcon ? null : <Edit3 size={9} style={{ marginLeft: '4px', opacity: 0.25, verticalAlign: 'middle', display: 'inline-block' }} />}
    </span>
  );
}

// ── Parse bullet lines ─────────────────────────────────────────────────────
const toBullets = (text) =>
  (text || '').split('\n').filter(t => t.trim()).map(t => t.replace(/^[•\-\*]\s*/, '').trim());

// ── Parse Heatout graduated liability from guarantees text ─────────────────
function parseHeatoutLiability(text) {
  const rows = [];
  const extras = [];
  for (const line of (text || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // Match "Years 0-10: 100% warrantor liability" or "Years 21-25: 10% liability"
    const m = t.match(/^Years?\s+([\d]+-[\d]+):\s*(.+)/i);
    if (m) {
      rows.push({ period: `Years ${m[1]}`, liability: m[2].trim() });
    } else {
      extras.push(t.replace(/^[•\-\*]\s*/, ''));
    }
  }
  return { rows, extras };
}

// ═══════════════════════════════════════════════════════════════════════════
export default function WarrantyDocument() {
  const {
    activeWarranty: doc, data, setData, setCurrentView,
    setCart, setCustomer, setActiveWarranty, setActiveQuotation, setActiveQuotationId, setActiveTab, setGenerateIntent, showToast
  } = useAppContext();

  const [isDownloading, setIsDownloading] = React.useState(false);

  if (!doc) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <ShieldCheck size={48} color="var(--ink-soft)" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginBottom: '16px', color: 'var(--ink)' }}>
          No Active Warranty Certificate
        </h2>
        <p style={{ color: 'var(--ink-soft)', marginBottom: '24px' }}>
          Generate a warranty from Checkout or the Quotation view.
        </p>
        <button className="btn-primary" onClick={() => setCurrentView('quotation_desk')}>Go to Quotation Desk</button>
      </div>
    );
  }

  // Resolve template. Editable CONTENT (sections / opening) prefers the saved
  // certificate; STRUCTURAL display fields (warranty-period series table, heatout
  // table) are defined by the warranty *type*, not per-certificate, so they are
  // always taken from the current warranty definition. This ensures the period
  // table never goes missing on older saved certificates (e.g. Docke, Ceramic).
  const storedTpl = (doc.template && typeof doc.template === 'object') ? doc.template : {};
  const tplId = (typeof doc.template === 'string') ? doc.template : storedTpl.id;
  let matched = data.warranties?.find(w => w.id === tplId);
  if (!matched) {
    const n = (((doc.items && doc.items.length > 0) ? doc.items[0].className : '') || '').toLowerCase();
    let fallbackId = 'nj_laminated';
    if (n.includes('stone') || n.includes('metal')) fallbackId = 'stone_coated';
    else if (n.includes('heat') || n.includes('ceiling')) fallbackId = 'heatout';
    else if (n.includes('ceramic') || n.includes('clay')) fallbackId = 'ceramic';
    else if (n.includes('pie') || n.includes('bitumen') || n.includes('docke')) fallbackId = 'docke';
    matched = data.warranties?.find(w => w.id === fallbackId);
  }
  let template = matched ? { ...matched, ...storedTpl } : { ...storedTpl };
  if (matched) {
    if (!template.sections || template.sections.length === 0) {
      template.sections = matched.sections;
      template.opening = template.opening || matched.opening;
    }
    // Structural tables come from the warranty definition (not editable per cert)
    template.showSeriesTable = matched.showSeriesTable;
    template.seriesTable = (matched.seriesTable && matched.seriesTable.length) ? matched.seriesTable : (template.seriesTable || []);
    if (matched.heatoutTable !== undefined) template.heatoutTable = matched.heatoutTable;
    if (!template.id) template.id = matched.id;
  }

  const customer  = doc.customer  || {};
  const certData  = doc.certData  || {};

  // Is this a standalone "Warranty Only" certificate? Its parent quotation is a
  // hidden warrantyOnly record (or missing). Standalone certs have no real
  // quotation to go back to, so the action bar adapts below.
  const parentQuote = data.quotations?.find(q => q.id === doc.quotationId) || null;
  const isStandalone = !parentQuote || parentQuote.warrantyOnly;

  // ── In-place warranty editing — sibling of the quotation's persistDoc ───────
  // Every edit persists immediately: it updates the active certificate + the
  // warranty_certificates registry AND upserts to the backend (createWarranty),
  // so warranty edits are saved exactly like quotation edits (previously they
  // lived only in memory until the app happened to save on exit).
  const certKey = (w) => w.id || w.warrantyNo;
  const persistWarranty = (updatedDoc) => {
    setActiveWarranty(updatedDoc);
    setData(prev => {
      const h = prev.warranty_certificates || [];
      const i = h.findIndex(w => certKey(w) === certKey(doc));
      if (i === -1) return prev;
      const nh = [...h]; nh[i] = updatedDoc;
      return { ...prev, warranty_certificates: nh };
    });
    createWarranty(updatedDoc).catch(() => {}); // fire-and-forget; local copy already saved
  };

  // Keep the certificate's product snapshot (certData.product*) in step with the
  // line it points at, mirroring the quotation's syncCertToQuotation.
  const syncCert = (d) => {
    const items = d.items || [];
    let sel = items.find(it => it.cartId === d.certData?.selectedCartId);
    if (!sel) sel = items.find(it => it.className === d.template?.forClass) || items[0] || null;
    return {
      ...d,
      certData: {
        ...d.certData,
        productName: sel?.name ?? d.certData?.productName,
        productColor: sel?.color ?? d.certData?.productColor,
        productQty: sel?.qty ?? d.certData?.productQty,
        productUnit: sel?.unit ?? d.certData?.productUnit,
        selectedCartId: sel?.cartId ?? d.certData?.selectedCartId ?? '',
      },
    };
  };

  const updateCertField = (field, value) =>
    persistWarranty({ ...doc, certData: { ...certData, [field]: value } });

  const updateCustomerField = (field, value) =>
    persistWarranty({ ...doc, customer: { ...customer, [field]: value } });

  const updateTemplateField = (field, value) =>
    persistWarranty({ ...doc, template: { ...template, [field]: value } });

  const updateSection = (idx, field, value) => {
    const updatedSections = [...(template.sections || [])];
    updatedSections[idx] = { ...updatedSections[idx], [field]: value };
    persistWarranty({ ...doc, template: { ...template, sections: updatedSections } });
  };

  // ── Line-item editing (parity with the quotation) ──────────────────────────
  const items = doc.items || [];
  const updateItemField = (cartId, field, value) =>
    persistWarranty(syncCert({ ...doc, items: items.map(it => it.cartId === cartId ? { ...it, [field]: value } : it) }));
  const setItemQty = (cartId, v) =>
    persistWarranty(syncCert({ ...doc, items: items.map(it => it.cartId === cartId ? { ...it, qty: Number(v) || 0 } : it) }));
  const removeItemRow = (cartId) =>
    persistWarranty(syncCert({ ...doc, items: items.filter(it => it.cartId !== cartId) }));
  const addItemRow = () =>
    persistWarranty(syncCert({ ...doc, items: [...items, { cartId: 'custom_' + Date.now(), id: 'custom', name: 'Custom Product / Item', className: 'Custom', qty: 1, unit: 'nos', color: '' }] }));

  // ── Customer phone (parity with the quotation) ─────────────────────────────
  const updateCustomerPhone = (v) => updateCustomerField('phone', v);

  const bodyInnerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const inner = bodyInnerRef.current;
    if (!inner) return;

    const wrapper = inner.parentElement;
    const AVAIL_H = wrapper.clientHeight;
    const AVAIL_W = wrapper.clientWidth; // Typically 690px

    // While editing, reset scale to 100% so the text is fully readable and large
    if (document.body.getAttribute('data-warranty-editing') === 'true') {
      inner.style.transform = 'none';
      inner.style.width = AVAIL_W + 'px';
      return;
    }

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

  const downloadPDF = async () => {
    if (isDownloading) return;
    const el = document.getElementById('warrantyDoc');
    if (!el) { if (showToast) showToast('Element not found.', 'error'); return; }

    const wName = `NJ_Warranty_${doc.warrantyNo || 'NJ-W-0001'}_${(customer.name || 'Customer').replace(/\s+/g, '_')}.pdf`;
    const dest = await beginPdfSave(wName);
    if (dest.mode === 'cancelled') { if (showToast) showToast('Save cancelled', 'info'); return; }

    setIsDownloading(true);
    if (showToast) showToast('Generating PDF…', 'info');
    try {
      // One engine: full-size, multi-page A4 (never shrunk/stretched). Same as Share.
      const pdf = await elementToPdf(el);
      const r = await finishPdfSave(pdf, wName, dest);
      if (showToast) showToast(r === 'saved' ? 'PDF saved!' : 'PDF downloaded!', 'success');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('PDF failed. Use Print (Ctrl+P).', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const shareWarranty = async () => {
    setIsDownloading(true);
    try {
      const el = document.getElementById('warrantyDoc');
      const custName = (doc.customer && doc.customer.name) || '';
      const file = await elementToPdfFile(el, warrantyFileName(doc, custName));
      const r = await shareFiles([file], { title: `NJ India Warranty — ${custName || 'Customer'}`, text: 'Warranty certificate from NJ India' });
      if (showToast) showToast(r === 'downloaded' ? 'Saved — attach it in WhatsApp/Email' : r === 'cancelled' ? 'Share cancelled' : 'Shared', r === 'downloaded' ? 'success' : 'info');
    } catch { if (showToast) showToast('Share failed', 'error'); }
    finally { setIsDownloading(false); }
  };

  const startNew = () => {
    setCart([]); setCustomer({ name: '', phone: '', email: '', address: '' });
    setActiveWarranty(null); setActiveQuotation(null); setActiveQuotationId?.(null);
    setCurrentView('quotation_desk');
  };

  // ── Template type flags ──────────────────────────────────────────────────
  const isDocke       = template.id === 'docke';
  const isCeramic     = template.id === 'ceramic';
  const isStoneCoated = template.id === 'stone_coated';
  const isHeatout     = template.id === 'heatout';

  const certRef = doc.warrantyNo || doc.id || 'NJ-W-0001';

  const sections = template.sections || [];
  const half = sections.length === 3 ? 1 : Math.ceil(sections.length / 2);
  const leftSections = sections.slice(0, half);
  const rightSections = sections.slice(half);

  return (
    <div className="animate-fade-up" style={{ paddingBottom: '100px', background: 'var(--bg)', minHeight: '100vh' }}>

      <style dangerouslySetInnerHTML={{ __html: `
        /* Playfair Display is bundled locally via @fontsource (see main.jsx) so
           the certificate renders correctly with no internet connection. */

        /* ── Page wrapper ── */
        .wd-page-wrap { max-width: 880px; margin: 0 auto; padding: 24px 24px 0; }
        .wd-actions   { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .wd-hint      { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 10px 14px; background: rgba(139,26,26,0.05); border-radius: 8px; border: 1px solid rgba(139,26,26,0.15); font-size: 12px; color: #8b1a1a; font-weight: 600; }

        /* ════════════════════════════════════════════════════
           THE A4 WARRANTY CERTIFICATE
           ════════════════════════════════════════════════════ */
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
        body[data-warranty-editing="true"] .warranty-doc {
          overflow: visible !important;
        }
        .warranty-doc .wd-header { text-align: center; padding-bottom: 7px; margin-bottom: 0; border-bottom: 2px solid #111; flex-shrink: 0; }
        .warranty-doc .wd-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: flex-end; flex-shrink: 0; margin-top: auto; }
        
        /* ── DENSE MODE — Heatout & Stone Coated (content-heavy) ──
           Header logo, footer seal, signature are NOT in dense scope — same size.
           Only body text and spacing are compacted. */
        .is-dense .wd-opening { font-size: 8pt; line-height: 1.15; margin-bottom: 6px; }
        .is-dense .wd-section { margin-bottom: 2px; }
        .is-dense .wd-section-head { font-size: 8pt; margin-bottom: 1px; padding-bottom: 1px; }
        .is-dense .wd-body { font-size: 8pt; line-height: 1.15; }
        .is-dense .wd-body p { margin-bottom: 1px; }
        .is-dense .wd-body li { font-size: 7.5pt; line-height: 1.1; margin-bottom: 0; }
        .is-dense .wd-body ul { margin: 1px 0 0; padding-left: 12px; }
        .is-dense .wd-two-col { gap: 8px; margin-bottom: 6px; }
        .is-dense .wd-banner { font-size: 10pt; padding: 4px 0; margin: 5px 0 7px; }
        .is-dense .wd-duration { padding: 4px 10px; margin: 4px 0 6px; }
        .is-dense .wd-table { font-size: 7.5pt; }
        .is-dense .wd-table th { padding: 2px 5px; font-size: 7pt; }
        .is-dense .wd-table td { padding: 2px 5px; }
        .is-dense .wd-cert-block { margin-top: 4px; padding-top: 4px; }
        .is-dense .wd-cert-title { margin-bottom: 2px; padding-bottom: 1px; }
        .is-dense .wd-cert-row { font-size: 8.5pt; padding: 1px 0; }
        .is-dense .wd-cert-lbl { font-size: 8pt; min-width: 160px; }

        /* ── Watermark ── */
        .wd-wm {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%) rotate(-30deg);
          font-size: 72pt; font-weight: 900; pointer-events: none; user-select: none;
          color: rgba(0,0,0,0.028); white-space: nowrap; letter-spacing: 0.1em;
          font-family: 'Times New Roman', serif;
        }

        /* ── Header ── */
        .wd-logo {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 82pt;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #111;
          margin: 0;
          line-height: 1.1;
        }
        .wd-logo-sub {
          font-size: 9.5pt;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #444;
          font-weight: 700;
          margin: 3px 0 0;
          font-family: 'Times New Roman', Times, Georgia, serif;
        }

        /* ── Certificate Banner ── */
        .wd-banner {
          text-align: center;
          font-size: 11.5pt;
          letter-spacing: 0.28em;
          font-weight: 700;
          padding: 6px 0;
          border-top: 2px solid #111;
          border-bottom: 2px solid #111;
          margin: 8px 0 10px;
          text-transform: uppercase;
          color: #111;
          font-family: 'Times New Roman', Times, Georgia, serif;
        }

        /* ── Opening ── */
        .wd-opening { font-size: 11.5pt; line-height: 1.5; margin-bottom: 12px; text-align: justify; }
        .wd-opening em { font-style: italic; display: block; margin-bottom: 6px; font-size: 12pt; }

        /* ── Sections ── */
        .wd-section { margin-bottom: 8px; page-break-inside: avoid; }
        .wd-section-head { font-size: 10.5pt; font-weight: 700; letter-spacing: 0.06em; color: #111; margin: 0 0 4px; padding-bottom: 2px; border-bottom: 1.5px solid #aaa; font-family: 'Times New Roman', Times, Georgia, serif; }

        .wd-body { font-size: 11pt; line-height: 1.4; color: #222; }
        .wd-body p { margin: 0 0 4px; text-align: justify; }
        .wd-body ul { margin: 4px 0 0; padding-left: 18px; }
        .wd-body li { margin-bottom: 3px; font-size: 10.5pt; text-align: justify; line-height: 1.35; }

        /* ── Duration callout ── */
        .wd-duration {
          border: 1.5px solid #8b1a1a;
          border-left: 5px solid #8b1a1a;
          padding: 5px 14px;
          margin: 6px 0 8px;
          background: #fef9f9;
        }
        .wd-duration-label { font-size: 8.5pt; letter-spacing: 0.08em; color: #8b1a1a; font-weight: 700; display: block; margin-bottom: 2px; font-family: 'Times New Roman', Times, Georgia, serif; }
        .wd-duration-value { font-size: 13pt; font-weight: 700; color: #8b1a1a; font-family: 'Playfair Display', Georgia, serif; }

        /* ── Two-column ── */
        .wd-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 4px;
        }

        /* ── Series / Liability table ── */
        .wd-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9.5pt; }
        .wd-table th { background: #111; color: #fff; padding: 5px 8px; text-align: left; font-size: 9pt; letter-spacing: 0.04em; font-family: 'Times New Roman', Times, Georgia, serif; border: 1px solid #111; }
        .wd-table td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: middle; }
        .wd-table tr:nth-child(odd) td { background: #fafafa; }
        .wd-table .td-dur { font-weight: 700; color: #8b1a1a; text-align: center; }
        .wd-table .td-pct { font-weight: 700; color: #8b1a1a; text-align: center; min-width: 80px; }
        .wd-table .td-empty td { color: #bbb; }

        /* ── Certificate details (fill-in style) ── */
        .wd-cert-block { margin-top: 8px; padding-top: 8px; border-top: 2px solid #111; }
        .wd-cert-title { font-size: 11pt; font-weight: 700; letter-spacing: 0.06em; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #aaa; font-family: 'Times New Roman', Times, Georgia, serif; color: #111; }
        .wd-cert-row { display: flex; align-items: baseline; padding: 4px 0; border-bottom: 1px dotted #ccc; font-size: 11.5pt; gap: 10px; }
        .warranty-doc .wd-cert-lbl { min-width: 210px; color: #444; font-weight: 600; font-size: 11pt; flex-shrink: 0; }
        .warranty-doc .wd-cert-lbl::after { content: ':'; }
        .warranty-doc .wd-cert-val { font-weight: 700; color: #111; flex: 1; border-bottom: 1px solid #999; min-height: 20px; padding: 0 4px 1px; }
        .warranty-doc .wd-cert-val-static { font-weight: 700; color: #111; flex: 1; padding: 0 4px 1px; border-bottom: 1px solid #ddd; }
        
        .warranty-doc .wd-sig-block { text-align: center; font-size: 10pt; color: #555; } .wd-editable {
          display: inline-flex; align-items: center; gap: 2px;
          border-radius: 2px; padding: 0 2px; transition: background 0.15s;
          width: 100%;
        }
        .wd-editable:hover {
          background: rgba(139,26,26,0.05);
          outline: 1px dashed rgba(139,26,26,0.35);
        }
        .wd-batch-warn { color: #dc2626; font-size: 8pt; margin-left: 6px; font-weight: 700; }

        /* Editing affordances (add/remove buttons): visible on screen, never in
           the exported/printed certificate. data-html2canvas-ignore keeps them out
           of the Download/Share capture; the @media print rule keeps them out of
           Ctrl+P. */
        .wd-edit-only { }
        .wd-rm-btn { background: transparent; border: none; color: #dc2626; font-weight: 700; cursor: pointer; font-size: 8.5pt; padding: 0 0 0 6px; }
        .wd-add-btn { padding: 5px 11px; border: 1.5px dashed #c9a3a3; border-radius: 6px; background: transparent; color: #8b1a1a; font-weight: 700; font-size: 9pt; cursor: pointer; margin-top: 6px; }
        @media print { .wd-edit-only { display: none !important; } }

        /* ── Footer — always anchored to bottom, never scaled ── */
        .wd-sig-block { text-align: center; font-size: 10pt; color: #555; }
        .wd-sig-line {
          height: 80px;
          border-bottom: 1px solid #111;
          width: 200px;
          margin: 0 auto 4px;
        }
        .wd-sig-name { color: #111; font-weight: 700; font-size: 10.5pt; padding-top: 3px; font-family: 'Times New Roman', Times, Georgia, serif; letter-spacing: 0.05em; }

        /* Circular seal SVG */
        .wd-seal-svg { display: block; margin: 0 auto 4px; width: 140px; height: 140px; }

        /* Heatout liability extras */
        .wd-ht-extra { margin-top: 6px; }
        .wd-ht-extra li { font-size: 9.5pt; }

        /* ISO badges for ceramic */
        .wd-iso-badges {
          display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;
        }
        .wd-iso-badge {
          border: 1.5px solid #111;
          border-radius: 4px;
          padding: 3px 8px;
          font-size: 8pt;
          font-weight: 700;
          letter-spacing: 0.06em;
          font-family: 'Times New Roman', Times, Georgia, serif;
          color: #111;
          background: #f8f8f8;
        }

        /* ── Print ── */
        @media print {
          body, html { background: #fff !important; margin: 0 !important; padding: 0 !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .wd-actions, .wd-hint { display: none !important; }
          .wd-page-wrap { padding: 0 !important; max-width: 100% !important; }
          .main-content-scroll-container { padding: 0 !important; overflow: visible !important; }
          .warranty-doc {
            box-shadow: none !important; border: none !important;
            width: 100% !important; max-width: 100% !important;
            min-height: 0 !important; margin: 0 !important;
            padding: 12mm 16mm !important;
          }
          @page { size: A4 portrait; margin: 0; }
          /* Reset the on-screen fit-scale so the certificate prints at full size
             and flows across pages instead of being squeezed onto one. */
          .wd-body-inner { transform: none !important; width: 100% !important; }
          .wd-section { page-break-inside: avoid; }
          .wd-two-col { page-break-inside: avoid; }
          .wd-cert-row { page-break-inside: avoid; }
          .wd-edit-only { display: none !important; }
        }
      `}} />

      <div className="wd-page-wrap">

        {/* ── ACTION BAR ── */}
        <div className="wd-actions">
          <button
            onClick={() => {
              if (isStandalone) { setCurrentView('warranties'); return; }
              setActiveQuotation(parentQuote);
              setActiveTab?.(doc.warrantyNo || doc.id);
              setCurrentView('quotation_document');
            }}
            className="hover-lift"
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
            <ArrowLeft size={15}/> {isStandalone ? 'Back to Warranties' : 'Back'}
          </button>
          {!isStandalone && (
            <button onClick={() => { setGenerateIntent?.('quote'); setCurrentView('checkout'); }} className="hover-lift"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
              <FileText size={15}/> Edit Checkout
            </button>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:'10px' }}>
            <button onClick={downloadPDF} disabled={isDownloading} className="hover-lift"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--accent)', color:'white', border:'none', borderRadius:'var(--radius-full)', fontWeight:600, cursor:isDownloading?'not-allowed':'pointer', fontSize:'13px', opacity:isDownloading?0.7:1 }}>
              <Download size={15}/> {isDownloading ? 'Generating…' : 'Download PDF'}
            </button>
            <button onClick={shareWarranty} disabled={isDownloading} className="hover-lift"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'#1d4ed8', color:'white', border:'none', borderRadius:'var(--radius-full)', fontWeight:600, cursor:isDownloading?'not-allowed':'pointer', fontSize:'13px', opacity:isDownloading?0.7:1 }}>
              <Share2 size={15}/> Share
            </button>
            <button onClick={() => downloadWarrantyDocx(doc.warrantyNo || doc.id, { ...doc, template }, `NJ_Warranty_${doc.warrantyNo || 'NJ-W-0001'}_${(customer.name || 'Customer').replace(/\s+/g,'_')}.docx`).catch(e => showToast && showToast('Word download failed: ' + e.message, 'error'))} className="hover-lift"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'#2d6a4f', color:'white', border:'none', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
              <FileType2 size={15}/> Download Word
            </button>
            <button onClick={startNew} className="hover-lift"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
              <RotateCcw size={15}/> New Order
            </button>
          </div>
        </div>

        {/* ── EDIT HINT ── */}
        <div className="wd-hint">
          <Edit3 size={13} />
          Click any text, paragraph, or certificate field below to edit it directly on the document.
        </div>

        {/* ════════════════════════════════════════════════════════
            WARRANTY CERTIFICATE — A4 document
            ════════════════════════════════════════════════════════ */}
        <div className={`warranty-doc${(isHeatout || isStoneCoated) ? ' is-dense' : ''}`} id="warrantyDoc">

          <div className="wd-wm">WARRANTY</div>

          {/* ══ HEADER ══ */}
          <div className="wd-header">
            {template.logo && template.logo.startsWith('data:image/') ? (
              <>
                <img src={template.logo} alt="Logo"
                  style={{ height: '130px', width: 'auto', maxWidth: '600px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
                <p className="wd-logo-sub">{template.title || 'Warranty Certificate'}</p>
              </>
            ) : isDocke ? (
              <>
                <p className="wd-logo" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic' }}>
                  Döcke
                </p>
                <p className="wd-logo-sub">PIE — Bitumen Shingles</p>
              </>
            ) : (
              <>
                <p className="wd-logo">
                  {template.logo || 'NJ'}
                </p>
                <p className="wd-logo-sub">{template.title || 'Warranty Certificate'}</p>
              </>
            )}
          </div>{/* end wd-header */}

          <div style={{ flex: 1, position: 'relative', width: '100%', marginTop: '6px', marginBottom: '16px', minHeight: 0 }}>
            <div ref={bodyInnerRef} className="wd-body-inner" style={{ width: '100%', transformOrigin: 'top left' }}>

          {/* ══ BANNER ══ */}
          <div className="wd-banner">Warranty Certificate</div>

          <div className="wd-two-col" style={{ marginBottom: '14px' }}>
            {/* Left Column: Dear Customer + Left Sections */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="wd-opening" style={{ marginBottom: '12px' }}>
                <em>Dear Customer,</em>
                <EditableCell 
                  value={template.opening || 'Congratulations on your purchase...'}
                  onSave={v => updateTemplateField('opening', v)}
                  multiline
                />
              </div>
              {leftSections.map((sec, idx) => (
                <div key={idx} className="wd-section" style={{ marginBottom: idx === leftSections.length - 1 ? 0 : '10px' }}>
                  <div className="wd-section-head">
                    <EditableCell 
                      value={sec.title}
                      onSave={v => updateSection(idx, 'title', v)}
                      style={{ display: 'block', width: '100%', fontWeight: 'inherit', letterSpacing: 'inherit', fontSize: 'inherit' }}
                    />
                  </div>
                  <div className="wd-body">
                    <EditableCell
                      value={sec.content}
                      onSave={v => updateSection(idx, 'content', v)}
                      multiline
                      hideIcon
                      renderValue={(val) => {
                        if (sec.isBullets) {
                          return (
                            <ul style={{ margin: 0, paddingLeft: '14px' }}>
                              {toBullets(val).map((t, i) => <li key={i}>{t}</li>)}
                            </ul>
                          );
                        } else {
                          return (
                            <div style={{ margin: 0 }}>
                              {(val || '').split('\n').map((line, i) => (
                                <p key={i} style={{ margin: '0 0 5px' }}>{line}</p>
                              ))}
                            </div>
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Right Column: Right Sections */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rightSections.map((sec, idx) => {
                const originalIdx = half + idx;
                return (
                  <div key={originalIdx} className="wd-section" style={{ marginBottom: idx === rightSections.length - 1 ? 0 : '10px' }}>
                    <div className="wd-section-head">
                      <EditableCell 
                        value={sec.title}
                        onSave={v => updateSection(originalIdx, 'title', v)}
                        style={{ display: 'block', width: '100%', fontWeight: 'inherit', letterSpacing: 'inherit', fontSize: 'inherit' }}
                      />
                    </div>
                    <div className="wd-body">
                      <EditableCell
                        value={sec.content}
                        onSave={v => updateSection(originalIdx, 'content', v)}
                        multiline
                        hideIcon
                        renderValue={(val) => {
                          if (sec.isBullets) {
                            return (
                              <ul style={{ margin: 0, paddingLeft: '14px' }}>
                                {toBullets(val).map((t, i) => <li key={i}>{t}</li>)}
                              </ul>
                            );
                          } else {
                            return (
                              <div style={{ margin: 0 }}>
                                {(val || '').split('\n').map((line, i) => (
                                  <p key={i} style={{ margin: '0 0 5px' }}>{line}</p>
                                ))}
                              </div>
                            );
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══ SERIES TABLE (if applicable) ══ */}
          {template.heatoutTable && (
            <div className="wd-section">
              <div className="wd-section-head">Liability Table</div>
              <div className="wd-body">
                <table className="wd-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', width: '50%' }}>Years of use counted from the purchase date</th>
                      <th style={{ textAlign: 'center', width: '50%' }}>Share of the Warrantor liability in % of the purchase price for the replaced product element and the cost of its installation / cost of repairing the product or an element thereof / price paid for the product which price is to be reimbursed</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>0-10 years</td><td className="td-pct">100%</td></tr>
                    <tr><td>10-12 years</td><td className="td-pct">50%</td></tr>
                    <tr><td>12-18 years</td><td className="td-pct">40%</td></tr>
                    <tr><td>18-20 years</td><td className="td-pct">30%</td></tr>
                    <tr><td>20-21 years</td><td className="td-pct">20%</td></tr>
                    <tr><td>21-25 years</td><td className="td-pct">10%</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {template.showSeriesTable && (
            <div className="wd-section">
              <div className="wd-section-head">Warranty Period by Series</div>
              <div className="wd-body">
                <table className="wd-table">
                  <thead>
                    <tr>
                      <th>Series / Model</th>
                      <th style={{ textAlign: 'center' }}>Warranty Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(template.seriesTable && template.seriesTable.length > 0)
                      ? template.seriesTable.map((s, i) => (
                          <tr key={i}>
                            <td>{s.series}</td>
                            <td className="td-dur">{s.duration}</td>
                          </tr>
                        ))
                      : [1, 2].map(i => (
                          <tr key={i} className="td-empty">
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                          </tr>
                        ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              CERTIFICATE DETAILS — fill-in style registry
              ════════════════════════════════════════════════════════ */}
          <div className="wd-cert-block">
            <div className="wd-cert-title">Certificate Details</div>

            {/* Customer Name (editable — parity with quotation) */}
            <div className="wd-cert-row">
              <span className="wd-cert-lbl">Customer Name</span>
              <span className="wd-cert-val">
                <EditableCell value={customer.name} onSave={v => updateCustomerField('name', v)} />
              </span>
            </div>

            {/* Customer Phone (editable — parity with quotation) */}
            <div className="wd-cert-row">
              <span className="wd-cert-lbl">Phone</span>
              <span className="wd-cert-val">
                <EditableCell value={customer.phone} onSave={updateCustomerPhone} />
              </span>
            </div>

            {/* Address Row (all templates) */}
            <div className="wd-cert-row">
              <span className="wd-cert-lbl">Address</span>
              <span className="wd-cert-val">
                <EditableCell 
                  value={certData.siteAddress || [customer.name, customer.address].filter(Boolean).join(', ')} 
                  onSave={v => updateCertField('siteAddress', v)} 
                  multiline 
                />
              </span>
            </div>

            {/* Product Row (all templates) */}
            <div className="wd-cert-row">
              <span className="wd-cert-lbl">
                {isHeatout || isStoneCoated || isCeramic 
                  ? "The name of the sold products (complete, including color)" 
                  : "Product Name & Color"}
              </span>
              <span className="wd-cert-val">
                <EditableCell
                  value={certData.productName || [certData.productName, (certData.productColor && certData.productColor !== 'N/A') ? certData.productColor : null].filter(Boolean).join(' — ')}
                  onSave={v => updateCertField('productName', v)}
                />
              </span>
            </div>

            {/* Covered Products — full line-item editing (parity with quotation).
                Add/remove/qty/name are editable; the add/remove affordances are
                edit-only (kept out of the exported certificate). */}
            {items.length > 0 && (
              <div className="wd-cert-row" style={{ alignItems: 'flex-start' }}>
                <span className="wd-cert-lbl">Covered Products</span>
                <span className="wd-cert-val" style={{ borderBottom: 'none', padding: 0 }}>
                  {items.map(it => (
                    <div key={it.cartId} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', padding: '1px 0', borderBottom: '1px dotted #ddd' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <EditableCell value={it.name} onSave={v => updateItemField(it.cartId, 'name', v)} />
                      </span>
                      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <EditableCell value={it.qty} onSave={v => setItemQty(it.cartId, v)} style={{ width: '40px', display: 'inline-block', textAlign: 'right' }} hideIcon />
                        &nbsp;{it.unit || 'nos'}
                      </span>
                      <button className="wd-edit-only wd-rm-btn" data-html2canvas-ignore="true"
                        onClick={() => removeItemRow(it.cartId)} title="Remove this product">✕</button>
                    </div>
                  ))}
                </span>
              </div>
            )}
            <div className="wd-edit-only" data-html2canvas-ignore="true">
              <button className="wd-add-btn" onClick={addItemRow}>+ Add product</button>
            </div>

            {/* Batch Number Row (Docke and Ceramic) */}
            {isDocke && (
              <div className="wd-cert-row">
                <span className="wd-cert-lbl">Batch Number</span>
                <span className="wd-cert-val">
                  <EditableCell value={certData.batchNo} onSave={v => updateCertField('batchNo', v)} />
                </span>
              </div>
            )}

            {isCeramic && (
              <div className="wd-cert-row">
                <span className="wd-cert-lbl">Batch Number (see on the packaging)</span>
                <span className="wd-cert-val">
                  <EditableCell value={certData.batchNo} onSave={v => updateCertField('batchNo', v)} />
                </span>
              </div>
            )}

            {/* Date Row (all templates EXCEPT Ceramic) */}
            {!isCeramic && (
              <div className="wd-cert-row">
                <span className="wd-cert-lbl">Date</span>
                <span className="wd-cert-val">
                  <EditableCell value={certData.purchaseDate || doc.date} onSave={v => updateCertField('purchaseDate', v)} />
                </span>
              </div>
            )}

            {/* Trading Organization (all templates EXCEPT Heatout) */}
            {!isHeatout && (
              <div className="wd-cert-row">
                <span className="wd-cert-lbl">Trading Organization</span>
                <span className="wd-cert-val-static">NOUFAL &amp; JABBAR INTERNATIONAL LLP</span>
              </div>
            )}

            {/* Seller's Name & Signature Row (all templates) */}
            <div className="wd-cert-row">
              <span className="wd-cert-lbl">Seller's Name &amp; Signature</span>
              <span className="wd-cert-val">
                <EditableCell value={certData.sellerName} onSave={v => updateCertField('sellerName', v)} />
              </span>
            </div>

            {/* Date Row for Ceramic only (renders at bottom) */}
            {isCeramic && (
              <div className="wd-cert-row">
                <span className="wd-cert-lbl">Date</span>
                <span className="wd-cert-val">
                  <EditableCell value={certData.purchaseDate || doc.date} onSave={v => updateCertField('purchaseDate', v)} />
                </span>
              </div>
            )}
          </div>{/* end wd-cert-block */}

            </div>
          </div>

          {/* ══ FOOTER ══ */}
          <div className="wd-footer">

            {/* Seller Signature */}
            <div className="wd-sig-block">
              {template.signImage
                ? <img src={template.signImage} alt="Signature"
                    style={{ maxHeight: '110px', maxWidth: '240px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
                : <div className="wd-sig-line" />}
              <div className="wd-sig-name">Seller's Signature</div>
            </div>

            {/* Authorized Stamp */}
            <div className="wd-sig-block">
              {template.sealImage
                ? <img src={template.sealImage} alt="Stamp"
                    style={{ width: '160px', height: '160px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
                : (
                  <svg className="wd-seal-svg" viewBox="0 0 82 82">
                    {/* Outer double ring */}
                    <circle cx="41" cy="41" r="39" fill="none" stroke="#8b1a1a" strokeWidth="2"/>
                    <circle cx="41" cy="41" r="34" fill="none" stroke="#8b1a1a" strokeWidth="1"/>
                    {/* Inner fill */}
                    <circle cx="41" cy="41" r="33" fill="#fef9f9"/>
                    {/* Top arc text: NOUFAL & JABBAR INTERNATIONAL LLP */}
                    <path id="topArc" d="M 9,41 A 32,32 0 0,1 73,41" fill="none"/>
                    <text fontSize="5.2" fontFamily="Arial, sans-serif" fontWeight="900" fill="#8b1a1a" letterSpacing="0.5">
                      <textPath href="#topArc" startOffset="50%" textAnchor="middle">
                        NOUFAL &amp; JABBAR INTERNATIONAL LLP
                      </textPath>
                    </text>
                    {/* Bottom arc text: Bypass Road Ramanattukara */}
                    <path id="botArc" d="M 9,41 A 32,32 0 0,0 73,41" fill="none"/>
                    <text fontSize="5" fontFamily="Arial, sans-serif" fontWeight="700" fill="#8b1a1a" letterSpacing="0.3">
                      <textPath href="#botArc" startOffset="50%" textAnchor="middle">
                        Bypass Road · Ramanattukara
                      </textPath>
                    </text>
                    {/* Centre logo text */}
                    <text x="41" y="37" textAnchor="middle" fontSize="9" fontFamily="'Times New Roman', serif" fontWeight="900" fill="#8b1a1a">NJ</text>
                    <text x="41" y="46" textAnchor="middle" fontSize="4.5" fontFamily="Arial, sans-serif" fontWeight="700" fill="#8b1a1a" letterSpacing="0.5">INDIA</text>
                    <text x="41" y="54" textAnchor="middle" fontSize="4" fontFamily="Arial, sans-serif" fontWeight="700" fill="#8b1a1a" letterSpacing="0.3">NJINDIA.IN</text>
                  </svg>
                )}
              <div className="wd-sig-name">Authorized Stamp</div>
            </div>

          </div>{/* end wd-footer */}

        </div>{/* end #warrantyDoc */}

      </div>
    </div>
  );
}
