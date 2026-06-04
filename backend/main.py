from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import Base, engine, DATA_DIR, ensure_columns
import models
import backup_service
from routers import backup, config, quotations, uploads, warranties, warranty_docx, share

# Create tables before anything tries to read them (backup engine reads state),
# then add any columns missing on databases that predate them.
Base.metadata.create_all(bind=engine)
ensure_columns()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On launch: snapshot the DB before the day's edits, then run the daily
    # auto-backup scheduler, the debounced event-backup worker, and the
    # verification/auto-recovery loop. All are best-effort daemons that never
    # block startup.
    backup_service.run_startup_backup()
    backup_service.start_scheduler()
    backup_service.start_event_worker()
    backup_service.start_verification_loop()
    yield
    # On shutdown: stop the background workers and take a final best-effort backup.
    backup_service.stop_verification_loop()
    backup_service.stop_event_worker()
    backup_service.stop_scheduler()
    backup_service.make_backup_safe("shutdown")


app = FastAPI(title="NJ India System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
