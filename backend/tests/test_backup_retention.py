"""
What a backup set contains, and how sets are pruned.

Two rules under test:
  * Event snapshots (one after every edit) ship the payload .json but not the
    33 MB .db — nothing reads a backup .db, so an event set must still restore
    everything on its own. Scheduled/manual sets keep the .db escape hatch.
  * Old sets are pruned by AGE, not by count: recent ones all survive, older
    ones thin out to one per day / month / year and never vanish entirely.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

from database import SessionLocal
from models import Quotation
import backup_service


def _files(dirs, suffix):
    return sorted(f.name for f in Path(dirs.backups).glob(f"nj_backup_*{suffix}"))


# ── what ships in a set ───────────────────────────────────────────────────────
def test_event_set_omits_the_db_but_daily_keeps_it(seed, dirs):
    seed.add_quotation("Q-1")

    assert backup_service.make_backup("event")["ok"]
    assert len(_files(dirs, ".json")) == 2        # payload + manifest
    assert _files(dirs, ".db") == [], "event snapshots must not ship the .db"

    assert backup_service.make_backup("daily")["ok"]
    assert len(_files(dirs, ".db")) == 1, "scheduled sets keep the raw .db"


def test_event_set_still_restores_everything(seed, dirs, db_session):
    seed.add_quotation("Q-KEEP")
    seed.add_warranty("W-KEEP", "Q-KEEP")
    manifest = backup_service.make_backup("event")
    assert manifest["ok"] and manifest["full_set"] is False

    db = SessionLocal()
    try:
        db.query(Quotation).filter(Quotation.id == "Q-KEEP").delete()
        db.commit()
    finally:
        db.close()

    payload_file = next(f for f in Path(dirs.backups).glob("nj_backup_*.json")
                        if not f.name.endswith(".manifest.json"))
    backup_service.restore_from_payload(
        json.loads(payload_file.read_text(encoding="utf-8")), mode="merge")

    db = SessionLocal()
    try:
        assert db.query(Quotation).filter(Quotation.id == "Q-KEEP").first() is not None
    finally:
        db.close()


def test_a_set_is_counted_without_a_db_file(seed, dirs):
    backup_service.make_backup("event")
    assert backup_service._count_sets(dirs.backups) == 1


# ── pruning by age ────────────────────────────────────────────────────────────
def _fake_set(backups, when):
    """A backup set as it looks on disk, dated `when`."""
    stem = "nj_backup_" + when.strftime("%Y%m%d_%H%M%S")
    for suffix in (".json", ".manifest.json", ".db"):
        (Path(backups) / (stem + suffix)).write_text("{}", encoding="utf-8")
    return stem


def test_rotate_prunes_by_age_not_by_count(dirs):
    now = datetime.now()
    today = [_fake_set(dirs.backups, now - timedelta(hours=h)) for h in range(1, 13)]
    last_month = [_fake_set(dirs.backups, now - timedelta(days=d)) for d in (10, 11, 12)]
    ancient = [_fake_set(dirs.backups, now - timedelta(days=d)) for d in (500, 505, 900)]

    backup_service._rotate(dirs.backups, keep=3)
    left = {f.name.split(".")[0] for f in Path(dirs.backups).glob("nj_backup_*")}

    # A dozen snapshots from today survive a keep=3 that would have culled nine.
    assert set(today) <= left, "recent sets are kept whatever the count says"
    assert set(last_month) & left, "the daily tier keeps one per day"
    assert len(set(ancient) & left) >= 2, "old years thin out but never disappear"
    assert len(set(ancient) & left) < len(ancient), "…and they do thin out"


def test_rotate_never_drops_the_only_set(dirs):
    stem = _fake_set(dirs.backups, datetime.now() - timedelta(days=4000))
    backup_service._rotate(dirs.backups, keep=0)
    assert (Path(dirs.backups) / (stem + ".json")).exists()
