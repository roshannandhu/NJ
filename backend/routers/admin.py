"""Admin/data-migration endpoints.

`export` returns the full data payload (config + quotations + warranties) from the
CURRENT database; `import` merges a payload INTO the current database. Together
they move existing local data up to the cloud:

    local  GET  /api/admin/export   →  payload JSON
    cloud  POST /api/admin/import    ←  payload JSON   (mode=merge, non-destructive)

Reuses backup_service.build_payload / restore_from_payload so the merge logic and
safety snapshot are identical to the Backup/Recovery feature. When auth is enabled
(cloud) these routes require a valid token like every other /api route.
"""

from fastapi import APIRouter, Body, HTTPException, Request

import auth
import backup_service
import sync_state

router = APIRouter()


def _require_admin(request: Request):
    """Authorize admin-only routes. The middleware already proves the caller is
    authenticated (in cloud mode); this additionally requires the admin role, so
    a plain 'manager' cannot export the whole database or run a destructive
    replace-import. On the local desktop the synthetic caller is admin (no-op)."""
    _, role = auth.current_identity(request)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


@router.get("/api/admin/export")
def export_all(request: Request):
    """Full data payload of the current database (admin only)."""
    _require_admin(request)
    return backup_service.build_payload()


@router.post("/api/admin/import")
def import_all(request: Request, body: dict = Body(...), mode: str = "merge"):
    """Merge (default) or replace the current database with a payload (admin
    only). Accepts either the raw payload or {"payload": {...}}."""
    _require_admin(request)
    payload = body.get("payload") if isinstance(body, dict) and "payload" in body else body
    if mode not in ("merge", "replace"):
        mode = "merge"
    try:
        result = backup_service.restore_from_payload(payload, mode=mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    sync_state.bump()
    return {"status": "imported", "mode": mode, "result": result}
