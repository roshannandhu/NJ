// Run: node src/brands.test.mjs
// Guards the rule that keeps NJ's legacy text off other brands' documents:
// a HIGHLANDER class named "STONECOATED" must not inherit NJ's spec text,
// NJ's 50-year warranty line, or NJ's warranty certificate template.
import assert from 'node:assert';
import { isLegacyBrandClass, legacyClassKey, companyProfileForBrand, warrantyIdentityForBrand } from './brands.js';

const data = {
  brands: [{ id: 'nj', name: 'NJ INDIA' }, { id: 'brand_hl', name: 'HIGHLANDER' }],
  classes: [
    { id: 'c4', name: 'NJ Stone Coated', brandId: 'nj' },
    { id: 'cls_hl_sc', name: 'STONECOATED', brandId: 'brand_hl' },
    { id: 'cls_hl_ms', name: 'METAL SERIES', brandId: 'brand_hl' },
  ],
};

// NJ's own class keeps the legacy keyword bucket.
assert.equal(isLegacyBrandClass('NJ Stone Coated', [], data), true);

// Highlander classes never do — both the "stone" and the "metal" keyword traps.
assert.equal(isLegacyBrandClass('STONECOATED', [], data), false);
assert.equal(isLegacyBrandClass('METAL SERIES', [], data), false);

// A deleted/renamed class still resolves from the item's add-time brand snapshot.
const deleted = [{ className: 'OLD HL TILES', brandId: 'brand_hl' }];
assert.equal(isLegacyBrandClass('OLD HL TILES', deleted, data), false);

// The item snapshot wins over a class that was since re-parented.
const reparented = [{ className: 'NJ Stone Coated', brandId: 'brand_hl' }];
assert.equal(isLegacyBrandClass('NJ Stone Coated', reparented, data), false);

// Unknown/unbranded class: treated as legacy so single-brand catalogs keep working.
assert.equal(isLegacyBrandClass('Something Else', [], data), true);
assert.equal(isLegacyBrandClass('anything', [], { brands: [], classes: [] }), true);

// ── Company profile: NJ's details must never print on another brand ──────────
// Regression: an unrelated commit dropped the `data.company` fallback here, so
// the seeded "nj" brand (which carries a name and nothing else) printed a bare
// "NJ" header with no address and no contact row.
const profileData = {
  company: { name: 'NJ India Trading Pvt. Ltd.', address: 'KNH Building', phone: '+91 73566 08633', website: 'www.njindia.in' },
  brands: [{ id: 'nj', name: 'NJ' }, { id: 'brand_hl', name: 'HIGHLANDER', phone: '+91 99999 00000' }],
};

// NJ inherits the company details, and the legal entity leads over the label.
const njProfile = companyProfileForBrand(profileData.brands[0], profileData);
assert.equal(njProfile.name, 'NJ India Trading Pvt. Ltd.');
assert.equal(njProfile.address, 'KNH Building');
assert.equal(njProfile.phone, '+91 73566 08633');

// Highlander gets ONLY its own fields — no NJ name, address or phone.
const hlProfile = companyProfileForBrand(profileData.brands[1], profileData);
assert.equal(hlProfile.name, 'HIGHLANDER');
assert.equal(hlProfile.address, '');
assert.equal(hlProfile.phone, '+91 99999 00000');
assert.ok(!JSON.stringify(hlProfile).includes('NJ'), 'no NJ data may reach a non-NJ brand');

// No resolvable brand → the global fallback, flagged so the document knows.
const noBrand = companyProfileForBrand(null, profileData);
assert.equal(noBrand.isGlobalFallback, true);
assert.equal(noBrand.name, 'NJ India Trading Pvt. Ltd.');
assert.equal(companyProfileForBrand(profileData.brands[0], profileData).isGlobalFallback, false);

// ── Warranty certificates: NJ's entity and seal must not reach other brands ──
// Regression: the "Trading Organization" row hardcoded NJ's legal entity and the
// drawn fallback seal (whose artwork names that entity and NJ's address) was
// used unconditionally, so a Highlander certificate carried both.
const njW = warrantyIdentityForBrand(profileData.brands[0], profileData);
assert.equal(njW.tradingOrg, 'NOUFAL & JABBAR INTERNATIONAL LLP');
assert.equal(njW.isLegacyBrand, true);   // NJ may use the drawn seal

const hlW = warrantyIdentityForBrand(profileData.brands[1], profileData);
assert.equal(hlW.tradingOrg, 'HIGHLANDER');
assert.equal(hlW.isLegacyBrand, false);  // gates the drawn NJ seal off
assert.ok(!hlW.tradingOrg.includes('NOUFAL'), 'NJ entity must not reach another brand');

// No resolvable brand keeps NJ's entity (single-brand catalogues still work).
assert.equal(warrantyIdentityForBrand(null, profileData).isLegacyBrand, true);

// An unnamed non-NJ brand prints NOTHING rather than falling back to NJ.
assert.equal(warrantyIdentityForBrand({ id: 'x', name: '' }, profileData).tradingOrg, '');

// ── Legacy keyword bucket: Settings and the document must agree ──────────
// Regression: Settings read the class description by class.id only while the
// quotation fell back to these buckets, so the edit box looked empty and the
// printed text ("NJ STONE COATED METAL TILES / 50 years Warranty") had no
// editable source. Both sides now resolve the bucket through legacyClassKey.
assert.equal(legacyClassKey('NJ Stone Coated', [], data), 'stone_coated');
assert.equal(legacyClassKey('NJ PREMIUM ASPHALT SHINGLES', [], data), 'laminated');
assert.equal(legacyClassKey('Mazarron clay roof tiles', [], data), 'ceramic');
assert.equal(legacyClassKey('Anything Else', [], data), 'default');

// …and no bucket at all for another brand's class, whatever it is named.
assert.equal(legacyClassKey('STONECOATED', [], data), null);
assert.equal(legacyClassKey('METAL SERIES', [], data), null);
assert.equal(legacyClassKey('NJ Stone Coated', [{ className: 'NJ Stone Coated', brandId: 'brand_hl' }], data), null);

// What Settings shows must be what the quotation prints, for both key shapes.
const specData = { ...data, settings: { classSpecs: { stone_coated: 'NJ STONE COATED METAL TILES', c4: 'EDITED BY ID' } } };
const specFor = (name) => {
  const cls = specData.classes.find(c => c.name === name);
  const specs = specData.settings.classSpecs;
  const kw = legacyClassKey(name, [], specData);
  return specs[cls.id] ?? (kw ? specs[kw] : undefined) ?? '';
};
assert.ok(specFor('NJ Stone Coated').startsWith('EDITED BY ID'));   // id wins
assert.equal(specFor('STONECOATED'), '');                            // Highlander inherits nothing
const legacyOnly = { ...specData, settings: { classSpecs: { stone_coated: 'NJ STONE COATED METAL TILES' } } };
assert.equal(
  legacyOnly.settings.classSpecs[legacyClassKey('NJ Stone Coated', [], legacyOnly)],
  'NJ STONE COATED METAL TILES',  // the box is no longer empty while the PDF prints this
);

console.log('brands: legacy-brand gating + company-profile + warranty-identity isolation OK');
console.log('brands: legacy keyword buckets shared by Settings and the quotation OK');
