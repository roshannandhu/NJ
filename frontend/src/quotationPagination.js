// Pure page-assignment for the quotation document. No DOM, no React: the
// component measures every block at the FIXED layout size (content width is
// constant on every page, so a block's height is position-independent), then
// this module greedily packs the FLOWING blocks into A4 pages in document
// order. The fixed per-page chrome — header band, customer block, Terms &
// Conditions, validity row and the page footer — repeats identically on every
// page; the component subtracts its height from `availH` before calling this.
//
// A Page is an ordered list of typed segments:
//   { type: 'spec',  from, to, withHead }   — spec-table class rows [from, to)
//   { type: 'items', from, to, withHead }   — item rows [from, to)
//   { type: 'addRow' }                       — edit-only "Add line item" button
//   { type: 'payTotals' }                    — payment + totals (atomic, never split)
//   { type: 'deliveryNotes' }                — atomic
//
// Tables split row-by-row; the first chunk row on any page pays the thead
// height too (withHead), so a header is never orphaned at a page bottom.
// Atomic blocks move whole to the next page when they don't fit. A single
// block/row taller than a fresh page gets a page to itself and clips
// (pages are overflow:hidden) — structurally near-impossible at fixed sizes.

// heights: {
//   payTotals, deliveryNotes, addRow                     — atomic block heights (0/null = absent)
//   specHead, specRows: number[], specMb                 — spec table (rows may be empty)
//   itemsHead, itemRows: number[], itemsMb               — items table
// }
// availH: flowing-content height budget per page (page height − padding −
//         header band − customer block − terms block − validity − page footer).
export function paginateQuotation({ heights, availH }) {
  const h = heights;
  const pages = [];
  let page = [];
  let used = 0;

  const flush = () => {
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };
  const fits = (need) => used + need <= availH;

  // blockH === null/undefined → block absent (skip). blockH === 0 → the block
  // renders but is free for pagination (screen-only edit affordances that are
  // excluded from the PDF must never force an extra page that would export
  // nearly empty); it rides along after the previous block.
  const placeAtomic = (type, blockH) => {
    if (blockH == null) return;
    if (blockH > 0 && !fits(blockH) && page.length) flush();
    page.push({ type });
    used += blockH;
  };

  // marginAfter: the table's bottom margin, charged once after the last chunk.
  const placeTable = (type, headH, rows, marginAfter) => {
    if (!rows || !rows.length) return;
    let i = 0;
    while (i < rows.length) {
      // Never start a chunk unless the head AND at least one row fit here.
      if (!fits(headH + (rows[i] || 0)) && page.length) flush();
      const from = i;
      let chunkH = headH;
      while (i < rows.length && fits(chunkH + (rows[i] || 0))) {
        chunkH += rows[i] || 0;
        i += 1;
      }
      if (i === from) {
        // Oversize row on a fresh page: give it its own page, let it clip.
        flush();
        page.push({ type, from, to: from + 1, withHead: true });
        i += 1;
        flush();
        continue;
      }
      page.push({ type, from, to: i, withHead: true });
      used += chunkH;
      if (i === rows.length) used += marginAfter || 0;
    }
  };

  placeTable('spec', h.specHead || 0, h.specRows, h.specMb);
  placeTable('items', h.itemsHead || 0, h.itemRows, h.itemsMb);
  placeAtomic('addRow', h.addRow);
  placeAtomic('payTotals', h.payTotals);
  placeAtomic('deliveryNotes', h.deliveryNotes);
  flush();

  return pages.length ? pages : [[]];
}
