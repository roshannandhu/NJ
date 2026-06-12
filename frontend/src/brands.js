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

// Tools & accessories are conceptually BRANDLESS, but legacy data stamps them
// with a brand anyway (the default tools class carries brandId "nj", and items
// added before the fix snapshotted a fallback brandId). So a tool is identified
// by its CLASS TYPE, never by a missing brandId; the null-brandId check only
// covers tool items whose class was since renamed or deleted.
export function isToolItem(item, data) {
  const cls = data?.classes?.find(c => c.name === item.className);
  if (cls) return cls.type === 'tools';
  return item.brandId === null;
}

// Ordered, de-duplicated brands present across a document's line items.
// Each entry: { id, name, logo: '' }. `name` prefers the LIVE brand record,
// falling back to the per-item snapshot only when the brand no longer exists.
// Tool items never contribute a brand (see isToolItem).
export function brandsForItems(items, data) {
  const counts = new Map();
  (items || []).forEach((it, idx) => {
    if (isToolItem(it, data)) return;
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

// The PARENT BRAND that owns a quotation — the single source of truth for the
// document's header/footer branding. A quotation is locked to one brand at the
// cart level (addToCart rejects cross-brand items), so normally exactly one
// brand resolves; legacy mixed-brand quotations resolve to the dominant brand
// (same ordering brandsForItems uses for the watermark).
// Returns the FULL LIVE brand record (so renames and profile edits update every
// document), a { id, name } snapshot stub when the brand was deleted, or null
// for tools-only / empty item lists.
export function resolveQuotationBrand(items, data) {
  const top = brandsForItems(items, data)[0];
  if (!top) return null;
  const live = (data?.brands || []).find(b => b.id === top.id);
  return live || { id: top.id, name: top.name };
}

// Document-number prefixes for a brand. `brand.docPrefix` (Settings → Parent
// Brands, e.g. "HL") brands the quotation/warranty numbers (HL-Q-…, HL-W-…).
// A non-NJ brand WITHOUT a configured prefix derives one from its name (word
// initials, or the first two letters of a single-word name) so its documents
// are never numbered as NJ by accident; the Settings field stays the override.
// The NJ brand and the no-brand case use the global Settings prefixes.
export function docPrefixesForBrand(brand, settings) {
  let p = (brand?.docPrefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p && brand && brand.id !== 'nj') {
    const words = String(brand.name || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
    p = words.length >= 2 ? words.map(w => w[0]).join('').slice(0, 4) : (words[0] || '').slice(0, 2);
  }
  return {
    quotation: p ? `${p}-Q` : (settings?.quotationPrefix || 'NJ-Q'),
    warranty:  p ? `${p}-W` : (settings?.warrantyPrefix || 'NJ-W'),
  };
}

// The company profile a quotation should print for its parent brand.
// Returns { name, address, phone, email, gst, website, logo, isGlobalFallback }.
//   • no brand          → the global Settings → Company Profile (NJ). The only
//                         path where the document may show NJ data by default.
//   • the "nj" brand    → per-field fallback to the global profile (the NJ
//                         brand IS the company, so empty fields inherit).
//   • any other brand   → ONLY that brand's own fields — never NJ data.
export function companyProfileForBrand(brand, data) {
  const company = data?.company || {};
  if (!brand) {
    return {
      name: company.name || '', address: company.address || '', phone: company.phone || '',
      email: company.email || '', gst: company.gst || '', website: company.website || '',
      logo: '', isGlobalFallback: true,
    };
  }
  const fromCompany = brand.id === 'nj';
  const pick = (field) => brand[field] || (fromCompany ? company[field] : '') || '';
  return {
    name: fromCompany ? (company.name || brand.name || '') : (brand.name || ''),
    address: pick('address'), phone: pick('phone'), email: pick('email'),
    gst: pick('gst'), website: pick('website'),
    logo: brand.logo || '', isGlobalFallback: false,
  };
}
