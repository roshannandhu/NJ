import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_DATA } from './data';
import { getConfig, listQuotations, listWarranties, saveConfig, getBackupStatus } from './api';

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
  const [currentView, setCurrentView] = useState('dashboard'); // dashboard, quotation_desk, checkout, quotations, warranties, settings
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedVarietyId, setSelectedVarietyId] = useState(null);
  
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [activeQuotation, setActiveQuotation] = useState(null);
  const [activeWarranty,  setActiveWarranty]  = useState(null);
  const [activeTab, setActiveTab] = useState('quotation');

  const [data, setData] = useState(DEFAULT_DATA);
  const [backendOffline, setBackendOffline] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getConfig();
        const quotations = (await listQuotations()).map(normalizeCartSpelling);
        const warranty_certificates = (await listWarranties()).map(normalizeCartSpelling);

        if (cfg && cfg.warranties) {
          cfg.warranties = cfg.warranties.map(w => {
            if (!w.sections || w.sections.length === 0) {
              const def = DEFAULT_DATA.warranties.find(dw => dw.id === w.id);
              if (def) return { ...w, sections: def.sections, opening: def.opening || w.opening };
            }
            return w;
          });
        }

        setData(prev => ({ ...prev, ...cfg, quotations, warranty_certificates }));
        setBackendOffline(false);
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

  const persistConfig = async (nextData = data) => {
    try {
      await saveConfig({
        company: nextData.company,
        settings: nextData.settings,
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
    let updatedExisting = false;
    setCart(prev => {
      const existing = prev.find(cartItem => cartItem.id === item.id);
      if (!existing) return [...prev, { ...item, cartId: Date.now() }];

      updatedExisting = true;
      return prev.map(cartItem =>
        cartItem.id === item.id
          ? { ...cartItem, qty: cartItem.qty + item.qty, price: item.price, color: item.color }
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

  const value = {
    currentView, setCurrentView,
    selectedClassId, setSelectedClassId,
    selectedVarietyId, setSelectedVarietyId,
    customer, setCustomer,
    cart, setCart, cartOpen, setCartOpen,
    addToCart, updateCartQty, removeFromCart, cartTotal,
    toasts, showToast,
    data, setData, persistConfig,
    activeQuotation, setActiveQuotation,
    activeWarranty,  setActiveWarranty,
    activeTab, setActiveTab,
    backendOffline,
    backupStatus, refreshBackupStatus,
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
