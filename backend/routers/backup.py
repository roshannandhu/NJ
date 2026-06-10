import json
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, FileResponse

import backup_service

router = APIRouter()


# ── full backup ZIP (data + all images) ──────────────────────────────────────
@router.get("/api/backup")
def backup():
    import io, zipfile as zf
    stem = backup_service._ts_stem()
    payload = backup_service.build_payload()

    buf = io.BytesIO()
    with zf.ZipFile(buf, "w", zf.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr("backup.json", json.dumps(payload, ensure_ascii=False, indent=2))
        udir = backup_service.UPLOADS_DIR
        if udir.exists():
            for f in sorted(udir.iterdir()):
                if f.is_file():
                    z.write(str(f), f"uploads/{f.name}")

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{stem}.zip"'},
    )


# ── catalog + images (complete ZIP backup) ───────────────────────────────────
@router.get("/api/backup/catalog")
def backup_catalog():
    """Catalogue-only backup ZIP: config (company, settings, brands, classes,
    varieties, warranty templates) + all catalog images. NO history records."""
    import io, zipfile as zf
    ts = backup_service._ts_stem().replace("nj_backup_", "nj_catalog_")
    # Catalogue payload only — quotations/warranties are intentionally excluded.
    payload = backup_service.build_catalog_payload()

    buf = io.BytesIO()
    with zf.ZipFile(buf, "w", zf.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr("backup.json", json.dumps(payload, ensure_ascii=False, indent=2))
        udir = backup_service.UPLOADS_DIR
        if udir.exists():
            for f in sorted(udir.iterdir()):
                if f.is_file():
                    z.write(str(f), f"uploads/{f.name}")

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{ts}.zip"'},
    )


@router.post("/api/backup/restore-catalog")
async def restore_catalog(file: UploadFile = File(...), mode: str = Form("merge")):
    """Restore the CATALOGUE only — ZIP (config + images) or plain JSON. History
    records (quotations/warranties) in the file are ignored, so this can never
    delete or alter history. mode = 'merge' (default) | 'replace'."""
    import io, zipfile as zf
    raw = await file.read()

    # Detect format by content (ZIP magic bytes PK\x03\x04), not filename.
    is_zip = raw[:4] == b"PK\x03\x04"

    try:
        if is_zip:
            buf = io.BytesIO(raw)
            try:
                z_file = zf.ZipFile(buf, "r")
            except zf.BadZipFile:
                raise HTTPException(status_code=400, detail="The file appears to be a ZIP but could not be opened. It may be corrupted.")

            with z_file as z:
                names = z.namelist()
                json_name = next(
                    (n for n in ("backup.json", "catalog.json") if n in names), None
                )
                if not json_name:
                    raise HTTPException(status_code=400, detail="Invalid backup ZIP: no backup.json found inside.")

                data = json.loads(z.read(json_name).decode("utf-8"))
                result = backup_service.restore_catalog_payload(data, mode=mode)

                udir = backup_service.UPLOADS_DIR
                udir.mkdir(parents=True, exist_ok=True)
                img_count = 0
                for name in names:
                    if name.startswith("uploads/") and not name.endswith("/"):
                        img_fname = name[len("uploads/"):]
                        if img_fname:
                            (udir / img_fname).write_bytes(z.read(name))
                            img_count += 1

            return {**result, "restored_images": img_count}

        else:
            # Plain JSON backup
            try:
                data = json.loads(raw.decode("utf-8"))
            except Exception:
                raise HTTPException(status_code=400, detail="File is not a valid ZIP or JSON backup.")
            result = backup_service.restore_catalog_payload(data, mode=mode)
            return {**result, "restored_images": 0}

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")


@router.get("/api/backup/history")
def backup_history():
    payload = backup_service.build_history_payload()
    ts = backup_service._ts_stem().replace("nj_backup_", "nj_history_")
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{ts}.json"'},
    )


# ── images (uploads folder) backup & restore ─────────────────────────────────
@router.get("/api/backup/uploads")
def backup_uploads():
    import tempfile, os
    from datetime import datetime
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp = Path(tempfile.mkdtemp()) / f"nj_uploads_{ts}.zip"
    try:
        count, size = backup_service._zip_uploads(tmp)
        if count == 0:
            raise HTTPException(status_code=404, detail="No images found in uploads folder.")
        return FileResponse(
            path=str(tmp),
            filename=tmp.name,
            media_type="application/zip",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/backup/restore-uploads")
async def restore_uploads(file: UploadFile = File(...)):
    import tempfile
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file (nj_uploads_*.zip).")
    raw = await file.read()
    tmp = Path(tempfile.mkdtemp()) / "restore.zip"
    tmp.write_bytes(raw)
    try:
        count = backup_service.restore_uploads_from_zip(tmp)
        return {"restored_files": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")


@router.get("/api/backup/uploads-info")
def uploads_info():
    count = backup_service._uploads_file_count()
    size = sum(
        f.stat().st_size for f in backup_service.UPLOADS_DIR.iterdir() if f.is_file()
    ) if backup_service.UPLOADS_DIR.exists() else 0
    return {"count": count, "size_bytes": size}


# ── connection test ──────────────────────────────────────────────────────────
@router.post("/api/backup/test-connection")
def test_connection(body: dict = Body(...)):
    ok, msg = backup_service._target_dir_ok(body.get("path", ""))
    return {"ok": ok, "message": msg}


# ── list available backup files on disk (for quick-restore picker) ────────────
@router.get("/api/backup/list-files")
def list_backup_files():
    from datetime import datetime
    state = backup_service.get_state()
    files = []
    for name, cfg in state["targets"].items():
        if not cfg.get("enabled") or not cfg.get("path"):
            continue
        d = Path(cfg["path"])
        if not d.exists():
            continue
        for f in sorted(d.glob("nj_backup_*.json"), reverse=True)[:10]:
            stat = f.stat()
            files.append({
                "target": name,
                "filename": f.name,
                "path": str(f),
                "size_bytes": stat.st_size,
                "modified_iso": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    files.sort(key=lambda x: x["modified_iso"], reverse=True)
    return {"files": files[:20]}


# ── restore from a server-side file path (quick-restore picker) ───────────────
@router.post("/api/backup/restore-path")
def restore_path(body: dict = Body(...)):
    path = body.get("path", "")
    mode = body.get("mode", "merge")
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    try:
        return backup_service.restore_from_payload(payload, mode=mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")


# ── auto-detect helpers ──────────────────────────────────────────────────────
def _detect_gdrive_root():
    """Locate a Google Drive (Drive for Desktop) folder. Returns the root Path
    of the sync folder, or None. Handles both the home-folder layout and the
    virtual lettered drive that Drive for Desktop mounts (e.g. G:\\My Drive)."""
    home = Path.home()
    candidates = [
        home / "Google Drive",
        home / "My Drive",
        home / "GoogleDrive",
    ]
    # Drive for Desktop usually mounts a virtual drive letter with "My Drive"
    # (and optionally shared drives) at its root.
    for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
        root = Path(f"{letter}:\\")
        candidates.append(root / "My Drive")
        candidates.append(root / "Google Drive")
    for p in candidates:
        try:
            if p.exists() and p.is_dir():
                return p
        except OSError:
            continue
    return None


def _detect_onedrive_root():
    """Locate the OneDrive sync folder via the env vars OneDrive sets, then the
    home-folder fallback. Returns a Path or None."""
    import os
    for var in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
        val = os.environ.get(var)
        if val:
            p = Path(val)
            try:
                if p.exists() and p.is_dir():
                    return p
            except OSError:
                pass
    p = Path.home() / "OneDrive"
    try:
        if p.exists() and p.is_dir():
            return p
    except OSError:
        pass
    return None


def _detect_dropbox_root():
    """Locate the Dropbox folder from its authoritative info.json, falling back
    to the home folder. Returns a Path or None."""
    import os
    for base in (os.environ.get("LOCALAPPDATA"), os.environ.get("APPDATA")):
        if not base:
            continue
        info = Path(base) / "Dropbox" / "info.json"
        try:
            if info.exists():
                data = json.loads(info.read_text(encoding="utf-8"))
                for key in ("personal", "business"):
                    entry = data.get(key) or {}
                    path = entry.get("path")
                    if path and Path(path).exists():
                        return Path(path)
        except Exception:
            pass
    p = Path.home() / "Dropbox"
    try:
        if p.exists() and p.is_dir():
            return p
    except OSError:
        pass
    return None


_CLOUD_DETECTORS = {
    "gdrive": _detect_gdrive_root,
    "onedrive": _detect_onedrive_root,
    "dropbox": _detect_dropbox_root,
}


@router.get("/api/backup/detect-cloud")
def detect_cloud(provider: str = "gdrive"):
    """Auto-detect a cloud sync folder (gdrive | onedrive | dropbox) and return
    a suggested NJ_Backups subfolder inside it."""
    detector = _CLOUD_DETECTORS.get(provider)
    if detector is None:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    root = detector()
    if root is not None:
        return {"found": True, "path": str(root / "NJ_Backups")}
    return {"found": False, "path": ""}


@router.get("/api/backup/detect-gdrive")
def detect_gdrive():
    """Backward-compatible alias for detect-cloud?provider=gdrive."""
    return detect_cloud("gdrive")


@router.get("/api/backup/usb-drives")
def usb_drives():
    try:
        out = subprocess.check_output(
            ["wmic", "logicaldisk", "where", "DriveType=2",
             "get", "DeviceID,VolumeName"],
            text=True, timeout=5, stderr=subprocess.DEVNULL,
        )
        drives = []
        for line in out.strip().splitlines()[1:]:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            letter = parts[0]
            label = " ".join(parts[1:]) if len(parts) > 1 else "USB Drive"
            drives.append({"letter": letter, "label": label,
                           "path": f"{letter}\\NJ_Backups"})
        return {"drives": drives}
    except Exception:
        return {"drives": []}


# ── in-app folder browser (Local Disk / USB destinations) ────────────────────
# The web UI can't open an OS folder dialog (browser sandbox) and pywebview's
# native dialog can't be driven from a request thread, so the picker is built in
# the app: these endpoints let the frontend walk the real filesystem (the backend
# already has full FS access for writing backups) and pick a folder.
@router.get("/api/backup/list-dirs")
def list_dirs(path: str = ""):
    """List drive roots (no path) or the immediate subfolders of `path`."""
    path = (path or "").strip()
    if not path:
        drives = [f"{d}:\\" for d in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                  if os.path.exists(f"{d}:\\")]
        return {"current": "", "parent": None,
                "dirs": [{"name": d, "path": d} for d in drives]}

    trimmed = path.rstrip("\\/")
    parent = os.path.dirname(trimmed)
    # At a drive root (e.g. "C:") dirname returns "C:" itself → send to drives list.
    if not parent or parent == trimmed:
        parent = ""
    try:
        entries = []
        with os.scandir(path) as it:
            for e in it:
                try:
                    if e.is_dir():
                        entries.append({"name": e.name, "path": e.path})
                except OSError:
                    continue  # skip entries we can't stat
        entries.sort(key=lambda x: x["name"].lower())
        return {"current": path, "parent": parent, "dirs": entries}
    except Exception as e:
        return {"current": path, "parent": parent, "dirs": [],
                "error": f"{type(e).__name__}: {e}"}


@router.post("/api/backup/make-dir")
def make_dir(body: dict = Body(...)):
    """Create a new subfolder while browsing. body = { parent, name }."""
    parent = (body or {}).get("parent") or ""
    name = ((body or {}).get("name") or "").strip()
    if not parent or not name:
        return {"ok": False, "error": "parent and name are required"}
    # Block path separators in the new name so it stays a single subfolder.
    if any(c in name for c in '\\/:*?"<>|'):
        return {"ok": False, "error": "invalid folder name"}
    try:
        new_path = os.path.join(parent, name)
        os.makedirs(new_path, exist_ok=True)
        return {"ok": True, "path": new_path}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


# ── restore from a posted payload (used by the old import path) ──────────────
@router.post("/api/restore")
def restore(body: dict = Body(...)):
    mode = body.get("mode", "merge") if isinstance(body, dict) else "merge"
    try:
        return backup_service.restore_from_payload(body, mode=mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")


# ── run a backup now ─────────────────────────────────────────────────────────
@router.post("/api/backup/run")
def backup_run():
    manifest = backup_service.make_backup("manual", force_catalog=True)
    if not manifest.get("ok"):
        # Still return 200 with the manifest so the UI can show exactly what
        # failed (e.g. no targets enabled, USB unplugged) instead of a blank error.
        manifest.setdefault(
            "hint",
            "Backup created but not stored. Enable at least one writable "
            "destination in Settings (Local / Google Drive / USB).",
        )
    return manifest


# ── status + health for the Settings UI ──────────────────────────────────────
@router.get("/api/backup/status")
def backup_status():
    return backup_service.compute_status()


@router.get("/api/backup/health")
def backup_health():
    return backup_service.compute_health()


# ── destination settings ─────────────────────────────────────────────────────
def _settings_view(state):
    return {
        "targets": state["targets"],
        "keep": state.get("keep"),
        "interval_days": state.get("interval_days"),
        "verify_interval_minutes": state.get("verify_interval_minutes"),
        "auto_recover_enabled": state.get("auto_recover_enabled"),
        "event_backup_enabled": state.get("event_backup_enabled"),
    }


@router.get("/api/backup/settings")
def get_backup_settings():
    return _settings_view(backup_service.get_state())


@router.put("/api/backup/settings")
def put_backup_settings(body: dict = Body(...)):
    state = backup_service.update_settings(
        targets=body.get("targets"),
        keep=body.get("keep"),
        interval_days=body.get("interval_days"),
        verify_interval_minutes=body.get("verify_interval_minutes"),
        auto_recover_enabled=body.get("auto_recover_enabled"),
        event_backup_enabled=body.get("event_backup_enabled"),
    )
    return _settings_view(state)


# ── cloud accounts (Google Drive / OneDrive, real OAuth login) ────────────────
import cloud_backup


def _check_provider(provider: str):
    if not cloud_backup.is_supported(provider):
        raise HTTPException(status_code=404, detail=f"Unknown cloud provider: {provider}")


@router.get("/api/backup/cloud/{provider}/status")
def cloud_status(provider: str):
    _check_provider(provider)
    return cloud_backup.get_status(provider)


@router.put("/api/backup/cloud/{provider}/config")
def cloud_config(provider: str, body: dict = Body(...)):
    """Save the developer-console Client ID (+ secret for Google) the user pastes in."""
    _check_provider(provider)
    cloud_backup.save_config(provider, body.get("client_id", ""), body.get("client_secret", ""))
    return cloud_backup.get_status(provider)


@router.post("/api/backup/cloud/{provider}/connect")
def cloud_connect(provider: str):
    """Open the browser, run the OAuth login, and store the account tokens.
    Blocks until the user finishes (or the flow times out)."""
    _check_provider(provider)
    result = cloud_backup.connect(provider)
    return {**result, **cloud_backup.get_status(provider)}


@router.post("/api/backup/cloud/{provider}/disconnect")
def cloud_disconnect(provider: str):
    _check_provider(provider)
    cloud_backup.disconnect(provider)
    return cloud_backup.get_status(provider)


# ── restore from an uploaded backup file (ZIP or JSON) ───────────────────────
@router.post("/api/backup/restore-file")
async def restore_file(file: UploadFile = File(...), mode: str = Form("merge")):
    import io, zipfile as zf
    raw = await file.read()
    is_zip = raw[:4] == b"PK\x03\x04"

    try:
        if is_zip:
            buf = io.BytesIO(raw)
            try:
                z_file = zf.ZipFile(buf, "r")
            except zf.BadZipFile:
                raise HTTPException(status_code=400, detail="ZIP file is corrupted.")

            with z_file as z:
                names = z.namelist()
                json_name = next(
                    (n for n in ("backup.json", "catalog.json") if n in names), None
                )
                if not json_name:
                    raise HTTPException(status_code=400, detail="Invalid backup ZIP: no backup.json found inside.")

                payload = json.loads(z.read(json_name).decode("utf-8"))
                result = backup_service.restore_from_payload(payload, mode=mode)

                # Restore images from uploads/ folder inside the ZIP
                udir = backup_service.UPLOADS_DIR
                udir.mkdir(parents=True, exist_ok=True)
                img_count = 0
                for name in names:
                    if name.startswith("uploads/") and not name.endswith("/"):
                        img_fname = name[len("uploads/"):]
                        if img_fname:
                            (udir / img_fname).write_bytes(z.read(name))
                            img_count += 1

            return {**result, "restored_images": img_count}

        else:
            # Plain JSON backup (legacy format)
            try:
                payload = json.loads(raw.decode("utf-8"))
            except Exception:
                raise HTTPException(status_code=400, detail="File is not a valid ZIP or JSON backup.")
            result = backup_service.restore_from_payload(payload, mode=mode)
            return {**result, "restored_images": 0}

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")


# ════════════════════════════════════════════════════════════════════════════
#  Intelligent recovery — scan a backup vs the live DB, restore only what's missing
# ════════════════════════════════════════════════════════════════════════════
@router.get("/api/recovery/backups")
def recovery_backups():
    """Available backup sets across connected destinations (newest first)."""
    return {"backups": backup_service.list_backup_sets()}


@router.get("/api/recovery/scan")
def recovery_scan(backup: str = ""):
    """Compare a backup (newest if none given) against the live DB."""
    try:
        return backup_service.analyze(backup or None)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Backup file not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {e}")


@router.get("/api/recovery/last")
def recovery_last():
    """Cached summary from the last scan (or null)."""
    return backup_service.get_state().get("last_scan")


@router.post("/api/recovery/recover")
def recovery_recover(body: dict = Body(...)):
    """Restore only the selected records/files from a backup set."""
    backup = body.get("backup")
    selection = body.get("selection") or {}
    if not backup:
        raise HTTPException(status_code=400, detail="backup path is required")
    try:
        return backup_service.recover(backup, selection)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Backup file not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recovery failed: {e}")


@router.get("/api/recovery/report")
def recovery_report(backup: str = ""):
    """Download the full recovery report as a JSON attachment."""
    try:
        report = backup_service.analyze(backup or None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {e}")
    from datetime import datetime
    fname = f"NJ_Recovery_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        content=json.dumps(report, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ════════════════════════════════════════════════════════════════════════════
#  Smart Backup Health Dashboard
# ════════════════════════════════════════════════════════════════════════════
@router.get("/api/backup/dashboard")
def backup_dashboard():
    """Everything the Backup & Recovery dashboard needs in one call: health score,
    headline status, and the recent change feed."""
    state = backup_service.get_state()
    return {
        "health": backup_service.compute_health_score(),
        "status": backup_service.compute_status(),
        "change_journal": (state.get("change_journal") or [])[:20],
        "recovery_log_count": len(state.get("recovery_log") or []),
    }


@router.get("/api/recovery/log")
def recovery_log():
    """The full Recovery History (newest first)."""
    return {"log": backup_service.get_state().get("recovery_log") or []}


@router.post("/api/backup/verify-now")
def verify_now():
    """Run a verification + auto-recovery cycle immediately and return the result."""
    return backup_service.run_verification()
