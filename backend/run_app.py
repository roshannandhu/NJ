"""
Production launcher for the NJ India System.

Starts the FastAPI server on http://127.0.0.1:8000 (no auto-reload) and opens
the default browser. Used by the installed app's "Start NJ India" shortcut.

The launcher (Start NJ India.bat) sets NJ_DATA_DIR to a per-user writable folder
before running this, so the database and uploaded images are stored outside the
read-only install directory.
"""

import os
import sys
import threading
import webbrowser

# Embedded Python (used by the installed app) builds sys.path from its ._pth
# file and does NOT add this script's directory automatically, so `main` would
# not be importable. Add it explicitly so `main:app` always resolves.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn

URL = "http://127.0.0.1:8000"


def _open_browser():
    try:
        webbrowser.open(URL)
    except Exception:
        pass


if __name__ == "__main__":
    print("NJ India System is starting...")
    print(f"Opening {URL}")
    print("Keep this window open while you use the app. Close it to quit.")
    # Give the server a moment to bind before opening the browser.
    threading.Timer(2.0, _open_browser).start()
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="warning")
