import React, { useMemo, useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { Image as ImageIcon, FileSignature, ShieldAlert, Stamp, Plus, Trash2, ShieldCheck, Save } from 'lucide-react';
import { DEFAULT_DATA } from '../data';

export default function WarrantiesSettings() {
  const { data, setData, showToast, persistConfig } = useAppContext();
  
  // Resolve active warranties array, preserving saved edits while filling any missing defaults.
  const warranties = useMemo(() => {
    const source = data.warranties?.length ? data.warranties : DEFAULT_DATA.warranties;
    return source.map(warranty => {
      const fallback = DEFAULT_DATA.warranties.find(item => item.id === warranty.id) || {};
      return {
        ...fallback,
        ...warranty,
        sections: warranty.sections?.length ? warranty.sections : fallback.sections || [],
        seriesTable: warranty.seriesTable?.length ? warranty.seriesTable : fallback.seriesTable || [],
      };
    });
  }, [data.warranties]);

  const companyName = data.company?.name || 'NJ India Trading Pvt. Ltd.';

  const [activeId, setActiveId] = useState(warranties[0].id);
  
  // Local state for the actively editing warranty
  const [current, setCurrent] = useState(warranties.find(w => w.id === activeId) || warranties[0]);

  // Synchronize local state when selected template changes
  useEffect(() => {
    const found = warranties.find(w => w.id === activeId);
    if (found) {
      setCurrent(found);
    }
  }, [activeId, warranties]);

  const handleSelect = (id) => {
    setActiveId(id);
  };

  const handleImageUpload = (e, callback) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => callback(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    const newWarranties = warranties.map(w => w.id === current.id ? current : w);
    const nextData = { ...data, warranties: newWarranties };
    setData(nextData);
    persistConfig(nextData);
    showToast(`${current.title} saved successfully in local database`, "success");
  };

  // Create a brand-new, fully customizable warranty certificate.
  const handleAddWarranty = () => {
    const newId = `custom_${Date.now()}`;
    const newWarranty = {
      id: newId,
      title: 'New Warranty Certificate',
      logo: 'NJ',
      duration: '10 Years',
      opening: 'Congratulations on your purchase. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards.\nWe strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.',
      sections: [
        { title: '1. Product Information:', content: '', isBullets: false },
        { title: '2. Warranty terms and conditions:', content: '', isBullets: false },
      ],
      showSeriesTable: false,
      seriesTable: [],
      heatoutTable: false,
      signImage: '',
      sealImage: '',
    };
    // Persist the resolved list (defaults merged) plus the new template.
    const nextData = { ...data, warranties: [...warranties, newWarranty] };
    setData(nextData);
    persistConfig(nextData);
    setActiveId(newId);
    setCurrent(newWarranty);
    showToast('New warranty certificate created — customize and save it', 'success');
  };

  // Delete the currently-selected warranty certificate.
  const handleDeleteWarranty = () => {
    if (warranties.length <= 1) {
      showToast('At least one warranty certificate must remain', 'error');
      return;
    }
    if (!window.confirm(`Delete "${current.title}"?\n\nAny product class linked to it will fall back to a default warranty. This cannot be undone.`)) {
      return;
    }
    const remaining = warranties.filter(w => w.id !== current.id);
    const nextData = { ...data, warranties: remaining };
    setData(nextData);
    persistConfig(nextData);
    setActiveId(remaining[0].id);
    setCurrent(remaining[0]);
    showToast('Warranty certificate deleted', 'success');
  };

  // Series table operations
  const updateSeriesRow = (index, field, value) => {
    const updatedRows = [...(current.seriesTable || [])];
    updatedRows[index] = { ...updatedRows[index], [field]: value };
    setCurrent({ ...current, seriesTable: updatedRows });
  };

  const addSeriesRow = () => {
    const updatedRows = [...(current.seriesTable || [])];
    updatedRows.push({ series: 'New Series Name', duration: '10 years' });
    setCurrent({ ...current, seriesTable: updatedRows });
  };

  const removeSeriesRow = (index) => {
    const updatedRows = (current.seriesTable || []).filter((_, i) => i !== index);
    setCurrent({ ...current, seriesTable: updatedRows });
  };

  return (
    <div style={{ display: 'flex', gap: '32px', height: 'calc(100vh - 120px)', padding: '24px 40px', overflow: 'hidden', background: 'var(--bg)' }}>
      
      {/* Left Pane: Template Selector */}
      <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, color: 'var(--ink-soft)' }}>
            WARRANTY CERTIFICATES
          </div>
        </div>

        <button
          onClick={handleAddWarranty}
          className="hover-lift"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '12px 16px', borderRadius: 'var(--radius)', cursor: 'pointer',
            background: 'var(--accent)', color: 'white', border: 'none',
            fontSize: '13px', fontWeight: 700, boxShadow: 'var(--shadow-sm)'
          }}
        >
          <Plus size={16} /> Add New Warranty
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {warranties.map(w => {
            const isSelected = activeId === w.id;
            return (
              <div 
                key={w.id}
                onClick={() => handleSelect(w.id)}
                style={{ 
                  padding: '16px 20px', 
                  background: isSelected ? 'var(--surface)' : 'var(--surface)', 
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--line)', 
                  borderRadius: 'var(--radius)', 
                  cursor: 'pointer', 
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  position: 'relative'
                }}
                className="hover-lift"
              >
                <div style={{ fontWeight: 700, fontSize: '15px', color: isSelected ? 'var(--accent)' : 'var(--ink)' }}>
                  {w.title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                  Coverage: {w.duration}
                </div>
                
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--ink-soft)', marginRight: '4px' }}>Seals:</div>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: w.signImage ? '#4A6B3A' : '#A3392D', title: 'Authorized Sign' }}/>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: w.sealImage ? '#4A6B3A' : '#A3392D', title: 'Official Seal' }}/>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)', marginLeft: 'auto' }}>
                    {w.id.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        
        <div style={{ marginTop: 'auto', padding: '16px', background: 'var(--accent-soft)', borderRadius: 'var(--radius)', border: '1px solid rgba(194, 65, 12, 0.15)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-deep)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldAlert size={14} color="var(--accent)"/> Legal Document Editor
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-mid)', lineHeight: '1.6' }}>
            Directly customize manufacturer specs, test certifications, guidelines for validity, and exclusions. Type your terms, split them with line breaks to render premium bullet points automatically.
          </div>
        </div>
      </div>

      {/* Right Pane: Live Document CMS Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F4EFE6', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
        
        {/* Editor Toolbar */}
        <div style={{ padding: '18px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>
              Live WYSIWYG Document Editor
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
              Editing template: <strong>{current.title}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleDeleteWarranty}
              className="hover-lift"
              title="Delete this warranty certificate"
              style={{
                padding: '12px 18px',
                fontSize: '13px',
                background: 'transparent',
                color: 'var(--red)',
                border: '1px solid var(--red)',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              <Trash2 size={16} /> Delete
            </button>
            <button
              onClick={handleSave}
              className="btn-primary"
              style={{
                padding: '12px 24px',
                fontSize: '13px',
                background: 'var(--accent)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Save size={16} /> Save Document Template
            </button>
          </div>
        </div>

        {/* The CMS Workspace Scrollable Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', justifyContent: 'center' }}>
          
          {/* Certificate Representative Sheet */}
          <div style={{ 
            width: '100%', 
            maxWidth: '800px', 
            background: '#FAF6EF', 
            boxShadow: '0 12px 32px rgba(30, 25, 20, 0.05)', 
            padding: '48px', 
            minHeight: '1100px', 
            display: 'flex', 
            flexDirection: 'column',
            border: '2px double #C2410C',
            borderRadius: '4px',
            position: 'relative'
          }}>
            
            {/* Watermark */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.01, pointerEvents: 'none' }}>
              <ShieldCheck size={400} color="#C2410C" />
            </div>

            {/* HEADER AREA */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #C2410C', paddingBottom: '20px', marginBottom: '24px' }}>
              <div style={{ flex: 1, paddingRight: '20px' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C2410C', display: 'block', marginBottom: '4px' }}>
                  WARRANTY TITLE HEADER
                </span>
                <input 
                  value={current.title} 
                  onChange={e => setCurrent({...current, title: e.target.value})}
                  style={{ fontSize: '26px', fontWeight: 700, color: 'var(--ink)', border: 'none', background: 'transparent', width: '100%', padding: '4px 0', borderBottom: '1px dashed var(--line)', outline: 'none', fontFamily: 'var(--font-display)' }}
                  placeholder="Warranty Certificate Title"
                />
                
                <span style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', display: 'block', marginTop: '14px', marginBottom: '4px' }}>
                  WARRANTY LOGO (IMAGE OR TEXT)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ 
                    height: '80px', border: '1.5px dashed var(--line)', borderRadius: 'var(--radius)', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: (current.logo && current.logo.startsWith('data:image/')) ? `url(${current.logo}) center/contain no-repeat #FFFFFF` : '#FFFFFF',
                    cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                  }} className="hover-lift">
                    {(!current.logo || !current.logo.startsWith('data:image/')) && (
                      <>
                        <ImageIcon size={20} color="var(--ink-soft)" style={{ marginBottom: '4px' }}/>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-mid)' }}>Upload Logo Image</div>
                      </>
                    )}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, (base64) => setCurrent({...current, logo: base64}))} />
                  </label>
                  
                  {(current.logo && current.logo.startsWith('data:image/')) ? (
                    <button 
                      onClick={() => setCurrent({...current, logo: ''})}
                      style={{ fontSize: '11px', fontWeight: 600, color: 'var(--red)', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', alignSelf: 'flex-start' }}
                    >
                      Remove Logo Image (Switch back to Text)
                    </button>
                  ) : (
                    <input 
                      value={current.logo || ''} 
                      onChange={e => setCurrent({...current, logo: e.target.value})}
                      style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent)', border: 'none', background: 'transparent', width: '100%', padding: '4px 0', borderBottom: '1px dashed var(--line)', outline: 'none' }}
                      placeholder="Or enter brand logo text..."
                    />
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', width: '180px' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C2410C', display: 'block', marginBottom: '4px' }}>
                  COVERAGE DURATION
                </span>
                <input 
                  value={current.duration} 
                  onChange={e => setCurrent({...current, duration: e.target.value})}
                  style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)', border: 'none', background: 'transparent', width: '100%', textAlign: 'right', padding: '4px 0', borderBottom: '1px dashed var(--line)', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  placeholder="e.g. 25 Years"
                />
                
                <span style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', display: 'block', marginTop: '14px', marginBottom: '4px' }}>
                  WARRANTOR COMPANY TITLE
                </span>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>{companyName}</div>
              </div>
            </div>

            {/* OPENING STATEMENT EDITOR */}
            <div style={{ marginBottom: '28px', borderBottom: '1px solid var(--line)', paddingBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)', display: 'block', marginBottom: '8px' }}>
                Opening Statement (Dear Customer…)
              </label>
              <p style={{ fontSize: '11.5px', color: 'var(--ink-soft)', margin: '0 0 12px' }}>
                The introductory paragraph printed under "Dear Customer" at the top of the certificate body.
              </p>
              <textarea
                value={current.opening || ''}
                onChange={e => setCurrent({ ...current, opening: e.target.value })}
                placeholder="Congratulations on your purchase…"
                style={{ width: '100%', minHeight: '90px', padding: '10px', border: '1px dashed var(--line)', background: '#FFFFFF', fontSize: '12px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: '1.5', borderRadius: '8px' }}
              />
            </div>

            {/* TABLE / STRUCTURE TOGGLES */}
            <div style={{ marginBottom: '28px', borderBottom: '1px solid var(--line)', paddingBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)', display: 'block', marginBottom: '12px' }}>
                Document Tables
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '14px', background: '#FFFFFF', border: '1px solid #E5E1D8', borderRadius: '8px', padding: '12px 14px' }}>
                <input
                  type="checkbox"
                  checked={current.showSeriesTable || false}
                  onChange={e => setCurrent({ ...current, showSeriesTable: e.target.checked })}
                  style={{ marginTop: '2px' }}
                />
                <span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', display: 'block' }}>Show "Warranty Period by Series" table</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Renders the series/model → coverage-period table you configure below.</span>
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', background: '#FFFFFF', border: '1px solid #E5E1D8', borderRadius: '8px', padding: '12px 14px' }}>
                <input
                  type="checkbox"
                  checked={current.heatoutTable || false}
                  onChange={e => setCurrent({ ...current, heatoutTable: e.target.checked })}
                  style={{ marginTop: '2px' }}
                />
                <span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', display: 'block' }}>Show graduated "Liability Table"</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Renders the years-of-use → % of warrantor liability schedule (Heatout style).</span>
                </span>
              </label>
            </div>

            {/* DYNAMIC SECTIONS EDITOR */}
            <div style={{ marginBottom: '28px', borderBottom: '1px solid var(--line)', paddingBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                  Warranty Clauses & Sections
                </label>
                <button 
                  onClick={() => setCurrent({...current, sections: [...(current.sections || []), { title: 'New Section', content: '', isBullets: false }]})}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                >
                  <Plus size={14} /> Add Section
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {(current.sections || []).map((sec, idx) => (
                  <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E5E1D8', borderRadius: '8px', padding: '16px', position: 'relative' }}>
                    
                    <button 
                      onClick={() => {
                        const newSecs = [...current.sections];
                        newSecs.splice(idx, 1);
                        setCurrent({...current, sections: newSecs});
                      }}
                      style={{ position: 'absolute', top: '16px', right: '16px', color: 'var(--red)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                      title="Remove Section"
                    >
                      <Trash2 size={16} />
                    </button>

                    <input 
                      value={sec.title} 
                      onChange={e => {
                        const newSecs = [...current.sections];
                        newSecs[idx].title = e.target.value;
                        setCurrent({...current, sections: newSecs});
                      }}
                      style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', border: 'none', background: 'transparent', width: 'calc(100% - 30px)', padding: '4px 0', borderBottom: '1px dashed var(--line)', outline: 'none', marginBottom: '12px' }}
                      placeholder="Section Title (e.g. 1. Product Information)"
                    />
                    
                    <textarea 
                      value={sec.content} 
                      onChange={e => {
                        const newSecs = [...current.sections];
                        newSecs[idx].content = e.target.value;
                        setCurrent({...current, sections: newSecs});
                      }}
                      placeholder="Enter section content here..."
                      style={{ width: '100%', minHeight: '100px', padding: '8px', border: '1px dashed var(--line)', background: 'transparent', fontSize: '12px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: '1.5' }}
                    />

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12px', color: 'var(--ink-soft)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={sec.isBullets || false} 
                        onChange={e => {
                          const newSecs = [...current.sections];
                          newSecs[idx].isBullets = e.target.checked;
                          setCurrent({...current, sections: newSecs});
                        }}
                      />
                      Render as Bullet Points
                    </label>
                  </div>
                ))}
                
                {(current.sections || []).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '13px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                    No sections defined. Click 'Add Section' to add content to your warranty.
                  </div>
                )}
              </div>
            </div>

            {/* SERIES COVERAGE SCHEDULE TABLE */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                  7. Series Coverage & Duration Schedule
                </label>
                <button 
                  onClick={addSeriesRow}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}
                >
                  <Plus size={12} /> Add Row
                </button>
              </div>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E5E1D8' }}>
                <thead>
                  <tr style={{ background: '#F4EFE6' }}>
                    <th style={{ border: '1px solid #E5E1D8', padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800 }}>Series / Profile Model</th>
                    <th style={{ border: '1px solid #E5E1D8', padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 800, width: '180px' }}>Coverage Period</th>
                    <th style={{ border: '1px solid #E5E1D8', padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 800, width: '60px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(current.seriesTable || []).map((row, idx) => (
                    <tr key={idx} style={{ background: '#FFFFFF' }}>
                      <td style={{ border: '1px solid #E5E1D8', padding: '4px 8px' }}>
                        <input 
                          value={row.series} 
                          onChange={e => updateSeriesRow(idx, 'series', e.target.value)}
                          style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px', fontSize: '11.5px', fontWeight: 600, outline: 'none' }}
                        />
                      </td>
                      <td style={{ border: '1px solid #E5E1D8', padding: '4px 8px', textAlign: 'center' }}>
                        <input 
                          value={row.duration} 
                          onChange={e => updateSeriesRow(idx, 'duration', e.target.value)}
                          style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px', fontSize: '11.5px', fontWeight: 700, color: '#C2410C', textAlign: 'center', outline: 'none' }}
                        />
                      </td>
                      <td style={{ border: '1px solid #E5E1D8', padding: '4px 8px', textAlign: 'center' }}>
                        <button 
                          onClick={() => removeSeriesRow(idx)}
                          style={{ color: 'var(--red)', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(current.seriesTable || []).length === 0 && (
                    <tr>
                      <td colSpan="3" style={{ border: '1px solid #E5E1D8', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        No series configured. Click 'Add Row' to configure series-specific warranty durations.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* AUTHORIZED SIGNATORY & SEAL UPLOAD FOOTER */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: 'auto', paddingTop: '32px', borderTop: '2px solid #C2410C' }}>
              
              {/* Authorized Partner Signature */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                  Authorized Signatory (Pre-printed Base64)
                </span>
                <label style={{ 
                  height: '80px', border: '1.5px dashed var(--line)', borderRadius: 'var(--radius)', 
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: current.signImage ? `url(${current.signImage}) center/contain no-repeat #FFFFFF` : '#FFFFFF',
                  cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                }} className="hover-lift">
                  {!current.signImage && (
                    <>
                      <FileSignature size={20} color="var(--ink-soft)" style={{ marginBottom: '4px' }}/>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-mid)' }}>Upload Partner Signature</div>
                    </>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, (base64) => setCurrent({...current, signImage: base64}))} />
                </label>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', borderTop: '1px solid var(--ink)', paddingTop: '6px' }}>
                  {companyName} Authorized representative
                </div>
              </div>

              {/* Official Partner Seal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                  Official Partner Stamp / Seal (Base64)
                </span>
                <label style={{ 
                  width: '100px', height: '100px', border: '1.5px dashed var(--line)', borderRadius: '50%', 
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: current.sealImage ? `url(${current.sealImage}) center/contain no-repeat #FFFFFF` : '#FFFFFF',
                  cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                }} className="hover-lift">
                  {!current.sealImage && (
                    <>
                      <Stamp size={20} color="var(--ink-soft)" style={{ marginBottom: '4px' }}/>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ink-mid)' }}>Upload Stamp</div>
                    </>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, (base64) => setCurrent({...current, sealImage: base64}))} />
                </label>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
