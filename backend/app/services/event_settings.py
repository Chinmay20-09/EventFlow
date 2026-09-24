"""Event-scoped settings helpers (P4 Settings screen).

Defaults match the initial values hardcoded in the P4 Settings screen
(event name comes from the Event row; capacity 50000, threshold 85,
auto AI alerts on). GET never mutates: without a stored row the defaults
are returned (and `updated_at` is null) until PUT persists them.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import commit_or_fail
from app.models.event import Event
from app.models.settings import EventSettings
from app.schemas.settings import EventSettingsOut, EventSettingsUpdate
from app.utils import utcnow

DEFAULT_MAX_CAPACITY = 50000
DEFAULT_ALERT_THRESHOLD = 85
DEFAULT_AUTO_AI_ALERTS = True


@dataclass
class EffectiveSettings:
    """Resolved settings for one event (stored row or documented defaults)."""

    event_id: int
    event_name: str
    max_capacity: int
    alert_threshold: int
    auto_ai_alerts: bool
    updated_at: datetime | None


def get_stored_settings(db: Session, event_id: int) -> EventSettings | None:
    """Return the stored row for the event, or None."""
    return db.execute(
        select(EventSettings).where(EventSettings.event_id == event_id)
    ).scalar_one_or_none()


def get_effective_settings(db: Session, event: Event) -> EffectiveSettings:
    """Resolve effective settings without writing (used by read models)."""
    row = get_stored_settings(db, event.event_id)
    return EffectiveSettings(
        event_id=event.event_id,
        event_name=event.name,
        max_capacity=row.max_capacity if row else DEFAULT_MAX_CAPACITY,
        alert_threshold=row.alert_threshold if row else DEFAULT_ALERT_THRESHOLD,
        auto_ai_alerts=row.auto_ai_alerts if row else DEFAULT_AUTO_AI_ALERTS,
        updated_at=row.updated_at if row else None,
    )


def settings_out(effective: EffectiveSettings) -> EventSettingsOut:
    """Project effective settings into the response schema."""
    return EventSettingsOut(
        event_id=effective.event_id,
        event_name=effective.event_name,
        max_capacity=effective.max_capacity,
        alert_threshold=effective.alert_threshold,
        auto_ai_alerts=effective.auto_ai_alerts,
        updated_at=effective.updated_at,
    )


def upsert_settings(db: Session, event: Event, payload: EventSettingsUpdate) -> EventSettingsOut:
    """Apply a partial update and persist it (single transaction).

    `event_name` updates the Event row itself (no duplicate storage); the
    other fields are written to the event_settings row (created on first
    write). Only fields present in the payload change.
    """
    if payload.event_name is not None:
        event.name = payload.event_name

    row = get_stored_settings(db, event.event_id)
    if row is None:
        row = EventSettings(
            event_id=event.event_id,
            max_capacity=DEFAULT_MAX_CAPACITY,
            alert_threshold=DEFAULT_ALERT_THRESHOLD,
            auto_ai_alerts=DEFAULT_AUTO_AI_ALERTS,
        )
        db.add(row)

    if payload.max_capacity is not None:
        row.max_capacity = payload.max_capacity
    if payload.alert_threshold is not None:
        row.alert_threshold = payload.alert_threshold
    if payload.auto_ai_alerts is not None:
        row.auto_ai_alerts = payload.auto_ai_alerts
    row.updated_at = utcnow()

    commit_or_fail(db)

    return settings_out(get_effective_settings(db, event))
