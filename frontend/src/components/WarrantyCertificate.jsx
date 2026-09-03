import React from 'react';
import { Edit3, Check } from 'lucide-react';
import { mediaUrl } from '../api';

// ════════════════════════════════════════════════════════════════════════════
//  Shared single-A4-page warranty certificate.
//  ONE source of truth used by both the standalone Warranty view
//  (WarrantyDocument.jsx) and the warranty tab inside the quotation document
//  (QuotationDocument.jsx), so the layout rules can never diverge again.
//
//  Layout (top→bottom, inside a fixed 794×1123 A4 box that never grows):
//    • Header (logo, fixed)
//    • Terms & Conditions — continuous two-column flow, AUTO-SHRUNK so it can
//      never cross its borders or spill to a 2nd page; company seal floated in
//      the bottom-right of the terms.
//    • Series / liability tables (only when data exists)
//    • Details block (customer or certificate variant — view-specific content)
//    • Signature (fixed, bottom)
// ════════════════════════════════════════════════════════════════════════════

const COL_GAP = 22;
const SEAL_BOX = 195;
const MIN_SCALE = 0.42;   // floor: shrink this far so even very long terms fit one page (no clipping)
const MAX_SCALE = 1.95;   // ceiling: grow this far to FILL the page when terms are short (no gaps)

// ── Inline-editable cell (used only when `edit` handlers are supplied) ────────
export function EditableCell({ value, onSave, multiline = false, style = {}, renderValue, hideIcon }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');
  const downPos = React.useRef(null);
  React.useEffect(() => { setDraft(value || ''); }, [value]);

  const stop = () => { setEditing(false); document.body.removeAttribute('data-warranty-editing'); };
  const commit = () => { stop(); if (draft !== value) onSave(draft); };

  // Drag-to-highlight (or clicking with an active selection) must not flip the
  // <span> into an <input> mid-selection, or the text can never be copied. A
  // plain click still enters edit mode.
  const startEdit = () => { setEditing(true); document.body.setAttribute('data-warranty-editing', 'true'); };
  const onMouseDown = (e) => { downPos.current = { x: e.clientX, y: e.clientY }; };
  const handleClick = (e) => {
    const moved = downPos.current && (Math.abs(e.clientX - downPos.current.x) > 3 || Math.abs(e.clientY - downPos.current.y) > 3);
    const sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    const selecting = sel && !sel.isCollapsed && sel.toString().trim().length > 0;
    if (moved || selecting) return;
    startEdit();
  };

  if (editing) {
    const s = {
      width: '100%', border: 'none', borderBottom: '1.5px solid #8b1a1a',
      background: 'rgba(139,26,26,0.04)', padding: '2px 4px',
      fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit',
      color: 'inherit', outline: 'none', boxSizing: 'border-box', overflow: 'hidden', ...style,
    };
    return multiline
      ? <textarea autoFocus value={draft} style={s}
          ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
          onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(value || ''); stop(); } }} />
      : <input autoFocus type="text" value={draft} style={s}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); stop(); } }} />;
  }
  const content = renderValue ? renderValue(value) : (value || <span style={{ color: '#aaa', fontStyle: 'italic' }}>click to fill</span>);
  return (
    <span onMouseDown={onMouseDown} onClick={handleClick}
      title="Click to edit · drag to select & copy" className="wc-editable"
      style={{ cursor: 'text', display: 'inline-block', width: '100%', userSelect: 'text', WebkitUserSelect: 'text', ...style }}>
      {content}
      {hideIcon ? null : <Edit3 size={9} style={{ marginLeft: 4, opacity: 0.25, verticalAlign: 'middle', display: 'inline-block' }} />}
    </span>
  );
}

const toBullets = (text) =>
  (text || '').split('\n').filter(t => t.trim()).map(t => t.replace(/^[•\-*]\s*/, '').trim());

function buildBlocks(openingText, sections) {
  const blocks = [];
  if (openingText && openingText.trim()) blocks.push({ kind: 'opening', text: openingText });
  (sections || []).forEach((sec, si) => {
    if (sec.title) blocks.push({ kind: 'head', sectionIdx: si, text: sec.title });
    const content = sec.content || '';
    if (sec.isBullets) toBullets(content).forEach((t) => blocks.push({ kind: 'bullet', sectionIdx: si, text: t }));
    else content.split('\n').filter(l => l.trim()).forEach((line) => blocks.push({ kind: 'para', sectionIdx: si, text: line }));
  });
  return blocks;
}

// ── Free-form tables ────────────────────────────────────────────────────────
// A warranty template may carry any number of `customTables`, each with its own
// heading, optional intro paragraph, and an arbitrary column/row grid:
//   { id, title, intro, columns: string[], rows: string[][] }
// This coerces whatever is stored (older/partial rows, ragged grids) into a
// rectangular grid so the renderer never has to guard per cell. Tables with no
// columns AND no rows are dropped, so an empty one never prints a stray border.
export function normalizeCustomTables(tables) {
  if (!Array.isArray(tables)) return [];
  return tables.reduce((out, t) => {
    if (!t || typeof t !== 'object') return out;
    const columns = (Array.isArray(t.columns) ? t.columns : []).map(c => (c == null ? '' : String(c)));
    const width = columns.length;
    const rows = (Array.isArray(t.rows) ? t.rows : [])
      .map(r => (Array.isArray(r) ? r : [r]))
      // Pad/trim every row to the column count so a ragged grid still lines up.
      .map(r => Array.from({ length: width }, (_, i) => (r[i] == null ? '' : String(r[i]))));
    if (width === 0 && rows.length === 0) return out;
    out.push({ id: t.id || `tbl_${out.length}`, title: t.title || '', intro: t.intro || '', columns, rows });
    return out;
  }, []);
}

function TermBlock({ b, first }) {
  if (b.kind === 'opening') return <div className="wc-term-opening"><em>Dear Customer,</em> {b.text}</div>;
  if (b.kind === 'head') return <div className={`wc-term-head${first ? ' wc-term-head-first' : ''}`}>{b.text}</div>;
  if (b.kind === 'bullet') return <div className="wc-term-bullet"><span className="wc-term-dot">•</span><span>{b.text}</span></div>;
  return <div className="wc-term-para">{b.text}</div>;
}

// Drawn NJ India stamp as a SELF-CONTAINED SVG data URL — the fallback seal when
// no image is uploaded. Rendered through the same crisp <img> path as an uploaded
// seal (see Seal/FittedImg) instead of the flaky inline-<svg> path that dropped it
// from the exported PDF. Made data-URL-safe: explicit xmlns + a large SQUARE
// width/height (600px ≥ the 140px box × the 3× capture scale, so the rasterised
// text stays sharp) + viewBox so the intrinsic ratio is 1:1, and xlink:href on the
// arcs so the curved text renders when the SVG is loaded as a standalone image.
// IDs are local to this one document, so the single shared string can back every
// certificate without collisions.
const DRAWN_SEAL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
  ' width="600" height="600" viewBox="0 0 82 82" preserveAspectRatio="xMidYMid meet">' +
  '<circle cx="41" cy="41" r="39" fill="none" stroke="#8b1a1a" stroke-width="2"/>' +
  '<circle cx="41" cy="41" r="34" fill="none" stroke="#8b1a1a" stroke-width="1"/>' +
  '<circle cx="41" cy="41" r="33" fill="#fef9f9"/>' +
  '<path id="njSealTop" d="M 9,41 A 32,32 0 0,1 73,41" fill="none"/>' +
  '<text font-size="5.2" font-family="Arial, sans-serif" font-weight="900" fill="#8b1a1a" letter-spacing="0.5">' +
  '<textPath xlink:href="#njSealTop" startOffset="50%" text-anchor="middle">NOUFAL &amp; JABBAR INTERNATIONAL LLP</textPath></text>' +
  '<path id="njSealBot" d="M 9,41 A 32,32 0 0,0 73,41" fill="none"/>' +
  '<text font-size="5" font-family="Arial, sans-serif" font-weight="700" fill="#8b1a1a" letter-spacing="0.3">' +
  '<textPath xlink:href="#njSealBot" startOffset="50%" text-anchor="middle">Bypass Road · Ramanattukara</textPath></text>' +
  '<text x="41" y="37" text-anchor="middle" font-size="9" font-family="\'Times New Roman\', serif" font-weight="900" fill="#8b1a1a">NJ</text>' +
  '<text x="41" y="46" text-anchor="middle" font-size="4.5" font-family="Arial, sans-serif" font-weight="700" fill="#8b1a1a" letter-spacing="0.5">INDIA</text>' +
  '<text x="41" y="54" text-anchor="middle" font-size="4" font-family="Arial, sans-serif" font-weight="700" fill="#8b1a1a" letter-spacing="0.3">NJINDIA.IN</text>' +
  '</svg>';
const DRAWN_SEAL_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DRAWN_SEAL_SVG)}`;

const isImgSrc = (s) => typeof s === 'string' &&
  (s.startsWith('data:image/') || s.startsWith('http') || s.startsWith('/'));

// Render an uploaded image as an <img> at EXPLICIT pixel dimensions, fitted
// (contain) inside a maxW×maxH box, falling back to `fallbackSrc` if `src` is
// missing/broken. This is the html2canvas-safe AND sharp way to place these
// images in the exported PDF:
//   • Definite width/height is the only sizing html2canvas measures reliably — a
//     max-width/auto <img> in a flex box captured at zero size, so the seal &
//     signature VANISHED from the PDF.
//   • An <img> is drawn straight into the scaled capture (crisp); a CSS background
//     is rasterised at 1× then upscaled by the 3× capture → blurry.
//   • Fitting to the image's natural aspect means a non-square upload is never
//     stretched to an oval.
// The natural size is read via a preload (also how a broken src is detected — an
// <img> onError can't fire inside an html2canvas clone, so we resolve up-front).
function FittedImg({ src, fallbackSrc = null, maxW, maxH, alt = '', style = {} }) {
  const [meta, setMeta] = React.useState(null); // { url, w, h }
  React.useEffect(() => {
    let alive = true;
    const load = (url, onFail) => {
      const im = new Image();
      im.onload = () => { if (alive) setMeta({ url, w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); };
      im.onerror = onFail;
      im.src = url;
    };
    const tryFallback = () => {
      if (isImgSrc(fallbackSrc)) load(mediaUrl(fallbackSrc), () => { if (alive) setMeta(null); });
      else if (alive) setMeta(null);
    };
    if (isImgSrc(src)) load(mediaUrl(src), tryFallback);
    else tryFallback();
    return () => { alive = false; };
  }, [src, fallbackSrc]);

  if (!meta) return null;
  const fit = Math.min(maxW / meta.w, maxH / meta.h);
  const w = Math.max(1, Math.round(meta.w * fit));
  const h = Math.max(1, Math.round(meta.h * fit));
  return <img src={meta.url} alt={alt} width={w} height={h} style={{ width: w, height: h, display: 'block', ...style }} />;
}

// Company stamp / seal. Prefers the uploaded image (template.sealImage), fitted
// into the square SEAL_BOX so an uploaded non-square seal keeps its true aspect
// (no oval) and the drawn fallback stays a perfect circle.
//
// The drawn fallback is NJ's stamp - its artwork spells out NOUFAL & JABBAR
// INTERNATIONAL LLP and NJ's address - so ONLY the NJ/no-brand path may use it.
// It used to be unconditional, which stamped NJ's seal onto every other brand's
// certificate. A brand that has not uploaded a seal now shows none.
function Seal({ template, isLegacyBrand }) {
  if (!template.sealImage && !isLegacyBrand) return null;
  return <FittedImg src={template.sealImage} fallbackSrc={isLegacyBrand ? DRAWN_SEAL_URL : ''}
    maxW={SEAL_BOX} maxH={SEAL_BOX} alt="Company Seal" />;
}

// ── Details block: customer variant (editable) ──────────────────────────────
function CustomerDetails({ customer, certData, template, fallbackDate, invoiceFallback, edit, warrantyNo }) {
  const field = (lbl, val, save) => (
    <div className="wc-det-field">
      <span className="wc-det-lbl">{lbl}</span>
      <span className="wc-det-val">{edit ? <EditableCell value={val} onSave={save} /> : (val || '—')}</span>
    </div>
  );
  // Static (read-only) field for an auto-generated identifier.
  const staticField = (lbl, val) => (
    <div className="wc-det-field">
      <span className="wc-det-lbl">{lbl}</span>
      <span className="wc-det-val">{val || '—'}</span>
    </div>
  );
  return (
    <div className="wc-details">
      <div className="wc-det-title">Customer Information</div>
      <div className="wc-det-grid">
        {staticField('Certificate No', warrantyNo)}
        {field('Customer Name', customer.name, v => edit?.onUpdateCustomerField('name', v))}
        {field('Product', certData.productName, v => edit?.onUpdateCertField('productName', v))}
        {field('Date', certData.purchaseDate || fallbackDate, v => edit?.onUpdateCertField('purchaseDate', v))}
        {field('Seller', certData.invoiceNo || invoiceFallback || '', v => edit?.onUpdateCertField('invoiceNo', v))}
        {field('Warranty Period', certData.warrantyPeriod || template.duration || '', v => edit?.onUpdateCertField('warrantyPeriod', v))}
      </div>
    </div>
  );
}

// ── Details block: certificate variant (static, template-conditional) ───────
function CertificateDetails({ customer, certData: cd, template, fallbackDate, warrantyNo, orderNo }) {
  const isHeatout = template.id === 'heatout';
  const isStoneCoated = template.id === 'stone_coated';
  const isCeramic = template.id === 'ceramic';
  const isDocke = template.id === 'docke';
  const row = (lbl, val, staticVal) => (
    <div className="wc-cert-row">
      <span className="wc-cert-lbl">{lbl}</span>
      <span className={staticVal ? 'wc-cert-val-static' : 'wc-cert-val'}>{val || '—'}</span>
    </div>
  );
  return (
    <div className="wc-details">
      <div className="wc-det-title">Certificate Details</div>
      {warrantyNo && row('Certificate No', warrantyNo, true)}
      {orderNo && row('Order No', orderNo, true)}
      {row('Address', cd.siteAddress || [customer?.name, customer?.address].filter(Boolean).join(', '))}
      {row(isHeatout || isStoneCoated || isCeramic ? 'The name of the sold products (complete, including color)' : 'Product Name & Color',
        cd.productName || [cd.productName, (cd.productColor && cd.productColor !== 'N/A') ? cd.productColor : null].filter(Boolean).join(' — '))}
      {isDocke && row('Batch Number', cd.batchNo)}
      {isCeramic && row('Batch Number (see on the packaging)', cd.batchNo)}
      {!isCeramic && row('Date', cd.purchaseDate || fallbackDate)}
      {!isHeatout && certData.tradingOrg && row('Trading Organization', certData.tradingOrg, true)}
      {row("Seller's Name & Signature", cd.sellerName)}
      {isCeramic && row('Date', cd.purchaseDate || fallbackDate)}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function WarrantyCertificate({
  template, openingText, variant = 'customer',
  customer = {}, certData = {}, fallbackDate = '', invoiceFallback = '',
  edit = null, domId = 'warrantyDoc',
  warrantyNo = '', orderNo = '',
  // Whether this certificate belongs to the ORIGINAL brand. Defaults to false so
  // a caller that forgets it can never leak NJ's seal onto another brand - the
  // safe direction, since a missing seal is visible while a wrong one is not.
  isLegacyBrand = false,
}) {
  const [editingTerms, setEditingTerms] = React.useState(false);
  const [fontTick, setFontTick] = React.useState(0);
  const [fit, setFit] = React.useState({ scale: 1, split: null });
  const termsRegionRef = React.useRef(null);
  const measureRef = React.useRef(null);
  const fitStRef = React.useRef({ key: '', iter: 0, frozen: false });
  const previewShellRef = React.useRef(null);
  const pageRef = React.useRef(null);

  const isDocke = template.id === 'docke';
  const sections = template.sections || [];
  const sectionsJson = JSON.stringify(sections);
  const blocks = React.useMemo(() => buildBlocks(openingText, sections), [openingText, sectionsJson]);
  const hasSeriesTable = !!(template.showSeriesTable && template.seriesTable && template.seriesTable.length > 0);
  const hasHeatoutTable = !!(template.heatoutTable && template.liabilityTable?.length > 0);
  // Free-form tables authored in the Warranty Builder (any number of tables,
  // any number of columns/rows). They render with the SAME .wc-table styling as
  // the two built-in tables, so they inherit the one --wc-term-scale font size
  // and are measured by the same fit engine — a long table shrinks the page to
  // fit instead of spilling onto a second one.
  const customTables = normalizeCustomTables(template.customTables);
  const customTablesJson = JSON.stringify(customTables);

  const termsKey = `${openingText || ''}|${sectionsJson}`;
  const tablesKey = `${JSON.stringify(template.seriesTable || [])}|${JSON.stringify(template.liabilityTable || [])}|${!!template.heatoutTable}|${!!template.showSeriesTable}|${customTablesJson}`;
  const detailsKey = JSON.stringify({ customer, certData, variant, period: certData.warrantyPeriod || template.duration });

  React.useEffect(() => {
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) setFontTick(t => t + 1); });
    return () => { alive = false; };
  }, []);

  // Fit engine: split the terms into two balanced columns and scale them (via
  // --wc-term-scale) so the TALLER column exactly fills the available height —
  // shrinking long terms so nothing clips, and GROWING short terms so the page
  // is never left half-empty. Heights scale ~linearly with the font scale, so
  // `next = scale × avail / tallest` is a contraction that converges to
  // "taller column == page height" (a full page) in a few passes.
  //
  // All measurements come from the hidden single-column `meas` (width = one
  // column, current scale): because each real column has that same width and
  // scale, its wrapping — and therefore its height — is identical, so the
  // estimate IS the rendered height. No fragile real-column read-back needed.
  React.useLayoutEffect(() => {
    if (editingTerms) return;
    const region = termsRegionRef.current;
    const meas = measureRef.current;
    if (!region || !meas) return;

    const key = `${termsKey}|${tablesKey}|${detailsKey}|${fontTick}`;
    const st = fitStRef.current;
    if (st.key !== key) { st.key = key; st.iter = 0; st.frozen = false; } // new content → fresh convergence budget
    if (st.frozen) return; // budget already spent for this content — never re-enter (no cascading renders)

    const avail = region.clientHeight;
    if (avail < 40) return;
    const colW = Math.max(40, (region.clientWidth - COL_GAP) / 2);
    meas.style.width = colW + 'px';

    const nodes = Array.from(meas.children);
    const n = nodes.length;
    if (n === 0) return;
    const tops = nodes.map(node => node.offsetTop);
    const totalH = meas.scrollHeight;
    // Column 2 reserves room for the seal (pinned bottom-right) so terms text can
    // never run under / overlap it.
    const sealReserve = SEAL_BOX + 16;
    const heightAt = (i) => (i >= n ? totalH : tops[i]);

    // Balance: column 1 ≈ column 2 + seal reserve; never end column 1 on a heading.
    let split = n, bestDiff = Infinity;
    for (let i = 1; i < n; i++) {
      if (blocks[i - 1] && blocks[i - 1].kind === 'head') continue;
      const c1 = heightAt(i);
      const c2 = (totalH - c1) + sealReserve;
      const diff = Math.abs(c1 - c2);
      if (diff < bestDiff) { bestDiff = diff; split = i; }
    }
    if (split >= n && n > 1) split = n - 1;

    const c1 = heightAt(split);
    const tallest = Math.max(c1, (totalH - c1) + sealReserve);
    if (tallest < 1) return;

    // Scale that would fill the page this pass (a few px short of the clip line
    // for rounding safety). The whole document body scales by this one variable,
    // so the banner/tables/details also grow/shrink with it.
    const target = Math.max(40, avail - 6);
    const ideal = (fit.scale * target) / tallest;
    st.iter += 1;

    // CLIPPING GUARD — while the terms overflow the page, ALWAYS shrink (ideal is
    // < current here; monotone, bounded by MIN_SCALE). Never freeze on an
    // overflowing scale, so no line of terms is ever cut off. Only accept an
    // overflow once we've already hit the smallest allowed size.
    if (tallest > avail) {
      if (fit.scale <= MIN_SCALE + 0.0005) { st.frozen = true; return; }
      setFit({ scale: +Math.max(MIN_SCALE, ideal).toFixed(3), split });
      return;
    }

    // Current scale already fits. Because the page furniture now scales with the
    // terms, `avail` and `tallest` BOTH move with the scale — so we take damped
    // half-steps toward the target to keep that coupled solve from oscillating.
    const damped = fit.scale + (ideal - fit.scale) * 0.5;
    const next = +Math.min(MAX_SCALE, Math.max(MIN_SCALE, damped)).toFixed(3);

    if (st.iter >= 22) {
      st.frozen = true;                            // freeze at the KNOWN-good current scale,
      if (split !== fit.split) setFit({ scale: fit.scale, split }); // not an untested larger one
      return;
    }
    if (Math.abs(next - fit.scale) < 0.004) {      // converged
      if (split !== fit.split || Math.abs(next - fit.scale) > 0.001) setFit({ scale: next, split });
      return;
    }
    setFit({ scale: next, split });
  }, [fit.scale, fit.split, editingTerms, termsKey, tablesKey, detailsKey, blocks, fontTick]);

  React.useLayoutEffect(() => {
    const shell = previewShellRef.current;
    const page = pageRef.current;
    if (!shell || !page) return undefined;

    const fitPage = () => {
      const availableWidth = shell.clientWidth;
      if (!availableWidth) return;

      const scale = Math.min(1, availableWidth / 794);
      page.style.transform = scale < 1 ? `scale(${scale})` : 'none';
      page.style.transformOrigin = 'top center';
      page.style.marginBottom = scale < 1 ? `${1123 * scale - 1123}px` : '0px';
    };

    fitPage();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fitPage) : null;
    observer?.observe(shell);

    return () => {
      observer?.disconnect();
    };
  }, []);

  const split = (fit.split == null) ? blocks.length : fit.split;
  const col1Blocks = blocks.slice(0, split);
  const col2Blocks = blocks.slice(split);


  return (
    <div className="wc-preview-shell" ref={previewShellRef}>
    <div className="wc-doc" id={domId} ref={pageRef} style={{ '--wc-term-scale': fit.scale }}>
      <style dangerouslySetInnerHTML={{ __html: WC_CSS }} />

      {/* ══ HEADER ══ */}
      <div className="wc-header">
        {/* Auto-generated identifiers — absolutely positioned at the header's
            top-right, beside the logo, so they NEVER add vertical space. */}
        {(warrantyNo || orderNo) && (
          <div style={{ position: 'absolute', top: 0, right: 0, textAlign: 'right', fontSize: '9pt', lineHeight: 1.35, color: '#000', fontWeight: 700 }}>
            {warrantyNo && <div>Certificate No: {warrantyNo}</div>}
            {orderNo && <div>Order No: {orderNo}</div>}
          </div>
        )}
        {isImgSrc(template.logo) ? (
          <>
            <img src={mediaUrl(template.logo)} alt="Logo" style={{ height: 92, width: 'auto', maxWidth: 560, objectFit: 'contain', margin: '0 auto 3px', display: 'block' }} />
            <p className="wc-logo-sub">{template.title || 'Warranty Certificate'}</p>
          </>
        ) : isDocke ? (
          <>
            <p className="wc-logo" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic' }}>Döcke</p>
            <p className="wc-logo-sub">PIE — Bitumen Shingles</p>
          </>
        ) : (
          <>
            <p className="wc-logo">{template.logo || 'NJ'}</p>
            <p className="wc-logo-sub">{template.title || 'Warranty Certificate'}</p>
          </>
        )}
      </div>

      <div className="wc-banner">Warranty Certificate</div>

      {/* ══ TERMS ══ */}
      {editingTerms && edit ? (
        <div className="wc-edit-wrap" data-html2canvas-ignore="true">
          <button className="wc-done-btn" onClick={() => setEditingTerms(false)}><Check size={14}/> Done editing terms</button>
          <div className="wc-edit-sec">
            <div className="wc-edit-sec-head">Opening</div>
            <EditableCell value={openingText || ''} onSave={v => edit.onUpdateOpening(v)} multiline hideIcon />
          </div>
          {sections.map((sec, idx) => (
            <div key={idx} className="wc-edit-sec">
              <div className="wc-edit-sec-head">
                <EditableCell value={sec.title} onSave={v => edit.onUpdateSection(idx, 'title', v)} style={{ fontWeight: 'inherit', fontSize: 'inherit' }} />
                <button className="wc-rm-btn" onClick={() => edit.onRemoveSection(idx)}>Remove</button>
              </div>
              <div style={{ fontSize: '10.5pt', color: '#2a2a2a' }}>
                <EditableCell value={sec.content} onSave={v => edit.onUpdateSection(idx, 'content', v)} multiline hideIcon />
              </div>
              <label style={{ fontSize: '9pt', color: '#666', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <input type="checkbox" checked={!!sec.isBullets} onChange={e => edit.onUpdateSection(idx, 'isBullets', e.target.checked)} /> Bullet list
              </label>
            </div>
          ))}
          <button className="wc-add-btn" onClick={() => edit.onAddSection()}>+ Add section</button>
        </div>
      ) : (
        <div className="wc-terms-region" ref={termsRegionRef}>
          <div className="wc-measure wc-term-col" ref={measureRef} data-html2canvas-ignore="true" aria-hidden="true" style={{ '--wc-term-scale': fit.scale }}>
            {blocks.map((b, i) => <TermBlock key={`m-${i}`} b={b} first={i === 0} />)}
          </div>
          <div className={`wc-terms-cols${edit ? ' wc-terms-click' : ''}`}
               onClick={edit ? () => setEditingTerms(true) : undefined} title={edit ? 'Click to edit the terms' : undefined}>
            <div className="wc-term-col" style={{ '--wc-term-scale': fit.scale }}>{col1Blocks.map((b, i) => <TermBlock key={`c1-${i}`} b={b} first={i === 0} />)}</div>
            <div className="wc-term-col" style={{ '--wc-term-scale': fit.scale, paddingBottom: SEAL_BOX + 16 }}>{col2Blocks.map((b, i) => <TermBlock key={`c2-${split + i}`} b={b} first={i === 0} />)}</div>
          </div>
          {/* Seal and Signature pinned to the bottom-right end of the terms (above the tables). */}
          <div className="wc-term-seal">
            <Seal template={template} isLegacyBrand={isLegacyBrand} />
            <div className="wc-sig-block">
              <div className="wc-sig-area">
                <FittedImg src={template.signImage} maxW={150} maxH={50} alt="Signature" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ SERIES / LIABILITY / CUSTOM TABLES (only when data) ══ */}
      {(hasHeatoutTable || hasSeriesTable || customTables.length > 0) && (
        <div className="wc-tables">
          {hasHeatoutTable && (
            <>
              <div className="wc-table-title">Liability Table</div>
              <table className="wc-table">
                <thead><tr>
                  <th style={{ width: '50%' }}>Years of use counted from the purchase date</th>
                  <th style={{ textAlign: 'center', width: '50%' }}>Share of the Warrantor liability (% of the purchase price for the replaced element and its installation)</th>
                </tr></thead>
                <tbody>
                  {(template.liabilityTable || []).map((row, i) => (
                    <tr key={i}><td>{row.years}</td><td className="wc-pct">{row.pct}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {hasSeriesTable && (
            <>
              <div className="wc-table-title">Warranty Period by Series</div>
              <table className="wc-table">
                <thead><tr><th>Series / Model</th><th style={{ textAlign: 'center' }}>Warranty Period</th></tr></thead>
                <tbody>
                  {template.seriesTable.map((s, i) => (
                    <tr key={i}><td>{s.series}</td><td className="wc-dur">{s.duration}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {customTables.map((t) => (
            <React.Fragment key={t.id}>
              {t.title && <div className="wc-table-title">{t.title}</div>}
              {t.intro && <div className="wc-table-intro">{t.intro}</div>}
              <table className="wc-table">
                {t.columns.length > 0 && (
                  <thead><tr>
                    {t.columns.map((c, ci) => (
                      // Even column widths, and every column after the first is
                      // centred — matching the built-in tables' look.
                      <th key={ci} style={{ width: `${100 / t.columns.length}%`, textAlign: ci === 0 ? 'left' : 'center' }}>{c}</th>
                    ))}
                  </tr></thead>
                )}
                <tbody>
                  {t.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'center' }}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ══ DETAILS (variant-specific) ══ */}
      {variant === 'certificate'
        ? <CertificateDetails customer={customer} certData={certData} template={template} fallbackDate={fallbackDate} warrantyNo={warrantyNo} orderNo={orderNo} />
        : <CustomerDetails customer={customer} certData={certData} template={template} fallbackDate={fallbackDate} invoiceFallback={invoiceFallback} edit={edit} warrantyNo={warrantyNo} />}

    </div>
    </div>
  );
}

const WC_CSS = `
  .wc-preview-shell {
    width: 100%; max-width: 100%; min-width: 0; overflow: hidden;
    display: flex; justify-content: center; align-items: flex-start;
  }
  .wc-doc {
    background: #fff; width: 794px; max-width: 794px; height: 1123px;
    flex-shrink: 0;
    padding: 38px 52px 32px; margin: 0 auto;
    font-family: 'Times New Roman', Times, Georgia, serif; color: #000;
    font-size: 9pt; line-height: 1.5; box-sizing: border-box; position: relative;
    overflow: hidden; border: 1px solid #d8d8d8; box-shadow: 0 4px 32px rgba(0,0,0,0.10);
    display: flex; flex-direction: column;
  }
  /* Thin certificate frame, inset from the page edge so it prints/exports too
     (the .wc-doc border above is screen-only and stripped in print). Absolutely
     positioned so it is NOT pulled into the flex flow, and sits in the margin
     gutter so it never overlaps the content. */
  .wc-doc::before {
    content: ''; position: absolute;
    top: 14px; right: 14px; bottom: 14px; left: 14px;
    border: 1.5px solid #8b1a1a; border-radius: 3px;
    pointer-events: none; z-index: 1;
  }
  .wc-doc .wc-header { position: relative; text-align: center; padding-bottom: 10px; border-bottom: 1px solid #e2e2e2; flex-shrink: 0; }

  .wc-logo { font-family: 'Playfair Display', Georgia, serif; font-size: 60pt; font-weight: 900; letter-spacing: 0.04em; color: #111; margin: 0; line-height: 1.02; }
  .wc-logo-sub { font-size: 9pt; letter-spacing: 0.28em; text-transform: uppercase; color: #444; font-weight: 700; margin: 2px 0 0; font-family: 'Times New Roman', Times, Georgia, serif; }
  .wc-banner { text-align: center; font-size: calc(9pt * var(--wc-term-scale, 1)); letter-spacing: 0.34em; font-weight: 700; margin: 9px 0; text-transform: uppercase; color: #000; font-family: 'Times New Roman', Times, Georgia, serif; flex-shrink: 0; }

  .wc-terms-region { flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden; }
  .wc-terms-cols { display: grid; grid-template-columns: 1fr 1fr; gap: ${COL_GAP}px; height: 100%; align-content: start; }
  .wc-term-col { font-size: calc(9pt * var(--wc-term-scale, 1)); line-height: 1.4; color: #000; min-width: 0; }
  .wc-term-opening { font-size: calc(9pt * var(--wc-term-scale, 1)); margin: 0 0 calc(9px * var(--wc-term-scale, 1)); text-align: justify; }
  .wc-term-opening em { font-style: italic; font-weight: 700; }
  .wc-term-head { font-size: calc(9pt * var(--wc-term-scale, 1)); font-weight: 700; color: #000; margin: calc(9px * var(--wc-term-scale, 1)) 0 calc(5px * var(--wc-term-scale, 1)); padding-bottom: calc(3px * var(--wc-term-scale, 1)); border-bottom: 1px solid #ccc; font-family: 'Times New Roman', Times, Georgia, serif; break-inside: avoid; }
  .wc-term-head-first { margin-top: 0; }
  .wc-term-para { margin: 0 0 calc(5px * var(--wc-term-scale, 1)); text-align: justify; }
  .wc-term-bullet { display: flex; gap: 6px; margin: 0 0 calc(4px * var(--wc-term-scale, 1)); text-align: justify; }
  .wc-term-dot { color: #8b1a1a; flex-shrink: 0; }
  .wc-term-seal { position: absolute; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 5px; padding-bottom: 5px; }
  .wc-measure { position: absolute; left: -99999px; top: 0; visibility: hidden; pointer-events: none; }

  .wc-edit-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .wc-edit-sec { margin-bottom: 12px; }
  .wc-edit-sec-head { display: flex; align-items: center; gap: 8px; font-size: 9pt; font-weight: 700; margin-bottom: 4px; }
  .wc-rm-btn { background: transparent; border: none; color: #dc2626; font-weight: 700; cursor: pointer; font-size: 9pt; padding: 0 0 0 6px; }
  .wc-add-btn { padding: 6px 12px; border: 1.5px dashed #c9a3a3; border-radius: 6px; background: transparent; color: #8b1a1a; font-weight: 700; font-size: 9pt; cursor: pointer; margin-top: 6px; }
  .wc-done-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 6px; border: none; background: var(--accent, #c2410c); color: #fff; font-weight: 700; font-size: 9pt; cursor: pointer; margin-bottom: 12px; }

  .wc-tables { flex-shrink: 0; margin-top: 10px; }
  .wc-table-title { font-size: calc(9pt * var(--wc-term-scale, 1)); font-weight: 700; color: #000; margin: 0 0 4px; font-family: 'Times New Roman', Times, Georgia, serif; }
  .wc-table-intro { font-size: calc(9pt * var(--wc-term-scale, 1)); line-height: 1.4; color: #000; text-align: justify; margin: 0 0 calc(5px * var(--wc-term-scale, 1)); }
  .wc-table { width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 8px; font-size: calc(9pt * var(--wc-term-scale, 1)); }
  .wc-table th { color: #000; padding: 4px 9px; text-align: left; font-size: calc(9pt * var(--wc-term-scale, 1)); letter-spacing: 0.04em; font-weight: 700; font-family: 'Times New Roman', Times, Georgia, serif; border: 1px solid #000; border-bottom: 1.5px solid #000; }
  .wc-table td { padding: 5px 9px; border: 1px solid #000; vertical-align: middle; }
  .wc-dur, .wc-pct { font-weight: 700; color: #8b1a1a; text-align: center; }
  .wc-pct { min-width: 70px; }

  .wc-details { flex-shrink: 0; margin-top: 10px; padding-top: 12px; border-top: 1px solid #e2e2e2; }
  .wc-det-title { font-size: calc(9pt * var(--wc-term-scale, 1)); font-weight: 700; letter-spacing: 0.04em; margin: 0 0 7px; color: #000; font-family: 'Times New Roman', Times, Georgia, serif; }
  .wc-det-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 44px; }
  .wc-det-field { display: flex; flex-direction: column; gap: 2px; }
  .wc-doc .wc-det-lbl { font-size: calc(9pt * var(--wc-term-scale, 1)); letter-spacing: 0.1em; text-transform: uppercase; color: #333; font-weight: 700; }
  .wc-doc .wc-det-val { font-size: calc(9pt * var(--wc-term-scale, 1)); font-weight: 700; color: #000; border-bottom: 1px solid #000; padding: 1px 2px 4px; min-height: 20px; }
  .wc-cert-row { display: flex; align-items: baseline; padding: 3px 0; border-bottom: 1px dotted #000; font-size: calc(9pt * var(--wc-term-scale, 1)); gap: 10px; }
  .wc-doc .wc-cert-lbl { min-width: 200px; color: #111; font-weight: 600; font-size: calc(9pt * var(--wc-term-scale, 1)); flex-shrink: 0; }
  .wc-doc .wc-cert-lbl::after { content: ':'; }
  .wc-doc .wc-cert-val { font-weight: 700; color: #000; flex: 1; border-bottom: 1px solid #000; min-height: 20px; padding: 0 4px 1px; }
  .wc-doc .wc-cert-val-static { font-weight: 700; color: #000; flex: 1; padding: 0 4px 1px; border-bottom: 1px solid #000; }

  .wc-editable { display: inline-flex; align-items: center; gap: 2px; border-radius: 2px; padding: 0 2px; width: 100%; }
  .wc-editable:hover { background: rgba(139,26,26,0.05); outline: 1px dashed rgba(139,26,26,0.35); }
  .wc-terms-click { cursor: text; }
  .wc-terms-click:hover { outline: 1px dashed rgba(139,26,26,0.25); border-radius: 3px; }

  /* Footer removed since signature is now in the terms region */
  .wc-sig-block { text-align: center; font-size: 9pt; color: #000; width: 170px; margin-bottom: -5px; }
  /* Fixed-height area the signature image sits in, resting ON the line below.
     The signature <img> is sized inline by FittedImg (definite dims = crisp +
     reliable in the html2canvas capture). */
  .wc-sig-area { height: 50px; display: flex; align-items: flex-end; justify-content: center; }
  .wc-sig-line { border-bottom: 1px solid #000; width: 150px; margin: 2px auto 0; }
  .wc-sig-name { color: #000; font-weight: 700; font-size: 10pt; padding-top: 5px; font-family: 'Times New Roman', Times, Georgia, serif; letter-spacing: 0.05em; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    .wc-preview-shell { width: 794px !important; max-width: none !important; overflow: visible !important; display: block !important; }
    .wc-doc { box-shadow: none !important; border: none !important; margin: 0 !important; }
  }
`;
