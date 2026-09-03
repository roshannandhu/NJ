import React from 'react';
import { sanitizeDecimal } from '../numeric';

/**
 * Desktop-friendly numeric input.
 *
 * The old quantity/price fields clamped the value on every keystroke
 * (`Math.max(1, parseInt(e.target.value) || 1)`), which made them impossible to
 * edit freely: clearing the field snapped it back to 1, you couldn't type a
 * value through an intermediate empty/partial state, and select-all + type
 * fought the controlled re-coercion.
 *
 * This component keeps a *local string* while the field is focused, so the user
 * can clear it, select-all, backspace, delete and type any number. It only
 * normalises (parses + clamps) on blur or Enter, then reports the clean number
 * through `onCommit`.
 *
 * DECIMAL FIELDS DO NOT USE `type="number"`.
 * A controlled `<input type="number">` cannot accept a decimal at all: while the
 * user is mid-way through "7.5", the element's value is the string "7.", which
 * is NOT a "valid floating-point number" per the HTML spec, so the browser
 * sanitises `el.value` to "" (verified in Chrome; `validity.badInput` stays
 * false, so it can't even be detected). Feeding that "" back through `value=`
 * wiped the digits the user had already typed the instant they pressed ".", so
 * no decimal price / quantity / discount could ever be entered. `step={1}` made
 * it worse by marking "7.5" `stepMismatch`.
 * So `allowFloat` renders a `type="text"` + `inputMode="decimal"` field (which
 * also gives Android a keypad WITH a decimal key — `inputMode="numeric"` has
 * none) and filters the keystrokes itself. ArrowUp/ArrowDown stepping is
 * re-implemented so those fields keep behaving like number inputs.
 * Integer fields keep the native `type="number"`.
 */
export default function NumberField({
  value,
  onCommit,
  min = 0,
  max,
  step,
  allowFloat = false,
  fallback,            // value to use if left empty/invalid on blur (defaults to min)
  style,
  className,
  // Pulled out of ...rest so the spread can't replace our handler wholesale —
  // we delegate to it instead (Enter-to-blur and arrow stepping must survive a
  // caller supplying its own onKeyDown).
  onKeyDown: callerKeyDown,
  ...rest
}) {
  const [text, setText] = React.useState(value == null ? '' : String(value));
  const [focused, setFocused] = React.useState(false);

  // Keep the displayed text in sync with external value changes (e.g. the +/-
  // stepper buttons) — but never fight the user while they are typing.
  React.useEffect(() => {
    if (!focused) setText(value == null ? '' : String(value));
  }, [value, focused]);

  const clamp = (n) => {
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  };

  // Negatives are only offered where the caller actually allows them (e.g. the
  // price-offset field passes min={null}).
  const allowNegative = min == null || min < 0;
  // Amount one arrow-key press moves. `step="any"` (the decimal default) has no
  // numeric size, so fall back to 1.
  const stepAmount = Number(step) > 0 ? Number(step) : 1;


  const commit = () => {
    const parsed = allowFloat ? parseFloat(text) : parseInt(text, 10);
    let next;
    if (Number.isNaN(parsed)) {
      next = fallback != null ? fallback : (min != null ? min : 0);
    } else {
      next = clamp(parsed);
    }
    setText(String(next));
    if (next !== value) onCommit(next);
    else setText(String(next)); // re-normalise display (e.g. "007" -> "7")
  };

  // Arrow stepping for the text-based decimal field (the native one does its
  // own). toFixed(10) strips the float noise 0.1 + 0.2 would otherwise leave.
  const nudge = (direction) => {
    const current = parseFloat(text);
    const base = Number.isNaN(current) ? (fallback != null ? fallback : (min != null ? min : 0)) : current;
    setText(String(clamp(+(base + direction * stepAmount).toFixed(10))));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.currentTarget.blur(); }
    else if (allowFloat && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      nudge(e.key === 'ArrowUp' ? 1 : -1);
    }
    callerKeyDown?.(e);
  };

  const shared = {
    value: text,
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); commit(); },
    onKeyDown: handleKeyDown,
    style,
    className,
  };

  if (allowFloat) {
    return (
      <input
        type="text"
        inputMode="decimal"
        onChange={(e) => setText(sanitizeDecimal(e.target.value, allowNegative))}
        {...shared}
        {...rest}
      />
    );
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => setText(e.target.value)}
      {...shared}
      {...rest}
    />
  );
}
