import threading
import time

from fastapi import APIRouter, Body, HTTPException, Request

from database import get_db
from models import User
import auth

router = APIRouter()

# ── Brute-force throttle ─────────────────────────────────────────────────────
# In-memory per-(IP, username) failure counter with a short lockout. PBKDF2
# already makes guessing slow; this caps online attempts. Per-process (resets on
# restart); good enough for the single-tenant cloud — swap for a shared store if
# scaling to many workers.
_MAX_FAILS = 8          # failures allowed within the window before lockout
_WINDOW = 300           # seconds the failure count accumulates over
_FAILS: dict[str, tuple[int, float]] = {}
_FAILS_LOCK = threading.Lock()


def _fail_key(request: Request, username: str) -> str:
    ip = request.client.host if request and request.client else "?"
    return f"{ip}|{username.lower()}"


def _is_locked(key: str) -> bool:
    with _FAILS_LOCK:
        rec = _FAILS.get(key)
        if not rec:
            return False
        count, first = rec
        if time.time() - first > _WINDOW:
            _FAILS.pop(key, None)
            return False
        return count >= _MAX_FAILS


def _record_fail(key: str) -> None:
    with _FAILS_LOCK:
        count, first = _FAILS.get(key, (0, time.time()))
        if time.time() - first > _WINDOW:
            count, first = 0, time.time()
        _FAILS[key] = (count + 1, first)


def _reset_fail(key: str) -> None:
    with _FAILS_LOCK:
        _FAILS.pop(key, None)


@router.post("/api/auth/login")
def login(request: Request, body: dict = Body(...)):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    key = _fail_key(request, username)
    if _is_locked(key):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in a few minutes.")
    db = next(get_db())
    try:
        user = db.query(User).filter(User.username == username).first()
        if user is None or not auth.verify_password(password, user.password_hash):
            _record_fail(key)
            raise HTTPException(status_code=401, detail="Invalid username or password")
        _reset_fail(key)
        return {
            "token": auth.create_token(user.username, user.role),
            "username": user.username,
            "role": user.role,
        }
    finally:
        db.close()


@router.get("/api/auth/me")
def me(request: Request):
    """Identity of the caller — always 200 so the frontend can branch cleanly.
    When auth is disabled (local desktop) returns a synthetic 'local' admin, so
    the same frontend works with or without login."""
    if not auth.AUTH_REQUIRED:
        return {"auth_required": False, "authenticated": True, "username": "local", "role": "admin"}
    token = auth.bearer_token(request)
    payload = auth.verify_token(token) if token else None
    if not payload:
        return {"auth_required": True, "authenticated": False}
    return {
        "auth_required": True,
        "authenticated": True,
        "username": payload.get("sub"),
        "role": payload.get("role"),
    }
