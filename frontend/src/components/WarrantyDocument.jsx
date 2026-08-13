import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, RotateCcw, ShieldCheck, FileText, Download, Edit3, Share2, Maximize2, Minimize2 } from 'lucide-react';
import { createWarranty } from '../api';
import { DEFAULT_DATA } from '../data';
import { elementToPdf, elementToPdfFile, shareElementPdf, shareFiles, warrantyFileName, beginPdfSave, finishPdfSave } from '../share';
import WarrantyCertificate from './WarrantyCertificate';
import { isLegacyBrandClass } from '../brands';

// ═══════════════════════════════════════════════════════════════════════════
// Standalone warranty view. The certificate body itself is the shared
// <WarrantyCertificate> component (same one the quotation document uses), so the
// single-page layout rules stay identical everywhere.
// ═══════════════════════════════════════════════════════════════════════════
export default function WarrantyDocument() {
  const {
    activeWarranty: doc, data, setData, setCurrentView, persistConfig,
    setCart, setCustomer, setActiveWarranty, setActiveQuotation, setActiveQuotationId, setActiveTab, setGenerateIntent, showToast
  } = useAppContext();

  const [isDownloading, setIsDownloading] = React.useState(false);
  const [phoneEditMode, setPhoneEditMode] = React.useState(false);

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

  // ── Resolve template (content prefers saved cert; structural fields from type).
  const storedTpl = (doc.template && typeof doc.template === 'object') ? doc.template : {};
  const tplId = (typeof doc.template === 'string') ? doc.template : storedTpl.id;
  let matched = data.warranties?.find(w => w.id === tplId);
  if (!matched) {
    // The class's OWN linked template first. The keyword guess below can only
    // land on NJ's templates, so it would issue an NJ certificate to a
    // Highlander customer — it is limited to NJ's own classes.
    const cn = ((doc.items && doc.items[0]?.className) || '');
    const cls = data.classes?.find(c => c.name === cn);
    matched = data.warranties?.find(w => w.id === cls?.warrantyId);
    if (!matched && isLegacyBrandClass(cn, doc.items, data)) {
      const n = cn.toLowerCase();
      let fallbackId = 'nj_laminated';
      if (n.includes('stone') || n.includes('metal')) fallbackId = 'stone_coated';
      else if (n.includes('heat') || n.includes('ceiling')) fallbackId = 'heatout';
      else if (n.includes('ceramic') || n.includes('clay')) fallbackId = 'ceramic';
      else if (n.includes('pie') || n.includes('bitumen') || n.includes('docke')) fallbackId = 'docke';
      matched = data.warranties?.find(w => w.id === fallbackId);
    }
  }
  // Certificates always MIRROR the live template — logo, seal, signature,
  // opening, terms/sections, tables and duration all come from the current
  // warranty template, so editing a template instantly updates every certificate
  // of that type. Per-customer data lives in doc.customer / doc.certData (never in
  // the template), so it is untouched. Only when the template was deleted do we
  // fall back to the snapshot frozen on the certificate.
  const defaultTpl = DEFAULT_DATA.warranties.find(w => w.id === (matched?.id || tplId)) || {};
  let template = matched
    ? { heatoutTable: false, ...defaultTpl, ...matched, seriesTable: matched.seriesTable?.length ? matched.seriesTable : defaultTpl.seriesTable || [], liabilityTable: matched.liabilityTable?.length ? matched.liabilityTable : defaultTpl.liabilityTable || [] }
    : { heatoutTable: false, ...storedTpl };
  if (!template.id) template.id = tplId || storedTpl.id;

  const customer = doc.customer || {};
  const certData = doc.certData || {};
  const parentQuote = data.quotations?.find(q => q.id === doc.quotationId) || null;
  const isStandalone = !parentQuote || parentQuote.warrantyOnly;

  // ── Persist every edit immediately (local + backend) ────────────────────────
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
    createWarranty(updatedDoc).catch(() => {});
  };
  // Terms are owned by the template (certificates mirror it), so editing the
  // opening/sections on a certificate updates the underlying warranty template —
  // and therefore every certificate of this type — and is persisted to config.
  // Customer / certificate fields stay per-certificate.
  const updateTemplate = (patch) => {
    const tid = template.id;
    if (!tid) { showToast && showToast('This certificate has no template to edit', 'error'); return; }
    const nextWarranties = (data.warranties || []).map(w => w.id === tid ? { ...w, ...patch } : w);
    const nextData = { ...data, warranties: nextWarranties };
    setData(nextData);
    persistConfig(nextData);
  };
  const edit = {
    onUpdateOpening: (v) => updateTemplate({ opening: v }),
    onUpdateSection: (idx, field, value) => {
      const s = [...(template.sections || [])];
      s[idx] = { ...s[idx], [field]: value };
      updateTemplate({ sections: s });
    },
    onAddSection: () => updateTemplate({ sections: [...(template.sections || []), { title: 'New Section', content: '', isBullets: false }] }),
    onRemoveSection: (idx) => updateTemplate({ sections: (template.sections || []).filter((_, i) => i !== idx) }),
    onUpdateCustomerField: (field, value) => persistWarranty({ ...doc, customer: { ...customer, [field]: value } }),
    onUpdateCertField: (field, value) => persistWarranty({ ...doc, certData: { ...certData, [field]: value } }),
  };

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
      const pdf = await elementToPdf(el);
      const r = await finishPdfSave(pdf, wName, dest);
      if (showToast) showToast(r === 'shared' ? 'Choose where to save or share the warranty PDF.' : r === 'saved' ? 'PDF saved!' : 'PDF downloaded!', 'success');
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

  return (
    <div className="warranty-document-page animate-fade-up" style={{ paddingBottom: '100px', background: 'var(--bg)', minHeight: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .wd-page-wrap { max-width: 880px; margin: 0 auto; padding: 24px 24px 0; }
        .wd-actions   { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
        .wd-hint      { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 10px 14px; background: rgba(139,26,26,0.05); border-radius: 8px; border: 1px solid rgba(139,26,26,0.15); font-size: 12px; color: #8b1a1a; font-weight: 600; }
        .wd-phone-edit-btn { display: none; }
        @media (max-width: 760px) {
          .wd-phone-edit-btn {
            display: flex; align-items: center; justify-content: center; gap: 8px;
            width: 100%; padding: 11px 16px; margin-bottom: 14px;
            background: rgba(139,26,26,0.07); color: #8b1a1a;
            border: 1.5px solid rgba(139,26,26,0.25); border-radius: 999px;
            font-weight: 700; font-size: 13px; cursor: pointer;
          }
          .wd-phone-edit-btn.is-active { background: #8b1a1a; color: white; border-color: #8b1a1a; }
          .wd-preview-frame.is-phone-edit { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .wd-preview-frame.is-phone-edit .wc-preview-shell { min-width: 794px; width: 794px; }
        }
        @media print {
          body, html { background: #fff !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .wd-actions, .wd-hint, .wd-mobile-context, .wd-preview-title, .wd-phone-edit-btn { display: none !important; }
          .wd-page-wrap { padding: 0 !important; max-width: 100% !important; }
          .main-content-scroll-container { padding: 0 !important; overflow: visible !important; }
        }
      `}} />

      <div className="wd-page-wrap">
        <div className="wd-mobile-context">
          <span><ShieldCheck size={19} /></span>
          <div>
            <small>Warranty certificate</small>
            <strong>{doc.warrantyNo || doc.id || 'Warranty'}</strong>
            <p>{customer.name || 'Customer document'}</p>
          </div>
          <b>1 page</b>
        </div>
        {/* ── ACTION BAR ── */}
        <div className="wd-actions document-actions is-warranty-editor">
          <button
            onClick={() => {
              if (isStandalone) { setCurrentView('warranties'); return; }
              setActiveQuotation(parentQuote);
              setActiveTab?.(doc.warrantyNo || doc.id);
              setCurrentView('quotation_document');
            }}
            className="hover-lift wd-action is-secondary"
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
            <ArrowLeft size={15}/> {isStandalone ? 'Back to Warranties' : 'Back'}
          </button>
          {!isStandalone && (
            <button onClick={() => { setGenerateIntent?.('quote'); setCurrentView('checkout'); }} className="hover-lift wd-action is-secondary"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
              <Edit3 size={15}/> Edit Quotation
            </button>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:'10px' }}>
            <button onClick={downloadPDF} disabled={isDownloading} className="hover-lift wd-action is-download"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--accent)', color:'white', border:'none', borderRadius:'var(--radius-full)', fontWeight:600, cursor:isDownloading?'not-allowed':'pointer', fontSize:'13px', opacity:isDownloading?0.7:1 }}>
              <Download size={15}/> {isDownloading ? 'Generating…' : 'Download PDF'}
            </button>
            <button onClick={shareWarranty} disabled={isDownloading} className="hover-lift wd-action is-share"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'#1d4ed8', color:'white', border:'none', borderRadius:'var(--radius-full)', fontWeight:600, cursor:isDownloading?'not-allowed':'pointer', fontSize:'13px', opacity:isDownloading?0.7:1 }}>
              <Share2 size={15}/> Share
            </button>
            <button onClick={startNew} className="hover-lift wd-action is-new"
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 18px', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:'var(--radius-full)', fontWeight:600, cursor:'pointer', fontSize:'13px' }}>
              <RotateCcw size={15}/> New Order
            </button>
          </div>
        </div>

        <div className="wd-hint">
          <span className="wd-hint-icon"><Edit3 size={14} /></span>
          <div><strong>Tap any field to edit</strong><span> — the certificate expands on phone. Use <strong>Edit Quotation</strong> above to change products or prices.</span></div>
        </div>
        <button
          className={`wd-phone-edit-btn${phoneEditMode ? ' is-active' : ''}`}
          onClick={() => setPhoneEditMode(m => !m)}
        >
          {phoneEditMode ? <><Minimize2 size={14}/> Collapse Preview</> : <><Maximize2 size={14}/> Expand to Edit Fields</>}
        </button>

        <div className={`wd-preview-frame${phoneEditMode ? ' is-phone-edit' : ''}`}>
          <div className="wd-preview-title"><ShieldCheck size={14} /><strong>A4 certificate preview</strong><span>Tap highlighted fields to edit</span></div>
          <WarrantyCertificate
            template={template}
            openingText={template.opening || 'Congratulations on your purchase. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards. We strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.'}
            variant="customer"
            customer={customer}
            certData={certData}
            fallbackDate={doc.date}
            invoiceFallback={doc.quotationId || parentQuote?.id || ''}
            warrantyNo={doc.warrantyNo || doc.id}
            orderNo={doc.quotationId || parentQuote?.id || ''}
            edit={edit}
          />
        </div>
      </div>
    </div>
  );
}
