import React from 'react';

// ── Brand watermark (faint, centred, behind the document content) ────────────
// Renders a single decent watermark of the product's brand. Logo-only by design:
// a faint grayscale logo (never tiled). If the brand has no logo, falls back to
// the brand name as text; if there is no brand at all, `fallbackText` is used
// (e.g. "WARRANTY" on certificates, "" on quotations → nothing rendered).
// `onError` hides a broken image so it never bakes into the exported PDF.
// Styling comes from the `.wd-wm` / `.wd-wm-logo` rules defined alongside the
// quotation & warranty documents.
export default function BrandWatermark({ brand, fallbackText = '' }) {
  const logo = brand?.logo || '';
  const text = brand?.name || fallbackText;
  if (logo) {
    return (
      <div className="wd-wm" aria-hidden="true">
        <img src={logo} crossOrigin="anonymous" alt="" className="wd-wm-logo"
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </div>
    );
  }
  if (text) return <div className="wd-wm" aria-hidden="true"><span>{text}</span></div>;
  return null;
}
