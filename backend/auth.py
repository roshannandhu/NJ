"""Authentication primitives — standard-library only (no extra dependencies).

Password hashing uses PBKDF2-HMAC-SHA256 (hashlib); tokens are compact
HMAC-SHA256-signed JWTs built with hmac/base64/json. This keeps the desktop
installer lean while giving the cloud deployment real login security.

Behaviour is controlled by environment variables (all optional):
  NJ_AUTH_REQUIRED         "1"/"true" → enforce login on /api routes (cloud).
                           Unset/false → open (local desktop, unchanged).
  NJ_JWT_SECRET            HMAC signing secret. MUST be set to a strong random
                           value in the cloud; a dev default is used otherwise.
  NJ_TOKEN_TTL_SECONDS     token lifetime (default 7 days).
  NJ_BOOTSTRAP_ADMIN_USER / NJ_BOOTSTRAP_ADMIN_PASSWORD
                           if set and the user doesn't exist, an admin account is
                           created on startup (first-run bootstrap for the cloud).
"""

import base64
import hashlib
import hmac
import json
import os
import time

SECRET = os.environ.get("NJ_JWT_SECRET", "dev-insecure-secret-change-in-cloud")
AUTH_REQUIRED = os.environ.get("NJ_AUTH_REQUIRED", "").strip().lower() in (
    "1", "true", "yes", "on",
)
TOKEN_TTL = int(os.environ.get("NJ_TOKEN_TTL_SECONDS", str(7 * 24 * 3600)))

_PBKDF2_ITERATIONS = 200_000


# ── Password hashing ──────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters)
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# ── Compact JWT (HS256) ───────────────────────────────────────────────────
def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _b64u_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(username: str, role: str) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": username, "role": role, "iat": now, "exp": now + TOKEN_TTL}
    seg = (
        _b64u(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64u(json.dumps(payload, separators=(",", ":")).encode())
    )
    sig = hmac.new(SECRET.encode(), seg.encode(), hashlib.sha256).digest()
    return seg + "." + _b64u(sig)


def verify_token(token: str):
    """Return the decoded payload dict for a valid, unexpired token, else None."""
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        seg = header_b64 + "." + payload_b64
        expected = _b64u(hmac.new(SECRET.encode(), seg.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, sig_b64):
            return None
        payload = json.loads(_b64u_decode(payload_b64))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def bearer_token(request) -> str | None:
    """Extract a Bearer token from a Starlette/FastAPI request, or None."""
    h = request.headers.get("authorization") or request.headers.get("Authorization")
    if h and h.lower().startswith("bearer "):
        return h[7:].strip()
    return None


def bootstrap_admin():
    """First-run helper for the cloud: create an admin account from
    NJ_BOOTSTRAP_ADMIN_USER / _PASSWORD if it doesn't already exist. No-op when
    those env vars are unset (i.e. always a no-op on the local desktop)."""
    username = os.environ.get("NJ_BOOTSTRAP_ADMIN_USER")
    password = os.environ.get("NJ_BOOTSTRAP_ADMIN_PASSWORD")
    if not username or not password:
        return
    # Imported lazily to avoid import cycles at module load.
    from database import SessionLocal
    from models import User

    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first() is None:
            db.add(User(username=username, password_hash=hash_password(password), role="admin"))
            db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()
