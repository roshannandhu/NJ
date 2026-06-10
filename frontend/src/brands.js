// Shared brand resolution for the document watermark — the single source of
// truth used by both the quotation document and the warranty certificate (it
// replaces the two copies of `getDominantBrand` that used to live in each).
//
// The watermark is always the parent brand NAME rendered as faint text (never
// the logo), and the name resolves LIVE from the brand record so renaming a
// brand in Settings updates every document. The per-item snapshot captured at
// add-to-cart time is only a fallback for brands that were since deleted.
//
// Returns the brand to render as the faint background watermark:
//   • 0 brands present  → null            (BrandWatermark falls back to its text)
//   • 1 brand           → { id, name, logo: '' }
//   • 2+ brands         → { name: "A × B", logo: '' }  (combined text watermark)
//
// Brands are ordered by how many line items carry them (most first), ties broken
// by first appearance, so "A × B" lists the dominant brand first.

// Ordered, de-duplicated brands present across a document's line items.
// Each entry: { id, name, logo: '' }. `name` prefers the LIVE brand record,
// falling back to the per-item snapshot only when the brand no longer exists.
export function brandsForItems(items, data) {
  const counts = new Map();
  (items || []).forEach((it, idx) => {
    const cls = data?.classes?.find(c => c.name === it.className);
    const brandId = it.brandId || cls?.brandId;
    if (!brandId) return;
    const name = it.brandName || (data?.brands || []).find(b => b.id === brandId)?.name || '';
    const cur = counts.get(brandId);
    if (cur) cur.count++; else counts.set(brandId, { id: brandId, count: 1, firstIdx: idx, name });
  });
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.firstIdx - b.firstIdx)
    .map(({ id, name }) => {
      const brand = (data?.brands || []).find(b => b.id === id);
      // Live name first (stays in sync with Settings); snapshot only as fallback.
      return { id, name: brand?.name || name || '', logo: '' };
    })
    .filter(b => b.name);
}

// The brand object to hand to <BrandWatermark/>.
export function watermarkBrandForItems(items, data) {
  const brands = brandsForItems(items, data);
  if (brands.length === 0) return null;
  if (brands.length === 1) return brands[0];
  // Multiple brands → combined text watermark "Brand1 × Brand2 (× …)".
  const name = brands.map(b => b.name).filter(Boolean).join(' × ');
  return name ? { name, logo: '' } : brands[0];
}
