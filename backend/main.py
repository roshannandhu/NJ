from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import Base, engine
import models
import backup_service
from routers import backup, config, pdf, quotations, uploads, warranties, warranty_docx

# Create tables before anything tries to read them (backup engine reads state).
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On launch: snapshot the DB before the day's edits, then run the daily
    # auto-backup scheduler. Both are best-effort and never block startup.
    backup_service.run_startup_backup()
    backup_service.start_scheduler()
    yield
    # On shutdown: stop the scheduler and take a final best-effort backup.
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

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.include_router(config.router)
app.include_router(pdf.router)
app.include_router(quotations.router)
app.include_router(uploads.router)
app.include_router(warranties.router)
app.include_router(backup.router)
app.include_router(warranty_docx.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── SPA mount — MUST be last (after all /api routes) ──
DIST = Path(__file__).parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="spa")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
