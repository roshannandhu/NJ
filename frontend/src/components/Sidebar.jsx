import { useState } from 'react';
import { Settings, FileText, ShieldCheck, PlusCircle, LayoutDashboard, ShieldAlert } from 'lucide-react';

export default function Sidebar({ currentView, setCurrentView }) {
  const [expanded, setExpanded] = useState(false);

  const navItems = [
    { id: 'dashboard',      label: 'Dashboard',          icon: LayoutDashboard },
    { id: 'quotation_desk', label: 'Quotation Desk',     icon: PlusCircle      },
    { id: 'quotations',     label: 'Quotation History',  icon: FileText        },
    { id: 'warranties',     label: 'Warranty History',   icon: ShieldCheck     },
    { id: 'backup',         label: 'Backup & Recovery',  icon: ShieldAlert     },
    { id: 'settings',       label: 'Settings',           icon: Settings        },
  ];

  const W_COLLAPSED = 56;   // px — icon-only rail
  const W_EXPANDED  = 240;  // px — full sidebar

  return (
    <>
      {/* ── Backdrop overlay (mobile / click-outside close) ── */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.30)',
            backdropFilter: 'blur(2px)',
            transition: 'opacity 0.2s',
          }}
        />
      )}

      {/* ── Sidebar panel ── */}
      <div
        style={{
          width: expanded ? `${W_EXPANDED}px` : `${W_COLLAPSED}px`,
          minWidth: expanded ? `${W_EXPANDED}px` : `${W_COLLAPSED}px`,
          background: '#1a1a1a',
          color: '#d9d4c7',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          borderRight: '1px solid #2a2a2a',
          overflow: 'hidden',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
          flexShrink: 0,
        }}
      >
        {/* ── Top: Hamburger + Logo ── */}
        <div style={{
          padding: '0',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          height: '64px',
          gap: '0',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Hamburger toggle button */}
          <button
            onClick={() => setExpanded(o => !o)}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{
              width: `${W_COLLAPSED}px`,
              minWidth: `${W_COLLAPSED}px`,
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: '#8a857a',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#faf8f4'; e.currentTarget.style.background = '#252525'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#8a857a'; e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Three horizontal lines (hamburger) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '20px' }}>
              <span style={{
                display: 'block', height: '2px', borderRadius: '2px',
                background: 'currentColor',
                transition: 'transform 0.2s, opacity 0.2s',
                transform: expanded ? 'translateY(6px) rotate(45deg)' : 'none',
              }} />
              <span style={{
                display: 'block', height: '2px', borderRadius: '2px',
                background: 'currentColor',
                transition: 'opacity 0.2s',
                opacity: expanded ? 0 : 1,
              }} />
              <span style={{
                display: 'block', height: '2px', borderRadius: '2px',
                background: 'currentColor',
                transition: 'transform 0.2s, opacity 0.2s',
                transform: expanded ? 'translateY(-6px) rotate(-45deg)' : 'none',
              }} />
            </div>
          </button>

          {/* Brand name — only visible when expanded */}
          <div style={{
            opacity: expanded ? 1 : 0,
            transform: expanded ? 'translateX(0)' : 'translateX(-12px)',
            transition: 'opacity 0.2s 0.05s, transform 0.2s 0.05s',
            pointerEvents: expanded ? 'auto' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 500,
              margin: 0, color: '#faf8f4', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              NJ<span style={{ color: 'var(--accent)' }}>.</span>
            </h1>
            <div style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.16em', color: '#6a6558', marginTop: '5px' }}>
              Home Care · Kerala
            </div>
          </div>
        </div>

        {/* ── Nav Items ── */}
        <nav style={{ padding: '12px 8px', flex: 1, overflow: 'hidden' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id ||
              (item.id === 'quotation_desk' && ['checkout', 'quotation_document', 'warranty_document'].includes(currentView));

            return (
              <button
                key={item.id}
                onClick={() => { setCurrentView(item.id); setExpanded(false); }}
                title={!expanded ? item.label : undefined}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px',
                  marginBottom: '2px',
                  borderRadius: '8px',
                  background: isActive ? '#faf8f4' : 'transparent',
                  color: isActive ? '#1a1a1a' : '#a8a298',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#252525';
                    e.currentTarget.style.color = '#f0ebe1';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#a8a298';
                  }
                }}
              >
                {/* Active indicator dot */}
                {isActive && !expanded && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: '3px', height: '20px', borderRadius: '0 2px 2px 0',
                    background: 'var(--accent)',
                  }} />
                )}

                <Icon
                  size={18}
                  strokeWidth={1.6}
                  color={isActive ? '#1a1a1a' : 'currentColor'}
                  style={{ flexShrink: 0 }}
                />

                <span style={{
                  fontSize: '14px', fontWeight: 400,
                  opacity: expanded ? 1 : 0,
                  transition: 'opacity 0.15s',
                  overflow: 'hidden',
                  flex: 1,
                }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div style={{
          padding: '16px 0',
          borderTop: '1px solid #2a2a2a',
          fontSize: '11px',
          color: '#6a6558',
          lineHeight: '1.6',
          textAlign: 'center',
          overflow: 'hidden',
          transition: 'opacity 0.15s',
          opacity: expanded ? 1 : 0,
          height: expanded ? 'auto' : '40px',
        }}>
          <div style={{ paddingInline: '20px', whiteSpace: 'nowrap' }}>
            NJ India Trading Pvt. Ltd.<br />
            Kozhikode, Kerala
          </div>
        </div>

      </div>
    </>
  );
}
