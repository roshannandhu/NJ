import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2, User, ShoppingBag, Layers, Wallet, Check, X } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { createQuotation } from '../api';
import { resolveQuotationBrand } from '../brands';
import './MobileEditor.css';

export default function MobileQuotationEditor() {
  const {
    cart, setCart, updateCartQty, removeFromCart, addToCart,
    customer, setCustomer,
    data, setData,
    activeQuotation, setActiveQuotation, activeQuotationId,
    navigate, goBack, showToast, registerBackHandler
  } = useAppContext();

  const settings = data?.settings || {};
  const cur = settings.currencySymbol || '₹';
  const editingExisting = !!(activeQuotation && activeQuotation.id === activeQuotationId);
  const base = activeQuotation || {};

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Per-quotation overrides (preloaded from activeQuotation if editing)
  const [taxEnabled, setTaxEnabled] = useState(() =>
    editingExisting && base.taxEnabled != null ? base.taxEnabled : (settings.taxEnabled ?? true));
  const [discountEnabled, setDiscountEnabled] = useState(() =>
    editingExisting ? !!base.discountEnabled : false);
  const [discountType, setDiscountType] = useState(() =>
    editingExisting && base.discountType ? base.discountType : (settings.discountType || 'percent'));
  const [discountValue, setDiscountValue] = useState(() =>
    editingExisting && base.discountValue != null ? base.discountValue : (settings.discountRate || 0));
  const [advanceEnabled, setAdvanceEnabled] = useState(() =>
    editingExisting && (Number(base.advanceReceived) || 0) > 0);
  const [advanceValue, setAdvanceValue] = useState(() =>
    editingExisting ? (Number(base.advanceReceived) || 0) : 0);
  const [selectedBankId, setSelectedBankId] = useState(() => {
    if (editingExisting && base.bankId) return base.bankId;
    const def = (settings.banks || []).find(b => b.default && b.active);
    return def ? def.id : '';
  });
  const [managerName, setManagerName] = useState(() => {
    if (editingExisting && base.managerName) return base.managerName;
    try { return localStorage.getItem('nj_last_manager') || ''; } catch { return ''; }
  });

  // Catalog picker drawer
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [pickerSelectedClassId, setPickerSelectedClassId] = useState(null);

  // Register back handler for catalog picker drawer
  useEffect(() => {
    if (!showCatalogPicker) return;
    const unregister = registerBackHandler(() => {
      if (pickerSelectedClassId) {
        setPickerSelectedClassId(null);
        return true;
      }
      setShowCatalogPicker(false);
      return true;
    });
    return unregister;
  }, [showCatalogPicker, pickerSelectedClassId, registerBackHandler]);

  // Pricing calculations
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0), [cart]);
  const discountAmount = useMemo(() => {
    if (!discountEnabled) return 0;
    if (discountType === 'percent') return Math.round(subtotal * (Number(discountValue) || 0)) / 100;
    return Math.min(Number(discountValue) || 0, subtotal);
  }, [discountEnabled, discountType, discountValue, subtotal]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = taxEnabled ? (Number(settings.taxRate) || 0) : 0;
  const taxAmount = Math.round(taxableAmount * taxRate) / 100;
  const grandTotal = taxableAmount + taxAmount;
  const advanceReceived = advanceEnabled ? Math.min(Math.max(0, Number(advanceValue) || 0), grandTotal) : 0;
  const balanceDue = Math.round((grandTotal - advanceReceived) * 100) / 100;

  // Touch-friendly item manipulation
  const handleItemQty = (cartId, delta) => {
    setIsDirty(true);
    const item = cart.find(it => it.cartId === cartId);
    if (!item) return;
    const nextQty = Math.max(1, (Number(item.qty) || 1) + delta);
    updateCartQty(cartId, nextQty);
  };

  const handleItemQtyDirect = (cartId, val) => {
    setIsDirty(true);
    const num = Math.max(1, parseFloat(val) || 1);
    updateCartQty(cartId, num);
  };

  const handleItemPrice = (cartId, val) => {
    setIsDirty(true);
    const num = Math.max(0, parseFloat(val) || 0);
    setCart(prev => prev.map(it => it.cartId === cartId ? { ...it, price: num } : it));
  };

  const handleItemName = (cartId, name) => {
    setIsDirty(true);
    setCart(prev => prev.map(it => it.cartId === cartId ? { ...it, name } : it));
  };

  const handleItemUnit = (cartId, unit) => {
    setIsDirty(true);
    setCart(prev => prev.map(it => it.cartId === cartId ? { ...it, unit } : it));
  };

  const handleRemove = (cartId) => {
    setIsDirty(true);
    removeFromCart(cartId);
  };

  const handleAddCustom = () => {
    setIsDirty(true);
    const customItem = {
      cartId: `custom_${Date.now()}`,
      name: 'Custom Product / Service',
      className: 'Custom',
      price: 0,
      qty: 1,
      unit: 'Pcs',
      color: 'Standard',
    };
    setCart(prev => [...prev, customItem]);
  };

  const handleBack = () => {
    if (isDirty) {
      if (!window.confirm('Discard unsaved changes to this quotation?')) return;
    }
    goBack();
  };

  // Save / Update Quotation
  const handleSaveQuotation = async () => {
    if (!customer.name?.trim()) {
      showToast('Customer name is required', 'error');
      return;
    }
    if (cart.length === 0) {
      showToast('Add at least one product to the quotation', 'error');
      return;
    }

    setIsSaving(true);
    const qNo = editingExisting ? base.id : `NJ-Q-${Date.now().toString().slice(-4)}`;
    const qBrand = resolveQuotationBrand(cart, data);
    const selectedBank = (settings.banks || []).find(b => b.id === selectedBankId);

    const commonTermsText = Array.isArray(settings.commonTerms)
      ? settings.commonTerms.join('\n') : (settings.commonTerms || '');
    const commonTerms = commonTermsText.split('\n').map(t => t.trim()).filter(Boolean);

    const snapshot = {
      ...base,
      id: qNo,
      items: [...cart],
      customer: { ...customer },
      managerName: managerName.trim(),
      brandId: qBrand?.id || null,
      brandName: qBrand?.name || '',
      subtotal,
      discountEnabled,
      discountType,
      discountValue: Number(discountValue) || 0,
      discountAmount,
      taxEnabled,
      taxRate,
      taxAmount,
      grandTotal,
      advanceEnabled,
      advanceReceived,
      balanceDue,
      bank: selectedBank ? { ...selectedBank } : (base.bank ?? null),
      bankId: selectedBankId || '',
      terms: editingExisting && base.termsCustomized ? (base.terms ?? commonTerms) : commonTerms,
      termsCustomized: editingExisting ? !!base.termsCustomized : false,
      date: editingExisting ? (base.date || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    };

    try {
      const saved = await createQuotation(snapshot);
      setActiveQuotation(saved);
      setData(prev => ({
        ...prev,
        quotations: [saved, ...(prev.quotations || []).filter(q => q.id !== qNo)]
      }));
      showToast('Quotation updated successfully', 'success');
      setIsDirty(false);
      navigate('quotation_document');
    } catch (err) {
      console.error(err);
      showToast(`Save failed: ${err.message || 'Network error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Catalog picker data
  const pickerClasses = (data.classes || []).filter(c => c.active !== false);
  const pickerVarieties = (data.varieties || []).filter(v => v.classId === pickerSelectedClassId);
  const selectedClass = pickerClasses.find(c => c.id === pickerSelectedClassId);

  return (
    <div className="mobile-editor-page animate-fade-up">
      {/* --- Topbar --- */}
      <header className="mobile-editor-topbar">
        <button type="button" className="mobile-editor-back-btn" onClick={handleBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="mobile-editor-top-title">
          <h2>{editingExisting ? 'Edit Quotation' : 'New Quotation'}</h2>
          <span>{editingExisting ? base.id : 'DRAFT'}</span>
        </div>
        <button type="button" className="mobile-editor-top-action" onClick={handleBack}>
          Cancel
        </button>
      </header>

      {/* --- Main Content --- */}
      <main className="mobile-editor-body">
        {/* Customer Information Card */}
        <section className="mobile-editor-card">
          <div className="mobile-card-header">
            <span className="mobile-card-title">
              <User size={16} /> Customer Details
            </span>
          </div>
          <div className="mobile-field-group">
            <div className="mobile-field">
              <label>Customer Name *</label>
              <input
                type="text"
                placeholder="Full Name"
                value={customer.name || ''}
                onChange={e => { setIsDirty(true); setCustomer(p => ({ ...p, name: e.target.value })); }}
              />
            </div>
            <div className="mobile-field">
              <label>Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={customer.phone || ''}
                onChange={e => { setIsDirty(true); setCustomer(p => ({ ...p, phone: e.target.value })); }}
              />
            </div>
            <div className="mobile-field">
              <label>Site / Delivery Address</label>
              <textarea
                rows={2}
                placeholder="Site location"
                value={customer.address || ''}
                onChange={e => { setIsDirty(true); setCustomer(p => ({ ...p, address: e.target.value })); }}
              />
            </div>
            <div className="mobile-field">
              <label>Manager / In-Charge</label>
              <input
                type="text"
                placeholder="Sales Manager"
                value={managerName}
                onChange={e => { setIsDirty(true); setManagerName(e.target.value); }}
              />
            </div>
          </div>
        </section>

        {/* Product Items List */}
        <section className="mobile-editor-card">
          <div className="mobile-card-header">
            <span className="mobile-card-title">
              <ShoppingBag size={16} /> Products ({cart.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cart.map((item) => {
              const itemTotal = (Number(item.price || 0) * Number(item.qty || 1));
              return (
                <article key={item.cartId} className="mobile-item-card">
                  <div className="mobile-item-header">
                    <div className="mobile-item-info">
                      <span className="mobile-item-badge">{item.className || 'Product'}</span>
                      <input
                        className="mobile-item-name-input"
                        value={item.name || ''}
                        onChange={e => handleItemName(item.cartId, e.target.value)}
                        placeholder="Item name"
                      />
                      {item.color && item.color !== 'Standard' && (
                        <div className="mobile-item-sub">Color: {item.color}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mobile-item-delete"
                      onClick={() => handleRemove(item.cartId)}
                      title="Remove line"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mobile-item-controls">
                    {/* Stepper */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>
                        Quantity
                      </div>
                      <div className="mobile-stepper">
                        <button type="button" className="mobile-stepper-btn" onClick={() => handleItemQty(item.cartId, -1)}>
                          −
                        </button>
                        <input
                          type="number"
                          className="mobile-stepper-input"
                          value={item.qty ?? 1}
                          min={1}
                          onChange={e => handleItemQtyDirect(item.cartId, e.target.value)}
                        />
                        <button type="button" className="mobile-stepper-btn" onClick={() => handleItemQty(item.cartId, 1)}>
                          +
                        </button>
                      </div>
                    </div>

                    {/* Unit Price */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>
                        Unit Price ({cur})
                      </div>
                      <div className="mobile-price-box">
                        <span className="mobile-price-cur">{cur}</span>
                        <input
                          type="number"
                          className="mobile-price-input"
                          value={item.price ?? 0}
                          min={0}
                          step="any"
                          onChange={e => handleItemPrice(item.cartId, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mobile-item-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="mobile-item-unit-tag">Unit:</span>
                      <input
                        style={{ width: '48px', padding: '2px 4px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-warm)' }}
                        value={item.unit || 'Sqft'}
                        onChange={e => handleItemUnit(item.cartId, e.target.value)}
                      />
                    </div>
                    <div className="mobile-item-total">
                      {cur}{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </article>
              );
            })}

            {cart.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--ink-soft)', fontSize: '14px' }}>
                No items in this quotation yet.
              </div>
            )}

            {/* Add Buttons */}
            <div className="mobile-add-items-row">
              <button
                type="button"
                className="mobile-btn-add is-primary"
                onClick={() => { setPickerSelectedClassId(null); setShowCatalogPicker(true); }}
              >
                <Layers size={16} /> From Catalog
              </button>
              <button
                type="button"
                className="mobile-btn-add is-secondary"
                onClick={handleAddCustom}
              >
                <Plus size={16} /> Custom Item
              </button>
            </div>
          </div>
        </section>

        {/* Pricing & Billing Options */}
        <section className="mobile-editor-card">
          <div className="mobile-card-header">
            <span className="mobile-card-title">
              <Wallet size={16} /> Tax, Discount & Bank
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Tax Toggle */}
            <div className="mobile-toggle-row">
              <div className="mobile-toggle-label">
                <strong>Apply GST / Tax ({settings.taxRate || 18}%)</strong>
                <span>{taxEnabled ? `+${cur}${taxAmount.toLocaleString('en-IN')}` : 'Tax disabled'}</span>
              </div>
              <input
                type="checkbox"
                checked={taxEnabled}
                onChange={e => { setIsDirty(true); setTaxEnabled(e.target.checked); }}
                style={{ width: '22px', height: '22px', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Discount Toggle */}
            <div className="mobile-toggle-row">
              <div className="mobile-toggle-label">
                <strong>Special Discount</strong>
                <span>{discountEnabled ? `-${cur}${discountAmount.toLocaleString('en-IN')}` : 'No discount applied'}</span>
              </div>
              <input
                type="checkbox"
                checked={discountEnabled}
                onChange={e => { setIsDirty(true); setDiscountEnabled(e.target.checked); }}
                style={{ width: '22px', height: '22px', accentColor: 'var(--accent)' }}
              />
            </div>

            {discountEnabled && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select
                  style={{ padding: '10px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--bg-warm)', fontSize: '13px' }}
                  value={discountType}
                  onChange={e => { setIsDirty(true); setDiscountType(e.target.value); }}
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="flat">Flat Amount ({cur})</option>
                </select>
                <input
                  type="number"
                  placeholder={discountType === 'percent' ? 'Rate %' : 'Amount'}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--bg-warm)', fontSize: '14px' }}
                  value={discountValue}
                  onChange={e => { setIsDirty(true); setDiscountValue(e.target.value); }}
                />
              </div>
            )}

            {/* Advance Received */}
            <div className="mobile-toggle-row">
              <div className="mobile-toggle-label">
                <strong>Advance Payment</strong>
                <span>{advanceEnabled ? `Received: ${cur}${advanceReceived.toLocaleString('en-IN')}` : 'No advance recorded'}</span>
              </div>
              <input
                type="checkbox"
                checked={advanceEnabled}
                onChange={e => { setIsDirty(true); setAdvanceEnabled(e.target.checked); }}
                style={{ width: '22px', height: '22px', accentColor: 'var(--accent)' }}
              />
            </div>

            {advanceEnabled && (
              <div className="mobile-field">
                <label>Advance Amount Received ({cur})</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={advanceValue}
                  onChange={e => { setIsDirty(true); setAdvanceValue(e.target.value); }}
                />
              </div>
            )}

            {/* Bank Selector */}
            <div className="mobile-field">
              <label>Bank Account on Quotation</label>
              <select
                value={selectedBankId}
                onChange={e => { setIsDirty(true); setSelectedBankId(e.target.value); }}
              >
                <option value="">No bank details</option>
                {(settings.banks || []).filter(b => b.active).map(b => (
                  <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </main>

      {/* --- Sticky Bottom Bar --- */}
      <footer className="mobile-editor-sticky-bar">
        <div className="mobile-editor-total-display">
          <span className="mobile-editor-total-label">
            {advanceEnabled ? 'Balance Due' : 'Grand Total'}
          </span>
          <span className="mobile-editor-total-val">
            {cur}{(advanceEnabled ? balanceDue : grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <button
          type="button"
          className="mobile-btn-save"
          onClick={handleSaveQuotation}
          disabled={isSaving}
        >
          {isSaving ? 'Updating…' : <><Check size={18} /> Update Quotation</>}
        </button>
      </footer>

      {/* --- Mobile Catalog Drawer Modal --- */}
      {showCatalogPicker && (
        <div className="mobile-sheet-overlay" onClick={() => setShowCatalogPicker(false)}>
          <div className="mobile-sheet-panel" onClick={e => e.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-head">
              <h3>{pickerSelectedClassId ? (selectedClass?.name || 'Pick Product') : 'Select Product Class'}</h3>
              <button
                type="button"
                className="mobile-sheet-close"
                onClick={() => {
                  if (pickerSelectedClassId) setPickerSelectedClassId(null);
                  else setShowCatalogPicker(false);
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mobile-sheet-content">
              {!pickerSelectedClassId ? (
                // Step 1: Classes list
                pickerClasses.map(cls => (
                  <div
                    key={cls.id}
                    className="mobile-sheet-catalog-item"
                    onClick={() => setPickerSelectedClassId(cls.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>{cls.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{cls.subtitle || `${(data.varieties || []).filter(v => v.classId === cls.id).length} varieties`}</div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>Browse →</span>
                  </div>
                ))
              ) : (
                // Step 2: Varieties in class
                pickerVarieties.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-soft)' }}>
                    No products found in this class.
                  </div>
                ) : (
                  pickerVarieties.map(item => (
                    <div
                      key={item.id}
                      className="mobile-sheet-catalog-item"
                      onClick={() => {
                        const defaultColor = item.colors?.[0]?.name || 'Standard';
                        addToCart({
                          id: `${item.id}-${defaultColor}`,
                          name: item.name,
                          className: selectedClass?.name || 'Products',
                          price: item.basePrice || 0,
                          qty: 1,
                          unit: item.unit || 'Sqft',
                          color: defaultColor,
                          image: item.colors?.[0]?.image || item.image,
                        });
                        setIsDirty(true);
                        showToast(`Added ${item.name} to quotation`, 'success');
                        setShowCatalogPicker(false);
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--accent-deep)', fontWeight: 600 }}>
                          {cur}{item.basePrice} / {item.unit || 'Sqft'}
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{
                          background: 'var(--accent)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '999px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + Add
                      </button>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
