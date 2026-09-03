// Shared numeric-input parsing.
//
// Lives in its own plain-JS module (not inside NumberField.jsx) so it can be
// imported by every decimal-capable field AND exercised directly by
// numeric.test.mjs without a JSX transform.

/**
 * Keep only what can still GROW INTO a number: digits, at most one decimal
 * point, and a single leading minus when negatives are allowed.
 *
 * Applied per keystroke so an in-progress "7." survives. This exists because a
 * CONTROLLED `<input type="number">` cannot hold "7." at all: that string is not
 * a "valid floating-point number" per the HTML spec, so the browser sanitises
 * `el.value` to "" and the digits already typed are wiped the instant the user
 * presses ".". Every decimal field therefore runs on a `type="text"` input and
 * filters its own keystrokes through this function.
 */
export function sanitizeDecimal(raw, allowNegative = false) {
  let s = String(raw).replace(/[^0-9.-]/g, '');
  const negative = allowNegative && s.startsWith('-');
  s = s.replace(/-/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  return (negative ? '-' : '') + s;
}
