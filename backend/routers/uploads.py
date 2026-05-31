import time
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from database import DATA_DIR

router = APIRouter()

UPLOADS_DIR = DATA_DIR / "uploads"


@router.post("/api/uploads")
async def upload_file(file: UploadFile = File(...)):
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{int(time.time() * 1000)}_{Path(file.filename).name}" if file.filename else f"{int(time.time() * 1000)}_unnamed"
    dest = UPLOADS_DIR / safe_name
    try:
        content = await file.read()
        dest.write_bytes(content)
    except Exception:
        raise HTTPException(status_code=500, detail="Upload failed")
    return {"url": f"/uploads/{safe_name}", "filename": safe_name}
