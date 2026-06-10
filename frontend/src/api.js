// In the packaged desktop app the SPA is served BY the FastAPI backend, so the
// API lives at the same origin (whatever port run_app.py picked). Only in Vite
// dev (separate port) do we point at the fixed backend port.
const BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : window.location.origin);

// Same-origin base used by non-api.js modules (e.g. share.js) that need to hit
// the backend directly.
export const API_BASE = BASE;

export function mediaUrl(url) {
  if (!url) return "";
  if (/^(data:|blob:|https?:\/\/)/i.test(url)) return url;
  if (url.startsWith("/")) return `${BASE}${url}`;
  return url;
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${opts.method || "GET"} ${path} → ${res.status}`);
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
  const res = await fetch(`${BASE}/api/warranties/${encodeURIComponent(warrantyId)}/docx`, {
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
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd });
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
  const res = await fetch(`${BASE}/api/backup/restore-file`, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Restore failed: ${res.status}`);
  return body;
}

async function _downloadFromEndpoint(endpoint, fallbackPrefix) {
  const res = await fetch(`${BASE}${endpoint}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `${fallbackPrefix}_${Date.now()}.json`;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return filename;
    } catch (err) {
      if (err.name === 'AbortError') return filename;
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
  return _downloadFromEndpoint("/api/backup", "nj_backup");
}

// Fetch the full backup as a Blob (for the Share feature). Returns { blob, filename }.
export async function fetchBackupBlob() {
  const res = await fetch(`${BASE}/api/backup`);
  if (!res.ok) throw new Error(`Backup failed: ${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  return { blob, filename: match ? match[1] : `nj_backup_${Date.now()}.zip` };
}

export async function downloadCatalogBackup() {
  return _downloadFromEndpoint("/api/backup/catalog", "nj_catalog");
}

export async function restoreCatalogFromFile(file, mode = "merge") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  const res = await fetch(`${BASE}/api/backup/restore-catalog`, { method: "POST", body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Restore failed: ${res.status}`);
  return body;
}

export async function downloadHistoryBackup() {
  return _downloadFromEndpoint("/api/backup/history", "nj_history");
}

export async function getUploadsInfo() {
  return req("/api/backup/uploads-info");
}

export async function downloadUploadsBackup() {
  const res = await fetch(`${BASE}/api/backup/uploads`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `nj_uploads_${Date.now()}.zip`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return filename;
    } catch (err) {
      if (err.name === 'AbortError') return filename;
    }
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
  const res = await fetch(`${BASE}/api/backup/restore-uploads`, { method: "POST", body: fd });
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

// Open the OS "choose folder" dialog (desktop app only). Returns
// { available, path? , cancelled? }. In a plain browser available is false.
export async function chooseFolder(current) {
  return req("/api/backup/choose-folder", { method: "POST", body: JSON.stringify({ current: current || "" }) });
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
