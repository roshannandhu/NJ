import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_DATA } from './data';
import { getConfig, listQuotations, listWarranties, saveConfig, getBackupStatus, getSyncVersion } from './api';

const AppContext = createContext();

const normalizeCartSpelling = (record) => {
  if (!record || typeof record !== 'object') return record;

  const normalizeItem = (item) => {
    if (!item || typeof item !== 'object') return item;
    const cartId = item.cartId ?? item.kartId;
    return cartId === undefined ? item : { ...item, cartId };
  };

  const certData = record.certData
    ? {
        ...record.certData,
        selectedCartId: record.certData.selectedCartId ?? record.certData.selectedKartId ?? '',
      }
    : record.certData;

  return {
    ...record,
    items: Array.isArray(record.items) ? record.items.map(normalizeItem) : record.items,
    ...(certData ? { certData } : {}),
  };
};

export function AppProvider({ children }) {
  const [currentView, setCurrentView] = useState('quotation_desk'); // dashboard, quotation_desk, checkout, quotations, warranties, settings
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedVarietyId, setSelectedVarietyId] = useState(null);
  
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [activeQuotation, setActiveQuotation] = useState(null);
  const [activeWarranty,  setActiveWarranty]  = useState(null);
  const [activeTab, setActiveTab] = useState('quotation');

  // Identity of the quotation currently being drafted/edited in this session.
  // While set, regenerating from Checkout REUSES this id (the backend upserts by
  // id, so it UPDATES the same history record instead of inserting a duplicate).
  // Cleared only when the user explicitly starts a new quotation (see startNew
  // in QuotationDocument / reset in WarrantyDocument).
  const [activeQuotationId, setActiveQuotationId] = useState(null);

  // What the Checkout's Finalize button should produce, chosen on the Quotation
  // Desk: 'quote' (quotation only), 'both' (quotation + warranty), or
  // 'warranty' (standalone warranty only). Every Desk action routes THROUGH
  // Checkout; this carries the chosen intent there.
  const [generateIntent, setGenerateIntent] = useState('quote');

  const [data, setData] = useState(DEFAULT_DATA);
  const [backendOffline, setBackendOffline] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // PDF saving preference (per machine). When on, downloading a PDF opens a
  // "save as" location picker instead of dropping straight into Downloads.
  const [askSaveLocation, setAskSaveLocationState] = useState(() => {
    try { return localStorage.getItem('nj_ask_save_location') !== '0'; } catch { return true; }
  });
  const setAskSaveLocation = (v) => {
    setAskSaveLocationState(!!v);
    try { localStorage.setItem('nj_ask_save_location', v ? '1' : '0'); } catch { /* ignore */ }
  };

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const refreshBackupStatus = async () => {
    try {
      setBackupStatus(await getBackupStatus());
    } catch {
      /* backup status is non-critical; ignore failures */
    }
  };

  // Track the latest view without resetting the poll interval, so a background
  // sync can avoid clobbering in-progress Settings edits.
  const currentViewRef = useRef(currentView);
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);

  // Last data revision seen from the server (api getSyncVersion). null until the
  // first successful load.
  const lastRevisionRef = useRef(null);

  // Apply the warranty-content backfill + one-time parent-brand migration to a
  // freshly fetched config. Returns the normalized cfg and whether a migration
  // happened (so the caller can persist it once).
  const normalizeConfig = (cfg) => {
    let brandMigrated = false;
    if (cfg && cfg.warranties) {
      cfg.warranties = cfg.warranties.map(w => {
        const def = DEFAULT_DATA.warranties.find(dw => dw.id === w.id);
        if (!def) return w; // custom warranty added by the user — leave as-is
        const merged = { ...w };
        // Backfill editable content only when empty (preserve user edits)
        if (!merged.sections || merged.sections.length === 0) {
          merged.sections = def.sections;
          merged.opening = merged.opening || def.opening;
        }
        if (!merged.seriesTable || merged.seriesTable.length === 0) {
          merged.seriesTable = def.seriesTable || [];
        }
        // Structural display flags are user-customizable in the Warranty Builder.
        // Preserve an explicit saved choice (true/false); only backfill from the
        // definition when the flag is absent (legacy configs).
        if (merged.showSeriesTable === undefined) merged.showSeriesTable = def.showSeriesTable;
        if (merged.heatoutTable === undefined && def.heatoutTable !== undefined) merged.heatoutTable = def.heatoutTable;
        return merged;
      });
    }
    // ── Parent Brand migration (idempotent, automatic) ──────────────────
    // Existing catalogs have no brand layer. Ensure a default "NJ" brand exists
    // and every class is assigned to a brand. Persisted by the caller only when
    // something actually changed, so this runs at most once per catalog.
    if (cfg) {
      let brands = Array.isArray(cfg.brands) ? cfg.brands : [];
      if (brands.length === 0) {
        brands = [{ id: 'nj', name: 'NJ', logo: '', description: 'NJ India in-house roofing brand.', order: 0, active: true }];
        brandMigrated = true;
      }
      const defaultBrandId = brands[0].id;
      const classes = (cfg.classes || []).map(c => {
        if (!c.brandId) { brandMigrated = true; return { ...c, brandId: defaultBrandId }; }
        return c;
      });
      cfg = { ...cfg, brands, classes };
    }
    return { cfg, brandMigrated };
  };

  // Load data from the backend. quotations + warranties are always refreshed;
  // config is skipped when includeConfig is false (e.g. while the user edits
  // Settings) so a background sync never overwrites unsaved catalogue edits.
  const loadData = async ({ includeConfig = true } = {}) => {
    const quotations = (await listQuotations()).map(normalizeCartSpelling);
    const warranty_certificates = (await listWarranties()).map(normalizeCartSpelling);
    if (includeConfig) {
      const { cfg, brandMigrated } = normalizeConfig(await getConfig());
      setData(prev => ({ ...prev, ...cfg, quotations, warranty_certificates }));
      if (brandMigrated && cfg) {
        // Save the migrated catalog back so the brand layer is durable.
        saveConfig({
          company: cfg.company, settings: cfg.settings, brands: cfg.brands,
          classes: cfg.classes, varieties: cfg.varieties, warranties: cfg.warranties,
        }).catch(() => { /* will retry on next explicit save */ });
      }
    } else {
      setData(prev => ({ ...prev, quotations, warranty_certificates }));
    }
    setBackendOffline(false);
  };

  // Initial load.
  useEffect(() => {
    (async () => {
      try {
        await loadData({ includeConfig: true });
        try { lastRevisionRef.current = (await getSyncVersion()).revision; } catch { /* sync optional */ }
        refreshBackupStatus();
        // The on-launch auto-backup runs in the background; re-check shortly so
        // the "protected" state shows without needing a manual reload.
        setTimeout(refreshBackupStatus, 6000);
      } catch {
        // Hard failure: the backend (the real data store) is unreachable, so the
        // app is showing blank seed defaults. Make this loud and blocking instead
        // of a 3-second toast, so seed data is never mistaken for real data or
        // saved over the real data.
        setBackendOffline(true);
        showToast("Backend offline — your data is NOT loaded", "error");
      }
    })();
  }, []);

  // ── Live sync ──────────────────────────────────────────────────────────
  // Poll the server's data revision every 5s; when it grows (another device —
  // PC or phone — saved a quotation, warranty, or catalogue change), refetch so
  // this screen updates automatically. Config refresh is skipped while editing
  // Settings to protect unsaved edits. This is the local proof of the live
  // 2-way-sync architecture (one backend = single source of truth).
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { revision } = await getSyncVersion();
        if (lastRevisionRef.current === null) { lastRevisionRef.current = revision; return; }
        if (revision !== lastRevisionRef.current) {
          lastRevisionRef.current = revision;
          await loadData({ includeConfig: currentViewRef.current !== 'settings' });
        }
      } catch { /* transient network/backend blip — retry next tick */ }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const persistConfig = async (nextData = data) => {
    try {
      await saveConfig({
        company: nextData.company,
        settings: nextData.settings,
        brands: nextData.brands,
        classes: nextData.classes,
        varieties: nextData.varieties,
        warranties: nextData.warranties,
      });
    } catch {
      showToast("Failed to save config to server", "error");
    }
  };

  const addToCart = (item) => {
    // item needs: id, name, price, qty, unit, color, image
    // `actualPrice` is the immutable master/Settings price captured at add-time.
    // `price` stays the effective (chargeable) price; lowering it in Checkout
    // turns the difference into an "offer" without ever touching actualPrice.
    let updatedExisting = false;
    setCart(prev => {
      const existing = prev.find(cartItem => cartItem.id === item.id);
      if (!existing) return [...prev, { ...item, cartId: Date.now(), actualPrice: item.actualPrice ?? item.price }];

      updatedExisting = true;
      return prev.map(cartItem =>
        cartItem.id === item.id
          ? { ...cartItem, qty: cartItem.qty + item.qty, price: item.price, color: item.color, actualPrice: cartItem.actualPrice ?? item.price }
          : cartItem
      );
    });
    showToast(updatedExisting ? `Updated ${item.name} quantity` : `Added ${item.name} to Cart`);
  };

  const updateCartQty = (cartId, newQty) => {
    setCart(prev => prev.map(item => item.cartId === cartId ? { ...item, qty: Math.max(1, newQty) } : item));
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  // Load a saved quotation back into a fully editable session: its line items
  // into the cart, its customer, and its identity (activeQuotationId) so that
  // re-finalizing from Checkout UPDATES the same record instead of creating a
  // duplicate. Single entry point reused by History, Dashboard and the
  // "Edit in Checkout" action on the Quotation Document.
  const loadQuotationForEdit = (q) => {
    if (!q) return;
    setCart(Array.isArray(q.items) ? q.items.map(it => ({ ...it })) : []);
    setCustomer({ name: '', phone: '', email: '', address: '', ...(q.customer || {}) });
    setActiveQuotation(q);
    setActiveQuotationId(q.id || null);
    setActiveTab('quotation');
    // Editing an existing quotation is always a plain quotation finalize.
    setGenerateIntent('quote');
    setCurrentView('checkout');
  };

  const value = {
    currentView, setCurrentView,
    selectedClassId, setSelectedClassId,
    selectedVarietyId, setSelectedVarietyId,
    customer, setCustomer,
    cart, setCart, cartOpen, setCartOpen,
    addToCart, updateCartQty, removeFromCart, cartTotal,
    loadQuotationForEdit,
    toasts, showToast,
    data, setData, persistConfig,
    activeQuotation, setActiveQuotation,
    activeQuotationId, setActiveQuotationId,
    generateIntent, setGenerateIntent,
    activeWarranty,  setActiveWarranty,
    activeTab, setActiveTab,
    backendOffline,
    backupStatus, refreshBackupStatus,
    askSaveLocation, setAskSaveLocation,
  };

  const days = backupStatus?.days_since_last_backup;
  const showReminder =
    !backendOffline && backupStatus?.needs_backup_reminder && !reminderDismissed;

  return (
    <AppContext.Provider value={value}>
      {children}

      {/* Backend-offline blocking banner — data is NOT loaded */}
      {backendOffline && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
          background: 'var(--red)', color: '#fff', padding: '14px 24px',
          textAlign: 'center', fontWeight: 600, fontSize: '14px',
          boxShadow: 'var(--shadow-lg)', lineHeight: 1.5,
        }}>
          ⚠ Backend offline — your saved data is NOT loaded. You are seeing blank
          defaults. Do NOT add or edit anything, or you may overwrite your real
          data. Start the app with <b>start.bat</b>, then reload this page.
        </div>
      )}

      {/* 7-day no-backup reminder */}
      {showReminder && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
          background: 'var(--gold)', color: '#1a1a1a', padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
          fontWeight: 600, fontSize: '13px', boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
        }}>
          <span>
            ⏰ No verified backup in {days == null ? 'a while' : `${Math.floor(days)} days`} —
            open <b>Settings → Security &amp; Backup</b> and click “Back up now”.
          </span>
          <button
            onClick={() => setReminderDismissed(true)}
            style={{
              background: 'rgba(0,0,0,0.12)', border: 'none', color: '#1a1a1a',
              borderRadius: '6px', padding: '4px 12px', cursor: 'pointer',
              fontWeight: 600, fontSize: '12px',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toast Container */}
      <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {toasts.map(t => (
          <div key={t.id} className="animate-fade-up" style={{
            background: t.type === 'error' ? 'var(--red)' : 'var(--ink)',
            color: 'white', padding: '14px 24px', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)', fontWeight: 500, fontSize: '14px'
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
