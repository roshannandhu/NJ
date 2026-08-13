// Run: node src/brands.test.mjs
// Guards the rule that keeps NJ's legacy text off other brands' documents:
// a HIGHLANDER class named "STONECOATED" must not inherit NJ's spec text,
// NJ's 50-year warranty line, or NJ's warranty certificate template.
import assert from 'node:assert';
import { isLegacyBrandClass } from './brands.js';

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

console.log('brands: legacy-brand gating OK');
