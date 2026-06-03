from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from database import Base


class AppConfig(Base):
    __tablename__ = "app_config"

    id = Column(Integer, primary_key=True, default=1)
    data = Column(Text, nullable=False)


class BackupState(Base):
    """Single-row table (id=1) holding backup destination settings, the last
    backup timestamps per reason, and a short log of recent backups. Stored as
    one JSON blob in ``data`` to mirror the AppConfig pattern."""

    __tablename__ = "backup_state"

    id = Column(Integer, primary_key=True, default=1)
    data = Column(Text, nullable=False)


class User(Base):
    """Login accounts for the cloud deployment (managers/owner). Unused by the
    local desktop app unless NJ_AUTH_REQUIRED is enabled. Passwords are stored as
    salted PBKDF2 hashes (see auth.py) — never plaintext."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="manager")
    created_at = Column(DateTime, default=datetime.utcnow)


class SyncState(Base):
    """Single-row table (id=1) holding a global data ``revision`` counter that is
    bumped on every data mutation (quotation/warranty save or delete, config
    update). Polling clients compare this cheap number against their last-seen
    value to know when to refetch — the basis of live multi-device sync."""

    __tablename__ = "sync_state"

    id = Column(Integer, primary_key=True, default=1)
    revision = Column(Integer, nullable=False, default=0)


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(String, primary_key=True)
    customer_name = Column(String, default="")
    grand_total = Column(Float, default=0)
    date = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    data = Column(Text, nullable=False)


class WarrantyCertificate(Base):
    __tablename__ = "warranty_certificates"

    id = Column(String, primary_key=True)
    quotation_id = Column(String, default="")
    customer_name = Column(String, default="")
    date = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    data = Column(Text, nullable=False)
