import { useState } from 'react';
import { useAppContext } from '../AppContext';

export default function ProductCatalog() {
  const { data, addToCart } = useAppContext();

  // State to track selected colors and quantities for each variety
  // Keyed by variety ID
  const [selections, setSelections] = useState({});

  const handleColorSelect = (vId, color) => {
    setSelections(prev => ({
      ...prev,
      [vId]: { ...prev[vId], color: color.name }
    }));
  };

  const handleQtyChange = (vId, qty) => {
    setSelections(prev => ({
      ...prev,
      [vId]: { ...prev[vId], qty: Math.max(1, parseInt(qty) || 1) }
    }));
  };

  const handleAddToCart = (variety, cls) => {
    const sel = selections[variety.id] || {};
    const qty = sel.qty || 1;
    // Default to first color if none selected and colors exist
    const color = sel.color || (variety.colors?.length > 0 ? variety.colors[0].name : 'Standard');

    addToCart({
      id: variety.id + '-' + color, // unique id for cart
      name: variety.name,
      className: cls.name,
      price: variety.basePrice,
      qty: qty,
      unit: variety.unit,
      color: color
    });
  };

  // Group varieties by class
  const mainClasses = data.classes.filter(c => c.type !== 'tools');

  return (
    <div className="animate-fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400, letterSpacing: '-0.01em' }}>Product Catalog</h2>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>Select products directly below to add them to your quotation.</div>
        </div>
      </div>

      {mainClasses.map(cls => {
        const clsVarieties = data.varieties.filter(v => v.classId === cls.id);
        if (clsVarieties.length === 0) return null;

        return (
          <div key={cls.id} style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>{cls.name}</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '16px' }}>{cls.description}</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {clsVarieties.map(v => {
                const sel = selections[v.id] || {};
                const selectedColor = sel.color || (v.colors?.length > 0 ? v.colors[0].name : null);
                const qty = sel.qty || 1;

                return (
                  <div key={v.id} className="hover-lift" style={{ 
                    background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', 
                    overflow: 'hidden', display: 'flex', flexDirection: 'column'
                  }}>
                    <div style={{ height: '160px', background: v.image ? `url(${v.image}) center/cover no-repeat` : cls.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
                      {!v.image && <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', letterSpacing: '0.05em' }}>{cls.name.split(' ')[0]}</span>}
                    </div>
                    <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 500 }}>{v.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{v.description}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>₹{v.basePrice}</div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>per {v.unit}</div>
                        </div>
                      </div>

                      {/* Colors */}
                      {v.colors && v.colors.length > 0 && (
                        <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)', marginBottom: '8px' }}>Select Color</div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {v.colors.map(c => (
                              <div 
                                key={c.name}
                                onClick={() => handleColorSelect(v.id, c)}
                                style={{ 
                                  width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
                                  background: c.image ? `url(${c.image}) center/cover` : c.hex,
                                  border: selectedColor === c.name ? '3px solid var(--accent)' : '1px solid var(--line)',
                                  boxShadow: selectedColor === c.name ? '0 0 0 2px var(--surface) inset' : 'none',
                                  title: c.name,
                                  transition: 'all 0.2s'
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--line-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: '4px', overflow: 'hidden' }}>
                          <button 
                            onClick={() => handleQtyChange(v.id, qty - 1)}
                            style={{ width: '32px', height: '36px', background: 'var(--bg)', borderRight: '1px solid var(--line)', fontSize: '16px' }}
                          >-</button>
                          <input 
                            type="number" 
                            value={qty} 
                            onChange={(e) => handleQtyChange(v.id, e.target.value)}
                            style={{ width: '50px', height: '36px', border: 'none', textAlign: 'center', fontSize: '14px', background: 'var(--surface)' }}
                          />
                          <button 
                            onClick={() => handleQtyChange(v.id, qty + 1)}
                            style={{ width: '32px', height: '36px', background: 'var(--bg)', borderLeft: '1px solid var(--line)', fontSize: '16px' }}
                          >+</button>
                        </div>
                        <button 
                          className="btn-primary"
                          onClick={() => handleAddToCart(v, cls)}
                          style={{ flex: 1, padding: '0', height: '36px', fontSize: '12px' }}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
