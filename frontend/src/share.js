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

// Capture a DOM element into a PDF File. Warranty docs are auto-fitted to one A4
// page (multiPage=false); the quotation sheet can be tall (multiPage=true).
export async function elementToPdfFile(el, filename, { multiPage = false } = {}) {
  const prevTransform = el.style.transform;
  const prevTransformOrigin = el.style.transformOrigin;
  el.style.transform = 'none';
  el.style.transformOrigin = 'unset';

  const canvas = await window.html2canvas(el, { 
    scale: 2, 
    useCORS: true, 
    backgroundColor: '#ffffff', 
    logging: false,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight
  });

  el.style.transform = prevTransform;
  el.style.transformOrigin = prevTransformOrigin;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  if (multiPage) {
    const fullH = (canvas.height * pw) / canvas.width;
    if (fullH > ph) {
      const pageH = (ph * canvas.width) / pw;
      let y = 0;
      while (y < canvas.height) {
        if (y > 0) pdf.addPage();
        const c2 = document.createElement('canvas');
        c2.width = canvas.width;
        c2.height = Math.min(pageH, canvas.height - y);
        c2.getContext('2d').drawImage(canvas, 0, y, c2.width, c2.height, 0, 0, c2.width, c2.height);
        pdf.addImage(c2.toDataURL('image/png'), 'PNG', 0, 0, pw, (c2.height * pw) / canvas.width);
        y += pageH;
      }
    } else {
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pw, fullH);
    }
  } else {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pw, ph);
  }
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

