import React from 'react';
import {
  Check,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  Lock,
  Minus,
  Package,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Wrench
} from 'lucide-react';
import { mediaUrl, retryMediaImage } from '../api';
import { isToolItem } from '../brands';
import { allItemsOf } from '../addons';
import { useAppContext } from '../AppContext';
import LiveQuotation from './LiveQuotation';
import NumberField from './NumberField';
import './QuotationDesk.css';

const TOOLS_SECTION_ID = 'tools';
const getVarietyClass = (classes, variety) => classes.find(c => c.id === variety.classId);
const escapeCssUrl = (url) => mediaUrl(url).replace(/"/g, '\\"');
const getColorOffset = (color) => Number(color?.offset ?? color?.priceOffset ?? 0) || 0;
const matchesSearch = (item, cls, search) => {
  if (!search) return true;
  return [item.name, item.description, cls?.name, cls?.subtitle]
    .filter(Boolean)
    .some(text => text.toLowerCase().includes(search));
};

export default function QuotationDesk() {
  const { data, cart, cartTotal, addToCart, customer, setCustomer, showToast, addonQuotationId, cancelAddonOrder, setCurrentView } = useAppContext();
  const cur = data?.settings?.currencySymbol || '₹';

  const addonTarget = React.useMemo(
    () => (addonQuotationId ? (data.quotations || []).find(q => q.id === addonQuotationId) || null : null),
    [addonQuotationId, data.quotations]
  );

  const [catalogView, setCatalogView] = React.useState('products');
  const [search, setSearch] = React.useState('');
  const [selections, setSelections] = React.useState({});
  const [addedItems, setAddedItems] = React.useState({});
  const [activeClassId, setActiveClassId] = React.useState(null);
  const [openBrandId, setOpenBrandId] = React.useState(null);
  const [moreCustomer, setMoreCustomer] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState('customer');
  const brandOpenedAt = React.useRef(0); // ghost-touch guard: timestamp of last brand expand

  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 860);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const handler = e => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const hasName = !!customer.name?.trim() || !!addonQuotationId;
  const hasItems = cart.length > 0;

  // Push a sentinel so hardware/browser back has an entry to intercept on mobile
  React.useEffect(() => {
    if (!isMobile) return;
    window.history.pushState({ nj: 'qd' }, '');
  }, [isMobile]);

  // Hardware back: step back through browse hierarchy instead of navigating away
  React.useEffect(() => {
    if (!isMobile) return;
    const onPop = () => {
      if (activeClassId) {
        setActiveClassId(null);
        setSearch('');
        window.history.pushState({ nj: 'qd' }, ''); // re-sentinel for next back
      } else if (openBrandId && mobileTab === 'browse') {
        setOpenBrandId(null);
        window.history.pushState({ nj: 'qd' }, ''); // re-sentinel for next back
      }
      // at root level: let browser handle it (navigate away)
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isMobile, activeClassId, openBrandId, mobileTab]);

  const goTab = (tab) => {
    if (tab !== 'customer' && !customer.name?.trim() && !addonQuotationId) {
      showToast('Enter customer name first', 'info');
      setMobileTab('customer');
      return;
    }
    setMobileTab(tab);
  };

  const toolsActive = catalogView === TOOLS_SECTION_ID;
  const normalizedSearch = search.trim().toLowerCase();

  const brands = React.useMemo(
    () => (data.brands || []).filter(b => b.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [data.brands]
  );
  const fallbackBrandId = (data.brands || [])[0]?.id;
  const brandOf = (cls) => ((data.brands || []).some(b => b.id === cls?.brandId) ? cls.brandId : fallbackBrandId);

  const tileClasses = React.useMemo(() => (data.classes || []).filter(c => c.type !== 'tools'), [data.classes]);
  const toolClasses = React.useMemo(() => (data.classes || []).filter(c => c.type === 'tools'), [data.classes]);
  const railClasses = toolsActive ? toolClasses : tileClasses;

  const brandGroups = React.useMemo(() => {
    if (toolsActive) {
      return toolClasses.length ? [{ brand: null, items: toolClasses }] : [];
    }
    const groups = [];
    for (const b of brands) {
      const items = railClasses.filter(c => brandOf(c) === b.id);
      if (items.length) groups.push({ brand: b, items });
    }
    const orphan = railClasses.filter(c => !brands.some(b => b.id === brandOf(c)));
    if (orphan.length) groups.push({ brand: null, items: orphan });
    return groups;
  }, [brands, railClasses, toolsActive, toolClasses]);

  const lockedByBrandIds = React.useMemo(() => {
    const ids = new Set();
    const source = addonTarget ? [...(cart || []), ...allItemsOf(addonTarget)] : (cart || []);
    source.forEach(it => {
      if (isToolItem(it, data)) return;
      const id = it.brandId ?? (data.classes || []).find(c => c.name === it.className)?.brandId;
      if (id) ids.add(id);
    });
    return ids;
  }, [cart, data, addonTarget]);

  const isBrandLocked = (brand) =>
    lockedByBrandIds.size > 0 && !lockedByBrandIds.has(brand?.id || fallbackBrandId);
  const lockedToName = React.useMemo(() => {
    const firstId = lockedByBrandIds.values().next().value;
    return (data.brands || []).find(b => b.id === firstId)?.name
      || (cart || []).find(it => it.brandName)?.brandName || 'another brand';
  }, [lockedByBrandIds, data.brands, cart]);
  const showLockToast = () =>
    showToast(addonTarget
      ? `Add-on items must match the quotation's brand (${lockedToName})`
      : `This quotation already has ${lockedToName} products — clear the cart to switch brands`, 'error');

  React.useEffect(() => {
    if (activeClassId && !railClasses.some(c => c.id === activeClassId)) {
      setActiveClassId(null);
    }
    if (openBrandId && !brandGroups.some(g => (g.brand?.id || 'orphan') === openBrandId)) {
      setOpenBrandId(null);
    }
    if (!toolsActive && openBrandId) {
      const openGroup = brandGroups.find(g => (g.brand?.id || 'orphan') === openBrandId);
      if (openGroup && isBrandLocked(openGroup.brand)) {
        setOpenBrandId(null);
        setActiveClassId(null);
      }
    }
  }, [railClasses, activeClassId, brandGroups, openBrandId, toolsActive, lockedByBrandIds]);

  const toggleBrand = (brand, items) => {
    const id = brand?.id || 'orphan';
    if (openBrandId === id) {
      setOpenBrandId(null);
      setActiveClassId(null);
    } else {
      setOpenBrandId(id);
      setActiveClassId(window.innerWidth > 860 ? (items[0]?.id || null) : null);
      setSearch('');
      brandOpenedAt.current = Date.now(); // mark expand time for ghost-touch guard
    }
  };

  const allClasses = data.classes || [];
  const allVarieties = data.varieties || [];
  const classVarietyCount = (id) => allVarieties.filter(v => v.classId === id).length;
  const getClassVarieties = (classId) => allVarieties
    .filter(v => v.classId === classId)
    .filter(v => matchesSearch(v, getVarietyClass(allClasses, v), normalizedSearch));

  const setSelection = (id, patch) => setSelections(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const getSelectedColor = (item) => (selections[item.id]?.color) || item.colors?.[0]?.name || 'Standard';
  const getSelectedColorInfo = (item) => item.colors?.find(c => c.name === getSelectedColor(item));
  const getSelectedQty = (item) => selections[item.id]?.qty || 1;
  const getItemPrice = (item) => item.basePrice + getColorOffset(getSelectedColorInfo(item));

  const addItem = (item) => {
    const cls = getVarietyClass(allClasses, item);
    const color = getSelectedColor(item);
    const qty = getSelectedQty(item);
    const price = getItemPrice(item);
    const isTool = cls?.type === 'tools' || item.classId === 'cls_tools';
    const brandId = isTool ? null : brandOf(cls);
    const brand = (data.brands || []).find(b => b.id === brandId);
    const ok = addToCart({
      id: `${item.id}-${color}`,
      name: item.name,
      className: cls?.name || (isTool ? 'Tools & Accessories' : 'Products'),
      brandId,
      brandName: brand?.name || '',
      price, qty, unit: item.unit, color, image: getSelectedColorInfo(item)?.image || item.image,
    });
    if (!ok) return;
    setSelection(item.id, { qty: 1 });
    setAddedItems(prev => ({ ...prev, [item.id]: true }));
    setTimeout(() => setAddedItems(prev => ({ ...prev, [item.id]: false })), 1400);
  };

  const activeClass = allClasses.find(c => c.id === activeClassId) || null;
  const activeBrand = activeClass ? brands.find(b => b.id === brandOf(activeClass)) : null;

  const searchResults = React.useMemo(() => {
    if (!normalizedSearch) return null;
    const searchable = (!toolsActive && lockedByBrandIds.size > 0)
      ? railClasses.filter(cls => lockedByBrandIds.has(brandOf(cls)))
      : railClasses;
    return searchable.flatMap(cls => getClassVarieties(cls.id));
  }, [normalizedSearch, railClasses, toolsActive, lockedByBrandIds]);
  const gridItems = normalizedSearch ? searchResults : (activeClass ? getClassVarieties(activeClass.id) : []);

  const renderCard = (item, index) => {
    const cls = getVarietyClass(allClasses, item) || {};
    const isTool = cls.type === 'tools' || item.classId === 'cls_tools';
    const selectedColor = getSelectedColor(item);
    const colorInfo = getSelectedColorInfo(item);
    const price = getItemPrice(item);
    const qty = getSelectedQty(item);
    const activeImage = colorInfo?.image || item.image;

    return (
      <article key={item.id} className="qd2-card" style={{ '--i': index }}>
        <div className={`qd2-card-media${isTool ? ' is-tool' : ''}`}>
          {activeImage ? (
            <img key={activeImage} src={mediaUrl(activeImage)} alt={item.name} onError={retryMediaImage} />
          ) : (
            <div className="qd2-card-fallback">
              {isTool ? <Wrench size={26} /> : <ImageIcon size={26} />}
              <span>{cls.subtitle || cls.name || 'Product'}</span>
            </div>
          )}
          {!isTool && item.colors?.length > 0 && (
            <span className="qd2-color-badge">{selectedColor}</span>
          )}
        </div>

        <div className="qd2-card-body">
          {!isTool && item.colors?.length > 0 && (
            <div className="qd2-swatches" aria-label={`Colors for ${item.name}`}>
              {item.colors.map(color => (
                <button
                  key={color.name}
                  type="button"
                  title={color.name}
                  aria-label={color.name}
                  onClick={() => setSelection(item.id, { color: color.name })}
                  className={`qd2-swatch${selectedColor === color.name ? ' is-selected' : ''}`}
                  style={{ background: color.image ? `url("${escapeCssUrl(color.image)}") center/cover` : (color.hex || '#d6d3cc') }}
                >
                  {selectedColor === color.name && <Check size={12} />}
                </button>
              ))}
            </div>
          )}

          <div className="qd2-card-title">
            <h3>{item.name}</h3>
            <p>{item.description || cls.name || (normalizedSearch ? cls.name : 'Ready to add to quotation')}</p>
          </div>

          <div className="qd2-card-price">{cur} {price}<span> / {item.unit}</span></div>

          <div className="qd2-card-actions">
            <div className="qd2-stepper">
              <button type="button" onClick={() => setSelection(item.id, { qty: Math.max(1, qty - 1) })} aria-label="Decrease quantity"><Minus size={14} /></button>
              <NumberField value={qty} min={1} step="any" allowFloat fallback={1} onCommit={n => setSelection(item.id, { qty: n })} aria-label={`${item.name} quantity`} />
              <button type="button" onClick={() => setSelection(item.id, { qty: qty + 1 })} aria-label="Increase quantity"><Plus size={14} /></button>
            </div>
            <button type="button" className={`qd2-add${addedItems[item.id] ? ' is-added' : ''}`} onClick={() => addItem(item)}>
              {addedItems[item.id] ? <Check size={15} /> : <ShoppingCart size={15} />}
              {addedItems[item.id] ? 'Added' : 'Add'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const heroImg = activeClass?.logo ? mediaUrl(activeClass.logo) : null;
  const activeWarranty = activeClass && (data.warranties || []).find(w => w.id === activeClass.warrantyId);

  // ── Shared JSX blocks ────────────────────────────────────────────────────
  const addonBanner = addonQuotationId && (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      margin: '0 0 14px', padding: '12px 16px', borderRadius: '10px',
      background: '#FDF6EC', border: '1px solid #b45309',
      color: '#b45309', fontSize: '13px', fontWeight: 600,
    }}>
      <PackagePlus size={16} style={{ flexShrink: 0 }} />
      <span>
        <strong>Adding more products to {addonQuotationId}</strong>
        {addonTarget?.customer?.name ? <> ({addonTarget.customer.name})</> : null} — the original quotation will not change.
        <span style={{ display: 'block', fontWeight: 500, marginTop: '2px' }}>
          Step 1: pick the products below &nbsp;→&nbsp; Step 2: Go to Checkout &nbsp;→&nbsp; Step 3: press "Add to Quotation".
        </span>
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        <button type="button" onClick={() => setCurrentView('checkout')}
          style={{ background: '#b45309', border: 'none', borderRadius: '999px', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Go to Checkout
        </button>
        <button type="button" onClick={() => { cancelAddonOrder(); showToast('Add-on order cancelled', 'info'); }}
          style={{ background: 'transparent', border: '1px solid #b45309', borderRadius: '999px', color: '#b45309', fontSize: '12px', fontWeight: 700, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Cancel add-on
        </button>
      </div>
    </div>
  );

  const segToggle = (
    <div className={`qd2-seg${toolsActive ? ' tools' : ''}`}>
      <span className="qd2-seg-thumb" />
      <button type="button" className={!toolsActive ? 'is-active' : ''} onClick={() => { setCatalogView('products'); setSearch(''); setOpenBrandId(null); setActiveClassId(null); }}>
        <Layers size={15} /> Products
      </button>
      <button type="button" className={toolsActive ? 'is-active' : ''} onClick={() => { setCatalogView(TOOLS_SECTION_ID); setSearch(''); setOpenBrandId(null); setActiveClassId(null); }}>
        <Wrench size={15} /> Accessories
      </button>
    </div>
  );

  const brandListJSX = brandGroups.length === 0 ? (
    <div className="qd2-empty" style={{ padding: '40px 16px' }}>
      <div className="qd2-empty-icon">{toolsActive ? <Wrench size={24} /> : <Layers size={24} />}</div>
      <strong>No {toolsActive ? 'accessories' : 'classes'} yet</strong>
      <span>Add them in Settings.</span>
    </div>
  ) : (
    brandGroups.map(({ brand, items }) => {
      const brandKey = brand?.id || 'orphan';
      const flat = toolsActive;
      const locked = !flat && isBrandLocked(brand);
      const isOpen = flat ? true : openBrandId === brandKey;
      return (
        <div className="qd2-brand-group" key={brandKey}>
          {!flat && (
            <button
              type="button"
              className={`qd2-brand-head${isOpen ? ' is-open' : ''}${locked ? ' is-locked' : ''}`}
              onClick={() => (locked ? showLockToast() : toggleBrand(brand, items))}
              aria-expanded={isOpen}
              aria-disabled={locked}
              title={locked ? `Quotation locked to ${lockedToName} — clear the cart to switch brands` : undefined}
            >
              {brand?.logo
                ? <img src={mediaUrl(brand.logo)} alt="" />
                : <span className="qd2-brand-mark">{(brand?.name || 'O').charAt(0).toUpperCase()}</span>}
              <span className="qd2-brand-name">{brand?.name || 'Other'}</span>
              {locked && <Lock size={13} className="qd2-brand-lock" />}
              <span className="qd2-brand-count">{items.length}</span>
              <ChevronRight size={16} className="qd2-brand-chev" />
            </button>
          )}
          <div className={`qd2-brand-classes${isOpen ? ' is-open' : ''}`}>
            <div className="qd2-brand-classes-inner">
              {items.map(cls => {
                const warranty = (data.warranties || []).find(w => w.id === cls.warrantyId);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    className={`qd2-class${cls.id === activeClassId && !normalizedSearch ? ' is-active' : ''}`}
                    onClick={() => {
                      if (isMobile && Date.now() - brandOpenedAt.current < 420) return;
                      setActiveClassId(cls.id);
                      setSearch('');
                    }}
                  >
                    <div className="qd2-class-thumb" style={cls.logo ? { backgroundImage: `url("${escapeCssUrl(cls.logo)}")` } : { background: cls.color || '#8a857a' }}>
                      {!cls.logo && (cls.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="qd2-class-copy">
                      <h4>{cls.name}</h4>
                      <p>{cls.subtitle || 'Product class'}</p>
                      <div className="qd2-class-meta">
                        <span className="qd2-count-chip">{classVarietyCount(cls.id)}</span>
                        {warranty && <span className="qd2-shield"><ShieldCheck size={10} /> Warranty</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    })
  );

  const catalogBodyJSX = (
    <>
      {!normalizedSearch && activeClass && (
        <div className="qd2-hero">
          {heroImg && <div className="qd2-hero-img" style={{ backgroundImage: `url("${escapeCssUrl(activeClass.logo)}")` }} />}
          <div className="qd2-hero-copy">
            <div className="qd2-kick">{activeClass.subtitle || (activeBrand?.name || 'Product Class')}</div>
            <h2>{activeClass.name}</h2>
            <p>{activeClass.description || 'Catalogue series for quotation line items.'}</p>
          </div>
          {activeWarranty && <span className="qd2-hero-shield"><ShieldCheck size={13} /> {activeWarranty.title}</span>}
        </div>
      )}
      {!normalizedSearch && !activeClass ? (
        <div className="qd2-empty">
          <div className="qd2-empty-icon">{toolsActive ? <Wrench size={26} /> : <Layers size={26} />}</div>
          <strong>Select {toolsActive ? 'an accessory' : 'a brand'} to begin</strong>
          <span>{toolsActive ? 'Pick an accessory class on the left.' : 'Pick a brand on the left to reveal its classes, then choose one.'}</span>
        </div>
      ) : gridItems.length === 0 ? (
        <div className="qd2-empty">
          <div className="qd2-empty-icon"><Package size={26} /></div>
          <strong>{normalizedSearch ? 'No matching products' : 'No products in this class'}</strong>
          <span>{normalizedSearch ? 'Try a different search.' : 'Add varieties in Settings, or pick another class.'}</span>
        </div>
      ) : (
        <div className="qd2-gridwrap" key={normalizedSearch || activeClassId}>
          <div className="qd2-grid">
            {gridItems.map((item, i) => renderCard(item, i))}
          </div>
        </div>
      )}
    </>
  );

  const searchBarJSX = (
    <div className="qd2-search">
      <Search size={16} />
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={toolsActive ? 'Search accessories' : 'Search products'} />
      {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>✕</button>}
    </div>
  );

  const tabBar = (
    <nav className="qd2-tab-bar">
      <button type="button"
        className={`qd2-step-btn${mobileTab === 'customer' ? ' is-active' : ''}${hasName ? ' is-done' : ''}`}
        onClick={() => goTab('customer')}>
        <div className="qd2-step-num">{hasName ? <Check size={13} /> : '1'}</div>
        <span>Customer</span>
        {!hasName && <span className="qd2-tab-dot" />}
      </button>
      <div className={`qd2-step-line${hasName ? ' is-done' : ''}`} />
      <button type="button"
        className={`qd2-step-btn${mobileTab === 'browse' ? ' is-active' : ''}${hasItems ? ' is-done' : ''}`}
        onClick={() => goTab('browse')}>
        <div className="qd2-step-num">{hasItems ? <Check size={13} /> : '2'}</div>
        <span>Catalogue</span>
        {hasItems && <span className="qd2-tab-badge">{cart.length}</span>}
      </button>
      <div className={`qd2-step-line${hasItems ? ' is-done' : ''}`} />
      <button type="button"
        className={`qd2-step-btn${mobileTab === 'cart' ? ' is-active' : ''}`}
        onClick={() => goTab('cart')}>
        <div className="qd2-step-num">3</div>
        <span>Checkout</span>
      </button>
    </nav>
  );

  // ── Mobile layout — React controls which panel is visible ────────────────
  if (isMobile) {
    return (
      <>
        {addonBanner}
        <div className="qd2-mobile">

          {mobileTab === 'customer' && (
            <div className="qd2-mobile-panel qd2-customer-panel">
              <div className="qd2-customer">
                <div className="qd2-mobile-step">
                  <span className={hasName ? 'is-done' : ''}>{hasName ? <Check size={14} /> : '1'}</span>
                  <div><b>Customer details</b><small>Name and contact</small></div>
                </div>
                <div className="qd2-field is-name" style={addonQuotationId ? { opacity: 0.65 } : undefined}>
                  <label>Customer Name *</label>
                  <input name="name" value={customer.name || ''} onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} disabled={!!addonQuotationId} placeholder="Required for quotation" autoFocus />
                </div>
                <div className="qd2-field is-phone" style={addonQuotationId ? { opacity: 0.65 } : undefined}>
                  <label>Phone</label>
                  <input name="phone" value={customer.phone || ''} onChange={e => setCustomer(p => ({ ...p, phone: e.target.value }))} disabled={!!addonQuotationId} placeholder="Optional" />
                </div>
                <button type="button" className="qd2-more-btn" onClick={() => setMoreCustomer(m => !m)}>
                  {moreCustomer ? 'Less details' : 'More details'}
                </button>
                {moreCustomer && <>
                  <div className="qd2-field" style={addonQuotationId ? { opacity: 0.65 } : undefined}>
                    <label>Email</label>
                    <input name="email" value={customer.email || ''} onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))} disabled={!!addonQuotationId} placeholder="Optional" />
                  </div>
                  <div className="qd2-field" style={addonQuotationId ? { opacity: 0.65 } : undefined}>
                    <label>Site Address</label>
                    <input name="address" value={customer.address || ''} onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))} disabled={!!addonQuotationId} placeholder="Delivery location" />
                  </div>
                </>}
              </div>
              <div className="qd2-next-bar">
                <button
                  type="button"
                  className={`qd2-next-btn${hasName ? ' is-ready' : ''}`}
                  onClick={() => goTab('browse')}
                  disabled={!hasName}
                >
                  {hasName
                    ? <><span>Browse Products</span><ChevronRight size={18} /></>
                    : <span>Enter customer name to continue</span>
                  }
                </button>
              </div>
            </div>
          )}

          {mobileTab === 'browse' && !activeClassId && (
            <aside className="qd2-mobile-panel qd2-rail">
              <div className="qd2-rail-head">
                {openBrandId && !toolsActive && (
                  <button type="button" className="qd2-mobile-back" onClick={() => { setOpenBrandId(null); setActiveClassId(null); }}>
                    <ChevronRight size={15} style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
                    All Brands
                  </button>
                )}
                {segToggle}
              </div>
              <div className="qd2-scroll qd2-rail-list">
                {brandListJSX}
              </div>
              {hasItems && (
                <button type="button" className="qd2-cart-pill" onClick={() => goTab('cart')}>
                  <ShoppingCart size={15} />
                  <span>{cart.length} {cart.length === 1 ? 'item' : 'items'} in cart</span>
                  <span className="qd2-cart-pill-total">{cur} {cartTotal}</span>
                  <ChevronRight size={14} />
                </button>
              )}
            </aside>
          )}

          {mobileTab === 'browse' && activeClassId && (
            <section className="qd2-mobile-panel qd2-catalog">
              <div className="qd2-cat-head">
                <button type="button" className="qd2-mobile-back" onClick={() => { setActiveClassId(null); setSearch(''); }}>
                  <ChevronRight size={15} style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
                  {activeBrand?.name || (toolsActive ? 'Accessories' : 'Classes')}
                </button>
                <div className="qd2-cat-context">
                  {normalizedSearch ? (
                    <div className="qd2-crumb"><Search size={14} /> <b>"{search.trim()}"</b> <span className="qd2-cnt">· {gridItems.length} results</span></div>
                  ) : (
                    <div className="qd2-crumb"><b>{activeClass.name}</b> <span className="qd2-cnt">· {gridItems.length} products</span></div>
                  )}
                </div>
                {searchBarJSX}
              </div>
              {gridItems.length === 0 ? (
                <div className="qd2-empty">
                  <div className="qd2-empty-icon"><Package size={26} /></div>
                  <strong>{normalizedSearch ? 'No matching products' : 'No products in this class'}</strong>
                  <span>{normalizedSearch ? 'Try a different search.' : 'Add varieties in Settings, or pick another class.'}</span>
                </div>
              ) : (
                <div className="qd2-gridwrap" key={normalizedSearch || activeClassId}>
                  <div className="qd2-grid">{gridItems.map((item, i) => renderCard(item, i))}</div>
                </div>
              )}
              {hasItems && (
                <button type="button" className="qd2-cart-pill" onClick={() => goTab('cart')}>
                  <ShoppingCart size={15} />
                  <span>{cart.length} {cart.length === 1 ? 'item' : 'items'} in cart</span>
                  <span className="qd2-cart-pill-total">{cur} {cartTotal}</span>
                  <ChevronRight size={14} />
                </button>
              )}
            </section>
          )}

          {mobileTab === 'cart' && (
            <aside className="qd2-mobile-panel">
              <LiveQuotation />
            </aside>
          )}

        </div>
        {tabBar}
      </>
    );
  }

  // ── Desktop layout ───────────────────────────────────────────────────────
  return (
    <>
      {addonBanner}
      <div className="qd2">
        <div className="qd2-customer">
          <div className="qd2-mobile-step">
            <span>1</span>
            <div><b>Customer details</b><small>Name and contact</small></div>
          </div>
          <div className="qd2-customer-avatar">{(customer.name || '?').trim().charAt(0).toUpperCase() || <UserRound size={18} />}</div>
          <div className="qd2-cust-lead">
            <span>{addonQuotationId ? `Add-on for ${addonQuotationId}` : 'Quotation for'}</span>
            <strong>{customer.name || 'New Customer'}</strong>
          </div>
          <div className="qd2-field is-name" style={addonQuotationId ? { opacity: 0.65 } : undefined}>
            <label>Customer Name *</label>
            <input name="name" value={customer.name || ''} onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))} disabled={!!addonQuotationId} placeholder="Required for quotation" />
          </div>
          <div className="qd2-field is-phone" style={addonQuotationId ? { opacity: 0.65 } : undefined}>
            <label>Phone</label>
            <input name="phone" value={customer.phone || ''} onChange={e => setCustomer(p => ({ ...p, phone: e.target.value }))} disabled={!!addonQuotationId} placeholder="Optional" />
          </div>
          <button type="button" className="qd2-more-btn" onClick={() => setMoreCustomer(m => !m)}>
            {moreCustomer ? 'Less' : 'More details'}
          </button>
          {moreCustomer && (
            <div className="qd2-more-fields">
              <div className="qd2-field" style={{ flex: '1 1 240px', opacity: addonQuotationId ? 0.65 : 1 }}>
                <label>Email</label>
                <input name="email" value={customer.email || ''} onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))} disabled={!!addonQuotationId} placeholder="Optional" />
              </div>
              <div className="qd2-field" style={{ flex: '2 1 320px', opacity: addonQuotationId ? 0.65 : 1 }}>
                <label>Site Address</label>
                <input name="address" value={customer.address || ''} onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))} disabled={!!addonQuotationId} placeholder="Delivery location" />
              </div>
            </div>
          )}
        </div>

        <aside className="qd2-panel qd2-rail">
          <div className="qd2-rail-head">
            <span className="qd2-rail-label">Catalogue</span>
            {segToggle}
          </div>
          <div className="qd2-scroll qd2-rail-list">
            {brandListJSX}
          </div>
        </aside>

        <section className="qd2-catalog qd2-scroll">
          <div className="qd2-cat-head">
            <div className="qd2-cat-context">
              {normalizedSearch ? (
                <div className="qd2-crumb"><Search size={14} /> <b>"{search.trim()}"</b> <span className="qd2-cnt">· {gridItems.length} results</span></div>
              ) : activeClass ? (
                <div className="qd2-crumb">
                  <b>{activeClass.name}</b> <span className="qd2-cnt">· {gridItems.length} products</span>
                </div>
              ) : <div className="qd2-crumb">{toolsActive ? 'Select an accessory' : 'Select a brand'}</div>}
            </div>
            {searchBarJSX}
          </div>
          {catalogBodyJSX}
        </section>

        <aside className="qd2-cart">
          <LiveQuotation />
        </aside>
      </div>
    </>
  );
}
