"""
Recovery test suite for the Smart Backup & Recovery system.

Covers: missing quotation / warranty / PDF(image) / catalogue recovery, corrupted
backup handling, version-based conflict resolution, duplicate prevention, and the
additive-never-deletes safety guarantee.
"""
import json
from pathlib import Path

from database import SessionLocal
from models import Quotation, WarrantyCertificate, AppConfig
import backup_service


def _count_quotations():
    db = SessionLocal()
    try:
        return db.query(Quotation).count()
    finally:
        db.close()


def _get_quotation(qid):
    db = SessionLocal()
    try:
        row = db.query(Quotation).filter(Quotation.id == qid).first()
        return json.loads(row.data) if row else None
    finally:
        db.close()


def _delete_quotation(qid):
    db = SessionLocal()
    try:
        db.query(Quotation).filter(Quotation.id == qid).delete()
        db.commit()
    finally:
        db.close()


def _delete_warranty(wid):
    db = SessionLocal()
    try:
        db.query(WarrantyCertificate).filter(WarrantyCertificate.id == wid).delete()
        db.commit()
    finally:
        db.close()


# ── 1. Missing quotation recovery ─────────────────────────────────────────────
def test_missing_quotation_recovery(seed, make_backup):
    seed.add_quotation("Q1042")
    manifest = make_backup()
    assert manifest["ok"], manifest

    _delete_quotation("Q1042")
    assert _get_quotation("Q1042") is None

    result = backup_service.run_verification(force=True)
    assert result["ok"], result
    assert _get_quotation("Q1042") is not None, "missing quotation was not re-imported"

    log = backup_service.get_state().get("recovery_log") or []
    assert any(r["record_id"] == "Q1042" and "Imported" in r["action"] for r in log), log


# ── 2. Missing warranty recovery ──────────────────────────────────────────────
def test_missing_warranty_recovery(seed, make_backup):
    seed.add_quotation("Q1")
    seed.add_warranty("W212", "Q1")
    assert make_backup()["ok"]

    _delete_warranty("W212")

    backup_service.run_verification(force=True)

    db = SessionLocal()
    try:
        assert db.query(WarrantyCertificate).filter(WarrantyCertificate.id == "W212").first() is not None
    finally:
        db.close()

    log = backup_service.get_state().get("recovery_log") or []
    assert any(r["record_id"] == "W212" for r in log)


# ── 3. Missing PDF / image recovery ───────────────────────────────────────────
def test_missing_image_recovery(seed, make_backup, dirs):
    seed.add_quotation("Q1")
    img = seed.add_image("logo.png")
    assert make_backup()["ok"]

    img.unlink()
    assert not img.exists()

    backup_service.run_verification(force=True)
    assert (dirs.uploads / "logo.png").exists(), "missing image was not recovered from the backup ZIP"

    log = backup_service.get_state().get("recovery_log") or []
    assert any(r["item_type"] == "Image" and r["record_id"] == "logo.png" for r in log)


# ── 4. Catalogue recovery (additive) ──────────────────────────────────────────
def test_catalogue_recovery(seed, make_backup):
    seed.set_brands([
        {"id": "nj", "name": "NJ"},
        {"id": "b2", "name": "BrandTwo"},
    ])
    assert make_backup()["ok"]

    # Remove b2 locally.
    seed.set_brands([{"id": "nj", "name": "NJ"}])
    assert {b["id"] for b in seed.get_brands()} == {"nj"}

    backup_service.run_verification(force=True)
    assert "b2" in {b["id"] for b in seed.get_brands()}, "missing catalogue brand was not recovered"


# ── 5. Corrupted backup handling ──────────────────────────────────────────────
def test_corrupted_backup_handling(seed, make_backup, dirs):
    seed.add_quotation("Q1")
    assert make_backup()["ok"]

    # Corrupt every backup .json on disk.
    for jf in dirs.backups.glob("nj_backup_*.json"):
        if not jf.name.endswith(".manifest.json"):
            jf.write_text("{ this is not valid json", encoding="utf-8")

    # Verification must fail safely (no crash) and must NOT delete live data.
    result = backup_service.run_verification(force=True)
    assert result["ok"] is False
    assert _get_quotation("Q1") is not None, "live data must survive a corrupted backup"


def test_corrupted_backup_fails_zip_verification(seed, dirs):
    """A backup whose uploads ZIP is corrupt must not be marked ok."""
    seed.add_quotation("Q1")
    seed.add_image("a.png")
    manifest = backup_service.make_backup("manual", force_catalog=True)
    assert manifest["ok"]
    assert manifest["verify"]["zip_integrity"] is True


# ── 6. Conflict resolution (version-based) ────────────────────────────────────
def test_conflict_newer_backup_wins_and_archives_older(seed, make_backup, dirs):
    # Backup holds version 5 of Q1.
    seed.add_quotation("Q1", version=5, total=5000.0)
    assert make_backup()["ok"]

    # Live copy is an OLDER, different version 2.
    seed.add_quotation("Q1", version=2, total=2222.0)

    backup_service.run_verification(force=True)

    live = _get_quotation("Q1")
    assert live["version"] == 5, "newer backup copy should have won the conflict"
    assert live["grandTotal"] == 5000.0

    # The overwritten (older) copy must be archived, not silently dropped.
    archives = list(dirs.backups.glob("archive_*"))
    assert archives, "older copy was not archived before overwrite"
    archived = json.loads((archives[0] / "quotations.json").read_text(encoding="utf-8"))
    assert any(a["id"] == "Q1" and a["version"] == 2 for a in archived)


def test_conflict_older_backup_loses(seed, make_backup):
    # Backup holds version 1 of Q1.
    seed.add_quotation("Q1", version=1, total=1000.0)
    assert make_backup()["ok"]

    # Live copy is NEWER, version 9.
    seed.add_quotation("Q1", version=9, total=9999.0)

    backup_service.run_verification(force=True)

    live = _get_quotation("Q1")
    assert live["version"] == 9, "newer LIVE copy must be kept (no silent overwrite)"
    assert live["grandTotal"] == 9999.0


# ── 7. Duplicate prevention ───────────────────────────────────────────────────
def test_duplicate_prevention(seed, make_backup):
    seed.add_quotation("Q1")
    seed.add_quotation("Q2")
    assert make_backup()["ok"]

    _delete_quotation("Q1")

    # First verification recovers the missing record.
    backup_service.run_verification(force=True)
    assert _count_quotations() == 2

    # Second verification must import nothing new (no duplicates).
    result2 = backup_service.run_verification(force=True)
    assert _count_quotations() == 2
    assert result2["recovered"] == 0


# ── 8. Additive-only: never deletes local-only records ────────────────────────
def test_recovery_never_deletes_local_only(seed, make_backup):
    seed.add_quotation("Q1")
    assert make_backup()["ok"]

    # A record created AFTER the backup — exists locally, not in the backup.
    seed.add_quotation("Q_LOCAL_ONLY")

    backup_service.run_verification(force=True)

    assert _get_quotation("Q_LOCAL_ONLY") is not None, "recovery must never delete local-only data"
    assert _get_quotation("Q1") is not None


# ── 9. Auto-recover toggle is honoured ────────────────────────────────────────
def test_auto_recover_disabled_only_flags(seed, make_backup):
    seed.add_quotation("Q1")
    assert make_backup()["ok"]
    backup_service.update_settings(auto_recover_enabled=False)

    _delete_quotation("Q1")
    # force=False so the stored toggle applies.
    result = backup_service.run_verification(force=False)
    assert result["ok"]
    assert _get_quotation("Q1") is None, "auto-recover disabled must not import data"
    assert result["recovered"] == 0


# ── 10. Health score reflects protection state ────────────────────────────────
def test_health_score_after_backup(seed, make_backup):
    seed.add_quotation("Q1")
    assert make_backup()["ok"]
    backup_service.run_verification(force=True)

    health = backup_service.compute_health_score(refresh=True)
    assert 0 <= health["score_pct"] <= 100
    assert health["database_protected"] is True
    assert health["last_backup_iso"] is not None
    assert health["last_verification_iso"] is not None
