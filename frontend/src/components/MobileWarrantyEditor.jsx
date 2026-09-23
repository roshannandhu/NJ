import { useState, useMemo } from 'react';
import { ArrowLeft, ShieldCheck, User, FileText, Check, Award } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { createWarranty } from '../api';
import './MobileEditor.css';

const DURATION_PRESETS = ['10 Years', '15 Years', '20 Years', '25 Years', '30 Years', '50 Years', 'Lifetime'];

export default function MobileWarrantyEditor() {
  const {
    activeWarranty, setActiveWarranty, activeWarrantyId,
    data, setData,
    navigate, goBack, showToast
  } = useAppContext();

  const editingExisting = !!(activeWarranty && (activeWarranty.id === activeWarrantyId || activeWarranty.warrantyNo === activeWarrantyId));
  const base = activeWarranty || {};

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Customer info
  const [customerName, setCustomerName] = useState(() => base.customer?.name || base.name || '');
  const [customerPhone, setCustomerPhone] = useState(() => base.customer?.phone || base.phone || '');
  const [customerEmail, setCustomerEmail] = useState(() => base.customer?.email || base.email || '');
  const [customerAddress, setCustomerAddress] = useState(() => base.customer?.address || base.address || '');

  // Template / Type
  const warrantiesList = useMemo(() => data.warranties || [], [data.warranties]);
  const defaultTemplateId = warrantiesList[0]?.id || 'nj_laminated';
  const initialTemplateId = (typeof base.template === 'string' ? base.template : base.template?.id) || defaultTemplateId;
  const [templateId, setTemplateId] = useState(initialTemplateId);

  // Certificate specifications
  const initialCert = base.certData || {};
  const [productName, setProductName] = useState(() => initialCert.productName || 'Ceramic / Shingle Roofing');
  const [invoiceNo, setInvoiceNo] = useState(() => initialCert.invoiceNo || base.quotationId || '');
  const [purchaseDate, setPurchaseDate] = useState(() =>
    initialCert.purchaseDate || base.date || new Date().toISOString().slice(0, 10));
  const [warrantyNo, setWarrantyNo] = useState(() =>
    base.warrantyNo || base.id || `NJ-W-${Date.now().toString().slice(-4)}`);
  const [warrantyPeriod, setWarrantyPeriod] = useState(() =>
    initialCert.warrantyPeriod || warrantiesList.find(w => w.id === templateId)?.duration || '30 Years');

  const handleTemplateChange = (newTid) => {
    setIsDirty(true);
    setTemplateId(newTid);
    const t = warrantiesList.find(w => w.id === newTid);
    if (t?.duration) {
      setWarrantyPeriod(t.duration);
    }
  };

  const handleBack = () => {
    if (isDirty) {
      if (!window.confirm('Discard unsaved changes to this warranty?')) return;
    }
    goBack();
  };

  const handleSave = async (andView = true) => {
    if (!customerName.trim()) {
      showToast('Owner / Customer name is required', 'error');
      return;
    }
    if (!productName.trim()) {
      showToast('Certified product name is required', 'error');
      return;
    }

    setIsSaving(true);
    const certKey = base.id || warrantyNo;

    const updatedDoc = {
      ...base,
      id: certKey,
      warrantyNo: warrantyNo.trim(),
      date: purchaseDate,
      customer: {
        name: customerName.trim(),
        phone: customerPhone.trim(),
        email: customerEmail.trim(),
        address: customerAddress.trim(),
      },
      name: customerName.trim(),
      certData: {
        ...initialCert,
        productName: productName.trim(),
        invoiceNo: invoiceNo.trim(),
        purchaseDate,
        warrantyPeriod: warrantyPeriod.trim(),
      },
      template: templateId,
      updatedAt: new Date().toISOString(),
    };

    try {
      await createWarranty(updatedDoc);
      setActiveWarranty(updatedDoc);
      setData(prev => {
        const certs = prev.warranty_certificates || [];
        const filtered = certs.filter(w => (w.id || w.warrantyNo) !== certKey);
        return {
          ...prev,
          warranty_certificates: [updatedDoc, ...filtered],
        };
      });

      showToast(editingExisting ? 'Warranty certificate updated' : 'Warranty certificate created', 'success');
      setIsDirty(false);
      if (andView) {
        navigate('warranty_document');
      }
    } catch (err) {
      console.error(err);
      showToast(`Save failed: ${err.message || 'Network error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mobile-editor-page animate-fade-up">
      {/* --- Topbar --- */}
      <header className="mobile-editor-topbar">
        <button type="button" className="mobile-editor-back-btn" onClick={handleBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="mobile-editor-top-title">
          <h2>{editingExisting ? 'Edit Warranty' : 'New Warranty'}</h2>
          <span>{warrantyNo}</span>
        </div>
        <button type="button" className="mobile-editor-top-action" onClick={handleBack}>
          Cancel
        </button>
      </header>

      {/* --- Main Content --- */}
      <main className="mobile-editor-body">
        {/* Certificate Overview Card */}
        <section className="mobile-editor-card">
          <div className="mobile-card-header">
            <span className="mobile-card-title">
              <ShieldCheck size={16} /> Certificate Scope
            </span>
          </div>

          <div className="mobile-field-group">
            <div className="mobile-field">
              <label>Warranty Template / Scheme</label>
              <select
                value={templateId}
                onChange={e => handleTemplateChange(e.target.value)}
              >
                {warrantiesList.map(w => (
                  <option key={w.id} value={w.id}>{w.title || w.name || w.id}</option>
                ))}
              </select>
            </div>

            <div className="mobile-field">
              <label>Certificate Number</label>
              <input
                type="text"
                value={warrantyNo}
                onChange={e => { setIsDirty(true); setWarrantyNo(e.target.value); }}
                placeholder="e.g. NJ-W-0042"
              />
            </div>

            <div className="mobile-field">
              <label>Issue / Installation Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={e => { setIsDirty(true); setPurchaseDate(e.target.value); }}
              />
            </div>
          </div>
        </section>

        {/* Customer / Owner Details Card */}
        <section className="mobile-editor-card">
          <div className="mobile-card-header">
            <span className="mobile-card-title">
              <User size={16} /> Customer / Owner
            </span>
          </div>

          <div className="mobile-field-group">
            <div className="mobile-field">
              <label>Customer Name *</label>
              <input
                type="text"
                placeholder="Full Name"
                value={customerName}
                onChange={e => { setIsDirty(true); setCustomerName(e.target.value); }}
              />
            </div>
            <div className="mobile-field">
              <label>Phone Number</label>
              <input
                type="tel"
                placeholder="Contact Number"
                value={customerPhone}
                onChange={e => { setIsDirty(true); setCustomerPhone(e.target.value); }}
              />
            </div>
            <div className="mobile-field">
              <label>Installation / Building Address</label>
              <textarea
                rows={2}
                placeholder="Site address covered by warranty"
                value={customerAddress}
                onChange={e => { setIsDirty(true); setCustomerAddress(e.target.value); }}
              />
            </div>
            <div className="mobile-field">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="Optional"
                value={customerEmail}
                onChange={e => { setIsDirty(true); setCustomerEmail(e.target.value); }}
              />
            </div>
          </div>
        </section>

        {/* Certified Product Details Card */}
        <section className="mobile-editor-card">
          <div className="mobile-card-header">
            <span className="mobile-card-title">
              <Award size={16} /> Certified Product
            </span>
          </div>

          <div className="mobile-field-group">
            <div className="mobile-field">
              <label>Certified Product Name *</label>
              <input
                type="text"
                placeholder="e.g. Highlander Shingle / Ceramic Roof Tile"
                value={productName}
                onChange={e => { setIsDirty(true); setProductName(e.target.value); }}
              />
            </div>

            <div className="mobile-field">
              <label>Invoice / Order Reference #</label>
              <input
                type="text"
                placeholder="e.g. INV-2026-081"
                value={invoiceNo}
                onChange={e => { setIsDirty(true); setInvoiceNo(e.target.value); }}
              />
            </div>

            {/* Warranty Period Chips */}
            <div className="mobile-field">
              <label>Warranty Coverage Period</label>
              <input
                type="text"
                placeholder="e.g. 30 Years"
                value={warrantyPeriod}
                onChange={e => { setIsDirty(true); setWarrantyPeriod(e.target.value); }}
                style={{ marginBottom: '8px' }}
              />
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {DURATION_PRESETS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setIsDirty(true); setWarrantyPeriod(d); }}
                    style={{
                      background: warrantyPeriod === d ? 'var(--accent)' : 'var(--bg-warm)',
                      color: warrantyPeriod === d ? '#fff' : 'var(--ink)',
                      border: '1px solid var(--line)',
                      borderRadius: '999px',
                      padding: '5px 11px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* --- Sticky Bottom Bar --- */}
      <footer className="mobile-editor-sticky-bar">
        <button
          type="button"
          onClick={() => handleSave(true)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '999px',
            padding: '12px 18px',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--ink)',
            cursor: 'pointer',
            minHeight: '48px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <FileText size={16} /> Preview
        </button>

        <button
          type="button"
          className="mobile-btn-save"
          onClick={() => handleSave(true)}
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : <><Check size={18} /> {editingExisting ? 'Update Certificate' : 'Save Certificate'}</>}
        </button>
      </footer>
    </div>
  );
}
