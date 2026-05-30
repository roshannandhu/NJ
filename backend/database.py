import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# The SQLite file that holds ALL app data. Location is fixed next to this file
# (backend/nj_india.db) so it does not depend on the current working directory.
# NJ_DB_PATH lets tests / tooling point at a throwaway copy without touching the
# real database.
_env_db = os.environ.get("NJ_DB_PATH")
if _env_db:
    DB_PATH = Path(_env_db).resolve()
else:
    DB_PATH = (Path(__file__).resolve().parent / "nj_india.db")

engine = create_engine(
    f"sqlite:///{DB_PATH.as_posix()}",
    # check_same_thread=False: the backup/scheduler threads share the engine.
    # timeout=30: wait (don't error) if a write briefly overlaps a backup write,
    # avoiding transient "database is locked" errors.
    connect_args={"check_same_thread": False, "timeout": 30},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
