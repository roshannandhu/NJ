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
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import hashlib
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from database import DB_PATH, DATA_DIR, SessionLocal
from models import AppConfig, BackupState, Quotation, WarrantyCertificate
import cloud_backup  # OAuth cloud destinations (Google Drive / OneDrive)

UPLOADS_DIR = DATA_DIR / "uploads"

# ── tunables ──────────────────────────────────────────────────────────────
KEEP_DEFAULT = 30                 # backup sets to retain per target
INTERVAL_DAYS_DEFAULT = 7         # auto-backup every N days (user-configurable)
KEEP_PRE_RESTORE = 10             # pre-restore safety snapshots to retain
PREFIX = "nj_backup_"
PRE_RESTORE_PREFIX = "pre_restore_"
SCHEDULER_CHECK_SECONDS = 1800    # how often the scheduler thread wakes (30 min)
STARTUP_SKIP_IF_RECENT_SECONDS = 10 * 60  # avoid double backups on dev reloads

# Event-backup debounce: coalesce a burst of edits into one backup so we never
# write a full set per keystroke. After the last change we wait QUIET_SECONDS of
# calm before snapshotting.
EVENT_QUIET_SECONDS = 8
EVENT_WORKER_TICK_SECONDS = 2
CHANGE_JOURNAL_CAP = 500          # recent change descriptors kept for the dashboard

# Scheduled verification: scan backups vs live data, auto-import what's missing.
VERIFY_INTERVAL_DEFAULT_MIN = 60  # default: every hour
VERIFY_INTERVALS_MIN = (15, 30, 60, 360, 1440, 10080)  # 15m/30m/1h/6h/daily/weekly
VERIFY_LOOP_TICK_SECONDS = 30
RECOVERY_LOG_CAP = 200

# Health thresholds (bytes) for the DB-size meter.
HEALTH_AMBER_BYTES = 50 * 1024 * 1024     # 50 MB
HEALTH_RED_BYTES = 200 * 1024 * 1024      # 200 MB
LOW_FREE_SPACE_BYTES = 500 * 1024 * 1024  # warn if a target has < 500 MB free

_backup_lock = threading.Lock()   # serialises whole backup operations
_state_lock = threading.Lock()    # serialises read-modify-write of BackupState
_scheduler_stop = threading.Event()
_scheduler_thread = None

# Event-driven backup worker (debounced).
_event_lock = threading.Lock()
_event_dirty_since = None          # wall-clock time of the last change, or None
_event_worker_stop = threading.Event()
_event_worker_thread = None

# Verification loop.
_verify_stop = threading.Event()
_verify_thread = None
_verify_lock = threading.Lock()    # serialises run_verification()


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
        # Destinations the app supports. Local Disk + USB are plain folders;
        # Google Drive and OneDrive are real OAuth cloud accounts (no "path" —
        # the connection lives in cloud_backup's token store). NAS / Network
        # Folder / Dropbox were removed: NAS/Network never actually networked
        # (they created junk local folders) and Dropbox went unused.
        "targets": {
            "local": {"enabled": True, "path": str(default_local_dir())},
            "usb": {"enabled": False, "path": ""},
            "gdrive": {"enabled": False, "path": ""},
            "onedrive": {"enabled": False, "path": ""},
        },
        "keep": KEEP_DEFAULT,
        "interval_days": INTERVAL_DAYS_DEFAULT,
        "last_backup": {},        # reason -> iso
        "last_success_iso": None,
        "recent": [],             # list of manifest summaries (newest first)
        "catalog_changed_at": None,     # set whenever config is saved
        "last_catalog_backup_at": None, # set when uploads ZIP is included in backup
        # ── Smart backup & recovery ──
        "event_backup_enabled": True,   # debounced backup on every data change
        "auto_recover_enabled": True,   # auto-import missing data at verification
        "verify_interval_minutes": VERIFY_INTERVAL_DEFAULT_MIN,
        "last_verification_iso": None,
        "recovery_log": [],             # newest-first {date,item_type,record_id,action,source,result}
        "change_journal": [],           # newest-first compact change descriptors
        "recovered_total": 0,           # cumulative count of items auto-recovered
    }


def _merge_defaults(state):
    base = default_state()
    if not isinstance(state, dict):
        return base
    out = {**base, **state}
    # Rebuild targets strictly from the known set so destinations we no longer
    # support (nas / network / dropbox) drop out of any old saved state instead
    # of lingering in the UI and status.
    saved_targets = state.get("targets") or {}
    out["targets"] = {}
    for name, dflt in base["targets"].items():
        out["targets"][name] = {**dflt, **(saved_targets.get(name) or {})}
    out["last_backup"] = state.get("last_backup") or {}
    out["recent"] = state.get("recent") or []
    out.setdefault("keep", KEEP_DEFAULT)
    out.setdefault("interval_days", INTERVAL_DAYS_DEFAULT)
    out.setdefault("catalog_changed_at", None)
    out.setdefault("last_catalog_backup_at", None)
    out.setdefault("event_backup_enabled", True)
    out.setdefault("auto_recover_enabled", True)
    out.setdefault("verify_interval_minutes", VERIFY_INTERVAL_DEFAULT_MIN)
    out.setdefault("last_verification_iso", None)
    out["recovery_log"] = state.get("recovery_log") or []
    out["change_journal"] = state.get("change_journal") or []
    out.setdefault("recovered_total", state.get("recovered_total", 0) or 0)
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


def update_settings(targets=None, keep=None, interval_days=None,
                    verify_interval_minutes=None, auto_recover_enabled=None,
                    event_backup_enabled=None):
    """Persist destination settings from the UI. Returns the saved state."""
    with _state_lock:
        state = get_state()
        if targets:
            # Persist every known destination — local, the three cloud sync
            # folders (gdrive/onedrive/dropbox), USB, NAS and network. Earlier
            # this loop only covered local/gdrive/usb, so enabling OneDrive,
            # Dropbox, NAS or Network in the UI silently did nothing.
            for name in default_state()["targets"]:
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
        if verify_interval_minutes is not None:
            try:
                v = int(verify_interval_minutes)
                # Snap to the nearest allowed interval so the UI can't persist a
                # value the dropdown doesn't offer.
                state["verify_interval_minutes"] = min(
                    VERIFY_INTERVALS_MIN, key=lambda x: abs(x - v)
                )
            except (TypeError, ValueError):
                pass
        if auto_recover_enabled is not None:
            state["auto_recover_enabled"] = bool(auto_recover_enabled)
        if event_backup_enabled is not None:
            state["event_backup_enabled"] = bool(event_backup_enabled)
        set_state(state)
        return state


def mark_catalog_changed():
    """Call whenever catalog config is saved — triggers uploads ZIP on next backup."""
    with _state_lock:
        state = get_state()
        state["catalog_changed_at"] = _now_iso()
        set_state(state)


def notify_change(item_type, action, record_id):
    """Record a data change and mark the DB dirty so the debounced event worker
    will snapshot it. Cheap and non-blocking — safe to call from request handlers.

    item_type: "quotation" | "warranty" | "catalogue"
    action:    "created" | "edited" | "deleted" | "cleared"
    record_id: the affected id (or None for bulk/config changes)
    """
    global _event_dirty_since
    entry = {
        "iso": _now_iso(),
        "item_type": item_type,
        "action": action,
        "record_id": record_id,
    }
    with _event_lock:
        _event_dirty_since = time.time()
    # Persist a compact descriptor for the dashboard "recent activity" feed.
    try:
        with _state_lock:
            state = get_state()
            state["change_journal"] = ([entry] + (state.get("change_journal") or []))[:CHANGE_JOURNAL_CAP]
            set_state(state)
    except Exception:
        pass


# ── payload (the JSON export — same shape as /api/backup & /api/restore) ─────
# Every payload carries a "kind" tag so a file is self-describing and a restore
# endpoint can tell whether it was handed a full / catalog / history backup.
KIND_FULL = "full"
KIND_CATALOG = "catalog"
KIND_HISTORY = "history"


def build_payload():
    db = SessionLocal()
    try:
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        config = json.loads(cfg_row.data) if cfg_row else {}
        quotations = [json.loads(r.data) for r in db.query(Quotation).all()]
        warranties = [json.loads(r.data) for r in db.query(WarrantyCertificate).all()]
        return {
            "kind": KIND_FULL,
            "config": config,
            "quotations": quotations,
            "warranty_certificates": warranties,
        }
    finally:
        db.close()


def build_catalog_payload():
    """Config only (company, settings, brands, classes, varieties, warranties).
    No quotations / warranty certificates — this is the catalogue, not history."""
    db = SessionLocal()
    try:
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        return {"kind": KIND_CATALOG, "config": json.loads(cfg_row.data) if cfg_row else {}}
    finally:
        db.close()


def build_history_payload():
    """Quotations + warranties (history only, no catalog/config)."""
    db = SessionLocal()
    try:
        return {
            "kind": KIND_HISTORY,
            "quotations": [json.loads(r.data) for r in db.query(Quotation).all()],
            "warranty_certificates": [json.loads(r.data) for r in db.query(WarrantyCertificate).all()],
        }
    finally:
        db.close()


# ── config merge/replace (shared by full-restore and catalog-restore) ────────
# The config blob holds five id-keyed lists (brands, classes, varieties,
# warranties) plus two scalar objects (company, settings). Earlier code merged
# only classes/varieties/warranties — it silently dropped the `brands` layer and
# overwrote company/settings wholesale, which could wipe a seller's customised
# company details when importing an old backup. This helper fixes both.
_CONFIG_LIST_KEYS = ("brands", "classes", "varieties", "warranties")


def _apply_config(cfg_row, new_cfg, mode):
    """Write new_cfg into cfg_row.data according to ``mode``.

    mode="replace": cfg_row becomes exactly new_cfg.
    mode="merge":   id-keyed lists are unioned (new overrides matching ids,
                    existing-only ids are kept); company/settings are shallow-
                    merged (new keys win, existing-only keys preserved).
    """
    if mode == "replace":
        cfg_row.data = json.dumps(new_cfg)
        return

    try:
        old_cfg = json.loads(cfg_row.data) if cfg_row.data else {}
    except Exception:
        old_cfg = {}

    for key in _CONFIG_LIST_KEYS:
        old_list = old_cfg.get(key, []) or []
        new_list = new_cfg.get(key, []) or []
        if not new_list:
            # Nothing to merge for this key — leave the existing list untouched.
            continue
        merged = {item.get("id"): item for item in old_list if isinstance(item, dict) and item.get("id")}
        for item in new_list:
            if isinstance(item, dict) and item.get("id"):
                merged[item["id"]] = item
        old_cfg[key] = list(merged.values())

    # company is a flat object — a shallow merge is correct.
    if "company" in new_cfg:
        if isinstance(new_cfg["company"], dict):
            base = old_cfg.get("company") if isinstance(old_cfg.get("company"), dict) else {}
            old_cfg["company"] = {**base, **new_cfg["company"]}
        else:
            old_cfg["company"] = new_cfg["company"]

    # settings holds NESTED structures (the `banks` list and the `classTerms`
    # object) that a plain shallow merge would clobber/drop — which is why bank
    # details and Terms & Conditions appeared "missing" after a catalogue restore.
    # Deep-merge them: union banks by id (the same rule used for the top-level
    # catalogue lists) and merge classTerms by key, so a restore reliably ADDS
    # banks + T&C and never wipes existing ones.
    if "settings" in new_cfg:
        if isinstance(new_cfg["settings"], dict):
            base = old_cfg.get("settings") if isinstance(old_cfg.get("settings"), dict) else {}
            new_settings = new_cfg["settings"]
            merged = {**base, **new_settings}

            old_banks = base.get("banks") if isinstance(base.get("banks"), list) else []
            new_banks = new_settings.get("banks") if isinstance(new_settings.get("banks"), list) else []
            if old_banks or new_banks:
                by_id = {b.get("id"): b for b in old_banks if isinstance(b, dict) and b.get("id")}
                for b in new_banks:
                    if isinstance(b, dict) and b.get("id"):
                        by_id[b["id"]] = b
                merged["banks"] = list(by_id.values())

            old_ct = base.get("classTerms") if isinstance(base.get("classTerms"), dict) else {}
            new_ct = new_settings.get("classTerms") if isinstance(new_settings.get("classTerms"), dict) else {}
            if old_ct or new_ct:
                merged["classTerms"] = {**old_ct, **new_ct}

            old_cfg["settings"] = merged
        else:
            old_cfg["settings"] = new_cfg["settings"]

    cfg_row.data = json.dumps(old_cfg)


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
    """(ok, message) — ensure a target directory exists and is writable.

    A path must be a full drive path (``D:\\…``) or a UNC network share
    (``\\\\server\\share\\…``). Without this guard a bare name such as
    ``192.168.1.11`` was created as a *relative* folder next to the app and
    falsely reported "Connection successful", instead of failing as an invalid
    destination — so backups silently went nowhere useful.
    """
    if not path:
        return False, "no path set"
    try:
        p = Path(path)
    except Exception:
        return False, "invalid path"
    if not p.is_absolute():
        return False, ("not a full folder path — use a drive like D:\\Backups "
                       "or a network share \\\\server\\share")
    try:
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
            # ZIP integrity: only meaningful when we actually wrote an uploads ZIP.
            # testzip() returns the first bad member's name, or None if all good.
            if uploads_count > 0:
                try:
                    with zipfile.ZipFile(tmp_uploads) as _zf:
                        zip_ok = _zf.testzip() is None
                except Exception:
                    zip_ok = False
            else:
                zip_ok = True  # no ZIP to verify
            manifest["verify"] = {
                "db_integrity": integrity,
                "db_hash_match": _sha256(tmp_db) == manifest["sha256"]["db"],
                "json_parse": json_ok,
                "zip_integrity": zip_ok,
            }
            verified = integrity == "ok" and json_ok and zip_ok

            tmp_manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

            # 3) fan out to every enabled target
            any_target = False
            for name, cfg in state["targets"].items():
                if not cfg.get("enabled"):
                    manifest["targets"][name] = "disabled"
                    continue
                # Cloud accounts (Google Drive / OneDrive): upload via their API
                # instead of copying to a folder.
                if cloud_backup.is_supported(name):
                    if not cloud_backup.is_connected(name):
                        manifest["targets"][name] = "unavailable (not signed in — connect the account in Settings)"
                        continue
                    files = [tmp_db, tmp_json, tmp_manifest]
                    if uploads_count > 0:
                        files.append(tmp_uploads)
                    cok, cmsg = cloud_backup.upload_set(name, files, keep)
                    manifest["targets"][name] = "ok" if cok else f"error ({cmsg})"
                    any_target = any_target or cok
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


def restore_from_payload(payload, mode="merge"):
    """Restore a full backup payload (config + history). Snapshots first and only
    commits if every write succeeds. Returns added/updated/skipped counts.

    mode="merge" (default, non-destructive):
        * History (quotations + warranties) is upserted by id — missing records
          are added, matching ids are updated, nothing is ever deleted.
        * Config lists are unioned by id; company/settings are shallow-merged.
          (See _apply_config.)
    mode="replace" (destructive — caller must confirm):
        * Existing quotations + warranties are deleted, then the payload's
          records are inserted. Config becomes exactly the payload's config.
        * A pre-restore snapshot is always taken first, so this is recoverable.
    """
    if not isinstance(payload, dict):
        raise ValueError("Backup payload must be a JSON object")
    if mode not in ("merge", "replace"):
        raise ValueError("mode must be 'merge' or 'replace'")
    quotations = payload.get("quotations", []) or []
    warranties = payload.get("warranty_certificates", []) or []
    if not isinstance(quotations, list) or not isinstance(warranties, list):
        raise ValueError("Backup payload is malformed (quotations/warranties must be lists)")

    snap = snapshot_pre_restore()

    db = SessionLocal()
    try:
        # ── Config ──
        if "config" in payload and payload["config"]:
            cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
            if cfg_row is None:
                cfg_row = AppConfig(id=1, data="{}")
                db.add(cfg_row)
            _apply_config(cfg_row, payload["config"], mode)

        # ── Replace mode: wipe history first so the payload fully defines it ──
        if mode == "replace":
            db.query(Quotation).delete()
            db.query(WarrantyCertificate).delete()
            db.flush()

        # ── Quotations: upsert by id (merge) / insert (replace, table is empty) ──
        existing_q = {row[0]: row[1] for row in db.query(Quotation.id, Quotation).all()} if mode == "merge" else {}
        added_q = updated_q = 0
        for q in quotations:
            qid = q.get("id", "")
            if not qid:
                continue
            row = existing_q.get(qid)
            if row is not None:
                row.customer_name = (q.get("customer") or {}).get("name", "")
                row.grand_total = q.get("grandTotal", 0)
                row.date = q.get("date", "")
                row.data = json.dumps(q)
                updated_q += 1
            else:
                new_row = Quotation(
                    id=qid,
                    customer_name=(q.get("customer") or {}).get("name", ""),
                    grand_total=q.get("grandTotal", 0),
                    date=q.get("date", ""),
                    data=json.dumps(q),
                )
                db.add(new_row)
                existing_q[qid] = new_row
                added_q += 1

        # ── Warranties: upsert by id (merge) / insert (replace) ──
        existing_w = {row[0]: row[1] for row in db.query(WarrantyCertificate.id, WarrantyCertificate).all()} if mode == "merge" else {}
        added_w = updated_w = 0
        for w in warranties:
            wid = w.get("id", "")
            if not wid:
                continue
            row = existing_w.get(wid)
            if row is not None:
                row.quotation_id = w.get("quotationId", "")
                row.customer_name = (w.get("customer") or {}).get("name", "")
                row.date = w.get("date", "")
                row.data = json.dumps(w)
                updated_w += 1
            else:
                new_row = WarrantyCertificate(
                    id=wid,
                    quotation_id=w.get("quotationId", ""),
                    customer_name=(w.get("customer") or {}).get("name", ""),
                    date=w.get("date", ""),
                    data=json.dumps(w),
                )
                db.add(new_row)
                existing_w[wid] = new_row
                added_w += 1

        db.commit()
        return {
            "status": "restored",
            "mode": mode,
            "pre_restore_snapshot": snap,
            "added": {"quotations": added_q, "warranty_certificates": added_w},
            "updated": {"quotations": updated_q, "warranty_certificates": updated_w},
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def restore_catalog_payload(payload, mode="merge"):
    """Restore ONLY the config (company, settings, brands, classes, varieties,
    warranties) from a catalog backup. Quotations and warranties are never
    touched, so a catalogue restore can never delete history (and vice-versa).

    mode="merge" (default): union config lists by id, shallow-merge scalars.
    mode="replace" (destructive — caller must confirm): config becomes exactly
    the payload's config.
    """
    if not isinstance(payload, dict):
        raise ValueError("Catalog backup must be a JSON object")
    if mode not in ("merge", "replace"):
        raise ValueError("mode must be 'merge' or 'replace'")
    cfg = payload.get("config")
    if cfg is None:
        raise ValueError("Invalid catalog backup: 'config' key missing")

    snap = snapshot_pre_restore()

    db = SessionLocal()
    try:
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        if cfg_row is None:
            cfg_row = AppConfig(id=1, data="{}")
            db.add(cfg_row)
        _apply_config(cfg_row, cfg, mode)
        db.commit()
        return {"status": "catalog_restored", "mode": mode, "pre_restore_snapshot": snap}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════════════
#  Intelligent recovery — compare a backup set against the live DB and restore
#  ONLY what's missing (never deletes, never auto-overwrites). Reuses the backup
#  .json (config + all quotations + all warranties), .manifest.json (sha256) and
#  .uploads.zip already produced by make_backup().
# ════════════════════════════════════════════════════════════════════════════
_UPLOAD_REF_RE = re.compile(r"/uploads/([^\"'\s)\\]+)")


def _record_hash(obj):
    """Stable fingerprint of a record's data so identical records compare equal."""
    try:
        return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    except Exception:
        return hashlib.sha256(repr(obj).encode("utf-8")).hexdigest()


def _backup_jsons_in(path):
    """Newest-first list of backup .json files in a directory (excludes manifests)."""
    try:
        files = [f for f in Path(path).glob(PREFIX + "*.json") if not f.name.endswith(".manifest.json")]
        return sorted(files, key=lambda f: f.stat().st_mtime, reverse=True)
    except Exception:
        return []


def list_backup_sets(limit_per_target=10):
    """Every available backup set across enabled+reachable targets, newest first.
    Each set: {target, json_path, uploads_zip_path, created_iso, sha, counts, size_bytes}."""
    state = get_state()
    sets = []
    for name, cfg in state["targets"].items():
        if not cfg.get("enabled"):
            continue
        path = cfg.get("path") or ""
        if not path:
            continue
        ok, _ = _target_dir_ok(path)
        if not ok:
            continue
        for jf in _backup_jsons_in(path)[:limit_per_target]:
            stem = jf.name[:-5]  # strip ".json"
            man = jf.parent / (stem + ".manifest.json")
            up = jf.parent / (stem + ".uploads.zip")
            sha = None
            counts = {}
            created = None
            if man.exists():
                try:
                    m = json.loads(man.read_text(encoding="utf-8"))
                    sha = (m.get("sha256") or {}).get("json")
                    counts = m.get("rows") or {}
                    created = m.get("created_iso")
                except Exception:
                    pass
            if not sha:
                try:
                    sha = _sha256(jf)
                except Exception:
                    sha = None
            if not created:
                created = datetime.fromtimestamp(jf.stat().st_mtime).astimezone().isoformat(timespec="seconds")
            sets.append({
                "target": name,
                "json_path": str(jf),
                "uploads_zip_path": str(up) if up.exists() else None,
                "created_iso": created,
                "sha": sha,
                "counts": counts,
                "size_bytes": jf.stat().st_size,
            })
    sets.sort(key=lambda s: s.get("created_iso") or "", reverse=True)
    return sets


def _targets_status():
    state = get_state()
    out = {}
    for name, cfg in state["targets"].items():
        path = cfg.get("path", "")
        avail, msg = (_target_dir_ok(path) if path else (False, "no path set"))
        latest = None
        if avail:
            js = _backup_jsons_in(path)
            if js:
                latest = datetime.fromtimestamp(js[0].stat().st_mtime).astimezone().isoformat(timespec="seconds")
        out[name] = {"enabled": bool(cfg.get("enabled")), "path": path,
                     "available": avail, "message": msg, "latest_backup_iso": latest}
    return out


def _load_backup_payload(json_path):
    payload = json.loads(Path(json_path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Backup file is not a valid backup payload")
    return payload


def _referenced_image_names(*objs):
    names = set()
    for o in objs:
        try:
            s = json.dumps(o)
        except Exception:
            continue
        for m in _UPLOAD_REF_RE.findall(s):
            names.add(Path(m).name)
    return names


def _cache_scan(report):
    try:
        with _state_lock:
            state = get_state()
            state["last_scan"] = {
                "scanned_iso": report.get("scanned_iso"),
                "source": report.get("source"),
                "summary": report.get("summary"),
                "corruption": report.get("corruption"),
            }
            set_state(state)
    except Exception:
        pass


def analyze(backup_json_path=None, cap=500):
    """Compare a backup set against the live DB. Returns a recovery report and
    caches a summary. No DB writes."""
    sets = list_backup_sets()
    chosen = None
    if backup_json_path:
        chosen = next((s for s in sets if s["json_path"] == backup_json_path), None)
        if not chosen and Path(backup_json_path).exists():
            p = Path(backup_json_path)
            stem = p.name[:-5]
            up = p.parent / (stem + ".uploads.zip")
            chosen = {"target": "(file)", "json_path": str(p),
                      "uploads_zip_path": str(up) if up.exists() else None,
                      "created_iso": None, "sha": _sha256(p), "counts": {}}
    else:
        chosen = sets[0] if sets else None

    if not chosen:
        rep = {"ok": False, "error": "No backup found on any connected destination.",
               "scanned_iso": _now_iso(), "targets_status": _targets_status()}
        return rep

    payload = _load_backup_payload(chosen["json_path"])
    bq = {q.get("id"): q for q in (payload.get("quotations") or []) if isinstance(q, dict) and q.get("id")}
    bw = {w.get("id"): w for w in (payload.get("warranty_certificates") or []) if isinstance(w, dict) and w.get("id")}
    bcfg = payload.get("config") or {}

    db = SessionLocal()
    try:
        cq = {r.id: json.loads(r.data) for r in db.query(Quotation).all()}
        cw = {r.id: json.loads(r.data) for r in db.query(WarrantyCertificate).all()}
        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        ccfg = json.loads(cfg_row.data) if (cfg_row and cfg_row.data) else {}
    finally:
        db.close()

    def diff(bmap, cmap, summ):
        missing, conflict, local_only = [], [], 0
        for id_, obj in bmap.items():
            if id_ not in cmap:
                missing.append(summ(id_, obj))
            elif _record_hash(obj) != _record_hash(cmap[id_]):
                conflict.append(summ(id_, obj))
        local_only = sum(1 for id_ in cmap if id_ not in bmap)
        return missing, conflict, local_only

    qsumm = lambda i, o: {"id": i, "customer": (o.get("customer") or {}).get("name", ""), "date": o.get("date", ""), "grandTotal": o.get("grandTotal", 0)}
    wsumm = lambda i, o: {"id": i, "warrantyNo": o.get("warrantyNo", i), "customer": (o.get("customer") or {}).get("name", ""), "quotationId": o.get("quotationId", ""), "date": o.get("date", "")}
    mq, cfq, loq = diff(bq, cq, qsumm)
    mw, cfw, low = diff(bw, cw, wsumm)

    missing_config, conflict_config = {}, {}
    for key in _CONFIG_LIST_KEYS:
        bl = {it.get("id"): it for it in (bcfg.get(key) or []) if isinstance(it, dict) and it.get("id")}
        cl = {it.get("id"): it for it in (ccfg.get(key) or []) if isinstance(it, dict) and it.get("id")}
        miss = [{"id": i, "name": it.get("name") or it.get("title") or i} for i, it in bl.items() if i not in cl]
        conf = [{"id": i, "name": it.get("name") or it.get("title") or i} for i, it in bl.items() if i in cl and _record_hash(it) != _record_hash(cl[i])]
        if miss:
            missing_config[key] = miss
        if conf:
            conflict_config[key] = conf
    scalar_conflicts = [sc for sc in ("company", "settings") if sc in bcfg and _record_hash(bcfg.get(sc) or {}) != _record_hash(ccfg.get(sc) or {})]

    backup_names = set()
    upz = chosen.get("uploads_zip_path")
    if upz and Path(upz).exists():
        try:
            with zipfile.ZipFile(upz) as zf:
                backup_names = {Path(n).name for n in zf.namelist() if not n.endswith("/")}
        except Exception:
            pass
    try:
        current_names = {f.name for f in UPLOADS_DIR.iterdir() if f.is_file()}
    except Exception:
        current_names = set()
    missing_images = sorted(backup_names - current_names)
    referenced = _referenced_image_names(bcfg, ccfg, list(cq.values()), list(cw.values()))
    unrecoverable_images = sorted(n for n in referenced if n not in current_names and n not in backup_names)

    try:
        integrity = _verify_db_integrity(DB_PATH)
    except Exception as e:
        integrity = f"error: {type(e).__name__}: {e}"

    report = {
        "ok": True,
        "scanned_iso": _now_iso(),
        "source": {"target": chosen["target"], "file": chosen["json_path"],
                   "created_iso": chosen.get("created_iso"), "sha": chosen.get("sha"),
                   "uploads_zip": upz, "counts": chosen.get("counts") or {}},
        "summary": {
            "missing_quotations": len(mq), "missing_warranties": len(mw),
            "conflict_quotations": len(cfq), "conflict_warranties": len(cfw),
            "missing_config": sum(len(v) for v in missing_config.values()),
            "conflict_config": sum(len(v) for v in conflict_config.values()),
            "missing_images": len(missing_images),
            "unrecoverable_images": len(unrecoverable_images),
            "local_only_quotations": loq, "local_only_warranties": low,
            "scalar_conflicts": scalar_conflicts,
        },
        "lists": {
            "missing_quotations": mq[:cap], "missing_warranties": mw[:cap],
            "conflict_quotations": cfq[:cap], "conflict_warranties": cfw[:cap],
            "missing_config": missing_config, "conflict_config": conflict_config,
            "missing_images": missing_images[:cap], "unrecoverable_images": unrecoverable_images[:cap],
            "all_missing_quotation_ids": [m["id"] for m in mq],
            "all_missing_warranty_ids": [m["id"] for m in mw],
        },
        "corruption": {"db_integrity": integrity, "ok": (integrity == "ok"),
                       "unrecoverable_images": unrecoverable_images[:cap]},
        "targets_status": _targets_status(),
    }
    _cache_scan(report)
    return report


def recover(backup_json_path, selection):
    """Restore ONLY the selected records/files from a backup set. Adds missing
    records; updates a record only if its id is in the matching overwrite list.
    Never deletes. Snapshots the live DB first."""
    payload = _load_backup_payload(backup_json_path)
    bq = {q.get("id"): q for q in (payload.get("quotations") or []) if isinstance(q, dict) and q.get("id")}
    bw = {w.get("id"): w for w in (payload.get("warranty_certificates") or []) if isinstance(w, dict) and w.get("id")}
    bcfg = payload.get("config") or {}
    sel = selection or {}
    q_ids = set(sel.get("quotation_ids") or [])
    w_ids = set(sel.get("warranty_ids") or [])
    ow_q = set(sel.get("overwrite_quotation_ids") or [])
    ow_w = set(sel.get("overwrite_warranty_ids") or [])
    cfg_sel = sel.get("config_items") or {}
    ow_cfg = set(sel.get("overwrite_config_item_ids") or [])
    images = set(sel.get("images") or [])
    ow_images = set(sel.get("overwrite_images") or [])

    snap = snapshot_pre_restore()
    applied = {"quotations": {"added": 0, "updated": 0}, "warranties": {"added": 0, "updated": 0}, "config_items": 0, "images": 0}

    db = SessionLocal()
    try:
        existing_q = {r.id: r for r in db.query(Quotation).all()}
        for qid in (q_ids | ow_q):
            q = bq.get(qid)
            if not q:
                continue
            row = existing_q.get(qid)
            if row is None:
                if qid not in q_ids:
                    continue
                db.add(Quotation(id=qid, customer_name=(q.get("customer") or {}).get("name", ""),
                                 grand_total=q.get("grandTotal", 0), date=q.get("date", ""), data=json.dumps(q)))
                applied["quotations"]["added"] += 1
            elif qid in ow_q:
                row.customer_name = (q.get("customer") or {}).get("name", "")
                row.grand_total = q.get("grandTotal", 0)
                row.date = q.get("date", "")
                row.data = json.dumps(q)
                applied["quotations"]["updated"] += 1

        existing_w = {r.id: r for r in db.query(WarrantyCertificate).all()}
        for wid in (w_ids | ow_w):
            w = bw.get(wid)
            if not w:
                continue
            row = existing_w.get(wid)
            if row is None:
                if wid not in w_ids:
                    continue
                db.add(WarrantyCertificate(id=wid, quotation_id=w.get("quotationId", ""),
                                           customer_name=(w.get("customer") or {}).get("name", ""),
                                           date=w.get("date", ""), data=json.dumps(w)))
                applied["warranties"]["added"] += 1
            elif wid in ow_w:
                row.quotation_id = w.get("quotationId", "")
                row.customer_name = (w.get("customer") or {}).get("name", "")
                row.date = w.get("date", "")
                row.data = json.dumps(w)
                applied["warranties"]["updated"] += 1

        if any(cfg_sel.get(k) for k in _CONFIG_LIST_KEYS):
            cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
            if cfg_row is None:
                cfg_row = AppConfig(id=1, data="{}")
                db.add(cfg_row)
            cur = json.loads(cfg_row.data) if cfg_row.data else {}
            for key in _CONFIG_LIST_KEYS:
                want = set(cfg_sel.get(key) or [])
                if not want:
                    continue
                bl = {it.get("id"): it for it in (bcfg.get(key) or []) if isinstance(it, dict) and it.get("id")}
                order = list(cur.get(key) or [])
                have = {x.get("id") for x in order if isinstance(x, dict) and x.get("id")}
                for id_ in want:
                    it = bl.get(id_)
                    if not it:
                        continue
                    if id_ not in have:
                        order.append(it)
                        applied["config_items"] += 1
                    elif id_ in ow_cfg:
                        for i, x in enumerate(order):
                            if isinstance(x, dict) and x.get("id") == id_:
                                order[i] = it
                                break
                        applied["config_items"] += 1
                cur[key] = order
            cfg_row.data = json.dumps(cur)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    if images:
        upz = sel.get("uploads_zip_path")
        if not upz:
            stem = Path(backup_json_path).name[:-5]
            upz = str(Path(backup_json_path).parent / (stem + ".uploads.zip"))
        if upz and Path(upz).exists():
            UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
            try:
                cur_names = {f.name for f in UPLOADS_DIR.iterdir() if f.is_file()}
            except Exception:
                cur_names = set()
            with zipfile.ZipFile(upz) as zf:
                by_base = {Path(n).name: n for n in zf.namelist() if not n.endswith("/")}
                for nm in images:
                    if nm in cur_names and nm not in ow_images:
                        continue
                    src = by_base.get(nm)
                    if not src:
                        continue
                    try:
                        (UPLOADS_DIR / nm).write_bytes(zf.read(src))
                        applied["images"] += 1
                    except Exception:
                        pass

    try:
        with _state_lock:
            st = get_state()
            st.pop("last_scan", None)
            set_state(st)
    except Exception:
        pass
    return {"status": "recovered", "applied": applied, "pre_restore_snapshot": snap}


def _recovery_scan_if_changed():
    """Background hook: rescan only when the newest backup differs from the last
    cached scan (so a freshly synced/connected destination is auto-analysed)."""
    try:
        sets = list_backup_sets()
        if not sets:
            return
        newest = sets[0]
        last_sha = ((get_state().get("last_scan") or {}).get("source") or {}).get("sha")
        if last_sha != newest.get("sha"):
            analyze(newest["json_path"])
    except Exception:
        pass


# ════════════════════════════════════════════════════════════════════════════
#  Scheduled verification + smart auto-recovery
#  Reuses analyze() (scan) and recover() (additive restore). Verification never
#  deletes data; it only imports what is missing and, for genuine conflicts where
#  the backup is provably newer, overwrites after archiving the current copy.
# ════════════════════════════════════════════════════════════════════════════
ARCHIVE_PREFIX = "archive_"


def _log_recovery(entries):
    """Prepend recovery-history rows (newest first), capped. Each row:
    {date, item_type, record_id, action, source, result}."""
    if not entries:
        return
    try:
        with _state_lock:
            state = get_state()
            log = state.get("recovery_log") or []
            state["recovery_log"] = (list(entries) + log)[:RECOVERY_LOG_CAP]
            set_state(state)
    except Exception:
        pass


def _bump_recovered_total(n):
    if n <= 0:
        return
    try:
        with _state_lock:
            state = get_state()
            state["recovered_total"] = int(state.get("recovered_total", 0) or 0) + int(n)
            set_state(state)
    except Exception:
        pass


def _record_version(obj):
    """Best-effort version/timestamp pair for conflict comparison. Returns a
    sortable tuple (version:int, updated_at:str). Missing fields sort lowest."""
    if not isinstance(obj, dict):
        return (0, "")
    try:
        ver = int(obj.get("version") or 0)
    except (TypeError, ValueError):
        ver = 0
    updated = str(obj.get("updatedAt") or obj.get("updated_at") or "")
    return (ver, updated)


def _archive_records(quotations=None, warranties=None):
    """Write the current copies of records about to be overwritten into an
    ``archive_*`` folder on the local target, so an overwrite is itself
    recoverable. Best-effort; returns the archive directory or None."""
    quotations = quotations or []
    warranties = warranties or []
    if not quotations and not warranties:
        return None
    state = get_state()
    local = state["targets"].get("local", {})
    path = local.get("path") or str(default_local_dir())
    ok, _ = _target_dir_ok(path)
    if not ok:
        return None
    stem = ARCHIVE_PREFIX + datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = Path(path) / stem
    try:
        dest.mkdir(parents=True, exist_ok=True)
        if quotations:
            (dest / "quotations.json").write_text(
                json.dumps(quotations, ensure_ascii=False, indent=2), encoding="utf-8")
        if warranties:
            (dest / "warranty_certificates.json").write_text(
                json.dumps(warranties, ensure_ascii=False, indent=2), encoding="utf-8")
        _rotate(Path(path), KEEP_PRE_RESTORE, prefix=ARCHIVE_PREFIX)
        return str(dest)
    except Exception:
        return None


def auto_recover_missing(report):
    """Additively import everything the scan flagged as missing (records, config
    items, images). Reuses recover(); never deletes, never overwrites existing.
    Returns the recover() applied-counts plus the log entries it produced."""
    source = report.get("source") or {}
    backup_path = source.get("file")
    if not backup_path:
        return {"applied": {}, "log": []}
    lists = report.get("lists") or {}
    selection = {
        "quotation_ids": lists.get("all_missing_quotation_ids") or [],
        "warranty_ids": lists.get("all_missing_warranty_ids") or [],
        "config_items": {k: [it["id"] for it in v]
                         for k, v in (lists.get("missing_config") or {}).items()},
        "images": lists.get("missing_images") or [],
        "uploads_zip_path": source.get("uploads_zip"),
    }
    has_work = (selection["quotation_ids"] or selection["warranty_ids"]
                or any(selection["config_items"].values()) or selection["images"])
    if not has_work:
        return {"applied": {}, "log": []}

    result = recover(backup_path, selection)
    applied = result.get("applied") or {}
    src_label = f"{source.get('target', 'backup')} ({Path(backup_path).name})"
    now = _now_iso()
    log = []
    for m in (lists.get("missing_quotations") or []):
        log.append({"date": now, "item_type": "Quotation", "record_id": m.get("id"),
                    "action": "Imported quotation", "source": src_label, "result": "ok"})
    for m in (lists.get("missing_warranties") or []):
        log.append({"date": now, "item_type": "Warranty", "record_id": m.get("id"),
                    "action": "Imported warranty", "source": src_label, "result": "ok"})
    for key, items in (lists.get("missing_config") or {}).items():
        for it in items:
            log.append({"date": now, "item_type": f"Catalogue/{key}", "record_id": it.get("id"),
                        "action": "Recovered catalogue item", "source": src_label, "result": "ok"})
    for nm in (lists.get("missing_images") or []):
        log.append({"date": now, "item_type": "Image", "record_id": nm,
                    "action": "Recovered missing file", "source": src_label, "result": "ok"})
    n = (applied.get("quotations", {}).get("added", 0)
         + applied.get("warranties", {}).get("added", 0)
         + applied.get("config_items", 0) + applied.get("images", 0))
    _bump_recovered_total(n)
    return {"applied": applied, "log": log}


def resolve_conflicts(report):
    """For records present in BOTH backup and live DB but differing, decide a
    winner by (version, updatedAt). If the backup copy is strictly newer, archive
    the current live copy then overwrite it. Otherwise keep the live copy (no
    silent overwrite). Returns log entries."""
    source = report.get("source") or {}
    backup_path = source.get("file")
    if not backup_path:
        return []
    lists = report.get("lists") or {}
    conflict_q = [c.get("id") for c in (lists.get("conflict_quotations") or [])]
    conflict_w = [c.get("id") for c in (lists.get("conflict_warranties") or [])]
    if not conflict_q and not conflict_w:
        return []

    try:
        payload = _load_backup_payload(backup_path)
    except Exception:
        return []
    bq = {q.get("id"): q for q in (payload.get("quotations") or []) if isinstance(q, dict) and q.get("id")}
    bw = {w.get("id"): w for w in (payload.get("warranty_certificates") or []) if isinstance(w, dict) and w.get("id")}

    db = SessionLocal()
    try:
        live_q = {r.id: json.loads(r.data) for r in db.query(Quotation).filter(Quotation.id.in_(conflict_q)).all()} if conflict_q else {}
        live_w = {r.id: json.loads(r.data) for r in db.query(WarrantyCertificate).filter(WarrantyCertificate.id.in_(conflict_w)).all()} if conflict_w else {}
    finally:
        db.close()

    win_q, win_w = [], []          # ids where the backup wins (overwrite)
    archive_q, archive_w = [], []  # current copies to archive first
    log = []
    src_label = f"{source.get('target', 'backup')} ({Path(backup_path).name})"
    now = _now_iso()

    for qid in conflict_q:
        b, l = bq.get(qid), live_q.get(qid)
        if b is None or l is None:
            continue
        if _record_version(b) > _record_version(l):
            win_q.append(qid)
            archive_q.append(l)
            log.append({"date": now, "item_type": "Quotation", "record_id": qid,
                        "action": "Resolved conflict — newer backup applied (older archived)",
                        "source": src_label, "result": "ok"})
        else:
            log.append({"date": now, "item_type": "Quotation", "record_id": qid,
                        "action": "Conflict — kept current (newer or equal)",
                        "source": src_label, "result": "skipped"})
    for wid in conflict_w:
        b, l = bw.get(wid), live_w.get(wid)
        if b is None or l is None:
            continue
        if _record_version(b) > _record_version(l):
            win_w.append(wid)
            archive_w.append(l)
            log.append({"date": now, "item_type": "Warranty", "record_id": wid,
                        "action": "Resolved conflict — newer backup applied (older archived)",
                        "source": src_label, "result": "ok"})
        else:
            log.append({"date": now, "item_type": "Warranty", "record_id": wid,
                        "action": "Conflict — kept current (newer or equal)",
                        "source": src_label, "result": "skipped"})

    if win_q or win_w:
        _archive_records(quotations=archive_q, warranties=archive_w)
        recover(backup_path, {
            "overwrite_quotation_ids": win_q,
            "overwrite_warranty_ids": win_w,
        })
    return log


def run_verification(force=False):
    """One verification cycle: scan the newest backup vs the live DB, then (if
    auto-recover is on) import everything missing and resolve clear conflicts.
    Updates last_verification_iso and the cached health snapshot. Never raises."""
    with _verify_lock:
        try:
            report = analyze()
        except Exception as e:
            report = {"ok": False, "error": f"{type(e).__name__}: {e}"}

        log_rows = []
        if report.get("ok"):
            state = get_state()
            if force or state.get("auto_recover_enabled", True):
                try:
                    log_rows += auto_recover_missing(report).get("log", [])
                except Exception:
                    pass
                try:
                    log_rows += resolve_conflicts(report)
                except Exception:
                    pass

        if log_rows:
            _log_recovery(log_rows)

        with _state_lock:
            state = get_state()
            state["last_verification_iso"] = _now_iso()
            set_state(state)
        # Refresh the cached health snapshot after any recovery.
        try:
            compute_health_score(refresh=True)
        except Exception:
            pass
        return {
            "ok": bool(report.get("ok")),
            "error": report.get("error"),
            "summary": report.get("summary"),
            "recovered": len(log_rows),
            "log": log_rows,
            "verified_iso": _now_iso(),
        }


def _verification_loop():
    """Daemon: fire run_verification() every verify_interval_minutes."""
    _verify_stop.wait(20)  # let startup settle
    while not _verify_stop.is_set():
        try:
            state = get_state()
            interval_min = int(state.get("verify_interval_minutes", VERIFY_INTERVAL_DEFAULT_MIN))
            last = state.get("last_verification_iso")
            days = _days_since(last)
            due = (days is None) or (days * 1440.0 >= interval_min)
            if due:
                run_verification()
        except Exception:
            pass
        _verify_stop.wait(VERIFY_LOOP_TICK_SECONDS)


def start_verification_loop():
    global _verify_thread
    if _verify_thread and _verify_thread.is_alive():
        return
    _verify_stop.clear()
    _verify_thread = threading.Thread(target=_verification_loop, name="nj-verify", daemon=True)
    _verify_thread.start()


def stop_verification_loop():
    _verify_stop.set()


# ── event-driven debounced backup worker ─────────────────────────────────────
def _event_worker_loop():
    """Daemon: when changes have settled (no new change for EVENT_QUIET_SECONDS)
    and event backups are enabled, take one coalesced backup."""
    while not _event_worker_stop.is_set():
        try:
            global _event_dirty_since
            with _event_lock:
                dirty = _event_dirty_since
            if dirty is not None and (time.time() - dirty) >= EVENT_QUIET_SECONDS:
                if get_state().get("event_backup_enabled", True):
                    make_backup_safe("event")
                # Clear only if no newer change arrived while we were backing up.
                with _event_lock:
                    if _event_dirty_since == dirty:
                        _event_dirty_since = None
        except Exception:
            pass
        _event_worker_stop.wait(EVENT_WORKER_TICK_SECONDS)


def start_event_worker():
    global _event_worker_thread
    if _event_worker_thread and _event_worker_thread.is_alive():
        return
    _event_worker_stop.clear()
    _event_worker_thread = threading.Thread(target=_event_worker_loop, name="nj-event-backup", daemon=True)
    _event_worker_thread.start()


def stop_event_worker():
    _event_worker_stop.set()


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
        if cloud_backup.is_supported(name):
            # Cloud account: "available" means a connected, signed-in account.
            cs = cloud_backup.get_status(name)
            if not cs["configured"]:
                avail, msg = False, "not set up"
            elif not cs["connected"]:
                avail, msg = False, "not connected"
            else:
                avail, msg = True, (cs["email"] or "connected")
            targets[name] = {
                "enabled": bool(cfg.get("enabled")),
                "path": "",
                "available": avail,
                "message": msg,
                "cloud": True,
                "configured": cs["configured"],
                "connected": cs["connected"],
                "email": cs["email"],
                "free_bytes": None,
                "backup_count": 0,
                "folder_size_bytes": 0,
            }
            continue
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


def _enabled_targets(state):
    return {n: c for n, c in state["targets"].items() if c.get("enabled")}


def _target_reachable(name, cfg):
    """True if an enabled target can currently receive a backup."""
    if cloud_backup.is_supported(name):
        try:
            return cloud_backup.is_connected(name)
        except Exception:
            return False
    ok, _ = _target_dir_ok(cfg.get("path", "")) if cfg.get("path") else (False, "")
    return ok


def compute_health_score(refresh=False):
    """A single 0–100 health score for the Backup Health Dashboard plus the
    headline facts (last backup / verification, files & database protected). The
    result is cached in state so the dashboard loads instantly; pass refresh=True
    to recompute (done after every verification)."""
    state = get_state()
    if not refresh and isinstance(state.get("health"), dict):
        return state["health"]

    now_iso = _now_iso()
    last_backup = state.get("last_success_iso")
    last_verify = state.get("last_verification_iso")
    interval_days = int(state.get("interval_days", INTERVAL_DAYS_DEFAULT))
    verify_min = int(state.get("verify_interval_minutes", VERIFY_INTERVAL_DEFAULT_MIN))

    factors = []

    # 1) Backup recency (30): full credit within the interval, decaying after.
    bdays = _days_since(last_backup)
    if bdays is None:
        backup_pts, bmsg = 0, "No backup yet"
    elif bdays <= interval_days:
        backup_pts, bmsg = 30, "Backup is current"
    else:
        backup_pts = max(0, int(30 * (1 - min(1.0, (bdays - interval_days) / (interval_days or 1)))))
        bmsg = "Backup is overdue"
    factors.append({"name": "Backup recency", "points": backup_pts, "max": 30, "detail": bmsg})

    # 2) Verification recency (20).
    vdays = _days_since(last_verify)
    verify_days = verify_min / 1440.0
    if vdays is None:
        verify_pts, vmsg = 0, "No verification yet"
    elif vdays <= max(verify_days * 2, verify_days + 0.01):
        verify_pts, vmsg = 20, "Verification is current"
    else:
        verify_pts, vmsg = 8, "Verification is overdue"
    factors.append({"name": "Verification recency", "points": verify_pts, "max": 20, "detail": vmsg})

    # 3) Destinations reachable (20).
    enabled = _enabled_targets(state)
    reachable = [n for n, c in enabled.items() if _target_reachable(n, c)]
    if not enabled:
        dest_pts, dmsg = 0, "No destinations enabled"
    elif len(reachable) == len(enabled):
        dest_pts, dmsg = 20, f"{len(reachable)}/{len(enabled)} destinations reachable"
    else:
        dest_pts = int(20 * len(reachable) / len(enabled))
        dmsg = f"{len(reachable)}/{len(enabled)} destinations reachable"
    factors.append({"name": "Destinations", "points": dest_pts, "max": 20, "detail": dmsg})

    # 4) Last backup verified ok + DB integrity (15).
    recent = state.get("recent") or []
    last_ok = bool(recent[0].get("ok")) if recent else False
    try:
        integrity_ok = _verify_db_integrity(DB_PATH) == "ok"
    except Exception:
        integrity_ok = False
    integ_pts = (8 if last_ok else 0) + (7 if integrity_ok else 0)
    factors.append({"name": "Integrity", "points": integ_pts, "max": 15,
                    "detail": ("Verified" if (last_ok and integrity_ok) else "Needs a verified backup")})

    # 5) Nothing left unrecovered (15) — read the last cached scan summary.
    summary = (state.get("last_scan") or {}).get("summary") or {}
    outstanding = (summary.get("missing_quotations", 0) + summary.get("missing_warranties", 0)
                   + summary.get("missing_config", 0) + summary.get("missing_images", 0))
    if outstanding == 0:
        miss_pts, mmsg = 15, "No missing data"
    else:
        miss_pts, mmsg = max(0, 15 - min(15, outstanding)), f"{outstanding} item(s) missing"
    factors.append({"name": "Completeness", "points": miss_pts, "max": 15, "detail": mmsg})

    score = backup_pts + verify_pts + dest_pts + integ_pts + miss_pts
    label = "Healthy" if score >= 90 else "Needs attention" if score >= 60 else "At risk"

    files_protected = _uploads_file_count()
    backup_sets = sum(
        _count_sets(c["path"])
        for n, c in enabled.items()
        if c.get("path") and _target_reachable(n, c)
    )

    health = {
        "score_pct": score,
        "label": label,
        "last_backup_iso": last_backup,
        "last_verification_iso": last_verify,
        "files_protected": files_protected,
        "backup_sets": backup_sets,
        "database_protected": bool(last_ok and integrity_ok),
        "db_integrity_ok": integrity_ok,
        "missing_outstanding": outstanding,
        "recovered_total": int(state.get("recovered_total", 0) or 0),
        "auto_recover_enabled": bool(state.get("auto_recover_enabled", True)),
        "event_backup_enabled": bool(state.get("event_backup_enabled", True)),
        "verify_interval_minutes": verify_min,
        "factors": factors,
        "computed_iso": now_iso,
    }
    try:
        with _state_lock:
            st = get_state()
            st["health"] = health
            set_state(st)
    except Exception:
        pass
    return health


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
        # Auto-analyse the newest backup when a destination is freshly synced/connected.
        _recovery_scan_if_changed()
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
