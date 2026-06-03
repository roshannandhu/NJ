import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# DATA_DIR holds all writable app data (database + uploaded images). In
# development it defaults to the backend/ folder. When installed under Program
# Files (read-only), the launcher sets NJ_DATA_DIR to a per-user writable folder
# (e.g. %LOCALAPPDATA%\NJ India) so the app can still write its data.
_data = os.environ.get("NJ_DATA_DIR")
DATA_DIR = Path(_data).resolve() if _data else Path(__file__).resolve().parent
DATA_DIR.mkdir(parents=True, exist_ok=True)

# DATABASE_URL (e.g. a managed Postgres) takes precedence and is how the CLOUD
# deployment points at its database. With no DATABASE_URL set we fall back to the
# local SQLite file, so the desktop app is completely unchanged. IS_SQLITE lets
# other modules (backups, pragmas) apply SQLite-only behaviour safely.
_database_url = os.environ.get("DATABASE_URL")

if _database_url:
    # Normalize the common Postgres URL forms to the psycopg (v3) driver so a
    # host-provided "postgres://" / "postgresql://" URL works out of the box.
    if _database_url.startswith("postgres://"):
        _database_url = "postgresql+psycopg://" + _database_url[len("postgres://"):]
    elif _database_url.startswith("postgresql://"):
        _database_url = "postgresql+psycopg://" + _database_url[len("postgresql://"):]
    IS_SQLITE = False
    DB_PATH = None  # no local file in cloud mode
    # pool_pre_ping avoids stale-connection errors on hosted Postgres.
    engine = create_engine(_database_url, pool_pre_ping=True)
else:
    IS_SQLITE = True
    # The SQLite file that holds ALL app data. NJ_DB_PATH lets tests / tooling
    # point at a throwaway copy without touching the real database.
    _env_db = os.environ.get("NJ_DB_PATH")
    if _env_db:
        DB_PATH = Path(_env_db).resolve()
    else:
        DB_PATH = DATA_DIR / "nj_india.db"

    engine = create_engine(
        f"sqlite:///{DB_PATH.as_posix()}",
        # check_same_thread=False: the backup/scheduler threads share the engine.
        # timeout=30: wait (don't error) if a write briefly overlaps a backup
        # write, avoiding transient "database is locked" errors.
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _rec):
        # WAL = far safer against corruption on power loss / crashes, and lets
        # reads proceed during the backup write. synchronous=NORMAL is the
        # recommended, durable pairing with WAL. Set on every new connection.
        cur = dbapi_conn.cursor()
        try:
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
        except Exception:
            pass
        finally:
            cur.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
