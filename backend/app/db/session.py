"""Database engine and session management.

The engine is created lazily so that importing the application never opens a
connection and missing configuration is caught by startup validation
(EV-029 §11) instead of at import time.
"""

from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.errors import AppError


@lru_cache
def get_engine():
    """Create (and cache) the SQLAlchemy engine from DATABASE_URL."""
    url = settings.database_url

    # Convenience: allow `postgresql://...` to be rewritten to the psycopg3 driver.
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    kwargs: dict = {}
    if url.startswith("sqlite"):
        # SQLite is used by the automated tests so they can run without a
        # PostgreSQL server. The production target remains PostgreSQL (EV-005 §2).
        kwargs["connect_args"] = {"check_same_thread": False}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool

    return create_engine(url, **kwargs)


@lru_cache
def get_sessionmaker() -> sessionmaker:
    """Create (and cache) the session factory bound to the engine."""
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db():
    """FastAPI dependency that yields a database session per request."""
    db: Session = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()


def commit_or_fail(db: Session) -> None:
    """Commit, translating database failures into the documented error envelope.

    Rolls back on failure so the workflow is never left half-updated
    (EV-024 §9 / §14).
    """
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise AppError("DATABASE_ERROR", "Database operation failed", 500) from exc
