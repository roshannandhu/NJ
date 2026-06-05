// Shared brand resolution for the document watermark — the single source of
// truth used by both the quotation document and the warranty certificate (it
// replaces the two copies of `getDominantBrand` that used to live in each).
//
// Returns the brand to render as the faint background watermark:
//   • 0 brands present  → null            (BrandWatermark falls back to its text)
//   • 1 brand           → { id, name, logo }   (logo shown faint if available)
//   • 2+ brands         → { name: "A × B", logo: null }  (combined text watermark)
//
// Brands are ordered by how many line items carry them (most first), ties broken
// by first appearance, so "A × B" lists the dominant brand first.

import { mediaUrl } from './api';

// Ordered, de-duplicated brands present across a document's line items.
// Each entry: { id, name, logo }. `name`/`brandId` prefer the per-item snapshot
// captured at add-to-cart time, falling back to the class + live brand record.
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
      const logo = brand?.logo ? mediaUrl(brand.logo) : '';
      return { id, name: name || brand?.name || '', logo };
    })
    .filter(b => b.name || b.logo);
}

// The brand object to hand to <BrandWatermark/>.
export function watermarkBrandForItems(items, data) {
  const brands = brandsForItems(items, data);
  if (brands.length === 0) return null;
  if (brands.length === 1) return brands[0];
  // Multiple brands → combined text watermark "Brand1 × Brand2 (× …)". No logo,
  // so BrandWatermark renders the names as text.
  const name = brands.map(b => b.name).filter(Boolean).join(' × ');
  return name ? { name, logo: '' } : brands[0];
}
