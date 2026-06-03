import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, RotateCcw, ShieldCheck, FileText, Download, Edit3, FileType2, Share2 } from 'lucide-react';
import { downloadWarrantyDocx, mediaUrl, createQuotation, createWarranty } from '../api';
import { elementToPdf, elementToPdfFile, shareFiles, quotationFileName, warrantyFileName, beginPdfSave, finishPdfSave } from '../share';
import { buildWarrantyCertsForQuotation } from '../warranty';
import BrandWatermark from './BrandWatermark';

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

export default function QuotationDocument() {
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
    showToast
  } = useAppContext();

  if (!generatedDoc) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginBottom: '16px' }}>No active quotation</h2>
        <button className="btn-primary" onClick={() => setCurrentView('quotation_desk')}>Return to Desk</button>
      </div>
    );
  }

  const settings = data.settings || {};
  const company  = data.company  || {};
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);

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
    return { ...d, subtotal, actualSubtotal, productSavings, hasOffers, taxRate, taxAmount, discountAmount, grandTotal };
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

  // Field-level editing helpers
  const updateField     = (field, value) => commitDoc({ [field]: value });
  const updateCustomer  = (field, value) => commitDoc({ customer: { ...(generatedDoc.customer || {}), [field]: value } });
  const updateItemField = (cartId, field, value) => commitDoc({ items: generatedDoc.items.map(it => it.cartId === cartId ? { ...it, [field]: value } : it) });
  const removeItemRow   = (cartId) => commitDoc({ items: generatedDoc.items.filter(it => it.cartId !== cartId) });
  const addItemRow      = () => commitDoc({ items: [...generatedDoc.items, { cartId: 'custom_' + Date.now(), id: 'custom', name: 'Custom Service / Item', className: 'Custom', price: 0, actualPrice: 0, qty: 1, unit: 'nos', color: '' }] });
  const updateClassDesc = (key, value) => commitDoc({ classDescriptions: { ...(generatedDoc.classDescriptions || {}), [key]: value } });
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
      const pdf = await elementToPdf(element);
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
  React.useEffect(() => {
    if (!quotationSheetRef.current) return;
    const el = quotationSheetRef.current;
    // Reset scale first to get natural height
    el.style.transform = 'none';
    el.style.transformOrigin = 'top left';
    el.style.marginBottom = '0';
    const naturalH = el.scrollHeight;
    const A4_PX = 1123; // A4 at 96dpi
    if (naturalH > A4_PX) {
      const s = A4_PX / naturalH;
      el.style.transform = `scale(${s})`;
      el.style.transformOrigin = 'top left';
      // Compensate for the collapsed height after scale
      el.style.marginBottom = `${(naturalH * s - naturalH)}px`;
    }
  }, [generatedDoc]);


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
        file = await elementToPdfFile(document.getElementById('quotationSheet'), quotationFileName(generatedDoc, custName));
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
      files.push(await elementToPdfFile(document.getElementById('quotationSheet'), quotationFileName(generatedDoc, custName)));
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

  const updateCertField = (field, value) => {
    if (!activeCert) return;

    const certData = activeCert.certData || {};
    const updatedCertData = {
      ...certData,
      [field]: value
    };

    // If changing the certified product, auto-fill related details
    if (field === 'selectedCartId') {
      const selectedProduct = activeCert.items?.find(item => (item.cartId ?? item.kartId) === value);
      if (selectedProduct) {
        updatedCertData.productName = selectedProduct.name;
        updatedCertData.productColor = selectedProduct.color || 'N/A';
        updatedCertData.productQty = selectedProduct.qty || 1;
        updatedCertData.productUnit = selectedProduct.unit || 'sqft';
      }
    }

    const updatedDoc = {
      ...activeCert,
      certData: updatedCertData
    };

    // Persist changes to registry
    setData(prev => {
      const history = prev.warranty_certificates || [];
      const index = history.findIndex(w => w.warrantyNo === activeCert.warrantyNo);
      if (index !== -1) {
        const newHistory = [...history];
        newHistory[index] = updatedDoc;
        return {
          ...prev,
          warranty_certificates: newHistory
        };
      }
      return prev;
    });
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
  const availableWarrantyTemplates = React.useMemo(() => {
    if (!generatedDoc) return [];
    const seen = new Set();
    const list = [];
    generatedDoc.items.forEach(item => {
      const cls = data.classes?.find(c => c.name === item.className);
      if (cls?.warrantyId && !seen.has(cls.warrantyId)) {
        const tmpl = data.warranties?.find(w => w.id === cls.warrantyId);
        if (tmpl) { seen.add(cls.warrantyId); list.push({ ...tmpl, forClass: cls.name }); }
      }
    });
    return list;
  }, [generatedDoc, data.classes, data.warranties]);

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

  // Resolve the DOMINANT brand across a set of line items for the watermark: the
  // brand with the most items wins, ties broken by first appearance. Returns
  // { id, name, logo(URL) } or null when no item carries a brand. Mirrors
  // getBrandForClass's snapshot rule (per-item brandName wins; logo from the live
  // brand record resolved through mediaUrl).
  const getDominantBrand = (items) => {
    const list = items || [];
    const counts = new Map();
    list.forEach((it, idx) => {
      const cls = data.classes?.find(c => c.name === it.className);
      const brandId = it.brandId || cls?.brandId;
      if (!brandId) return;
      const nm = it.brandName || (data.brands || []).find(b => b.id === brandId)?.name || '';
      const cur = counts.get(brandId);
      if (cur) cur.count++; else counts.set(brandId, { count: 1, firstIdx: idx, name: nm });
    });
    if (!counts.size) return null;
    let best = null;
    for (const [id, v] of counts) {
      if (!best || v.count > best.count || (v.count === best.count && v.firstIdx < best.firstIdx)) best = { id, ...v };
    }
    const brand = (data.brands || []).find(b => b.id === best.id);
    const logo = brand?.logo ? mediaUrl(brand.logo) : '';
    const name = best.name || brand?.name || '';
    return (name || logo) ? { id: best.id, name, logo } : null;
  };

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
  const PLUM = '#8a1856';
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

        /* Phone (screen only — never affects print/PDF capture): let the toolbar
           and hint fit the viewport. The A4 page keeps its true 794px size and
           scrolls inside its container, so the app shell isn't broken. */
        @media screen and (max-width: 820px) {
          .actions-bar { flex-wrap: wrap; max-width: 100% !important; }
          .q-edit-hint { max-width: 100% !important; }
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

        .warranty-doc .wd-wm, #quotationSheet .wd-wm {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%) rotate(-30deg);
          font-size: 72pt; font-weight: 900; pointer-events: none; user-select: none;
          color: rgba(0,0,0,0.028); white-space: nowrap; letter-spacing: 0.1em;
          font-family: 'Times New Roman', serif;
        }
        /* Brand-logo watermark: single, centred, faint, grayscale — never tiled. */
        .wd-wm-logo {
          max-width: 55%; max-height: 50%; width: auto; height: auto;
          object-fit: contain; opacity: 0.06; filter: grayscale(100%);
          display: block; margin: 0 auto;
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
                border: 'none',
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
                <button onClick={() => downloadWarrantyDocx(activeCert.warrantyNo || activeCert.id, activeCert, `NJ_Warranty_${activeCert.warrantyNo || 'NJ-W-0001'}_${(activeCert.customer?.name || 'Customer').replace(/\s+/g,'_')}.docx`).catch(e => showToast && showToast('Word download failed: ' + e.message, 'error'))} className="hover-lift"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#2d6a4f', color: 'white', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                  <FileType2 size={18} /> Download Word
                </button>
              )}
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
            /* ── VIEW A: PRINTABLE QUOTATION SHEET (inline editable) ── */
            (() => {
              const itemCount = doc.items.length;
              // Density tiers: normal ≤4, medium 5-8, compact 9-13, ultra 14+
              const tier = itemCount <= 4 ? 'normal' : itemCount <= 8 ? 'medium' : itemCount <= 13 ? 'compact' : 'ultra';
              const D = {
                normal:  { pad: '40px 50px', headerH: '90px', headerFont: '42px', h1: '22px', hdrInfo: '11px', rowPad: '13px 8px', rowFont: '13px', subFont: '11px', tblMb: '24px', tcMt: '28px', footMt: '36px', specH: '110px', specPad: '18px 24px', tcLineH: '1.65', tcFs: '12px', termsFs: '12px', termsLH: '1.65', termsMb: '5px', divMb: '12px', custMb: '20px' },
                medium:  { pad: '28px 40px', headerH: '72px', headerFont: '34px', h1: '19px', hdrInfo: '10px', rowPad: '9px 7px',  rowFont: '12px', subFont: '10px', tblMb: '18px', tcMt: '20px', footMt: '22px', specH: '80px',  specPad: '12px 18px', tcLineH: '1.5',  tcFs: '11px', termsFs: '11px', termsLH: '1.55', termsMb: '4px', divMb: '10px', custMb: '14px' },
                compact: { pad: '18px 30px', headerH: '60px', headerFont: '28px', h1: '16px', hdrInfo: '9.5px', rowPad: '7px 6px',  rowFont: '11px', subFont: '9px',  tblMb: '14px', tcMt: '16px', footMt: '16px', specH: '64px',  specPad: '8px 14px',  tcLineH: '1.4',  tcFs: '10px', termsFs: '10px', termsLH: '1.5',  termsMb: '3px', divMb: '8px',  custMb: '10px' },
                ultra:   { pad: '12px 24px', headerH: '50px', headerFont: '24px', h1: '14px', hdrInfo: '9px',   rowPad: '5px 5px',  rowFont: '10px', subFont: '8.5px',tblMb: '10px', tcMt: '12px', footMt: '12px', specH: '52px',  specPad: '6px 10px',  tcLineH: '1.3',  tcFs: '9px',  termsFs: '9.5px',termsLH: '1.4',  termsMb: '2px', divMb: '6px',  custMb: '8px'  },
              }[tier];
              return (
            <div
              className="printable-sheet"
              id="quotationSheet"
              ref={quotationSheetRef}
              style={{
                width: '100%', maxWidth: '860px', background: '#FFFFFF',
                padding: D.pad, boxShadow: '0 20px 40px rgba(0,0,0,0.07)',
                color: '#1A1A1A', fontFamily: '"Inter", system-ui, sans-serif',
                border: '1px solid #E5E7EB', position: 'relative',
              }}>

              {/* ── Brand watermark (faint, behind content; nothing if no brand) ── */}
              <BrandWatermark brand={getDominantBrand(doc.items)} fallbackText="" />

              {/* ── HEADER ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: D.divMb }}>
                <div style={{
                  width: D.headerH, height: D.headerH, border: '1px solid #E5E7EB', borderRadius: '14px',
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
                        fontSize: D.headerFont, fontWeight: '900', lineHeight: '1',
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
                  <h1 style={{ fontSize: D.h1, fontWeight: '900', margin: '0 0 4px 0', letterSpacing: '-0.01em', color: '#1A1A1A', textTransform: 'uppercase' }}>
                    {company.name || 'NJ India Trading Pvt. Ltd.'}
                  </h1>
                  <div style={{ fontSize: D.hdrInfo, lineHeight: D.tcLineH, color: '#555' }}>
                    {(company.address || 'KNH Building, Neelithod Bridge, Parakkal\nRamanattukara PO, Kozhikode — 673633')
                      .split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}
                    Ph: {company.phone || '+91 73566 08633'} &nbsp;|&nbsp; {company.website || 'www.njindia.in'}
                  </div>
                </div>
              </div>

              {/* Thick divider */}
              <div style={{ borderBottom: '2.5px solid #1A1A1A', marginBottom: D.divMb }} />

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
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: D.custMb }}>
                <div style={{ width: '100px', borderBottom: '3px solid #1A1A1A' }} />
              </div>

              {/* TABLE 1 — PRODUCT DETAILS WITH IMAGE */}
              {settings.showClassSpecBox !== false && tileClasses.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb, pageBreakInside: 'avoid' }}>
                  <thead>
                    <tr>
                      <th colSpan="2" style={{
                        ...TB, background: PLUM, color: '#FFFFFF',
                        padding: tier === 'normal' ? '10px 16px' : '7px 12px', fontWeight: '800', fontSize: D.subFont,
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
                      // Real image: prefer an item in this quotation that carries
                      // an image, then the class's own category image (logo).
                      const itemImg = doc.items.find(it => it.className === className && it.image)?.image;
                      const rawImg = itemImg || itemClass?.logo || '';
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
                                      style={{ height: tier === 'normal' ? '20px' : '16px', width: 'auto', maxWidth: '70px', objectFit: 'contain', display: 'block' }} />
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
                            <div style={{ width: '100%', height: D.specH, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                              {imgSrc ? (
                                <img src={imgSrc} alt={className} crossOrigin="anonymous"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                              ) : svgPlaceholder}
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
                const thumb = tier === 'normal' ? 46 : tier === 'medium' ? 38 : tier === 'compact' ? 30 : 24;
                // Build columns dynamically; the OFFER PRICE column only appears
                // when at least one line carries an offer (keeps it uncluttered).
                const cols = [
                  { key: 'si',     label: 'SI NO',        align: 'center', w: tier === 'ultra' ? '32px' : '44px' },
                  { key: 'img',    label: 'IMAGE',        align: 'center', w: `${thumb + 16}px` },
                  { key: 'prod',   label: 'PRODUCT',      align: 'left',   w: 'auto' },
                  { key: 'qty',    label: 'QTY',          align: 'center', w: tier === 'ultra' ? '64px' : '84px' },
                  { key: 'actual', label: 'ACTUAL PRICE', align: 'right',  w: tier === 'ultra' ? '78px' : '98px' },
                  ...(docAnyOffer ? [{ key: 'offer', label: 'OFFER PRICE', align: 'right', w: tier === 'ultra' ? '78px' : '98px' }] : []),
                  { key: 'total',  label: 'TOTAL',        align: 'right',  w: tier === 'ultra' ? '86px' : '106px' },
                ];
                return (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb }}>
                <thead>
                  <tr>
                    {cols.map(col => (
                      <th key={col.key} style={{
                        ...TB, background: PLUM, color: '#FFFFFF',
                        padding: tier === 'normal' ? '11px 10px' : tier === 'medium' ? '8px 8px' : '6px 6px',
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
                      <td style={{ ...TB, padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ width: thumb, height: thumb, margin: '0 auto', borderRadius: '5px', overflow: 'hidden', border: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {imgSrc ? (
                            <img src={imgSrc} alt={item.name} crossOrigin="anonymous"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: brandColor, opacity: 0.85, color: '#FFFFFF', fontWeight: '800', fontSize: `${Math.round(thumb / 2.6)}px` }}>
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
              <div className="q-edit-only" data-html2canvas-ignore="true" style={{ marginTop: `-${D.tblMb}`, marginBottom: D.tblMb }}>
                <button onClick={addItemRow}
                  style={{ padding: '6px 12px', border: '1.5px dashed #c9b3c0', borderRadius: '6px', background: 'transparent', color: PLUM, fontWeight: 700, fontSize: D.subFont, cursor: 'pointer' }}>
                  + Add line item
                </button>
              </div>

              {/* ── PAYMENT (left) + TOTALS (right) ROW — industry-standard invoice layout ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: tier === 'ultra' ? '14px' : '28px', marginBottom: D.tblMb }}>

                {/* Payment block (left). New structured bank → legacy text → picker. */}
                <div style={{ flex: '1 1 auto', minWidth: 0, alignSelf: 'stretch' }}>
                  {(() => {
                    const bankPicker = (settings.banks || []).length > 0 && (
                      <select className="q-edit-only" data-html2canvas-ignore="true" value={doc.bankId || ''}
                        onChange={e => { const b = (settings.banks || []).find(x => x.id === e.target.value) || null; commitDoc({ bank: b ? { ...b } : null, bankId: e.target.value || '' }); }}
                        style={{ marginTop: '6px', fontSize: '11px', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: '4px', background: '#fff', color: '#444', cursor: 'pointer' }}>
                        <option value="">No bank selected</option>
                        {switchableBanks.map(b => <option key={b.id} value={b.id}>{b.bankName || 'Bank'}{b.accountNumber ? ` · ${b.accountNumber}` : ''}</option>)}
                      </select>
                    );
                    if (docBank) return (
                      <div style={{ border: `1.5px solid #1A1A1A`, borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ background: PLUM, color: '#FFFFFF', padding: tier === 'normal' ? '8px 14px' : '5px 10px', fontWeight: '800', fontSize: D.subFont, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Payment Details
                        </div>
                        <div style={{ display: 'flex', gap: tier === 'ultra' ? '8px' : '14px', padding: tier === 'normal' ? '12px 14px' : '8px 10px', alignItems: 'flex-start' }}>
                          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                            {(docBank.logo || docBank.bankName) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                {docBank.logo && (
                                  <img src={docBank.logo} alt="" crossOrigin="anonymous"
                                    style={{ height: tier === 'normal' ? '26px' : tier === 'medium' ? '22px' : '18px', width: 'auto', maxWidth: '96px', objectFit: 'contain', display: 'block' }} />
                                )}
                                <div style={{ fontSize: D.rowFont, fontWeight: '800', color: '#1A1A1A' }}>
                                  <EditableCell value={docBank.bankName} onSave={v => updateBankField('bankName', v)} placeholder="bank name" />
                                </div>
                              </div>
                            )}
                            {[
                              ['accountName', 'Account Name', docBank.accountName],
                              ['accountNumber', 'A/C No', docBank.accountNumber],
                              ['ifsc', 'IFSC/SWIFT', docBank.ifsc],
                              ['branch', 'Branch', docBank.branch],
                              ['upiId', 'UPI', docBank.upiId],
                            ].filter(([, , v]) => v).map(([fkey, label, value]) => (
                              <div key={fkey} style={{ display: 'flex', fontSize: D.tcFs, lineHeight: D.tcLineH }}>
                                <span style={{ color: '#777', minWidth: tier === 'ultra' ? '64px' : '86px', fontWeight: '600', flexShrink: 0 }}>{label}</span>
                                <span style={{ color: '#1A1A1A', fontWeight: '700', fontFamily: 'var(--font-mono)', wordBreak: 'break-word', flex: 1 }}>
                                  <EditableCell value={value} onSave={v => updateBankField(fkey, v)} />
                                </span>
                              </div>
                            ))}
                            {bankPicker}
                          </div>
                          {docBank.qr && (
                            <img src={docBank.qr} alt="Payment QR" crossOrigin="anonymous"
                              style={{ width: tier === 'normal' ? '90px' : tier === 'medium' ? '74px' : '58px', height: 'auto', objectFit: 'contain', border: '1px solid #E5E7EB', borderRadius: '4px', flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                    );
                    return (
                      <>
                        {settings.bankDetails && (
                          <div style={{ padding: tier === 'normal' ? '14px 18px' : '8px 12px', background: '#F9F9F9', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: D.tcFs, color: '#444', lineHeight: D.tcLineH, fontFamily: 'var(--font-mono)' }}>
                            <div style={{ fontWeight: '700', fontSize: D.subFont, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#1A1A1A', marginBottom: '4px' }}>Bank / Payment Details</div>
                            {settings.bankDetails.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                          </div>
                        )}
                        {bankPicker && <div className="q-edit-only" data-html2canvas-ignore="true" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Attach a bank account: {bankPicker}</div>}
                      </>
                    );
                  })()}
                </div>

                {/* Totals block (right) */}
                <div style={{ minWidth: tier === 'ultra' ? '200px' : '260px', flexShrink: 0, border: `1.5px solid #1A1A1A`, borderRadius: '4px', overflow: 'hidden' }}>

                  {/* Actual Total + You Save — only when product offers exist */}
                  {docAnyOffer && docSavings > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                        <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>Actual Total</span>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#999', fontFamily: 'var(--font-mono)', marginLeft: '24px', textDecoration: 'line-through' }}>{curr}{docActualSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                        <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#16a34a' }}>You Save</span>
                        <span style={{ fontSize: D.tcFs, fontWeight: '800', color: '#16a34a', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>-{curr}{docSavings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}

                  {/* Subtotal (labelled "Offer Total" when offers are present) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                    <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>{docAnyOffer && docSavings > 0 ? 'Offer Total' : 'Subtotal'}</span>
                    <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#1A1A1A', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{doc.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {/* Discount */}
                  {doc.discountEnabled && doc.discountAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                      <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#16a34a' }}>Discount {doc.discountType === 'percent' ? `(${doc.discountValue}%)` : '(Fixed)'}</span>
                      <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#16a34a', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>-{curr}{doc.discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {/* GST */}
                  {(doc.taxEnabled ?? settings.taxEnabled) && doc.taxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                      <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>GST ({doc.taxRate}%)</span>
                      <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#1A1A1A', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{doc.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {/* Grand Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '12px 14px' : '8px 10px', background: PLUM }}>
                    <span style={{ fontSize: D.rowFont, fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>TOTAL</span>
                    <span style={{ fontSize: tier === 'normal' ? '16px' : D.rowFont, fontWeight: '900', color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{doc.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

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

              {/* Terms and Conditions — 2-col for medium+ */}
              <div style={{ marginTop: D.tcMt }}>
                <h4 style={{
                  color: '#E53E3E', fontSize: D.subFont, fontWeight: '900',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  marginBottom: tier === 'normal' ? '10px' : '6px', borderBottom: '2px solid #1A1A1A', paddingBottom: '4px',
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
                    tier === 'normal' ? (
                      <ol style={{ margin: 0, paddingLeft: '16px', fontSize: D.termsFs, lineHeight: D.termsLH, color: '#1A1A1A' }}>
                        {quotationTerms.map((term, i) => (
                          <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                        ))}
                      </ol>
                    ) : (
                      (() => {
                        const terms = quotationTerms;
                        const mid = Math.ceil(terms.length / 2);
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                            <ol style={{ margin: 0, paddingLeft: '14px', fontSize: D.termsFs, lineHeight: D.termsLH, color: '#1A1A1A' }}>
                              {terms.slice(0, mid).map((term, i) => (
                                <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                              ))}
                            </ol>
                            <ol start={mid + 1} style={{ margin: 0, paddingLeft: '14px', fontSize: D.termsFs, lineHeight: D.termsLH, color: '#1A1A1A' }}>
                              {terms.slice(mid).map((term, i) => (
                                <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                              ))}
                            </ol>
                          </div>
                        );
                      })()
                    )
                  )}
                />
              </div>

              {/* Footer */}
              <div style={{
                borderTop: '2px solid #1A1A1A', marginTop: D.footMt, paddingTop: tier === 'normal' ? '14px' : '8px',
                fontSize: D.subFont, color: '#777', display: 'flex', justifyContent: 'space-between', fontWeight: 500,
              }}>
                <div>Valid for <EditableCell value={doc.validityDays ?? settings.validityDays ?? 30} numeric onSave={v => updateField('validityDays', v)} style={{ width: '40px', textAlign: 'center' }} /> days from date of issue.</div>
                <div>{settings.footerNote || 'NJ Quotation System'}</div>
              </div>

            </div>
            );
            })()
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
            const tmpl = _matched ? { ..._matched, ..._stored } : { ..._stored };
            if (_matched) {
              if (!tmpl.sections || tmpl.sections.length === 0) { tmpl.sections = _matched.sections; tmpl.opening = tmpl.opening || _matched.opening; }
              tmpl.showSeriesTable = _matched.showSeriesTable;
              tmpl.seriesTable = (_matched.seriesTable && _matched.seriesTable.length) ? _matched.seriesTable : (tmpl.seriesTable || []);
              if (_matched.heatoutTable !== undefined) tmpl.heatoutTable = _matched.heatoutTable;
              if (!tmpl.id) tmpl.id = _matched.id;
            }
            const cd = activeCert.certData || {};
            const isStoneCoated = tmpl.id === 'stone_coated';
            const isHeatout     = tmpl.id === 'heatout';
            const isDocke       = tmpl.id === 'docke';
            const isCeramic     = tmpl.id === 'ceramic';
            let secNum = 0;
            const next = () => ++secNum;
            const bullets = (txt) => (txt || '').split('\n').filter(t => t.trim()).map(t => t.replace(/^[•\-\*]\s*/, '').trim());

            const certRef = activeCert.warrantyNo || activeCert.id || 'NJ-W-0001';
            const sections = tmpl.sections || [];
            const half = sections.length === 3 ? 1 : Math.ceil(sections.length / 2);
            const leftSections = sections.slice(0, half);
            const rightSections = sections.slice(half);

            return (
            <div className={`warranty-doc${(isHeatout || isStoneCoated) ? ' is-dense' : ''}`} id="warrantyDoc">

              <BrandWatermark brand={getDominantBrand(activeCert?.items || doc.items)} fallbackText="WARRANTY" />

              <div className="wd-header">
                {tmpl.logo && tmpl.logo.startsWith('data:image/') ? (
                  <>
                    <img src={tmpl.logo} alt="Logo" style={{ height: '130px', width: 'auto', maxWidth: '600px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
                    <p className="wd-logo-sub">{tmpl.title || 'Warranty Certificate'}</p>
                  </>
                ) : isDocke ? (
                  <>
                    <p className="wd-logo" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic' }}>Döcke</p>
                    <p className="wd-logo-sub">PIE — Bitumen Shingles</p>
                  </>
                ) : (
                  <>
                    <p className="wd-logo">{tmpl.logo || 'NJ'}</p>
                    <p className="wd-logo-sub">{tmpl.title || 'Warranty Certificate'}</p>
                  </>
                )}
              </div>

              <div style={{ flex: 1, position: 'relative', width: '100%', marginTop: '6px', marginBottom: '16px', minHeight: 0 }}>
                <div ref={warrantyInnerRef} style={{ width: '100%', transformOrigin: 'top left' }}>

              <div className="wd-banner">Warranty Certificate</div>

              {/* ══ OPENING & CLAUSES ══ */}
              <div className="wd-two-col" style={{ marginBottom: '14px' }}>
                {/* Left Column: Dear Customer + Left Sections */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="wd-opening" style={{ marginBottom: '12px' }}>
                    <em>Dear Customer,</em>
                    Congratulations on your purchase. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards. We strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.
                  </div>
                  {leftSections.map((sec, idx) => (
                    <div key={idx} className="wd-section" style={{ marginBottom: idx === leftSections.length - 1 ? 0 : '10px' }}>
                      <div className="wd-section-head">{sec.title}</div>
                      <div className="wd-body">
                        {sec.isBullets ? (
                          <ul style={{ margin: 0, paddingLeft: '14px' }}>
                            {bullets(sec.content).map((t, i) => <li key={i}>{t}</li>)}
                          </ul>
                        ) : (
                          <div style={{ margin: 0 }}>
                            {(sec.content || '').split('\n').filter(Boolean).map((line, i) => (
                              <p key={i} style={{ margin: '0 0 5px' }}>{line}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right Column: Right Sections */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {rightSections.map((sec, idx) => (
                    <div key={half + idx} className="wd-section" style={{ marginBottom: idx === rightSections.length - 1 ? 0 : '10px' }}>
                      <div className="wd-section-head">{sec.title}</div>
                      <div className="wd-body">
                        {sec.isBullets ? (
                          <ul style={{ margin: 0, paddingLeft: '14px' }}>
                            {bullets(sec.content).map((t, i) => <li key={i}>{t}</li>)}
                          </ul>
                        ) : (
                          <div style={{ margin: 0 }}>
                            {(sec.content || '').split('\n').filter(Boolean).map((line, i) => (
                              <p key={i} style={{ margin: '0 0 5px' }}>{line}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* § Liability Table (Heatout) — if applicable */}
              {tmpl.heatoutTable && (
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
                        <tr><td>0-10 years</td><td className="pct">100%</td></tr>
                        <tr><td>10-12 years</td><td className="pct">50%</td></tr>
                        <tr><td>12-18 years</td><td className="pct">40%</td></tr>
                        <tr><td>18-20 years</td><td className="pct">30%</td></tr>
                        <tr><td>20-21 years</td><td className="pct">20%</td></tr>
                        <tr><td>21-25 years</td><td className="pct">10%</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* § Series Table — if applicable */}
              {tmpl.showSeriesTable && (
                <div className="wd-section">
                  <div className="wd-section-head">Warranty Period by Series</div>
                  <div className="wd-body">
                    <table className="wd-table">
                      <thead><tr><th>Series / Model</th><th style={{textAlign:'center'}}>Warranty Period</th></tr></thead>
                      <tbody>
                        {(tmpl.seriesTable && tmpl.seriesTable.length > 0)
                          ? tmpl.seriesTable.map((s,i) => <tr key={i}><td>{s.series}</td><td className="dur">{s.duration}</td></tr>)
                          : [1,2].map(i => <tr key={i}><td>&nbsp;</td><td>&nbsp;</td></tr>)
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Certificate Details — fill-in underline style */}
              <div className="wd-cert-block">
                <div className="wd-cert-title">Certificate Details</div>

                {/* Address Row (all templates) */}
                <div className="wd-cert-row">
                  <span className="wd-cert-lbl">Address</span>
                  <span className="wd-cert-val">{cd.siteAddress || [activeCert.customer?.name, activeCert.customer?.address].filter(Boolean).join(', ') || '—'}</span>
                </div>

                {/* Product Row (all templates) */}
                <div className="wd-cert-row">
                  <span className="wd-cert-lbl">
                    {isHeatout || isStoneCoated || isCeramic 
                      ? "The name of the sold products (complete, including color)" 
                      : "Product Name & Color"}
                  </span>
                  <span className="wd-cert-val">{cd.productName || [cd.productName, (cd.productColor && cd.productColor !== 'N/A') ? cd.productColor : null].filter(Boolean).join(' — ') || '—'}</span>
                </div>

                {/* Batch Number Row (Docke and Ceramic) */}
                {isDocke && (
                  <div className="wd-cert-row">
                    <span className="wd-cert-lbl">Batch Number</span>
                    <span className="wd-cert-val">{cd.batchNo || '—'}</span>
                  </div>
                )}

                {isCeramic && (
                  <div className="wd-cert-row">
                    <span className="wd-cert-lbl">Batch Number (see on the packaging)</span>
                    <span className="wd-cert-val">{cd.batchNo || '—'}</span>
                  </div>
                )}

                {/* Date Row (all templates EXCEPT Ceramic) */}
                {!isCeramic && (
                  <div className="wd-cert-row">
                    <span className="wd-cert-lbl">Date</span>
                    <span className="wd-cert-val">{cd.purchaseDate || activeCert.date}</span>
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
                  <span className="wd-cert-val">{cd.sellerName || '—'}</span>
                </div>

                {/* Date Row for Ceramic only (renders at bottom) */}
                {isCeramic && (
                  <div className="wd-cert-row">
                    <span className="wd-cert-lbl">Date</span>
                    <span className="wd-cert-val">{cd.purchaseDate || activeCert.date}</span>
                  </div>
                )}
              </div>

                </div>
              </div>

              {/* ══ FOOTER ══ */}
              <div className="wd-footer">
                <div className="wd-sig-block">
                  {tmpl.signImage
                    ? <img src={tmpl.signImage} alt="Signature" style={{ height: '80px', width: 'auto', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
                    : <div className="wd-sig-line" />}
                  <div className="wd-sig-name">Seller's Signature</div>
                </div>
                <div className="wd-sig-block">
                  {tmpl.sealImage
                    ? <img src={tmpl.sealImage} alt="Stamp" style={{ width: '140px', height: '140px', objectFit: 'contain', margin: '0 auto 4px', display: 'block' }} />
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
                        {/* Center NJ INDIA text */}
                        <text x="41" y="37" textAnchor="middle" fontSize="9" fontFamily="'Times New Roman', serif" fontWeight="900" fill="#8b1a1a">
                          NJ
                        </text>
                        <text x="41" y="46" textAnchor="middle" fontSize="4.5" fontFamily="Arial, sans-serif" fontWeight="700" fill="#8b1a1a" letterSpacing="0.5">
                          INDIA
                        </text>
                        <text x="41" y="54" textAnchor="middle" fontSize="4" fontFamily="Arial, sans-serif" fontWeight="700" fill="#8b1a1a" letterSpacing="0.3">
                          NJINDIA.IN
                        </text>
                      </svg>
                    )}
                  <div className="wd-sig-name">Authorized Stamp</div>
                </div>
              </div>

            </div>
            ); })()}


        </div>

      </div>

    </div>
  );
}
