import React from 'react';
import { useAppContext } from '../AppContext';
import { ArrowLeft } from 'lucide-react';

export default function VarietyGrid() {
  const { data, selectedClassId, setSelectedVarietyId, setCurrentView } = useAppContext();
  const cls = data.classes.find(c => c.id === selectedClassId);
  const varieties = data.varieties.filter(v => v.classId === selectedClassId);

  if (!cls) return <div onClick={() => setCurrentView('home')}>Back to Home</div>;

  return (
    <div className="animate-fade-up">
      <button 
        onClick={() => setCurrentView('home')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink-mid)', marginBottom: '24px', fontWeight: 500 }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-mid)'}
      >
        <ArrowLeft size={16} /> Back to Products
      </button>

      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px' }}>{cls.name} Varieties</h2>
        <p style={{ color: 'var(--ink-soft)' }}>Select a variety to configure colors and quantity.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {varieties.map(v => (
          <div key={v.id} 
            onClick={() => { setSelectedVarietyId(v.id); setCurrentView('variety_detail'); }}
            style={{
              background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
              overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ height: '140px', background: 'var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Image Placeholder</span>
            </div>
            <div style={{ padding: '16px' }}>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '6px' }}>{v.name}</h4>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-deep)' }}>
                ₹{v.basePrice} <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 400 }}>/ {v.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
