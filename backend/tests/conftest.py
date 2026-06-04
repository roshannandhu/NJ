"""
Test harness for the Smart Backup & Recovery system.

We point NJ_DATA_DIR / NJ_DB_PATH at a throwaway temp directory *before* importing
the app modules (database.py binds its engine at import time), so tests never touch
the real database or the seller's Documents\\NJ India Backups folder.
"""
import os
import sys
import json
import shutil
import tempfile
from pathlib import Path
from datetime import datetime

import pytest

# ── Redirect all app data to a throwaway dir BEFORE importing the app ──────────
_TEST_DIR = Path(tempfile.mkdtemp(prefix="nj_test_"))
os.environ["NJ_DATA_DIR"] = str(_TEST_DIR)
os.environ["NJ_DB_PATH"] = str(_TEST_DIR / "nj_test.db")

# Make the backend package importable when pytest runs from the repo root.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from database import Base, engine, SessionLocal, ensure_columns  # noqa: E402
import models  # noqa: E402,F401
from models import AppConfig, Quotation, WarrantyCertificate  # noqa: E402
import backup_service  # noqa: E402
from seed_data import DEFAULT_DATA  # noqa: E402

Base.metadata.create_all(bind=engine)
ensure_columns()

_BACKUP_DIR = _TEST_DIR / "backups"
_UPLOADS_DIR = backup_service.UPLOADS_DIR


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TEST_DIR, ignore_errors=True)


def _reset_state():
    """Backup state with only a local target enabled, pointed at a clean temp
    folder. Auto-recover on, no cached scan/log."""
    state = backup_service.default_state()
    state["targets"] = {
        "local": {"enabled": True, "path": str(_BACKUP_DIR)},
        "usb": {"enabled": False, "path": ""},
        "dropbox": {"enabled": False, "path": ""},
        "gdrive": {"enabled": False, "path": ""},
        "onedrive": {"enabled": False, "path": ""},
    }
    backup_service.set_state(state)


@pytest.fixture(autouse=True)
def clean_env():
    """Fresh DB, config, backup folder and uploads folder before every test."""
    db = SessionLocal()
    try:
        db.query(Quotation).delete()
        db.query(WarrantyCertificate).delete()
        db.query(AppConfig).delete()
        row = AppConfig(id=1, data=json.dumps({
            "company": dict(DEFAULT_DATA["company"]),
            "settings": dict(DEFAULT_DATA["settings"]),
            "brands": [dict(b) for b in DEFAULT_DATA["brands"]],
            "classes": [], "varieties": [], "warranties": [],
        }))
        db.add(row)
        db.commit()
    finally:
        db.close()

    shutil.rmtree(_BACKUP_DIR, ignore_errors=True)
    _BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(_UPLOADS_DIR, ignore_errors=True)
    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    _reset_state()
    yield


# ── helpers exposed to tests ──────────────────────────────────────────────────
def _q_data(qid, version=1, customer="Acme", total=1000.0, extra=None):
    d = {"id": qid, "customer": {"name": customer}, "grandTotal": total,
         "date": "2026-06-04", "version": version,
         "updatedAt": datetime.utcnow().isoformat()}
    if extra:
        d.update(extra)
    return d


def _w_data(wid, qid, version=1, customer="Acme", extra=None):
    d = {"id": wid, "quotationId": qid, "customer": {"name": customer},
         "date": "2026-06-04", "version": version,
         "updatedAt": datetime.utcnow().isoformat()}
    if extra:
        d.update(extra)
    return d


@pytest.fixture
def seed():
    """Factory helpers that write records straight to the DB with a chosen
    version, so conflict tests can control which copy is 'newer'."""
    def add_quotation(qid, version=1, customer="Acme", total=1000.0, extra=None):
        data = _q_data(qid, version, customer, total, extra)
        db = SessionLocal()
        try:
            row = db.query(Quotation).filter(Quotation.id == qid).first()
            if row is None:
                row = Quotation(id=qid)
                db.add(row)
            row.customer_name = customer
            row.grand_total = total
            row.date = data["date"]
            row.version = version
            row.data = json.dumps(data)
            db.commit()
        finally:
            db.close()
        return data

    def add_warranty(wid, qid, version=1, customer="Acme", extra=None):
        data = _w_data(wid, qid, version, customer, extra)
        db = SessionLocal()
        try:
            row = db.query(WarrantyCertificate).filter(WarrantyCertificate.id == wid).first()
            if row is None:
                row = WarrantyCertificate(id=wid)
                db.add(row)
            row.quotation_id = qid
            row.customer_name = customer
            row.date = data["date"]
            row.version = version
            row.data = json.dumps(data)
            db.commit()
        finally:
            db.close()
        return data

    def set_brands(brands):
        db = SessionLocal()
        try:
            row = db.query(AppConfig).filter(AppConfig.id == 1).first()
            cfg = json.loads(row.data)
            cfg["brands"] = brands
            row.data = json.dumps(cfg)
            db.commit()
        finally:
            db.close()

    def get_brands():
        db = SessionLocal()
        try:
            row = db.query(AppConfig).filter(AppConfig.id == 1).first()
            return json.loads(row.data).get("brands", [])
        finally:
            db.close()

    def add_image(name, content=b"\x89PNG\r\n\x1a\nFAKE"):
        p = _UPLOADS_DIR / name
        p.write_bytes(content)
        return p

    helpers = type("Seed", (), {})()
    helpers.add_quotation = staticmethod(add_quotation)
    helpers.add_warranty = staticmethod(add_warranty)
    helpers.set_brands = staticmethod(set_brands)
    helpers.get_brands = staticmethod(get_brands)
    helpers.add_image = staticmethod(add_image)
    return helpers


@pytest.fixture
def make_backup():
    """Create a verified backup set (always including the uploads ZIP) and return
    its manifest."""
    def _make():
        return backup_service.make_backup("manual", force_catalog=True)
    return _make


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Expose dirs to tests that need them.
@pytest.fixture
def dirs():
    obj = type("Dirs", (), {})()
    obj.data = _TEST_DIR
    obj.backups = _BACKUP_DIR
    obj.uploads = _UPLOADS_DIR
    return obj
