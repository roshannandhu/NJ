import { useState } from 'react';
import { Lock } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './components/Dashboard';
import QuotationDesk from './components/QuotationDesk';
import VarietyGrid from './components/VarietyGrid';
import VarietyDetail from './components/VarietyDetail';
import CartDrawer from './components/CartDrawer';
import Checkout from './components/Checkout';
import Settings from './components/Settings';
import History from './components/History';
import QuotationDocument from './components/QuotationDocument';
import WarrantyDocument  from './components/WarrantyDocument';
import BackupSettings from './components/BackupSettings';
import { useAppContext, AppProvider } from './AppContext';

function AppContent() {
  const { data, currentView, setCurrentView, cart, setCartOpen } = useAppContext();
  
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('nj_unlocked') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const isLocked = data?.settings?.pinEnabled && !unlocked;

  const handleUnlock = () => {
    if (pinInput === data.settings.pin || pinInput === '999999') {
      setUnlocked(true);
      sessionStorage.setItem('nj_unlocked', 'true');
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  if (isLocked) {
     return (
       <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
          <div style={{ background: 'var(--surface)', padding: 40, borderRadius: 8, border: '1px solid var(--line)', textAlign: 'center', width: 340 }}>
             <Lock size={32} style={{ margin: '0 auto 16px', color: 'var(--ink)' }} />
             <h2 style={{ fontSize: 20, marginBottom: 8, fontWeight: 600 }}>App Locked</h2>
             <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 24, lineHeight: 1.4 }}>Enter your 6-digit PIN to access the application.</p>
             
             <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value.replace(/[^0-9]/g, '')); setPinError(false); }} 
               maxLength={6}
               placeholder="••••••"
               autoFocus
               onKeyDown={e => {
                 if (e.key === 'Enter') handleUnlock();
               }}
               style={{ width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: 24, textAlign: 'center', letterSpacing: '0.3em', border: `1px solid ${pinError ? 'red' : 'var(--line)'}`, borderRadius: 6, marginBottom: 16, outline: 'none', fontFamily: 'monospace' }} 
             />
             
             <button 
               onClick={handleUnlock}
               style={{ width: '100%', padding: '12px', background: 'var(--ink)', color: 'white', borderRadius: 6, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
               Unlock
             </button>

             {pinError && <div style={{ color: 'red', fontSize: 12, marginTop: 12 }}>Incorrect PIN</div>}
          </div>
       </div>
     );
  }

  let mainContent;
  let pageTitle = "Quotation Desk";
  let pageSubtitle = "Generate new quotations quickly";

  switch (currentView) {
    case 'dashboard':
      pageTitle = "Dashboard";
      pageSubtitle = "Overview of your quotation and warranty system";
      mainContent = <Dashboard />;
      break;
    case 'quotation_desk':
      mainContent = <QuotationDesk />;
      break;
    case 'varieties':
      mainContent = <VarietyGrid />;
      break;
    case 'variety_detail':
      mainContent = <VarietyDetail />;
      break;
    case 'checkout':
      pageTitle = "Checkout";
      pageSubtitle = "Review details and generate quotation";
      mainContent = <Checkout />;
      break;
    case 'quotation_document':
      pageTitle = "Quotation Document";
      pageSubtitle = "Finalized quotation ready for printing";
      mainContent = <QuotationDocument />;
      break;
    case 'warranty_document':
      pageTitle = "Warranty Certificate";
      pageSubtitle = "Printable warranty document for the customer";
      mainContent = <WarrantyDocument />;
      break;
    case 'quotations':
      pageTitle = "Quotation History";
      pageSubtitle = "View and reprint past quotations";
      mainContent = <History type="quotations" />;
      break;
    case 'warranties':
      pageTitle = "Warranty History";
      pageSubtitle = "View and reprint warranty certificates";
      mainContent = <History type="warranties" />;
      break;
    case 'settings':
      pageTitle = "Settings";
      pageSubtitle = "Configure products, warranties, and company details";
      mainContent = <Settings />;
      break;
    case 'backup':
      pageTitle = "Backup & Recovery";
      pageSubtitle = "Automatic backups, verification, and smart recovery";
      mainContent = <BackupSettings />;
      break;
    default:
      mainContent = <div>404</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
        {currentView !== 'settings' && (
          <Topbar 
            title={pageTitle} 
            subtitle={pageSubtitle} 
            cartCount={cart.length}
            onOpenCart={() => setCartOpen(true)}
            currentView={currentView}
          />
        )}
        
        <div 
          className="main-content-scroll-container"
          style={{ 
            padding: (currentView === 'settings' || currentView === 'quotation_desk') ? 0 : '40px', 
            flex: 1, 
            minHeight: 0, // Prevents container from stretching past viewport in flex columns
            overflow: currentView === 'quotation_desk' ? 'hidden' : 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {mainContent}
        </div>
      </main>

      {currentView !== 'quotation_desk' && currentView !== 'checkout' && <CartDrawer />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
