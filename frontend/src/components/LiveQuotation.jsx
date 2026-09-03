import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { mediaUrl, retryMediaImage } from '../api';
import { warrantyTemplatesForQuotation } from '../warranty';
import NumberField from './NumberField';

const money = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function LiveQuotation() {
  const {
    cart,
    setCart,
    updateCartQty,
    removeFromCart,
    cartTotal,
    customer,
    setCurrentView,
    data,
    setGenerateIntent,
    addonQuotationId,
    showToast,
  } = useAppContext();

  const [isPulsing, setIsPulsing] = React.useState(false);
  const prevCartLength = React.useRef(cart.length);
  React.useEffect(() => {
    if (cart.length > prevCartLength.current) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 400);
      prevCartLength.current = cart.length;
      return () => clearTimeout(timer);
    }
    prevCartLength.current = cart.length;
    return undefined;
  }, [cart.length]);

  const settings = data?.settings || {};
  const cur = settings.currencySymbol || '\u20B9';
  const taxRate = (settings.taxEnabled ?? true) ? (Number(settings.taxRate) || 0) : 0;
  const taxAmount = Math.round(cartTotal * taxRate) / 100;
  const grandTotal = cartTotal + taxAmount;
  const itemQty = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const customerReady = Boolean(customer.name?.trim());
  const warrantyTemplates = warrantyTemplatesForQuotation({ items: cart }, data);
  const hasWarranty = warrantyTemplates.length > 0;
  const brandName = cart.find(item => item.brandName)?.brandName || '';

  // All finalization remains in Checkout. The desk only chooses the existing
  // intent and gives immediate feedback when required information is missing.
  const goCheckout = (intent) => {
    if (!customerReady) {
      showToast('Add the customer name before reviewing the quotation', 'error');
      document.querySelector('.qd2-customer input[name="name"]')?.focus();
      return;
    }
    if (cart.length === 0) return;
    if ((intent === 'both' || intent === 'warranty') && !hasWarranty) {
      showToast('These products do not have a linked warranty template', 'error');
      return;
    }
    setGenerateIntent(intent);
    setCurrentView('checkout');
  };

  const clearQuotation = () => {
    if (!window.confirm('Clear all items from this quotation?')) return;
    setCart([]);
    showToast('Quotation items cleared', 'info');
  };

  const primaryIntent = addonQuotationId ? 'quote' : (hasWarranty ? 'both' : 'quote');
  const primaryLabel = addonQuotationId
    ? 'Review add-on order'
    : (hasWarranty ? 'Review quote + warranty' : 'Review quotation');

  return (
    <div className={`lq${isPulsing ? ' animate-pulse-glow' : ''}`} aria-live="polite">
      <header className="lq-head">
        <div className="lq-title">
          <span className="lq-title-icon"><ShoppingBag size={17} /></span>
          <span>
            <small>{addonQuotationId ? 'Add-on draft' : 'Live quotation'}</small>
            <strong>{cart.length ? `${cart.length} line${cart.length === 1 ? '' : 's'} / ${itemQty} unit${itemQty === 1 ? '' : 's'}` : 'Start building'}</strong>
          </span>
        </div>
        {cart.length > 0 && (
          <button type="button" className="lq-clear" onClick={clearQuotation} title="Clear all quotation items">
            <Trash2 size={13} /> Clear
          </button>
        )}
      </header>

      <div className={`lq-items${cart.length === 0 ? ' is-empty' : ''}`}>
        {cart.length === 0 ? (
          <div className="lq-empty">
            <span className="lq-empty-icon"><ShoppingBag size={24} /></span>
            <strong>Your quotation is empty</strong>
            <p>Select a brand, open a product class, then add the required quantity.</p>
            <div className="lq-empty-steps">
              <span><b>1</b> Choose class</span>
              <span><b>2</b> Add products</span>
              <span><b>3</b> Review</span>
            </div>
          </div>
        ) : (
          <div className="lq-list">
            {cart.map(item => (
              <article className="lq-item" key={item.cartId}>
                <div className="qd2-lq-media">
                  {item.displayImage || item.image
                    ? <img src={mediaUrl(item.displayImage || item.image)} alt={item.name} loading="lazy" decoding="async" onError={retryMediaImage} />
                    : <div className="qd2-lq-fallback"><ImageIcon size={16} /></div>}
                </div>
                <div className="lq-item-main">
                  <div className="lq-item-class">{item.className || 'Product'}</div>
                  <h4>{item.name}</h4>
                  <p>{item.color !== 'Standard' ? `${item.color} / ` : ''}{cur}{money(item.price)} per {item.unit}</p>
                  <div className="lq-stepper">
                    <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateCartQty(item.cartId, item.qty - 1)}><Minus size={14} /></button>
                    <NumberField value={item.qty} min={1} step="any" allowFloat fallback={1} onCommit={n => updateCartQty(item.cartId, n)} aria-label={`${item.name} quotation quantity`} />
                    <button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => updateCartQty(item.cartId, item.qty + 1)}><Plus size={14} /></button>
                    <span>{item.unit}</span>
                  </div>
                </div>
                <div className="lq-item-side">
                  <strong>{cur}{money(item.price * item.qty)}</strong>
                  <button type="button" onClick={() => removeFromCart(item.cartId)} aria-label={`Remove ${item.name}`}><Trash2 size={13} /> Remove</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="lq-summary">
        {cart.length > 0 && (
          <div className="lq-readiness">
            <span className="lq-ready-chip"><PackageCheck size={13} /> {brandName || 'Accessories'} draft</span>
            {hasWarranty ? (
              <span className="lq-ready-chip is-warranty"><ShieldCheck size={13} /> {warrantyTemplates.length} warranty {warrantyTemplates.length === 1 ? 'certificate' : 'certificates'}</span>
            ) : (
              <span className="lq-ready-chip is-muted"><FileText size={13} /> Quotation only</span>
            )}
          </div>
        )}

        <div className="lq-totals">
          <div><span>Subtotal</span><b>{cur}{money(cartTotal)}</b></div>
          {taxRate > 0 && <div><span>Tax ({taxRate}%)</span><b>{cur}{money(taxAmount)}</b></div>}
          <div className="lq-total"><span>Estimated total</span><strong>{cur}{money(grandTotal)}</strong></div>
        </div>

        {cart.length > 0 && !customerReady && (
          <div className="lq-customer-note"><span>1</span> Add the customer name to continue</div>
        )}

        <button type="button" className="lq-primary" onClick={() => goCheckout(primaryIntent)} disabled={cart.length === 0}>
          <CheckCircle2 size={17} /> {primaryLabel} <span><ArrowRight size={16} /></span>
        </button>

        {!addonQuotationId && hasWarranty && (
          <div className="lq-secondary-actions">
            <button type="button" onClick={() => goCheckout('warranty')} disabled={cart.length === 0}>
              <ShieldCheck size={15} /> Warranty only
            </button>
            <button type="button" onClick={() => goCheckout('quote')} disabled={cart.length === 0}>
              <FileText size={15} /> Quotation only
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
