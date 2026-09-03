// Run: node src/numeric.test.mjs
// Guards decimal entry in quotation quantity / price fields. The regression this
// protects against: a controlled <input type="number"> wipes the field the
// moment "." is pressed, so no fractional quantity (7.5 sqft) could be typed.
import assert from 'node:assert';
import { sanitizeDecimal } from './numeric.js';

// The critical case: every intermediate state of typing "7.5" must survive.
assert.equal(sanitizeDecimal('7'), '7');
assert.equal(sanitizeDecimal('7.'), '7.');      // must NOT collapse to '' or '7'
assert.equal(sanitizeDecimal('7.5'), '7.5');
assert.equal(sanitizeDecimal('12.25'), '12.25');

// Leading / trailing dots are legal mid-typing; parseFloat handles them on commit.
assert.equal(sanitizeDecimal('.'), '.');
assert.equal(sanitizeDecimal('.5'), '.5');

// Only the FIRST decimal point survives, so "7.5.3" can't produce NaN on commit.
assert.equal(sanitizeDecimal('7.5.3'), '7.53');
assert.equal(sanitizeDecimal('1.2.3.4'), '1.234');

// Letters and symbols are dropped rather than silently becoming 0 on blur.
assert.equal(sanitizeDecimal('7a.5b'), '7.5');
assert.equal(sanitizeDecimal('abc'), '');
assert.equal(sanitizeDecimal('₹1,250.50'), '1250.50');

// Negatives only where the caller allows them (the price-offset field does).
assert.equal(sanitizeDecimal('-5.5', true), '-5.5');
assert.equal(sanitizeDecimal('-5.5', false), '5.5');
assert.equal(sanitizeDecimal('5-5', true), '55');   // minus only leads
assert.equal(sanitizeDecimal('--5', true), '-5');

// Empty / non-string input must not throw — the field starts empty.
assert.equal(sanitizeDecimal(''), '');
assert.equal(sanitizeDecimal(0), '0');

// What the field commits: parseFloat of a sanitized string is always a number
// (or NaN only for genuinely empty input, which callers map to their fallback).
assert.equal(parseFloat(sanitizeDecimal('7.5')), 7.5);
assert.ok(Number.isNaN(parseFloat(sanitizeDecimal('abc'))));

console.log('numeric: decimal entry OK');
