import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowRight } from 'lucide-react';

export default function ClassGrid() {
  const { data, setCurrentView, setSelectedClassId } = useAppContext();
  const classes = data.classes.filter(c => c.type !== 'tools');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', borderBottom: '1px solid var(--line)', paddingBottom: '16px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 400 }}>Product Classes</h3>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-soft)' }}>Select to view varieties</span>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {classes.map(c => (
          <div key={c.id} 
            onClick={() => { setSelectedClassId(c.id); setCurrentView('varieties'); }}
            style={{
              background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.querySelector('.card-arrow').style.background = 'var(--accent)';
              e.currentTarget.querySelector('.card-arrow-icon').style.color = 'white';
              e.currentTarget.querySelector('.card-arrow-icon').style.transform = 'translateX(2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.querySelector('.card-arrow').style.background = 'rgba(255,255,255,0.9)';
              e.currentTarget.querySelector('.card-arrow-icon').style.color = 'var(--ink)';
              e.currentTarget.querySelector('.card-arrow-icon').style.transform = 'translateX(0)';
            }}
          >
            <div style={{ height: '180px', background: c.color, position: 'relative', overflow: 'hidden' }}>
               {/* Pattern Placeholder */}
               <div style={{ position: 'absolute', inset: 0, opacity: 0.1, backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
            </div>
            
            <div className="card-arrow" style={{
              position: 'absolute', top: '20px', right: '20px', width: '36px', height: '36px', 
              background: 'rgba(255,255,255,0.9)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)', transition: 'all 0.2s'
            }}>
              <ArrowRight className="card-arrow-icon" size={16} style={{ color: 'var(--ink)', transition: 'all 0.2s' }} />
            </div>

            <div style={{ padding: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: '8px' }}>
                {c.subtitle}
              </div>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', marginBottom: '8px' }}>{c.name}</h4>
              <p style={{ fontSize: '13px', color: 'var(--ink-mid)' }}>{c.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
