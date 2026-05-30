import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft, Minus, Plus, ShoppingCart } from 'lucide-react';

export default function VarietyDetail() {
  const { data, selectedVarietyId, selectedClassId, setCurrentView, addToCart, setCartOpen } = useAppContext();
  const cls = data.classes.find(c => c.id === selectedClassId);
  const variety = data.varieties.find(v => v.id === selectedVarietyId);
  
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [qty, setQty] = useState(1);

  if (!variety) return <div onClick={() => setCurrentView('varieties')}>Back</div>;

  const selectedColor = variety.colors[selectedColorIdx];
  const finalPrice = variety.basePrice + (selectedColor ? selectedColor.offset : 0);

  const handleAdd = () => {
    addToCart({
      id: variety.id,
      name: variety.name,
      className: cls.name,
      price: finalPrice,
      qty,
      unit: variety.unit,
      color: selectedColor ? selectedColor.name : 'Standard',
      image: variety.image
    });
    setCurrentView('varieties');
    setCartOpen(true);
  };

  return (
    <div className="animate-fade-up">
      <button 
        onClick={() => setCurrentView('varieties')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink-mid)', marginBottom: '24px', fontWeight: 500 }}
      >
        <ArrowLeft size={16} /> Back to Varieties
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '48px' }}>
        <div style={{ background: 'var(--line-soft)', borderRadius: 'var(--radius-lg)', height: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100px', height: '100px', background: selectedColor ? selectedColor.hex : '#ccc', borderRadius: '50%', boxShadow: 'var(--shadow-lg)' }}></div>
        </div>
        
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', fontWeight: 600, marginBottom: '12px' }}>
            {cls.name}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '36px', marginBottom: '16px', lineHeight: 1.1 }}>
            {variety.name}
          </h1>
          <p style={{ color: 'var(--ink-mid)', fontSize: '15px', lineHeight: 1.6, marginBottom: '32px' }}>
            {variety.description}
          </p>

          <div style={{ fontFamily: 'var(--font-display)', fontSize: '40px', fontWeight: 500, color: 'var(--ink)', marginBottom: '8px' }}>
            ₹{finalPrice} <span style={{ fontFamily: 'var(--font-body)', fontSize: '16px', color: 'var(--ink-soft)', fontWeight: 400 }}>/ {variety.unit}</span>
          </div>

          <div style={{ margin: '32px 0' }}>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)', fontWeight: 600, marginBottom: '16px' }}>
              Select Color
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {variety.colors.map((c, i) => (
                <div key={i} 
                  onClick={() => setSelectedColorIdx(i)}
                  style={{
                    border: '2px solid',
                    borderColor: selectedColorIdx === i ? 'var(--accent)' : 'var(--line)',
                    background: selectedColorIdx === i ? 'var(--accent-soft)' : 'white',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ width: '24px', height: '24px', background: c.hex, borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)' }}></div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{c.name}</div>
                    {c.offset !== 0 && <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{c.offset > 0 ? '+' : ''}₹{c.offset}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ padding: '12px 16px', background: 'var(--surface)', borderRight: '1px solid var(--line)' }}><Minus size={16}/></button>
              <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value)||1))} style={{ width: '80px', border: 'none', textAlign: 'center', fontSize: '16px', fontWeight: 500, background: 'transparent' }} />
              <button onClick={() => setQty(qty + 1)} style={{ padding: '12px 16px', background: 'var(--surface)', borderLeft: '1px solid var(--line)' }}><Plus size={16}/></button>
            </div>
            
            <button className="btn-primary" onClick={handleAdd} style={{ flex: 1, padding: '16px 24px', fontSize: '15px' }}>
              <ShoppingCart size={18}/> Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
