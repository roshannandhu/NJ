import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, RotateCcw, ShieldCheck, FileText, Download, Edit3, FileType2 } from 'lucide-react';
import { downloadWarrantyDocx } from '../api';

// ── Inline-Editable Cell ───────────────────────────────────────────────────
function EditableCell({ value, onSave, multiline = false, style = {}, renderValue, hideIcon }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');
  React.useEffect(() => { setDraft(value || ''); }, [value]);

  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };

  if (editing) {
    const s = {
      width: '100%', border: 'none', borderBottom: '1.5px solid #8b1a1a',
      background: 'rgba(139,26,26,0.04)', padding: '2px 4px',
      fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit',
      color: 'inherit', outline: 'none', boxSizing: 'border-box', ...style
    };
    return multiline
      ? <textarea autoFocus value={draft} rows={Math.max(3, draft.split('\n').length)}
          style={{ ...s, resize: 'vertical' }}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }} />
      : <input autoFocus type="text" value={draft} style={s}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }} />;
  }
  
  // Optional custom renderer for the display state
  const displayContent = renderValue ? renderValue(value) : (value || <span style={{ color: '#aaa', fontStyle: 'italic' }}>click to fill</span>);

  return (
    <span onClick={() => setEditing(true)} title="Click to edit" className="wd-editable" style={{ cursor: 'text', display: 'inline-block', width: '100%', ...style }}>
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
    setCart, setCustomer, setActiveWarranty, setActiveQuotation, showToast
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

  // Resolve template with fallback to data.warranties if legacy format
  let template = doc.template || {};
  if (!template.sections || template.sections.length === 0) {
    let matched = data.warranties?.find(w => w.id === template.id);
    if (!matched) {
      const clsName = (doc.items && doc.items.length > 0) ? doc.items[0].className : '';
      const n = (clsName || '').toLowerCase();
      let fallbackId = 'nj_laminated';
      if (n.includes('stone') || n.includes('metal')) fallbackId = 'stone_coated';
      else if (n.includes('heat') || n.includes('ceiling')) fallbackId = 'heatout';
      else if (n.includes('ceramic') || n.includes('clay')) fallbackId = 'ceramic';
      else if (n.includes('pie') || n.includes('bitumen') || n.includes('docke')) fallbackId = 'docke';
      matched = data.warranties?.find(w => w.id === fallbackId);
    }
    if (matched) {
      template = { ...matched, ...template, sections: matched.sections, opening: matched.opening };
    }
  }

  const customer  = doc.customer  || {};
  const certData  = doc.certData  || {};

  const updateCertField = (field, value) => {
    const updatedCertData = { ...certData, [field]: value };
    const updatedDoc = { ...doc, certData: updatedCertData };
    setActiveWarranty(updatedDoc);
    setData(prev => {
      const h = prev.warranty_certificates || [];
      const i = h.findIndex(w => w.warrantyNo === doc.warrantyNo);
      if (i !== -1) { const nh = [...h]; nh[i] = updatedDoc; return { ...prev, warranty_certificates: nh }; }
      return prev;
    });
  };

  const updateCustomerField = (field, value) => {
    const updatedDoc = { ...doc, customer: { ...customer, [field]: value } };
    setActiveWarranty(updatedDoc);
    setData(prev => {
      const h = prev.warranty_certificates || [];
      const i = h.findIndex(w => w.warrantyNo === doc.warrantyNo);
      if (i !== -1) { const nh = [...h]; nh[i] = updatedDoc; return { ...prev, warranty_certificates: nh }; }
      return prev;
    });
  };

  const updateTemplateField = (field, value) => {
    const updatedTemplate = { ...template, [field]: value };
    const updatedDoc = { ...doc, template: updatedTemplate };
    setActiveWarranty(updatedDoc);
    setData(prev => {
      const h = prev.warranty_certificates || [];
      const i = h.findIndex(w => w.warrantyNo === doc.warrantyNo);
      if (i !== -1) { const nh = [...h]; nh[i] = updatedDoc; return { ...prev, warranty_certificates: nh }; }
      return prev;
    });
  };

  const updateSection = (idx, field, value) => {
    const updatedSections = [...(template.sections || [])];
    updatedSections[idx] = { ...updatedSections[idx], [field]: value };
    const updatedTemplate = { ...template, sections: updatedSections };
    const updatedDoc = { ...doc, template: updatedTemplate };
    setActiveWarranty(updatedDoc);
    setData(prev => {
      const h = prev.warranty_certificates || [];
      const i = h.findIndex(w => w.warrantyNo === doc.warrantyNo);
      if (i !== -1) { const nh = [...h]; nh[i] = updatedDoc; return { ...prev, warranty_certificates: nh }; }
      return prev;
    });
  };

  const downloadPDF = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    if (showToast) showToast('Generating PDF…', 'info');
    const el = document.getElementById('warrantyDoc');
    if (!el) { if (showToast) showToast('Element not found.', 'error'); setIsDownloading(false); return; }
    try {
      const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = (canvas.height * pw) / canvas.width;
      if (ph > 297) {
        const pageH = (297 * canvas.width) / pw;
        let y = 0;
        while (y < canvas.height) {
          if (y > 0) pdf.addPage();
          const c2 = document.createElement('canvas');
          c2.width = canvas.width; c2.height = Math.min(pageH, canvas.height - y);
          c2.getContext('2d').drawImage(canvas, 0, y, c2.width, c2.height, 0, 0, c2.width, c2.height);
          pdf.addImage(c2.toDataURL('image/png'), 'PNG', 0, 0, pw, (c2.height * pw) / canvas.width);
          y += pageH;
        }
      } else {
        pdf.addImage(imgData, 'PNG', 0, 0, pw, ph);
      }
      pdf.save(`NJ_Warranty_${doc.warrantyNo || 'NJ-W-0001'}_${(customer.name || 'Customer').replace(/\s+/g, '_')}.pdf`);
      if (showToast) showToast('PDF downloaded!', 'success');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('PDF failed. Use Print (Ctrl+P).', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const startNew = () => {
    setCart([]); setCustomer({ name: '', phone: '', email: '', address: '' });
    setActiveWarranty(null); setActiveQuotation(null); setCurrentView('quotation_desk');
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
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&display=swap');

        /* ── Page wrapper ── */
        .wd-page-wrap { max-width: 880px; margin: 0 auto; padding: 24px 24px 0; }
        .wd-actions   { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .wd-hint      { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 10px 14px; background: rgba(139,26,26,0.05); border-radius: 8px; border: 1px solid rgba(139,26,26,0.15); font-size: 12px; color: #8b1a1a; font-weight: 600; }

        /* ════════════════════════════════════════════════════
           THE A4 WARRANTY CERTIFICATE
           ════════════════════════════════════════════════════ */
        .warranty-doc {
          background: #fff;
          width: 100%; max-width: 794px;
          min-height: 1123px;
          padding: 36px 52px 32px;
          margin: 0 auto;
          font-family: 'Times New Roman', Times, Georgia, serif;
          color: #111;
          font-size: 10.5pt;
          line-height: 1.6;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          border: 1px solid #ccc;
          box-shadow: 0 4px 32px rgba(0,0,0,0.10);
        }

        /* ── Watermark ── */
        .wd-wm {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%) rotate(-30deg);
          font-size: 72pt; font-weight: 900; pointer-events: none; user-select: none;
          color: rgba(0,0,0,0.028); white-space: nowrap; letter-spacing: 0.1em;
          font-family: 'Times New Roman', serif;
        }

        /* ── Header ── */
        .wd-header {
          text-align: center;
          padding-bottom: 10px;
          margin-bottom: 0;
          border-bottom: 2px solid #111;
        }
        .wd-logo {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 48pt;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #111;
          margin: 0;
          line-height: 1.1;
        }
        .wd-logo-sub {
          font-size: 8pt;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #444;
          font-weight: 700;
          margin: 3px 0 0;
          font-family: Arial, sans-serif;
        }

        /* ── Certificate Banner ── */
        .wd-banner {
          text-align: center;
          font-size: 11.5pt;
          letter-spacing: 0.28em;
          font-weight: 700;
          padding: 7px 0;
          border-top: 2px solid #111;
          border-bottom: 2px solid #111;
          margin: 10px 0 14px;
          text-transform: uppercase;
          color: #111;
          font-family: Arial, sans-serif;
        }

        /* ── Opening ── */
        .wd-opening {
          font-size: 10.5pt;
          line-height: 1.65;
          margin-bottom: 12px;
          text-align: justify;
        }
        .wd-opening em {
          font-style: italic;
          display: block;
          margin-bottom: 4px;
          font-size: 11pt;
        }

        /* ── Sections ── */
        .wd-section { margin-bottom: 10px; page-break-inside: avoid; }
        .wd-section-head {
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #111;
          margin: 0 0 5px;
          padding-bottom: 3px;
          border-bottom: 1.5px solid #aaa;
          font-family: Arial, sans-serif;
        }

        .wd-body { font-size: 10pt; line-height: 1.65; color: #222; }
        .wd-body p { margin: 0 0 5px; text-align: justify; }
        .wd-body ul { margin: 3px 0 0; padding-left: 14px; }
        .wd-body li { margin-bottom: 2px; font-size: 9.5pt; text-align: justify; line-height: 1.55; }

        /* ── Duration callout ── */
        .wd-duration {
          border: 1.5px solid #8b1a1a;
          border-left: 5px solid #8b1a1a;
          padding: 7px 14px;
          margin: 8px 0 12px;
          background: #fef9f9;
        }
        .wd-duration-label {
          font-size: 7.5pt;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #8b1a1a;
          font-weight: 700;
          display: block;
          margin-bottom: 2px;
          font-family: Arial, sans-serif;
        }
        .wd-duration-value {
          font-size: 12pt;
          font-weight: 700;
          color: #8b1a1a;
          font-family: 'Playfair Display', Georgia, serif;
        }

        /* ── Two-column ── */
        .wd-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 10px;
        }

        /* ── Series / Liability table ── */
        .wd-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 5px;
          font-size: 9.5pt;
        }
        .wd-table th {
          background: #111;
          color: #fff;
          padding: 5px 10px;
          text-align: left;
          font-size: 8pt;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-family: Arial, sans-serif;
          border: 1px solid #111;
        }
        .wd-table td {
          padding: 5px 10px;
          border: 1px solid #ddd;
          vertical-align: middle;
        }
        .wd-table tr:nth-child(odd) td { background: #fafafa; }
        .wd-table .td-dur { font-weight: 700; color: #8b1a1a; text-align: center; }
        .wd-table .td-pct { font-weight: 700; color: #8b1a1a; text-align: center; min-width: 80px; }
        .wd-table .td-empty td { color: #bbb; }

        /* ── Certificate details (fill-in style) ── */
        .wd-cert-block {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 2px solid #111;
        }
        .wd-cert-title {
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin: 0 0 8px;
          padding-bottom: 4px;
          border-bottom: 1.5px solid #aaa;
          font-family: Arial, sans-serif;
          color: #111;
        }
        .wd-cert-row {
          display: flex;
          align-items: baseline;
          padding: 4px 0;
          border-bottom: 1px dotted #ccc;
          font-size: 10pt;
          gap: 8px;
        }
        .wd-cert-lbl {
          min-width: 185px;
          color: #444;
          font-weight: 600;
          font-size: 9.5pt;
          flex-shrink: 0;
        }
        .wd-cert-lbl::after { content: ':'; }
        .wd-cert-val {
          font-weight: 700;
          color: #111;
          flex: 1;
          border-bottom: 1px solid #999;
          min-height: 18px;
          padding: 0 4px 1px;
        }
        .wd-cert-val-static {
          font-weight: 700;
          color: #111;
          flex: 1;
          padding: 0 4px 1px;
          border-bottom: 1px solid #ddd;
        }
        .wd-editable {
          display: inline-flex; align-items: center; gap: 2px;
          border-radius: 2px; padding: 0 2px; transition: background 0.15s;
          width: 100%;
        }
        .wd-editable:hover {
          background: rgba(139,26,26,0.05);
          outline: 1px dashed rgba(139,26,26,0.35);
        }
        .wd-batch-warn { color: #dc2626; font-size: 8pt; margin-left: 6px; font-weight: 700; }

        /* ── Footer ── */
        .wd-footer {
          margin-top: 28px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          align-items: flex-end;
        }
        .wd-sig-block { text-align: center; font-size: 9pt; color: #555; }
        .wd-sig-line {
          height: 50px;
          border-bottom: 1px solid #111;
          width: 160px;
          margin: 0 auto 4px;
        }
        .wd-sig-name { color: #111; font-weight: 700; font-size: 9.5pt; padding-top: 3px; font-family: Arial, sans-serif; letter-spacing: 0.05em; text-transform: uppercase; }

        /* Circular seal SVG */
        .wd-seal-svg { display: block; margin: 0 auto 4px; }

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
          font-family: Arial, sans-serif;
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
          .wd-section { page-break-inside: avoid; }
          .wd-two-col { page-break-inside: avoid; }
        }
      `}} />

      <div className="wd-page-wrap">

        {/* ── ACTION BAR ── */}
        <div className="wd-actions">
          <button onClick={() => setCurrentView('quotation_document')} className="hover-lift"
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
            <ArrowLeft size={15}/> Back
          </button>
          <button onClick={() => setCurrentView('checkout')} className="hover-lift"
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
            <FileText size={15}/> Edit Checkout
          </button>
          <div style={{ marginLeft:'auto', display:'flex', gap:'10px' }}>
            <button onClick={downloadPDF} disabled={isDownloading} className="hover-lift"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--accent)', color:'white', border:'none', borderRadius:'var(--radius-full)', fontWeight:600, cursor:isDownloading?'not-allowed':'pointer', fontSize:'13px', opacity:isDownloading?0.7:1 }}>
              <Download size={15}/> {isDownloading ? 'Generating…' : 'Download PDF'}
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
        <div className="warranty-doc" id="warrantyDoc">

          <div className="wd-wm">WARRANTY</div>

          <div className="wd-header">
            {template.logo && template.logo.startsWith('data:image/') ? (
              <>
                <img src={template.logo} alt="Logo" style={{ maxHeight: '120px', maxWidth: '440px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
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
          </div>

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
          </div>

          {/* ════════════════════════════════════════════════════════
              FOOTER — Signature + Authorized Stamp
              ════════════════════════════════════════════════════════ */}
          <div className="wd-footer">

            {/* Seller Signature */}
            <div className="wd-sig-block">
              {template.signImage
                ? <img src={template.signImage} alt="Signature"
                    style={{ maxHeight: '50px', maxWidth: '180px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
                : <div className="wd-sig-line" />}
              <div className="wd-sig-name">Seller's Signature</div>
            </div>

            {/* Authorized Stamp */}
            <div className="wd-sig-block">
              {template.sealImage
                ? <img src={template.sealImage} alt="Stamp"
                    style={{ width: '80px', height: '80px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
                : (
                  <svg className="wd-seal-svg" width="82" height="82" viewBox="0 0 82 82">
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

          </div>

        </div>
        {/* end #warrantyDoc */}

      </div>
    </div>
  );
}
