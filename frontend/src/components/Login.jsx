import React, { useState } from 'react';
import { LogIn } from 'lucide-react';

// Cloud login screen. Shown only when the backend reports auth_required && not
// authenticated (i.e. the deployed/cloud app). The local desktop app never sees
// this because auth is disabled there.
export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password || busy) return;
    setBusy(true);
    setError('');
    try {
      await onLogin(username.trim(), password);
    } catch {
      setError('Invalid username or password');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <div style={{ background: 'var(--surface)', padding: 40, borderRadius: 8, border: '1px solid var(--line)', textAlign: 'center', width: 360, boxSizing: 'border-box' }}>
        <LogIn size={32} style={{ margin: '0 auto 16px', color: 'var(--ink)' }} />
        <h2 style={{ fontSize: 22, marginBottom: 6, fontWeight: 600 }}>NJ India System</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 24, lineHeight: 1.4 }}>Sign in to access your quotations and warranties.</p>

        <input
          type="text"
          value={username}
          onChange={e => { setUsername(e.target.value); setError(''); }}
          placeholder="Username"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: 15, border: '1px solid var(--line)', borderRadius: 6, marginBottom: 12, outline: 'none' }}
        />
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder="Password"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: 15, border: `1px solid ${error ? 'red' : 'var(--line)'}`, borderRadius: 6, marginBottom: 16, outline: 'none' }}
        />

        <button
          onClick={submit}
          disabled={busy || !username || !password}
          style={{ width: '100%', padding: '12px', background: 'var(--ink)', color: 'white', borderRadius: 6, fontWeight: 600, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: (busy || !username || !password) ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        {error && <div style={{ color: 'red', fontSize: 12, marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
