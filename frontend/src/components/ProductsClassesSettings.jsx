import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { mediaUrl, uploadImage } from '../api';
import { Plus, Image as ImageIcon, Trash2, FolderTree, Package, Palette, FileText, CheckCircle2, Loader } from 'lucide-react';

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

export default function ProductsClassesSettings() {
  const { data, setData, showToast, persistConfig } = useAppContext();
  
  // State to track what is currently selected in the tree: { type: 'class'|'variety'|'color', id: string, parentId?: string }
  const [selectedNode, setSelectedNode] = useState(null);
  
  // Local edit states to prevent immediate saving on every keystroke
  const [editClass, setEditClass] = useState(null);
  const [editVariety, setEditVariety] = useState(null);
  const [editColor, setEditColor] = useState(null);

  // Auto-save state and refs
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'pending' | 'saved'
  const autoSaveTimer = useRef(null);
  const skipAutoSave = useRef(false); // true when state was set by tree selection, not by user

  // "Latest ref" pattern — updated on every render so timer callbacks always
  // see the current data/editX/selectedNode, never a stale closure.
  const doSaveClassRef   = useRef(null);
  const doSaveVarietyRef = useRef(null);
  const doSaveColorRef   = useRef(null);

  // --- Helpers ---
  const imagePreview = (url, fit = 'cover') => (
    url ? `url("${mediaUrl(url).replace(/"/g, '\\"')}") center/${fit} no-repeat` : undefined
  );

  const handleImageUpload = async (e, callback) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast("Uploading image...");
      const uploaded = await uploadImage(file);
      callback(uploaded.url);
    } catch {
      showToast("Image upload failed. Start the backend and try again.", "error");
    } finally {
      e.target.value = '';
    }
  };

  // --- Tree Selection Handlers ---
  const selectClass = (cls) => {
    skipAutoSave.current = true;
    clearTimeout(autoSaveTimer.current);
    setSaveStatus('idle');
    setSelectedNode({ type: 'class', id: cls.id });
    setEditClass({ ...cls });
  };

  const selectVariety = (variety) => {
    skipAutoSave.current = true;
    clearTimeout(autoSaveTimer.current);
    setSaveStatus('idle');
    setSelectedNode({ type: 'variety', id: variety.id, parentId: variety.classId });
    setEditVariety({ ...variety });
  };

  const selectColor = (color, varietyId) => {
    skipAutoSave.current = true;
    clearTimeout(autoSaveTimer.current);
    setSaveStatus('idle');
    setSelectedNode({ type: 'color', id: color.name, parentId: varietyId });
    setEditColor({ ...color, offset: color.offset ?? color.priceOffset ?? 0 });
  };

  // --- Save Helpers ---
  const markSaved = () => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2200);
  };

  // --- Save Handlers (silent = auto-save, no toast) ---
  const doSaveClass = (silent = false) => {
    if (!editClass?.name) { if (!silent) showToast("Class name required"); return; }
    const isNew = !data.classes.find(c => c.id === editClass.id);
    let newClasses = [...data.classes];
    if (isNew) newClasses.push(editClass);
    else newClasses = newClasses.map(c => c.id === editClass.id ? editClass : c);
    const nextData = { ...data, classes: newClasses };
    setData(nextData);
    persistConfig(nextData);
    if (!silent) showToast("Class saved");
    markSaved();
  };

  const doSaveVariety = (silent = false) => {
    if (!editVariety?.name) { if (!silent) showToast("Variety name required"); return; }
    const isNew = !data.varieties.find(v => v.id === editVariety.id);
    let newVars = [...data.varieties];
    if (isNew) newVars.push(editVariety);
    else newVars = newVars.map(v => v.id === editVariety.id ? editVariety : v);
    const nextData = { ...data, varieties: newVars };
    setData(nextData);
    persistConfig(nextData);
    if (!silent) showToast("Variety saved");
    markSaved();
  };

  const doSaveColor = (silent = false) => {
    if (!editColor?.name) { if (!silent) showToast("Color/Type name required"); return; }
    const restColor = { ...editColor };
    delete restColor.priceOffset;
    const normalizedColor = { ...restColor, offset: parseFloat(restColor.offset) || 0 };
    const newVars = data.varieties.map(v => {
      if (v.id === selectedNode.parentId) {
        let updatedColors = v.colors ? [...v.colors] : [];
        const exists = updatedColors.findIndex(c => c.name === selectedNode.id);
        if (exists >= 0) updatedColors[exists] = normalizedColor;
        else updatedColors.push(normalizedColor);
        return { ...v, colors: updatedColors };
      }
      return v;
    });
    const nextData = { ...data, varieties: newVars };
    setData(nextData);
    persistConfig(nextData);
    if (!silent) showToast("Color/Type saved");
    markSaved();
    setSelectedNode(prev => ({ ...prev, id: normalizedColor.name }));
  };

  // Manual save buttons call these (immediate, with toast)
  const saveClass   = () => { clearTimeout(autoSaveTimer.current); doSaveClass(false); };
  const saveVariety = () => { clearTimeout(autoSaveTimer.current); doSaveVariety(false); };
  const saveColor   = () => { clearTimeout(autoSaveTimer.current); doSaveColor(false); };

  // Keep refs pointing to latest functions — runs synchronously on every render
  // before any timer callback fires, so the callback always gets fresh data.
  doSaveClassRef.current   = doSaveClass;
  doSaveVarietyRef.current = doSaveVariety;
  doSaveColorRef.current   = doSaveColor;

  // --- Auto-save effects (debounced 800ms after any field change) ---
  useEffect(() => {
    if (!editClass) return;
    if (skipAutoSave.current) { skipAutoSave.current = false; return; }
    setSaveStatus('pending');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSaveClassRef.current(true), 800);
  }, [editClass]);

  useEffect(() => {
    if (!editVariety) return;
    if (skipAutoSave.current) { skipAutoSave.current = false; return; }
    setSaveStatus('pending');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSaveVarietyRef.current(true), 800);
  }, [editVariety]);

  useEffect(() => {
    if (!editColor) return;
    if (skipAutoSave.current) { skipAutoSave.current = false; return; }
    setSaveStatus('pending');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSaveColorRef.current(true), 800);
  }, [editColor]);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  // --- Ctrl+V paste image ---
  useEffect(() => {
    const handlePaste = async (e) => {
      if (!selectedNode) return;
      // Don't intercept when user is pasting text into an input/textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const imageItem = Array.from(e.clipboardData?.items || [])
        .find(item => item.type.startsWith('image/'));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();

      try {
        showToast('Uploading pasted image...');
        const uploaded = await uploadImage(file);
        if (selectedNode.type === 'class')
          setEditClass(prev => ({ ...prev, logo: uploaded.url }));
        else if (selectedNode.type === 'variety')
          setEditVariety(prev => ({ ...prev, image: uploaded.url }));
        else if (selectedNode.type === 'color')
          setEditColor(prev => ({ ...prev, image: uploaded.url }));
      } catch {
        showToast('Paste image upload failed', 'error');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selectedNode]);

  // --- Delete Handlers ---
  const deleteClass = (id) => {
    if(!confirm("Delete this class and ALL its varieties?")) return;
    const nextData = {
      ...data,
      classes: data.classes.filter(c => c.id !== id),
      varieties: data.varieties.filter(v => v.classId !== id)
    };
    setData(nextData);
    persistConfig(nextData);
    setSelectedNode(null);
  };

  const deleteVariety = (id) => {
    if(!confirm("Delete this variety?")) return;
    const nextData = {
      ...data,
      varieties: data.varieties.filter(v => v.id !== id)
    };
    setData(nextData);
    persistConfig(nextData);
    setSelectedNode(null);
  };

  const deleteColor = (colorName, varietyId) => {
    const newVars = data.varieties.map(v => {
      if (v.id === varietyId) {
        return { ...v, colors: (v.colors || []).filter(c => c.name !== colorName) };
      }
      return v;
    });
    const nextData = { ...data, varieties: newVars };
    setData(nextData);
    persistConfig(nextData);
    setSelectedNode(null);
  };

  // --- Add New Handlers ---
  const handleAddClass = () => {
    const newId = generateId('cls');
    const newClass = { id: newId, name: 'New Class', type: 'tiles', color: '#E2E8F0', logo: null, warrantyId: null };
    selectClass(newClass);
  };

  const handleAddVariety = (classId) => {
    const newId = generateId('var');
    const newVar = { id: newId, classId, name: 'New Variety', description: '', unit: 'sqft', basePrice: 0, image: null, colors: [] };
    selectVariety(newVar);
  };

  const handleAddColor = (varietyId) => {
    const newColor = { name: 'New Color', hex: '#E2E8F0', image: null, offset: 0 };
    selectColor(newColor, varietyId);
  };

  return (
    <div className="animate-fade-up" style={{ display: 'flex', height: 'calc(100vh - 200px)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
      
      {/* Left Pane: Tree View */}
      <div style={{ width: '320px', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-warm)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>Catalog Hierarchy</div>
          <button onClick={handleAddClass} style={{ background: 'var(--ink)', color: 'var(--surface)', border: 'none', width: '28px', height: '28px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={16}/>
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {data.classes.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px' }}>No classes. Add one to begin.</div>}
          
          {data.classes.map(cls => (
            <div key={cls.id}>
              {/* Class Node */}
              <div 
                onClick={() => selectClass(cls)}
                style={{ 
                  padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                  background: selectedNode?.id === cls.id ? 'var(--accent-soft)' : 'transparent',
                  borderLeft: selectedNode?.id === cls.id ? '3px solid var(--accent)' : '3px solid transparent'
                }}
              >
                <FolderTree size={16} color={selectedNode?.id === cls.id ? 'var(--accent)' : 'var(--ink-soft)'}/>
                <span style={{ fontSize: '14px', fontWeight: 600, color: selectedNode?.id === cls.id ? 'var(--accent)' : 'var(--ink)' }}>{cls.name}</span>
                <button onClick={(e) => { e.stopPropagation(); handleAddVariety(cls.id); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }} title="Add Variety">
                  <Plus size={14}/>
                </button>
              </div>

              {/* Varieties under Class */}
              {data.varieties.filter(v => v.classId === cls.id).map(v => (
                <div key={v.id}>
                  {/* Variety Node */}
                  <div 
                    onClick={() => selectVariety(v)}
                    style={{ 
                      padding: '8px 20px 8px 44px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                      background: selectedNode?.id === v.id ? 'var(--accent-soft)' : 'transparent',
                      borderLeft: selectedNode?.id === v.id ? '3px solid var(--accent)' : '3px solid transparent'
                    }}
                  >
                    <Package size={14} color={selectedNode?.id === v.id ? 'var(--accent)' : 'var(--ink-soft)'}/>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: selectedNode?.id === v.id ? 'var(--accent)' : 'var(--ink-mid)' }}>{v.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleAddColor(v.id); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }} title="Add Color/Type">
                      <Plus size={14}/>
                    </button>
                  </div>

                  {/* Colors under Variety */}
                  {v.colors && v.colors.map(c => (
                    <div 
                      key={c.name}
                      onClick={() => selectColor(c, v.id)}
                      style={{ 
                        padding: '6px 20px 6px 68px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                        background: selectedNode?.id === c.name && selectedNode?.parentId === v.id ? 'var(--accent-soft)' : 'transparent',
                        borderLeft: selectedNode?.id === c.name && selectedNode?.parentId === v.id ? '3px solid var(--accent)' : '3px solid transparent'
                      }}
                    >
                      <Palette size={12} color={selectedNode?.id === c.name && selectedNode?.parentId === v.id ? 'var(--accent)' : 'var(--ink-soft)'}/>
                      <span style={{ fontSize: '13px', color: selectedNode?.id === c.name && selectedNode?.parentId === v.id ? 'var(--accent)' : 'var(--ink-soft)' }}>{c.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane: Inspector */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
        {!selectedNode ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}>
            <FolderTree size={48} style={{ opacity: 0.2, marginBottom: '16px' }}/>
            <div style={{ fontSize: '16px', fontWeight: 500 }}>Select an item to edit</div>
            <div style={{ fontSize: '13px', marginTop: '8px' }}>Manage classes, varieties, pricing, and images.</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            
            {/* Editor for CLASS */}
            {selectedNode.type === 'class' && editClass && (
              <div className="animate-fade-up" style={{ padding: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--accent)', marginBottom: '8px' }}>Editing Class</div>
                    <h2 style={{ fontSize: '28px', fontWeight: 600, color: 'var(--ink)' }}>{editClass.name || 'Unnamed Class'}</h2>
                  </div>
                  <button onClick={() => deleteClass(editClass.id)} style={{ padding: '8px 16px', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, background: 'transparent', cursor: 'pointer' }}>
                    <Trash2 size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}/> Delete Class
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '600px' }}>
                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Class Logo / Category Image</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '18px', border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--bg-warm)' }}>
                      <label
                        className="hover-lift"
                        style={{
                          width: '118px',
                          height: '118px',
                          border: '2px dashed var(--line)',
                          borderRadius: 'var(--radius-sm)',
                          background: editClass.logo ? imagePreview(editClass.logo, 'contain') : editClass.color || 'var(--surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          overflow: 'hidden'
                        }}
                      >
                        {!editClass.logo && <ImageIcon size={30} color="rgba(255,255,255,0.8)" />}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, (url) => setEditClass({...editClass, logo: url}))} />
                      </label>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>Upload category image for this class</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>This image appears on the Quotation Desk category card. If no image is uploaded, the class colour is used.</div>
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <kbd style={{ padding: '1px 5px', background: 'var(--bg-warm)', border: '1px solid var(--line)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>Ctrl+V</kbd> to paste image from clipboard
                        </div>
                        {editClass.logo && (
                          <button
                            type="button"
                            onClick={() => setEditClass({...editClass, logo: null})}
                            style={{ marginTop: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--red)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                          >
                            Remove Logo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Class Name</label>
                    <input value={editClass.name} onChange={e => setEditClass({...editClass, name: e.target.value})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px' }} />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Catalog Type</label>
                    <select value={editClass.type === 'regular' ? 'tiles' : (editClass.type || 'tiles')} onChange={e => setEditClass({...editClass, type: e.target.value})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px', background: 'var(--surface)' }}>
                      <option value="tiles">Standard Product (Tiles, Ceilings, etc)</option>
                      <option value="tools">Tools & Hardware</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Identify Color</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <input type="color" value={editClass.color || '#E2E8F0'} onChange={e => setEditClass({...editClass, color: e.target.value})} style={{ width: '48px', height: '48px', padding: 0, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} />
                      <input type="text" value={editClass.color || '#E2E8F0'} onChange={e => setEditClass({...editClass, color: e.target.value})} style={{ flex: 1, padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px' }} />
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', padding: '24px', background: 'var(--bg-warm)', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} color="var(--accent)"/> Link Warranty Template
                    </label>
                    <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '8px' }}>Automatically assign a specific warranty document whenever items from this class are purchased.</p>
                    <select value={editClass.warrantyId || ''} onChange={e => setEditClass({...editClass, warrantyId: e.target.value})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px', background: 'var(--surface)' }}>
                      <option value="">-- No Warranty --</option>
                      {data.warranties?.map(w => (
                        <option key={w.id} value={w.id}>{w.title} ({w.duration})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button onClick={saveClass} className="btn-primary" style={{ padding: '16px 32px', fontSize: '15px' }}>Save Class</button>
                  {saveStatus === 'pending' && <span style={{ fontSize: '13px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '6px' }}><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</span>}
                  {saveStatus === 'saved' && <span style={{ fontSize: '13px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} /> Auto-saved</span>}
                </div>
              </div>
            )}

            {/* Editor for VARIETY */}
            {selectedNode.type === 'variety' && editVariety && (
              <div className="animate-fade-up" style={{ padding: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--accent)', marginBottom: '8px' }}>Editing Variety</div>
                    <h2 style={{ fontSize: '28px', fontWeight: 600, color: 'var(--ink)' }}>{editVariety.name || 'Unnamed Variety'}</h2>
                  </div>
                  <button onClick={() => deleteVariety(editVariety.id)} style={{ padding: '8px 16px', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, background: 'transparent', cursor: 'pointer' }}>
                    <Trash2 size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}/> Delete Variety
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '800px' }}>
                  {data.classes.find(c => c.id === editVariety.classId)?.type === 'tools' && (
                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Display Image</label>
                      <label style={{
                        width: '240px', height: '240px',
                        border: '2px dashed var(--line)', borderRadius: 'var(--radius-lg)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: editVariety.image ? imagePreview(editVariety.image, 'cover') : 'var(--bg-warm)',
                        cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                        flexShrink: 0,
                      }} className="hover-lift">
                        {!editVariety.image && (
                          <>
                            <ImageIcon size={40} color="var(--ink-soft)" style={{ marginBottom: '16px' }}/>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>Click to upload image</div>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>PNG, JPG up to 5MB</div>
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <kbd style={{ padding: '1px 5px', background: 'var(--bg-warm)', border: '1px solid var(--line)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>Ctrl+V</kbd> to paste
                            </div>
                          </>
                        )}
                        {editVariety.image && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                            <span style={{ color: 'white', fontWeight: 600 }}>Change Image</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, (url) => setEditVariety({...editVariety, image: url}))} />
                      </label>
                    </div>
                  )}                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Variety Name</label>
                    <input value={editVariety.name} onChange={e => setEditVariety({...editVariety, name: e.target.value})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px' }} />
                  </div>
                  
                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Description</label>
                    <textarea value={editVariety.description || ''} onChange={e => setEditVariety({...editVariety, description: e.target.value})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', minHeight: '80px', fontSize: '15px' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Base Price (₹)</label>
                    <input type="number" value={editVariety.basePrice} onChange={e => setEditVariety({...editVariety, basePrice: parseFloat(e.target.value)})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Unit of Measurement</label>
                    <input list="units" value={editVariety.unit} onChange={e => setEditVariety({...editVariety, unit: e.target.value})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px' }} />
                    <datalist id="units">
                      <option value="sqft"/>
                      <option value="ft"/>
                      <option value="piece"/>
                      <option value="nos"/>
                      <option value="box"/>
                    </datalist>
                  </div>
                </div>

                <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button onClick={saveVariety} className="btn-primary" style={{ padding: '16px 32px', fontSize: '15px' }}>Save Variety</button>
                  {saveStatus === 'pending' && <span style={{ fontSize: '13px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '6px' }}><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</span>}
                  {saveStatus === 'saved' && <span style={{ fontSize: '13px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} /> Auto-saved</span>}
                </div>
              </div>
            )}

            {/* Editor for COLOR */}
            {selectedNode.type === 'color' && editColor && (
              <div className="animate-fade-up" style={{ padding: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--accent)', marginBottom: '8px' }}>Editing Color / Type</div>
                    <h2 style={{ fontSize: '28px', fontWeight: 600, color: 'var(--ink)' }}>{editColor.name || 'Unnamed Color'}</h2>
                  </div>
                  <button onClick={() => deleteColor(selectedNode.id, selectedNode.parentId)} style={{ padding: '8px 16px', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, background: 'transparent', cursor: 'pointer' }}>
                    <Trash2 size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}/> Delete Color
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '600px' }}>
                  
                  {/* Swatch Image Upload */}
                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Swatch Image (Optional)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      <label style={{ 
                        width: '120px', height: '120px', border: '2px dashed var(--line)', borderRadius: 'var(--radius)', 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: editColor.image ? imagePreview(editColor.image, 'cover') : editColor.hex || 'var(--bg-warm)',
                        cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                      }} className="hover-lift">
                        {!editColor.image && <ImageIcon size={24} color="rgba(0,0,0,0.3)"/>}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, (url) => setEditColor({...editColor, image: url}))} />
                      </label>
                      <div style={{ fontSize: '13px', color: 'var(--ink-soft)', flex: 1 }}>
                        Upload a specific image for this color/type. If no image is provided, the hex color below will be used as a swatch fallback.
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <kbd style={{ padding: '1px 5px', background: 'var(--bg-warm)', border: '1px solid var(--line)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>Ctrl+V</kbd>
                          <span style={{ fontSize: '12px' }}>to paste image from clipboard</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Color / Type Name</label>
                    <input value={editColor.name} onChange={e => setEditColor({...editColor, name: e.target.value})} style={{ padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Fallback Hex Color</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <input type="color" value={editColor.hex || '#000000'} onChange={e => setEditColor({...editColor, hex: e.target.value})} style={{ width: '48px', height: '48px', padding: 0, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} />
                      <input type="text" value={editColor.hex || '#000000'} onChange={e => setEditColor({...editColor, hex: e.target.value})} style={{ flex: 1, padding: '14px 16px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>Price Offset (₹)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '16px', top: '14px', fontSize: '15px', color: 'var(--ink-mid)' }}>±</span>
                      <input type="number" value={editColor.offset ?? 0} onChange={e => setEditColor({...editColor, offset: parseFloat(e.target.value) || 0})} style={{ padding: '14px 16px 14px 32px', border: '2px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '15px', width: '100%' }} />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Amount added or subtracted from base price.</div>
                  </div>

                </div>

                <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button onClick={saveColor} className="btn-primary" style={{ padding: '16px 32px', fontSize: '15px' }}>Save Color</button>
                  {saveStatus === 'pending' && <span style={{ fontSize: '13px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '6px' }}><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</span>}
                  {saveStatus === 'saved' && <span style={{ fontSize: '13px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} /> Auto-saved</span>}
                </div>
              </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
}
