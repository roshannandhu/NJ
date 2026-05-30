import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import {
  DollarSign, FileText, Sliders, ChevronDown, ChevronUp,
  CheckCircle, AlertCircle, Info, Edit3, Tag, Layers,
  ToggleLeft, ToggleRight, Save, Image as ImageIcon, X
} from 'lucide-react';

// ─── Default per-class Terms from the original NJ PDFs ───────────────────────
const DEFAULT_CLASS_TERMS = {
  laminated: [
    "Payment 50% advance along with the confirmed order. Balance 50% at the time of delivery of materials at your site.",
    "Shingles installation can be started only after 100% of total amount is received.",
    "The quantity mentioned above is approximate.",
    "Quoted rates include GST, transportation and installation.",
    "Transport of materials subject to the arrival of vehicles at your site.",
    "Please make sure the number of shingles boxes is accurate when unloading materials at your site. Subsequent complaints will not be accepted.",
    "When Shingle fixing on top of concrete, the surface provided to us will be duly rendered to a smooth finish, bone dry, clean and uniform base plaster.",
    "It is better to install bitumen membrane on top of fiber cement board before the shingles installation.",
    "The used material quantity is subject to the quantity of Shingle box used for installation.",
  ].join('\n'),
  stone_coated: [
    "Delivery of materials within 60 Working Days from the confirmation of order.",
    "Payment 50% advance, 50% before dispatch of materials.",
    "Transportation will be at your cost. Item should be unloaded by your workers.",
    "This quote is valid only for 20 days.",
    "NJ metal tiles — one piece is 6 sq/ft, one bundle is 12 pieces and 72 sq/ft. Ridge is 6.6 rft, valley is 6.6 rft. If there is overlapping, you may need 15% more for shingles pattern, 20% more for shake pattern.",
    "Prices are inclusive of GST.",
  ].join('\n'),
  heatout: [
    "Payment 30% advance along with the confirmed order. Balance 60% at the time of materials at your site, remaining amount after completion of work.",
    "If any Scaffolding / Crane or other equipment is needed to complete installation, this will be provided by client or rental costs will be charged extra at actuals.",
    "Safe and secure place would be provided on site by client to store products.",
    "Customer would be responsible to provide a free and safe working environment.",
    "Any Labour Union issues / associated costs would be under customer scope.",
    "Cost of MS Section or structure or additional work if required to the ceiling will be charged to Client at actual.",
    "Extra Aluminium Channel approximately measurement.",
    "Will calculate the square feet based on materials usage.",
  ].join('\n'),
  ceramic: [
    "Payment 50% advance along with the confirmed order. Balance 50% at the time of delivery.",
    "The quantity mentioned above is approximate.",
    "Quoted rates include GST and transportation.",
    "Goods once sold will not be returned.",
    "Valid for 30 days from date of issue.",
  ].join('\n'),
  docke: [
    "Payment 50% advance along with the confirmed order. Balance 50% at the time of delivery of materials at your site.",
    "Shingles installation can be started only after 100% of total amount is received.",
    "The quantity mentioned above is approximate.",
    "Quoted rates include GST, transportation and installation.",
    "The used material quantity is subject to the quantity of Shingle box used for installation.",
    "30 years warranty — 10 years free service.",
  ].join('\n'),
  default: [
    "Payment 50% advance along with the confirmed order. Balance 50% at time of delivery.",
    "Valid for 30 days from date of issue.",
    "Goods once sold will not be returned.",
  ].join('\n'),
};

// Default per-class product spec labels used in Table 1
const DEFAULT_CLASS_SPECS = {
  laminated: "NJ PREMIUM LAMINATED SHINGLES\n35 years warranty · 10 years free service",
  stone_coated: "NJ STONE COATED METAL TILES\nOne Bundle : 72 sq/ft — 12 Tiles\nRidge : 1.3 RFT — 1 tile\n50 years Warranty · 10 years free service",
  heatout: "NJ PREMIUM HEAT OUT CEILING\nHigh thermal insulation & ceiling panel technology\n25 years graduated warranty",
  ceramic: "NJ PREMIUM CERAMIC ROOF TILES\n30 years warranty · 10 years free service",
  docke: "DOCKE PIE BITUMEN SHINGLES\n30 years warranty · 10 years free service",
  default: "Standard Roofing Products",
};

// Section helper component
function Section({ icon, title, subtitle, children, accent = '#0284C7' }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--line)', overflow: 'hidden', marginBottom: '24px',
    }}>
      <div style={{
        padding: '20px 28px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: '14px',
        background: `linear-gradient(90deg, ${accent}08, transparent)`,
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: `${accent}18`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '28px' }}>{children}</div>
    </div>
  );
}

// Field wrapper
function Field({ label, hint, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>{hint}</div>}
    </div>
  );
}

// Toggle switch
function Toggle({ checked, onChange, label, desc }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 20px', background: 'var(--bg-warm)', borderRadius: 'var(--radius)',
      border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
      cursor: 'pointer', transition: 'border-color 0.2s',
    }} onClick={() => onChange(!checked)}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>{label}</div>
        {desc && <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '3px' }}>{desc}</div>}
      </div>
      {checked
        ? <ToggleRight size={30} color="var(--accent)" strokeWidth={2} />
        : <ToggleLeft size={30} color="var(--ink-soft)" strokeWidth={2} />
      }
    </div>
  );
}

// Expandable class T&C block
function ClassTermsBlock({ classKey, label, color, value, onChange, specValue, onSpecChange }) {
  const [open, setOpen] = useState(false);

  const inputStyle = {
    padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
    fontSize: '13px', fontFamily: 'var(--font-mono)', lineHeight: '1.7', resize: 'vertical',
    background: 'var(--bg)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      border: `1.5px solid ${open ? color : 'var(--line)'}`,
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', cursor: 'pointer',
          background: open ? `${color}08` : 'var(--surface)',
          transition: 'background 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: color, flexShrink: 0,
          }} />
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{label}</span>
          <span style={{
            fontSize: '11px', fontWeight: 600, color, background: `${color}15`,
            padding: '3px 8px', borderRadius: '20px',
          }}>
            {value.split('\n').filter(l => l.trim()).length} terms
          </span>
        </div>
        {open ? <ChevronUp size={18} color="var(--ink-soft)" /> : <ChevronDown size={18} color="var(--ink-soft)" />}
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '20px', borderTop: `1px solid var(--line)`, background: 'var(--surface)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Product Spec Label */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Table 1 — Product Spec Label
              </label>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '6px' }}>
                Text shown in the "Product Details" table on the printed quotation. Each line = one line in the cell.
              </div>
              <textarea
                rows={4}
                value={specValue}
                onChange={e => onSpecChange(e.target.value)}
                style={inputStyle}
                placeholder="Product name on first line, then specs..."
              />
            </div>

            {/* Terms & Conditions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Terms &amp; Conditions (one per line)
              </label>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '6px' }}>
                Applied automatically when this product class is in the quotation. Each line = numbered bullet.
              </div>
              <textarea
                rows={8}
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{ ...inputStyle, minHeight: '130px' }}
                placeholder="One term per line..."
              />
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginTop: '16px', padding: '14px 18px', background: 'var(--bg-warm)', borderRadius: 'var(--radius)', border: '1px dashed var(--line)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live Preview → Terms will appear as:
            </div>
            <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: '1.8', color: 'var(--ink)' }}>
              {value.split('\n').filter(l => l.trim()).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function QuotationSettings() {
  const { data, setData, showToast, persistConfig } = useAppContext();

  const initSettings = data.settings || {};
  const initCompany  = data.company  || {};

  // Financial settings
  const [settings, setSettings] = useState({
    taxEnabled:        initSettings.taxEnabled        ?? true,
    taxRate:           initSettings.taxRate           ?? 18,
    discountEnabled:   initSettings.discountEnabled   ?? false,
    discountRate:      initSettings.discountRate      ?? 0,
    discountType:      initSettings.discountType      ?? 'percent',
    quotationPrefix:   initSettings.quotationPrefix   ?? 'NJ-Q',
    warrantyPrefix:    initSettings.warrantyPrefix    ?? 'NJ-W',
    validityDays:      initSettings.validityDays      ?? 20,
    currencySymbol:    initSettings.currencySymbol    ?? '₹',
    bankDetails:       initSettings.bankDetails       ?? '',
    footerNote:        initSettings.footerNote        ?? 'Generated via NJ Quotation System',
    showProductImage:  initSettings.showProductImage  ?? true,
    showClassSpecBox:  initSettings.showClassSpecBox  ?? true,
    quotationLogo:     initSettings.quotationLogo     ?? '',
  });

  // Per-class T&C
  const [classTerms, setClassTerms] = useState({
    laminated:    initSettings.classTerms?.laminated    ?? DEFAULT_CLASS_TERMS.laminated,
    stone_coated: initSettings.classTerms?.stone_coated ?? DEFAULT_CLASS_TERMS.stone_coated,
    heatout:      initSettings.classTerms?.heatout      ?? DEFAULT_CLASS_TERMS.heatout,
    ceramic:      initSettings.classTerms?.ceramic      ?? DEFAULT_CLASS_TERMS.ceramic,
    docke:        initSettings.classTerms?.docke        ?? DEFAULT_CLASS_TERMS.docke,
    default:      initSettings.classTerms?.default      ?? DEFAULT_CLASS_TERMS.default,
  });

  // Per-class product spec labels
  const [classSpecs, setClassSpecs] = useState({
    laminated:    initSettings.classSpecs?.laminated    ?? DEFAULT_CLASS_SPECS.laminated,
    stone_coated: initSettings.classSpecs?.stone_coated ?? DEFAULT_CLASS_SPECS.stone_coated,
    heatout:      initSettings.classSpecs?.heatout      ?? DEFAULT_CLASS_SPECS.heatout,
    ceramic:      initSettings.classSpecs?.ceramic      ?? DEFAULT_CLASS_SPECS.ceramic,
    docke:        initSettings.classSpecs?.docke        ?? DEFAULT_CLASS_SPECS.docke,
    default:      initSettings.classSpecs?.default      ?? DEFAULT_CLASS_SPECS.default,
  });

  const [saved, setSaved] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setSettings(s => ({ ...s, quotationLogo: reader.result }));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = () => {
    const nextData = {
      ...data,
      settings: {
        ...data.settings,
        ...settings,
        classTerms,
        classSpecs,
      },
    };
    setData(nextData);
    persistConfig(nextData);
    setSaved(true);
    showToast('Quotation settings saved ✓');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = (classKey) => {
    setClassTerms(prev => ({ ...prev, [classKey]: DEFAULT_CLASS_TERMS[classKey] }));
    setClassSpecs(prev => ({ ...prev, [classKey]: DEFAULT_CLASS_SPECS[classKey] }));
    showToast(`Reset ${classKey} to PDF defaults`);
  };

  const inputStyle = {
    padding: '13px 16px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
    fontSize: '14px', background: 'var(--bg)', color: 'var(--ink)', width: '100%',
    boxSizing: 'border-box', transition: 'border-color 0.2s',
  };

  const classBlocks = [
    { key: 'laminated',    label: 'NJ Premium Laminated (Asphalt Shingles)', color: '#6e3f32' },
    { key: 'stone_coated', label: 'NJ Stone Coated (Metal Tiles)',            color: '#4b4b4b' },
    { key: 'heatout',      label: 'Heatout (Insulated Ceilings)',             color: '#4f755a' },
    { key: 'ceramic',      label: 'NJ Premium Ceramic (Clay Tiles)',          color: '#b95c3a' },
    { key: 'docke',        label: 'Docke PIE (Bitumen Shingles)',             color: '#3a506b' },
    { key: 'default',      label: 'Default / Mixed Orders (Fallback)',        color: '#8a857a' },
  ];

  return (
    <div className="animate-fade-up" style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* ── Section 1: Financial Rules ── */}
      <Section
        icon={<DollarSign size={20} />}
        title="Financial Rules"
        subtitle="Tax, currency, validity and document prefix settings"
        accent="#0284C7"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* GST Toggle */}
          <Field label="GST / Tax" span={2}>
            <Toggle
              checked={settings.taxEnabled}
              onChange={v => setSettings(s => ({ ...s, taxEnabled: v }))}
              label="Enable GST / Tax System"
              desc="Appends a tax row (Subtotal → GST → Grand Total) to every quotation"
            />
            {settings.taxEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <Field label="Default Tax Rate (%)">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={settings.taxRate}
                    onChange={e => setSettings(s => ({ ...s, taxRate: parseFloat(e.target.value) || 0 }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Currency Symbol">
                  <input
                    value={settings.currencySymbol}
                    onChange={e => setSettings(s => ({ ...s, currencySymbol: e.target.value }))}
                    style={{ ...inputStyle, width: '80px' }}
                    maxLength={3}
                  />
                </Field>
              </div>
            )}
          </Field>

          {/* Discount */}
          <Field label="Discount" span={2}>
            <Toggle
              checked={settings.discountEnabled}
              onChange={v => setSettings(s => ({ ...s, discountEnabled: v }))}
              label="Allow Discount Field at Checkout"
              desc="Enables a discount toggle on the checkout page. Cashier can apply or skip per order."
            />
            {settings.discountEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <Field label="Default Discount Type">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[{ v: 'percent', label: '% Percentage' }, { v: 'fixed', label: `${settings.currencySymbol || '₹'} Fixed Amount` }].map(opt => (
                      <button
                        key={opt.v}
                        onClick={() => setSettings(s => ({ ...s, discountType: opt.v }))}
                        style={{
                          flex: 1, padding: '10px 12px', border: `1.5px solid ${settings.discountType === opt.v ? 'var(--accent)' : 'var(--line)'}`,
                          borderRadius: 'var(--radius)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                          background: settings.discountType === opt.v ? 'var(--accent-soft)' : 'var(--bg)',
                          color: settings.discountType === opt.v ? 'var(--accent-deep)' : 'var(--ink-soft)',
                          transition: 'all 0.2s',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field
                  label={settings.discountType === 'percent' ? 'Default Discount Rate (%)' : `Default Discount Amount (${settings.currencySymbol || '₹'})`}
                  hint="Pre-fills the discount field on checkout. Cashier can change it per order."
                >
                  <input
                    type="number" min="0"
                    max={settings.discountType === 'percent' ? 100 : undefined}
                    step={settings.discountType === 'percent' ? 0.5 : 1}
                    value={settings.discountRate}
                    onChange={e => setSettings(s => ({ ...s, discountRate: parseFloat(e.target.value) || 0 }))}
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}
          </Field>

          {/* Document Numbers */}
          <Field label="Quotation Prefix" hint="e.g. NJ-Q → document becomes NJ-Q-001">
            <input
              value={settings.quotationPrefix}
              onChange={e => setSettings(s => ({ ...s, quotationPrefix: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Warranty Prefix" hint="e.g. NJ-W → warranty becomes NJ-W-001">
            <input
              value={settings.warrantyPrefix}
              onChange={e => setSettings(s => ({ ...s, warrantyPrefix: e.target.value }))}
              style={inputStyle}
            />
          </Field>

          <Field label="Quotation Validity (Days)" hint="Shown at the bottom of every printed document">
            <input
              type="number" min="1"
              value={settings.validityDays}
              onChange={e => setSettings(s => ({ ...s, validityDays: parseInt(e.target.value) || 30 }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Currency Symbol" hint="Displayed before all price figures">
            <input
              value={settings.currencySymbol}
              onChange={e => setSettings(s => ({ ...s, currencySymbol: e.target.value }))}
              style={inputStyle} maxLength={5}
            />
          </Field>

        </div>
      </Section>

      {/* ── Section 2: Document Layout Options ── */}
      <Section
        icon={<Sliders size={20} />}
        title="Document Layout Options"
        subtitle="Control what elements appear on the printed quotation"
        accent="#7C3AED"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label="Quotation Top-Left Logo" hint="This image replaces the default NJ mark on printed quotations.">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <label
                className="hover-lift"
                style={{
                  width: '140px',
                  height: '96px',
                  border: '1.5px dashed var(--line)',
                  borderRadius: 'var(--radius)',
                  background: settings.quotationLogo
                    ? `url(${settings.quotationLogo}) center/contain no-repeat #FFFFFF`
                    : '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  color: 'var(--ink-soft)',
                  boxSizing: 'border-box',
                }}
              >
                {!settings.quotationLogo && (
                  <>
                    <ImageIcon size={22} />
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>Upload Logo</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
              </label>

              {settings.quotationLogo && (
                <button
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, quotationLogo: '' }))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--surface)',
                    color: 'var(--red)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} /> Remove Logo
                </button>
              )}
            </div>
          </Field>

          <Toggle
            checked={settings.showClassSpecBox}
            onChange={v => setSettings(s => ({ ...s, showClassSpecBox: v }))}
            label="Show Table 1 — Product Details with Image"
            desc="The top table showing product class name, specs, and product image before the line items"
          />
          <Toggle
            checked={settings.showProductImage}
            onChange={v => setSettings(s => ({ ...s, showProductImage: v }))}
            label="Show Product Image in Table 1"
            desc="Include product thumbnail in the right column of the product details table"
          />
        </div>

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label="Document Footer Note" hint="Appears at bottom-right of every printed document">
            <input
              value={settings.footerNote}
              onChange={e => setSettings(s => ({ ...s, footerNote: e.target.value }))}
              style={inputStyle}
              placeholder="e.g. Generated via NJ Quotation System"
            />
          </Field>
          <Field label="Bank Details &amp; Payment Instructions" hint="Optional — will be shown below the totals table if filled">
            <textarea
              rows={3}
              value={settings.bankDetails}
              onChange={e => setSettings(s => ({ ...s, bankDetails: e.target.value }))}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', lineHeight: '1.7' }}
              placeholder="Account Name: NJ India Trading Pvt Ltd&#10;Account No: XXXXXXXXXX&#10;IFSC: XXXXXXXX"
            />
          </Field>
        </div>
      </Section>

      {/* ── Section 3: Per-Class T&C + Spec Labels ── */}
      <Section
        icon={<FileText size={20} />}
        title="Per-Class Terms, Conditions &amp; Product Specs"
        subtitle="Each product class has its own Terms &amp; Conditions pulled from the original NJ quotation PDFs. Edit or expand them here. The matching class's T&C is auto-selected when generating a quotation."
        accent="#059669"
      >
        {/* Info box */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          padding: '14px 18px', marginBottom: '20px',
          background: '#0284C710', border: '1px solid #0284C730',
          borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--ink)',
        }}>
          <Info size={16} color="#0284C7" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong>How class matching works:</strong> When generating a quotation, the system checks each product's class. If items from <em>Laminated</em> class are present → uses Laminated terms. If <em>Stone Coated</em> is present → Stone Coated terms take priority for mixed orders with heatout. If no match, falls back to the <strong>Default</strong> block below.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {classBlocks.map(({ key, label, color }) => (
            <div key={key}>
              <ClassTermsBlock
                classKey={key}
                label={label}
                color={color}
                value={classTerms[key]}
                onChange={val => setClassTerms(prev => ({ ...prev, [key]: val }))}
                specValue={classSpecs[key]}
                onSpecChange={val => setClassSpecs(prev => ({ ...prev, [key]: val }))}
              />
              {/* Reset to PDF defaults link */}
              <div style={{ textAlign: 'right', marginTop: '4px' }}>
                <button
                  onClick={() => handleReset(key)}
                  style={{
                    background: 'none', border: 'none', color: color,
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    textDecoration: 'underline', padding: '2px 4px',
                    opacity: 0.8,
                  }}
                >
                  ↺ Reset to original PDF defaults
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Save Button ── */}
      <div style={{
        position: 'sticky', bottom: '24px', zIndex: 10,
        display: 'flex', justifyContent: 'flex-end', marginTop: '8px',
      }}>
        <button
          onClick={handleSave}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '16px 36px', fontSize: '15px', fontWeight: 700,
            background: saved ? '#059669' : 'var(--ink)',
            color: 'white', border: 'none',
            borderRadius: 'var(--radius-full)', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            transition: 'background 0.3s, transform 0.15s',
            transform: 'translateY(0)',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          {saved ? <CheckCircle size={18} /> : <Save size={18} />}
          {saved ? 'Saved!' : 'Save All Quotation Settings'}
        </button>
      </div>
    </div>
  );
}
