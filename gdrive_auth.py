"""
NJ India — Google Drive one-time setup
Run this ONCE on your Windows PC to connect Google Drive backup.
It opens your browser, you sign in with Gmail, done.
After this, EC2 will automatically back up to your Google Drive every day.

Usage:  python gdrive_auth.py
"""
import base64
import hashlib
import json
import secrets
import socket
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

import os
CLIENT_ID     = os.environ.get("GDRIVE_CLIENT_ID", "YOUR_CLIENT_ID_HERE")
CLIENT_SECRET = os.environ.get("GDRIVE_CLIENT_SECRET", "YOUR_CLIENT_SECRET_HERE")
FOLDER_ID     = os.environ.get("GDRIVE_FOLDER_ID", "YOUR_FOLDER_ID_HERE")
EC2_URL       = "http://18.61.159.169:8000"
SCOPE         = "https://www.googleapis.com/auth/drive.file"


def _pkce():
    verifier  = secrets.token_urlsafe(64)
    digest    = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _post(url, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(url, data=data, method="POST",
                                   headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _put(url, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(url, data=data, method="PUT",
                                   headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    verifier, challenge = _pkce()
    port        = _free_port()
    redirect    = f"http://localhost:{port}/"
    state       = secrets.token_urlsafe(16)

    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id":             CLIENT_ID,
        "redirect_uri":          redirect,
        "response_type":         "code",
        "scope":                 SCOPE,
        "state":                 state,
        "code_challenge":        challenge,
        "code_challenge_method": "S256",
        "access_type":           "offline",
        "prompt":                "consent",
    })

    holder = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            p = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            holder["code"]  = p.get("code",  [None])[0]
            holder["error"] = p.get("error", [None])[0]
            holder["state"] = p.get("state", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h2>Done! You can close this tab.</h2>")
        def log_message(self, *_): pass

    httpd         = HTTPServer(("127.0.0.1", port), Handler)
    httpd.timeout = 1

    print("Opening Google sign-in in your browser...")
    webbrowser.open(auth_url)

    deadline = time.time() + 180
    while not holder and time.time() < deadline:
        httpd.handle_request()

    if holder.get("error"):
        print(f"Error from Google: {holder['error']}")
        return
    if not holder.get("code"):
        print("Timed out — no response received from browser after 3 minutes.")
        return
    if holder.get("state") != state:
        print("Security error: state mismatch. Try again.")
        return

    print("Sign-in received. Exchanging code for tokens...")

    token_body = urllib.parse.urlencode({
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code":          holder["code"],
        "redirect_uri":  redirect,
        "grant_type":    "authorization_code",
        "code_verifier": verifier,
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token",
                                  data=token_body,
                                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        token = json.loads(r.read())

    if "error" in token:
        print(f"Token error: {token}")
        return

    print("Saving credentials to EC2 server...")

    _put(f"{EC2_URL}/api/backup/cloud/gdrive/config", {
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "folder_id":     FOLDER_ID,
    })

    _post(f"{EC2_URL}/api/backup/cloud/gdrive/set-token", token)

    print()
    print("✓ Google Drive connected successfully!")
    print(f"  Backups will go to your Google Drive folder ID: {FOLDER_ID}")
    print("  The server will keep the last 30 backups and auto-delete older ones.")
    print()
    print("  You can close this window.")


if __name__ == "__main__":
    main()
