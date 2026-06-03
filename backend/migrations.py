"""Tiny, dependency-free schema migrations.

SQLAlchemy's create_all only CREATES missing tables — it never ALTERs an existing
table to add a new column. So when we add a column to a model (e.g. updated_at),
existing databases (the installed desktop SQLite, or a long-lived cloud Postgres)
would be missing it and queries would fail with "no such column".

ensure_columns() closes that gap: it inspects each table and runs
`ALTER TABLE ... ADD COLUMN ...` for any column the model declares but the live
table lacks. It is idempotent and best-effort (never raises into startup).

This runs at import of routers/sync.py so it executes on every app launch without
needing a hook in main.py. Works on both SQLite and Postgres.
"""

from sqlalchemy import inspect, text

from database import engine

# table name -> {column name: SQL type used in ADD COLUMN}
_WANTED = {
    "quotations": {"updated_at": "TIMESTAMP"},
    "warranty_certificates": {"updated_at": "TIMESTAMP"},
}


def ensure_columns():
    try:
        insp = inspect(engine)
    except Exception:
        return
    for table, cols in _WANTED.items():
        try:
            if not insp.has_table(table):
                # Fresh DB: create_all will build the table WITH these columns.
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
        except Exception:
            continue
        for col, sqltype in cols.items():
            if col in existing:
                continue
            try:
                with engine.begin() as conn:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {sqltype}'))
            except Exception:
                # Another worker may have added it concurrently, or the dialect
                # differs — safe to ignore; a missing column would surface loudly
                # elsewhere during testing.
                pass
