"""Shared Pydantic configuration for output schemas."""

from pydantic import ConfigDict


class OrmModel:
    """Base for response schemas: allow validating straight from ORM rows.

    Response schemas are always separate from the ORM models — raw database
    objects are never exposed (EV-016, task Phase 4).
    """

    model_config = ConfigDict(from_attributes=True)
