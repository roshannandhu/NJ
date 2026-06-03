from fastapi import APIRouter, Body, HTTPException, Request

from database import get_db
from models import User
import auth

router = APIRouter()


@router.post("/api/auth/login")
def login(body: dict = Body(...)):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    db = next(get_db())
    try:
        user = db.query(User).filter(User.username == username).first()
        if user is None or not auth.verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        return {
            "token": auth.create_token(user.username, user.role),
            "username": user.username,
            "role": user.role,
        }
    finally:
        db.close()


@router.get("/api/auth/me")
def me(request: Request):
    """Identity of the caller. When auth is disabled (local desktop) returns a
    synthetic 'local' admin so the same frontend works with or without login."""
    if not auth.AUTH_REQUIRED:
        return {"username": "local", "role": "admin", "auth_required": False}
    token = auth.bearer_token(request)
    payload = auth.verify_token(token) if token else None
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "username": payload.get("sub"),
        "role": payload.get("role"),
        "auth_required": True,
    }
