"""Idempotent start-up migration (auth columns + P4 map columns).

The MVP bootstrap is `Base.metadata.create_all` (no Alembic in the allowed
dependency list). `create_all` creates missing tables but never alters
existing ones, so a database bootstrapped before the auth feature keeps a
`users` table without `email`/`password_hash` — which is what made
`POST /api/auth/login` fail with
`AttributeError: type object 'User' has no attribute 'email'`.

This module adds exactly the missing pieces, nothing else:

* `users.email VARCHAR(255)`      (nullable — seeded/dev users stay valid)
* `users.password_hash VARCHAR(255)` (nullable — same reason)
* `ix_users_email` — a UNIQUE index on email, created only after the existing
  data has been checked: duplicate non-null emails would make the index
  creation fail loudly (the rows are never modified or deleted; a conflict is
  reported instead). NULL emails never conflict under a unique index.

Nothing is ever dropped, reset or rewritten. Every statement is skipped when
the column/index already exists, so running at every startup is safe.
Works on PostgreSQL (production) and SQLite (automated tests) alike.
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
    },
    # P4 Map / Live support: 1:1 event location columns (nullable — events
    # created before the map feature keep working) and the per-node expected
    # attendance. `location_saved_at` NULL == "not configured yet" (first
    # save vs. later unlocked overwrite).
    "events": {
        "location_bounds": "ALTER TABLE events ADD COLUMN location_bounds JSON",
        "location_zoom": "ALTER TABLE events ADD COLUMN location_zoom DOUBLE PRECISION",
        "location_center": "ALTER TABLE events ADD COLUMN location_center JSON",
        "location_saved_at": "ALTER TABLE events ADD COLUMN location_saved_at TIMESTAMP",
    },
    "nodes": {
        "visitors_expected": "ALTER TABLE nodes ADD COLUMN visitors_expected INTEGER NULL",
        # P1 → P3 ingestion (engine/src/serialization.ts): verbatim P1 string id
        # per node, unique within the event (uq_nodes_event_external). Nullable —
        # nodes created before the P1 integration keep working without a mapping.
        "external_id": "ALTER TABLE nodes ADD COLUMN external_id VARCHAR(80)",
    },
    # Verbatim P1 CapacityMetric snapshot per node (crowd_state.p1_metric).
    "crowd_state": {
        "p1_metric": "ALTER TABLE crowd_state ADD COLUMN p1_metric JSON",
    },
    # Verbatim P1 serializeSimulationResult payload (simulation_results.p1_result).
    "simulation_results": {
        "p1_result": "ALTER TABLE simulation_results ADD COLUMN p1_result JSON",
    },
}

# Unique index for email (name matches what SQLAlchemy would create from the
# model so `create_all`-born tables and migrated tables agree).
_EMAIL_INDEX = "ix_users_email"


def run_startup_migrations(engine: Engine) -> None:
    """Add missing columns (auth + P4 map + P1 ingestion) + unique email index."""
    inspector = inspect(engine)
    with engine.connect() as connection:
        # uq_nodes_event_external — unique (event_id, external_id) so a P1
        # string id resolves to exactly one node per event. Added only when
        # both columns exist AND the index is absent; duplicate (event_id,
        # external_id) pairs make the CREATE fail loudly (rows are never
        # modified or deleted).
        if inspector.has_table("nodes"):
            node_columns = {col["name"] for col in inspector.get_columns("nodes")}
            if {"event_id", "external_id"}.issubset(node_columns) and not any(
                ix["name"] == "uq_nodes_event_external" for ix in inspector.get_indexes("nodes")
            ):
                connection.execute(
                    text("CREATE UNIQUE INDEX uq_nodes_event_external ON nodes (event_id, external_id)")
                )
                connection.commit()
                logger.info("Startup migration: created unique index uq_nodes_event_external")

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

        # Unique email index — only when the column exists AND the index does
        # not. If duplicate non-null emails exist, the CREATE fails and the
        # exception propagates: startup stops loudly rather than silently
        # rewriting or deleting any existing row.
        existing_columns = {col["name"] for col in inspector.get_columns("users")} if inspector.has_table("users") else set()
        if "email" in existing_columns and not any(
            ix["name"] == _EMAIL_INDEX for ix in inspector.get_indexes("users")
        ):
            connection.execute(
                text("CREATE UNIQUE INDEX ix_users_email ON users (email)")
            )
            connection.commit()
            logger.info("Startup migration: created unique index %s", _EMAIL_INDEX)
