"""
Catalogue backup / restore must carry ALL quotation settings — specifically the
nested `banks` list and `classTerms`/`commonTerms` — so bank details and Terms &
Conditions survive an export→restore round-trip and a merge never wipes existing
banks. Regression coverage for the shallow-settings-merge bug in _apply_config.
"""
import json

from database import SessionLocal
from models import AppConfig
import backup_service


# ── helpers ───────────────────────────────────────────────────────────────────
def _set_settings(settings):
    db = SessionLocal()
    try:
        row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        cfg = json.loads(row.data)
        cfg["settings"] = settings
        row.data = json.dumps(cfg)
        db.commit()
    finally:
        db.close()


def _get_settings():
    db = SessionLocal()
    try:
        row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        return json.loads(row.data).get("settings", {})
    finally:
        db.close()


def _bank(bid, name):
    return {"id": bid, "bankName": name, "accountNumber": "123", "ifsc": "X",
            "upiId": "", "logo": "", "qr": "", "order": 0, "active": True}


def _catalog_payload(settings):
    """A catalogue backup payload (as written into backup.json) with given settings."""
    return {
        "kind": backup_service.KIND_CATALOG,
        "config": {"company": {"name": "NJ"}, "settings": settings,
                   "brands": [], "classes": [], "varieties": [], "warranties": []},
    }


# ── tests ─────────────────────────────────────────────────────────────────────
def test_catalog_payload_includes_banks_and_terms():
    _set_settings({"taxRate": 18, "commonTerms": "Pay in advance",
                   "banks": [_bank("b1", "HDFC")]})
    payload = backup_service.build_catalog_payload()
    s = payload["config"]["settings"]
    assert s["commonTerms"] == "Pay in advance"
    assert [b["id"] for b in s["banks"]] == ["b1"]


def test_merge_restore_adds_banks_to_settings_without_any():
    # Live config has NO banks / terms; the backup does.
    _set_settings({"taxRate": 18, "banks": [], "commonTerms": ""})
    payload = _catalog_payload({"taxRate": 18, "commonTerms": "T&C from backup",
                                "banks": [_bank("b1", "HDFC")]})
    backup_service.restore_catalog_payload(payload, mode="merge")
    s = _get_settings()
    assert [b["id"] for b in s["banks"]] == ["b1"]
    assert s["commonTerms"] == "T&C from backup"


def test_merge_restore_unions_banks_and_keeps_existing():
    # Live has bank A; the backup has bank B → both survive (union by id),
    # and a matching id is updated in place.
    _set_settings({"banks": [_bank("a", "Existing"), _bank("c", "Common")],
                   "commonTerms": "live"})
    payload = _catalog_payload({"banks": [_bank("b", "FromBackup"),
                                          {**_bank("c", "Common-updated")}],
                                "commonTerms": "backup"})
    backup_service.restore_catalog_payload(payload, mode="merge")
    s = _get_settings()
    by_id = {b["id"]: b for b in s["banks"]}
    assert set(by_id) == {"a", "b", "c"}          # existing kept + new added
    assert by_id["c"]["bankName"] == "Common-updated"  # matching id updated
    assert by_id["a"]["bankName"] == "Existing"        # untouched existing kept


def test_replace_restore_sets_banks_exactly():
    _set_settings({"banks": [_bank("a", "Existing")], "commonTerms": "live"})
    payload = _catalog_payload({"banks": [_bank("b", "FromBackup")],
                                "commonTerms": "backup"})
    backup_service.restore_catalog_payload(payload, mode="replace")
    s = _get_settings()
    assert [b["id"] for b in s["banks"]] == ["b"]   # replace = exactly the backup
    assert s["commonTerms"] == "backup"


def test_merge_restore_merges_class_terms_by_key():
    _set_settings({"classTerms": {"c1": "live-1", "default": "live-def"}})
    payload = _catalog_payload({"classTerms": {"c2": "backup-2", "default": "backup-def"}})
    backup_service.restore_catalog_payload(payload, mode="merge")
    ct = _get_settings()["classTerms"]
    assert ct["c1"] == "live-1"           # existing key kept
    assert ct["c2"] == "backup-2"         # new key added
    assert ct["default"] == "backup-def"  # overlapping key: backup wins
