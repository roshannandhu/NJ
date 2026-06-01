import React from 'react';

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
 * through `onCommit`. Arrow keys and the mouse wheel keep working because it is
 * still a native `<input type="number">`.
 */
export default function NumberField({
  value,
  onCommit,
  min = 0,
  max,
  step = 1,
  allowFloat = false,
  fallback,            // value to use if left empty/invalid on blur (defaults to min)
  style,
  className,
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

  return (
    <input
      type="number"
      inputMode={allowFloat ? 'decimal' : 'numeric'}
      value={text}
      min={min}
      max={max}
      step={step}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.currentTarget.blur(); }
        rest.onKeyDown?.(e);
      }}
      style={style}
      className={className}
      {...rest}
    />
  );
}
