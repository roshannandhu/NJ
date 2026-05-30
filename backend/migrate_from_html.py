"""
One-time migration: bring data from the OLD single-file HTML app
(`nj-quotation-warranty-system.html`, which stored everything in the browser's
localStorage) into the NEW React + FastAPI + SQLite app.

You only need this if your real history is still trapped in the old HTML app.
See BACKUP_RECOVERY.md → "Is my data in the old app?" to check.

────────────────────────────────────────────────────────────────────────────
HOW TO GET THE OLD DATA FILE
  1. Open  nj-quotation-warranty-system.html  in the SAME browser/profile you
     used historically (double-click it).
  2. Go to Settings → Security → "Export Data". It downloads a file named
     nj_backup_YYYY-MM-DD.json  (this is your old data).
        — OR, if the Export button doesn't work: open the page, press F12,
          Application → Local Storage → the file:// entry → copy the value of
          the key  nj_app_data_v1  into a .json file.

HOW TO MIGRATE
  # 1) just convert (safe — writes a new file, changes nothing else):
  python migrate_from_html.py  nj_backup_2026-05-20.json

  # 2) convert AND load it into the running app (REPLACES current data; the app
  #    auto-snapshots current data first):
  python migrate_from_html.py  nj_backup_2026-05-20.json  --apply

  After --apply (or after importing the produced file via the app's
  Settings → Security & Backup → "Restore from file…"), reload the app.
────────────────────────────────────────────────────────────────────────────
"""
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

CONFIG_KEYS = ("company", "settings", "classes", "varieties", "warranties")
OUT = "migrated_for_restore.json"
API = "http://127.0.0.1:8000/api/restore"


def to_restore_payload(old):
    """Map the old flat DATA object → the new {config, quotations,
    warranty_certificates} restore shape. Idempotent if already nested."""
    if not isinstance(old, dict):
        raise SystemExit("ERROR: file is not a JSON object — wrong file?")

    # Already in the new shape? (e.g. an export from the new app)
    if "config" in old and ("quotations" in old or "warranty_certificates" in old):
        payload = {
            "config": old.get("config", {}),
            "quotations": old.get("quotations", []),
            "warranty_certificates": old.get("warranty_certificates", []),
        }
    else:
        payload = {
            "config": {k: old[k] for k in CONFIG_KEYS if k in old},
            "quotations": old.get("quotations", []),
            "warranty_certificates": old.get("warranty_certificates", []),
        }

    if not payload["config"]:
        print("WARNING: no company/settings/classes/varieties/warranties found — "
              "the file may not be an NJ backup.")
    return payload


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv[1:]
    if not args:
        print(__doc__)
        raise SystemExit("Pass the path to your old export .json file.")

    src = Path(args[0])
    if not src.exists():
        raise SystemExit(f"ERROR: file not found: {src}")

    old = json.loads(src.read_text(encoding="utf-8"))
    payload = to_restore_payload(old)

    cfg = payload["config"]
    print("\n── Migration summary ──")
    print(f"  classes:     {len(cfg.get('classes', []))}")
    print(f"  varieties:   {len(cfg.get('varieties', []))}")
    print(f"  warranties:  {len(cfg.get('warranties', []))}")
    print(f"  quotations:  {len(payload['quotations'])}")
    print(f"  warranty certificates: {len(payload['warranty_certificates'])}")

    Path(OUT).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT}")

    if not apply:
        print("\nNext: in the app, Settings → Security & Backup → 'Restore from file…' "
              f"and choose {OUT}.  (Or re-run with --apply to load it directly.)")
        return

    print(f"\nApplying to {API} (this REPLACES current data; a safety snapshot is "
          "taken automatically) …")
    req = urllib.request.Request(
        API, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print("Server:", resp.read().decode("utf-8"))
        print("Done. Reload the app to see your migrated data.")
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Could not reach the app at {API}. Start it with start.bat first, "
            f"then re-run with --apply.\n  detail: {e}"
        )


if __name__ == "__main__":
    main()
