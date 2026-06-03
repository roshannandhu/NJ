import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from database import Base, engine, DATA_DIR, IS_SQLITE
import models
import backup_service
import auth
from routers import backup, config, quotations, uploads, warranties, warranty_docx, share, sync, admin
from routers import auth as auth_router

# Refuse to start in a dangerous cloud config (auth on + default JWT secret).
# No-op on the local desktop where auth is disabled.
auth.assert_secure_config()
# Create tables before anything tries to read them (backup engine reads state).
Base.metadata.create_all(bind=engine)
# First-run cloud admin (no-op locally / when bootstrap env vars are unset).
auth.bootstrap_admin()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The file-copy backup scheduler is SQLite-only; on hosted Postgres the
    # provider handles backups, so skip it to avoid touching a non-existent file.
    if IS_SQLITE:
        # On launch: snapshot the DB before the day's edits, then run the daily
        # auto-backup scheduler. Both are best-effort and never block startup.
        backup_service.run_startup_backup()
        backup_service.start_scheduler()
    yield
    if IS_SQLITE:
        # On shutdown: stop the scheduler and take a final best-effort backup.
        backup_service.stop_scheduler()
        backup_service.make_backup_safe("shutdown")


app = FastAPI(title="NJ India System", lifespan=lifespan)

# CORS origins: comma-separated NJ_CORS_ORIGINS locks the API to specific
# domains in the cloud; unset keeps the open "*" the local same-origin desktop
# app has always used. With "*" we must NOT allow credentials (browsers reject
# that combo, and the app authenticates with Bearer tokens, not cookies).
_cors_env = os.environ.get("NJ_CORS_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth gate ──────────────────────────────────────────────────────────────
# Only active when NJ_AUTH_REQUIRED is set (i.e. the cloud deployment). It leaves
# the SPA, uploads and the login/health endpoints public, and requires a valid
# Bearer token for every other /api route. On the local desktop this is a no-op,
# so nothing about the offline app changes.
_AUTH_PUBLIC = ("/api/health",)


@app.middleware("http")
async def _auth_gate(request, call_next):
    if auth.AUTH_REQUIRED:
        path = request.url.path
        if (
            path.startswith("/api/")
            and path not in _AUTH_PUBLIC
            and not path.startswith("/api/auth/")
        ):
            token = auth.bearer_token(request)
            if not token or not auth.verify_token(token):
                return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    return await call_next(request)

UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.include_router(config.router)
app.include_router(quotations.router)
app.include_router(uploads.router)
app.include_router(warranties.router)
app.include_router(backup.router)
app.include_router(warranty_docx.router)
app.include_router(share.router)
app.include_router(sync.router)
app.include_router(auth_router.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── SPA mount — MUST be last (after all /api routes) ──
# Prefer a "dist" folder bundled next to the backend (installer layout);
# fall back to ../frontend/dist for local development.
_bundled_dist = Path(__file__).parent / "dist"
_dev_dist = Path(__file__).parent.parent / "frontend" / "dist"
DIST = _bundled_dist if _bundled_dist.exists() else _dev_dist
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="spa")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
