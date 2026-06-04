import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, HardDrive, Cloud, Usb,
  Download, RefreshCw, ChevronDown, ChevronRight,
  Database, Trash2, Search, Wifi, RotateCcw, Upload, Share2,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import {
  getBackupStatus, getBackupHealth, getBackupSettings, saveBackupSettings,
  runBackup, restoreFromFile, restoreFromPath,
  downloadBackup, downloadCatalogBackup, downloadHistoryBackup, fetchBackupBlob,
  getUploadsInfo, restoreCatalogFromFile,
  detectUsbDrives, detectCloudPath, testConnection, listBackupFiles,
  cloudStatus, saveCloudConfig, cloudConnect, cloudDisconnect,
  clearQuotations, clearWarranties,
  recoveryBackups, recoveryScan, recoveryRecover, recoveryReportUrl,
} from '../api';
import { shareFiles, blobToFile } from '../share';
import BackupDashboard from './BackupDashboard';

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

// Cloud destinations (gdrive/onedrive) log in via OAuth — see CLOUD below.
const DEST = {
  local:    { label: 'Local Disk', Icon: HardDrive },
  usb:      { label: 'USB / External', Icon: Usb },
  // Dropbox is a plain *synced folder* destination (point at the local Dropbox
  // folder so the desktop client uploads it) — not an OAuth account like the two
  // below. We auto-detect its folder via /detect-cloud?provider=dropbox.
  dropbox:  { label: 'Dropbox (synced folder)', Icon: Cloud },
  gdrive:   { label: 'Google Drive', Icon: Cloud, cloud: true },
  onedrive: { label: 'OneDrive', Icon: Cloud, cloud: true },
};
const DEST_NAMES = Object.keys(DEST);

// The full Backup & Recovery center (rendered by the sidebar "Backup & Recovery"
// page). Tabs: Overview (health/automation/activity via BackupDashboard),
// Destinations, Recovery, Tools (exports / metrics / factory reset).
export default function BackupSettings() {
  const { showToast } = useAppContext();

  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [targets, setTargets] = useState(null);
  const [keep, setKeep] = useState(30);
  const [intervalDays, setIntervalDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const [testRes, setTestRes] = useState({});
  const [testing, setTesting] = useState({});
  const [usbList, setUsbList] = useState(null);

  // Cloud OAuth accounts (gdrive/onedrive): live status, the client-id/secret
  // the user pastes in, per-provider busy flag, and whether to show setup help.
  const [cloud, setCloud] = useState({});
  const [cloudCfg, setCloudCfg] = useState({});
  const [cloudBusy, setCloudBusy] = useState({});
  const [cloudHelp, setCloudHelp] = useState({});
  
  const [activeTab, setActiveTab] = useState('overview');
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

  // ── Recovery Center state ──
  const [recBackups, setRecBackups] = useState([]);
  const [recBackupSel, setRecBackupSel] = useState('');
  const [recReport, setRecReport] = useState(null);
  const [recScanning, setRecScanning] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [pick, setPick] = useState({});
  const togglePick = (k) => setPick(p => ({ ...p, [k]: !p[k] }));
  const pickMany = (keys, on) => setPick(p => { const n = { ...p }; keys.forEach(k => { n[k] = on; }); return n; });

  const loadRecovery = async () => {
    try {
      const { backups } = await recoveryBackups();
      setRecBackups(backups || []);
      if (backups && backups.length && !recBackupSel) setRecBackupSel(backups[0].json_path);
    } catch { /* offline */ }
  };
  useEffect(() => { if (activeTab === 'recovery' && recBackups.length === 0) loadRecovery(); }, [activeTab]);

  const doScan = async () => {
    setRecScanning(true); setPick({});
    try {
      const rep = await recoveryScan(recBackupSel || undefined);
      setRecReport(rep);
      if (!rep.ok) showToast(rep.error || 'No backup found', 'error');
    } catch { showToast('Scan failed', 'error'); }
    finally { setRecScanning(false); }
  };

  const buildSelection = () => {
    const sel = { quotation_ids: [], warranty_ids: [], overwrite_quotation_ids: [], overwrite_warranty_ids: [], images: [], config_items: {} };
    Object.keys(pick).forEach(k => {
      if (!pick[k]) return;
      const p = k.split('|'); const kind = p[0];
      if (kind === 'q') sel.quotation_ids.push(p[1]);
      else if (kind === 'w') sel.warranty_ids.push(p[1]);
      else if (kind === 'owq') sel.overwrite_quotation_ids.push(p[1]);
      else if (kind === 'oww') sel.overwrite_warranty_ids.push(p[1]);
      else if (kind === 'img') sel.images.push(p.slice(1).join('|'));
      else if (kind === 'cfg') { (sel.config_items[p[1]] = sel.config_items[p[1]] || []).push(p.slice(2).join('|')); }
    });
    return sel;
  };

  const doRecover = async (all) => {
    if (!recReport?.source?.file) return;
    let selection;
    if (all) {
      const L = recReport.lists;
      selection = {
        quotation_ids: L.all_missing_quotation_ids || [],
        warranty_ids: L.all_missing_warranty_ids || [],
        images: L.missing_images || [],
        config_items: Object.fromEntries(Object.entries(L.missing_config || {}).map(([k, v]) => [k, v.map(x => x.id)])),
      };
    } else {
      selection = buildSelection();
    }
    const total = (selection.quotation_ids?.length || 0) + (selection.warranty_ids?.length || 0)
      + (selection.overwrite_quotation_ids?.length || 0) + (selection.overwrite_warranty_ids?.length || 0)
      + (selection.images?.length || 0) + Object.values(selection.config_items || {}).reduce((s, a) => s + a.length, 0);
    if (total === 0) { showToast('Nothing selected to recover', 'error'); return; }
    if (!window.confirm(`Recover ${total} item(s) from the backup?\n\nMissing records are added; nothing is deleted. A safety snapshot is taken first.`)) return;
    setRecBusy(true);
    try {
      const r = await recoveryRecover(recReport.source.file, selection);
      const a = r.applied || {};
      showToast(`Recovered: +${a.quotations?.added || 0} quotations, +${a.warranties?.added || 0} warranties, ${a.images || 0} images`, 'success');
      setTimeout(() => window.location.reload(), 1300); // reload so the whole app reflects restored data
    } catch { showToast('Recovery failed', 'error'); }
    finally { setRecBusy(false); }
  };

  // Render a checkbox list of recoverable items.
  const recList = (title, items, kind, labelFn, accent = 'var(--accent)') => {
    if (!items || items.length === 0) return null;
    const keys = items.map(it => `${kind}|${it.id ?? it}`);
    const allOn = keys.every(k => pick[k]);
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-warm)' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: accent }}>{title} ({items.length})</span>
          <button style={{ ...btnStyle, padding: '3px 8px', fontSize: 11 }} onClick={() => pickMany(keys, !allOn)}>{allOn ? 'Clear' : 'Select all'}</button>
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {items.map((it, idx) => {
            const k = `${kind}|${it.id ?? it}`;
            return (
              <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid var(--line-soft)', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!pick[k]} onChange={() => togglePick(k)} />
                <span style={{ fontFamily: 'var(--font-mono)' }}>{labelFn(it)}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };
  const recConfigList = () => {
    const mc = recReport?.lists?.missing_config || {};
    const rows = Object.entries(mc).flatMap(([key, items]) => items.map(it => ({ key, ...it })));
    if (!rows.length) return null;
    const keys = rows.map(r => `cfg|${r.key}|${r.id}`);
    const allOn = keys.every(k => pick[k]);
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-warm)' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Missing catalog items ({rows.length})</span>
          <button style={{ ...btnStyle, padding: '3px 8px', fontSize: 11 }} onClick={() => pickMany(keys, !allOn)}>{allOn ? 'Clear' : 'Select all'}</button>
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {rows.map((r, i) => {
            const k = `cfg|${r.key}|${r.id}`;
            return (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid var(--line-soft)', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!pick[k]} onChange={() => togglePick(k)} />
                <span><b style={{ textTransform: 'capitalize' }}>{r.key.slice(0, -1)}</b> · {r.name}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };
  const recConflicts = () => {
    const cq = recReport?.lists?.conflict_quotations || [];
    const cw = recReport?.lists?.conflict_warranties || [];
    if (!cq.length && !cw.length) return null;
    const row = (it, kind, label) => {
      const k = `${kind}|${it.id}`;
      return (
        <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid var(--line-soft)', fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!pick[k]} onChange={() => togglePick(k)} />
          <span style={{ fontFamily: 'var(--font-mono)' }}>{label}</span>
        </label>
      );
    };
    return (
      <div style={{ border: '1px solid #fde68a', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', background: '#fffbeb', fontWeight: 700, fontSize: 13, color: '#b45309', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Conflicts — review ({cq.length + cw.length})</span>
          <span style={{ fontWeight: 500, fontSize: 11 }}>tick to overwrite local with the backup version</span>
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {cq.map(it => row(it, 'owq', `${it.id} · ${it.customer} · ₹${it.grandTotal}`))}
          {cw.map(it => row(it, 'oww', `${it.id} · ${it.customer}`))}
        </div>
      </div>
    );
  };

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
    loadCloud();
  };
  useEffect(() => { load(); }, []);

  // Cloud account status (Google Drive / OneDrive).
  const CLOUD_NAMES = ['gdrive', 'onedrive'];
  const loadCloud = async () => {
    try {
      const results = await Promise.all(CLOUD_NAMES.map(n => cloudStatus(n).catch(() => null)));
      const map = {};
      CLOUD_NAMES.forEach((n, i) => { if (results[i]) map[n] = results[i]; });
      setCloud(map);
    } catch { /* offline */ }
  };

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

  const handleTest = async (name, path) => {
    setTesting(t => ({ ...t, [name]: true }));
    try {
      const r = await testConnection(path || '');
      setTestRes(t => ({ ...t, [name]: r }));
    } catch { setTestRes(t => ({ ...t, [name]: { ok: false, message: 'Failed' } })); }
    finally { setTesting(t => ({ ...t, [name]: false })); }
  };

  // ── Cloud OAuth account handlers (Google Drive / OneDrive) ──
  const handleSaveCloudConfig = async (name) => {
    const label = DEST[name]?.label || name;
    const cfg = cloudCfg[name] || {};
    if (!cfg.client_id) { showToast('Paste the Client ID first', 'error'); return; }
    setCloudBusy(b => ({ ...b, [name]: true }));
    try {
      const st = await saveCloudConfig(name, cfg.client_id.trim(), (cfg.client_secret || '').trim());
      setCloud(c => ({ ...c, [name]: st }));
      showToast(`${label} setup saved`);
    } catch { showToast('Could not save setup', 'error'); }
    finally { setCloudBusy(b => ({ ...b, [name]: false })); }
  };

  const handleCloudConnect = async (name) => {
    const label = DEST[name]?.label || name;
    setCloudBusy(b => ({ ...b, [name]: true }));
    showToast(`Opening ${label} login in your browser…`);
    try {
      const r = await cloudConnect(name);          // blocks until the browser login finishes
      setCloud(c => ({ ...c, [name]: r }));
      if (r.connected) {
        showToast(`Connected to ${label}${r.email ? ` as ${r.email}` : ''}`);
        patchTargetAndSave(name, { enabled: true });   // auto-enable once connected
      } else {
        showToast(r.error || `${label} login was not completed`, 'error');
      }
    } catch { showToast(`${label} login failed`, 'error'); }
    finally { setCloudBusy(b => ({ ...b, [name]: false })); }
  };

  const handleCloudDisconnect = async (name) => {
    const label = DEST[name]?.label || name;
    if (!window.confirm(`Disconnect ${label}? Backups will stop going there until you reconnect.`)) return;
    setCloudBusy(b => ({ ...b, [name]: true }));
    try {
      const st = await cloudDisconnect(name);
      setCloud(c => ({ ...c, [name]: st }));
      showToast(`${label} disconnected`);
    } catch { showToast('Could not disconnect', 'error'); }
    finally { setCloudBusy(b => ({ ...b, [name]: false })); }
  };

  const handleDetectUsb = async () => {
    try {
      const r = await detectUsbDrives();
      setUsbList(r.drives);
      if (!r.drives.length) showToast('No USB drives found', 'error');
    } catch { showToast('USB detection failed', 'error'); }
  };

  // Locate the local Dropbox sync folder and fill in a NJ_Backups subfolder.
  const handleDetectDropbox = async () => {
    try {
      const r = await detectCloudPath('dropbox');
      if (r.found && r.path) {
        patchTargetAndSave('dropbox', { path: r.path, enabled: true });
        showToast('Dropbox folder detected', 'success');
      } else {
        showToast('No Dropbox folder found on this PC', 'error');
      }
    } catch { showToast('Dropbox detection failed', 'error'); }
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
    <div style={{ maxWidth: 1100, margin:'0 auto', padding: '0', fontFamily: 'var(--font-body)', color: 'var(--ink)' }}>
      {/* TABBED INTERFACE */}
      <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--line)' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'destinations', label: 'Destinations' },
          { id: 'recovery', label: 'Recovery' },
          { id: 'tools', label: 'Tools' }
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 0', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400,
              color: activeTab === t.id ? 'var(--accent)' : 'var(--ink-soft)',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {/* TAB: OVERVIEW — health, automation, activity */}
        {activeTab === 'overview' && <BackupDashboard />}

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
                {DEST_NAMES.map((name, i) => {
                  const { label, Icon, cloud: isCloud } = DEST[name];
                  const t = targets[name] || { enabled: false, path: '' };
                  const st = status.targets?.[name];
                  const isOk = t.enabled && st?.available;
                  const tr = testRes[name];
                  const isExpanded = expandedLoc === name;
                  const cs = cloud[name] || {};
                  const pathLabel = isCloud
                    ? (cs.connected ? (cs.email || 'Connected')
                        : cs.configured ? 'Set up — not signed in' : 'Not set up')
                    : (t.path || 'Not configured');

                  return (
                    <React.Fragment key={name}>
                      {/* Master Row */}
                      <div onClick={() => setExpandedLoc(isExpanded ? null : name)}
                        style={{ display: 'grid', gridTemplateColumns: '40px 150px 100px 1fr 40px', padding: '10px 12px', borderBottom: i < DEST_NAMES.length - 1 || isExpanded ? '1px solid var(--line)' : 'none', alignItems: 'center', fontSize: 13, cursor: 'pointer', background: isExpanded ? 'var(--bg)' : 'transparent' }}>
                        
                        <div onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={!!t.enabled} onChange={e => patchTargetAndSave(name, { enabled: e.target.checked })} style={{ margin: 0, cursor: 'pointer' }} />
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.enabled ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: 500 }}>
                          <Icon size={14} /> {label}
                        </div>
                        
                        <div style={{ color: t.enabled ? (isOk ? '#10B981' : '#F59E0B') : 'var(--ink-soft)' }}>
                          {t.enabled ? (isOk ? 'Ready' : 'Error') : 'Off'}
                        </div>
                        
                        <div style={{ fontFamily: 'monospace', color: t.enabled && (isCloud ? cs.connected : t.path) ? 'var(--ink-mid)' : 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pathLabel}
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--ink-soft)' }}>
                          {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </div>
                      </div>

                      {/* Detail Expander */}
                      {isExpanded && isCloud && (
                        <div style={{ padding: '12px 12px 16px 40px', background: 'var(--bg)', borderBottom: i < DEST_NAMES.length - 1 ? '1px solid var(--line)' : 'none' }}>
                          {cs.connected ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>✓ Connected{cs.email ? ` as ${cs.email}` : ''}</span>
                              <button style={btnStyle} disabled={cloudBusy[name]} onClick={() => handleCloudDisconnect(name)}>Disconnect</button>
                            </div>
                          ) : (
                            <>
                              {!cs.configured && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <input value={(cloudCfg[name]?.client_id) || ''} onChange={e => setCloudCfg(c => ({ ...c, [name]: { ...c[name], client_id: e.target.value } }))} placeholder="Client ID" style={{ ...inpStyle, flex: 1, minWidth: 220 }} />
                                  {DEST[name].secret !== false && cs.needs_secret && (
                                    <input value={(cloudCfg[name]?.client_secret) || ''} onChange={e => setCloudCfg(c => ({ ...c, [name]: { ...c[name], client_secret: e.target.value } }))} placeholder="Client secret" style={{ ...inpStyle, flex: 1, minWidth: 220 }} />
                                  )}
                                  <button style={{ ...btnStyle, background: 'var(--accent)', color: 'white', border: 'none' }} disabled={cloudBusy[name]} onClick={() => handleSaveCloudConfig(name)}>Save setup</button>
                                </div>
                              )}
                              {cs.configured && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <button style={{ ...btnStyle, background: 'var(--accent)', color: 'white', border: 'none' }} disabled={cloudBusy[name]} onClick={() => handleCloudConnect(name)}>
                                    <Cloud size={14}/> {cloudBusy[name] ? 'Waiting for browser…' : 'Connect account'}
                                  </button>
                                  <button style={btnStyle} disabled={cloudBusy[name]} onClick={() => { setCloud(c => ({ ...c, [name]: { ...c[name], configured: false } })); }}>Change Client ID</button>
                                </div>
                              )}
                              <button onClick={() => setCloudHelp(h => ({ ...h, [name]: !h[name] }))} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}>
                                {cloudHelp[name] ? 'Hide setup steps' : 'How do I get a Client ID?'}
                              </button>
                              {cloudHelp[name] && (
                                <ol style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-mid)', lineHeight: 1.6, paddingLeft: 18 }}>
                                  {name === 'gdrive' ? (
                                    <>
                                      <li>Open <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>console.cloud.google.com</a> and create a project.</li>
                                      <li>APIs &amp; Services → enable the <b>Google Drive API</b>.</li>
                                      <li>OAuth consent screen → <b>External</b> → add your email as a <b>Test user</b>.</li>
                                      <li>Credentials → Create credentials → <b>OAuth client ID</b> → type <b>Desktop app</b>.</li>
                                      <li>Copy the <b>Client ID</b> and <b>Client secret</b> here, then Save setup.</li>
                                    </>
                                  ) : (
                                    <>
                                      <li>Open <a href="https://portal.azure.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>portal.azure.com</a> → <b>App registrations</b> → New registration.</li>
                                      <li>Supported accounts: <b>Personal + work/school</b>.</li>
                                      <li>Authentication → Add platform → <b>Mobile &amp; desktop</b> → redirect <code>http://localhost</code>.</li>
                                      <li>Copy the <b>Application (client) ID</b> here, then Save setup. (No secret needed.)</li>
                                    </>
                                  )}
                                </ol>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {isExpanded && !isCloud && (
                        <div style={{ padding: '12px 12px 16px 40px', background: 'var(--bg)', borderBottom: i < DEST_NAMES.length - 1 ? '1px solid var(--line)' : 'none' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input value={t.path || ''} onChange={e => { patchTarget(name, { path: e.target.value }); setTestRes(r => ({ ...r, [name]: null })); }} placeholder={name === 'local' ? 'C:\\Backups' : 'D:\\NJ Backups'} style={{ ...inpStyle, flex: 1 }} />
                            {name === 'usb' && <button style={btnStyle} disabled={busy} onClick={handleDetectUsb}><Search size={14}/> Detect</button>}
                            {name === 'dropbox' && <button style={btnStyle} disabled={busy} onClick={handleDetectDropbox}><Search size={14}/> Detect</button>}
                            <button style={{ ...btnStyle, width: 100 }} disabled={testing[name]} onClick={() => handleTest(name, t.path)}><Wifi size={14}/> Test</button>
                            <button style={{ ...btnStyle, background: 'var(--accent)', color: 'white', border: 'none' }} onClick={() => handleSave(false)}>Save</button>
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
                TAB: RECOVERY CENTER
            -------------------------------------- */}
            {activeTab === 'recovery' && (
              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                  <select value={recBackupSel} onChange={e => setRecBackupSel(e.target.value)} style={{ ...inpStyle, minWidth: 300 }}>
                    {recBackups.length === 0 && <option value="">No backups found on connected destinations</option>}
                    {recBackups.map(b => (
                      <option key={b.json_path} value={b.json_path}>
                        {(DEST[b.target]?.label || b.target)} · {fmtTime(b.created_iso)} · {(b.counts?.quotations ?? '?')}Q / {(b.counts?.warranty_certificates ?? '?')}W
                      </option>
                    ))}
                  </select>
                  <button style={{ ...btnStyle, background: 'var(--accent)', color: '#fff', border: 'none' }} disabled={recScanning || recBackups.length === 0} onClick={doScan}>
                    <Search size={14} /> {recScanning ? 'Scanning…' : 'Scan now'}
                  </button>
                  <button style={btnStyle} onClick={loadRecovery}><RefreshCw size={14} /> Refresh</button>
                  {recReport?.ok && <a href={recoveryReportUrl(recBackupSel)} style={{ ...btnStyle, textDecoration: 'none' }}><Download size={14} /> Export Report</a>}
                </div>

                {!recReport ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-soft)', border: '1px dashed var(--line)', borderRadius: 8, fontSize: 13 }}>
                    Pick a backup and click <b>Scan now</b> to compare it against your current data and recover only what's missing.
                  </div>
                ) : !recReport.ok ? (
                  <div style={{ padding: 20, color: '#F59E0B', fontSize: 13 }}>{recReport.error}</div>
                ) : (
                  <>
                    {!recReport.corruption.ok && (
                      <div style={{ padding: '10px 14px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <ShieldAlert size={16} /> Database integrity: <b>{recReport.corruption.db_integrity}</b>
                        {recReport.summary.unrecoverable_images > 0 ? ` · ${recReport.summary.unrecoverable_images} referenced image(s) missing from all backups` : ''}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
                      {[
                        ['Missing quotations', recReport.summary.missing_quotations, 'var(--accent)'],
                        ['Missing warranties', recReport.summary.missing_warranties, 'var(--accent)'],
                        ['Missing catalog', recReport.summary.missing_config, 'var(--accent)'],
                        ['Missing images', recReport.summary.missing_images, 'var(--accent)'],
                        ['Conflicts', recReport.summary.conflict_quotations + recReport.summary.conflict_warranties, '#b45309'],
                      ].map(([label, n, color]) => (
                        <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', background: 'var(--surface)' }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: n > 0 ? color : 'var(--ink-soft)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{n}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginTop: 4 }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {recList('Missing quotations', recReport.lists.missing_quotations, 'q', it => `${it.id} · ${it.customer} · ₹${it.grandTotal}`)}
                    {recList('Missing warranties', recReport.lists.missing_warranties, 'w', it => `${it.id} · ${it.customer}`)}
                    {recConfigList()}
                    {recList('Missing images', recReport.lists.missing_images, 'img', n => n)}
                    {recConflicts()}

                    {(recReport.summary.missing_quotations + recReport.summary.missing_warranties + recReport.summary.missing_config + recReport.summary.missing_images + recReport.summary.conflict_quotations + recReport.summary.conflict_warranties) === 0 && (
                      <div style={{ padding: 24, textAlign: 'center', color: '#10B981', fontSize: 14, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' }}>
                        <ShieldCheck size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} /> In sync — this backup contains nothing your database is missing.
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
                      Local-only (here but not in this backup, left untouched): {recReport.summary.local_only_quotations} quotations, {recReport.summary.local_only_warranties} warranties.
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                      <button style={{ ...btnStyle, background: 'var(--accent)', color: '#fff', border: 'none' }} disabled={recBusy} onClick={() => doRecover(false)}><Upload size={14} /> {recBusy ? 'Recovering…' : 'Recover Selected'}</button>
                      <button style={btnStyle} disabled={recBusy} onClick={() => doRecover(true)}><RotateCcw size={14} /> Recover All Missing</button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 8 }}>A pre-restore snapshot is taken automatically. Records are only added (or updated for ticked conflicts) — nothing is ever deleted.</div>
                  </>
                )}
              </div>
            )}

        {/* --------------------------------------
            TAB: TOOLS — exports, metrics, restore, factory reset
        -------------------------------------- */}
        {activeTab === 'tools' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>

              {/* Export & Utilities */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 16, background: 'var(--surface)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>
                  Export &amp; Utilities
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

              {/* Database Metrics */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 16, background: 'var(--surface)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Database size={14} color="var(--ink-soft)"/> Database Metrics
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', marginBottom: 8, letterSpacing: '-0.02em' }}>
                  {fmtB(health.db_bytes)}
                </div>
                <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, marginBottom: 12 }}>
                  <div style={{ width: `${Math.min(100, Math.round(health.db_bytes / health.red_bytes * 100))}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
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
            </div>

            {/* Restore Snapshot panel (toggled by "Restore Database") */}
            {showRestore && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 20, background: 'var(--surface)' }}>
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
                             background: restoreMode === m.id ? (m.id === 'replace' ? 'var(--red)' : 'var(--accent)') : 'var(--surface)',
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

            {/* Danger Zone */}
            <div style={{ border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, padding: '16px 20px', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        )}
      </div>
    </div>
  );
}
