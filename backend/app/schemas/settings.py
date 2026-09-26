"""Settings schemas for the P4 Settings screen (event-scoped only)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import OrmModel


class EventSettingsOut(BaseModel, OrmModel):
    """Full settings view — `event_name` comes from the Event row (single
    source of truth); the remaining fields come from `event_settings`."""

    event_id: int
    event_name: str
    max_capacity: int
    alert_threshold: int
    auto_ai_alerts: bool
    updated_at: datetime | None = None


class EventSettingsUpdate(BaseModel):
    """Partial update — only fields present in the body are changed.

    These are event-scoped organizer values only; no backend/system
    configuration (DATABASE_URL, API_*, MAX_SIMULATION_ATTEMPTS) can be
    touched through this schema.
    """

    event_name: str | None = Field(default=None, min_length=1, max_length=200)
    max_capacity: int | None = Field(default=None, ge=0)
    # Matches the P4 slider range (60–100).
    alert_threshold: int | None = Field(default=None, ge=60, le=100)
    auto_ai_alerts: bool | None = None

    model_config = ConfigDict(extra="forbid")
