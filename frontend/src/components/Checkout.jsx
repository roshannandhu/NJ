import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, Plus, Trash2, User, FileText, ShieldCheck, Tag, Percent, Edit3 } from 'lucide-react';
import { createQuotation, createWarranty, deleteWarranty } from '../api';
import NumberField from './NumberField';

export default function Checkout() {
  const { cart, cartTotal, customer, setCustomer, data, setData, setCurrentView, setCart, showToast, setActiveQuotation, setActiveWarranty, setActiveTab, activeQuotation, activeQuotationId, setActiveQuotationId } = useAppContext();

  const settings = data.settings || {};

  // Are we editing an existing quotation (entered via "Edit in Checkout" /
  // History → Edit), or creating a new one? When editing, the per-checkout
  // overrides start from the quotation being edited so re-finalizing preserves
  // its tax/discount/bank instead of silently resetting to global defaults.
  // (Checkout remounts each time it's opened, so these lazy initialisers re-run
  // with the right source.)
  const editingExisting = !!(activeQuotation && activeQuotation.id === activeQuotationId);

  // Per-checkout overrides (from the edited quotation, else global defaults)
  const [taxEnabled, setTaxEnabled] = React.useState(() =>
    editingExisting && activeQuotation.taxEnabled != null ? activeQuotation.taxEnabled : (settings.taxEnabled ?? true));
  const [discountEnabled, setDiscountEnabled] = React.useState(() =>
    editingExisting ? !!activeQuotation.discountEnabled : false);
  const [discountType, setDiscountType] = React.useState(() =>
    editingExisting && activeQuotation.discountType ? activeQuotation.discountType : (settings.discountType || 'percent'));
  const [discountValue, setDiscountValue] = React.useState(() =>
    editingExisting && activeQuotation.discountValue != null ? activeQuotation.discountValue : (settings.discountRate || 0));

  // Active bank accounts available for this quotation (CHANGE 5), ordered for display.
  const activeBanks = React.useMemo(
    () => (settings.banks || []).filter(b => b.active).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [settings.banks]
  );
  const [selectedBankId, setSelectedBankId] = React.useState(() =>
    editingExisting ? (activeQuotation.bankId || '') : '');

  // ── Offer-price helpers ──────────────────────────────────────────────────
  // An "offer" exists only when the effective price was lowered below the
  // immutable actual (Settings) price. Items without actualPrice (legacy carts
  // or custom lines with actualPrice 0) never count as offers.
  const hasOffer = (item) => item.actualPrice != null && item.actualPrice > 0 && item.price < item.actualPrice;
  // Per-row actual unit price used for the "Actual Total" — for non-offer rows
  // this is just the effective price, so it never inflates the savings figure.
  const rowActualUnit = (item) => (hasOffer(item) ? item.actualPrice : item.price);

  const taxRate = taxEnabled ? (settings.taxRate || 0) : 0;
  const subtotal = cartTotal; // effective (offer) subtotal — the charged amount
  const actualSubtotal = cart.reduce((sum, item) => sum + (rowActualUnit(item) * item.qty), 0);
  const productSavings = Math.max(0, Math.round((actualSubtotal - subtotal) * 100) / 100);
  const hasOffers = cart.some(hasOffer);
  const discountAmount = discountEnabled
    ? (discountType === 'percent' ? Math.round(subtotal * discountValue) / 100 : Math.min(discountValue, subtotal))
    : 0;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = Math.round(taxableAmount * taxRate) / 100;
  const grandTotal = taxableAmount + taxAmount;

  // Calculate detected warranties based on items in the cart
  const detectedWarranties = React.useMemo(() => {
    const classesInCart = Array.from(new Set(cart.map(item => item.className)));
    const list = [];
    classesInCart.forEach(className => {
      const cls = data.classes?.find(c => c.name === className);
      if (cls && cls.warrantyId) {
        const warranty = data.warranties?.find(w => w.id === cls.warrantyId);
        if (warranty) {
          list.push({
            className: cls.name,
            warrantyTitle: warranty.title,
            duration: warranty.duration,
            color: cls.color || '#c2410c'
          });
        }
      }
    });
    return list;
  }, [cart, data.classes, data.warranties]);

  // Unique warranty templates linked to tile classes in the cart
  const availableWarrantyTemplates = React.useMemo(() => {
    const seen = new Set();
    const list = [];
    cart.forEach(item => {
      const cls = data.classes?.find(c => c.name === item.className);
      if (cls?.warrantyId && !seen.has(cls.warrantyId)) {
        const tmpl = data.warranties?.find(w => w.id === cls.warrantyId);
        if (tmpl) { seen.add(cls.warrantyId); list.push({ ...tmpl, forClass: cls.name }); }
      }
    });
    return list;
  }, [cart, data.classes, data.warranties]);

  const handleGenerateQuotation = async () => {
    if (!customer.name) {
      showToast("Customer name is required", "error");
      document.getElementById('customer-name-input')?.focus();
      return;
    }

    // Batch Number is optional — no validation required

    // Reuse the current draft's id if we're still editing the same session, so
    // the backend (which upserts by id) UPDATES the existing quotation instead
    // of inserting a duplicate. A brand-new id is only minted for a fresh draft
    // (activeQuotationId is null until the first generate; cleared by "New").
    const qNo = activeQuotationId || `${settings.quotationPrefix || 'NJ-Q'}-${Date.now().toString().slice(-6)}`;
    const isRegenerate = !!activeQuotationId;
    setActiveQuotationId(qNo);

    // When updating an existing quotation, build ON TOP of it so per-quotation
    // edits (terms, notes, delivery, class descriptions, original date, bank)
    // are preserved instead of being reset to fresh defaults.
    const base = isRegenerate && activeQuotation ? activeQuotation : {};
    const today = new Date().toLocaleDateString('en-GB');

    // Snapshot the chosen bank so the quotation is audit-safe (immune to later settings edits).
    const selectedBank = activeBanks.find(b => b.id === selectedBankId) || null;
    const bankChanged = (selectedBankId || '') !== (base.bankId || '');
    // Copy the latest common Terms & Conditions onto the quotation; editable per-quotation later.
    const commonTerms = (settings.commonTerms || '')
      .split('\n').map(t => t.trim()).filter(Boolean);

    const snapshot = {
      ...base,
      id: qNo,
      items: [...cart],
      customer: { ...customer },
      subtotal,
      actualSubtotal,
      productSavings,
      hasOffers,
      taxEnabled,
      taxRate,
      taxAmount,
      discountEnabled,
      discountType,
      discountValue,
      discountAmount,
      grandTotal,
      // Bank: honour a changed selection; otherwise keep the snapshotted bank
      // (audit-safe even if that bank was later removed from Settings).
      bank: selectedBank ? { ...selectedBank } : (!bankChanged ? (base.bank ?? null) : null),
      bankId: selectedBankId || '',
      // Editable, per-quotation fields: preserve on update, seed fresh on create.
      terms: isRegenerate ? (base.terms ?? commonTerms) : commonTerms,
      classDescriptions: isRegenerate ? (base.classDescriptions ?? {}) : {},
      notes: isRegenerate ? (base.notes ?? '') : '',
      delivery: isRegenerate ? (base.delivery ?? '') : '',
      validityDays: base.validityDays ?? settings.validityDays ?? 20,
      // Keep the original issue date when updating; stamp today only for new ones.
      date: isRegenerate ? (base.date || today) : today,
    };
    
    // Auto-generate matching warranties. Each warranty id is DETERMINISTIC —
    // derived from the quotation id + the warranty template id — so regenerating
    // the same quotation reuses the same ids (backend upserts → updates, never
    // duplicates). Use suffix of the quotation no. for a tidy, human warranty no.
    const qSuffix = qNo.replace(/^.*?-/, '');
    const wPrefix = settings.warrantyPrefix || 'NJ-W';
    const certIdFor = (tmpl) => `${wPrefix}-${qSuffix}-${String(tmpl.id).replace(/[^a-zA-Z0-9]+/g, '').slice(0, 12)}`;

    const generatedCerts = availableWarrantyTemplates.map((tmpl) => {
      const matchingItems = cart.filter(item => item.className === tmpl.forClass);
      const selectedItem = matchingItems.length > 0 ? matchingItems[0] : (cart[0] || null);
      const wNo = certIdFor(tmpl);
      return {
        id: wNo,
        quotationId: qNo,
        items:     [...cart],
        customer:  { ...customer },
        date:      new Date().toLocaleDateString('en-GB'),
        warrantyNo: wNo,
        template:  tmpl,
        certData: {
          sellerName: data.company?.name || "NOUFAL & JABBAR INTERNATIONAL LLP",
          batchNo: selectedItem?.batchNo || '',
          purchaseDate: new Date().toLocaleDateString('en-GB'),
          siteAddress: customer.address || "",
          productName: selectedItem?.name || 'Standard Shingle',
          productColor: selectedItem?.color || 'N/A',
          productQty: selectedItem?.qty || 1,
          productUnit: selectedItem?.unit || 'sqft',
          selectedCartId: selectedItem?.cartId || ''
        }
      };
    });

    // On regenerate, drop any previously-generated warranties for THIS quotation
    // whose product class is no longer in the cart, so history stays in sync.
    const newCertIds = new Set(generatedCerts.map(c => c.id));
    const obsoleteCerts = isRegenerate
      ? (data.warranty_certificates || []).filter(c => c.quotationId === qNo && !newCertIds.has(c.id))
      : [];

    try {
      await createQuotation(snapshot);
      for (const cert of generatedCerts) {
        await createWarranty(cert);
      }
      for (const cert of obsoleteCerts) {
        await deleteWarranty(cert.id);
      }
    } catch {
      showToast("Saved locally, backend sync failed", "error");
    }

    // Update the local registry: upsert this quotation by id, and replace this
    // quotation's warranty set (removing obsolete ones) — never blindly prepend.
    setData(prev => {
      const quotations = [snapshot, ...(prev.quotations || []).filter(q => q.id !== qNo)];
      const otherCerts = (prev.warranty_certificates || []).filter(c => c.quotationId !== qNo);
      return {
        ...prev,
        quotations,
        warranty_certificates: [...generatedCerts, ...otherCerts],
      };
    });

    if (setActiveTab) setActiveTab('quotation');
    setActiveQuotation(snapshot);
    setCurrentView('quotation_document');

    const verb = isRegenerate ? 'updated' : 'generated';
    if (generatedCerts.length > 0) {
      showToast(`Quotation & ${generatedCerts.length} Warranties ${verb}!`, "success");
    } else {
      showToast(`Quotation ${verb}!`, "success");
    }
  };

  const handleGenerateWarrantyInstant = async (tmpl) => {
    if (!customer.name) {
      showToast("Customer name is required to generate a warranty.", "error");
      const nameInput = document.getElementById('customer-name-input');
      if (nameInput) nameInput.focus();
      return;
    }

    const matchingItems = tmpl
      ? cart.filter(item => item.className === tmpl.forClass)
      // No specific template: pick warrantable product lines (their class has a
      // linked warranty). Tool/accessory classes have no warrantyId, so they're
      // naturally excluded — no brittle name matching on "tool".
      : cart.filter(i => data.classes?.find(cl => cl.name === i.className)?.warrantyId);

    const selectedItem = matchingItems.length > 0 ? matchingItems[0] : (cart[0] || null);

    const wNo = `${settings.warrantyPrefix || 'NJ-W'}-${Date.now().toString().slice(-6)}`;
    const warrantySnapshot = {
      id: wNo,
      items:     [...cart],
      customer:  { ...customer },
      date:      new Date().toLocaleDateString('en-GB'),
      warrantyNo: wNo,
      template:  tmpl || {
        title: "Product Performance Warranty",
        opening: "Congratulations on your purchase. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards.",
        sections: [
          {
            title: "1. Product Information",
            content: "Roofing products designed for structural integrity and long-lasting performance.",
            isBullets: false
          },
          {
            title: "2. Warranty Coverage",
            content: "Full Coverage against manufacturing defects.",
            isBullets: false
          },
          {
            title: "3. Warranty Conditions",
            content: "Proper installation according to the manual.\nValid proof of purchase.",
            isBullets: true
          }
        ]
      },
      certData: {
        sellerName: data.company?.name || "NOUFAL & JABBAR INTERNATIONAL LLP",
        batchNo: '',
        purchaseDate: new Date().toLocaleDateString('en-GB'),
        siteAddress: customer.address || "",
        productName: selectedItem?.name || 'Standard Shingle',
        productColor: selectedItem?.color || 'N/A',
        productQty: selectedItem?.qty || 1,
        productUnit: selectedItem?.unit || 'sqft',
        selectedCartId: selectedItem?.cartId || ''
      }
    };

    try {
      await createWarranty(warrantySnapshot);
    } catch {
      showToast("Saved locally, backend sync failed", "error");
    }

    // Save to historical certificates registry
    setData(prev => {
      const history = prev.warranty_certificates || [];
      return {
        ...prev,
        warranty_certificates: [warrantySnapshot, ...history]
      };
    });

    setActiveWarranty(warrantySnapshot);
    setCurrentView('warranty_document');
    showToast("Warranty certificate generated instantly! Customize details below.", "success");
  };

  const handlePriceChange = (cartId, newPrice) => {
    setCart(prev => prev.map(item => item.cartId === cartId ? { ...item, price: parseFloat(newPrice) || 0 } : item));
  };

  // Restore an overridden line back to its immutable actual (Settings) price.
  const handleResetPrice = (cartId) => {
    setCart(prev => prev.map(item => item.cartId === cartId && item.actualPrice != null ? { ...item, price: item.actualPrice } : item));
  };

  const handleNameChange = (cartId, newName) => {
    setCart(prev => prev.map(item => item.cartId === cartId ? { ...item, name: newName } : item));
  };

  const handleQtyChange = (cartId, newQty) => {
    setCart(prev => prev.map(item => item.cartId === cartId ? { ...item, qty: Math.max(1, parseInt(newQty) || 1) } : item));
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  // "Add Item" sends the user back to the Quotation Desk to pick catalog
  // products — the single, consistent product-selection workflow. The cart
  // persists across views, so anything selected there returns to this Checkout.
  // (Genuine non-catalog lines, e.g. labour/freight, are still added from the
  // generated Quotation Document via its "Add Row" action.)
  const handleAddItem = () => {
    setCurrentView('quotation_desk');
  };

  if (cart.length === 0) {
    return (
      <div className="animate-fade-up" style={{ 
        textAlign: 'center', 
        padding: '100px 24px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: '24px' 
      }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          borderRadius: '50%', 
          background: 'var(--accent-soft)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'var(--accent)',
          opacity: 0.8
        }}>
          <FileText size={40} strokeWidth={1.5} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--ink)', fontWeight: 500, margin: 0 }}>Checkout is empty</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '15px', maxWidth: '400px', margin: '0 auto 8px', lineHeight: '1.6' }}>
          Add items to your cart from the desk catalog to review and generate a quotation.
        </p>
        <button className="btn-primary" onClick={() => setCurrentView('quotation_desk')}>Return to Desk</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '48px', minHeight: 'calc(100vh - 120px)' }}>
      
      {/* LEFT: Premium Order Review */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        
        {/* Back Link with hover animation */}
        <button 
          onClick={() => setCurrentView('quotation_desk')}
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '13px', 
            color: 'var(--ink-soft)', 
            marginBottom: '32px', 
            fontWeight: 600, 
            alignSelf: 'flex-start', 
            background: 'transparent', 
            border: 'none', 
            cursor: 'pointer',
            transition: 'color 0.2s, transform 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--ink)';
            e.currentTarget.style.transform = 'translateX(-4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--ink-soft)';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
        >
          <ArrowLeft size={16} /> Back to Desk
        </button>

        {/* Editing-an-existing-quotation banner */}
        {editingExisting && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px',
            padding: '12px 16px', borderRadius: 'var(--radius)',
            background: 'rgba(138,24,86,0.06)', border: '1px solid rgba(138,24,86,0.2)',
            color: '#8a1856', fontSize: '13px', fontWeight: 600,
          }}>
            <Edit3 size={15} />
            Editing quotation <strong>{activeQuotation.id}</strong> — changes update this existing record (same number &amp; date).
          </div>
        )}

        {/* Section Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>{editingExisting ? 'Edit Order' : 'Review Order'}</h1>
            <p style={{ color: 'var(--ink-soft)', fontSize: '15px', marginTop: '8px' }}>Adjust quantities, apply overrides, and finalize item details.</p>
          </div>
          <button
            onClick={handleAddItem}
            className="hover-lift"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '12px 20px', 
              background: 'var(--surface)', 
              border: '1.5px dashed var(--line)', 
              borderRadius: 'var(--radius-full)', 
              fontSize: '13px', 
              fontWeight: 600, 
              color: 'var(--accent)', 
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.background = 'var(--accent-soft)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.style.background = 'var(--surface)';
            }}
          >
            <Plus size={16} /> Add Item
          </button>
        </div>

        {/* Premium List Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {cart.map((item) => {
            // Find class color to code the left border
            const itemClass = data.classes?.find(c => c.name === item.className);
            const borderLeftColor = itemClass ? itemClass.color : 'var(--ink-soft)';
            
            return (
              <div key={item.cartId} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div 
                  style={{ 
                    background: 'var(--surface)', 
                  border: '1px solid var(--line)', 
                  borderLeft: `5px solid ${borderLeftColor}`,
                  borderRadius: 'var(--radius-lg)', 
                  padding: '24px', 
                  display: 'grid', 
                  gridTemplateColumns: '1.2fr 130px 110px auto', 
                  gap: '24px', 
                  alignItems: 'center', 
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: 'var(--shadow-sm)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                
                {/* Item Info with inline editable name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input 
                      value={item.name} 
                      onChange={e => handleNameChange(item.cartId, e.target.value)}
                      style={{ 
                        fontSize: '17px', 
                        fontWeight: 600, 
                        color: 'var(--ink)', 
                        background: 'transparent', 
                        border: 'none', 
                        borderBottom: '1.5px solid transparent',
                        padding: '2px 0', 
                        outline: 'none', 
                        width: '100%', 
                        fontFamily: 'inherit',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={e => e.target.style.borderBottomColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderBottomColor = 'transparent'}
                      title="Click to edit item name"
                      placeholder="Item Name"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      fontSize: '11px', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.05em', 
                      fontWeight: 700, 
                      color: 'white',
                      background: borderLeftColor,
                      padding: '2px 8px',
                      borderRadius: '4px'
                    }}>
                      {item.className}
                    </span>
                    {item.color && item.color !== 'N/A' && item.color !== 'Standard' && (
                      <span style={{ fontSize: '13px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                        · {item.color}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price Override */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--ink-soft)' }}>
                    {hasOffer(item) ? 'Offer Price' : 'Unit Price'}
                  </div>
                  <div style={{
                    position: 'relative', 
                    display: 'flex', 
                    alignItems: 'center',
                    borderBottom: '2px solid var(--line)',
                    paddingBottom: '4px',
                    transition: 'border-color 0.2s'
                  }}
                  onFocusCapture={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlurCapture={(e) => e.currentTarget.style.borderColor = 'var(--line)'}
                  >
                    <span style={{ color: 'var(--accent-deep)', fontSize: '15px', fontWeight: 600, marginRight: '2px' }}>{settings.currencySymbol || '₹'}</span>
                    <NumberField
                      value={item.price}
                      min={0}
                      step="any"
                      allowFloat
                      fallback={0}
                      onCommit={n => handlePriceChange(item.cartId, n)}
                      aria-label={`${item.name} unit price`}
                      style={{
                        width: '100%',
                        border: 'none',
                        fontSize: '16px',
                        fontWeight: 600,
                        background: 'transparent',
                        outline: 'none',
                        color: 'var(--ink)'
                      }}
                    />
                  </div>
                  {/* Actual (Settings) price + reset, shown only when an offer is active */}
                  {hasOffer(item) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                      <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>
                        Actual <span style={{ textDecoration: 'line-through' }}>{settings.currencySymbol || '₹'}{item.actualPrice.toLocaleString('en-IN')}</span>
                      </span>
                      <button
                        onClick={() => handleResetPrice(item.cartId)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '11px' }}
                        title="Restore the actual Settings price"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                {/* Qty */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--ink-soft)' }}>Quantity</div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    borderBottom: '2px solid var(--line)',
                    paddingBottom: '4px',
                    transition: 'border-color 0.2s'
                  }}
                  onFocusCapture={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlurCapture={(e) => e.currentTarget.style.borderColor = 'var(--line)'}
                  >
                    <NumberField
                      value={item.qty}
                      min={1}
                      fallback={1}
                      onCommit={n => handleQtyChange(item.cartId, n)}
                      aria-label={`${item.name} quantity`}
                      style={{
                        width: '100%',
                        border: 'none',
                        fontSize: '16px',
                        fontWeight: 600,
                        textAlign: 'left',
                        background: 'transparent',
                        outline: 'none',
                        color: 'var(--ink)'
                      }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--ink-soft)', marginLeft: '4px', fontWeight: 600 }}>{item.unit}</span>
                  </div>
                </div>

                {/* Line Total & Remove */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '130px' }}>
                  <div style={{ fontSize: '19px', fontWeight: 700, color: 'var(--accent-deep)', letterSpacing: '-0.02em', fontFamily: 'var(--font-mono)' }}>
                    {settings.currencySymbol || '₹'}{(item.price * item.qty).toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.cartId)} 
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      color: 'var(--ink-soft)', 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px', 
                      cursor: 'pointer', 
                      transition: 'color 0.2s, transform 0.2s' 
                    }} 
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--red)';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }} 
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--ink-soft)';
                      e.currentTarget.style.transform = 'none';
                    }} 
                    title="Remove Item"
                  >
                    <Trash2 size={13}/> Remove
                  </button>
                </div>

              </div>

              {/* Optional Batch Number for Docke/Ceramic */}
              {(() => {
                const n = (item.className || '').toLowerCase();
                const requiresBatchNo = n.includes('ceramic') || n.includes('clay') || n.includes('pie') || n.includes('bitumen') || n.includes('docke');
                
                if (!requiresBatchNo) return null;
                
                return (
                  <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(99, 102, 241, 0.04)', padding: '12px', borderRadius: '8px', border: '1px dashed rgba(99, 102, 241, 0.25)' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#6366f1', whiteSpace: 'nowrap' }}>
                      Batch No. <span style={{ fontWeight: 400, fontSize: '10px', opacity: 0.7 }}>(optional)</span>
                    </label>
                    <input 
                      type="text" 
                      value={item.batchNo || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setCart(prev => prev.map(k => k.cartId === item.cartId ? { ...k, batchNo: val } : k));
                      }}
                      placeholder="Enter batch code from packaging (optional)..."
                      style={{
                        flex: 1, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '4px', fontSize: '13px', background: 'white', color: 'var(--ink)', outline: 'none'
                      }}
                    />
                  </div>
                );
              })()}
            </div>
          );
        })}
        </div>
      </div>

      {/* RIGHT: Premium Control Panel (Customer Details + Order Summary) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Customer Attachment (Cleaned up, premium labels) */}
        <div style={{ background: 'var(--surface)', padding: '32px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={18} color="var(--accent)"/>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ink)', fontWeight: 500, margin: 0 }}>Customer Details</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="customer-name-input" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--ink-soft)' }}>
                Full Name *
              </label>
              <input 
                id="customer-name-input"
                name="name" 
                value={customer.name || ''} 
                onChange={e => setCustomer({...customer, name: e.target.value})} 
                placeholder="e.g. Salim P P"
                style={{ 
                  padding: '14px 16px', 
                  border: '1.5px solid var(--line)', 
                  borderRadius: 'var(--radius)', 
                  fontSize: '15px', 
                  fontWeight: 500, 
                  background: 'var(--bg)', 
                  color: 'var(--ink)',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="customer-phone-input" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--ink-soft)' }}>
                Phone Number
              </label>
              <input 
                id="customer-phone-input"
                name="phone" 
                value={customer.phone || ''} 
                onChange={e => setCustomer({...customer, phone: e.target.value})} 
                placeholder="e.g. +91 96337 07686"
                style={{ 
                  padding: '14px 16px', 
                  border: '1.5px solid var(--line)', 
                  borderRadius: 'var(--radius)', 
                  fontSize: '15px', 
                  fontWeight: 500, 
                  background: 'var(--bg)', 
                  color: 'var(--ink)',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="customer-address-input" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--ink-soft)' }}>
                Site / Billing Address
              </label>
              <textarea
                id="customer-address-input"
                name="address"
                value={customer.address || ''}
                onChange={e => setCustomer({...customer, address: e.target.value})}
                placeholder="Street address, site details, location..."
                style={{
                  padding: '14px 16px',
                  border: '1.5px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  fontSize: '15px',
                  fontWeight: 500,
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  minHeight: '100px',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: '1.5'
                }}
              />
            </div>

            {/* Quotation Bank Account (CHANGE 5) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="quotation-bank-select" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--ink-soft)' }}>
                Quotation Bank Account
              </label>
              <select
                id="quotation-bank-select"
                value={selectedBankId}
                onChange={e => setSelectedBankId(e.target.value)}
                style={{
                  padding: '14px 16px',
                  border: '1.5px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  fontSize: '15px',
                  fontWeight: 500,
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">No bank selected</option>
                {activeBanks.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName || 'Bank'}{b.accountNumber ? ` · ${b.accountNumber}` : ''}
                  </option>
                ))}
              </select>
              {activeBanks.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  Add bank accounts in Settings → Quotation Specs → Bank Accounts.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Warranty Detector (Added visual feedback matching rules) */}
        {detectedWarranties.length > 0 && (
          <div style={{ 
            background: 'var(--accent-soft)', 
            padding: '24px 32px', 
            borderRadius: 'var(--radius-lg)', 
            border: '1px solid rgba(194, 65, 12, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={18} color="var(--accent)"/>
              <span style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--accent-deep)' }}>
                Warranties Detected ({detectedWarranties.length})
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--ink-mid)', margin: 0, lineHeight: 1.5 }}>
              The system will automatically bundle and generate the following certificates along with your quotation:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {detectedWarranties.map((w, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'white',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  fontSize: '13px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: w.color }} />
                    <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{w.warrantyTitle}</strong>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink-soft)' }}>
                    {w.duration}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* receipt-style Order Summary Panel */}
        <div style={{ 
          background: 'var(--surface)', 
          padding: '40px', 
          borderRadius: 'var(--radius-lg)', 
          border: '1.5px solid var(--ink)',
          display: 'flex', 
          flexDirection: 'column', 
          position: 'relative', 
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}>
          
          {/* Subtle logo seal watermark */}
          <div style={{ 
            position: 'absolute', 
            bottom: '-20px', 
            right: '-20px', 
            fontFamily: 'var(--font-display)', 
            fontSize: '120px', 
            fontWeight: 800, 
            color: 'var(--line-soft)',
            opacity: 0.12, 
            pointerEvents: 'none',
            userSelect: 'none'
          }}>
            NJ.
          </div>

          <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-soft)', fontWeight: 700, marginBottom: '24px' }}>
            Order Invoice Summary
          </h3>

          {/* ── Tax & Discount Controls ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px dashed var(--line)' }}>

            {/* Tax Toggle Row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 'var(--radius)',
              border: `1.5px solid ${taxEnabled ? 'var(--accent)' : 'var(--line)'}`,
              background: taxEnabled ? 'rgba(194, 65, 12, 0.04)' : 'var(--bg)',
              transition: 'all 0.2s', cursor: 'pointer'
            }} onClick={() => setTaxEnabled(v => !v)}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>GST / Tax</div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  {taxEnabled ? `${settings.taxRate || 0}% applied → ${settings.currencySymbol || '₹'}${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'No tax applied'}
                </div>
              </div>
              <div style={{
                width: '44px', height: '24px', borderRadius: '12px',
                background: taxEnabled ? 'var(--accent)' : 'var(--line)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0
              }}>
                <div style={{
                  position: 'absolute', top: '3px',
                  left: taxEnabled ? '23px' : '3px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s'
                }} />
              </div>
            </div>

            {/* Discount Toggle Row */}
            {settings.discountEnabled !== false && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: discountEnabled ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
                border: `1.5px solid ${discountEnabled ? '#16a34a' : 'var(--line)'}`,
                borderBottom: discountEnabled ? '1px solid rgba(22,163,74,0.2)' : `1.5px solid ${discountEnabled ? '#16a34a' : 'var(--line)'}`,
                background: discountEnabled ? 'rgba(22, 163, 74, 0.04)' : 'var(--bg)',
                transition: 'all 0.2s', cursor: 'pointer'
              }} onClick={() => setDiscountEnabled(v => !v)}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Tag size={14} color={discountEnabled ? '#16a34a' : 'var(--ink-soft)'} /> Discount
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                    {discountEnabled
                      ? (discountValue > 0
                          ? `${discountType === 'percent' ? discountValue + '%' : (settings.currencySymbol || '₹') + discountValue} off → -${settings.currencySymbol || '₹'}${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : 'Set amount below')
                      : 'Off — click to enable'}
                  </div>
                </div>
                <div style={{
                  width: '44px', height: '24px', borderRadius: '12px',
                  background: discountEnabled ? '#16a34a' : 'var(--line)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0
                }}>
                  <div style={{
                    position: 'absolute', top: '3px',
                    left: discountEnabled ? '23px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s'
                  }} />
                </div>
              </div>

              {/* Discount Details (expanded) */}
              {discountEnabled && (
                <div style={{
                  padding: '14px 16px', border: '1.5px solid #16a34a', borderTop: 'none',
                  borderRadius: '0 0 var(--radius) var(--radius)',
                  background: 'rgba(22, 163, 74, 0.03)',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  {/* Type toggle buttons */}
                  <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--line)', flexShrink: 0 }}>
                    <button
                      onClick={() => setDiscountType('percent')}
                      style={{
                        padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                        background: discountType === 'percent' ? '#16a34a' : 'var(--bg)',
                        color: discountType === 'percent' ? 'white' : 'var(--ink-soft)',
                        display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
                      }}
                    >
                      <Percent size={12} /> %
                    </button>
                    <button
                      onClick={() => setDiscountType('fixed')}
                      style={{
                        padding: '7px 12px', border: 'none', borderLeft: '1px solid var(--line)', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                        background: discountType === 'fixed' ? '#16a34a' : 'var(--bg)',
                        color: discountType === 'fixed' ? 'white' : 'var(--ink-soft)',
                        display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
                      }}
                    >
                      {settings.currencySymbol || '₹'}
                    </button>
                  </div>

                  {/* Value input */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    {discountType === 'fixed' && (
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', fontWeight: 700, color: '#16a34a' }}>
                        {settings.currencySymbol || '₹'}
                      </span>
                    )}
                    <NumberField
                      min={0}
                      max={discountType === 'percent' ? 100 : undefined}
                      step="any"
                      allowFloat
                      fallback={0}
                      value={discountValue}
                      onCommit={n => setDiscountValue(n)}
                      placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 500'}
                      style={{
                        width: '100%', padding: discountType === 'fixed' ? '9px 12px 9px 28px' : '9px 12px',
                        border: '1.5px solid #16a34a', borderRadius: '6px',
                        fontSize: '16px', fontWeight: 700, background: 'white',
                        color: '#15803d', outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Computed discount */}
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '80px' }}>
                    <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, textTransform: 'uppercase' }}>Saves</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', fontFamily: 'var(--font-mono)' }}>
                      -{settings.currencySymbol || '₹'}{discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Actual subtotal + item-offer savings (only when product offers exist) */}
          {hasOffers && productSavings > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '15px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                <span>Actual Total</span>
                <span style={{ fontFamily: 'var(--font-mono)', textDecoration: 'line-through' }}>{settings.currencySymbol || '₹'}{actualSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '15px', color: '#16a34a', fontWeight: 600 }}>
                <span>Item Offer Savings</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>-{settings.currencySymbol || '₹'}{productSavings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </>
          )}

          {/* Subtotal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '15px', color: 'var(--ink-mid)', fontWeight: 500 }}>
            <span>{hasOffers && productSavings > 0 ? 'Offer Subtotal' : 'Subtotal'}</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{settings.currencySymbol || '₹'}{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          {/* Discount row */}
          {discountEnabled && discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '15px', color: '#16a34a', fontWeight: 600 }}>
              <span>Discount {discountType === 'percent' ? `(${discountValue}%)` : '(Fixed)'}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>-{settings.currencySymbol || '₹'}{discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Tax row */}
          {taxEnabled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px dashed var(--line)', fontSize: '15px', color: 'var(--ink-mid)', fontWeight: 500 }}>
              <span>GST / Tax ({taxRate}%)</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{settings.currencySymbol || '₹'}{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {!taxEnabled && (
            <div style={{ borderBottom: '1px dashed var(--line)', marginBottom: '24px', paddingBottom: discountEnabled && discountAmount > 0 ? '12px' : '0' }} />
          )}

          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)', fontWeight: 700, marginBottom: '8px' }}>
            Total Amount Due
          </div>
          <div style={{ 
            fontFamily: 'var(--font-display)', 
            fontSize: '44px', 
            fontWeight: 600, 
            marginBottom: '40px', 
            letterSpacing: '-0.02em', 
            lineHeight: 1, 
            color: 'var(--accent-deep)' 
          }}>
            {settings.currencySymbol || '₹'}{grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}
          </div>
          
          <button 
            onClick={handleGenerateQuotation} 
            className="btn-primary"
            style={{ 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '12px', 
              padding: '18px 24px', 
              background: 'var(--ink)', 
              border: 'none', 
              borderRadius: 'var(--radius)', 
              fontSize: '15px', 
              fontWeight: 600, 
              color: 'white', 
              cursor: 'pointer', 
              boxShadow: 'var(--shadow-md)', 
              transition: 'all 0.2s', 
              position: 'relative', 
              zIndex: 1,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(194, 65, 12, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--ink)';
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
          >
            <FileText size={18}/> {editingExisting ? 'Update Quotation' : 'Finalize & Generate Quotation'}
          </button>
          
        </div>
      </div>
    </div>
  );
}
