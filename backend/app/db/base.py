"""Declarative base shared by every SQLAlchemy model (EV-005)."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all EventFlow P3 ORM models."""
