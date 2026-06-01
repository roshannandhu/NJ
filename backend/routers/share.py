"""
share.py — Windows-native Share Contract for the NJ India System.

The app runs inside pywebview (WebView2). WebView2 does NOT expose the Web Share
API (navigator.share is undefined there), so the browser can never attach files
to the Windows Share flyout. The robust fix is to perform the share natively from
the backend:

  1. The JS frontend renders each PDF (jsPDF) and POSTs the raw bytes here.
  2. This endpoint writes them to disk as real .pdf files in a temp folder.
  3. It launches ShareHelper.exe (a tiny .NET helper) with the absolute paths.
  4. The helper opens the genuine Windows Share flyout via
     IDataTransferManagerInterop and attaches the files as real StorageItems, so
     WhatsApp / Mail / Teams receive actual PDF file objects.

The temp files are kept for the life of the process so the target app can still
read them after the share dialog hands off.
"""
import os
import sys
import uuid
import shutil
import tempfile
import logging
import subprocess
from glob import glob
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()
log = logging.getLogger("nj.share")

# ── Temp storage ────────────────────────────────────────────────────────────
# A per-process temp folder. Each share gets its own subfolder so we can clean
# up old shares without disturbing one that a target app may still be reading.
_SHARE_ROOT = Path(tempfile.gettempdir()) / "nj_share"
_SHARE_ROOT.mkdir(parents=True, exist_ok=True)

# Hold strong references to the most recent share folders so nothing is cleaned
# up while the target app is still pulling the bytes.
_live_share_dirs: List[Path] = []

# Resolved path to ShareHelper.exe (cached after first lookup/compile).
_helper_exe: Optional[Path] = None
_HELPER_DIR = Path(__file__).resolve().parent.parent / "share_helper"


def _safe_name(filename: str) -> str:
    base = os.path.basename(filename or "")
    cleaned = "".join(c if (c.isalnum() or c in "._- ") else "_" for c in base)
    cleaned = cleaned.strip() or f"document_{uuid.uuid4().hex[:6]}.pdf"
    if not cleaned.lower().endswith(".pdf"):
        cleaned += ".pdf"
    return cleaned


def _prune_old_shares(keep: int = 6) -> None:
    """Delete all but the most recent `keep` share folders (best-effort)."""
    try:
        dirs = sorted(
            (d for d in _SHARE_ROOT.iterdir() if d.is_dir()),
            key=lambda d: d.stat().st_mtime,
        )
        for d in dirs[:-keep]:
            if d in _live_share_dirs:
                continue
            shutil.rmtree(d, ignore_errors=True)
    except Exception as e:
        log.debug("prune old shares failed: %s", e)


# ── ShareHelper.exe location / compilation ──────────────────────────────────
def _find_csc() -> Optional[Path]:
    for base in (
        r"C:\Windows\Microsoft.NET\Framework64",
        r"C:\Windows\Microsoft.NET\Framework",
    ):
        for csc in sorted(glob(os.path.join(base, "v4.*", "csc.exe")), reverse=True):
            return Path(csc)
    return None


def _compile_helper() -> Optional[Path]:
    """Compile ShareHelper.cs with the in-box .NET Framework csc against the OS
    WinRT metadata. No SDK required. Returns the exe path, or None on failure."""
    src = _HELPER_DIR / "ShareHelper.cs"
    if not src.exists():
        log.warning("ShareHelper.cs not found at %s", src)
        return None
    csc = _find_csc()
    if not csc:
        log.warning("csc.exe (.NET Framework) not found; cannot compile ShareHelper")
        return None

    fw = csc.parent
    winmd = Path(r"C:\Windows\System32\WinMetadata")
    facades = glob(
        r"C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Runtime.WindowsRuntime"
        r"\*\System.Runtime.WindowsRuntime.dll"
    )
    if not facades or not winmd.exists():
        log.warning("WinRT metadata/facade missing (winmd=%s facades=%s)", winmd.exists(), bool(facades))
        return None

    out = _HELPER_DIR / "ShareHelper.exe"
    cmd = [
        str(csc), "/nologo", "/target:winexe", "/platform:x64", f"/out:{out}",
        f"/r:{winmd / 'Windows.Foundation.winmd'}",
        f"/r:{winmd / 'Windows.Storage.winmd'}",
        f"/r:{winmd / 'Windows.ApplicationModel.winmd'}",
        f"/r:{facades[0]}",
        f"/r:{fw / 'System.Runtime.dll'}",
        f"/r:{fw / 'System.Runtime.InteropServices.WindowsRuntime.dll'}",
        str(src),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and out.exists():
            log.info("Compiled ShareHelper.exe -> %s", out)
            return out
        log.warning("ShareHelper compile failed (%s): %s", r.returncode, r.stdout + r.stderr)
    except Exception as e:
        log.warning("ShareHelper compile error: %s", e)
    return None


def _ensure_helper() -> Optional[Path]:
    global _helper_exe
    if _helper_exe and _helper_exe.exists():
        return _helper_exe
    shipped = _HELPER_DIR / "ShareHelper.exe"
    if shipped.exists():
        _helper_exe = shipped
        return _helper_exe
    _helper_exe = _compile_helper()
    return _helper_exe


def _launch_helper(title: str, paths: List[Path]) -> bool:
    exe = _ensure_helper()
    if not exe:
        log.warning("ShareHelper.exe unavailable; files saved but no native share")
        return False
    args = [str(exe), title] + [str(p) for p in paths]
    log.info("Launching native share: %s", subprocess.list2cmdline(args))
    try:
        # The share flyout must become the foreground window. This backend runs in
        # the same process as the (foreground) pywebview window, so granting
        # foreground rights to any process lets the helper bring its anchor window
        # forward — otherwise Windows' foreground lock would keep the flyout hidden.
        try:
            import ctypes
            ctypes.windll.user32.AllowSetForegroundWindow(-1)  # ASFW_ANY
        except Exception:
            pass

        # Detached so the HTTP request returns immediately; the helper owns the
        # share flyout for its own lifetime.
        flags = 0
        if os.name == "nt":
            flags = getattr(subprocess, "DETACHED_PROCESS", 0x00000008) | \
                    getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        subprocess.Popen(args, creationflags=flags, close_fds=True)
        return True
    except Exception as e:
        log.warning("Failed to launch ShareHelper: %s", e)
        return False


@router.post("/api/share-pdfs")
async def share_pdfs(
    files: List[UploadFile] = File(...),
    title: str = Form("NJ India — Document"),
):
    """Receive PDF bytes from the frontend, write them as real files, and invoke
    the native Windows Share flyout via ShareHelper.exe."""
    if not files:
        raise HTTPException(400, "No files provided")

    share_dir = _SHARE_ROOT / uuid.uuid4().hex[:12]
    share_dir.mkdir(parents=True, exist_ok=True)

    saved: List[Path] = []
    payload_log = []
    for uf in files:
        data = await uf.read()
        if not data:
            log.warning("Empty file received: %s", uf.filename)
            continue
        dest = share_dir / _safe_name(uf.filename)
        dest.write_bytes(data)
        saved.append(dest)
        exists = dest.exists()
        size = dest.stat().st_size if exists else 0
        log.info("Share file written: path=%s exists=%s size=%d", dest, exists, size)
        payload_log.append({"path": str(dest), "exists": exists, "size": size})

    if not saved:
        shutil.rmtree(share_dir, ignore_errors=True)
        raise HTTPException(400, "All files were empty")

    # Keep this share's files alive; prune older ones.
    _live_share_dirs.append(share_dir)
    if len(_live_share_dirs) > 6:
        _live_share_dirs.pop(0)
    _prune_old_shares()

    launched = False
    if sys.platform == "win32":
        launched = _launch_helper(title, saved)

    log.info("Share payload: title=%r launched=%s files=%s", title, launched, payload_log)
    return JSONResponse({
        "ok": True,
        "launched": launched,
        "files": payload_log,
        "message": (
            "Windows Share dialog opened" if launched
            else f"Files saved to {share_dir} — open them to share manually"
        ),
    })
