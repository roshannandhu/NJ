"""One-time data migration: push your LOCAL data up to the CLOUD.

Reads the local SQLite database (the same data the desktop app uses), logs in to
the deployed cloud API, and imports everything via /api/admin/import (merge — it
never deletes anything already in the cloud).

Usage (run on the PC that has the data):

    python migrate_to_cloud.py --url https://your-api.example.com \
        --user admin --password "your-admin-password"

Standard-library only — no extra packages needed.
"""

import argparse
import json
import os
import sys
import urllib.request


def _default_data_dir():
    # Mirror run_app.py: the installed app keeps data in %LOCALAPPDATA%\NJ India Data.
    base = os.environ.get("LOCALAPPDATA") or os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "NJ India Data")


def _post_json(url, payload, token=None):
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    ap = argparse.ArgumentParser(description="Migrate local NJ India data to the cloud.")
    ap.add_argument("--url", required=True, help="Cloud API base URL, e.g. https://nj-india-api.onrender.com")
    ap.add_argument("--user", required=True, help="Cloud admin username")
    ap.add_argument("--password", required=True, help="Cloud admin password")
    ap.add_argument("--data-dir", default=None, help="Override the local data dir (where nj_india.db lives)")
    args = ap.parse_args()

    # Point the backend modules at the local data BEFORE importing them.
    os.environ.pop("DATABASE_URL", None)  # ensure we read the LOCAL SQLite, not a cloud DB
    os.environ.setdefault("NJ_DATA_DIR", args.data_dir or _default_data_dir())

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import backup_service  # noqa: E402  (import after env is set)

    payload = backup_service.build_payload()
    nq = len(payload.get("quotations", []))
    nw = len(payload.get("warranty_certificates", []))
    print(f"Local data: {nq} quotations, {nw} warranties, "
          f"{len((payload.get('config') or {}).get('classes', []))} catalogue classes.")

    base = args.url.rstrip("/")
    print("Logging in to the cloud...")
    login = _post_json(f"{base}/api/auth/login", {"username": args.user, "password": args.password})
    token = login["token"]

    print("Uploading (merge)...")
    result = _post_json(f"{base}/api/admin/import", payload, token=token)
    print("Done:", json.dumps(result.get("result", result), indent=2))


if __name__ == "__main__":
    main()
