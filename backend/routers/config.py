import json
from copy import deepcopy

from fastapi import APIRouter, Body

from database import get_db
from models import AppConfig
from seed_data import DEFAULT_DATA

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
        return json.loads(config.data)
    finally:
        db.close()


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
        return {"status": "saved"}
    finally:
        db.close()
