import React, { useState } from 'react';
import { X, Plus, Layers, Sparkles } from 'lucide-react';
import { useAppContext } from '../AppContext';
import './MobileEditor.css';

export default function MobileAddItemSheet({ isOpen, onClose, onAddItem }) {
  const { data, registerBackHandler } = useAppContext();
  const [tab, setTab] = useState('catalog'); // 'catalog' | 'custom'
  const [selectedClassId, setSelectedClassId] = useState(null);

  // Custom Item Form state
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customUnit, setCustomUnit] = useState('Sqft');

  // Hardware back button to close drawer
  React.useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      if (selectedClassId) {
        setSelectedClassId(null);
        return true;
      }
      onClose();
      return true;
    });
  }, [isOpen, selectedClassId, registerBackHandler, onClose]);

  if (!isOpen) return null;

  const classes = data.classes || [];
  const varieties = data.varieties || [];
  const selectedClass = classes.find(c => c.id === selectedClassId);
  const filteredVarieties = selectedClassId
    ? varieties.filter(v => v.classId === selectedClassId)
    : [];

  const handleAddCustom = (e) => {
    e.preventDefault();
    if (!customName.trim()) return;
    onAddItem({
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      className: 'Custom',
      price: parseFloat(customPrice) || 0,
      qty: parseFloat(customQty) || 1,
      unit: customUnit || 'Unit',
      color: 'N/A',
      isCustom: true,
    });
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    onClose();
  };

  return (
    <div className="mobile-sheet-overlay" onClick={onClose} style={{ zIndex: 11000 }}>
      <div className="mobile-sheet-panel" onClick={e => e.stopPropagation()}>
        <div className="mobile-sheet-handle" />

        {/* Header with Tabs */}
        <div className="mobile-sheet-head" style={{ borderBottom: 'none', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => { setTab('catalog'); setSelectedClassId(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                background: tab === 'catalog' ? 'var(--accent)' : 'var(--line)',
                color: tab === 'catalog' ? '#fff' : 'var(--ink-soft)',
                cursor: 'pointer',
              }}
            >
              <Layers size={14} /> Catalog
            </button>
            <button
              type="button"
              onClick={() => setTab('custom')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                background: tab === 'custom' ? 'var(--accent)' : 'var(--line)',
                color: tab === 'custom' ? '#fff' : 'var(--ink-soft)',
                cursor: 'pointer',
              }}
            >
              <Sparkles size={14} /> Custom Item
            </button>
          </div>

          <button
            type="button"
            className="mobile-sheet-close"
            onClick={() => {
              if (selectedClassId) setSelectedClassId(null);
              else onClose();
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="mobile-sheet-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {tab === 'catalog' ? (
            !selectedClassId ? (
              // Step 1: Product Classes
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                  Select Category
                </div>
                {classes.map(cls => (
                  <div
                    key={cls.id}
                    className="mobile-sheet-catalog-item"
                    onClick={() => setSelectedClassId(cls.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>{cls.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                        {cls.subtitle || `${varieties.filter(v => v.classId === cls.id).length} varieties`}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>Browse →</span>
                  </div>
                ))}
              </div>
            ) : (
              // Step 2: Varieties in Class
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedClassId(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: '10px',
                    padding: 0,
                  }}
                >
                  ← Back to Categories ({selectedClass?.name})
                </button>
                {filteredVarieties.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-soft)' }}>
                    No products in this category.
                  </div>
                ) : (
                  filteredVarieties.map(item => (
                    <div
                      key={item.id}
                      className="mobile-sheet-catalog-item"
                      onClick={() => {
                        const defaultColor = item.colors?.[0]?.name || 'Standard';
                        onAddItem({
                          id: `${item.id}-${defaultColor}`,
                          name: item.name,
                          className: selectedClass?.name || 'Products',
                          price: item.basePrice || 0,
                          qty: 1,
                          unit: item.unit || 'Sqft',
                          color: defaultColor,
                        });
                        onClose();
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          ₹{(item.basePrice || 0).toLocaleString('en-IN')} / {item.unit || 'Sqft'}
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: 'rgba(194, 65, 12, 0.1)',
                          color: 'var(--accent)',
                          border: 'none',
                          fontWeight: 700,
                          fontSize: '12px',
                        }}
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            )
          ) : (
            // Custom Item Form
            <form onSubmit={handleAddCustom} style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px' }}>
              <div className="mobile-field">
                <label>Item Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ridge Cap, Valley Gutter, Labor"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="mobile-field">
                  <label>Unit Price (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={customPrice}
                    onChange={e => setCustomPrice(e.target.value)}
                    required
                  />
                </div>
                <div className="mobile-field">
                  <label>Initial Quantity *</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    placeholder="1"
                    value={customQty}
                    onChange={e => setCustomQty(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mobile-field">
                <label>Unit Type</label>
                <select value={customUnit} onChange={e => setCustomUnit(e.target.value)}>
                  <option value="Sqft">Sqft</option>
                  <option value="Nos">Nos (Pieces)</option>
                  <option value="Rft">Rft (Running Feet)</option>
                  <option value="Bundle">Bundle</option>
                  <option value="Box">Box</option>
                  <option value="Hours">Hours</option>
                  <option value="Unit">Unit</option>
                </select>
              </div>

              <button
                type="submit"
                className="mobile-btn-primary"
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '15px',
                  marginTop: '6px',
                }}
              >
                + Add Custom Item to Page
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
