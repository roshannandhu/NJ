import React from 'react';
import { useAppContext } from '../AppContext';
import { Minus, Plus, Trash2, ShieldCheck, FileText } from 'lucide-react';
import NumberField from './NumberField';
export default function LiveQuotation() {
  const {
    cart,
    updateCartQty,
    removeFromCart,
    cartTotal,
    customer,
    setCurrentView,
    data,
    setGenerateIntent,
  } = useAppContext();

  const [isPulsing, setIsPulsing] = React.useState(false);
  const prevCartLength = React.useRef(cart.length);
  React.useEffect(() => {
    if (cart.length > prevCartLength.current) {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 400);
    }
    prevCartLength.current = cart.length;
  }, [cart.length]);

  // Every action routes THROUGH the Checkout page: pick what to produce
  // ('quote' | 'both' | 'warranty') and review/finalize there. Nothing is
  // generated directly from the desk.
  const goCheckout = (intent) => {
    if (!customer.name) {
      alert("Please enter Customer Name before continuing.");
      return;
    }
    if (cart.length === 0) return;
    setGenerateIntent(intent);
    setCurrentView('checkout');
  };

  const settings = data?.settings || {};
  const cur = settings.currencySymbol || '₹';
  const taxRate = (settings.taxEnabled ?? true) ? (Number(settings.taxRate) || 0) : 0;
  const taxAmount = Math.round(cartTotal * taxRate) / 100;
  const grandTotal = cartTotal + taxAmount;

  return (
    <div className={isPulsing ? 'animate-pulse-glow' : ''} style={{
      background: '#FFFFFF',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
      transition: 'all 0.2s'
    }}>
        <div style={{ padding: '18px 24px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--ink-soft)' }}>
            Quotation Items ({cart.length})
          </h3>
        </div>

        {/* Cart Items Section (Independently scrollable) */}
        <div style={{ flex: cart.length === 0 ? '0 0 160px' : 1, overflowY: 'auto', padding: '16px 24px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '40px 0', fontSize: '13px' }}>
              Quotation is empty.<br/>Select items from the catalog.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {cart.map(item => (
                <div key={item.cartId} style={{ display: 'flex', gap: '12px', paddingBottom: '16px', borderBottom: '1px dashed var(--line-soft)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', marginBottom: '4px' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                      {item.color !== 'Standard' && <span>{item.color} · </span>}
                      {cur}{item.price} / {item.unit}
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: '4px' }}>
                      <button onClick={() => updateCartQty(item.cartId, item.qty - 1)} style={{ padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer' }}><Minus size={14} color="var(--ink-mid)"/></button>
                      <NumberField value={item.qty} min={1} fallback={1} onCommit={n => updateCartQty(item.cartId, n)} style={{ width: '40px', border: 'none', textAlign: 'center', fontSize: '13px', background: 'transparent' }} />
                      <button onClick={() => updateCartQty(item.cartId, item.qty + 1)} style={{ padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer' }}><Plus size={14} color="var(--ink-mid)"/></button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{cur}{item.price * item.qty}</div>
                    <button onClick={() => removeFromCart(item.cartId)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', fontSize: '11px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', cursor: 'pointer' }}>
                      <Trash2 size={12}/> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & Generate Section (Fixed bottom) */}
        <div style={{ padding: '24px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: 'var(--ink-mid)' }}>
            <span>Subtotal</span>
            <span>{cur}{cartTotal.toFixed(2)}</span>
          </div>
          {taxRate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '13px', color: 'var(--ink-mid)' }}>
              <span>Tax ({taxRate}%)</span>
              <span>{cur}{taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>Total</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)' }}>{cur}{grandTotal.toFixed(2)}</span>
          </div>

          {(() => {
            const disabled = cart.length === 0;
            const greenBtn = {
              width: '100%', marginTop: '10px', padding: '13px', fontSize: '14px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: 'transparent', color: '#15803d', border: '1.5px solid #15803d',
              borderRadius: 'var(--radius)',
              opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
            };
            return (
              <>
                {/* Quotation + warranty together (primary) — review in Checkout */}
                <button
                  className="btn-primary"
                  onClick={() => goCheckout('both')}
                  disabled={disabled}
                  title="Review in Checkout, then generate the quotation and its warranty certificate(s)"
                  style={{
                    width: '100%', padding: '16px', fontSize: '15px',
                    background: 'var(--accent)', color: 'var(--surface)',
                    opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
                    boxShadow: disabled ? 'none' : 'var(--shadow-glow)'
                  }}
                >
                  Generate Quot + Warranty →
                </button>

                {/* Warranty only — review in Checkout, then issue the certificate */}
                <button
                  onClick={() => goCheckout('warranty')}
                  disabled={disabled}
                  title="Review in Checkout, then create a warranty certificate (no quotation)"
                  style={greenBtn}
                >
                  <ShieldCheck size={16} /> Warranty Only
                </button>

                {/* Quotation only — review in Checkout, then generate the quotation */}
                <button
                  onClick={() => goCheckout('quote')}
                  disabled={disabled}
                  title="Review in Checkout, then generate just the quotation (no warranty)"
                  style={greenBtn}
                >
                  <FileText size={16} /> Quotation
                </button>
              </>
            );
          })()}
        </div>
      </div>
  );
}
