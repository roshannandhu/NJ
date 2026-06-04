"""
Real OAuth cloud backup for the NJ India system — Google Drive and OneDrive.

Unlike the old "cloud" destinations (which only wrote into a desktop sync app's
local folder), this logs the user into their actual account with the standard
desktop OAuth flow (Authorization Code + PKCE, loopback redirect) and uploads
the backup set straight to the provider's API.

Design notes
------------
* No SDKs — just ``httpx`` + the standard library, so the embedded Python bundle
  stays small.
* Each provider needs a free developer-console registration (a *client id*, plus
  a *client secret* for Google's "Desktop app" client). The user pastes those in
  once; we persist them in ``DATA_DIR/cloud_config.json``.
* OAuth tokens live in ``DATA_DIR/cloud_tokens.json``, encrypted with Windows
  DPAPI (per-user) when available, plain JSON otherwise (e.g. on a test box).
* Backups go into a folder named "NJ India Backups" in the account's drive.

Public surface (used by routers/backup.py and backup_service.make_backup):
    PROVIDERS                      -> {"gdrive", "onedrive"}
    is_supported(name)             -> bool
    get_status(name)               -> {configured, connected, email}
    save_config(name, cid, secret) -> None
    connect(name)                  -> {ok, email?, error?}   (opens the browser)
    disconnect(name)               -> None
    is_connected(name)             -> bool
    upload_set(name, files, keep)  -> (ok: bool, message: str)
"""

import base64
import hashlib
import json
import secrets
import socket
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

try:                       # the only third-party dep; bundled via requirements.txt
    import httpx
except Exception:          # keep import working on a box without it (tests inject a fake)
    httpx = None

from database import DATA_DIR

_CONFIG_PATH = DATA_DIR / "cloud_config.json"
_TOKENS_PATH = DATA_DIR / "cloud_tokens.json"
_BACKUP_FOLDER = "NJ India Backups"

_io_lock = threading.Lock()


# ── tiny DPAPI wrapper (per-user encryption at rest; no extra dependency) ──────
def _dpapi(data: bytes, encrypt: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    crypt32 = ctypes.windll.crypt32
    fn = crypt32.CryptProtectData if encrypt else crypt32.CryptUnprotectData
    buf = ctypes.create_string_buffer(data, len(data))
    blob_in = _BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    blob_out = _BLOB()
    if not fn(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        raise OSError("DPAPI call failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


# ── config + token persistence ────────────────────────────────────────────────
def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _load_config() -> dict:
    return _read_json(_CONFIG_PATH)


def _save_config_dict(cfg: dict) -> None:
    _CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def _load_tokens() -> dict:
    raw = _read_json(_TOKENS_PATH)
    if not raw:
        return {}
    if raw.get("enc") and raw.get("data"):
        try:
            return json.loads(_dpapi(base64.b64decode(raw["data"]), encrypt=False).decode("utf-8"))
        except Exception:
            return {}
    return raw.get("data", raw) if isinstance(raw.get("data"), dict) else raw


def _save_tokens(tokens: dict) -> None:
    payload = json.dumps(tokens).encode("utf-8")
    try:
        enc = base64.b64encode(_dpapi(payload, encrypt=True)).decode("ascii")
        _TOKENS_PATH.write_text(json.dumps({"enc": True, "data": enc}), encoding="utf-8")
    except Exception:
        # DPAPI unavailable (non-Windows / test) — fall back to plain JSON.
        _TOKENS_PATH.write_text(json.dumps({"enc": False, "data": tokens}), encoding="utf-8")


# ── PKCE + loopback OAuth flow ─────────────────────────────────────────────────
def _pkce() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _free_loopback_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
    finally:
        s.close()


_DONE_HTML = (
    b"<!doctype html><html><head><meta charset='utf-8'><title>NJ India</title></head>"
    b"<body style='font-family:Segoe UI,system-ui,sans-serif;text-align:center;margin-top:80px'>"
    b"<h2>Connected to NJ India \xe2\x9c\x93</h2>"
    b"<p>You can close this tab and return to the app.</p></body></html>"
)


def _run_oauth(auth_endpoint, token_endpoint, client_id, client_secret,
               scope, extra_auth=None, timeout=180):
    """Open the system browser, capture the redirect on a loopback port, and
    exchange the code for tokens. Returns the provider's token JSON."""
    if httpx is None:
        raise RuntimeError("httpx is not installed")
    verifier, challenge = _pkce()
    port = _free_loopback_port()
    redirect_uri = f"http://localhost:{port}/"
    state = secrets.token_urlsafe(16)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
    }
    if extra_auth:
        params.update(extra_auth)
    auth_url = auth_endpoint + "?" + urllib.parse.urlencode(params)

    holder: dict = {}

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.urlparse(self.path).query
            qs = urllib.parse.parse_qs(q)
            if "code" in qs or "error" in qs:
                holder["code"] = qs.get("code", [None])[0]
                holder["state"] = qs.get("state", [None])[0]
                holder["error"] = qs.get("error", [None])[0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(_DONE_HTML)
            else:  # favicon and other stray hits
                self.send_response(204)
                self.end_headers()

        def log_message(self, *_a):  # silence console spam
            pass

    httpd = HTTPServer(("127.0.0.1", port), _Handler)
    httpd.timeout = 1
    try:
        webbrowser.open(auth_url)
        deadline = time.time() + timeout
        while "code" not in holder and "error" not in holder and time.time() < deadline:
            httpd.handle_request()
    finally:
        httpd.server_close()

    if holder.get("error"):
        raise RuntimeError(f"login failed: {holder['error']}")
    if not holder.get("code"):
        raise TimeoutError("login timed out — no response from the browser")
    if holder.get("state") != state:
        raise RuntimeError("state mismatch (possible CSRF) — login aborted")

    data = {
        "client_id": client_id,
        "code": holder["code"],
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": verifier,
    }
    if client_secret:
        data["client_secret"] = client_secret
    r = httpx.post(token_endpoint, data=data, timeout=30)
    r.raise_for_status()
    return r.json()


# ── provider base ──────────────────────────────────────────────────────────────
class _Provider:
    name = ""
    auth_endpoint = ""
    token_endpoint = ""
    scope = ""
    needs_secret = False
    extra_auth: dict = {}

    # ---- config / tokens (per provider) ----
    def config(self) -> dict:
        return _load_config().get(self.name, {})

    def is_configured(self) -> bool:
        c = self.config()
        return bool(c.get("client_id")) and (bool(c.get("client_secret")) or not self.needs_secret)

    def _tokens(self) -> dict:
        return _load_tokens().get(self.name, {})

    def _store_tokens(self, tok: dict) -> None:
        with _io_lock:
            allt = _load_tokens()
            allt[self.name] = tok
            _save_tokens(allt)

    def is_connected(self) -> bool:
        return bool(self._tokens().get("refresh_token"))

    def disconnect(self) -> None:
        self._revoke()
        with _io_lock:
            allt = _load_tokens()
            allt.pop(self.name, None)
            _save_tokens(allt)

    # ---- OAuth ----
    def connect(self) -> dict:
        if not self.is_configured():
            return {"ok": False, "error": "Not set up — paste the Client ID first."}
        c = self.config()
        tok = _run_oauth(
            self.auth_endpoint, self.token_endpoint,
            c["client_id"], c.get("client_secret") if self.needs_secret else None,
            self.scope, self.extra_auth,
        )
        record = {
            "access_token": tok.get("access_token"),
            "refresh_token": tok.get("refresh_token"),
            "expires_at": time.time() + int(tok.get("expires_in", 3600)) - 60,
        }
        if not record["refresh_token"]:
            return {"ok": False, "error": "No refresh token returned — try again and grant offline access."}
        self._store_tokens(record)
        try:
            record["email"] = self.account_email(record["access_token"])
            self._store_tokens(record)
        except Exception:
            pass
        return {"ok": True, "email": record.get("email", "")}

    def _access_token(self) -> str:
        tok = self._tokens()
        if not tok.get("refresh_token"):
            raise RuntimeError("not connected")
        if tok.get("access_token") and time.time() < tok.get("expires_at", 0):
            return tok["access_token"]
        c = self.config()
        data = {
            "client_id": c["client_id"],
            "refresh_token": tok["refresh_token"],
            "grant_type": "refresh_token",
        }
        if self.needs_secret and c.get("client_secret"):
            data["client_secret"] = c["client_secret"]
        if self.scope:
            data["scope"] = self.scope
        r = httpx.post(self.token_endpoint, data=data, timeout=30)
        r.raise_for_status()
        fresh = r.json()
        tok["access_token"] = fresh.get("access_token")
        tok["expires_at"] = time.time() + int(fresh.get("expires_in", 3600)) - 60
        if fresh.get("refresh_token"):     # Microsoft rotates refresh tokens
            tok["refresh_token"] = fresh["refresh_token"]
        self._store_tokens(tok)
        return tok["access_token"]

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._access_token()}"}

    # ---- provider-specific (overridden) ----
    def account_email(self, access_token: str) -> str: ...
    def ensure_folder(self) -> str: ...
    def upload_file(self, path: Path, folder_id: str) -> None: ...
    def list_sets(self) -> list[dict]: ...           # [{"stem","ids":[...]}]
    def delete_set(self, item) -> None: ...
    def _revoke(self) -> None: pass

    # ---- shared: upload a whole backup set + rotate ----
    def upload_set(self, files: list[Path], keep: int) -> tuple[bool, str]:
        folder_id = self.ensure_folder()
        for f in files:
            self.upload_file(Path(f), folder_id)
        try:
            self._rotate(keep)
        except Exception:
            pass  # rotation is best-effort; never fail a good upload over it
        return True, "ok"

    def _rotate(self, keep: int) -> None:
        sets = self.list_sets()  # newest-first by stem (timestamped names sort lexically)
        for s in sorted(sets, key=lambda x: x["stem"], reverse=True)[max(keep, 1):]:
            self.delete_set(s)


# ── Google Drive ────────────────────────────────────────────────────────────────
class GoogleDrive(_Provider):
    name = "gdrive"
    auth_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    token_endpoint = "https://oauth2.googleapis.com/token"
    scope = "https://www.googleapis.com/auth/drive.file openid email"
    needs_secret = True
    extra_auth = {"access_type": "offline", "prompt": "consent"}

    def account_email(self, access_token: str) -> str:
        r = httpx.get("https://www.googleapis.com/oauth2/v3/userinfo",
                      headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
        r.raise_for_status()
        return r.json().get("email", "")

    def ensure_folder(self) -> str:
        h = self._headers()
        q = ("mimeType='application/vnd.google-apps.folder' and trashed=false "
             f"and name='{_BACKUP_FOLDER}'")
        r = httpx.get("https://www.googleapis.com/drive/v3/files",
                      params={"q": q, "fields": "files(id,name)", "spaces": "drive"},
                      headers=h, timeout=30)
        r.raise_for_status()
        files = r.json().get("files", [])
        if files:
            return files[0]["id"]
        r = httpx.post("https://www.googleapis.com/drive/v3/files",
                       headers={**h, "Content-Type": "application/json"},
                       json={"name": _BACKUP_FOLDER,
                             "mimeType": "application/vnd.google-apps.folder"},
                       timeout=30)
        r.raise_for_status()
        return r.json()["id"]

    def upload_file(self, path: Path, folder_id: str) -> None:
        data = path.read_bytes()
        # Resumable upload: open a session, then PUT the bytes in one shot.
        meta = {"name": path.name, "parents": [folder_id]}
        r = httpx.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "resumable"},
            headers={**self._headers(), "Content-Type": "application/json; charset=UTF-8",
                     "X-Upload-Content-Length": str(len(data))},
            json=meta, timeout=30,
        )
        r.raise_for_status()
        session_url = r.headers["Location"]
        put = httpx.put(session_url, content=data,
                        headers={"Content-Length": str(len(data))}, timeout=600)
        put.raise_for_status()

    def list_sets(self) -> list[dict]:
        folder_id = self.ensure_folder()
        r = httpx.get("https://www.googleapis.com/drive/v3/files",
                      params={"q": f"'{folder_id}' in parents and trashed=false",
                              "fields": "files(id,name)", "pageSize": "1000"},
                      headers=self._headers(), timeout=30)
        r.raise_for_status()
        groups: dict[str, list[str]] = {}
        for f in r.json().get("files", []):
            stem = _set_stem(f["name"])
            groups.setdefault(stem, []).append(f["id"])
        return [{"stem": k, "ids": v} for k, v in groups.items()]

    def delete_set(self, item) -> None:
        for fid in item["ids"]:
            httpx.delete(f"https://www.googleapis.com/drive/v3/files/{fid}",
                         headers=self._headers(), timeout=30)

    def _revoke(self) -> None:
        tok = self._tokens()
        t = tok.get("refresh_token") or tok.get("access_token")
        if t and httpx is not None:
            try:
                httpx.post("https://oauth2.googleapis.com/revoke",
                           data={"token": t}, timeout=15)
            except Exception:
                pass


# ── OneDrive (Microsoft Graph) ───────────────────────────────────────────────────
class OneDrive(_Provider):
    name = "onedrive"
    auth_endpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    token_endpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    scope = "Files.ReadWrite offline_access openid email User.Read"
    needs_secret = False
    GRAPH = "https://graph.microsoft.com/v1.0"

    def account_email(self, access_token: str) -> str:
        r = httpx.get(f"{self.GRAPH}/me",
                      headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
        r.raise_for_status()
        j = r.json()
        return j.get("mail") or j.get("userPrincipalName", "")

    def ensure_folder(self) -> str:
        h = self._headers()
        r = httpx.post(f"{self.GRAPH}/me/drive/root/children",
                       headers={**h, "Content-Type": "application/json"},
                       json={"name": _BACKUP_FOLDER, "folder": {},
                             "@microsoft.graph.conflictBehavior": "fail"},
                       timeout=30)
        if r.status_code in (200, 201):
            return r.json()["id"]
        # 409 = already exists; fetch its id.
        r = httpx.get(f"{self.GRAPH}/me/drive/root:/{_BACKUP_FOLDER}",
                      headers=h, timeout=30)
        r.raise_for_status()
        return r.json()["id"]

    def upload_file(self, path: Path, folder_id: str) -> None:
        data = path.read_bytes()
        h = self._headers()
        small = 4 * 1024 * 1024
        if len(data) < small:
            r = httpx.put(
                f"{self.GRAPH}/me/drive/items/{folder_id}:/{path.name}:/content",
                headers={**h, "Content-Type": "application/octet-stream"},
                content=data, timeout=300,
            )
            r.raise_for_status()
            return
        # Large file: upload session, chunked (multiples of 320 KiB).
        r = httpx.post(
            f"{self.GRAPH}/me/drive/items/{folder_id}:/{path.name}:/createUploadSession",
            headers={**h, "Content-Type": "application/json"},
            json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
            timeout=30,
        )
        r.raise_for_status()
        upload_url = r.json()["uploadUrl"]
        chunk = 5 * 320 * 1024  # 1.6 MiB
        total = len(data)
        for start in range(0, total, chunk):
            end = min(start + chunk, total)
            seg = data[start:end]
            put = httpx.put(
                upload_url, content=seg,
                headers={"Content-Length": str(len(seg)),
                         "Content-Range": f"bytes {start}-{end - 1}/{total}"},
                timeout=600,
            )
            if put.status_code not in (200, 201, 202):
                put.raise_for_status()

    def list_sets(self) -> list[dict]:
        folder_id = self.ensure_folder()
        r = httpx.get(f"{self.GRAPH}/me/drive/items/{folder_id}/children",
                      params={"$select": "id,name", "$top": "999"},
                      headers=self._headers(), timeout=30)
        r.raise_for_status()
        groups: dict[str, list[str]] = {}
        for f in r.json().get("value", []):
            groups.setdefault(_set_stem(f["name"]), []).append(f["id"])
        return [{"stem": k, "ids": v} for k, v in groups.items()]

    def delete_set(self, item) -> None:
        for fid in item["ids"]:
            httpx.delete(f"{self.GRAPH}/me/drive/items/{fid}",
                         headers=self._headers(), timeout=30)


def _set_stem(filename: str) -> str:
    """Group the four files of one backup set (.db/.json/.uploads.zip/.manifest.json)
    under their shared timestamp stem (e.g. nj_backup_20260603_223257)."""
    for suffix in (".manifest.json", ".uploads.zip", ".json", ".db"):
        if filename.endswith(suffix):
            return filename[: -len(suffix)]
    return filename


# ── registry + public functions ───────────────────────────────────────────────
_REGISTRY = {p.name: p for p in (GoogleDrive(), OneDrive())}
PROVIDERS = tuple(_REGISTRY.keys())


def is_supported(name: str) -> bool:
    return name in _REGISTRY


def _provider(name: str) -> _Provider:
    p = _REGISTRY.get(name)
    if p is None:
        raise ValueError(f"unknown cloud provider: {name}")
    return p


def get_status(name: str) -> dict:
    p = _provider(name)
    connected = p.is_connected()
    return {
        "provider": name,
        "configured": p.is_configured(),
        "connected": connected,
        "email": (p._tokens().get("email", "") if connected else ""),
        "needs_secret": p.needs_secret,
    }


def save_config(name: str, client_id: str, client_secret: str = "") -> None:
    p = _provider(name)
    with _io_lock:
        cfg = _load_config()
        entry = {"client_id": (client_id or "").strip()}
        if p.needs_secret:
            entry["client_secret"] = (client_secret or "").strip()
        cfg[name] = entry
        _save_config_dict(cfg)


def connect(name: str) -> dict:
    return _provider(name).connect()


def disconnect(name: str) -> None:
    _provider(name).disconnect()


def is_connected(name: str) -> bool:
    return _provider(name).is_connected()


def upload_set(name: str, files, keep: int = 30) -> tuple[bool, str]:
    """Upload a backup set to a connected cloud account. Returns (ok, message);
    never raises — callers record the message in the backup manifest."""
    try:
        p = _provider(name)
        if not p.is_connected():
            return False, "not connected"
        return p.upload_set([Path(f) for f in files], keep)
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"
