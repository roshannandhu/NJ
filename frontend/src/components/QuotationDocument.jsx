import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, RotateCcw, ShieldCheck, FileText, Download, Edit3, MapPin, FileType2, Share2 } from 'lucide-react';
import { downloadWarrantyDocx } from '../api';
import { elementToPdfFile, shareFiles, quotationFileName, warrantyFileName } from '../share';

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

  const startNew = () => {
    setCart([]);
    setCustomer({ name: '', phone: '', email: '', address: '' });
    setActiveQuotation(null);
    setActiveWarranty(null);
    if (setActiveTab) setActiveTab('quotation');
    setCurrentView('quotation_desk');
  };

  const downloadQuotationPDF = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    showToast("Generating PDF...", "info");

    const element = document.getElementById("quotationSheet");
    if (!element) {
      showToast("Quotation sheet element not found.", "error");
      setIsDownloading(false);
      return;
    }

    try {
      // Temporarily remove CSS scale so html2canvas captures the full natural size
      const prevTransform = element.style.transform;
      const prevTransformOrigin = element.style.transformOrigin;
      element.style.transform = 'none';
      element.style.transformOrigin = 'unset';

      const canvas = await window.html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      // Restore CSS scale after capture
      element.style.transform = prevTransform;
      element.style.transformOrigin = prevTransformOrigin;

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();   // 210mm
      const pageH = pdf.internal.pageSize.getHeight();  // 297mm

      // Always scale to fit exactly one A4 page (never paginate)
      let imgW = pageW;
      let imgH = (canvas.height * pageW) / canvas.width;

      if (imgH > pageH) {
        // Scale down to fit within A4 height, keeping aspect ratio
        imgH = pageH;
        imgW = (canvas.width * pageH) / canvas.height;
      }

      // Center horizontally if imgW < pageW
      const xOffset = (pageW - imgW) / 2;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOffset, 0, imgW, imgH);

      pdf.save(`NJ_Quotation_${generatedDoc.id || 'Draft'}_${generatedDoc.customer.name.replace(/\s+/g, '_')}.pdf`);
      showToast("Quotation PDF downloaded — single page!", "success");
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

  // ── Share ───────────────────────────────────────────────────────────────
  const custName = generatedDoc.customer?.name || 'Customer';
  const _wait = (ms) => new Promise(r => setTimeout(r, ms));
  const shareItemStyle = { display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-soft)', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', cursor: 'pointer' };

  const shareCurrent = async () => {
    setShareOpen(false); setIsSharing(true);
    try {
      let file;
      if (activeTabId === 'quotation') {
        file = await elementToPdfFile(document.getElementById('quotationSheet'), quotationFileName(generatedDoc, custName), { multiPage: true });
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
      files.push(await elementToPdfFile(document.getElementById('quotationSheet'), quotationFileName(generatedDoc, custName), { multiPage: true }));
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
    setIsDownloading(true);
    showToast("Generating PDF...", "info");

    const element = document.getElementById("warrantyDoc");
    if (!element) {
      showToast("Warranty sheet element not found.", "error");
      setIsDownloading(false);
      return;
    }

    try {
      const canvas = await window.html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();    // 210mm
      const phMax = pdf.internal.pageSize.getHeight(); // 297mm
      // The certificate is auto-fitted to exactly one A4 page → one full page.
      pdf.addImage(imgData, 'PNG', 0, 0, pw, phMax);

      pdf.save(`NJ_Warranty_${activeCert.warrantyNo || activeCert.id || 'NJ-W-0001'}_${activeCert.customer?.name.replace(/\s+/g, '_')}.pdf`);
      showToast("Warranty PDF downloaded successfully!", "success");
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
    new Set(generatedDoc.items.map(i => i.className))
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

  // Table 1: Product spec cell (reads from settings.classSpecs if available)
  const getClassSpecRow = (className) => {
    const key = resolveClassKey(className);
    const saved = settings.classSpecs?.[key];
    
    if (saved && saved.specs) {
      return (
        <>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#1A1A1A', marginBottom: '4px', textTransform: 'uppercase' }}>
            {saved.title || className}
          </div>
          <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
            {saved.specs}
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

        .warranty-doc .wd-wm {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%) rotate(-30deg);
          font-size: 72pt; font-weight: 900; pointer-events: none; user-select: none;
          color: rgba(0,0,0,0.028); white-space: nowrap; letter-spacing: 0.1em;
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
          .actions-bar, .sidebar, .topbar, .document-tab-bar, .cert-customizer-sidebar { 
            display: none !important; 
          }
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
            <div className="actions-bar" style={{ display: 'flex', gap: '16px', marginBottom: '24px', width: '100%', maxWidth: '860px' }}>
              <button onClick={() => setCurrentView('checkout')} className="hover-lift"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                <ArrowLeft size={18} /> Edit Quotation
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
              <button onClick={startNew} className="hover-lift"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--radius-full)', fontWeight: 600, cursor: 'pointer' }}>
                <RotateCcw size={18} /> Start New
              </button>
            </div>
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
            /* ── VIEW A: PRINTABLE QUOTATION SHEET ── */
            (() => {
              const itemCount = generatedDoc.items.length;
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
                border: '1px solid #E5E7EB',
              }}>

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
                  <strong style={{ fontSize: D.rowFont }}>{generatedDoc.customer.name}</strong>
                  {generatedDoc.customer.phone   && <div style={{ color: '#555', marginTop: '1px' }}>Ph: {generatedDoc.customer.phone}</div>}
                  {generatedDoc.customer.address && <div style={{ color: '#555', marginTop: '1px', maxWidth: '360px' }}>{generatedDoc.customer.address}</div>}
                </div>
                <div style={{ textAlign: 'right', fontSize: D.tcFs, fontWeight: '700' }}>
                  Date: {generatedDoc.date}
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
                      const svgPlaceholder = (
                        <svg viewBox="0 0 100 60" style={{ width: '100%', height: '100%', background: '#f5f5f5', display: 'block' }}>
                          <rect width="100" height="60" fill={brandColor} opacity="0.1" />
                          <text x="50" y="32" fontSize="6" fontWeight="bold" fill={brandColor} textAnchor="middle" opacity="0.4">{className.toUpperCase()}</text>
                        </svg>
                      );
                      return (
                        <tr key={idx}>
                          <td style={{ ...TB, padding: D.specPad, width: '65%', verticalAlign: 'top' }}>
                            {getClassSpecRow(className)}
                          </td>
                          <td style={{ ...TB, padding: '6px', width: '35%', verticalAlign: 'middle', background: '#FAFAFA', textAlign: 'center' }}>
                            <div style={{ width: '100%', height: D.specH, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                              {svgPlaceholder}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* TABLE 2 — ITEMISED ESTIMATE */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: D.tblMb }}>
                <thead>
                  <tr>
                    {[
                      { label: 'SI NO',    align: 'center', w: tier === 'ultra' ? '36px' : '50px'  },
                      { label: 'PRODUCT',  align: 'left',   w: 'auto'  },
                      { label: 'QTY',      align: 'center', w: tier === 'ultra' ? '70px' : '90px' },
                      { label: 'PRICE',    align: 'right',  w: tier === 'ultra' ? '80px' : '100px' },
                      { label: 'TOTAL',    align: 'right',  w: tier === 'ultra' ? '90px' : '110px' },
                    ].map(col => (
                      <th key={col.label} style={{
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
                  {generatedDoc.items.map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'center', fontWeight: '600', fontSize: D.rowFont, color: '#333' }}>
                        {i + 1}
                      </td>
                      <td style={{ ...TB, padding: D.rowPad }}>
                        <div style={{ fontSize: D.rowFont, fontWeight: '700', color: '#1A1A1A' }}>{item.name}</div>
                        <div style={{ fontSize: D.subFont, color: '#777', fontWeight: '500', marginTop: '1px' }}>
                          {item.className}{item.color && item.color !== 'N/A' && item.color !== 'Standard' ? ` · ${item.color}` : ''}
                        </div>
                      </td>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'center', fontWeight: '700', fontSize: D.rowFont, color: '#1A1A1A' }}>
                        {item.qty}&nbsp;<span style={{ fontSize: D.subFont, fontWeight: '500', color: '#666' }}>{item.unit}</span>
                      </td>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: '500', fontSize: D.rowFont, color: '#333', fontFamily: 'var(--font-mono)' }}>
                        {curr}{item.price.toLocaleString('en-IN')}
                      </td>
                      <td style={{ ...TB, padding: D.rowPad, textAlign: 'right', fontWeight: '800', fontSize: D.rowFont, color: '#1A1A1A', fontFamily: 'var(--font-mono)' }}>
                        {curr}{(item.price * item.qty).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── TOTALS BLOCK — right-aligned, outside the items table ── */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: D.tblMb }}>
                <div style={{ minWidth: tier === 'ultra' ? '200px' : '260px', border: `1.5px solid #1A1A1A`, borderRadius: '4px', overflow: 'hidden' }}>

                  {/* Subtotal */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                    <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>Subtotal</span>
                    <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#1A1A1A', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{generatedDoc.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {/* Discount */}
                  {generatedDoc.discountEnabled && generatedDoc.discountAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                      <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#16a34a' }}>Discount {generatedDoc.discountType === 'percent' ? `(${generatedDoc.discountValue}%)` : '(Fixed)'}</span>
                      <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#16a34a', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>-{curr}{generatedDoc.discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {/* GST */}
                  {(generatedDoc.taxEnabled ?? settings.taxEnabled) && generatedDoc.taxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '9px 14px' : '6px 10px', background: '#F9F9F9', borderBottom: '1px solid #E5E7EB' }}>
                      <span style={{ fontSize: D.tcFs, fontWeight: '600', color: '#555' }}>GST ({generatedDoc.taxRate}%)</span>
                      <span style={{ fontSize: D.tcFs, fontWeight: '700', color: '#1A1A1A', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{generatedDoc.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {/* Grand Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: tier === 'normal' ? '12px 14px' : '8px 10px', background: PLUM }}>
                    <span style={{ fontSize: D.rowFont, fontWeight: '900', color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>TOTAL</span>
                    <span style={{ fontSize: tier === 'normal' ? '16px' : D.rowFont, fontWeight: '900', color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginLeft: '24px' }}>{curr}{generatedDoc.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                </div>
              </div>

              {/* Bank details (optional) */}
              {settings.bankDetails && (
                <div style={{ marginTop: D.tcMt, padding: tier === 'normal' ? '14px 18px' : '8px 12px', background: '#F9F9F9', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: D.tcFs, color: '#444', lineHeight: D.tcLineH, fontFamily: 'var(--font-mono)' }}>
                  <div style={{ fontWeight: '700', fontSize: D.subFont, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#1A1A1A', marginBottom: '4px' }}>Bank / Payment Details</div>
                  {settings.bankDetails.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}

              {/* Terms and Conditions — 2-col for medium+ */}
              <div style={{ marginTop: D.tcMt }}>
                <h4 style={{
                  color: '#E53E3E', fontSize: D.subFont, fontWeight: '900',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  marginBottom: tier === 'normal' ? '10px' : '6px', borderBottom: '2px solid #1A1A1A', paddingBottom: '4px',
                }}>
                  Terms and Conditions :
                </h4>
                {tier === 'normal' ? (
                  <ol style={{ margin: 0, paddingLeft: '16px', fontSize: D.termsFs, lineHeight: D.termsLH, color: '#1A1A1A' }}>
                    {getTermsAndConditions(generatedDoc.items).map((term, i) => (
                      <li key={i} style={{ marginBottom: D.termsMb }}>{term}</li>
                    ))}
                  </ol>
                ) : (
                  // Two-column layout for medium/compact/ultra
                  (() => {
                    const terms = getTermsAndConditions(generatedDoc.items);
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
                )}
              </div>

              {/* Footer */}
              <div style={{
                borderTop: '2px solid #1A1A1A', marginTop: D.footMt, paddingTop: tier === 'normal' ? '14px' : '8px',
                fontSize: D.subFont, color: '#777', display: 'flex', justifyContent: 'space-between', fontWeight: 500,
              }}>
                <div>Valid for {settings.validityDays || 30} days from date of issue.</div>
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

              <div className="wd-wm">WARRANTY</div>

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
