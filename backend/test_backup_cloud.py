"""
Self-contained tests for the backup destinations + OAuth cloud engine.

Runnable directly (no pytest needed):
    .venv\\Scripts\\python.exe test_backup_cloud.py

Uses a throwaway DATA_DIR / DB and a fake httpx so nothing touches the real
database, the network, or any cloud account.
"""
import base64
import hashlib
import os
import tempfile
from pathlib import Path

# Point the app at throwaway data BEFORE importing the app modules.
_TMP = Path(tempfile.mkdtemp(prefix="nj_test_"))
os.environ["NJ_DATA_DIR"] = str(_TMP)
os.environ["NJ_DB_PATH"] = str(_TMP / "test.db")

import models  # noqa: E402
from database import engine  # noqa: E402
models.Base.metadata.create_all(bind=engine)

import backup_service  # noqa: E402
import cloud_backup  # noqa: E402

_passed = 0


def check(label, cond):
    global _passed
    assert cond, f"FAILED: {label}"
    _passed += 1
    print(f"  ok  {label}")


# ── 1. path guard (the junk-folder bug fix) ───────────────────────────────────
def test_path_guard():
    print("path guard:")
    ok, msg = backup_service._target_dir_ok("192.168.1.11")
    check("bare IP rejected", not ok)
    ok, _ = backup_service._target_dir_ok("relative\\sub")
    check("relative path rejected", not ok)
    ok, _ = backup_service._target_dir_ok("")
    check("empty rejected", not ok)
    d = tempfile.mkdtemp()
    ok, msg = backup_service._target_dir_ok(d)
    check("absolute temp dir accepted", ok and msg == "ok")


# ── 2. trimmed destinations ───────────────────────────────────────────────────
def test_targets():
    print("destinations:")
    keys = set(backup_service.default_state()["targets"].keys())
    check("only local/usb/gdrive/onedrive", keys == {"local", "usb", "gdrive", "onedrive"})
    check("nas/network/dropbox gone", not ({"nas", "network", "dropbox"} & keys))


# ── 3. PKCE correctness ───────────────────────────────────────────────────────
def test_pkce():
    print("pkce:")
    v, c = cloud_backup._pkce()
    expect = base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b"=").decode()
    check("challenge = base64url(sha256(verifier))", c == expect)
    check("no padding in verifier", "=" not in v)


# ── 4. config + token persistence ─────────────────────────────────────────────
def test_config_tokens():
    print("config + tokens:")
    cloud_backup.save_config("gdrive", "CID-123", "SECRET-xyz")
    st = cloud_backup.get_status("gdrive")
    check("gdrive configured after save", st["configured"] and not st["connected"])
    cloud_backup.save_config("onedrive", "MS-CID")
    st = cloud_backup.get_status("onedrive")
    check("onedrive configured w/o secret", st["configured"])
    # token roundtrip (DPAPI on Windows, plain fallback elsewhere)
    p = cloud_backup._provider("gdrive")
    p._store_tokens({"refresh_token": "R", "access_token": "A", "expires_at": 9e18, "email": "me@x.com"})
    check("token roundtrip", cloud_backup.is_connected("gdrive"))
    check("status shows email", cloud_backup.get_status("gdrive")["email"] == "me@x.com")
    p.disconnect()
    check("disconnect clears", not cloud_backup.is_connected("gdrive"))


# ── 5. make_backup to a real local folder ─────────────────────────────────────
def test_make_backup_local():
    print("make_backup (local):")
    dest = tempfile.mkdtemp(prefix="nj_dest_")
    state = backup_service.get_state()
    state["targets"]["local"] = {"enabled": True, "path": dest}
    state["targets"]["usb"] = {"enabled": False, "path": ""}
    state["targets"]["gdrive"] = {"enabled": False, "path": ""}
    state["targets"]["onedrive"] = {"enabled": False, "path": ""}
    backup_service.set_state(state)
    m = backup_service.make_backup("manual", force_catalog=True)
    check("manifest ok", m.get("ok") is True)
    check("local target ok", m["targets"]["local"] == "ok")
    check("db integrity ok", m["verify"]["db_integrity"] == "ok")
    files = list(Path(dest).glob("nj_backup_*.*"))
    check("backup files written", len(files) >= 3)


# ── 6. fake-httpx cloud upload (Google Drive + OneDrive) ──────────────────────
class _Resp:
    def __init__(self, status=200, js=None, headers=None):
        self.status_code = status
        self._js = js or {}
        self.headers = headers or {}
        self.text = str(js)

    def json(self):
        return self._js

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeCloud:
    """Minimal stateful fake of the Google Drive + Graph endpoints we call."""
    def __init__(self):
        self.files = {}        # id -> name
        self.folder = None
        self.sessions = {}     # location -> pending name
        self.n = 0

    def _nid(self, prefix="id"):
        self.n += 1
        return f"{prefix}{self.n}"

    def get(self, url, **kw):
        params = kw.get("params") or {}
        if "oauth2/v3/userinfo" in url or url.endswith("/me"):
            return _Resp(js={"email": "user@example.com", "userPrincipalName": "user@example.com"})
        if "drive/v3/files" in url:                       # Google
            q = params.get("q", "")
            if "in parents" in q:
                return _Resp(js={"files": [{"id": i, "name": n} for i, n in self.files.items()]})
            return _Resp(js={"files": ([{"id": self.folder, "name": "NJ India Backups"}] if self.folder else [])})
        if "/me/drive/root:/" in url:                     # Graph folder lookup
            return _Resp(js={"id": self.folder or "F"})
        if "/children" in url:                            # Graph list
            return _Resp(js={"value": [{"id": i, "name": n} for i, n in self.files.items()]})
        return _Resp(js={})

    def post(self, url, **kw):
        js = kw.get("json") or {}
        if url.endswith("oauth2.googleapis.com/token") or "oauth2/v2.0/token" in url:
            return _Resp(js={"access_token": "fresh", "expires_in": 3600})
        if "upload/drive/v3/files" in url:                # Google resumable session
            loc = f"http://session/{self._nid('s')}"
            self.sessions[loc] = js.get("name")
            return _Resp(headers={"Location": loc})
        if url.endswith("drive/v3/files"):                # Google create folder
            self.folder = "FOLDER"
            return _Resp(js={"id": self.folder})
        if "/root/children" in url:                       # Graph create folder
            if self.folder:
                return _Resp(status=409)
            self.folder = "F"
            return _Resp(status=201, js={"id": self.folder})
        if "createUploadSession" in url:                  # Graph large upload
            loc = f"http://gsession/{self._nid('g')}"
            return _Resp(js={"uploadUrl": loc})
        return _Resp(js={})

    def put(self, url, **kw):
        if url in self.sessions:                          # Google session PUT
            self.files[self._nid("g")] = self.sessions.pop(url)
            return _Resp(status=200, js={"id": "x"})
        if "/content" in url:                             # Graph small upload PUT
            name = url.split(":/")[1].rsplit(":/content", 1)[0]
            self.files[self._nid("o")] = name
            return _Resp(status=201, js={"id": "x"})
        return _Resp(status=202)                           # Graph chunked

    def delete(self, url, **kw):
        fid = url.rstrip("/").split("/")[-1]
        self.files.pop(fid, None)
        return _Resp(status=204)


def _make_files():
    d = Path(tempfile.mkdtemp(prefix="nj_set_"))
    stem = "nj_backup_20260603_120000"
    paths = []
    for ext in (".db", ".json", ".manifest.json"):
        p = d / f"{stem}{ext}"
        p.write_bytes(b"x" * 100)
        paths.append(p)
    return paths


def test_cloud_upload():
    print("cloud upload (fake httpx):")
    orig = cloud_backup.httpx
    cloud_backup.httpx = FakeCloud()
    try:
        # Google Drive
        cloud_backup.save_config("gdrive", "CID", "SEC")
        cloud_backup._provider("gdrive")._store_tokens(
            {"refresh_token": "R", "access_token": "A", "expires_at": 9e18})
        ok, msg = cloud_backup.upload_set("gdrive", _make_files(), keep=30)
        check("gdrive upload_set ok", ok and msg == "ok")
        check("gdrive files uploaded", len(cloud_backup.httpx.files) == 3)

        # OneDrive (small-file path)
        cloud_backup.httpx = FakeCloud()
        cloud_backup.save_config("onedrive", "MSID")
        cloud_backup._provider("onedrive")._store_tokens(
            {"refresh_token": "R", "access_token": "A", "expires_at": 9e18})
        ok, msg = cloud_backup.upload_set("onedrive", _make_files(), keep=30)
        check("onedrive upload_set ok", ok and msg == "ok")
        check("onedrive files uploaded", len(cloud_backup.httpx.files) == 3)

        # rotation: keep=1 should delete older sets
        fc = cloud_backup.httpx = FakeCloud()
        cloud_backup._provider("onedrive")._store_tokens(
            {"refresh_token": "R", "access_token": "A", "expires_at": 9e18})
        fc.folder = "F"
        fc.files = {"a1": "nj_backup_20260101_000000.db", "a2": "nj_backup_20260202_000000.db"}
        cloud_backup._provider("onedrive")._rotate(keep=1)
        check("rotation kept newest only", set(fc.files.values()) == {"nj_backup_20260202_000000.db"})
    finally:
        cloud_backup.httpx = orig


def test_token_refresh():
    print("token refresh:")
    fc = FakeCloud()
    orig = cloud_backup.httpx
    cloud_backup.httpx = fc
    try:
        cloud_backup.save_config("gdrive", "CID", "SEC")
        p = cloud_backup._provider("gdrive")
        p._store_tokens({"refresh_token": "R", "access_token": "old", "expires_at": 0})  # expired
        tok = p._access_token()
        check("expired token refreshed", tok == "fresh")
    finally:
        cloud_backup.httpx = orig


if __name__ == "__main__":
    test_path_guard()
    test_targets()
    test_pkce()
    test_config_tokens()
    test_make_backup_local()
    test_cloud_upload()
    test_token_refresh()
    print(f"\nALL TESTS PASSED ({_passed} checks)")
