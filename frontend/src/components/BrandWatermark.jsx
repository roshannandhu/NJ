
// ── Brand watermark (faint, centred, behind the document content) ────────────
// Renders the parent brand NAME as a single faint text watermark — text-only by
// design so the watermark always mirrors the brand name in Settings (renaming a
// brand updates every document; logos are never used here). If there is no
// brand at all, `fallbackText` is used (e.g. "WARRANTY" on certificates, "" on
// quotations → nothing rendered).
// Styling comes from the `.wd-wm` rules defined alongside the quotation &
// warranty documents.
export default function BrandWatermark({ brand, fallbackText = '' }) {
  const text = brand?.name || fallbackText;
  if (text) return <div className="wd-wm" aria-hidden="true"><span>{text}</span></div>;
  return null;
}
