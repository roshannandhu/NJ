import React from 'react';
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  Layers,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Wrench,
} from 'lucide-react';
import { mediaUrl } from '../api';
import { useAppContext } from '../AppContext';
import CustomerCard from './CustomerCard';
import LiveQuotation from './LiveQuotation';

const TOOLS_SECTION_ID = 'tools';

const getVarietyClass = (classes, variety) => classes.find(c => c.id === variety.classId);

const escapeCssUrl = (url) => mediaUrl(url).replace(/"/g, '\\"');

const imageBackground = (
  url,
  overlay = 'linear-gradient(135deg, rgba(0,0,0,0.18), rgba(0,0,0,0.04))',
  fit = 'cover'
) => {
  if (!url) return undefined;
  const image = `url("${escapeCssUrl(url)}") center/${fit} no-repeat`;
  return overlay ? `${overlay}, ${image}` : image;
};

const getColorOffset = (color) => Number(color?.offset ?? color?.priceOffset ?? 0) || 0;

const matchesSearch = (item, cls, search) => {
  if (!search) return true;
  return [item.name, item.description, cls?.name, cls?.subtitle]
    .filter(Boolean)
    .some(text => text.toLowerCase().includes(search));
};

export default function QuotationDesk() {
  const { data, addToCart } = useAppContext();
  const productListRef = React.useRef(null);
  const toolsSectionRef = React.useRef(null);
  const tileClasses = React.useMemo(
    () => (data.classes || []).filter(c => c.type !== 'tools'),
    [data.classes]
  );
  const allTools = React.useMemo(
    () => (data.varieties || []).filter(v => {
      const cls = getVarietyClass(data.classes || [], v);
      return cls?.type === 'tools' || v.classId === 'cls_tools';
    }),
    [data.classes, data.varieties]
  );

  const [activeStrip, setActiveStrip] = React.useState(null);
  const [catalogView, setCatalogView] = React.useState('products');
  const [search, setSearch] = React.useState('');
  const [selections, setSelections] = React.useState({});
  const [addedItems, setAddedItems] = React.useState({});
  const normalizedSearch = search.trim().toLowerCase();
  const toolsActive = catalogView === TOOLS_SECTION_ID;
  const resolvedActiveStrip = tileClasses.some(c => c.id === activeStrip)
    ? activeStrip
    : (tileClasses[0]?.id || null);

  const productTotal = (data.varieties || []).filter(v => {
    const cls = getVarietyClass(data.classes || [], v);
    return cls?.type !== 'tools' && v.classId !== 'cls_tools';
  }).length;

  const setSelection = (id, patch) => {
    setSelections(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const getSelectedColor = (item) => {
    const selection = selections[item.id] || {};
    return selection.color || item.colors?.[0]?.name || 'Standard';
  };

  const getSelectedColorInfo = (item) => {
    const selectedColor = getSelectedColor(item);
    return item.colors?.find(c => c.name === selectedColor);
  };

  const getSelectedQty = (item) => selections[item.id]?.qty || 1;

  const getItemPrice = (item) => item.basePrice + getColorOffset(getSelectedColorInfo(item));

  const getClassVarieties = (classId) => (data.varieties || [])
    .filter(v => v.classId === classId)
    .filter(v => matchesSearch(v, getVarietyClass(data.classes || [], v), normalizedSearch));

  const getTools = () => allTools
    .filter(v => matchesSearch(v, getVarietyClass(data.classes || [], v), normalizedSearch));

  const addItem = (item) => {
    const cls = getVarietyClass(data.classes || [], item);
    const color = getSelectedColor(item);
    const qty = getSelectedQty(item);
    const price = getItemPrice(item);
    const isTool = cls?.type === 'tools' || item.classId === 'cls_tools';

    addToCart({
      id: `${item.id}-${color}`,
      name: item.name,
      className: isTool ? 'Tools & Accessories' : cls?.name || 'Products',
      price,
      qty,
      unit: item.unit,
      color,
      image: item.image,
    });

    // Reset qty to 1 and flash the "Added" state
    setSelection(item.id, { qty: 1 });
    setAddedItems(prev => ({ ...prev, [item.id]: true }));
    setTimeout(() => setAddedItems(prev => ({ ...prev, [item.id]: false })), 1400);
  };

  const toggleStrip = (id) => {
    setActiveStrip(current => current === id ? null : id);
  };

  const scrollToSection = (ref) => {
    if (!ref.current) return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const jumpToProducts = () => {
    setCatalogView('products');
    setSearch('');
    window.setTimeout(() => scrollToSection(productListRef), 80);
  };

  const jumpToTools = () => {
    setCatalogView(TOOLS_SECTION_ID);
    setSearch('');
    window.setTimeout(() => scrollToSection(toolsSectionRef), 80);
  };

  const renderVarietyCard = (item, index, isTool = false) => {
    const cls = getVarietyClass(data.classes || [], item) || {};
    const selectedColor = getSelectedColor(item);
    const colorInfo = getSelectedColorInfo(item);
    const price = getItemPrice(item);
    const qty = getSelectedQty(item);
    const cardColor = colorInfo?.hex || cls.color || '#8a857a';

    return (
      <article
        key={item.id}
        className={`qd-variety-card ${isTool ? 'is-tool' : ''}`}
        style={{
          '--qd-card-color': cardColor,
          animationDelay: `${index * 22}ms`,
        }}
      >
        <div
          className={`qd-variety-image ${item.image ? 'has-image' : ''}`}
          style={item.image ? { background: imageBackground(item.image) } : undefined}
        >
          {!item.image && (
            <div className="qd-fallback-mark">
              {isTool ? <Wrench size={26} /> : <ImageIcon size={26} />}
              <span>{isTool ? 'Accessory' : cls.subtitle || cls.name || 'Product'}</span>
            </div>
          )}
        </div>

        <div className="qd-variety-body">
          <div className="qd-variety-title-row">
            <div>
              <h3>{item.name}</h3>
              <p>{item.description || cls.name || 'Ready to add to quotation'}</p>
            </div>
            <div className="qd-price">
              <strong>Rs. {price}</strong>
              <span>/ {item.unit}</span>
            </div>
          </div>

          {!isTool && item.colors?.length > 0 && (
            <div className="qd-color-row" aria-label={`Colors for ${item.name}`}>
              {item.colors.map(color => (
                <button
                  key={color.name}
                  type="button"
                  title={color.name}
                  aria-label={color.name}
                  onClick={() => setSelection(item.id, { color: color.name })}
                  className={selectedColor === color.name ? 'is-selected' : ''}
                  style={{
                    background: color.image
                      ? `url("${escapeCssUrl(color.image)}") center/cover`
                      : color.hex || '#d6d3cc',
                  }}
                >
                  {selectedColor === color.name && <Check size={13} />}
                </button>
              ))}
            </div>
          )}

          <div className="qd-variety-actions">
            <div className="qd-stepper">
              <button
                type="button"
                onClick={() => setSelection(item.id, { qty: Math.max(1, qty - 1) })}
                aria-label={`Decrease ${item.name} quantity`}
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                value={qty}
                min="1"
                onChange={e => setSelection(item.id, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                aria-label={`${item.name} quantity`}
              />
              <button
                type="button"
                onClick={() => setSelection(item.id, { qty: qty + 1 })}
                aria-label={`Increase ${item.name} quantity`}
              >
                <Plus size={14} />
              </button>
            </div>

            <button
              className={`qd-add-btn ${addedItems[item.id] ? 'is-added' : ''}`}
              type="button"
              onClick={() => addItem(item)}
            >
              {addedItems[item.id] ? <Check size={15} /> : <ShoppingCart size={15} />}
              {addedItems[item.id] ? 'Added!' : 'Add'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderClassStrip = (cls, index) => {
    const allClassItems = (data.varieties || []).filter(v => v.classId === cls.id);
    const visibleItems = getClassVarieties(cls.id);
    const isActive = resolvedActiveStrip === cls.id;
    const warranty = (data.warranties || []).find(w => w.id === cls.warrantyId);

    return (
      <article
        key={cls.id}
        className={`qd-strip ${isActive ? 'is-expanded' : ''}`}
        style={{
          '--qd-strip-color': cls.color || '#8a857a',
          '--qd-strip-bg': cls.logo ? `url("${escapeCssUrl(cls.logo)}")` : 'none',
          animationDelay: `${index * 40}ms`,
        }}
      >
        <button className="qd-strip-head" type="button" onClick={() => toggleStrip(cls.id)}>
          <div
            className={`qd-strip-image ${cls.logo ? 'has-image' : ''}`}
          >
            {cls.logo ? (
              <img className="qd-strip-logo-img" src={mediaUrl(cls.logo)} alt={`${cls.name} logo`} />
            ) : (
              <div className="qd-strip-fallback">
                <Layers size={28} />
                <span>{cls.subtitle || 'Roofing Series'}</span>
              </div>
            )}
          </div>

          <div className="qd-strip-copy">
            <span className="qd-kicker">{cls.subtitle || 'Product Class'}</span>
            <h2>{cls.name}</h2>
            <p>{cls.description || 'Catalogue series for quotation line items.'}</p>
            <div className="qd-strip-meta">
              <span>{allClassItems.length} varieties</span>
              {warranty && (
                <span className="qd-warranty-pill">
                  <ShieldCheck size={13} />
                  {warranty.title}
                </span>
              )}
            </div>
          </div>

          <div className="qd-strip-count">
            <strong>{normalizedSearch ? visibleItems.length : allClassItems.length}</strong>
            <span>{normalizedSearch ? 'matches' : 'items'}</span>
            <ChevronDown size={20} />
          </div>
        </button>

        <div className="qd-strip-body" aria-hidden={!isActive}>
          <div className="qd-strip-body-inner">
            {visibleItems.length === 0 ? (
              <div className="qd-empty">
                <Package size={30} />
                <strong>No matching varieties</strong>
                <span>Clear search or add products in Settings.</span>
              </div>
            ) : (
              <div className="qd-variety-grid">
                {visibleItems.map((item, itemIndex) => renderVarietyCard(item, itemIndex))}
              </div>
            )}
          </div>
        </div>
      </article>
    );
  };

  const visibleTools = getTools();

  return (
    <div className="quotation-desk-shell qd-strip-mode">
      <div className="qd-customer-panel">
        <div className="qd-customer-title">
          <UserRound size={18} />
          <div>
            <strong>Customer Details</strong>
            <span>Customer profile for the current quotation.</span>
          </div>
        </div>
        <CustomerCard />
      </div>

      <div className="qd-strip-workspace">
        <section className="qd-strip-catalog">
          <div className="qd-strip-toolbar">
            <div className="qd-catalog-switch" aria-label="Catalogue sections">
              <button
                className={`qd-catalog-tab is-product ${!toolsActive ? 'is-active' : ''}`}
                type="button"
                onClick={jumpToProducts}
                aria-current={!toolsActive ? 'true' : undefined}
              >
                <span className="qd-catalog-icon">
                  <Layers size={19} />
                </span>
                <span className="qd-catalog-tab-copy">
                  <span className="qd-kicker">Visual Catalogue</span>
                  <strong>Product Classes</strong>
                  <span>Roofing, ceiling, and accessory catalogue for NJ India quotations.</span>
                </span>
                <span className="qd-catalog-count">{productTotal}</span>
              </button>

              <button
                className={`qd-catalog-tab is-tools ${toolsActive ? 'is-active' : ''}`}
                type="button"
                onClick={jumpToTools}
                aria-current={toolsActive ? 'true' : undefined}
              >
                <span className="qd-catalog-icon">
                  <Wrench size={19} />
                </span>
                <span className="qd-catalog-tab-copy">
                  <span className="qd-kicker">Quick Add</span>
                  <strong>Tools & Accessories</strong>
                  <span>Hardware, fittings, and installation support items.</span>
                </span>
                <span className="qd-catalog-count">{allTools.length}</span>
              </button>
            </div>
            <div className="qd-search">
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={toolsActive ? 'Search accessories' : 'Search products or classes'}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--ink-soft)', display: 'flex', alignItems: 'center',
                    padding: '0 2px', flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              )}
              <span>
                {normalizedSearch
                  ? toolsActive
                    ? visibleTools.length
                    : tileClasses.reduce((sum, cls) => sum + getClassVarieties(cls.id).length, 0)
                  : toolsActive
                    ? allTools.length
                    : productTotal}
              </span>
            </div>
          </div>

          {!toolsActive ? (
            <div className="qd-strip-list" ref={productListRef}>
              {tileClasses.map(renderClassStrip)}
            </div>
          ) : (
            <section className="qd-tools-section qd-tools-cards-only" ref={toolsSectionRef} aria-label="Tools and accessories quick add">
              {visibleTools.length === 0 ? (
                <div className="qd-empty">
                  <Wrench size={30} />
                  <strong>No matching accessories</strong>
                  <span>Clear search or add tools in Settings.</span>
                </div>
              ) : (
                <div className="qd-variety-grid qd-tool-grid">
                  {visibleTools.map((item, index) => renderVarietyCard(item, index, true))}
                </div>
              )}
            </section>
          )}
        </section>

        <aside className="qd-live-panel">
          <LiveQuotation />
        </aside>
      </div>
    </div>
  );
}
