"""Shared helpers for P3 models and services."""

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Current UTC time as a naive datetime.

    Timestamps are stored as naive UTC values so the same models work on
    PostgreSQL (production) and SQLite (automated tests).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
