// Quotation PDF generation + native share for the phone. Builds an HTML document
// (a compact echo of the desktop quotation layout) and renders it to a PDF via
// expo-print, then opens the OS share sheet via expo-sharing.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function buildQuotationHtml(q, config) {
  const company = (config && config.company) || {};
  const settings = (config && config.settings) || {};
  const items = Array.isArray(q.items) ? q.items : [];

  const subtotal = q.subtotal != null
    ? q.subtotal
    : items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const tax = q.tax != null
    ? q.tax
    : (settings.taxEnabled ? subtotal * (Number(settings.taxRate) || 0) / 100 : 0);
  const grand = q.grandTotal != null ? q.grandTotal : subtotal + tax;

  const rows = items.map((it, i) => {
    const amt = (Number(it.price) || 0) * (Number(it.qty) || 0);
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(it.name)}${it.color ? `<div class="sub">${esc(it.color)}</div>` : ''}</td>
      <td class="r">${esc(it.qty)} ${esc(it.unit || '')}</td>
      <td class="r">${money(it.price)}</td>
      <td class="r">${money(amt)}</td>
    </tr>`;
  }).join('');

  const cust = q.customer || {};
  const terms = (settings.termsText || '').split('\n').filter(Boolean)
    .map(t => `<li>${esc(t)}</li>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color:#1a1a1a; margin:0; padding:28px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1a1a1a; padding-bottom:12px; }
    .company { font-size:22px; font-weight:800; }
    .muted { color:#6a6558; font-size:11px; white-space:pre-line; margin-top:4px; }
    .doc { text-align:right; }
    .doc .title { font-size:16px; font-weight:700; letter-spacing:1px; color:#c0552f; }
    .meta { margin:18px 0; display:flex; justify-content:space-between; font-size:12px; }
    .label { color:#6a6558; font-size:10px; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
    th { background:#1a1a1a; color:#fff; text-align:left; padding:8px; font-size:10px; text-transform:uppercase; }
    td { padding:8px; border-bottom:1px solid #e4ded1; vertical-align:top; }
    td.r, th.r { text-align:right; }
    .sub { color:#6a6558; font-size:10px; }
    .totals { margin-top:14px; margin-left:auto; width:46%; font-size:13px; }
    .totals div { display:flex; justify-content:space-between; padding:4px 0; }
    .totals .grand { border-top:2px solid #1a1a1a; margin-top:6px; padding-top:8px; font-weight:800; font-size:15px; }
    .terms { margin-top:26px; font-size:10px; color:#6a6558; }
    .terms ul { margin:6px 0 0 16px; padding:0; }
  </style></head><body>
    <div class="head">
      <div>
        <div class="company">${esc(company.name || 'NJ India Trading')}</div>
        <div class="muted">${esc(company.address || '')}</div>
        <div class="muted">${esc(company.phone || '')}${company.website ? '  ·  ' + esc(company.website) : ''}</div>
      </div>
      <div class="doc">
        <div class="title">QUOTATION</div>
        <div class="muted">${esc(q.id || '')}</div>
        <div class="muted">${esc(q.date || '')}</div>
      </div>
    </div>

    <div class="meta">
      <div>
        <div class="label">Customer</div>
        <div><b>${esc(cust.name || '')}</b></div>
        <div class="muted">${esc(cust.phone || '')}</div>
        <div class="muted">${esc(cust.address || '')}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No items</td></tr>'}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${money(subtotal)}</span></div>
      ${settings.taxEnabled ? `<div><span>Tax (${esc(settings.taxRate)}%)</span><span>${money(tax)}</span></div>` : ''}
      <div class="grand"><span>Grand Total</span><span>${money(grand)}</span></div>
    </div>

    ${terms ? `<div class="terms"><div class="label">Terms &amp; Conditions</div><ul>${terms}</ul></div>` : ''}
  </body></html>`;
}

// Render HTML → PDF and open the share sheet. Returns the file uri.
export async function shareQuotationPdf(q, config) {
  const html = buildQuotationHtml(q, config);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Quotation ${q.id || ''}` });
  }
  return uri;
}
