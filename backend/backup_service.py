"""
Data-safety / backup engine for the NJ India system.

Dependency-free (Python standard library only) so the seller's PC never needs
extra installs. Provides:

  * make_backup(reason)      — atomic SQLite copy + JSON export + manifest,
                               written to every configured & writable target,
                               verified, with rotation (keep last N).
  * restore_from_payload()   — hardened restore (snapshots current DB first).
  * compute_status() / compute_health() — data for the Settings UI.
  * start_scheduler() / run_startup_backup() — automatic daily + on-launch backups.

A backup "set" is three files sharing a timestamp stem:
    nj_backup_YYYYMMDD_HHMMSS.db            (atomic SQLite copy)
    nj_backup_YYYYMMDD_HHMMSS.json          (config + quotations + warranties)
    nj_backup_YYYYMMDD_HHMMSS.manifest.json (checksums, counts, verify results)
"""

import json
import shutil
import sqlite3
import tempfile
import threading
import time
import hashlib
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from database import DB_PATH, SessionLocal
from models import AppConfig, BackupState, Quotation, WarrantyCertificate

UPLOADS_DIR = Path(DB_PATH).resolve().parent / "uploads"

# ── tunables ──────────────────────────────────────────────────────────────
KEEP_DEFAULT = 30                 # backup sets to retain per target
INTERVAL_DAYS_DEFAULT = 7         # auto-backup every N days (user-configurable)
KEEP_PRE_RESTORE = 10             # pre-restore safety snapshots to retain
PREFIX = "nj_backup_"
PRE_RESTORE_PREFIX = "pre_restore_"
SCHEDULER_CHECK_SECONDS = 1800    # how often the scheduler thread wakes (30 min)
STARTUP_SKIP_IF_RECENT_SECONDS = 10 * 60  # avoid double backups on dev reloads

# Health thresholds (bytes) for the DB-size meter.
HEALTH_AMBER_BYTES = 50 * 1024 * 1024     # 50 MB
HEALTH_RED_BYTES = 200 * 1024 * 1024      # 200 MB
LOW_FREE_SPACE_BYTES = 500 * 1024 * 1024  # warn if a target has < 500 MB free

_backup_lock = threading.Lock()   # serialises whole backup operations
_state_lock = threading.Lock()    # serialises read-modify-write of BackupState
_scheduler_stop = threading.Event()
_scheduler_thread = None


# ── small helpers ───────────────────────────────────────────────────────────
def _now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _ts_stem():
    return PREFIX + datetime.now().strftime("%Y%m%d_%H%M%S")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def default_local_dir():
    return Path.home() / "Documents" / "NJ India Backups"


# ── persistent backup state (settings + log) ────────────────────────────────
def default_state():
    return {
        "targets": {
            "local": {"enabled": True, "path": str(default_local_dir())},
            "gdrive": {"enabled": False, "path": ""},
            "usb": {"enabled": False, "path": ""},
        },
        "keep": KEEP_DEFAULT,
        "interval_days": INTERVAL_DAYS_DEFAULT,
        "last_backup": {},        # reason -> iso
        "last_success_iso": None,
        "recent": [],             # list of manifest summaries (newest first)
        "catalog_changed_at": None,     # set whenever config is saved
        "last_catalog_backup_at": None, # set when uploads ZIP is included in backup
    }


def _merge_defaults(state):
    base = default_state()
    if not isinstance(state, dict):
        return base
    out = {**base, **state}
    out["targets"] = {**base["targets"], **(state.get("targets") or {})}
    for name, dflt in base["targets"].items():
        out["targets"][name] = {**dflt, **(out["targets"].get(name) or {})}
    out["last_backup"] = state.get("last_backup") or {}
    out["recent"] = state.get("recent") or []
    out.setdefault("keep", KEEP_DEFAULT)
    out.setdefault("interval_days", INTERVAL_DAYS_DEFAULT)
    out.setdefault("catalog_changed_at", None)
    out.setdefault("last_catalog_backup_at", None)
    return out


def get_state():
    db = SessionLocal()
    try:
        row = db.query(BackupState).filter(BackupState.id == 1).first()
        if row is None:
            state = default_state()
            db.add(BackupState(id=1, data=json.dumps(state)))
            db.commit()
            return state
        try:
            return _merge_defaults(json.loads(row.data))
        except Exception:
            return default_state()
    finally:
        db.close()


def set_state(state):
    db = SessionLocal()
    try:
        row = db.query(BackupState).filter(BackupState.id == 1).first()
        if row is None:
            row = BackupState(id=1, data="{}")
            db.add(row)
        row.data = json.dumps(state)
        db.commit()
    finally:
        db.close()


def update_settings(targets=None, keep=None, interval_days=None):
    """Persist destination settings from the UI. Returns the saved state."""
    with _state_lock:
        state = get_state()
        if targets:
            for name in ("local", "gdrive", "usb"):
                if name in targets and isinstance(targets[name], dict):
                    cur = state["targets"].get(name, {})
                    state["targets"][name] = {
                        "enabled": bool(targets[name].get("enabled", cur.get("enabled", False))),
                        "path": str(targets[name].get("path", cur.get("path", "")) or ""),
                    }
        if keep is not None:
            try:
                state["keep"] = max(1, min(365, int(keep)))
            except (TypeError, ValueError):
                pass
        if interval_days is not None:
            try:
                state["interval_days"] = max(1, min(365, int(interval_days)))
            except (TypeError, ValueError):
                pass
        set_state(state)
        return state


def mark_catalog_changed():
    """Call whenever catalog config is saved — triggers uploads ZIP on next backup."""
    with _state_lock:
        state = get_state()
        state["catalog_changed_at"] = _now_iso()
        set_state(state)


# ── payload (the JSON export — same shape as /api/backup & /api/restore) ─────
def build_payload():
    db = SessionLocal()
    try:
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        config = json.loads(cfg_row.data) if cfg_row else {}
        quotations = [json.loads(r.data) for r in db.query(Quotation).all()]
        warranties = [json.loads(r.data) for r in db.query(WarrantyCertificate).all()]
        return {
            "config": config,
            "quotations": quotations,
            "warranty_certificates": warranties,
        }
    finally:
        db.close()


def build_catalog_payload():
    db = SessionLocal()
    try:
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        return {"config": json.loads(cfg_row.data) if cfg_row else {}}
    finally:
        db.close()


def build_history_payload():
    """Quotations + warranties (history only, no catalog/config)."""
    db = SessionLocal()
    try:
        return {
            "quotations": [json.loads(r.data) for r in db.query(Quotation).all()],
            "warranty_certificates": [json.loads(r.data) for r in db.query(WarrantyCertificate).all()],
        }
    finally:
        db.close()


def _row_counts():
    db = SessionLocal()
    try:
        return {
            "app_config": db.query(AppConfig).count(),
            "quotations": db.query(Quotation).count(),
            "warranty_certificates": db.query(WarrantyCertificate).count(),
        }
    finally:
        db.close()


# ── low-level file operations ────────────────────────────────────────────────
def _atomic_db_copy(dst_path):
    """Consistent online copy of the live SQLite DB, safe even while the app is
    writing, using SQLite's backup API."""
    src = sqlite3.connect(f"file:{Path(DB_PATH).as_posix()}?mode=ro", uri=True)
    try:
        dst = sqlite3.connect(str(dst_path))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _verify_db_integrity(path):
    con = sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro", uri=True)
    try:
        r = con.execute("PRAGMA integrity_check").fetchone()
        return r[0] if r else "no-result"
    finally:
        con.close()


def _target_dir_ok(path):
    """(ok, message) — ensure a target directory exists and is writable."""
    if not path:
        return False, "no path set"
    try:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        probe = p / ".nj_write_test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True, "ok"
    except Exception as e:  # USB unplugged, Drive not mounted, permissions, …
        return False, f"{type(e).__name__}: {e}"


def _free_bytes(path):
    """Free bytes on the volume for `path`; walks up to the first existing
    parent. Returns None if the volume is unavailable."""
    try:
        p = Path(path)
        while not p.exists() and p.parent != p:
            p = p.parent
        if not p.exists():
            return None
        return shutil.disk_usage(str(p)).free
    except Exception:
        return None


def _base_stem(name):
    """Reduce any backup file name to its shared timestamp stem so all files of
    one set (.db, .json, .uploads.zip, .manifest.json) group together."""
    for suffix in (".manifest.json", ".uploads.zip"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return name.rsplit(".", 1)[0]


def _rotate(directory, keep, prefix=PREFIX):
    """Keep only the newest `keep` backup sets in `directory`; delete the rest."""
    try:
        d = Path(directory)
        stems = sorted(
            {_base_stem(f.name) for f in d.glob(prefix + "*")},
            reverse=True,
        )
        for stem in stems[keep:]:
            for f in d.glob(stem + "*"):
                try:
                    f.unlink()
                except Exception:
                    pass
    except Exception:
        pass


def _count_sets(directory, prefix=PREFIX):
    try:
        return len(list(Path(directory).glob(prefix + "*.db")))
    except Exception:
        return 0


def _folder_size(path):
    try:
        return sum(f.stat().st_size for f in Path(path).glob("nj_backup_*") if f.is_file())
    except Exception:
        return 0


def _uploads_file_count():
    try:
        return sum(1 for f in UPLOADS_DIR.iterdir() if f.is_file())
    except Exception:
        return 0


def _zip_uploads(dest_path):
    """Zip the uploads/ directory into dest_path. Returns (file_count, zip_bytes)."""
    count = 0
    with zipfile.ZipFile(dest_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        if UPLOADS_DIR.exists():
            for f in sorted(UPLOADS_DIR.iterdir()):
                if f.is_file():
                    zf.write(f, f.name)
                    count += 1
    return count, dest_path.stat().st_size


def restore_uploads_from_zip(zip_path):
    """Extract a uploads zip back into UPLOADS_DIR. Returns restored file count."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            zf.extract(name, UPLOADS_DIR)
            count += 1
    return count


# ── the main backup operation ────────────────────────────────────────────────
def make_backup(reason="manual", force_catalog=False):
    """Create + verify a backup set and copy it to every enabled, writable
    target. Never raises: returns a manifest dict (with ``ok`` flag).

    force_catalog=True always includes the uploads ZIP (used for manual backups).
    When False, uploads are only zipped if catalog changed since last catalog backup.
    """
    with _backup_lock:
        state = get_state()
        keep = int(state.get("keep", KEEP_DEFAULT))
        stem = _ts_stem()
        manifest = {
            "stem": stem,
            "reason": reason,
            "created_iso": _now_iso(),
            "db_bytes": None,
            "rows": {},
            "sha256": {},
            "verify": {},
            "targets": {},
            "ok": False,
        }

        tmpdir = Path(tempfile.mkdtemp(prefix="nj_bk_"))
        try:
            tmp_db = tmpdir / f"{stem}.db"
            tmp_json = tmpdir / f"{stem}.json"
            tmp_uploads = tmpdir / f"{stem}.uploads.zip"
            tmp_manifest = tmpdir / f"{stem}.manifest.json"

            # 1) build artifacts
            _atomic_db_copy(tmp_db)
            payload = build_payload()
            tmp_json.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            # Only zip uploads when catalog changed since last catalog backup,
            # or when forced (manual backup).
            cat_changed = state.get("catalog_changed_at")
            last_cat_bk = state.get("last_catalog_backup_at")
            catalog_needs_backup = force_catalog or (
                cat_changed is None or
                last_cat_bk is None or
                cat_changed > last_cat_bk
            )
            if catalog_needs_backup:
                uploads_count, uploads_bytes = _zip_uploads(tmp_uploads)
            else:
                uploads_count, uploads_bytes = 0, 0

            manifest["rows"] = _row_counts()
            manifest["db_bytes"] = tmp_db.stat().st_size
            manifest["uploads_count"] = uploads_count
            manifest["uploads_bytes"] = uploads_bytes
            manifest["sha256"]["db"] = _sha256(tmp_db)
            manifest["sha256"]["json"] = _sha256(tmp_json)

            # 2) verify the artifacts we just wrote
            integrity = _verify_db_integrity(tmp_db)
            try:
                json.loads(tmp_json.read_text(encoding="utf-8"))
                json_ok = True
            except Exception:
                json_ok = False
            manifest["verify"] = {
                "db_integrity": integrity,
                "db_hash_match": _sha256(tmp_db) == manifest["sha256"]["db"],
                "json_parse": json_ok,
            }
            verified = integrity == "ok" and json_ok

            tmp_manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

            # 3) fan out to every enabled target
            any_target = False
            for name, cfg in state["targets"].items():
                if not cfg.get("enabled"):
                    manifest["targets"][name] = "disabled"
                    continue
                ok, msg = _target_dir_ok(cfg.get("path", ""))
                if not ok:
                    manifest["targets"][name] = f"unavailable ({msg})"
                    continue
                try:
                    dest = Path(cfg["path"])
                    shutil.copy2(tmp_db, dest / tmp_db.name)
                    shutil.copy2(tmp_json, dest / tmp_json.name)
                    if uploads_count > 0:
                        shutil.copy2(tmp_uploads, dest / tmp_uploads.name)
                    shutil.copy2(tmp_manifest, dest / tmp_manifest.name)
                    _rotate(dest, keep)
                    manifest["targets"][name] = "ok"
                    any_target = True
                except Exception as e:
                    manifest["targets"][name] = f"error ({type(e).__name__}: {e})"

            manifest["ok"] = verified and any_target

            # 4) record in state. Re-read under the state lock and update only the
            #    log fields, so we never clobber destination settings the user may
            #    have changed while this (possibly long) backup was running.
            summary = {
                "stem": stem,
                "reason": reason,
                "created_iso": manifest["created_iso"],
                "db_bytes": manifest["db_bytes"],
                "uploads_count": manifest["uploads_count"],
                "uploads_bytes": manifest["uploads_bytes"],
                "rows": manifest["rows"],
                "verify": manifest["verify"],
                "targets": manifest["targets"],
                "ok": manifest["ok"],
            }
            with _state_lock:
                latest = get_state()
                latest["last_backup"][reason] = manifest["created_iso"]
                if manifest["ok"]:
                    latest["last_success_iso"] = manifest["created_iso"]
                    if catalog_needs_backup and uploads_count > 0:
                        latest["last_catalog_backup_at"] = manifest["created_iso"]
                latest["recent"] = ([summary] + latest.get("recent", []))[:20]
                set_state(latest)
            return manifest
        except Exception as e:
            manifest["error"] = f"{type(e).__name__}: {e}"
            return manifest
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)


def make_backup_safe(reason):
    try:
        return make_backup(reason)
    except Exception:
        return {"ok": False, "reason": reason}


# ── restore (hardened) ───────────────────────────────────────────────────────
def snapshot_pre_restore():
    """Snapshot the current DB before a destructive restore, so a bad restore
    is itself recoverable. Written to the local target (best effort)."""
    state = get_state()
    local = state["targets"].get("local", {})
    path = local.get("path") or str(default_local_dir())
    ok, _ = _target_dir_ok(path)
    if not ok:
        return None
    stem = PRE_RESTORE_PREFIX + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = Path(path)
    try:
        _atomic_db_copy(dest / f"{stem}.db")
        payload = build_payload()
        (dest / f"{stem}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        _rotate(dest, KEEP_PRE_RESTORE, prefix=PRE_RESTORE_PREFIX)
        return str(dest / f"{stem}.db")
    except Exception:
        return None


def restore_from_payload(payload):
    """Replace all data from a backup payload. Snapshots first, validates, and
    only commits if every insert succeeds. Returns a summary dict."""
    if not isinstance(payload, dict):
        raise ValueError("Backup payload must be a JSON object")
    quotations = payload.get("quotations", [])
    warranties = payload.get("warranty_certificates", [])
    if not isinstance(quotations, list) or not isinstance(warranties, list):
        raise ValueError("Backup payload is malformed (quotations/warranties must be lists)")

    snap = snapshot_pre_restore()

    db = SessionLocal()
    try:
        # Only overwrite config when it is explicitly present AND non-empty.
        # History-only backups have no "config" key — skipping prevents wiping
        # classes, varieties and image paths. An empty {} config (corrupted
        # or old-format backup) is also rejected to prevent data loss.
        if "config" in payload and payload["config"]:
            cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
            if cfg_row is None:
                cfg_row = AppConfig(id=1)
                db.add(cfg_row)
            cfg_row.data = json.dumps(payload["config"])

        db.query(Quotation).delete()
        for q in quotations:
            db.add(Quotation(
                id=q.get("id", ""),
                customer_name=(q.get("customer") or {}).get("name", ""),
                grand_total=q.get("grandTotal", 0),
                date=q.get("date", ""),
                data=json.dumps(q),
            ))

        db.query(WarrantyCertificate).delete()
        for w in warranties:
            db.add(WarrantyCertificate(
                id=w.get("id", ""),
                quotation_id=w.get("quotationId", ""),
                customer_name=(w.get("customer") or {}).get("name", ""),
                date=w.get("date", ""),
                data=json.dumps(w),
            ))

        db.commit()
        return {
            "status": "restored",
            "pre_restore_snapshot": snap,
            "counts": {
                "quotations": len(quotations),
                "warranty_certificates": len(warranties),
            },
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def restore_catalog_payload(payload):
    """Restore only the config (classes, varieties, tools, settings) from a
    catalog backup payload. Quotations and warranties are NOT touched."""
    if not isinstance(payload, dict):
        raise ValueError("Catalog backup must be a JSON object")
    cfg = payload.get("config")
    if cfg is None:
        raise ValueError("Invalid catalog backup: 'config' key missing")

    snap = snapshot_pre_restore()

    db = SessionLocal()
    try:
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        if cfg_row is None:
            cfg_row = AppConfig(id=1)
            db.add(cfg_row)
        cfg_row.data = json.dumps(cfg)
        db.commit()
        return {
            "status": "catalog_restored",
            "pre_restore_snapshot": snap,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── status / health for the UI ───────────────────────────────────────────────
def _days_since(iso):
    if not iso:
        return None
    try:
        then = datetime.fromisoformat(iso)
        now = datetime.now(then.tzinfo) if then.tzinfo else datetime.now()
        return (now - then).total_seconds() / 86400.0
    except Exception:
        return None


def compute_status():
    state = get_state()
    targets = {}
    for name, cfg in state["targets"].items():
        path = cfg.get("path", "")
        avail, msg = (False, "no path set")
        if path:
            avail, msg = _target_dir_ok(path)
        targets[name] = {
            "enabled": bool(cfg.get("enabled")),
            "path": path,
            "available": avail,
            "message": msg,
            "free_bytes": _free_bytes(path) if path else None,
            "backup_count": _count_sets(path) if (path and avail) else 0,
            "folder_size_bytes": _folder_size(path) if (path and avail) else 0,
        }
    days = _days_since(state.get("last_success_iso"))
    interval = int(state.get("interval_days", INTERVAL_DAYS_DEFAULT))
    return {
        "last_success_iso": state.get("last_success_iso"),
        "last_backup": state.get("last_backup", {}),
        "days_since_last_backup": days,
        "needs_backup_reminder": (days is None) or (days >= interval),
        "keep": state.get("keep", KEEP_DEFAULT),
        "interval_days": interval,
        "targets": targets,
        "recent": state.get("recent", [])[:10],
    }


def compute_health():
    db_bytes = Path(DB_PATH).stat().st_size if Path(DB_PATH).exists() else 0
    db = SessionLocal()
    try:
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        config_bytes = len(cfg_row.data.encode("utf-8")) if cfg_row else 0
        counts = {
            "quotations": db.query(Quotation).count(),
            "warranty_certificates": db.query(WarrantyCertificate).count(),
        }
    finally:
        db.close()

    if db_bytes >= HEALTH_RED_BYTES:
        level = "red"
    elif db_bytes >= HEALTH_AMBER_BYTES:
        level = "amber"
    else:
        level = "green"

    warnings = []
    state = get_state()
    for name, cfg in state["targets"].items():
        if not cfg.get("enabled") or not cfg.get("path"):
            continue
        free = _free_bytes(cfg["path"])
        if free is None:
            warnings.append(f"{name}: destination unavailable")
        elif free < LOW_FREE_SPACE_BYTES:
            warnings.append(f"{name}: low free space ({free // (1024*1024)} MB)")

    if level == "amber":
        warnings.append("Database is getting large — keep cloud + USB backups current.")
    if level == "red":
        warnings.append("Database is very large — back up now and consider archiving old records.")

    return {
        "db_bytes": db_bytes,
        "config_bytes": config_bytes,
        "counts": counts,
        "level": level,
        "amber_bytes": HEALTH_AMBER_BYTES,
        "red_bytes": HEALTH_RED_BYTES,
        "warnings": warnings,
    }


# ── scheduler (stdlib threads, no extra deps) ────────────────────────────────
def run_startup_backup():
    """Snapshot once per launch, in a background thread. Skips if a backup ran
    very recently (avoids spamming on dev auto-reload)."""
    def _job():
        try:
            state = get_state()
            last = _days_since(state.get("last_success_iso"))
            if last is not None and last * 86400.0 < STARTUP_SKIP_IF_RECENT_SECONDS:
                return
            make_backup_safe("startup")
        except Exception:
            pass
    threading.Thread(target=_job, name="nj-startup-backup", daemon=True).start()


def _scheduler_loop():
    # Give the startup backup a moment to land so we don't double-backup at launch.
    _scheduler_stop.wait(15)
    while not _scheduler_stop.is_set():
        try:
            state = get_state()
            interval_secs = int(state.get("interval_days", INTERVAL_DAYS_DEFAULT)) * 86400
            secs = _days_since(state.get("last_success_iso"))
            due = (secs is None) or (secs * 86400.0 >= interval_secs)
            if due:
                make_backup_safe("daily")
        except Exception:
            pass
        _scheduler_stop.wait(SCHEDULER_CHECK_SECONDS)


def start_scheduler():
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        return
    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(
        target=_scheduler_loop, name="nj-daily-backup", daemon=True
    )
    _scheduler_thread.start()


def stop_scheduler():
    _scheduler_stop.set()
