import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { mediaUrl, uploadImage } from '../api';
import {
  Plus, Image as ImageIcon, Trash2, Package, Palette, FileText, CheckCircle2, Loader,
  Award, Wrench, X, ChevronLeft, ChevronRight, Copy, GripVertical, Pencil,
} from 'lucide-react';
import './ProductsCatalog.css';

const newId = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const move = (arr, from, to) => { const a = [...arr]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; };
const cssUrl = (url) => `url("${mediaUrl(url).replace(/"/g, '\\"')}") center/cover no-repeat`;

export default function ProductsClassesSettings() {
  const { data, setData, showToast, persistConfig } = useAppContext();

  const [view, setView] = useState('list');             // 'list' | 'class'
  const [activeClassId, setActiveClassId] = useState(null);
  const [editClassId, setEditClassId] = useState(null); // class-edit modal
  const [editVarId, setEditVarId] = useState(null);     // variety editor modal
  const [editTypeIdx, setEditTypeIdx] = useState(null); // open type inside the variety modal
  const [saveStatus, setSaveStatus] = useState('idle');
  const [dragOver, setDragOver] = useState(null);
  const dragRef = useRef(null);
  const saveTimer = useRef(null);

  // ── One simple save path ──────────────────────────────────────────────────
  const commit = (next) => {
    setData(next); setSaveStatus('pending');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { persistConfig(next); setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 1500); }, 600);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const imagePreview = (url, fit = 'cover') => (url ? `url("${mediaUrl(url).replace(/"/g, '\\"')}") center/${fit} no-repeat` : undefined);
  const upload = async (e, cb) => {
    const file = e.target.files[0]; if (!file) return;
    try { showToast('Uploading image…'); const up = await uploadImage(file); cb(up.url); }
    catch { showToast('Image upload failed. Start the backend and try again.', 'error'); }
    finally { e.target.value = ''; }
  };

  // ── Edit helpers ──────────────────────────────────────────────────────────
  const updateClass = (id, patch) => commit({ ...data, classes: data.classes.map(c => c.id === id ? { ...c, ...patch } : c) });
  const updateVariety = (id, patch) => commit({ ...data, varieties: data.varieties.map(v => v.id === id ? { ...v, ...patch } : v) });
  const updateType = (vid, idx, patch) => commit({ ...data, varieties: data.varieties.map(v => v.id === vid ? { ...v, colors: (v.colors || []).map((c, i) => i === idx ? { ...c, ...patch } : c) } : v) });
  const setColors = (vid, fn) => commit({ ...data, varieties: data.varieties.map(v => v.id === vid ? { ...v, colors: fn(v.colors || []) } : v) });

  // ── Add ─────────────────────────────────────────────────────────────────
  const addClass = (brandId, type = 'tiles') => {
    const cls = { id: newId('cls'), name: type === 'tools' ? 'New Accessory Class' : 'New Class', type, color: '#E2E8F0', logo: null, warrantyId: null, brandId: type === 'tools' ? null : brandId };
    commit({ ...data, classes: [...data.classes, cls] });
    setEditClassId(cls.id);
  };
  const addVariety = () => {
    const v = { id: newId('var'), classId: activeClassId, name: 'New Variety', description: '', unit: 'sqft', basePrice: 0, image: null, colors: [] };
    commit({ ...data, varieties: [...data.varieties, v] });
    setEditVarId(v.id); setEditTypeIdx(null);
  };
  const addType = (vid) => {
    const v = data.varieties.find(x => x.id === vid);
    const idx = (v?.colors || []).length;
    setColors(vid, (cols) => [...cols, { name: 'New Type', hex: '#E2E8F0', image: null, offset: 0 }]);
    setEditTypeIdx(idx);
  };

  // ── Duplicate ───────────────────────────────────────────────────────────
  const duplicateClass = (cls) => {
    const nc = { ...cls, id: newId('cls'), name: `${cls.name} Copy` };
    const nv = data.varieties.filter(v => v.classId === cls.id).map(v => ({ ...v, id: newId('var'), classId: nc.id, colors: (v.colors || []).map(c => ({ ...c })) }));
    commit({ ...data, classes: [...data.classes, nc], varieties: [...data.varieties, ...nv] });
    showToast('Class duplicated');
  };
  const duplicateVariety = (v) => { commit({ ...data, varieties: [...data.varieties, { ...v, id: newId('var'), name: `${v.name} Copy`, colors: (v.colors || []).map(c => ({ ...c })) }] }); showToast('Variety duplicated'); };
  const duplicateType = (vid, c) => setColors(vid, (cols) => [...cols, { ...c, name: `${c.name} Copy` }]);

  // ── Delete ──────────────────────────────────────────────────────────────
  const deleteClass = (id) => {
    if (!confirm('Delete this class and ALL its varieties?')) return;
    commit({ ...data, classes: data.classes.filter(c => c.id !== id), varieties: data.varieties.filter(v => v.classId !== id) });
    setEditClassId(null);
    if (activeClassId === id) { setView('list'); setActiveClassId(null); }
  };
  const deleteVariety = (id) => {
    if (!confirm('Delete this variety?')) return;
    commit({ ...data, varieties: data.varieties.filter(v => v.id !== id) });
    if (editVarId === id) setEditVarId(null);
  };
  const deleteType = (vid, idx) => { if (!confirm('Delete this type / colour?')) return; setColors(vid, (cols) => cols.filter((_, i) => i !== idx)); setEditTypeIdx(null); };

  // ── Drag reorder ──────────────────────────────────────────────────────────
  const onDrop = (kind, key) => {
    const src = dragRef.current; dragRef.current = null; setDragOver(null);
    if (!src || src.kind !== kind || src.key === key) return;
    if (kind === 'class') { const f = data.classes.findIndex(c => c.id === src.key), t = data.classes.findIndex(c => c.id === key); if (f >= 0 && t >= 0) commit({ ...data, classes: move(data.classes, f, t) }); }
    else if (kind === 'variety') { const f = data.varieties.findIndex(v => v.id === src.key), t = data.varieties.findIndex(v => v.id === key); if (f >= 0 && t >= 0) commit({ ...data, varieties: move(data.varieties, f, t) }); }
    else if (kind === 'type') setColors(src.vid, (cols) => move(cols, src.key, key));
  };
  const drag = (kind, key, vid) => ({
    draggable: true,
    onDragStart: (e) => { e.stopPropagation(); dragRef.current = { kind, key, vid }; },
    onDragOver: (e) => { e.preventDefault(); const k = `${kind}:${key}`; if (dragOver !== k) setDragOver(k); },
    onDragLeave: () => setDragOver(o => (o === `${kind}:${key}` ? null : o)),
    onDrop: (e) => { e.preventDefault(); onDrop(kind, key); },
  });

  // ── Ctrl+V paste into the open entity ─────────────────────────────────────
  useEffect(() => {
    const onPaste = async (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (!item) return; const file = item.getAsFile(); if (!file) return; e.preventDefault();
      try {
        showToast('Uploading pasted image…'); const up = await uploadImage(file);
        if (editVarId && editTypeIdx != null) updateType(editVarId, editTypeIdx, { image: up.url });
        else if (editClassId) updateClass(editClassId, { logo: up.url });
        else if (editVarId) {
          // Only tool varieties carry their own image; product images live on types.
          const v = data.varieties.find(x => x.id === editVarId);
          const tools = data.classes.find(c => c.id === v?.classId)?.type === 'tools';
          if (tools) updateVariety(editVarId, { image: up.url });
        }
      } catch { showToast('Paste image upload failed', 'error'); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editVarId, editTypeIdx, editClassId, data]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const sortedBrands = [...(data.brands || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const fallbackBrandId = sortedBrands[0]?.id;
  const brandOf = (cls) => (sortedBrands.some(b => b.id === cls.brandId) ? cls.brandId : fallbackBrandId);
  const productClassesOf = (bid) => data.classes.filter(c => c.type !== 'tools' && brandOf(c) === bid);
  const toolClasses = data.classes.filter(c => c.type === 'tools');
  const varietiesOf = (cid) => data.varieties.filter(v => v.classId === cid);
  const activeClass = data.classes.find(c => c.id === activeClassId);
  const activeBrand = activeClass && activeClass.type !== 'tools' ? sortedBrands.find(b => b.id === brandOf(activeClass)) : null;
  const modalClass = data.classes.find(c => c.id === editClassId);
  const editVar = data.varieties.find(v => v.id === editVarId);
  const editVarTools = activeClass?.type === 'tools';

  const statusEl = () => saveStatus === 'pending'
    ? <span className="pc-saving"><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</span>
    : saveStatus === 'saved' ? <span className="pc-saving ok"><CheckCircle2 size={13} /> Saved</span> : null;

  // The Quotation Desk card look (media + body), reused for grid cards + modal preview.
  const qd2Inner = (v, isTool, active) => {
    const colors = v.colors || [];
    const ac = active || colors[0] || null;
    const img = ac?.image || v.image;
    const price = Math.round((Number(v.basePrice) || 0) + (Number(ac?.offset) || 0));
    return (
      <>
        <div className={`qd2-card-media${isTool ? ' is-tool' : ''}`}>
          {img ? <img src={mediaUrl(img)} alt={v.name} crossOrigin="anonymous" />
            : <div className="qd2-card-fallback">{isTool ? <Wrench size={26} /> : <ImageIcon size={26} />}<span>{v.name || 'Product'}</span></div>}
          {!isTool && colors.length > 0 && <span className="qd2-color-badge">{ac?.name}</span>}
        </div>
        <div className="qd2-card-body">
          {!isTool && colors.length > 0 && (
            <div className="qd2-swatches">{colors.map((c, i) => <span key={i} className={`qd2-swatch${ac && ac.name === c.name ? ' is-selected' : ''}`} title={c.name} style={{ background: c.image ? cssUrl(c.image) : (c.hex || '#d6d3cc') }} />)}</div>
          )}
          <div className="qd2-card-title"><h3>{v.name || 'Variety'}</h3><p>{v.description || activeClass?.name || ''}</p></div>
          <div className="qd2-card-price">₹ {price}<span> / {v.unit}</span></div>
        </div>
      </>
    );
  };

  // ════════════════════════════ PAGE 2: VARIETY PAGE ════════════════════════
  if (view === 'class' && activeClass) {
    return (
      <div className="set-page wide pc">
        <div className="pc-vp-head">
          <button className="pc-back" onClick={() => { setView('list'); setEditVarId(null); }}><ChevronLeft size={16} /> Catalogue</button>
          <div className="pc-vp-crumb">{editVarTools ? 'Tools & Accessories' : activeBrand?.name} <ChevronRight size={14} /> <b>{activeClass.name}</b></div>
          <div className="pc-vp-spacer" /> {statusEl()}
          <button className="set-btn" onClick={addVariety}><Plus size={16} /> Add Variety</button>
        </div>

        <div className="pc-vgrid">
          {varietiesOf(activeClassId).map(v => (
            <article key={v.id} className={`qd2-card pc-vcard${dragOver === `variety:${v.id}` ? ' dragover' : ''}`} onClick={() => { setEditVarId(v.id); setEditTypeIdx(null); }} {...drag('variety', v.id)}>
              <div className="pc-vcard-overlay" onClick={e => e.stopPropagation()}>
                <button title="Duplicate" onClick={() => duplicateVariety(v)}><Copy size={14} /></button>
                <button className="danger" title="Delete" onClick={() => deleteVariety(v.id)}><Trash2 size={14} /></button>
              </div>
              {qd2Inner(v, editVarTools)}
            </article>
          ))}
          <div className="pc-newvar" onClick={addVariety}><Plus size={22} /> Add Variety</div>
        </div>

        {/* ── Variety editor modal ── */}
        {editVar && (
          <div className="pc-backdrop" onClick={() => setEditVarId(null)}>
            <div className="pc-modal pc-vmodal" onClick={e => e.stopPropagation()}>
              <div className="pc-modal-head">
                <Package size={16} color="var(--accent)" /><h3>Edit Variety</h3>
                <button className="set-icon-btn" onClick={() => setEditVarId(null)}><X size={18} /></button>
              </div>
              <div className="pc-modal-body">
                <div className="pc-vmodal-grid">
                  <div>
                    <div className="set-grid">
                      <div className="set-field span2"><span className="set-label">Variety Name</span>
                        <input className="set-input" value={editVar.name} onChange={e => updateVariety(editVar.id, { name: e.target.value })} /></div>
                      <div className="set-field"><span className="set-label">Base Price (₹)</span>
                        <input className="set-input" type="number" value={editVar.basePrice} onChange={e => updateVariety(editVar.id, { basePrice: parseFloat(e.target.value) || 0 })} /></div>
                      <div className="set-field"><span className="set-label">Unit</span>
                        <input className="set-input" list="pc-units" value={editVar.unit} onChange={e => updateVariety(editVar.id, { unit: e.target.value })} />
                        <datalist id="pc-units"><option value="sqft" /><option value="ft" /><option value="piece" /><option value="nos" /><option value="box" /></datalist></div>
                      <div className="set-field span2"><span className="set-label">Description</span>
                        <textarea className="set-textarea" value={editVar.description || ''} onChange={e => updateVariety(editVar.id, { description: e.target.value })} /></div>
                      {editVarTools && (
                        <div className="set-field span2"><span className="set-label">Display Image</span>
                          <label className="set-img" style={{ width: 130, height: 110, background: editVar.image ? imagePreview(editVar.image) : 'var(--bg-warm)' }}>
                            {!editVar.image && <><ImageIcon size={22} /><span>Click or Ctrl+V</span></>}
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => upload(e, url => updateVariety(editVar.id, { image: url }))} />
                          </label></div>
                      )}
                    </div>

                    {!editVarTools && (
                      <>
                        <div className="pc-types-head"><Palette size={13} /> Types / Colours · {(editVar.colors || []).length}</div>
                        <div className="set-hint" style={{ marginTop: -4, marginBottom: 10 }}>Each type carries its own image — that's the picture shown on the product card.</div>
                        <div className="pc-types">
                          {(editVar.colors || []).map((c, idx) => (
                            <div key={idx} className={`pc-type${editTypeIdx === idx ? ' is-open' : ''}${dragOver === `type:${idx}` ? ' dragover' : ''}`} onClick={() => setEditTypeIdx(idx)} {...drag('type', idx, editVar.id)}>
                              <span className="pc-type-dot" style={{ background: c.image ? imagePreview(c.image) : (c.hex || '#ccc') }} />
                              <span className="pc-type-name">{c.name}</span>
                              {!!c.offset && <span className="pc-type-off">{c.offset > 0 ? '+' : ''}{c.offset}</span>}
                            </div>
                          ))}
                          <button className="pc-add-class" style={{ padding: '7px 12px' }} onClick={() => addType(editVar.id)}><Plus size={15} /> Add type</button>
                        </div>

                        {editTypeIdx != null && (editVar.colors || [])[editTypeIdx] && (() => {
                          const t = editVar.colors[editTypeIdx];
                          return (
                            <div className="pc-type-editor">
                              <div className="set-grid">
                                <div className="set-field span2"><span className="set-label">Type / Colour Name</span>
                                  <input className="set-input" value={t.name} onChange={e => updateType(editVar.id, editTypeIdx, { name: e.target.value })} /></div>
                                <div className="set-field"><span className="set-label">Swatch Colour</span>
                                  <div style={{ display: 'flex', gap: 10 }}>
                                    <input type="color" value={t.hex || '#000000'} onChange={e => updateType(editVar.id, editTypeIdx, { hex: e.target.value })} style={{ width: 46, height: 44, padding: 0, border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' }} />
                                    <input className="set-input" value={t.hex || '#000000'} onChange={e => updateType(editVar.id, editTypeIdx, { hex: e.target.value })} />
                                  </div></div>
                                <div className="set-field"><span className="set-label">Price Offset (₹)</span>
                                  <input className="set-input" type="number" value={t.offset ?? 0} onChange={e => updateType(editVar.id, editTypeIdx, { offset: parseFloat(e.target.value) || 0 })} /></div>
                                <div className="set-field span2"><span className="set-label">Swatch Image (optional)</span>
                                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                    <label className="set-img" style={{ width: 84, height: 84, background: t.image ? imagePreview(t.image) : (t.hex || 'var(--bg-warm)') }}>
                                      {!t.image && <ImageIcon size={20} />}
                                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => upload(e, url => updateType(editVar.id, editTypeIdx, { image: url }))} />
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <button className="set-btn ghost" onClick={() => duplicateType(editVar.id, t)}><Copy size={14} /> Duplicate</button>
                                      <button className="set-btn danger" onClick={() => deleteType(editVar.id, editTypeIdx)}><Trash2 size={14} /> Delete</button>
                                    </div>
                                  </div></div>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>

                  {/* Live card */}
                  <div className="pc-vmodal-preview">
                    <div className="pc-preview-label">Live preview</div>
                    <article className="qd2-card" style={{ width: 230 }}>
                      {qd2Inner(editVar, editVarTools, editTypeIdx != null ? (editVar.colors || [])[editTypeIdx] : null)}
                    </article>
                  </div>
                </div>
              </div>
              <div className="pc-modal-foot">
                <button className="set-btn" onClick={() => setEditVarId(null)}>Done</button>
                <button className="set-btn ghost" onClick={() => duplicateVariety(editVar)}><Copy size={15} /> Duplicate</button>
                <button className="set-btn danger" onClick={() => deleteVariety(editVar.id)}><Trash2 size={15} /> Delete</button>
                <div style={{ marginLeft: 'auto' }}>{statusEl()}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════ PAGE 1: CATALOGUE LIST ══════════════════════
  const renderStrip = (cls) => {
    const warranty = (data.warranties || []).find(w => w.id === cls.warrantyId);
    const vcount = varietiesOf(cls.id).length;
    return (
      <div key={cls.id} className={`pc-strip${dragOver === `class:${cls.id}` ? ' dragover' : ''}`} onClick={() => { setActiveClassId(cls.id); setView('class'); setEditVarId(null); }} {...drag('class', cls.id)}>
        <span className="pc-strip-drag" onClick={e => e.stopPropagation()} title="Drag to reorder"><GripVertical size={16} /></span>
        <div className="pc-strip-cover" style={{ background: cls.logo ? imagePreview(cls.logo) : (cls.color || 'var(--bg-warm)') }}>{!cls.logo && (cls.type === 'tools' ? <Wrench size={20} /> : <Package size={22} />)}</div>
        <div className="pc-strip-main">
          <p className="pc-strip-name">{cls.name}</p>
          <div className="pc-strip-meta">
            <span className="pc-chip-sm">{vcount} {vcount === 1 ? 'variety' : 'varieties'}</span>
            {warranty && <span className="pc-warranty-pill"><FileText size={10} /> Warranty</span>}
          </div>
        </div>
        <div className="pc-strip-actions" onClick={e => e.stopPropagation()}>
          <button className="set-icon-btn" title="Edit class" onClick={() => setEditClassId(cls.id)}><Pencil size={16} /></button>
          <button className="set-icon-btn" title="Open varieties" onClick={() => { setActiveClassId(cls.id); setView('class'); }}><ChevronRight size={18} /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="set-page wide pc">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Brands group your product classes. Tools & accessories are separate. Click a class to manage its varieties.</div>
        <div style={{ marginLeft: 'auto' }}>{statusEl()}</div>
      </div>

      {/* Brand sections (products only) */}
      {sortedBrands.map(brand => {
        const classes = productClassesOf(brand.id);
        return (
          <div key={brand.id} className="pc-section">
            <div className="pc-section-head">
              {brand.logo ? <img className="pc-section-logo" src={mediaUrl(brand.logo)} alt="" /> : <div className="pc-section-badge"><Award size={18} /></div>}
              <h3>{brand.name}</h3>
              <span className="pc-count">{classes.length} {classes.length === 1 ? 'class' : 'classes'}</span>
            </div>
            <div className="pc-section-body">
              {classes.length === 0 && <div className="pc-empty"><span>No classes in this brand yet.</span></div>}
              {classes.map(cls => renderStrip(cls))}
              <button className="pc-add-class" onClick={() => addClass(brand.id)}><Plus size={15} /> Add class to {brand.name}</button>
            </div>
          </div>
        );
      })}

      {/* Tools & Accessories — never under a brand */}
      <div className="pc-section tools">
        <div className="pc-section-head">
          <div className="pc-section-badge"><Wrench size={18} /></div>
          <h3>Tools &amp; Accessories</h3>
          <span className="pc-count">{toolClasses.length}</span>
          <span className="pc-sub">— not tied to any brand</span>
        </div>
        <div className="pc-section-body">
          {toolClasses.length === 0 && <div className="pc-empty"><span>No tool / accessory classes yet.</span></div>}
          {toolClasses.map(cls => renderStrip(cls))}
          <button className="pc-add-class" onClick={() => addClass(null, 'tools')}><Plus size={15} /> Add tool / accessory class</button>
        </div>
      </div>

      {/* ── Class edit modal ── */}
      {modalClass && (
        <div className="pc-backdrop" onClick={() => setEditClassId(null)}>
          <div className="pc-modal" onClick={e => e.stopPropagation()}>
            <div className="pc-modal-head"><Pencil size={16} color="var(--accent)" /><h3>Edit {modalClass.type === 'tools' ? 'Accessory ' : ''}Class</h3>
              <button className="set-icon-btn" onClick={() => setEditClassId(null)}><X size={18} /></button></div>
            <div className="pc-modal-body">
              <div className="set-grid">
                <div className="set-field span2"><span className="set-label">Class Name</span>
                  <input className="set-input" value={modalClass.name} onChange={e => updateClass(modalClass.id, { name: e.target.value })} /></div>
                <div className="set-field span2"><span className="set-label">Class Logo / Category Image</span>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <label className="set-img" style={{ width: 96, height: 96, background: modalClass.logo ? imagePreview(modalClass.logo, 'contain') : (modalClass.color || '#fff') }}>
                      {!modalClass.logo && <ImageIcon size={24} color="rgba(255,255,255,0.85)" />}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => upload(e, url => updateClass(modalClass.id, { logo: url }))} />
                    </label>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>Shown on the Quotation Desk card; falls back to the class colour. Ctrl+V to paste.
                      {modalClass.logo && <div><button onClick={() => updateClass(modalClass.id, { logo: null })} style={{ marginTop: 6, color: 'var(--red)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Remove image</button></div>}</div>
                  </div></div>
                {modalClass.type !== 'tools' && (
                  <div className="set-field"><span className="set-label">Parent Brand</span>
                    <select className="set-select" value={modalClass.brandId || sortedBrands[0]?.id} onChange={e => updateClass(modalClass.id, { brandId: e.target.value })}>
                      {(data.brands || []).map(b => <option key={b.id} value={b.id}>{b.name}{b.active === false ? ' (inactive)' : ''}</option>)}
                    </select></div>
                )}
                <div className="set-field"><span className="set-label">Catalog Type</span>
                  <select className="set-select" value={modalClass.type === 'regular' ? 'tiles' : (modalClass.type || 'tiles')} onChange={e => updateClass(modalClass.id, { type: e.target.value, brandId: e.target.value === 'tools' ? null : (modalClass.brandId || sortedBrands[0]?.id) })}>
                    <option value="tiles">Standard Product</option><option value="tools">Tools &amp; Accessories</option>
                  </select></div>
                <div className="set-field"><span className="set-label">Identify Colour</span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input type="color" value={modalClass.color || '#E2E8F0'} onChange={e => updateClass(modalClass.id, { color: e.target.value })} style={{ width: 46, height: 44, padding: 0, border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' }} />
                    <input className="set-input" value={modalClass.color || '#E2E8F0'} onChange={e => updateClass(modalClass.id, { color: e.target.value })} />
                  </div></div>
                <div className="set-field span2"><span className="set-label">Link Warranty</span>
                  <select className="set-select" value={modalClass.warrantyId || ''} onChange={e => updateClass(modalClass.id, { warrantyId: e.target.value })}>
                    <option value="">— No warranty —</option>
                    {data.warranties?.map(w => <option key={w.id} value={w.id}>{w.title} ({w.duration})</option>)}
                  </select></div>
              </div>
            </div>
            <div className="pc-modal-foot">
              <button className="set-btn" onClick={() => setEditClassId(null)}>Done</button>
              <button className="set-btn ghost" onClick={() => duplicateClass(modalClass)}><Copy size={15} /> Duplicate</button>
              <button className="set-btn danger" onClick={() => deleteClass(modalClass.id)}><Trash2 size={15} /> Delete</button>
              <div style={{ marginLeft: 'auto' }}>{statusEl()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
