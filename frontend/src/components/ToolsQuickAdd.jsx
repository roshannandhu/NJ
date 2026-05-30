import React, { useState } from 'react';
import { useAppContext } from '../AppContext';

export default function ToolsQuickAdd({ fullScreen }) {
  const { data, addToCart, setCartOpen } = useAppContext();
  const [selections, setSelections] = useState({});
  
  const tools = data.varieties.filter(v => v.classId === 'cls_tools' || (data.classes.find(c => c.id === v.classId)?.type === 'tools'));
  
  if (!tools || tools.length === 0) return null;

  const handleQtyChange = (vId, qty) => {
    setSelections(prev => ({
      ...prev,
      [vId]: { ...prev[vId], qty: Math.max(1, parseInt(qty) || 1) }
    }));
  };

  const handleAddToCart = (tool) => {
    const sel = selections[tool.id] || {};
    const qty = sel.qty || 1;

    addToCart({
      id: tool.id,
      name: tool.name,
      className: 'Tools & Accessories',
      price: tool.basePrice,
      qty: qty,
      unit: tool.unit,
      color: 'Standard',
      image: tool.image
    });
  };

  return (
    <div className="animate-fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 400, letterSpacing: '-0.01em' }}>Tools & Accessories</h2>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>Add necessary installation hardware and accessories.</div>
        </div>
        <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{tools.length} items</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {tools.map(tool => {
          const sel = selections[tool.id] || {};
          const qty = sel.qty || 1;

          return (
            <div key={tool.id} className="hover-lift" style={{ 
              background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', 
              overflow: 'hidden', display: 'flex', flexDirection: 'column'
            }}>
              {tool.image && (
                <div style={{ height: '160px', background: `url(${tool.image}) center/cover no-repeat`, borderBottom: '1px solid var(--line-soft)' }} />
              )}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 500, color: 'var(--ink)' }}>{tool.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>{tool.description}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)' }}>₹{tool.basePrice}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>per {tool.unit}</div>
                  </div>
                </div>
              
              <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: '4px', overflow: 'hidden' }}>
                  <button 
                    onClick={() => handleQtyChange(tool.id, qty - 1)}
                    style={{ width: '36px', height: '40px', background: 'var(--bg)', borderRight: '1px solid var(--line)', fontSize: '18px', border: 'none', borderRight: '1px solid var(--line)', cursor: 'pointer' }}
                  >-</button>
                  <input 
                    type="number" 
                    value={qty} 
                    onChange={(e) => handleQtyChange(tool.id, e.target.value)}
                    style={{ width: '60px', height: '40px', border: 'none', textAlign: 'center', fontSize: '15px', background: 'var(--surface)' }}
                  />
                  <button 
                    onClick={() => handleQtyChange(tool.id, qty + 1)}
                    style={{ width: '36px', height: '40px', background: 'var(--bg)', borderLeft: '1px solid var(--line)', fontSize: '18px', border: 'none', borderLeft: '1px solid var(--line)', cursor: 'pointer' }}
                  >+</button>
                </div>
                <button 
                  className="btn-primary"
                  onClick={() => handleAddToCart(tool)}
                  style={{ flex: 1, padding: '0', height: '40px', fontSize: '12px' }}
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
}
