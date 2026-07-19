const fs = require('fs');
const path = require('path');

const jsxPath = path.join(__dirname, 'src/components/QuotationDesk.jsx');
let code = fs.readFileSync(jsxPath, 'utf8');

const splitIndex = code.indexOf('const activeClass = allClasses.find(c => c.id === activeClassId) || null;');

let newRender = `  const activeClass = allClasses.find(c => c.id === activeClassId) || null;
  const activeBrand = activeClass ? brands.find(b => b.id === brandOf(activeClass)) : null;

  const searchResults = React.useMemo(() => {
    if (!normalizedSearch) return null;
    const searchable = (!toolsActive && lockedByBrandIds.size > 0)
      ? railClasses.filter(cls => lockedByBrandIds.has(brandOf(cls)))
      : railClasses;
    return searchable.flatMap(cls => getClassVarieties(cls.id));
  }, [normalizedSearch, railClasses, toolsActive, lockedByBrandIds]);

  const gridItems = React.useMemo(() => {
    if (normalizedSearch) return searchResults;
    if (activeClass) return getClassVarieties(activeClass.id);
    let classesToShow = railClasses;
    if (!toolsActive && openBrandId) {
       classesToShow = railClasses.filter(c => brandOf(c) === openBrandId);
    }
    return classesToShow.flatMap(c => getClassVarieties(c.id));
  }, [normalizedSearch, searchResults, activeClass, railClasses, toolsActive, openBrandId]);

  // renderCard remains the same
  const renderCard = (item, i) => {
    const cls = getVarietyClass(allClasses, item);
    const colorInfo = getSelectedColorInfo(item);
    const qty = getSelectedQty(item);
    const price = getItemPrice(item);
    const added = addedItems[item.id];
    
    // Check if adding this item would violate brand lock
    const isTool = cls?.type === 'tools' || item.classId === 'cls_tools';
    const bId = isTool ? null : brandOf(cls);
    const isLocked = !isTool && lockedByBrandIds.size > 0 && !lockedByBrandIds.has(bId);

    return (
      <div className="qd2-card" key={item.id + i}>
        <div className="qd2-card-media" style={{ backgroundImage: \`url("\${escapeCssUrl(colorInfo?.image || item.image)}")\` }}>
          {isLocked && <div className="qd2-card-lock-overlay"><Lock size={16}/><span>Locked</span></div>}
          <div className="qd2-card-badges">
            {item.colors?.length > 1 && <span className="qd2-badge">{item.colors.length} Colors</span>}
          </div>
        </div>
        <div className="qd2-card-body">
          <div className="qd2-card-head">
            <h3>{item.name}</h3>
            <span className="qd2-card-brand">{cls?.name}</span>
          </div>
          
          {item.colors?.length > 1 && (
            <div className="qd2-swatches">
              {item.colors.map(c => (
                <button
                  key={c.name}
                  type="button"
                  className={"qd2-swatch" + (colorInfo?.name === c.name ? ' is-active' : '')}
                  style={{ backgroundColor: c.hex || '#ccc' }}
                  title={c.name}
                  onClick={(e) => { e.stopPropagation(); setSelection(item.id, { color: c.name }); }}
                />
              ))}
            </div>
          )}

          <div className="qd2-card-actions">
            <div className="qd2-stepper">
              <button type="button" onClick={() => setSelection(item.id, { qty: Math.max(1, qty - 1) })}><Minus size={14} /></button>
              <input type="number" min="1" value={qty} onChange={e => setSelection(item.id, { qty: parseInt(e.target.value) || 1 })} />
              <button type="button" onClick={() => setSelection(item.id, { qty: qty + 1 })}><Plus size={14} /></button>
            </div>
            <button 
              type="button" 
              className={"qd2-add" + (added ? ' is-added' : '')}
              disabled={isLocked}
              onClick={() => { if (!isLocked) addItem(item); else showLockToast(); }}
            >
              {added ? <Check size={16} /> : <ShoppingCart size={16} />}
              {added ? 'Added' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    <header className="qd2-top">
      <div className="qd2-customer">
        <div className="qd2-customer-avatar"><UserRound size={16} /></div>
        <div className="qd2-cust-lead">
          <strong>Quotation Details</strong>
          <p>Fill out the customer information for the quotation document.</p>
        </div>
        {addonTarget && (
          <div className="qd2-addon-banner">
            <PackagePlus size={14} />
            Adding to <b>{addonTarget.id}</b>
          </div>
        )}
        <button type="button" className="qd2-more-btn" onClick={() => setMoreCustomer(!moreCustomer)}>
          {moreCustomer ? 'Less details' : 'More details'}
        </button>
      </div>

      <div className="qd2-workflow">
        <div className="qd2-field is-name">
          <label>Customer Name</label>
          <input id="customer-name-input" placeholder="Required for quotation" value={customer.name || ''} onChange={e => setCustomer(prev => ({ ...prev, name: e.target.value }))} readOnly={Boolean(addonTarget)} />
        </div>
        <div className="qd2-field is-phone">
          <label>Phone Number</label>
          <input placeholder="Optional" value={customer.phone || ''} onChange={e => setCustomer(prev => ({ ...prev, phone: e.target.value }))} readOnly={Boolean(addonTarget)} />
        </div>
      </div>

      {moreCustomer && (
        <div className="qd2-more-fields">
          <div className="qd2-field"><label>Address Line 1</label><input placeholder="e.g. 123 Main St" value={customer.address1 || ''} onChange={e => setCustomer(prev => ({ ...prev, address1: e.target.value }))} readOnly={Boolean(addonTarget)} /></div>
          <div className="qd2-field"><label>Address Line 2</label><input placeholder="e.g. Suite 400" value={customer.address2 || ''} onChange={e => setCustomer(prev => ({ ...prev, address2: e.target.value }))} readOnly={Boolean(addonTarget)} /></div>
          <div className="qd2-field"><label>City / State</label><input placeholder="e.g. New York, NY" value={customer.city || ''} onChange={e => setCustomer(prev => ({ ...prev, city: e.target.value }))} readOnly={Boolean(addonTarget)} /></div>
          <div className="qd2-field"><label>Email Address</label><input placeholder="Optional email" type="email" value={customer.email || ''} onChange={e => setCustomer(prev => ({ ...prev, email: e.target.value }))} readOnly={Boolean(addonTarget)} /></div>
        </div>
      )}
    </header>

    <div className="qd2-app">
      <div className="qd2-main-content">
        
        <div className="qd2-search-hero">
          <div className="qd2-search-lg">
            <Search size={20} />
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={"Search products, brands, or classes..."} 
            />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>

        {!normalizedSearch && (
          <div className="qd2-categories">
            
            <div className="qd2-chips-row">
              <button 
                className={"qd2-chip" + (!toolsActive && openBrandId === null ? ' active' : '')}
                onClick={() => { setCatalogView('products'); setOpenBrandId(null); setActiveClassId(null); }}
              >
                All Brands
              </button>
              {brands.map(b => {
                const locked = isBrandLocked(b);
                return (
                  <button 
                    key={b.id}
                    className={"qd2-chip" + (!toolsActive && openBrandId === b.id ? ' active' : '') + (locked ? ' locked' : '')}
                    onClick={() => {
                      if (locked) { showLockToast(); return; }
                      setCatalogView('products');
                      setOpenBrandId(b.id);
                      setActiveClassId(null);
                    }}
                  >
                    {locked && <Lock size={12} style={{marginRight: 4}} />}
                    {b.name}
                  </button>
                );
              })}
              <button 
                className={"qd2-chip" + (toolsActive ? ' active' : '')}
                onClick={() => { setCatalogView(TOOLS_SECTION_ID); setOpenBrandId(null); setActiveClassId(null); }}
              >
                Accessories & Tools
              </button>
            </div>
            
            <div className="qd2-chips-row secondary">
              <button 
                className={"qd2-chip" + (activeClassId === null ? ' active' : '')}
                onClick={() => setActiveClassId(null)}
              >
                All {toolsActive ? 'Accessories' : (openBrandId ? (brands.find(b=>b.id===openBrandId)?.name || 'Classes') : 'Classes')}
              </button>
              {railClasses.filter(c => toolsActive ? true : (openBrandId ? brandOf(c) === openBrandId : true)).map(c => (
                <button 
                  key={c.id}
                  className={"qd2-chip" + (activeClassId === c.id ? ' active' : '')}
                  onClick={() => setActiveClassId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="qd2-product-grid">
          {gridItems.length === 0 ? (
            <div className="qd2-empty">
              <div className="qd2-empty-icon"><Package size={26} /></div>
              <strong>{normalizedSearch ? 'No matching products' : 'No products found'}</strong>
              <span>{normalizedSearch ? 'Try a different search.' : 'Add varieties in Settings.'}</span>
            </div>
          ) : (
            gridItems.map((item, i) => renderCard(item, i))
          )}
        </div>

      </div>

      <aside className={"qd2-sidebar" + (mobileCartOpen ? ' mobile-open' : '')}>
        <div className="qd2-cart-mobile-header app-nav-mobile-only">
          <h3>Your Quotation</h3>
          <button onClick={() => setMobileCartOpen(false)}>Close</button>
        </div>
        <LiveQuotation />
      </aside>

      <button className="qd2-mobile-fab app-nav-mobile-only" onClick={() => setMobileCartOpen(true)}>
        <div className="qd2-fab-icon">
          <ShoppingCart size={22} />
          {cart.length > 0 && <span className="qd2-fab-badge">{cart.length}</span>}
        </div>
        <span>View Quotation</span>
      </button>

    </div>
    </>
  );
}
`;

const finalCode = code.substring(0, splitIndex) + newRender;
fs.writeFileSync(jsxPath, finalCode, 'utf8');
console.log("Updated QuotationDesk.jsx");
