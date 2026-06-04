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


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(String, primary_key=True)
    customer_name = Column(String, default="")
    grand_total = Column(Float, default=0)
    date = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    # updated_at + version drive conflict resolution during recovery (newer
    # wins, older archived). updated_at is bumped on every write; version is an
    # incrementing edit counter mirrored into the JSON ``data`` blob so it
    # survives in backups.
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    version = Column(Integer, default=1)
    data = Column(Text, nullable=False)


class WarrantyCertificate(Base):
    __tablename__ = "warranty_certificates"

    id = Column(String, primary_key=True)
    quotation_id = Column(String, default="")
    customer_name = Column(String, default="")
    date = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    version = Column(Integer, default=1)
    data = Column(Text, nullable=False)
