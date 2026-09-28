// Is `remote` a newer build than `local`? Dotted numeric compare ("1.1.10" >
// "1.1.9", which a string compare gets wrong).
//
// The updater used a plain `!==`, so ANY mismatch counted as an update —
// including a server reporting an OLDER version (a rolled-back deploy, or the
// backend's 1.0.0 fallback when version.json is missing next to main.py). On
// desktop "Update Now" hands that URL straight to the silent installer, so a
// 1.1.7 machine would quietly install 1.0.0 over itself.
//
// Anything unparseable answers false: never offer, never downgrade.
export function isNewerVersion(remote, local) {
  const parts = (v) => String(v ?? '').trim().split('.').map(n => parseInt(n, 10));
  const a = parts(remote), b = parts(local);
  if (!a.length || a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
