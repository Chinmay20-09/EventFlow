"""Idempotent start-up migration for the authentication columns.

The MVP bootstrap is `Base.metadata.create_all` (see IMPLEMENTATION_NOTES.md
§2 — no Alembic in the allowed dependency list). `create_all` creates missing
tables but never alters existing ones, so a database bootstrapped before the
auth feature would keep a `users` table without `email`/`password_hash`.

This module adds exactly those two columns when they are missing — nothing
else is ever altered or dropped. The column check uses SQLAlchemy's
inspector, so it works the same on PostgreSQL (production) and SQLite
(automated tests). On PostgreSQL each DDL runs in its own transaction.
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger("eventflow.p3")

# Only these statements run, and only when the column is missing.
_REQUIRED_COLUMNS = {
    "users": {
        "email": "ALTER TABLE users ADD COLUMN email VARCHAR(255)",
        "password_hash": "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)",
    }
}


def run_startup_migrations(engine: Engine) -> None:
    """Add the auth columns to `users` if the table predates them."""
    inspector = inspect(engine)
    with engine.connect() as connection:
        for table, columns in _REQUIRED_COLUMNS.items():
            if not inspector.has_table(table):
                continue  # create_all just created it with all columns.
            existing = {col["name"] for col in inspector.get_columns(table)}
            for column, ddl in columns.items():
                if column in existing:
                    continue
                connection.execute(text(ddl))
                connection.commit()
                logger.info("Startup migration: added %s.%s", table, column)
