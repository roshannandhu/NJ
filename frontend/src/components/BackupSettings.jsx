import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, HardDrive, Cloud, Usb,
  Download, RefreshCw, ChevronDown, ChevronRight,
  Database, Trash2, Search, Zap, Wifi, RotateCcw, Upload, Share2,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import {
  getBackupStatus, getBackupHealth, getBackupSettings, saveBackupSettings,
  runBackup, restoreFromFile, restoreFromPath,
  downloadBackup, downloadCatalogBackup, downloadHistoryBackup, fetchBackupBlob,
  getUploadsInfo, restoreCatalogFromFile,
  detectGdrivePath, detectUsbDrives, testConnection, listBackupFiles,
  clearQuotations, clearWarranties,
} from '../api';
import { shareFiles, blobToFile } from '../share';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const fmtB = (n) => {
  if (n == null) return '0 KB';
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
};

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).replace(',', '');
};

const fmtAgo = (iso) => {
  if (!iso) return 'Never';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const fmtNext = (iso, days) => {
  if (!iso) return 'Pending';
  const d = Math.ceil((new Date(iso).getTime() + days * 86400000 - Date.now()) / 86400000);
  if (d <= 0) return 'Due now';
  if (d === 1) return 'Tomorrow';
  return `In ${d} days`;
};

// Build a human message from a restore result (merge or replace).
const restoreMsg = (r) => {
  const a = r?.added || {};
  const u = r?.updated || {};
  const upd = (u.quotations || 0) + (u.warranty_certificates || 0);
  let msg = `Added ${a.quotations || 0} quotations, ${a.warranty_certificates || 0} warranties`;
  if (upd > 0) msg += ` (${upd} existing updated)`;
  if (r?.mode === 'replace') msg = `Replaced everything — ${msg.toLowerCase()}`;
  return msg;
};

const INTERVALS = [
  { value: 1,  label: 'Daily' },
  { value: 3,  label: 'Every 3 Days' },
  { value: 7,  label: 'Weekly' },
  { value: 14, label: 'Bi-Weekly' },
  { value: 30, label: 'Monthly' },
];

const DEST = {
  local:  { label: 'Local Disk', Icon: HardDrive },
  gdrive: { label: 'Google Drive', Icon: Cloud },
  usb:    { label: 'USB Drive', Icon: Usb },
};

export default function BackupSettings() {
  const { showToast, refreshBackupStatus } = useAppContext();

  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [targets, setTargets] = useState(null);
  const [keep, setKeep] = useState(30);
  const [intervalDays, setIntervalDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const [testRes, setTestRes] = useState({});
  const [testing, setTesting] = useState({});
  const [usbList, setUsbList] = useState(null);
  
  const [activeTab, setActiveTab] = useState('destinations');
  const [expandedLoc, setExpandedLoc] = useState(null);

  const [showRestore, setShowRestore] = useState(false);
  // Import mode: 'merge' (default, non-destructive) | 'replace' (full overwrite).
  const [restoreMode, setRestoreMode] = useState('merge');
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [restoringP, setRestoringP] = useState(null);
  
  const [resetConfirm, setResetConfirm] = useState('');
  const [uploadsInfo, setUploadsInfo] = useState(null);

  const fileRef = useRef(null);
  const catalogRestoreRef = useRef(null);

  const load = async () => {
    try {
      const [s, h, cfg, upl] = await Promise.all([
        getBackupStatus(), getBackupHealth(), getBackupSettings(), getUploadsInfo(),
      ]);
      setStatus(s); setHealth(h);
      setTargets(cfg.targets);
      setKeep(cfg.keep ?? 30);
      setIntervalDays(cfg.interval_days ?? 7);
      setUploadsInfo(upl);
    } catch { showToast('Could not load backup info', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const patchTarget = (name, patch) =>
    setTargets(t => ({ ...t, [name]: { ...t[name], ...patch } }));

  // Patch a destination AND persist immediately with the new value (avoids the
  // stale-closure bug where handleSave would otherwise save the pre-patch targets).
  const patchTargetAndSave = (name, patch) => {
    const next = { ...targets, [name]: { ...targets[name], ...patch } };
    setTargets(next);
    handleSave(true, { targets: next });
  };

  const handleSave = async (silent = false, overrides = {}) => {
    setBusy(true);
    try {
      await saveBackupSettings({ targets, keep: +keep, interval_days: +intervalDays, ...overrides });
      if (!silent) showToast('Settings saved');
      await load();
    } catch { showToast('Failed to save settings', 'error'); }
    finally { setBusy(false); }
  };

  const handleBackupNow = async () => {
    setBusy(true);
    try {
      const m = await runBackup();
      if (m.ok) showToast('Backup completed');
      else showToast(m.hint || 'Backup failed', 'error');
      await load(); refreshBackupStatus();
    } catch { showToast('Backup failed', 'error'); }
    finally { setBusy(false); }
  };

  const handleTest = async (name, path) => {
    setTesting(t => ({ ...t, [name]: true }));
    try {
      const r = await testConnection(path || '');
      setTestRes(t => ({ ...t, [name]: r }));
    } catch { setTestRes(t => ({ ...t, [name]: { ok: false, message: 'Failed' } })); }
    finally { setTesting(t => ({ ...t, [name]: false })); }
  };

  const handleDetectGdrive = async () => {
    try {
      const r = await detectGdrivePath();
      if (r.found) { patchTargetAndSave('gdrive', { path: r.path, enabled: true }); showToast('Google Drive detected'); }
      else showToast('Google Drive not found', 'error');
    } catch { showToast('Detection failed', 'error'); }
  };

  const handleDetectUsb = async () => {
    try {
      const r = await detectUsbDrives();
      setUsbList(r.drives);
      if (!r.drives.length) showToast('No USB drives found', 'error');
    } catch { showToast('USB detection failed', 'error'); }
  };

  const handleOpenRestore = async () => {
    setShowRestore(prev => !prev);
    if (!showRestore) {
      setLoadingFiles(true);
      try { const r = await listBackupFiles(); setFiles(r.files || []); }
      catch { showToast('Could not list files', 'error'); }
      finally { setLoadingFiles(false); }
    }
  };

  // Confirm an import. Merge is a simple OK/Cancel; Replace demands a typed
  // confirmation because it deletes existing records before importing.
  const confirmImport = (srcName) => {
    if (restoreMode === 'replace') {
      const typed = window.prompt(
        `REPLACE import from "${srcName}".\n\nThis DELETES all current records in scope and replaces them with the backup's contents (a safety snapshot is taken first).\n\nType REPLACE to confirm:`
      );
      return typed === 'REPLACE';
    }
    return window.confirm(`Merge import from "${srcName}"?\nExisting records are kept, new ones added, and matching ones updated. Nothing is deleted.`);
  };

  const handleRestoreFromPath = async (path, name) => {
    if (!confirmImport(name)) return;
    setRestoringP(path);
    try {
      const r = await restoreFromPath(path, restoreMode);
      showToast(`${restoreMsg(r)}. Reloading...`);
      setTimeout(() => window.location.reload(), 1400);
    } catch (e) { showToast(e.message || 'Restore failed', 'error'); setRestoringP(null); }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!confirmImport(file.name)) return;
    setBusy(true);
    try {
      const r = await restoreFromFile(file, restoreMode);
      showToast(`${restoreMsg(r)}. Reloading...`);
      setTimeout(() => window.location.reload(), 1400);
    } catch (e) { showToast(e.message || 'Restore failed', 'error'); setBusy(false); }
  };

  const handleReset = async () => {
    if (resetConfirm !== 'DELETE') return showToast('Type DELETE to confirm', 'error');
    if (!window.confirm('Clear ALL history? Catalog kept. Backup taken first.')) return;
    setBusy(true);
    try {
      await runBackup(); await clearQuotations(); await clearWarranties();
      showToast('Cleared. Reloading...'); setTimeout(() => window.location.reload(), 1200);
    } catch { showToast('Reset failed', 'error'); setBusy(false); }
  };

  if (!status || !health || !targets) {
    return <div style={{ padding:40, textAlign:'center', color:'var(--ink-soft)' }}>Loading...</div>;
  }

  const activeCount = ['local','gdrive','usb'].filter(n => targets[n]?.enabled && status.targets?.[n]?.available).length;
  const isHealthy = !status.needs_backup_reminder && activeCount > 0;
  
  const inpStyle = {
    padding:'6px 12px', border:'1px solid var(--line)', borderRadius:'4px',
    fontSize:13, background:'var(--surface)', color:'var(--ink)', outline:'none',
    boxSizing: 'border-box'
  };

  const btnStyle = {
    display:'inline-flex', alignItems:'center', justifyContent: 'center', gap:6,
    padding:'6px 14px', fontSize:13, fontWeight:500,
    border:'1px solid var(--line)', borderRadius:'4px',
    background:'var(--surface)', color:'var(--ink)', cursor:'pointer',
    transition: 'background 0.1s'
  };

  return (
    <div style={{ maxWidth: 1100, margin:'0 auto', padding: '24px', fontFamily: '"Segoe UI", system-ui, Roboto, sans-serif', color: 'var(--ink)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 24px 0', letterSpacing: '-0.01em' }}>Security &amp; Backup</h1>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        
        {/* ==========================================
            LEFT PANE (Main Area - Tabs & Content)
        ========================================== */}
        <div style={{ flex: 1, minWidth: 0 }}>
          
          {/* TOP STATUS STRIP (Always Visible) */}
          <div style={{ padding: '16px 20px', border: '1px solid var(--line)', borderRadius: 6, display: 'flex', alignItems: 'center', background: 'var(--surface)', marginBottom: 24 }}>
            <div style={{ marginRight: 16 }}>
              {isHealthy ? <ShieldCheck size={24} color="#10B981" /> : <ShieldAlert size={24} color="#F59E0B" />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                {isHealthy ? 'System Protected' : 'Action Recommended'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>
                Last Backup: {fmtAgo(status.last_success_iso)} &middot; Next Backup: {fmtNext(status.last_success_iso, +intervalDays)} &middot; {activeCount} Locations Active
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button disabled={busy} onClick={handleBackupNow} style={{ ...btnStyle, background: 'var(--ink)', color: 'white', border: 'none' }}>
                <RefreshCw size={14} /> Backup Now
              </button>
            </div>
          </div>

          {/* TABBED INTERFACE */}
          <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--line)' }}>
            {[
              { id: 'destinations', label: 'Destinations' },
              { id: 'automation', label: 'Automation' },
              { id: 'history', label: 'History Grid' }
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '8px 0', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400,
                  color: activeTab === t.id ? 'var(--ink)' : 'var(--ink-soft)',
                  borderBottom: activeTab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
                  marginBottom: -1
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            {/* --------------------------------------
                TAB: DESTINATIONS
            -------------------------------------- */}
            {activeTab === 'destinations' && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', background: 'var(--surface)' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '40px 150px 100px 1fr 40px', padding: '8px 12px', background: 'var(--bg-warm)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>
                  <div>En</div><div>Location</div><div>Status</div><div>Path</div><div/>
                </div>

                {/* Expandable Rows */}
                {['local','gdrive','usb'].map((name, i) => {
                  const { label, Icon } = DEST[name];
                  const t = targets[name];
                  const st = status.targets?.[name];
                  const isOk = t.enabled && st?.available;
                  const tr = testRes[name];
                  const isExpanded = expandedLoc === name;

                  return (
                    <React.Fragment key={name}>
                      {/* Master Row */}
                      <div onClick={() => setExpandedLoc(isExpanded ? null : name)}
                        style={{ display: 'grid', gridTemplateColumns: '40px 150px 100px 1fr 40px', padding: '10px 12px', borderBottom: i < 2 || isExpanded ? '1px solid var(--line)' : 'none', alignItems: 'center', fontSize: 13, cursor: 'pointer', background: isExpanded ? 'var(--bg)' : 'transparent' }}>
                        
                        <div onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={!!t.enabled} onChange={e => patchTargetAndSave(name, { enabled: e.target.checked })} style={{ margin: 0, cursor: 'pointer' }} />
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.enabled ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: 500 }}>
                          <Icon size={14} /> {label}
                        </div>
                        
                        <div style={{ color: t.enabled ? (isOk ? '#10B981' : '#F59E0B') : 'var(--ink-soft)' }}>
                          {t.enabled ? (isOk ? 'Ready' : 'Error') : 'Off'}
                        </div>
                        
                        <div style={{ fontFamily: 'monospace', color: t.enabled && t.path ? 'var(--ink-mid)' : 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.path || 'Not configured'}
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--ink-soft)' }}>
                          {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </div>
                      </div>

                      {/* Detail Expander */}
                      {isExpanded && (
                        <div style={{ padding: '12px 12px 16px 40px', background: 'var(--bg)', borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input value={t.path || ''} onChange={e => { patchTarget(name, { path: e.target.value }); setTestRes(r => ({ ...r, [name]: null })); }} placeholder={name === 'local' ? 'C:\\Backups' : 'Path'} style={{ ...inpStyle, flex: 1 }} />
                            {name === 'gdrive' && <button style={btnStyle} disabled={busy} onClick={handleDetectGdrive}><Search size={14}/> Detect</button>}
                            {name === 'usb' && <button style={btnStyle} disabled={busy} onClick={handleDetectUsb}><Search size={14}/> Detect</button>}
                            <button style={{ ...btnStyle, width: 100 }} disabled={testing[name]} onClick={() => handleTest(name, t.path)}><Wifi size={14}/> Test</button>
                            <button style={{ ...btnStyle, background: 'var(--ink)', color: 'white', border: 'none' }} onClick={() => handleSave(false)}>Save</button>
                          </div>
                          
                          {name === 'usb' && usbList && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                              {usbList.map(d => (
                                <button key={d.letter} style={{ ...btnStyle, fontSize: 12, padding: '4px 8px' }} onClick={() => { patchTargetAndSave('usb', { path: d.path, enabled: true }); setUsbList(null); }}>
                                  {d.letter} {d.label}
                                </button>
                              ))}
                              {usbList.length === 0 && <span style={{ fontSize: 12, color: '#F59E0B' }}>No drives found.</span>}
                            </div>
                          )}

                          {tr && (
                            <div style={{ marginTop: 8, fontSize: 12, color: tr.ok ? '#10B981' : '#EF4444' }}>
                              {tr.ok ? '✓ Connection successful' : `✗ ${tr.message}`}
                            </div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* --------------------------------------
                TAB: AUTOMATION
            -------------------------------------- */}
            {activeTab === 'automation' && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 24, background: 'var(--surface)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Zap size={16} color="var(--ink-soft)"/> Schedule &amp; Retention
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center', fontSize: 13, maxWidth: 400 }}>
                  <span style={{ color: 'var(--ink-mid)' }}>Frequency</span>
                  <select value={intervalDays} onChange={e => { const v = +e.target.value; setIntervalDays(v); handleSave(true, { interval_days: v }); }} style={{ ...inpStyle, cursor: 'pointer' }}>
                    {INTERVALS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  
                  <span style={{ color: 'var(--ink-mid)' }}>Keep Copies</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" min="1" max="365" value={keep} onChange={e => setKeep(e.target.value)} onBlur={() => handleSave(true)} style={{ ...inpStyle, width: 80 }} />
                    <span style={{ color: 'var(--ink-soft)' }}>per drive</span>
                  </div>
                </div>
              </div>
            )}

            {/* --------------------------------------
                TAB: HISTORY TABLE/GRID
            -------------------------------------- */}
            {activeTab === 'history' && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', background: 'var(--surface)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 80px 100px 1fr', padding: '8px 12px', background: 'var(--bg-warm)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>
                  <div>Time</div><div>Status</div><div>Target</div><div>Details</div>
                </div>
                {!status.recent?.length ? (
                  <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-soft)' }}>No activity logs found.</div>
                ) : (
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {status.recent.map((e, i) => {
                      const destName = Object.entries(e.targets || {}).filter(([,v]) => v==='ok').map(([k]) => DEST[k]?.label || k)[0] || 'Unknown';
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 80px 100px 1fr', padding: '10px 12px', borderBottom: '1px solid var(--line)', alignItems: 'center', fontSize: 12 }}>
                          <div style={{ color: 'var(--ink-mid)' }}>{fmtTime(e.created_iso)}</div>
                          <div style={{ color: e.ok ? '#10B981' : '#EF4444', fontWeight: 600 }}>{e.ok ? 'SUCCESS' : 'FAILED'}</div>
                          <div style={{ color: 'var(--ink-mid)' }}>{destName}</div>
                          <div style={{ color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {e.ok ? `Backed up ${fmtB(e.db_bytes)}` : `Error: ${JSON.stringify(e.targets)}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* INLINE RESTORE PANEL (Appears dynamically below main content) */}
          {showRestore && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 20, background: 'var(--surface)', marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                 <div style={{ fontSize: 14, fontWeight: 600 }}>Restore Snapshot</div>
                 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                   {/* Import mode selector — Merge (safe) is the default. */}
                   <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                     {[
                       { id: 'merge', label: 'Merge' },
                       { id: 'replace', label: 'Replace' },
                     ].map(m => (
                       <button key={m.id} onClick={() => setRestoreMode(m.id)} title={m.id === 'merge' ? 'Keep existing, add new, update matching (nothing deleted)' : 'Delete existing records, then import (snapshot taken first)'}
                         style={{
                           padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                           background: restoreMode === m.id ? (m.id === 'replace' ? '#EF4444' : 'var(--ink)') : 'var(--surface)',
                           color: restoreMode === m.id ? '#fff' : 'var(--ink-soft)',
                         }}>
                         {m.label}
                       </button>
                     ))}
                   </div>
                   <button style={{ ...btnStyle, fontSize: 12, padding: '4px 10px' }} onClick={handleOpenRestore}>Close</button>
                   <button style={{ ...btnStyle, fontSize: 12, padding: '4px 10px' }} onClick={() => fileRef.current?.click()}><Upload size={12}/> Import File</button>
                   <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" onChange={handleRestoreFile} style={{ display:'none' }} />
                 </div>
              </div>
              <div style={{ fontSize: 12, color: restoreMode === 'replace' ? '#EF4444' : 'var(--ink-soft)', marginBottom: 12 }}>
                {restoreMode === 'replace'
                  ? '⚠ Replace mode: existing records in the file’s scope are deleted before import (a safety snapshot is taken first).'
                  : 'Merge mode (recommended): keeps existing records, adds new, updates matching. Nothing is deleted.'}
              </div>
              
              {loadingFiles ? <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading...</div>
              : !files.length ? <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No backups found.</div>
              : (
                <div style={{ border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 120px 1fr 80px', padding: '6px 12px', background: 'var(--bg-warm)', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
                    <div>Date</div><div>Target</div><div>Filename</div><div></div>
                  </div>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 120px 1fr 80px', padding: '8px 12px', borderTop: '1px solid var(--line)', alignItems: 'center', fontSize: 12 }}>
                      <div>{new Date(f.modified_iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</div>
                      <div style={{ color: 'var(--ink-mid)' }}>{DEST[f.target]?.label}</div>
                      <div style={{ color: 'var(--ink-soft)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 10 }}>{f.filename}</div>
                      <button style={{ ...btnStyle, padding: '4px 8px', fontSize: 11 }} disabled={!!restoringP} onClick={() => handleRestoreFromPath(f.path, f.filename)}>
                        {restoringP === f.path ? '...' : 'Restore'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Danger Zone (Moved to bottom of Left Pane) */}
          <div style={{ border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, padding: '16px 20px', background: 'var(--surface)', marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <div>
               <div style={{ fontSize: 14, fontWeight: 600, color: '#EF4444', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                 <Trash2 size={16}/> Factory Reset
               </div>
               <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                 Clear all history (Quotations & Warranties). Product Catalog is kept.
               </div>
             </div>
             <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="Type DELETE" style={{ ...inpStyle, width: 120, borderColor: 'rgba(239, 68, 68, 0.3)', textAlign: 'center' }} />
                <button disabled={busy || resetConfirm !== 'DELETE'} onClick={handleReset} style={{ ...btnStyle, color: resetConfirm === 'DELETE' ? '#fff' : '#EF4444', background: resetConfirm === 'DELETE' ? '#EF4444' : 'transparent', borderColor: resetConfirm === 'DELETE' ? '#EF4444' : 'rgba(239, 68, 68, 0.3)' }}>
                  Clear History
                </button>
             </div>
          </div>

        </div>

        {/* ==========================================
            RIGHT PANE (Compact Metrics Sidebar)
        ========================================== */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Metrics Box */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 16, background: 'var(--surface)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Database size={14} color="var(--ink-soft)"/> Database Metrics
            </div>
            
            <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', marginBottom: 8, letterSpacing: '-0.02em' }}>
              {fmtB(health.db_bytes)}
            </div>
            
            <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, marginBottom: 12 }}>
              <div style={{ width: `${Math.min(100, Math.round(health.db_bytes / health.red_bytes * 100))}%`, height: '100%', background: 'var(--ink)', borderRadius: 2 }} />
            </div>
            
            <div style={{ fontSize: 12, color: 'var(--ink-mid)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Quotations</span> <span style={{ fontWeight: 600 }}>{health.counts.quotations}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Warranties</span> <span style={{ fontWeight: 600 }}>{health.counts.warranty_certificates}</span>
              </div>
            </div>
          </div>

          {/* Utilities */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 16, background: 'var(--surface)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>
              Export & Utilities
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button style={{ ...btnStyle, justifyContent: 'flex-start' }} onClick={downloadBackup}>
                <Download size={14} /> Export Full Backup (Both)
              </button>
              <button style={{ ...btnStyle, justifyContent: 'flex-start' }}
                onClick={async () => {
                  try {
                    const { blob, filename } = await fetchBackupBlob();
                    const r = await shareFiles([blobToFile(blob, filename, 'application/zip')], { title: 'NJ India — full backup', text: 'All quotations, warranties & catalog' });
                    showToast(r === 'downloaded' ? 'Saved — attach it in WhatsApp/Email' : r === 'cancelled' ? 'Share cancelled' : 'Shared');
                  } catch { showToast('Share failed', 'error'); }
                }}>
                <Share2 size={14} /> Share Full Backup (everything)
              </button>
              <button style={{ ...btnStyle, justifyContent: 'flex-start' }} onClick={downloadCatalogBackup}>
                <Download size={14} /> Export Catalog
                {uploadsInfo && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-soft)', fontWeight: 600 }}>
                    {uploadsInfo.count} images · .zip
                  </span>
                )}
              </button>
              <button style={{ ...btnStyle, justifyContent: 'flex-start' }}
                onClick={() => catalogRestoreRef.current?.click()}>
                <RotateCcw size={14} /> Restore Catalog
              </button>
              <input ref={catalogRestoreRef} type="file" accept=".zip,.json,application/zip,application/json" style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]; e.target.value = '';
                  if (!file) return;
                  const replace = restoreMode === 'replace';
                  if (replace) {
                    if (window.prompt(`REPLACE catalogue from "${file.name}".\n\nThis overwrites brands, classes, varieties, tools, warranty templates and settings with the file's contents (a safety snapshot is taken first). History (quotations/warranties) is NOT touched.\n\nType REPLACE to confirm:`) !== 'REPLACE') return;
                  } else if (!window.confirm(`Restore catalogue from "${file.name}"?\nMerges brands, classes, varieties, tools, warranty templates, settings and images. History is never touched. Nothing is deleted.`)) {
                    return;
                  }
                  setBusy(true);
                  try {
                    const r = await restoreCatalogFromFile(file, restoreMode);
                    showToast(`Catalogue ${replace ? 'replaced' : 'restored'}, ${r.restored_images ?? 0} images. Reloading...`);
                    setTimeout(() => window.location.reload(), 1400);
                  } catch (err) { showToast(err.message || 'Restore failed', 'error'); setBusy(false); }
                }}
              />
              <button style={{ ...btnStyle, justifyContent: 'flex-start' }} onClick={downloadHistoryBackup}>
                <Download size={14} /> Export History
              </button>

              <div style={{ height: '1px', background: 'var(--line)', margin: '4px 0' }}></div>

              <button style={{ ...btnStyle, justifyContent: 'flex-start' }} onClick={handleOpenRestore}>
                <RotateCcw size={14} /> Restore Database
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
