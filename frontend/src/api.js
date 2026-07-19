// In the packaged desktop app the SPA is served BY the FastAPI backend, so the
// API lives at the same origin (whatever port run_app.py picked). Only in Vite
// dev (separate port) do we point at the fixed backend port.
const BASE = import.meta.env.VITE_API_URL || window.location.origin;

// True only in the Windows desktop shell (run_app.py REMOTE mode): the SPA is
// served from http://127.0.0.1:PORT. Capacitor uses http://localhost (no
// 127.0.0.1), so this stays false on Android.
const _localDesktopShell = /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(window.location.origin);

// Same-origin base used by non-api.js modules (e.g. share.js) that need to hit
// the backend directly.
export const API_BASE = BASE;

export function mediaUrl(url) {
  if (!url) return "";
  const value = String(url).trim();
  if (/^(data:|blob:)/i.test(value)) return value;

  // URL() safely percent-encodes the spaces and punctuation found in imported
  // WhatsApp filenames. Also repair old absolute upload URLs with a foreign host
  // (loopback, LAN IPs like 192.168.x.x) that are unreachable from phones/APK.
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const baseHost = (() => { try { return new URL(BASE).hostname; } catch { return ""; } })();
      if (parsed.hostname !== baseHost && parsed.pathname.startsWith("/uploads/")) {
        // In the Windows desktop shell, route through the local server so it can
        // try local files before proxying to EC2.
        const target = _localDesktopShell ? window.location.origin : BASE;
        return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, `${target}/`).href;
      }
      return parsed.href;
    } catch {
      return value;
    }
  }

  // Older catalogue records contain both "/uploads/x" and "uploads/x".
  const path = value.startsWith("/") ? value : `/${value}`;
  // In the Windows desktop shell, route /uploads/ through the local server
  // (run_app.py REMOTE mode serves local files first, then proxies to EC2).
  const base = (_localDesktopShell && path.startsWith('/uploads/')) ? window.location.origin : BASE;
  try {
    return new URL(path, `${base}/`).href;
  } catch {
    return `${base}${path}`;
  }
}

// Same as mediaUrl but appends ?cors=1 to force a fresh CORS request,
// preventing cache collisions if the image was previously loaded in no-cors mode (e.g. CSS background).
export function corsMediaUrl(url) {
  const resolved = mediaUrl(url);
  if (!resolved || resolved.startsWith("data:") || resolved.startsWith("blob:")) return resolved;
  try {
    const u = new URL(resolved);
    u.searchParams.set("cors", "1");
    return u.href;
  } catch {
    return resolved;
  }
}

// A catalogue request can fail once while the small EC2 service is restarting
// or a mobile connection changes. Browsers do not automatically retry a broken
// <img>, so retry twice with a cache-busting query instead of leaving a broken
// tile until the whole application is reloaded.
export function retryMediaImage(event) {
  const image = event.currentTarget;
  const attempt = Number(image.dataset.mediaRetry || 0);
  const current = image.currentSrc || image.src || "";
  if (attempt >= 2) {
    const fallback = image.dataset.mediaFallback;
    if (fallback && fallback !== current) {
      delete image.dataset.mediaFallback;
      image.dataset.mediaRetry = "0";
      image.src = fallback;
    }
    return;
  }
  if (/^(data:|blob:)/i.test(current)) return;

  image.dataset.mediaRetry = String(attempt + 1);
  window.setTimeout(() => {
    if (!image.isConnected) return;
    try {
      const retryUrl = new URL(current, window.location.href);
      retryUrl.searchParams.set("nj_image_retry", String(attempt + 1));
      image.src = retryUrl.href;
    } catch {
      // The bounded retry is best-effort; preserve the browser's error state.
    }
  }, 500 * (attempt + 1));
}

async function fetchWithRetry(url, opts = {}, retries = 2) {
  try {
    const res = await fetch(url, opts);
    // Retry on common load balancer / keep-alive drop gateway errors
    if (!res.ok && res.status >= 502 && res.status <= 504) {
      throw new Error(`Server error ${res.status}`);
    }
    return res;
  } catch (err) {
    // A write may have committed before its response was interrupted. Retrying
    // it automatically can duplicate side effects/version bumps; UI flows keep
    // their stable id and let the user retry intentionally instead.
    const method = String(opts.method || "GET").toUpperCase();
    if (retries > 0 && (method === "GET" || method === "HEAD")) {
      await new Promise(r => setTimeout(r, 500));
      return fetchWithRetry(url, opts, retries - 1);
    }
    throw err;
  }
}

async function req(path, opts = {}) {
  const res = await fetchWithRetry(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : "";
    throw new Error(detail || `Server request failed (${res.status})`);
  }
  return res.json();
}

export async function getConfig() {
  return req("/api/config");
}

export async function saveConfig(cfg) {
  return req("/api/config", { method: "PUT", body: JSON.stringify(cfg) });
}

export async function listQuotations() {
  return req("/api/quotations");
}

export async function createQuotation(q) {
  return req("/api/quotations", { method: "POST", body: JSON.stringify(q) });
}

export async function deleteQuotation(qid) {
  return req(`/api/quotations/${encodeURIComponent(qid)}`, { method: "DELETE" });
}

export async function clearQuotations() {
  return req("/api/quotations", { method: "DELETE" });
}

export async function listWarranties() {
  return req("/api/warranties");
}

export async function createWarranty(w) {
  return req("/api/warranties", { method: "POST", body: JSON.stringify(w) });
}

export async function deleteWarranty(wid) {
  return req(`/api/warranties/${encodeURIComponent(wid)}`, { method: "DELETE" });
}

export async function clearWarranties() {
  return req("/api/warranties", { method: "DELETE" });
}

export async function downloadWarrantyDocx(warrantyId, warrantyData, filename) {
  const res = await fetchWithRetry(`${BASE}/api/warranties/${encodeURIComponent(warrantyId)}/docx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(warrantyData || {}),
  });
  if (!res.ok) throw new Error(`DOCX download failed: ${res.status}`);
  const blob = await res.blob();
  const dlFilename = filename || `warranty_${warrantyId}.docx`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: dlFilename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = dlFilename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetchWithRetry(`${BASE}/api/uploads`, { method: "POST", body: fd });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

// ── Backup & data-safety ────────────────────────────────────────────────────
export async function getBackupStatus() {
  return req("/api/backup/status");
}

export async function getBackupHealth() {
  return req("/api/backup/health");
}

export async function getBackupSettings() {
  return req("/api/backup/settings");
}

export async function saveBackupSettings(settings) {
  return req("/api/backup/settings", { method: "PUT", body: JSON.stringify(settings) });
}

export async function runBackup() {
  return req("/api/backup/run", { method: "POST" });
}

export async function restoreFromFile(file, mode = "merge") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  const res = await fetchWithRetry(`${BASE}/api/backup/restore-file`, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Restore failed: ${res.status}`);
  return body;
}

async function _downloadFromEndpoint(endpoint, fallbackPrefix, ext = '.zip') {
  // Open the Save dialog FIRST while the user-click gesture is still active.
  // Fetching first (the old order) takes several seconds and expires the gesture,
  // causing showSaveFilePicker to throw NotAllowedError and silently fall back to
  // a Downloads-folder blob download the user never sees.
  const suggestedName = `${fallbackPrefix}_${new Date().toISOString().slice(0, 10)}${ext}`;
  let fileHandle = null;
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({ suggestedName });
    } catch (err) {
      if (err.name === 'AbortError') return null; // user cancelled — stop here
      // picker unavailable / not allowed — fall through to blob download after fetch
    }
  }

  // Fetch the file — re-throw on error so callers can show a toast.
  const res = await fetchWithRetry(`${BASE}${endpoint}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : suggestedName;

  if (fileHandle) {
    let writable;
    try {
      writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return filename;
    } catch {
      // Write failed — close the stream cleanly then fall back to blob download.
      if (writable) {
        try { await writable.abort(); } catch { /* best-effort stream cleanup */ }
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  return filename;
}

export async function downloadBackup() {
  return _downloadFromEndpoint("/api/backup", "nj_backup", ".zip");
}

// Fetch the full backup as a Blob (for the Share feature). Returns { blob, filename }.
export async function fetchBackupBlob() {
  const res = await fetchWithRetry(`${BASE}/api/backup`);
  if (!res.ok) throw new Error(`Backup failed: ${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  return { blob, filename: match ? match[1] : `nj_backup_${Date.now()}.zip` };
}

export async function downloadCatalogBackup() {
  return _downloadFromEndpoint("/api/backup/catalog", "nj_catalog", ".zip");
}

export async function restoreCatalogFromFile(file, mode = "merge") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  const res = await fetchWithRetry(`${BASE}/api/backup/restore-catalog`, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Restore failed: ${res.status}`);
  return body;
}

export async function downloadHistoryBackup() {
  return _downloadFromEndpoint("/api/backup/history", "nj_history", ".json");
}

export async function getUploadsInfo() {
  return req("/api/backup/uploads-info");
}

export async function downloadUploadsBackup() {
  // Open Save dialog FIRST (user gesture is still active at this point).
  const suggestedName = `nj_uploads_${new Date().toISOString().slice(0, 10)}.zip`;
  let fileHandle = null;
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({ suggestedName });
    } catch (err) {
      if (err.name === 'AbortError') return suggestedName;
    }
  }

  const res = await fetchWithRetry(`${BASE}/api/backup/uploads`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : suggestedName;

  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return filename;
    } catch { /* write failed — fall through */ }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  return filename;
}

export async function restoreUploadsFromFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetchWithRetry(`${BASE}/api/backup/restore-uploads`, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Restore failed: ${res.status}`);
  return body;
}

export async function detectGdrivePath() {
  return req("/api/backup/detect-gdrive");
}

// Detect a cloud sync folder: provider = 'gdrive' | 'onedrive' | 'dropbox'.
export async function detectCloudPath(provider) {
  return req(`/api/backup/detect-cloud?provider=${encodeURIComponent(provider)}`);
}

export async function detectUsbDrives() {
  return req("/api/backup/usb-drives");
}

// In-app folder browser: list drive roots (empty path) or the subfolders of a
// path. The backend walks the real filesystem, so this works in both the desktop
// app and a browser. Returns { current, parent, dirs:[{name,path}], error? }.
export async function listDirs(path) {
  return req(`/api/backup/list-dirs?path=${encodeURIComponent(path || "")}`);
}

// Create a new subfolder while browsing. Returns { ok, path? , error? }.
export async function makeDir(parent, name) {
  return req("/api/backup/make-dir", { method: "POST", body: JSON.stringify({ parent, name }) });
}

export async function testConnection(path) {
  return req("/api/backup/test-connection", { method: "POST", body: JSON.stringify({ path }) });
}

// ── Cloud backup accounts (Google Drive / OneDrive — real OAuth login) ────────
export async function cloudStatus(provider) {
  return req(`/api/backup/cloud/${encodeURIComponent(provider)}/status`);
}
export async function saveCloudConfig(provider, clientId, clientSecret = "") {
  return req(`/api/backup/cloud/${encodeURIComponent(provider)}/config`, {
    method: "PUT", body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
}
// Opens the system browser and blocks on the backend until login finishes.
export async function cloudConnect(provider) {
  return req(`/api/backup/cloud/${encodeURIComponent(provider)}/connect`, { method: "POST" });
}
export async function cloudDisconnect(provider) {
  return req(`/api/backup/cloud/${encodeURIComponent(provider)}/disconnect`, { method: "POST" });
}

export async function listBackupFiles() {
  return req("/api/backup/list-files");
}

export async function restoreFromPath(path, mode = "merge") {
  return req("/api/backup/restore-path", { method: "POST", body: JSON.stringify({ path, mode }) });
}

// ── Intelligent recovery (scan a backup vs the live DB, restore only what's missing) ──
export async function recoveryBackups() {
  return req("/api/recovery/backups");
}
export async function recoveryScan(backupPath) {
  return req(`/api/recovery/scan${backupPath ? `?backup=${encodeURIComponent(backupPath)}` : ""}`);
}
export async function recoveryLast() {
  return req("/api/recovery/last");
}
export async function recoveryRecover(backup, selection) {
  return req("/api/recovery/recover", { method: "POST", body: JSON.stringify({ backup, selection }) });
}
export function recoveryReportUrl(backupPath) {
  return `${BASE}/api/recovery/report${backupPath ? `?backup=${encodeURIComponent(backupPath)}` : ""}`;
}

// ── Smart Backup Health Dashboard ────────────────────────────────────────────
export async function getBackupDashboard() {
  return req("/api/backup/dashboard");
}
export async function getRecoveryLog() {
  return req("/api/recovery/log");
}
// Run a verification + auto-recovery cycle right now.
export async function verifyNow() {
  return req("/api/backup/verify-now", { method: "POST" });
}
