// Sharing helpers for the generated quotation/warranty pages.
// PDFs are produced client-side (html2canvas + jsPDF, both bundled). They are
// shared via the official Windows Share dialog: WebView2 does NOT expose the Web
// Share API (navigator.share is undefined inside the desktop window), so the
// bytes are POSTed to the backend, which writes real .pdf files and launches the
// native Windows Share flyout (ShareHelper.exe) with them attached. If the
// backend can't share (non-Windows dev), the files download instead.

import { API_BASE } from './api';

const safe = (s) => String(s || '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

export function quotationFileName(doc, customerName) {
  return `NJ_Quotation_${safe(doc?.id || 'NJ-Q')}_${safe(customerName || 'Customer')}.pdf`;
}
export function warrantyFileName(doc, customerName) {
  return `NJ_Warranty_${safe(doc?.warrantyNo || doc?.id || 'NJ-W-0001')}_${safe(customerName || 'Customer')}.pdf`;
}

// Neutralise the on-screen fit-scale before a capture. The quotation sheet is
// scaled via an inline transform on the element itself; the warranty certificate
// is scaled via an inline transform on a CHILD (so it can fit the preview pane).
// Both must render at natural full size for the export, or the shared/downloaded
// PDF bakes in the preview shrink and looks compressed. We reset every inline
// transform within the captured subtree (only inline ones — CSS-class transforms
// on icons etc. are left alone) and revert any inline width the fit logic forced,
// then restore everything afterwards so the on-screen view is untouched.
function neutralizeScale(el) {
  const saved = [];
  const apply = (node) => {
    const t = node.style && node.style.transform;
    if (t && t !== 'none') {
      saved.push({ node, transform: t, origin: node.style.transformOrigin, width: node.style.width });
      node.style.transform = 'none';
      node.style.transformOrigin = 'top left';
      node.style.width = '';
    }
  };
  apply(el);
  el.querySelectorAll('[style*="transform"]').forEach(apply);
  return saved;
}
function restoreScale(saved) {
  for (const s of saved) {
    s.node.style.transform = s.transform;
    s.node.style.transformOrigin = s.origin;
    s.node.style.width = s.width;
  }
}

// Strip the on-screen frame (border / shadow / rounded corners) from the captured
// ROOT element for the duration of the export only. The quotation sheet and the
// warranty certificate both draw a thin border + drop shadow so they look like a
// page on screen; html2canvas does NOT honour our @media print rules, so without
// this the frame would bake into the downloaded/shared PDF. Inline styles outrank
// the .warranty-doc class rule, so nulling them here removes both the quotation's
// inline border and the warranty's class border. Restored in elementToPdf's
// finally, leaving the on-screen preview untouched.
function stripFrame(el) {
  const s = { el, border: el.style.border, boxShadow: el.style.boxShadow, borderRadius: el.style.borderRadius };
  el.style.border = 'none';
  el.style.boxShadow = 'none';
  el.style.borderRadius = '0';
  return s;
}
function restoreFrame(s) {
  s.el.style.border = s.border;
  s.el.style.boxShadow = s.boxShadow;
  s.el.style.borderRadius = s.borderRadius;
}

// ── ONE PDF engine for everything ───────────────────────────────────────────
// Preview, Download, Print and Share must all produce the SAME document. The NJ
// quotation and warranty are designed as single A4 pages (the quotation uses
// density tiers, the warranty an auto-fit layout). This generator captures the
// element at natural size and lays it out on EXACTLY ONE A4 page: full width when
// it fits, or scaled down to fit (aspect preserved, centred) if it would slightly
// overflow — so it never spills a sliver onto an unwanted second page.
export async function elementToPdf(el) {
  const saved = neutralizeScale(el);
  const savedFrame = stripFrame(el); // remove the page border/shadow from the capture only
  void el.offsetHeight; // force a synchronous reflow so the capture sees full size
  try {
    const canvas = await window.html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });
    if (!canvas.width || !canvas.height) throw new Error('Empty capture');

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();   // 210mm
    const ph = pdf.internal.pageSize.getHeight();  // 297mm

    // Fit to a single page: full width if it fits, else scale down to the page
    // height keeping aspect ratio, and centre horizontally.
    const fullH = (canvas.height * pw) / canvas.width;
    const s = fullH > ph ? ph / fullH : 1;
    const imgW = pw * s;
    const imgH = fullH * s;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - imgW) / 2, 0, imgW, imgH);
    return pdf;
  } finally {
    restoreFrame(savedFrame);
    restoreScale(saved);
  }
}

// Capture a DOM element into a PDF File for sharing — wraps the one engine above
// so Share is byte-for-byte the same document as Download.
export async function elementToPdfFile(el, filename) {
  const pdf = await elementToPdf(el);
  return new File([pdf.output('blob')], filename, { type: 'application/pdf', lastModified: Date.now() });
}

// "Always ask where to save" defaults ON — only an explicit '0' turns it off.
export function askWhereToSave() {
  try { return localStorage.getItem('nj_ask_save_location') !== '0'; } catch { return true; }
}

// STEP 1 — call this the instant the user clicks "Download", BEFORE the (slow)
// PDF rendering. Browsers only allow the folder picker while the click's "user
// activation" is still fresh, so opening it first guarantees the Windows
// "save in which folder" dialog actually appears (instead of silently falling
// back to Downloads after a 1–2s render).
// Returns: { mode:'pick', handle } | { mode:'download' } | { mode:'cancelled' }
export async function beginPdfSave(filename) {
  if (askWhereToSave() && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
      });
      return { mode: 'pick', handle };
    } catch (e) {
      if (e && e.name === 'AbortError') return { mode: 'cancelled' }; // closed the dialog
      return { mode: 'download' }; // picker unavailable → normal download
    }
  }
  return { mode: 'download' };
}

// STEP 2 — call this once the jsPDF document is built. Writes to the chosen
// location, or downloads to Downloads if no folder was picked / write fails.
// Returns 'saved' | 'downloaded'.
export async function finishPdfSave(pdf, filename, dest) {
  if (dest && dest.mode === 'pick' && dest.handle) {
    try {
      const writable = await dest.handle.createWritable();
      await writable.write(pdf.output('blob'));
      await writable.close();
      return 'saved';
    } catch {
      pdf.save(filename); // write failed → fall back so the file isn't lost
      return 'downloaded';
    }
  }
  pdf.save(filename);
  return 'downloaded';
}

// Wrap an existing Blob (e.g. a backup .zip from the backend) as a File.
export function blobToFile(blob, filename, type) {
  return new File([blob], filename, { type: type || blob.type || 'application/octet-stream' });
}

export async function shareFiles(files, { title } = {}) {
  files = (files || []).filter(Boolean);
  if (files.length === 0) {
    console.warn('[NJ Share] shareFiles called with no files');
    return 'empty';
  }

  // ── Logging ──────────────────────────────────────────────────────────────
  console.group('[NJ Share] Starting share operation');
  console.log('  title:', title);
  console.log('  files count:', files.length);
  files.forEach((f, i) => {
    console.log(`  file[${i}]: name="${f.name}" size=${f.size} type="${f.type}"`);
  });

  // ── Native Windows Share via the backend ─────────────────────────────────
  // POST the PDF bytes to the backend, which writes real .pdf files to disk and
  // launches the genuine Windows Share flyout (ShareHelper.exe) with them
  // attached as StorageItems. This is the only path that actually delivers the
  // files to WhatsApp / Mail / Teams from inside WebView2.
  try {
    const form = new FormData();
    form.append('title', title || 'NJ India — Document');
    for (const f of files) form.append('files', f, f.name);

    const res = await fetch(`${API_BASE}/api/share-pdfs`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      console.log('[NJ Share] backend response:', data);
      console.groupEnd();
      if (data.launched) return 'shared';
      // Backend saved the files but couldn't open the native dialog (e.g. dev on
      // a non-Windows host) — fall through to a download so the file isn't lost.
    } else {
      console.error('[NJ Share] backend share-pdfs failed:', res.status);
    }
  } catch (e) {
    console.error('[NJ Share] backend share request error:', e);
  }

  // ── Fallback — download each file so the user still gets it ───────────────
  console.log('[NJ Share] Falling back to <a> download');
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = f.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  console.groupEnd();
  return 'downloaded';
}

