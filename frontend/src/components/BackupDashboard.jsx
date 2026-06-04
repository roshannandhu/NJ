import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, AlertTriangle, HardDrive, Database, FileBox,
  Clock, Activity, CheckCircle2,
} from 'lucide-react';
import {
  getBackupDashboard, getRecoveryLog, verifyNow,
  getBackupSettings, saveBackupSettings, runBackup,
} from '../api';

// Verification cadence options the backend accepts (minutes).
const VERIFY_OPTIONS = [
  { value: 15,    label: 'Every 15 minutes' },
  { value: 30,    label: 'Every 30 minutes' },
  { value: 60,    label: 'Every hour' },
  { value: 360,   label: 'Every 6 hours' },
  { value: 1440,  label: 'Daily' },
  { value: 10080, label: 'Weekly' },
];

// How often a fresh full backup is taken (days).
const BACKUP_FREQ = [
  { value: 1,  label: 'Daily' },
  { value: 3,  label: 'Every 3 days' },
  { value: 7,  label: 'Weekly' },
  { value: 14, label: 'Bi-weekly' },
  { value: 30, label: 'Monthly' },
];

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function scoreTone(score) {
  if (score >= 90) return '#15803d';   // green
  if (score >= 60) return '#b45309';   // amber
  return '#b91c1c';                     // red
}

const card = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: 20,
};

const sectionTitle = {
  fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--ink-soft)', marginBottom: 14,
  display: 'flex', alignItems: 'center', gap: 8,
};

export default function BackupDashboard() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [dash, logRes, sett] = await Promise.all([
        getBackupDashboard(),
        getRecoveryLog(),
        getBackupSettings(),
      ]);
      setData(dash);
      setLog(logRes.log || []);
      setSettings(sett);
    } catch (e) {
      setError(e.message || 'Failed to load backup dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleVerifyNow = async () => {
    setVerifying(true);
    setError('');
    setFlash('');
    try {
      const res = await verifyNow();
      if (res.ok) {
        setFlash(res.recovered > 0
          ? `Verification complete — ${res.recovered} item(s) recovered.`
          : 'Verification complete — everything is protected.');
      } else {
        setError(res.error || 'Verification could not find a backup to scan.');
      }
      await refresh();
    } catch (e) {
      setError(e.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    setError('');
    setFlash('');
    try {
      const m = await runBackup();
      if (m.ok) setFlash('Backup completed.');
      else setError(m.hint || 'Backup created but not stored — enable a destination under Destinations.');
      await refresh();
    } catch (e) {
      setError(e.message || 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const patchSettings = async (patch) => {
    setSavingSettings(true);
    setError('');
    // Optimistic update so toggles feel instant.
    setSettings((s) => ({ ...s, ...patch }));
    try {
      const saved = await saveBackupSettings(patch);
      setSettings(saved);
      await refresh();
    } catch (e) {
      setError(e.message || 'Could not save settings');
      await refresh();
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--ink-soft)', padding: 8 }}>Loading backup status…</div>;
  }

  const health = data?.health || {};
  const score = health.score_pct ?? 0;
  const tone = scoreTone(score);
  const journal = data?.change_journal || [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Alerts ── */}
      {error && (
        <div style={{ ...card, borderColor: '#fca5a5', background: '#fef2f2', color: '#991b1b',
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}
      {flash && (
        <div style={{ ...card, borderColor: '#86efac', background: '#f0fdf4', color: '#166534',
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}

      {/* ── Top row: health score + headline facts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        <div style={{ ...card, textAlign: 'center', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Backup Health</div>
          <div style={{ fontSize: 56, fontWeight: 700, color: tone, lineHeight: 1.1 }}>{score}%</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: tone }}>{health.label || '—'}</div>
          {health.recovered_total > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              {health.recovered_total} item(s) recovered all-time
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <button
              onClick={handleBackupNow}
              disabled={backingUp}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13,
                opacity: backingUp ? 0.7 : 1,
              }}
            >
              <HardDrive size={15} style={{ animation: backingUp ? 'spin 1s linear infinite' : 'none' }} />
              {backingUp ? 'Backing up…' : 'Back up now'}
            </button>
            <button
              onClick={handleVerifyNow}
              disabled={verifying}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--surface)', color: 'var(--ink)', fontWeight: 600, fontSize: 13,
                border: '1px solid var(--line)', opacity: verifying ? 0.7 : 1,
              }}
            >
              <RefreshCw size={15} style={{ animation: verifying ? 'spin 1s linear infinite' : 'none' }} />
              {verifying ? 'Verifying…' : 'Verify now'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          <StatCard icon={<Clock size={18} />} label="Last Backup" value={fmtDateTime(health.last_backup_iso)} />
          <StatCard icon={<ShieldCheck size={18} />} label="Last Verification" value={fmtDateTime(health.last_verification_iso)} />
          <StatCard icon={<FileBox size={18} />} label="Files Protected"
            value={`${health.files_protected ?? 0} files`}
            sub={`${health.backup_sets ?? 0} backup set(s)`} />
          <StatCard icon={<Database size={18} />} label="Database Protected"
            value={health.database_protected ? 'Yes — verified' : 'Needs a verified backup'}
            tone={health.database_protected ? '#15803d' : '#b45309'} />
        </div>
      </div>

      {/* ── Health factors breakdown ── */}
      {Array.isArray(health.factors) && health.factors.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}><Activity size={15} /> Health Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {health.factors.map((f) => {
              const pct = f.max ? Math.round((f.points / f.max) * 100) : 0;
              return (
                <div key={f.name} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 90px',
                  alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                  <div style={{ height: 8, background: 'var(--bg-warm)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%',
                      background: pct >= 90 ? '#15803d' : pct >= 50 ? '#b45309' : '#b91c1c',
                      transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'right' }}>
                    {f.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Automation settings ── */}
      {settings && (
        <div style={card}>
          <div style={sectionTitle}><RefreshCw size={15} /> Automatic Protection</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Backup frequency
              </label>
              <select
                value={settings.interval_days ?? 7}
                disabled={savingSettings}
                onChange={(e) => patchSettings({ interval_days: Number(e.target.value) })}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8,
                  border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 14 }}
              >
                {BACKUP_FREQ.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                How often a fresh full backup is taken automatically.
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Keep copies
              </label>
              <input
                type="number" min="1" max="365"
                value={settings.keep ?? 30}
                disabled={savingSettings}
                onChange={(e) => setSettings((s) => ({ ...s, keep: e.target.value }))}
                onBlur={(e) => patchSettings({ keep: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8,
                  border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 14 }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                How many recent backups to retain per destination.
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Verification schedule
              </label>
              <select
                value={settings.verify_interval_minutes ?? 60}
                disabled={savingSettings}
                onChange={(e) => patchSettings({ verify_interval_minutes: Number(e.target.value) })}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8,
                  border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 14 }}
              >
                {VERIFY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                How often we scan backups and recover anything missing.
              </div>
            </div>

            <ToggleRow
              label="Auto-recover missing data"
              hint="Additively re-import anything found missing (never deletes or overwrites newer data)."
              checked={!!settings.auto_recover_enabled}
              disabled={savingSettings}
              onChange={(v) => patchSettings({ auto_recover_enabled: v })}
            />
            <ToggleRow
              label="Back up on every change"
              hint="Save a fresh backup shortly after each quotation, warranty or settings change."
              checked={!!settings.event_backup_enabled}
              disabled={savingSettings}
              onChange={(v) => patchSettings({ event_backup_enabled: v })}
            />
          </div>
        </div>
      )}

      {/* ── Recovery history ── */}
      <div style={card}>
        <div style={sectionTitle}><HardDrive size={15} /> Recovery History</div>
        {log.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', padding: '8px 0' }}>
            No recoveries yet. When data is restored, it will be logged here.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink-soft)', fontSize: 11.5,
                  textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={th}>Date</th>
                  <th style={th}>Item Type</th>
                  <th style={th}>Record ID</th>
                  <th style={th}>Action</th>
                  <th style={th}>Source</th>
                  <th style={th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={td}>{fmtDateTime(r.date)}</td>
                    <td style={td}>{r.item_type}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{r.record_id || '—'}</td>
                    <td style={td}>{r.action}</td>
                    <td style={{ ...td, color: 'var(--ink-soft)' }}>{r.source}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                        background: r.result === 'ok' ? '#f0fdf4' : '#fff7ed',
                        color: r.result === 'ok' ? '#166534' : '#9a3412',
                      }}>{r.result}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recent activity feed ── */}
      {journal.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}><Activity size={15} /> Recent Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {journal.slice(0, 10).map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--ink)' }}>
                <span style={{ color: 'var(--ink-soft)', minWidth: 150 }}>{fmtDateTime(c.iso)}</span>
                <span style={{ textTransform: 'capitalize' }}>
                  {c.item_type} {c.action}{c.record_id ? ` · ${c.record_id}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const th = { padding: '8px 10px', fontWeight: 600 };
const td = { padding: '9px 10px', verticalAlign: 'top' };

function StatCard({ icon, label, value, sub, tone }) {
  return (
    <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-soft)',
        fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: tone || 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{sub}</div>}
    </div>
  );
}

function ToggleRow({ label, hint, checked, disabled, onChange }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
        <span
          onClick={() => !disabled && onChange(!checked)}
          style={{
            width: 40, height: 22, borderRadius: 11, flexShrink: 0,
            background: checked ? 'var(--accent)' : 'var(--line)',
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: checked ? 20 : 2,
            width: 18, height: 18, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      </label>
      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>{hint}</div>
    </div>
  );
}
