"""Time-tiered retention for backup sets (grandfather-father-son).

Counting sets is the wrong unit here: event backups fire ~8s after any change
settles, so "keep the newest 30" can mean "keep the last three hours" on a busy
day — deep enough to survive a crash, far too shallow to undo a deletion nobody
noticed for a week. This keeps snapshots by AGE instead:

    * everything from the last RECENT_HOURS hours   (crash / "undo that" window)
    * one per hour  for the last HOURLY_HOURS hours
    * one per day   for the last DAILY_DAYS days
    * one per month for the last MONTHLY_MONTHS months
    * one per year, forever

The hourly tier is what keeps this cheaper than counting: without it, "keep
everything for a day or two" is unbounded — a busy day can produce fifty
snapshots of a barely-changed database.

Newest-in-bucket always wins, the newest set is never a candidate for deletion,
and a stem whose timestamp cannot be parsed is always kept — deleting a file we
do not understand is never the safe move.

Run `python retention.py` for the self-check.
"""

import re
from datetime import datetime, timedelta

RECENT_HOURS = 6         # every set, however often they were taken
HOURLY_HOURS = 48        # then one per hour
DAILY_DAYS = 14          # then one per day
MONTHLY_MONTHS = 24      # then one per month
# …then one per year, kept forever.

_STEM_TIME = re.compile(r"(\d{8})_(\d{6})")


def stem_time(stem):
    """The datetime encoded in a set stem (nj_backup_YYYYMMDD_HHMMSS), or None."""
    m = _STEM_TIME.search(stem or "")
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
    except ValueError:
        return None


def keep_stems(stems, keep_recent=0, now=None):
    """The subset of `stems` to KEEP. Everything else may be deleted.

    keep_recent: a floor — the newest N sets are kept whatever their age, so the
    existing "keep" setting still means what the user expects.
    """
    now = now or datetime.now()
    keep, dated = set(), []
    for s in stems:
        dt = stem_time(s)
        if dt is None:
            keep.add(s)          # undatable → never our call to delete
        else:
            dated.append((dt, s))

    dated.sort(reverse=True)     # newest first, so each bucket's first hit wins
    for _, s in dated[:max(keep_recent, 1)]:
        keep.add(s)

    seen = {"hour": set(), "day": set(), "month": set(), "year": set()}
    monthly_cutoff = timedelta(days=MONTHLY_MONTHS * 30.44)
    for dt, s in dated:
        age = now - dt
        if age <= timedelta(hours=RECENT_HOURS):
            keep.add(s)
            continue
        if age <= timedelta(hours=HOURLY_HOURS):
            bucket, key = "hour", dt.strftime("%Y%m%d%H")
        elif age <= timedelta(days=DAILY_DAYS):
            bucket, key = "day", dt.strftime("%Y%m%d")
        elif age <= monthly_cutoff:
            bucket, key = "month", dt.strftime("%Y%m")
        else:
            bucket, key = "year", dt.strftime("%Y")
        if key not in seen[bucket]:
            seen[bucket].add(key)
            keep.add(s)
    return keep


if __name__ == "__main__":
    now = datetime(2026, 9, 23, 22, 0, 0)
    stem = lambda dt: "nj_backup_" + dt.strftime("%Y%m%d_%H%M%S")

    # Three years of history: 12 event backups a day for the last 40 days, then
    # one a day going back three years.
    stems = []
    for d in range(40):
        for h in range(0, 24, 2):
            stems.append(stem(now - timedelta(days=d, hours=h)))
    for d in range(40, 365 * 3):
        stems.append(stem(now - timedelta(days=d)))

    kept = keep_stems(stems, keep_recent=30, now=now)
    assert stem(now) in kept, "the newest set must always survive"
    assert len(kept) < len(stems) / 10, f"should prune hard, kept {len(kept)} of {len(stems)}"

    aged = lambda days: [s for s in kept if (now - stem_time(s)).days == days]
    assert len(aged(0)) == 12, f"today keeps every set, got {len(aged(0))}"
    assert len(aged(1)) == 12, f"yesterday keeps one an hour, got {len(aged(1))}"
    assert len(aged(10)) == 1, f"10 days back keeps one a day, got {len(aged(10))}"
    assert len(aged(400)) <= 1, "beyond a month, at most one per month"

    # Two years of monthlies, then yearlies — never zero for an old year.
    years = {stem_time(s).year for s in kept}
    assert years == {2026, 2025, 2024, 2023}, years

    # A busy day — an event backup every few minutes — must not be kept whole
    # once it is a day old: that is exactly what the hourly tier caps.
    busy = [stem(now - timedelta(days=1, minutes=5 * i)) for i in range(200)]
    busy_kept = keep_stems(busy, keep_recent=0, now=now)
    assert len(busy_kept) <= 20, f"a busy day should thin to ~hourly, kept {len(busy_kept)}"

    # A never-pruned floor, even when every set is ancient.
    old = [stem(now - timedelta(days=500 + i)) for i in range(50)]
    assert len(keep_stems(old, keep_recent=10, now=now)) >= 10

    # Unparseable names are kept, not deleted.
    assert "nj_backup_wat" in keep_stems(["nj_backup_wat"], now=now)

    print(f"retention: {len(stems)} sets -> keep {len(kept)} "
          f"(all for {RECENT_HOURS}h, hourly {HOURLY_HOURS}h, daily {DAILY_DAYS}d, "
          f"monthly {MONTHLY_MONTHS}m, yearly forever) OK")
