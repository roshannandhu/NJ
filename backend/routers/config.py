import json
from copy import deepcopy

from fastapi import APIRouter, Body, Response

from database import get_db
from models import AppConfig
from seed_data import DEFAULT_DATA
import backup_service

router = APIRouter()


def _get_or_create_config(db):
    config = db.query(AppConfig).filter(AppConfig.id == 1).first()
    if config is None:
        seed = deepcopy(DEFAULT_DATA)
        seed.pop("quotations")
        seed.pop("warranty_certificates")
        config = AppConfig(id=1, data=json.dumps(seed))
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get("/api/config")
def get_config():
    db = next(get_db())
    try:
        config = _get_or_create_config(db)
        # The config can contain several MB of embedded warranty artwork.  It is
        # already valid JSON, so avoid a deserialize/re-serialize copy on the
        # small EC2 instance.
        return Response(content=config.data, media_type="application/json")
    finally:
        db.close()

@router.get("/api/version")
def get_version():
    try:
        import os
        from pathlib import Path
        version_file = Path(__file__).parent.parent / "version.json"
        if version_file.exists():
            with open(version_file, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {"version": "1.0.0", "url": ""}


@router.put("/api/config")
def update_config(body: dict = Body(...)):
    db = next(get_db())
    try:
        config = db.query(AppConfig).filter(AppConfig.id == 1).first()
        if config is None:
            config = AppConfig(id=1)
            db.add(config)
        config.data = json.dumps(body)
        db.commit()
        backup_service.mark_catalog_changed()
        # Covers company settings, catalogue (brands/classes/varieties/warranties)
        # and customers (which live inside quotation JSON). Triggers a debounced
        # event backup like any other data change.
        backup_service.notify_change("catalogue", "edited", None)
        return {"status": "saved"}
    finally:
        db.close()
