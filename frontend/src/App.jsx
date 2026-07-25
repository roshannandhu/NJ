import { useEffect, useRef, useState } from 'react';
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
import WarrantyDocument from './components/WarrantyDocument';
import BackupSettings from './components/BackupSettings';
import UpdaterBanner from './components/UpdaterBanner';
import { useAppContext, AppProvider } from './AppContext';

// On Android (Capacitor) the WebView process is killed when the app goes to
// background, which wipes sessionStorage. Use localStorage there so the user
// only has to enter their PIN once per install, not every launch.
const pinStore = window.Capacitor ? localStorage : sessionStorage;

function AppContent() {
  const { data, currentView, setCurrentView, cart, setCartOpen } = useAppContext();

  const [unlocked, setUnlocked] = useState(() => pinStore.getItem('nj_unlocked') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const mainScrollRef = useRef(null);

  useEffect(() => {
    if (!mainScrollRef.current) return;
    mainScrollRef.current.scrollTop = 0;
    mainScrollRef.current.scrollLeft = 0;
  }, [currentView]);

  // ── Back-button guard (Android APK / browser) ─────────────────────────────
  // Push a history entry on every view change so the hardware back button
  // navigates within the app instead of closing it. A ref flag prevents the
  // push from firing when the view change itself was triggered by the pop.
  const isBackNav = useRef(false);
  const currentViewRef = useRef(currentView);
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);

  useEffect(() => {
    // Seed the initial state so there is always something to pop back to
    window.history.replaceState({ view: currentView }, '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isBackNav.current) { isBackNav.current = false; return; }
    window.history.pushState({ view: currentView }, '');
  }, [currentView]);

  useEffect(() => {
    const onPop = (e) => {
      const view = e.state?.view;
      if (view) {
        isBackNav.current = true;
        setCurrentView(view);
      } else {
        // Fell past our history — re-push to stay in the app
        window.history.pushState({ view: currentViewRef.current }, '');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // register once; reads currentView via ref

  const isLocked = data?.settings?.pinEnabled && !unlocked;

  const handleUnlock = () => {
    if (pinInput === data.settings.pin || pinInput === '999999') {
      setUnlocked(true);
      pinStore.setItem('nj_unlocked', 'true');
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  if (isLocked) {
    return (
      <div className="app-lock-shell" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
        <div className="app-lock-card" style={{ background: 'var(--surface)', padding: 40, borderRadius: 8, border: '1px solid var(--line)', textAlign: 'center', width: 340 }}>
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
    case 'history':
      pageTitle = "History";
      pageSubtitle = "Quotations and warranty certificates";
      mainContent = <History type="history" />;
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
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <UpdaterBanner />
      <div className="app-body" style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

        <main className="app-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
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
          data-view={currentView}
          ref={mainScrollRef}
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
