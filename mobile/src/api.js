// Cloud API client for the phone app. Talks to the SAME FastAPI backend the PC
// uses, so data stays in sync automatically (one database). The server URL is
// configurable (entered on the login screen) because the cloud address isn't
// fixed yet; the auth token is persisted so the user stays logged in.

import AsyncStorage from '@react-native-async-storage/async-storage';

const URL_KEY = 'nj_server_url';
const TOKEN_KEY = 'nj_token';

let _baseUrl = '';
let _token = '';

export async function loadSession() {
  _baseUrl = (await AsyncStorage.getItem(URL_KEY)) || '';
  _token = (await AsyncStorage.getItem(TOKEN_KEY)) || '';
  return { baseUrl: _baseUrl, token: _token };
}

export function getBaseUrl() { return _baseUrl; }
export async function setBaseUrl(url) {
  _baseUrl = (url || '').trim().replace(/\/+$/, ''); // strip trailing slashes
  await AsyncStorage.setItem(URL_KEY, _baseUrl);
}

export function getToken() { return _token; }
export async function setToken(token) {
  _token = token || '';
  if (_token) await AsyncStorage.setItem(TOKEN_KEY, _token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function req(path, opts = {}) {
  if (!_baseUrl) throw new Error('No server URL configured');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (_token) headers.Authorization = `Bearer ${_token}`;
  const res = await fetch(`${_baseUrl}${path}`, { ...opts, headers });
  if (res.status === 401) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(`API ${opts.method || 'GET'} ${path} → ${res.status}`);
  return res.json();
}

// ── Auth ──
export async function login(username, password) {
  const out = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (out && out.token) await setToken(out.token);
  return out;
}
export function getMe() { return req('/api/auth/me'); }

// ── Data ──
export function getConfig() { return req('/api/config'); }
export function listQuotations() { return req('/api/quotations'); }
export function listWarranties() { return req('/api/warranties'); }
export function getQuotation(id) { return req(`/api/quotations/${encodeURIComponent(id)}`); }
export function getWarranty(id) { return req(`/api/warranties/${encodeURIComponent(id)}`); }

// ── Live sync heartbeat (same revision counter the PC polls) ──
export function getSyncVersion() { return req('/api/sync/version'); }

// Reachability probe used by the login screen (works before auth too).
export async function ping(baseUrl) {
  const base = (baseUrl || _baseUrl || '').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/health`, { method: 'GET' });
  return res.ok;
}
