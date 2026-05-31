// Sharing helpers for the generated quotation/warranty pages.
// PDFs are produced client-side (html2canvas + jsPDF, both bundled). Files are
// offered to the OS share sheet via the Web Share API; if the browser can't
// share files, they download instead.

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
  const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
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
  return new File([pdf.output('blob')], filename, { type: 'application/pdf' });
}

// Wrap an existing Blob (e.g. a backup .zip from the backend) as a File.
export function blobToFile(blob, filename, type) {
  return new File([blob], filename, { type: type || blob.type || 'application/octet-stream' });
}

// Share files via the OS share sheet; fall back to downloading them.
// Returns 'shared' | 'downloaded' | 'cancelled'.
export async function shareFiles(files, { title, text } = {}) {
  files = (files || []).filter(Boolean);
  if (files.length === 0) return 'empty';
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title, text });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled'; // user closed the share sheet
    // any other error (e.g. activation lost after slow render) → fall back to download
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = f.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  return 'downloaded';
}
