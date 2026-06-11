import { useState } from 'react';
import { useAppContext } from '../AppContext';
import {
  DollarSign, FileText, Sliders,
  CheckCircle, Tag, Layers,
  ToggleLeft, ToggleRight, Save, Image as ImageIcon, X, Trash2, Star
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

// Section helper component
function Section({ icon, title, subtitle, children }) {
  // Unified premium card — one terracotta accent for every section.
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--line)', overflow: 'hidden', marginBottom: '22px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        padding: '18px 24px', borderBottom: '1px solid var(--line-soft)',
        display: 'flex', alignItems: 'center', gap: '13px',
        background: 'linear-gradient(90deg, var(--accent-soft), transparent 70%)',
      }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px',
          background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '24px' }}>{children}</div>
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

// (Per-class Class Description + Installation Guidance editing moved to
//  Products & Catalog → class → Edit. See ProductsClassesSettings.jsx.)

// A single editable bank-account card (CHANGE 4).
function BankCard({ bank, index, total, onChange, onRemove, onMove, onImage, onSetDefault }) {
  const fieldStyle = {
    padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
    fontSize: '13px', background: 'var(--bg)', color: 'var(--ink)', width: '100%',
    boxSizing: 'border-box', transition: 'border-color 0.2s',
  };
  const labelStyle = { fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const fields = [
    { key: 'bankName', label: 'Bank Name', ph: 'e.g. HDFC Bank' },
    { key: 'accountName', label: 'Account Name', ph: 'e.g. NJ India Trading Pvt Ltd' },
    { key: 'accountNumber', label: 'Account Number', ph: 'e.g. 50200012345678' },
    { key: 'ifsc', label: 'IFSC / SWIFT', ph: 'e.g. HDFC0001234' },
    { key: 'branch', label: 'Branch', ph: 'e.g. Ramanattukara' },
    { key: 'upiId', label: 'UPI ID', ph: 'e.g. njindia@hdfcbank' },
  ];

  const renderImageSlot = (field, label) => (
    <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label
          className="hover-lift"
          style={{
            width: '72px', height: '72px', borderRadius: 'var(--radius)', cursor: 'pointer',
            border: '1.5px dashed var(--line)', boxSizing: 'border-box',
            background: bank[field] ? `url(${bank[field]}) center/contain no-repeat #FFFFFF` : '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)',
          }}
        >
          {!bank[field] && <ImageIcon size={18} />}
          <input type="file" accept="image/*" onChange={e => onImage(field, e)} style={{ display: 'none' }} />
        </label>
        {bank[field] && (
          <button
            type="button"
            onClick={() => onChange(field, '')}
            style={{ background: 'transparent', border: 'none', color: 'var(--red)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{
      border: `1.5px solid ${bank.active ? 'var(--line)' : 'var(--line-soft)'}`,
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      opacity: bank.active ? 1 : 0.7, background: 'var(--surface)',
    }}>
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-warm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Tag size={15} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
            {bank.bankName || `Bank ${index + 1}`}
          </span>
          {!bank.active && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid var(--line)', borderRadius: '20px', padding: '2px 8px' }}>
              Inactive
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => onMove(-1)} disabled={index === 0}
            style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', color: 'var(--ink-soft)', opacity: index === 0 ? 0.4 : 1, fontSize: '14px', padding: '2px 6px' }} title="Move up">↑</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1}
            style={{ background: 'transparent', border: 'none', cursor: index === total - 1 ? 'not-allowed' : 'pointer', color: 'var(--ink-soft)', opacity: index === total - 1 ? 0.4 : 1, fontSize: '14px', padding: '2px 6px' }} title="Move down">↓</button>
          <button onClick={onRemove}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: 'var(--red)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }} title="Remove bank">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {fields.map(f => (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={labelStyle}>{f.label}</span>
              <input
                value={bank[f.key] || ''}
                onChange={e => onChange(f.key, e.target.value)}
                style={fieldStyle}
                placeholder={f.ph}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', marginTop: '18px', flexWrap: 'wrap' }}>
          {renderImageSlot('logo', 'Bank Logo')}
          {renderImageSlot('qr', 'QR Image (optional)')}
          {/* Default account — preselected at checkout. Only one bank is default. */}
          <button
            type="button"
            onClick={() => onSetDefault()}
            disabled={bank.default}
            title={bank.default ? 'This is the default bank' : 'Use this bank by default on new quotations'}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: bank.default ? 'default' : 'pointer', marginLeft: 'auto', paddingBottom: '4px', background: 'transparent', border: 'none', fontWeight: 700, fontSize: '12.5px', color: bank.default ? 'var(--accent)' : 'var(--ink-soft)' }}
          >
            <Star size={16} fill={bank.default ? 'var(--accent)' : 'none'} color={bank.default ? 'var(--accent)' : 'var(--ink-soft)'} strokeWidth={2} />
            {bank.default ? 'Default' : 'Set default'}
          </button>
          <div
            onClick={() => onChange('active', !bank.active)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', paddingBottom: '4px' }}
          >
            {bank.active
              ? <ToggleRight size={28} color="var(--accent)" strokeWidth={2} />
              : <ToggleLeft size={28} color="var(--ink-soft)" strokeWidth={2} />}
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              {bank.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function QuotationSettings() {
  const { data, setData, showToast, persistConfig } = useAppContext();

  const initSettings = data.settings || {};

  // Maps a class name to the legacy keyword key — used ONLY to seed defaults and
  // to backfill existing keyword-keyed configs when migrating to id-keying.
  const keywordKey = (name) => {
    const n = (name || '').toLowerCase();
    if (n.includes('laminated') || n.includes('asphalt')) return 'laminated';
    if (n.includes('stone') || n.includes('metal')) return 'stone_coated';
    if (n.includes('heat') || n.includes('ceiling')) return 'heatout';
    if (n.includes('ceramic') || n.includes('clay')) return 'ceramic';
    if (n.includes('pie') || n.includes('bitumen') || n.includes('docke')) return 'docke';
    return 'default';
  };

  // Per-class blocks are derived from the live class list (keyed by stable
  // class.id) so any class added in Products & Catalog shows up here automatically,
  // plus a synthetic Default/fallback block. Tools & Accessories classes are excluded
  // (they carry no product spec / class description on the quotation).
  const isToolsClass = (c) => c.type === 'tools' || /tool|accessor/i.test(c.name || '');
  const classBlocks = [
    ...(data.classes || [])
      .filter(c => !isToolsClass(c))
      .map(c => ({ key: c.id, label: c.name, color: c.color || '#8a857a', name: c.name })),
    { key: 'default', label: 'Default / Mixed Orders (Fallback)', color: '#8a857a', name: '' },
  ];

  // Seed a block's value: saved-by-id → saved-by-keyword → keyword default → generic default.
  const seedTerms = (key, name) =>
    initSettings.classTerms?.[key] ?? initSettings.classTerms?.[keywordKey(name)] ?? DEFAULT_CLASS_TERMS[keywordKey(name)] ?? DEFAULT_CLASS_TERMS.default;

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
    watermarkEnabled:  initSettings.watermarkEnabled  ?? true,
    quotationLogo:     initSettings.quotationLogo     ?? '',
    // Single common Terms & Conditions applied to every NEW quotation. Seeded from any
    // existing default-class terms (or the PDF default) so it is never empty on first load.
    commonTerms:       initSettings.commonTerms       ?? initSettings.classTerms?.default ?? DEFAULT_CLASS_TERMS.default,
  });

  // Multiple bank accounts (CHANGE 4). Each: { id, bankName, accountName, accountNumber,
  // ifsc, branch, upiId, logo, qr, order, active }. Defaults to [] for older configs.
  const [banks, setBanks] = useState(() =>
    Array.isArray(initSettings.banks)
      ? [...initSettings.banks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : []
  );

  // Per-class T&C — kept in storage for backward compatibility with old quotations.
  // No longer edited in the UI (replaced by the single Common Terms & Conditions field),
  // but preserved on save so previously generated quotations still render their terms.
  const [classTerms] = useState(() => {
    const obj = {};
    classBlocks.forEach(b => { obj[b.key] = seedTerms(b.key, b.name); });
    return obj;
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
    // Re-number bank display order from the current list order before saving.
    const orderedBanks = banks.map((b, i) => ({ ...b, order: i }));
    const nextData = {
      ...data,
      settings: {
        ...data.settings,
        ...settings,
        classTerms,   // preserved unchanged for old-quotation backward compatibility
        banks: orderedBanks,
      },
    };
    setData(nextData);
    persistConfig(nextData);
    setBanks(orderedBanks);
    setSaved(true);
    showToast('Quotation settings saved ✓');
    setTimeout(() => setSaved(false), 2000);
  };

  // ── Bank account handlers (CHANGE 4) ──────────────────────────────────────
  const blankBank = () => ({
    id: 'bank_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    bankName: '', accountName: '', accountNumber: '', ifsc: '', branch: '',
    upiId: '', logo: '', qr: '', order: banks.length, active: true,
  });
  const addBank = () => setBanks(prev => [...prev, blankBank()]);
  const updateBank = (id, field, value) =>
    setBanks(prev => prev.map(b => (b.id === id ? { ...b, [field]: value } : b)));
  const removeBank = (id) => setBanks(prev => prev.filter(b => b.id !== id));
  // Mark one bank as the default (preselected at checkout). Exactly one default.
  const setDefaultBank = (id) =>
    setBanks(prev => prev.map(b => ({ ...b, default: b.id === id })));
  const moveBank = (id, dir) => setBanks(prev => {
    const i = prev.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const handleBankImageUpload = (id, field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => updateBank(id, field, reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const inputStyle = {
    padding: '13px 16px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
    fontSize: '14px', background: 'var(--bg)', color: 'var(--ink)', width: '100%',
    boxSizing: 'border-box', transition: 'border-color 0.2s',
  };

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
          <Toggle
            checked={settings.watermarkEnabled}
            onChange={v => setSettings(s => ({ ...s, watermarkEnabled: v }))}
            label="Brand Watermark on Documents"
            desc="Faint parent-brand name behind quotations and warranty certificates. This is the default for all documents; each quotation or warranty can override it on its own page."
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
        </div>
      </Section>

      {/* ── Section: Common Terms & Conditions (CHANGE 2) ── */}
      <Section
        icon={<FileText size={20} />}
        title="Common Terms &amp; Conditions"
        subtitle="One central Terms &amp; Conditions list applied to every new quotation. Edit here and all future quotations use the latest version."
        accent="#0284C7"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Terms &amp; Conditions (one per line)
            </label>
            <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
              Each line becomes one numbered term on the quotation. Applied to all new quotations; each
              quotation can still be fine-tuned individually from its editor.
            </div>
            <textarea
              rows={12}
              value={settings.commonTerms}
              onChange={e => setSettings(s => ({ ...s, commonTerms: e.target.value }))}
              style={{
                padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
                fontSize: '13px', fontFamily: 'var(--font-mono)', lineHeight: '1.7', resize: 'vertical',
                background: 'var(--bg)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box',
                minHeight: '220px',
              }}
              placeholder="One term per line..."
            />
            <div style={{ textAlign: 'right' }}>
              <button
                onClick={() => setSettings(s => ({ ...s, commonTerms: DEFAULT_CLASS_TERMS.default }))}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px',
                  fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: '2px 4px',
                }}
              >
                ↺ Reset to default terms
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div style={{ padding: '16px 18px', background: 'var(--bg-warm)', borderRadius: 'var(--radius)', border: '1px dashed var(--line)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live Preview → Terms will appear as:
            </div>
            <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: '1.8', color: 'var(--ink)' }}>
              {(settings.commonTerms || '').split('\n').filter(l => l.trim()).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* ── Section: Bank Accounts (CHANGE 4) ── */}
      <Section
        icon={<Layers size={20} />}
        title="Bank Accounts"
        subtitle="Manage the bank accounts available when generating a quotation. Pick one per quotation at checkout."
        accent="#7C3AED"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {banks.length === 0 && (
            <div style={{
              padding: '20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px',
              border: '1px dashed var(--line)', borderRadius: 'var(--radius)', background: 'var(--bg-warm)',
            }}>
              No bank accounts yet. Add one to offer it at checkout.
            </div>
          )}

          {banks.map((bank, idx) => (
            <BankCard
              key={bank.id}
              bank={bank}
              index={idx}
              total={banks.length}
              onChange={(field, value) => updateBank(bank.id, field, value)}
              onRemove={() => removeBank(bank.id)}
              onMove={(dir) => moveBank(bank.id, dir)}
              onImage={(field, e) => handleBankImageUpload(bank.id, field, e)}
              onSetDefault={() => setDefaultBank(bank.id)}
            />
          ))}

          <button
            onClick={addBank}
            className="hover-lift"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', border: '1.5px dashed var(--line)', borderRadius: 'var(--radius)',
              background: 'var(--bg)', color: 'var(--accent)', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Add Bank Account
          </button>
        </div>
      </Section>

      {/* Per-class Class Description + Installation Guidance are now edited in
          Products & Catalog → (class) → Edit, alongside the class itself. */}

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
            background: saved ? 'var(--green)' : 'var(--accent)',
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
