import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../AppContext';
import { ShieldCheck, FileText, ShoppingBag, Lock, Download, Award, DatabaseBackup, Settings as SettingsIcon, ArrowLeft } from 'lucide-react';

import ProductsClassesSettings from './ProductsClassesSettings';
import BrandsSettings from './BrandsSettings';
import WarrantiesSettings from './WarrantiesSettings';
import QuotationSettings from './QuotationSettings';
import BackupSettings from './BackupSettings';
import './Settings.css';

// Canonical toggle used across the settings shell.
function SetToggle({ checked, onChange, title, desc }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`set-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <div className="set-toggle-copy"><strong>{title}</strong>{desc && <span>{desc}</span>}</div>
      <div className="set-switch" />
    </button>
  );
}

export default function Settings() {
  const { data, setData, showToast, persistConfig, askSaveLocation, setAskSaveLocation, setCurrentView } = useAppContext();
  const [activeModule, setActiveModule] = useState('brands');
  const mainRef = useRef(null);

  const [settings, setSettings] = useState(data.settings || {});

  useEffect(() => { setSettings(data.settings || {}); }, [data.settings]);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0, left: 0 }); }, [activeModule]);

  // Company details now live PER PARENT BRAND (Settings → Parent Brands): each
  // brand carries its own profile (name/address/phone/email/GST/website) that
  // prints on its quotations, so the old global "Company Profile" module is
  // gone. The stored data.company remains as the fallback for the NJ brand's
  // empty fields and for documents with no resolvable brand.
  const modules = [
    { id: 'brands',     label: 'Parent Brands',      mobileLabel: 'Brands',    desc: `${data.brands?.length || 0} brands`,        icon: <Award size={18} /> },
    { id: 'products',   label: 'Products & Catalog', mobileLabel: 'Products',  desc: `${data.classes?.length || 0} classes`,      icon: <ShoppingBag size={18} /> },
    { id: 'warranties', label: 'Warranty Builder',   mobileLabel: 'Warranty',  desc: `${data.warranties?.length || 0} templates`, icon: <ShieldCheck size={18} /> },
    { id: 'quotation',  label: 'Quotation Specs',    mobileLabel: 'Quotation', desc: settings.taxEnabled ? 'Tax enabled' : 'No tax', icon: <FileText size={18} /> },
    { id: 'security',   label: 'Security',           mobileLabel: 'Security',  desc: settings.pinEnabled ? 'PIN active' : 'Unsecured', icon: <Lock size={18} /> },
    { id: 'backup',     label: 'Backup & Recovery',  mobileLabel: 'Backup',    desc: 'Protect your data', icon: <DatabaseBackup size={18} /> },
  ];

  const handleSaveSettings = () => {
    const nextData = { ...data, settings };
    setData(nextData); persistConfig(nextData);
    showToast('Security settings updated');
  };

  const renderSecurity = () => (
    <div className="set-page">
      <div className="set-section">
        <div className="set-section-head">
          <div className="set-ico"><Lock size={18} /></div>
          <div><h2>App Lock PIN</h2><p>Protect the app with a launch PIN, required on startup.</p></div>
        </div>
        <div className="set-section-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <SetToggle checked={!!settings.pinEnabled} onChange={v => setSettings({ ...settings, pinEnabled: v })}
            title="Require PIN on launch" desc="Prevents unauthorized access to quotations and settings" />
          {settings.pinEnabled && (
            <div className="set-field" style={{ maxWidth: 320 }}>
              <span className="set-label">6-Digit PIN</span>
              <div className="set-pin-row" style={{ display: 'flex', gap: 12 }}>
                <input className="set-input" type="password" maxLength="6" value={settings.pin || ''}
                  onChange={e => setSettings({ ...settings, pin: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="••••••" style={{ fontSize: 18, letterSpacing: '0.2em', textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                <button className="set-btn" onClick={handleSaveSettings}>Save</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="set-section">
        <div className="set-section-head">
          <div className="set-ico"><Download size={18} /></div>
          <div><h2>PDF Downloads</h2><p>Choose what happens when you download a quotation or warranty PDF.</p></div>
        </div>
        <div className="set-section-body">
          <SetToggle checked={!!askSaveLocation}
            onChange={v => { setAskSaveLocation(v); showToast(v ? 'PDFs will now ask where to save' : 'PDFs will save to Downloads'); }}
            title="Always ask where to save"
            desc={askSaveLocation ? 'A "Save as" window lets you pick the folder and name each time.' : 'PDFs save straight to your Downloads folder.'} />
        </div>
      </div>

      <div className="set-section">
        <div className="set-section-head">
          <div className="set-ico"><ShieldCheck size={18} /></div>
          <div><h2>Backups &amp; Data Safety</h2><p>Automatic backups, cloud accounts, verification and recovery now live on their own page.</p></div>
        </div>
        <div className="set-section-body">
          <button className="set-btn" onClick={() => setCurrentView('backup')}>Open Backup &amp; Recovery</button>
        </div>
      </div>
    </div>
  );

  const active = modules.find(m => m.id === activeModule);

  return (
    <div className="set-shell">
      <div className="set-topbar">
        <button className="set-back-btn app-nav-mobile-only" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentView('dashboard'); }} title="Back to Dashboard" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.04)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', cursor: 'pointer', color: 'var(--ink)', zIndex: 100, position: 'relative'
        }}>
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>
        <div className="set-topbar-icon"><SettingsIcon size={18} /></div>
        <div>
          <h1>{active?.label || 'Settings'}</h1>
          <p>Manage all aspects of your business platform.</p>
        </div>
      </div>

      <nav className="set-nav">
        <span className="set-nav-label">Settings</span>
        <div className="set-nav-mobile-dropdown">
          <select value={activeModule} onChange={e => setActiveModule(e.target.value)}>
            {modules.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="set-nav-buttons">
          {modules.map(m => (
            <button key={m.id} className={`set-nav-item${activeModule === m.id ? ' is-active' : ''}`} onClick={() => setActiveModule(m.id)} title={m.label} aria-current={activeModule === m.id ? 'page' : undefined}>
              <span className="set-nav-ico">{m.icon}</span>
              <span className="set-nav-copy">
                <strong className="desktop-label">{m.label}</strong>
                <strong className="mobile-label">{m.mobileLabel}</strong>
                <span>{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      <main className="set-main" ref={mainRef}>
        {activeModule === 'security' && renderSecurity()}
        {activeModule === 'quotation' && <QuotationSettings />}
        {activeModule === 'brands' && <BrandsSettings />}
        {activeModule === 'products' && <ProductsClassesSettings />}
        {activeModule === 'warranties' && <WarrantiesSettings />}
        {activeModule === 'backup' && <BackupSettings />}
      </main>
    </div>
  );
}
