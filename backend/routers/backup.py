import json
import subprocess
from pathlib import Path

from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from fastapi.responses import Response, FileResponse

import backup_service

router = APIRouter()


# ── full JSON export (download) ──────────────────────────────────────────────
@router.get("/api/backup")
def backup():
    payload = backup_service.build_payload()
    stem = backup_service._ts_stem()
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{stem}.json"'},
    )


# ── catalog + images (complete ZIP backup) ───────────────────────────────────
@router.get("/api/backup/catalog")
def backup_catalog():
    """Full backup ZIP: all data (config + quotations + warranties) + all images."""
    import io, zipfile as zf
    ts = backup_service._ts_stem().replace("nj_backup_", "nj_catalog_")
    # Use full payload so quotations and warranties are included
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
        headers={"Content-Disposition": f'attachment; filename="{ts}.zip"'},
    )


@router.post("/api/backup/restore-catalog")
async def restore_catalog(file: UploadFile = File(...)):
    """Restore from a catalog backup — ZIP (data + images) or plain JSON."""
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
                result = backup_service.restore_from_payload(data)

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
            result = backup_service.restore_from_payload(data)
            return {**result, "restored_images": 0}

    except HTTPException:
        raise
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
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    try:
        return backup_service.restore_from_payload(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")


# ── auto-detect helpers ──────────────────────────────────────────────────────
@router.get("/api/backup/detect-gdrive")
def detect_gdrive():
    home = Path.home()
    candidates = [
        home / "Google Drive",
        home / "My Drive",
        home / "GoogleDrive",
    ]
    for p in candidates:
        if p.exists() and p.is_dir():
            return {"found": True, "path": str(p / "NJ_Backups")}
    return {"found": False, "path": ""}


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


# ── restore from a posted payload (used by the old import path) ──────────────
@router.post("/api/restore")
def restore(body: dict = Body(...)):
    try:
        return backup_service.restore_from_payload(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")


# ── run a backup now ─────────────────────────────────────────────────────────
@router.post("/api/backup/run")
def backup_run():
    manifest = backup_service.make_backup("manual")
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
@router.get("/api/backup/settings")
def get_backup_settings():
    state = backup_service.get_state()
    return {"targets": state["targets"], "keep": state.get("keep"), "interval_days": state.get("interval_days")}


@router.put("/api/backup/settings")
def put_backup_settings(body: dict = Body(...)):
    state = backup_service.update_settings(
        targets=body.get("targets"), keep=body.get("keep"), interval_days=body.get("interval_days")
    )
    return {"targets": state["targets"], "keep": state.get("keep"), "interval_days": state.get("interval_days")}


# ── restore from an uploaded .json backup file ───────────────────────────────
@router.post("/api/backup/restore-file")
async def restore_file(file: UploadFile = File(...)):
    try:
        raw = await file.read()
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read the file as a JSON backup. Choose an "
            "nj_backup_*.json file.",
        )
    try:
        return backup_service.restore_from_payload(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")
