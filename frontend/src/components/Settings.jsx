import React, { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';
import { ShieldCheck, Briefcase, FileText, ShoppingBag, ArrowLeft, Grid, Lock, Unlock, Download, Award } from 'lucide-react';

import ProductsClassesSettings from './ProductsClassesSettings';
import BrandsSettings from './BrandsSettings';
import WarrantiesSettings from './WarrantiesSettings';
import QuotationSettings from './QuotationSettings';
import BackupSettings from './BackupSettings';

export default function Settings() {
  const { data, setData, showToast, persistConfig, askSaveLocation, setAskSaveLocation } = useAppContext();
  const [activeModule, setActiveModule] = useState(null);

  const [company, setCompany] = useState(data.company || {});
  const [settings, setSettings] = useState(data.settings || {});

  useEffect(() => {
    setCompany(data.company || {});
  }, [data.company]);

  useEffect(() => {
    setSettings(data.settings || {});
  }, [data.settings]);

  const modules = [
    { id: 'brands', label: 'Parent Brands', desc: 'Manage parent brands (NJ, HighLander, …) that group your product classes.', icon: <Award size={20}/>, count: `${data.brands?.length || 0} Brands` },
    { id: 'products', label: 'Products & Catalog', desc: 'Manage your entire inventory hierarchy, pricing, and tile variations.', icon: <ShoppingBag size={20}/>, count: `${data.classes?.length || 0} Classes` },
    { id: 'warranties', label: 'Warranty Builder', desc: 'Design, add, and configure your warranty document templates.', icon: <ShieldCheck size={20}/>, count: `${data.warranties?.length || 0} Templates` },
    { id: 'company', label: 'Company Profile', desc: 'Configure global branding, contact details, and platform identity.', icon: <Briefcase size={20}/>, count: company.name ? 'Configured' : 'Needs Setup' },
    { id: 'quotation', label: 'Quotation Specs', desc: 'Set up financial rules, taxes, validities, and default document text.', icon: <FileText size={20}/>, count: settings.taxEnabled ? 'Tax Enabled' : 'No Tax' },
    { id: 'security', label: 'Security & Backup', desc: 'Manage application access PIN and local database backups.', icon: <Lock size={20}/>, count: settings.pinEnabled ? 'PIN Active' : 'Unsecured' }
  ];

  const handleSaveCompany = () => {
    const nextData = { ...data, company };
    setData(nextData);
    persistConfig(nextData);
    showToast("Company profile updated");
  };

  const handleSaveSettings = () => {
    const nextData = { ...data, settings };
    setData(nextData);
    persistConfig(nextData);
    showToast("Security settings updated");
  };

  const inpStyle = {
    padding: '6px 12px', border: '1px solid var(--line)', borderRadius: '4px',
    fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
    boxSizing: 'border-box', width: '100%'
  };

  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '6px 14px', fontSize: 13, fontWeight: 500,
    border: '1px solid var(--line)', borderRadius: '4px',
    background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer',
  };

  const renderCompanyModule = () => (
    <div style={{ maxWidth: '800px', margin: '0 auto', background: 'var(--surface)', borderRadius: '6px', padding: '24px', border: '1px solid var(--line)' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>Company Profile</h2>
      <p style={{ color: 'var(--ink-soft)', marginBottom: '24px', fontSize: 13 }}>This information appears on every quotation and warranty document.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Company Name</label>
          <input value={company.name || ''} onChange={e => setCompany({...company, name: e.target.value})} style={inpStyle} />
        </div>
        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Primary Address</label>
          <textarea value={company.address || ''} onChange={e => setCompany({...company, address: e.target.value})} style={{ ...inpStyle, minHeight: '80px', resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Support Phone</label>
          <input value={company.phone || ''} onChange={e => setCompany({...company, phone: e.target.value})} style={inpStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Website</label>
          <input value={company.website || ''} onChange={e => setCompany({...company, website: e.target.value})} style={inpStyle} />
        </div>
      </div>
      
      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
        <button onClick={handleSaveCompany} style={{ ...btnStyle, background: 'var(--ink)', color: 'white', border: 'none', fontWeight: 600 }}>Save Profile</button>
      </div>
    </div>
  );

  const renderSecurityModule = () => (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* App Lock Section (Desktop Style) */}
      <div style={{ 
        background: 'var(--surface)', 
        borderRadius: '6px', 
        padding: '24px', 
        border: '1px solid var(--line)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Lock size={20} color="var(--ink)" />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>App Lock PIN</h2>
        </div>
        <p style={{ color: 'var(--ink-soft)', marginBottom: '24px', fontSize: '13px' }}>Protect your application with a secure launch PIN. Required on startup.</p>

        <div style={{ 
          background: 'var(--bg)', 
          borderRadius: '4px', 
          border: '1px solid var(--line)', 
          padding: '16px 20px',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>Require PIN on Launch</div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>Prevents unauthorized access to quotations and settings</div>
              </div>
            </div>
            {/* Native-style desktop toggle switch */}
            <div style={{ position: 'relative', width: '40px', height: '20px', borderRadius: '100px', background: settings.pinEnabled ? 'var(--ink)' : 'var(--line-soft)', border: '1px solid var(--line)', transition: 'background 0.2s' }}>
                <input type="checkbox" checked={settings.pinEnabled || false} onChange={e => setSettings({...settings, pinEnabled: e.target.checked})} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', position: 'absolute', zIndex: 2 }} />
                <div style={{ position: 'absolute', top: '1px', left: settings.pinEnabled ? '21px' : '1px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)', border: '1px solid rgba(0,0,0,0.1)' }}></div>
            </div>
          </label>
          
          {settings.pinEnabled && (
            <div style={{ 
              marginTop: '16px', 
              paddingTop: '16px', 
              borderTop: '1px solid var(--line-soft)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              <div style={{ flex: 1, maxWidth: 300 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>6-Digit PIN</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input 
                    type="password" 
                    maxLength="6" 
                    value={settings.pin || ''} 
                    onChange={e => setSettings({...settings, pin: e.target.value.replace(/[^0-9]/g, '')})} 
                    placeholder="••••••"
                    style={{ 
                      ...inpStyle,
                      fontSize: '18px', 
                      letterSpacing: '0.2em', 
                      fontWeight: 'bold',
                      textAlign: 'center',
                      fontFamily: 'monospace'
                    }} 
                  />
                  <button 
                    onClick={handleSaveSettings} 
                    style={{ ...btnStyle, background: 'var(--ink)', color: 'white', border: 'none', fontWeight: 600 }}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PDF download location preference */}
      <div style={{ background: 'var(--surface)', borderRadius: '6px', padding: '24px', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Download size={20} color="var(--ink)" />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>PDF Downloads</h2>
        </div>
        <p style={{ color: 'var(--ink-soft)', marginBottom: '24px', fontSize: '13px' }}>Choose what happens when you download a quotation or warranty PDF.</p>

        <div style={{ background: 'var(--bg)', borderRadius: '4px', border: '1px solid var(--line)', padding: '16px 20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>Always ask where to save</div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  {askSaveLocation
                    ? 'A "Save as" window lets you pick the folder and name each time.'
                    : 'PDFs save straight to your Downloads folder.'}
                </div>
              </div>
            </div>
            {/* Native-style desktop toggle switch */}
            <div style={{ position: 'relative', width: '40px', height: '20px', borderRadius: '100px', background: askSaveLocation ? 'var(--ink)' : 'var(--line-soft)', border: '1px solid var(--line)', transition: 'background 0.2s' }}>
              <input
                type="checkbox"
                checked={!!askSaveLocation}
                onChange={e => { setAskSaveLocation(e.target.checked); showToast(e.target.checked ? 'PDFs will now ask where to save' : 'PDFs will save to Downloads'); }}
                style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', position: 'absolute', zIndex: 2 }}
              />
              <div style={{ position: 'absolute', top: '1px', left: askSaveLocation ? '21px' : '1px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)', border: '1px solid rgba(0,0,0,0.1)' }}></div>
            </div>
          </label>
        </div>
      </div>

      <div style={{ height: '1px', background: 'var(--line)', margin: '8px 0' }}></div>

      {/* Renders the BackupSettings component we just rebuilt */}
      <BackupSettings />
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: '"Segoe UI", system-ui, Roboto, sans-serif' }}>
      
      {/* Integrated Topbar (Desktop Minimalist) */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)'
      }}>
        {activeModule && (
          <button 
            onClick={() => setActiveModule(null)}
            style={{ ...btnStyle, marginRight: '16px', padding: '6px 12px' }}
          >
            <ArrowLeft size={14}/> Back
          </button>
        )}
        
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            {activeModule ? modules.find(m => m.id === activeModule)?.label : "Command Center & Settings"}
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
            {activeModule ? modules.find(m => m.id === activeModule)?.desc : "Manage all aspects of your business platform."}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {/* Module Selection Grid (Dense Data View) */}
        {!activeModule ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', maxWidth: 1200, margin: '0 auto' }}>
          {modules.map(mod => (
            <div 
              key={mod.id} 
              onClick={() => setActiveModule(mod.id)}
              style={{ 
                background: 'var(--surface)', 
                border: '1px solid var(--line)', 
                borderRadius: '6px', 
                padding: '20px', 
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'border-color 0.1s, background 0.1s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--ink-soft)';
                e.currentTarget.style.background = 'var(--bg-warm)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--line)';
                e.currentTarget.style.background = 'var(--surface)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink)', fontWeight: 600 }}>
                  {mod.icon} {mod.label}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {mod.count}
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--ink-soft)', lineHeight: '1.4', margin: 0 }}>{mod.desc}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          {activeModule === 'company' && renderCompanyModule()}
          {activeModule === 'quotation' && <QuotationSettings />}
          {activeModule === 'security' && renderSecurityModule()}
          {activeModule === 'brands' && <BrandsSettings />}
          {activeModule === 'products' && <ProductsClassesSettings />}
          {activeModule === 'warranties' && <WarrantiesSettings />}
        </div>
      )}

      </div>
    </div>
  );
}
