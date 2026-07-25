// Sharing helpers for the generated quotation/warranty pages.
// PDFs are produced client-side (html2canvas + jsPDF, both bundled). They are
// shared via the official Windows Share dialog: WebView2 does NOT expose the Web
// Share API (navigator.share is undefined inside the desktop window), so the
// bytes are POSTed to the backend, which writes real .pdf files and launches the
// native Windows Share flyout (ShareHelper.exe) with them attached. If the
// backend can't share (non-Windows dev), the files download instead.

import { API_BASE, SHARE_API_BASE } from './api';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';


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
// Preview, Download, Print and Share must all produce the SAME document. Both the
// quotation and the warranty are sized as A4 pages (794×1123px = exact A4 ratio at
// 96dpi), so a page-sized document fills one page edge-to-edge. This generator
// captures the element at natural size and:
//   • fills ONE A4 page when the content is a page (or within ~5% — scaled to fit,
//     so a tiny sliver never spills onto an unwanted second page), or
//   • flows across multiple FULL-SIZE A4 pages when the content genuinely overflows
//     (a long quotation), so nothing is ever shrunk to unreadable or clipped.
// The warranty certificate is a fixed-height A4 box (794×1123) whose terms are
// auto-scaled to fit (see WarrantyDocument.jsx), so its capture height ≈ one A4 and
// it always lands in the single-page branch below — never a second page.
// Fetch one URL and return a base64 data URL, or null on failure.
async function _toDataUrl(src) {
  try {
    const res = await fetch(src, { cache: 'no-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// Capture one element to a canvas at natural full size (scale/ frame neutralised).
async function _captureCanvas(el) {
  // Pre-convert all external <img> srcs to data URLs so html2canvas never hits
  // CORS-cache conflicts (browser caches images without CORS headers; when
  // html2canvas re-fetches with crossOrigin="anonymous" it gets the cached
  // response that lacks the header and the draw silently fails).
  const imgs = [...el.querySelectorAll('img[src]')].filter(
    img => img.src && !img.src.startsWith('data:') && !img.src.startsWith('blob:')
  );
  const origSrcs = imgs.map(img => img.src);
  await Promise.allSettled(imgs.map(async (img) => {
    const dataUrl = await _toDataUrl(img.src);
    if (dataUrl) img.src = dataUrl;
  }));

  const saved = neutralizeScale(el);
  const savedFrame = stripFrame(el); // remove the page border/shadow from the capture only
  void el.offsetHeight; // force a synchronous reflow so the capture sees full size
  try {
    // Sharper capture: up to 3× on hi-dpi displays, clamped so a tall multi-page
    // quotation can't exceed safe browser canvas limits (≈16k px / side).
    // Reduced max scale on mobile to prevent Out-Of-Memory crashes during blob stringification.
    const wpx = el.scrollWidth, hpx = el.scrollHeight;
    const maxScale = isCapacitor() ? 0.75 : (isMobileDevice() ? 1.15 : 2);
    const scale = Math.max(1, Math.min(maxScale, (window.devicePixelRatio || 1) * 2, 8192 / wpx, 12000 / hpx));
    const canvas = await window.html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: wpx,
      windowHeight: hpx,
    });
    if (!canvas.width || !canvas.height) throw new Error('Empty capture');
    return canvas;
  } finally {
    restoreFrame(savedFrame);
    restoreScale(saved);
    // Restore original srcs so the on-screen preview is unchanged.
    imgs.forEach((img, i) => { img.src = origSrcs[i]; });
  }
}

function _releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
}

// Place one captured canvas onto the pdf, starting on the CURRENT page: fills one
// A4 page when it's a page (or within ~5%), else flows across full-size pages.
function _placeCanvas(pdf, canvas) {
  const pw = pdf.internal.pageSize.getWidth();   // 210mm
  const ph = pdf.internal.pageSize.getHeight();  // 297mm
  const useJpeg = isMobileDevice();
  const imgData = useJpeg ? canvas.toDataURL('image/jpeg', 0.82) : canvas.toDataURL('image/png');
  const imgType = useJpeg ? 'JPEG' : 'PNG';
  const imgH = (canvas.height * pw) / canvas.width; // full-width height in mm

  if (imgH <= ph * 1.05) {
    const s = Math.min(1, ph / imgH);
    const w = pw * s, h = imgH * s;
    pdf.addImage(imgData, imgType, (pw - w) / 2, 0, w, h);
  } else {
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, imgType, 0, position, pw, imgH);
    heightLeft -= ph;
    while (heightLeft > 0) {
      position -= ph;
      pdf.addPage();
      pdf.addImage(imgData, imgType, 0, position, pw, imgH);
      heightLeft -= ph;
    }
  }
}

export async function elementToPdf(el) {
  const canvas = await _captureCanvas(el);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  try {
    _placeCanvas(pdf, canvas);
  } finally {
    _releaseCanvas(canvas);
  }
  return pdf;
}

// Multi-element variant: each element becomes its OWN A4 page (the quotation
// sheet + one installation-guidance page per class). Capturing each element
// separately gives perfectly clean page breaks (no tiling drift between pages).
export async function elementsToPdf(els) {
  const list = (els || []).filter(Boolean);
  if (list.length <= 1) return elementToPdf(list[0]);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  for (let i = 0; i < list.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await _captureCanvas(list[i]);
    try {
      _placeCanvas(pdf, canvas);
    } finally {
      _releaseCanvas(canvas);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return pdf;
}

// Capture a DOM element into a PDF File for sharing — wraps the one engine above
// so Share is byte-for-byte the same document as Download.
export async function elementToPdfFile(el, filename) {
  const pdf = await elementToPdf(el);
  return new File([pdf.output('blob')], filename, { type: 'application/pdf', lastModified: Date.now() });
}

export async function elementsToPdfFile(els, filename) {
  const pdf = await elementsToPdf(els);
  return new File([pdf.output('blob')], filename, { type: 'application/pdf', lastModified: Date.now() });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isLocalDesktopShell() {
  return typeof window !== 'undefined' && /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(window.location.origin);
}

// True when running inside a Capacitor Android/iOS WebView.
// True when running inside a Capacitor Android/iOS WebView.
function isCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
}

// True on any mobile browser or WebView (Android, iOS, Capacitor).
// showSaveFilePicker is unreliable on mobile — it either auto-cancels or
// is undefined, and <a download> is silently dropped in WebViews.
function isMobileDevice() {
  return isCapacitor() || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

// Attempt Web Share API with files. Returns true on success, false if unsupported,
// throws AbortError if user cancelled.
async function _webShare(files, title) {
  if (!navigator.share) return false;
  if (navigator.canShare && !navigator.canShare({ files })) return false;
  await navigator.share({ files, title: title || 'NJ India — Document' });
  return true;
}

async function _writeCapacitorShareFile(file) {
  const base64Data = await blobToBase64(file);
  const base64String = String(base64Data).split(',')[1];
  const saved = await Filesystem.writeFile({
    path: safe(file.name) || 'document.pdf',
    data: base64String,
    directory: Directory.Cache,
    recursive: true,
  });
  return saved.uri;
}

async function _writePdfToCapacitorShareFile(pdf, filename) {
  const blob = pdf.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  return _writeCapacitorShareFile(file);
}

async function _shareCapacitorUris(uris, title) {
  await Share.share({
    title: title || 'NJ India - Document',
    files: uris,
    dialogTitle: 'Share Documents',
  });
  return 'shared';
}

async function _savePdfThroughBackend(pdf, filename) {
  if (!isLocalDesktopShell()) return false;
  try {
    const form = new FormData();
    form.append('file', new File([pdf.output('blob')], filename, { type: 'application/pdf' }), filename);
    const res = await fetch(`${SHARE_API_BASE || API_BASE}/api/save-pdf`, { method: 'POST', body: form });
    return res.ok;
  } catch (e) {
    console.error('[NJ Share] backend save-pdf error:', e);
    return false;
  }
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
  // showSaveFilePicker is a desktop-only API — on mobile it either isn't defined
  // or opens a picker that the user can't interact with, returning AbortError and
  // showing a misleading "Save cancelled" toast. Skip it entirely on mobile.
  if (!isMobileDevice() && askWhereToSave() && typeof window.showSaveFilePicker === 'function') {
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

  // Capacitor requires writing to Filesystem before sharing/saving properly.
  if (isCapacitor()) {
    try {
      const uri = await _writePdfToCapacitorShareFile(pdf, filename);
      return await _shareCapacitorUris([uri], filename);
    } catch (e) {
      console.error('[NJ Share] Capacitor finishPdfSave error:', e);
      return 'downloaded';
    }
  }

  // On standard mobile browsers (not capacitor), fallback to webShare
  if (isMobileDevice()) {
    const file = new File([pdf.output('blob')], filename, { type: 'application/pdf' });
    try {
      const ok = await _webShare([file], filename);
      if (ok) return 'saved';
    } catch (e) {
      if (e.name === 'AbortError') return 'downloaded'; // user cancelled share
    }
  }
  if (await _savePdfThroughBackend(pdf, filename)) return 'saved';
  pdf.save(filename);
  return 'downloaded';
}

// Wrap an existing Blob (e.g. a backup .zip from the backend) as a File.
export function blobToFile(blob, filename, type) {
  return new File([blob], filename, { type: type || blob.type || 'application/octet-stream' });
}

export async function shareElementPdf(el, filename, { title } = {}) {
  if (isCapacitor()) {
    const pdf = await elementToPdf(el);
    const uri = await _writePdfToCapacitorShareFile(pdf, filename);
    return _shareCapacitorUris([uri], title || filename);
  }
  return shareFiles([await elementToPdfFile(el, filename)], { title });
}

export async function shareElementsPdf(els, filename, { title } = {}) {
  if (isCapacitor()) {
    const pdf = await elementsToPdf(els);
    const uri = await _writePdfToCapacitorShareFile(pdf, filename);
    return _shareCapacitorUris([uri], title || filename);
  }
  return shareFiles([await elementsToPdfFile(els, filename)], { title });
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

  if (isCapacitor()) {
    try {
      const uris = [];
      for (const f of files) {
        uris.push(await _writeCapacitorShareFile(f));
      }
      await Share.share({
        title: title || 'NJ India - Document',
        files: uris,
        dialogTitle: 'Share Documents'
      });
      console.groupEnd();
      return 'shared';
    } catch (e) {
      console.error('[NJ Share] Capacitor shareFiles error:', e);
    }
  }

  // Web Share API (mobile Chrome/Safari)
  // Try navigator.share on any device that supports it.
  try {
    const ok = await _webShare(files, title);
    if (ok) { console.groupEnd(); return 'shared'; }
  } catch (e) {
    if (e.name === 'AbortError') { console.groupEnd(); return 'cancelled'; }
  }

  // ── Native Windows Share via the backend ─────────────────────────────────
  // POST the PDF bytes to the backend, which writes real .pdf files to disk and
  // launches the genuine Windows Share flyout (ShareHelper.exe) with them
  // attached as StorageItems. This is the only path that actually delivers the
  // files to WhatsApp / Mail / Teams from inside WebView2.
  try {
    const form = new FormData();
    form.append('title', title || 'NJ India — Document');
    for (const f of files) form.append('files', f, f.name);

    let res;
    let retries = 2;
    while (true) {
      try {
        res = await fetch(`${SHARE_API_BASE || API_BASE}/api/share-pdfs`, { method: 'POST', body: form });
        break;
      } catch (err) {
        if (retries > 0) {
          retries--;
          await new Promise(r => setTimeout(r, 500));
        } else {
          throw err;
        }
      }
    }
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

