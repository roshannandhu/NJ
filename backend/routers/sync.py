import datetime
import json

from fastapi import APIRouter

from database import get_db
from models import Quotation, WarrantyCertificate
import sync_state
import migrations

# Add any missing columns (e.g. updated_at) to existing databases on startup.
# Imported/run here so we don't need a hook in main.py. Idempotent, best-effort.
migrations.ensure_columns()

router = APIRouter()


def _parse_since(since):
    """Parse an ISO timestamp (optionally trailing 'Z'); return None if absent
    or unparseable (callers then treat it as 'give me everything')."""
    if not since:
        return None
    try:
        return datetime.datetime.fromisoformat(since.replace("Z", ""))
    except Exception:
        return None


@router.get("/api/sync/version")
def sync_version():
    """Cheap heartbeat for polling clients. ``revision`` grows on every data
    mutation; ``server_time`` lets clients show 'last synced' info. The PC and
    every phone poll this to know when to refetch — giving live 2-way sync with
    a single source of truth."""
    return {
        "revision": sync_state.current(),
        "server_time": datetime.datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/sync/changes")
def sync_changes(since: str = ""):
    """Delta sync: return quotations + warranties changed at or after ``since``
    (ISO time). With no ``since`` it returns everything — so a client can do a
    first full pull, then ask only for what changed. Lets the phone refresh
    cheaply instead of refetching the whole history each time.

    NOTE: deletions are not carried here yet (no tombstones); clients still learn
    about deletes via the revision bump + a periodic full list. ``server_time``
    is what the caller should pass back as the next ``since``."""
    cutoff = _parse_since(since)
    db = next(get_db())
    try:
        def rows(model):
            q = db.query(model)
            if cutoff is not None:
                # Include rows with no updated_at (legacy) only on a full pull.
                q = q.filter(model.updated_at != None, model.updated_at >= cutoff)  # noqa: E711
            return [json.loads(r.data) for r in q.all()]

        return {
            "quotations": rows(Quotation),
            "warranty_certificates": rows(WarrantyCertificate),
            "revision": sync_state.current(),
            "server_time": datetime.datetime.utcnow().isoformat() + "Z",
        }
    finally:
        db.close()
