import React from 'react';
import { useAppContext } from '../AppContext';
import { X, Minus, Plus, Trash2 } from 'lucide-react';
import NumberField from './NumberField';

export default function CartDrawer() {
  const { cart, cartOpen, setCartOpen, updateCartQty, removeFromCart, cartTotal, customer, setCurrentView, data } = useAppContext();
  const cur = data?.settings?.currencySymbol || '₹';

  const handleGenerate = () => {
    if (!customer.name) {
      alert("Please enter Customer Name on the home page before checkout.");
      return;
    }
    setCartOpen(false);
    setCurrentView('checkout');
  };

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        zIndex: 999, opacity: cartOpen ? 1 : 0, pointerEvents: cartOpen ? 'auto' : 'none', transition: 'opacity 0.3s'
      }} onClick={() => setCartOpen(false)} />

      {/* Drawer */}
      <div className="glass-dark" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px',
        zIndex: 1000, boxShadow: '-20px 0 60px rgba(0,0,0,0.2)',
        transform: cartOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)',
        display: 'flex', flexDirection: 'column', color: 'white'
      }}>
        <div style={{ padding: '32px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 400 }}>Your Cart</h2>
            <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
              For: {customer.name || 'Unnamed Customer'}
            </div>
          </div>
          <button onClick={() => setCartOpen(false)} style={{ color: 'white', opacity: 0.5 }}><X size={24} /></button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {cart.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--ink-soft)' }}>
              Cart is empty.
            </div>
          ) : (
            cart.map(item => (
              <div key={item.cartId} style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: '16px', alignItems: 'center' }}>
                <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}></div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>{item.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px' }}>{item.color} · ₹{item.price} / {item.unit}</div>
                  
                  <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>
                    <button onClick={() => updateCartQty(item.cartId, item.qty - 1)} style={{ padding: '4px 8px', color: 'white' }}><Minus size={14}/></button>
                    <NumberField value={item.qty} min={1} fallback={1} onCommit={n => updateCartQty(item.cartId, n)} style={{ width: '40px', background: 'transparent', color: 'white', border: 'none', textAlign: 'center', fontSize: '13px' }} />
                    <button onClick={() => updateCartQty(item.cartId, item.qty + 1)} style={{ padding: '4px 8px', color: 'white' }}><Plus size={14}/></button>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>{cur}{item.price * item.qty}</div>
                  <button onClick={() => removeFromCart(item.cartId)} style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                    <Trash2 size={12}/> Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '32px', background: 'rgba(0,0,0,0.5)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
            <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)' }}>Subtotal (before tax)</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 500 }}>{cur}{cartTotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button onClick={() => setCartOpen(false)} style={{ padding: '14px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontSize: '14px', fontWeight: 500 }}>
              Keep Adding
            </button>
            <button 
              onClick={handleGenerate} 
              disabled={cart.length === 0}
              style={{ padding: '14px', borderRadius: 'var(--radius-full)', background: 'var(--accent)', color: 'white', fontSize: '14px', fontWeight: 500, opacity: cart.length === 0 ? 0.5 : 1, transition: 'all 0.2s', boxShadow: 'var(--shadow-glow)' }}
            >
              Checkout →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
