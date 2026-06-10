"""
Desktop launcher for the NJ India System.

Runs the FastAPI backend silently in the background and shows the app in a NATIVE
window (pywebview / Windows WebView2) — no browser, no console. Launched by the
installed shortcut via pythonw.exe. If the native window can't start, it falls
back to opening the default browser so the app always works.
"""

import os
import sys
import threading
import time
import socket

# Launched via pythonw.exe (no console), sys.stdout / sys.stderr are None. uvicorn's
# logging — and any library that prints — then crashes with
# "'NoneType' object has no attribute 'isatty'", killing the server before it binds
# (the app would show "refused to connect"). Give them a sink so that never happens.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

# Embedded Python builds sys.path from its ._pth and does NOT add the script dir,
# so make `main` importable explicitly.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Self-sufficient data location (works even when launched directly via the
# shortcut, not only via the .bat). Kept SEPARATE from the program folder so
# reinstalling never deletes data.
os.environ.setdefault(
    "NJ_DATA_DIR",
    os.path.join(os.environ.get("LOCALAPPDATA", os.path.dirname(os.path.abspath(__file__))), "NJ India Data"),
)

import traceback
import datetime
import urllib.request

import uvicorn

HOST = "127.0.0.1"

# A launch log next to the data lets us see exactly what happened when the window
# is the only thing the user can see (pythonw has no console).
_LOG = os.path.join(os.environ["NJ_DATA_DIR"], "launch.log")


def log(msg):
    try:
        os.makedirs(os.path.dirname(_LOG), exist_ok=True)
        with open(_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")
    except Exception:
        pass


_MUTEX_HANDLE = []


def _is_only_instance():
    """True if no other copy is already running. A Windows named mutex means a
    second double-click of the shortcut quietly exits instead of stacking another
    window + server (the cause of 'multiple windows opening')."""
    try:
        import ctypes
        k = ctypes.windll.kernel32
        h = k.CreateMutexW(None, False, "NJIndiaTrading_SingleInstance")
        if k.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            return False
        _MUTEX_HANDLE.append(h)  # hold the handle for the process lifetime
        return True
    except Exception:
        return True  # never block launch if the guard itself fails


def _free_port():
    """Grab a free port from the OS. Picking a fresh port every launch means a
    stale/duplicate instance — or any other program already on 8000 — can never
    block startup with a 'can't be reached' window."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


PORT = _free_port()
URL = f"http://{HOST}:{PORT}"


def _serve():
    try:
        uvicorn.run("main:app", host=HOST, port=PORT, log_config=None)
    except Exception as e:  # surface a dead server instead of a silent refusal
        log("SERVER CRASHED: " + repr(e) + "\n" + traceback.format_exc())


def _wait_ready(timeout=40.0):
    """Wait until the API actually answers — not just until the socket listens —
    so the window never opens onto a half-started server."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(f"{URL}/api/health", timeout=1) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


if __name__ == "__main__":
    log(f"==== launch ==== url={URL} python={sys.executable}")
    if not _is_only_instance():
        log("another instance is already running; exiting (no second window)")
        sys.exit(0)
    threading.Thread(target=_serve, daemon=True).start()
    ready = _wait_ready()
    log(f"server ready: {ready}")
    try:
        import webview
        log(f"webview imported (v{getattr(webview, '__version__', '?')}); creating window")
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        icon_path = None
        for _cand in (
            os.path.join(base_dir, "app.ico"),                       # installed: app\app.ico
            os.path.join(base_dir, "..", "app.ico"),
            os.path.join(base_dir, "..", "installer", "app.ico"),    # dev tree
        ):
            if os.path.exists(_cand):
                icon_path = os.path.abspath(_cand)
                break
        log(f"icon_path resolved to: {icon_path}")

        # Give this process its own taskbar identity so its button shows the NJ icon
        # instead of being grouped under — and showing the icon of — pythonw.exe.
        # Must run before the window (and thus its taskbar button) is created.
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
                ctypes.c_wchar_p("NJIndia.Trading.App"))
        except Exception as _e:
            log(f"AppUserModelID set failed: {_e}")

        # Expose a tiny JS API so the WEB UI can open a NATIVE folder picker via
        # window.pywebview.api.pick_backup_folder(). The dialog MUST be driven
        # through js_api — calling create_file_dialog from the web-server request
        # thread hangs — so the Backup "Choose Folder" buttons call this.
        import native_dialog

        class _NativeApi:
            def pick_backup_folder(self, current=""):
                return native_dialog.pick_folder(current or "")

        window = webview.create_window("NJ India Trading", URL, width=1280, height=820,
                                       min_size=(1024, 680), js_api=_NativeApi())
        try:
            native_dialog.set_window(window)
            log("native_dialog window registered (js_api)")
        except Exception as _e:
            log(f"native_dialog registration failed: {_e}")

        def force_window_icon():
            # Replace the default Python logo in the title bar / taskbar / alt-tab with
            # app.ico. Three bugs in the previous version are fixed here:
            #   1. The window was located by a FIXED TITLE ("NJ India Trading"), but the
            #      SPA sets document.title on load, so pywebview renames the window and
            #      the lookup missed it (the "Could not find window handle" failures).
            #      We instead find THIS process's own top-level window by PID and poll
            #      until it exists.
            #   2. A 256px image was set as BOTH big and small icon; Windows rejects an
            #      ill-sized small icon and falls back to the Python logo. We load the
            #      small (16) and big (32) frames at their proper sizes.
            #   3. 64-bit HWND/HICON handles were passed to SendMessageW with no ctypes
            #      argtypes, truncating them to 32 bits — so SETICON "succeeded" but hit
            #      a bogus handle. We declare arg/return types so handles stay intact.
            try:
                if not icon_path:
                    log("Cannot force icon: app.ico not found in any known location")
                    return
                import ctypes
                from ctypes import wintypes
                u = ctypes.windll.user32

                u.LoadImageW.restype = wintypes.HANDLE
                u.LoadImageW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT,
                                         ctypes.c_int, ctypes.c_int, wintypes.UINT]
                u.SendMessageW.restype = ctypes.c_ssize_t
                u.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, ctypes.c_size_t, ctypes.c_ssize_t]
                u.GetWindow.restype = wintypes.HWND
                u.GetWindow.argtypes = [wintypes.HWND, wintypes.UINT]
                u.GetWindowThreadProcessId.restype = wintypes.DWORD
                u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
                u.IsWindowVisible.argtypes = [wintypes.HWND]
                u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
                u.GetSystemMetrics.restype = ctypes.c_int
                u.GetSystemMetrics.argtypes = [ctypes.c_int]
                _set_class = getattr(u, "SetClassLongPtrW", None) or u.SetClassLongW
                _set_class.restype = ctypes.c_size_t
                _set_class.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]

                IMAGE_ICON, LR_LOADFROMFILE, WM_SETICON = 1, 0x0010, 0x0080
                ICON_SMALL, ICON_BIG, ICON_SMALL2 = 0, 1, 2
                SM_CXICON, SM_CYICON, SM_CXSMICON, SM_CYSMICON = 11, 12, 49, 50
                GCLP_HICON, GCLP_HICONSM = -14, -34

                cx_b = u.GetSystemMetrics(SM_CXICON) or 32
                cy_b = u.GetSystemMetrics(SM_CYICON) or 32
                cx_s = u.GetSystemMetrics(SM_CXSMICON) or 16
                cy_s = u.GetSystemMetrics(SM_CYSMICON) or 16

                hbig = u.LoadImageW(None, icon_path, IMAGE_ICON, cx_b, cy_b, LR_LOADFROMFILE)
                hsm = u.LoadImageW(None, icon_path, IMAGE_ICON, cx_s, cy_s, LR_LOADFROMFILE)
                if not hbig and not hsm:
                    log("Icon error: LoadImageW could not parse app.ico")
                    return
                hbig = hbig or hsm
                hsm = hsm or hbig

                our_pid = os.getpid()

                def _main_hwnd():
                    found = []
                    @ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
                    def _cb(hwnd, _lp):
                        pid = wintypes.DWORD()
                        u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                        if (pid.value == our_pid and u.IsWindowVisible(hwnd)
                                and not u.GetWindow(hwnd, 4)  # GW_OWNER == 0 → top-level
                                and u.GetWindowTextLengthW(hwnd) > 0):
                            found.append(hwnd)
                            return False
                        return True
                    u.EnumWindows(_cb, 0)
                    return found[0] if found else None

                def _apply(hwnd):
                    u.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hsm)
                    u.SendMessageW(hwnd, WM_SETICON, ICON_SMALL2, hsm)
                    u.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hbig)
                    try:  # class icons cover any fallback path
                        _set_class(hwnd, GCLP_HICONSM, hsm)
                        _set_class(hwnd, GCLP_HICON, hbig)
                    except Exception:
                        pass

                hwnd = None
                deadline = time.time() + 15  # cold first-run render can take a few seconds
                while time.time() < deadline:
                    hwnd = _main_hwnd()
                    if hwnd:
                        break
                    time.sleep(0.3)
                if not hwnd:
                    log("Icon error: could not find this process's main window")
                    return
                # Apply now, then again as the SPA finishes loading (it changes the
                # window title and can reset the icon) so the NJ icon sticks.
                for _d in (0, 1.0, 2.5, 5.0):
                    if _d:
                        time.sleep(_d)
                    _apply(hwnd)
                log(f"Window icon applied on hwnd={hwnd} (small {cx_s}x{cy_s}, big {cx_b}x{cy_b}).")
            except Exception as e:
                log(f"Failed to force window icon: {e}")

        threading.Thread(target=force_window_icon, daemon=True).start()

        webview.start(icon=icon_path)  # native window; blocks until the user closes it
        log("webview closed normally")
        os._exit(0)  # ensure the daemon server thread + port are released at once
    except Exception as e:
        log("WEBVIEW FAILED -> browser fallback: " + repr(e) + "\n" + traceback.format_exc())
        try:
            import webbrowser
            webbrowser.open(URL)
        except Exception:
            pass
        while True:
            time.sleep(3600)
