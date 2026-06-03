import datetime

from fastapi import APIRouter

import sync_state

router = APIRouter()


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
