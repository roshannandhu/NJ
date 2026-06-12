// Add-on Order helpers. Pure functions, no DOM, no React.
//
// An "add-on order" appends products to an EXISTING quotation after it was
// generated, without touching the original items or amounts. The snapshot
// keeps the original `items` array byte-identical and records additions as
// ordered batches:
//
//   addons: [ { id, addedAt (ISO), items: [cartItem & { addedLater: true }] } ]
//
// Derived totals stored alongside (see Checkout.finalizeAddon and
// QuotationDocument.recomputeTotals):
//   originalGrandTotal — the original section's grand total (frozen in effect)
//   addonTotal         — plain sum of qty×price over ALL addon items
//                        (add-ons carry NO tax and NO discount by design)
//   grandTotal         — originalGrandTotal + addonTotal, so History/backup/
//                        grand_total consumers keep working unchanged.

export const hasAddons = (q) =>
  Array.isArray(q?.addons) && q.addons.some(b => (b.items || []).length > 0);

// Flattened add-on rows in batch order; each row annotated with its batch
// metadata so per-row edits can address the right batch.
export const addonItemsOf = (q) =>
  (q?.addons || []).flatMap(b =>
    (b.items || []).map(it => ({ ...it, _batchId: b.id, _addedAt: b.addedAt })));

// Plain sum — no tax, no discount on add-ons.
export const addonTotalOf = (q) =>
  Math.round(addonItemsOf(q).reduce(
    (s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0) * 100) / 100;

// Every product on the quotation (originals + add-ons) — for consumers that
// must see the whole order: brand resolution, spec table, warranty certs.
export const allItemsOf = (q) => [...(q?.items || []), ...addonItemsOf(q)];

// Offer savings inside the add-on items only (same offer rule as everywhere:
// an offer exists when the effective price was lowered below actualPrice).
export const addonSavingsOf = (q) =>
  Math.round(addonItemsOf(q).reduce((s, it) => {
    const actual = Number(it.actualPrice) || 0;
    const price = Number(it.price) || 0;
    return s + (actual > 0 && price < actual ? (actual - price) * (Number(it.qty) || 0) : 0);
  }, 0) * 100) / 100;

// 'dd/mm/yyyy, hh:mm' for the "Added Later" marking; '' when missing/invalid.
export const formatAddedAt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
