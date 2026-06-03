"""Global data-revision counter — the foundation of live multi-device sync.

Every endpoint that mutates user data (quotations, warranties, config) calls
``bump()`` after committing. Clients poll ``current()`` (via GET /api/sync/version)
and refetch whenever the number grows. This is deliberately tiny and DB-backed so
it survives restarts and is shared by every connected client of this backend.

When we move to the cloud (Postgres) this same idea scales; later it can be
refined into per-record ``updated_at`` deltas, but a single counter is all the
2-way-sync proof needs.
"""

from database import SessionLocal
from models import SyncState


def bump():
    """Increment and return the global revision. Best-effort: never raises into
    the caller's request path (a failed bump only delays the next client refresh
    until the following write)."""
    db = SessionLocal()
    try:
        row = db.query(SyncState).filter(SyncState.id == 1).first()
        if row is None:
            row = SyncState(id=1, revision=1)
            db.add(row)
        else:
            row.revision = (row.revision or 0) + 1
        db.commit()
        return row.revision
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None
    finally:
        db.close()


def current():
    """Return the current global revision (0 if never bumped)."""
    db = SessionLocal()
    try:
        row = db.query(SyncState).filter(SyncState.id == 1).first()
        return row.revision if row else 0
    except Exception:
        return 0
    finally:
        db.close()
