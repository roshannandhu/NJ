"""Native folder picker, bridged to the pywebview window.

The desktop launcher (run_app.py) runs the FastAPI backend and the pywebview
window in the SAME process, so a backend route can open a real OS folder dialog
and get back an absolute path (which the File System Access API in the WebView
cannot give us). run_app.py registers its window here once created; in dev /
browser mode no window is registered and `pick_folder` reports unavailable so
the UI falls back to typing the path.
"""

_window = None


def set_window(win):
    """Called once by run_app.py after the pywebview window is created."""
    global _window
    _window = win


def available() -> bool:
    return _window is not None


def pick_folder(initial: str = "") -> dict:
    """Open a native 'choose folder' dialog and return the selected path.

    Returns one of:
      {"available": False}            — no native window (dev/browser) → UI types the path
      {"available": True, "cancelled": True}  — dialog closed without choosing
      {"available": True, "path": "D:\\NJ Backups"}
    Runs on the request's threadpool worker (sync route), never the GUI thread;
    pywebview marshals the dialog to the GUI thread internally.
    """
    if _window is None:
        return {"available": False}
    try:
        import webview
        # Newer pywebview uses the FileDialog enum; older exposes FOLDER_DIALOG.
        folder_type = getattr(getattr(webview, "FileDialog", None), "FOLDER", None)
        if folder_type is None:
            folder_type = webview.FOLDER_DIALOG
        kwargs = {}
        if initial:
            kwargs["directory"] = initial
        result = _window.create_file_dialog(folder_type, **kwargs)
        if not result:
            return {"available": True, "cancelled": True}
        path = result[0] if isinstance(result, (list, tuple)) else result
        return {"available": True, "path": str(path)}
    except Exception as e:  # never 500 the UI — report unavailable so it can fall back
        return {"available": False, "error": str(e)}
