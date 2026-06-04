import { useState } from 'react';
import { useAppContext } from '../AppContext';
import { mediaUrl, uploadImage } from '../api';
import { Plus, Trash2, Image as ImageIcon, X, ToggleLeft, ToggleRight, Save, Award, ArrowUp, ArrowDown } from 'lucide-react';

const genId = () => 'brand_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function BrandsSettings() {
  const { data, setData, showToast, persistConfig } = useAppContext();

  const [brands, setBrands] = useState(() =>
    [...(data.brands || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  const [saved, setSaved] = useState(false);

  // How many classes each brand owns (for the safe-delete guard + display).
  const classCount = (brandId) => (data.classes || []).filter(c => (c.brandId || 'nj') === brandId).length;

  const update = (id, field, value) => setBrands(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));

  const addBrand = () => setBrands(prev => [
    ...prev,
    { id: genId(), name: '', logo: '', description: '', order: prev.length, active: true },
  ]);

  const move = (id, dir) => setBrands(prev => {
    const i = prev.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const removeBrand = (id) => {
    if (brands.length <= 1) { showToast('At least one brand is required', 'error'); return; }
    const count = classCount(id);
    let reassignToId = null;
    if (count > 0) {
      const target = brands.find(b => b.id !== id);
      if (!confirm(`${count} class${count === 1 ? '' : 'es'} belong to this brand. Move them to "${target.name || 'another brand'}" and delete this brand?`)) return;
      reassignToId = target.id;
    } else if (!confirm('Delete this brand?')) {
      return;
    }
    const nextBrands = brands.filter(b => b.id !== id).map((b, i) => ({ ...b, order: i }));
    const nextClasses = reassignToId
      ? (data.classes || []).map(c => ((c.brandId || 'nj') === id ? { ...c, brandId: reassignToId } : c))
      : (data.classes || []);
    const nextData = { ...data, brands: nextBrands, classes: nextClasses };
    setData(nextData);
    persistConfig(nextData);
    setBrands(nextBrands);
    showToast('Brand deleted');
  };

  const handleLogoUpload = async (id, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('Uploading logo…');
      const uploaded = await uploadImage(file);
      update(id, 'logo', uploaded.url);
    } catch {
      showToast('Logo upload failed. Start the backend and try again.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleSave = () => {
    for (const b of brands) {
      if (!b.name.trim()) { showToast('Every brand needs a name', 'error'); return; }
    }
    const ordered = brands.map((b, i) => ({ ...b, order: i }));
    const nextData = { ...data, brands: ordered };
    setData(nextData);
    persistConfig(nextData);
    setBrands(ordered);
    setSaved(true);
    showToast('Brands saved ✓');
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = {
    padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 'var(--radius)',
    fontSize: '14px', background: 'var(--bg)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <div className="animate-fade-up" style={{ maxWidth: '900px', margin: '0 auto', padding: '8px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Award size={20} />
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>Parent Brands</div>
          <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>The top level of your catalogue. Every product class belongs to one brand.</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
        {brands.map((brand, idx) => {
          const count = classCount(brand.id);
          return (
            <div key={brand.id} style={{
              border: `1.5px solid ${brand.active ? 'var(--line)' : 'var(--line-soft)'}`,
              borderRadius: 'var(--radius-lg)', overflow: 'hidden', opacity: brand.active ? 1 : 0.7, background: 'var(--surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-warm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Award size={15} color="var(--accent)" />
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{brand.name || `Brand ${idx + 1}`}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: '20px', padding: '2px 8px' }}>
                    {count} class{count === 1 ? '' : 'es'}
                  </span>
                  {!brand.active && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Inactive</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button onClick={() => move(brand.id, -1)} disabled={idx === 0} style={{ background: 'transparent', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', color: 'var(--ink-soft)', opacity: idx === 0 ? 0.4 : 1, padding: '2px' }} title="Move up"><ArrowUp size={15} /></button>
                  <button onClick={() => move(brand.id, 1)} disabled={idx === brands.length - 1} style={{ background: 'transparent', border: 'none', cursor: idx === brands.length - 1 ? 'not-allowed' : 'pointer', color: 'var(--ink-soft)', opacity: idx === brands.length - 1 ? 0.4 : 1, padding: '2px' }} title="Move down"><ArrowDown size={15} /></button>
                  <button onClick={() => removeBrand(brand.id)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '2px' }} title="Delete brand"><Trash2 size={15} /></button>
                </div>
              </div>

              <div style={{ padding: '18px', display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Logo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={labelStyle}>Brand Logo</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label className="hover-lift" style={{
                      width: '96px', height: '96px', borderRadius: 'var(--radius)', cursor: 'pointer', boxSizing: 'border-box',
                      border: '1.5px dashed var(--line)',
                      background: brand.logo ? `url("${mediaUrl(brand.logo)}") center/contain no-repeat #fff` : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)',
                    }}>
                      {!brand.logo && <ImageIcon size={22} />}
                      <input type="file" accept="image/*" onChange={e => handleLogoUpload(brand.id, e)} style={{ display: 'none' }} />
                    </label>
                    {brand.logo && (
                      <button type="button" onClick={() => update(brand.id, 'logo', '')} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><X size={14} /></button>
                    )}
                  </div>
                </div>

                {/* Fields */}
                <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={labelStyle}>Brand Name</span>
                    <input value={brand.name} onChange={e => update(brand.id, 'name', e.target.value)} style={inputStyle} placeholder="e.g. HighLander" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={labelStyle}>Description</span>
                    <textarea value={brand.description || ''} onChange={e => update(brand.id, 'description', e.target.value)} style={{ ...inputStyle, minHeight: '56px', resize: 'vertical' }} placeholder="Short description of this brand" />
                  </div>
                  <div onClick={() => update(brand.id, 'active', !brand.active)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    {brand.active ? <ToggleRight size={26} color="var(--accent)" strokeWidth={2} /> : <ToggleLeft size={26} color="var(--ink-soft)" strokeWidth={2} />}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{brand.active ? 'Active' : 'Inactive'}</span>
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>— {brand.active ? 'shown in catalogue & checkout' : 'hidden from catalogue filters'}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <button onClick={addBrand} className="hover-lift" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px',
          border: '1.5px dashed var(--line)', borderRadius: 'var(--radius)', background: 'var(--bg)',
          color: 'var(--accent)', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={16} /> Add Parent Brand
        </button>
      </div>

      <div style={{ position: 'sticky', bottom: '24px', display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
        <button onClick={handleSave} style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 32px', fontSize: '15px', fontWeight: 700,
          background: saved ? 'var(--green)' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius-full)',
          cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}>
          <Save size={18} /> {saved ? 'Saved!' : 'Save Brands'}
        </button>
      </div>
    </div>
  );
}
