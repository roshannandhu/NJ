import { useState } from 'react';
import { ShoppingCart, ChevronUp, ChevronDown } from 'lucide-react';

export default function Topbar({ title, subtitle, cartCount, onOpenCart, currentView }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div style={{
      position: 'relative',
      zIndex: 50,
      transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      maxHeight: isCollapsed ? '3px' : '120px',
      height: isCollapsed ? '3px' : 'auto',
    }}>
      {/* Visual Topbar Content */}
      <div style={{
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isCollapsed ? 'translateY(calc(-100% + 3px))' : 'translateY(0)',
        background: 'var(--surface)',
      }}>
        <div 
          className="glass" 
          style={{
            padding: '20px 40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 400, color: 'var(--ink)' }}>
              {title}
            </h2>
            {subtitle && (
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                {subtitle}
              </div>
            )}
          </div>

          {currentView !== 'quotation_desk' && currentView !== 'checkout' && (
            <button 
              onClick={onOpenCart}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 20px',
                background: 'white',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-full)',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.2s',
                color: 'var(--ink)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--ink-soft)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
            >
              <ShoppingCart size={18} strokeWidth={1.5} />
              <span style={{ fontSize: '14px', fontWeight: 500 }}>Cart</span>
              {cartCount > 0 && (
                <div style={{
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '100px',
                  minWidth: '22px',
                  textAlign: 'center'
                }}>
                  {cartCount}
                </div>
              )}
            </button>
          )}
        </div>

        {/* Collapse Handle Tab (Visible when expanded) */}
        {!isCollapsed && (
          <button 
            onClick={() => setIsCollapsed(true)}
            title="Collapse Header"
            style={{
              position: 'absolute',
              bottom: '-14px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderTop: 'none',
              borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
              padding: '2px 16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-sm)',
              zIndex: 60,
              color: 'var(--ink-soft)',
              transition: 'color 0.2s, background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent)';
              e.currentTarget.style.background = 'var(--accent-soft)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-soft)';
              e.currentTarget.style.background = 'var(--surface)';
            }}
          >
            <ChevronUp size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Collapsed Strip & Click Handler (Active when collapsed) */}
      {isCollapsed && (
        <div 
          onClick={() => setIsCollapsed(false)}
          title="Click to Expand Header"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '24px', // Taller hit target for ease of use
            cursor: 'pointer',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onMouseEnter={(e) => {
            const strip = e.currentTarget.querySelector('.indicator-strip');
            if (strip) strip.style.background = 'var(--accent-hover)';
            const tag = e.currentTarget.querySelector('.expand-tag');
            if (tag) tag.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            const strip = e.currentTarget.querySelector('.indicator-strip');
            if (strip) strip.style.background = 'var(--accent)';
            const tag = e.currentTarget.querySelector('.expand-tag');
            if (tag) tag.style.opacity = '0';
          }}
        >
          {/* Subtle dropdown label on hover */}
          <div 
            className="expand-tag"
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--accent)',
              color: '#FFFFFF',
              fontSize: '9px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 10px',
              borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              opacity: 0,
              pointerEvents: 'none',
              transition: 'opacity 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ChevronDown size={10} strokeWidth={3} />
            Show Menu
          </div>

          {/* Elegant 3px Accent Indicator Line */}
          <div 
            className="indicator-strip"
            style={{
              height: '3px',
              background: 'var(--accent)',
              transition: 'background-color 0.2s',
              width: '100%',
            }}
          />
        </div>
      )}
    </div>
  );
}
