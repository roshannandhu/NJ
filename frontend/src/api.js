const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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

export async function clearQuotations() {
  return req("/api/quotations", { method: "DELETE" });
}

export async function listWarranties() {
  return req("/api/warranties");
}

export async function createWarranty(w) {
  return req("/api/warranties", { method: "POST", body: JSON.stringify(w) });
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename || `warranty_${warrantyId}.docx`;
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

export async function restoreFromFile(file) {
  const fd = new FormData();
  fd.append("file", file);
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

export async function downloadCatalogBackup() {
  return _downloadFromEndpoint("/api/backup/catalog", "nj_catalog");
}

export async function restoreCatalogFromFile(file) {
  const fd = new FormData();
  fd.append("file", file);
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

export async function detectUsbDrives() {
  return req("/api/backup/usb-drives");
}

export async function testConnection(path) {
  return req("/api/backup/test-connection", { method: "POST", body: JSON.stringify({ path }) });
}

export async function listBackupFiles() {
  return req("/api/backup/list-files");
}

export async function restoreFromPath(path) {
  return req("/api/backup/restore-path", { method: "POST", body: JSON.stringify({ path }) });
}
