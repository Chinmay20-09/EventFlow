"""EventSettings entity — the smallest representation of the P4 Settings screen.

The existing P4 Settings screen edits exactly four values: event name,
maximum capacity, alert threshold and auto AI alerts. Event name already
lives on `Event`; the remaining three fields are stored here.

Implementation conflict (documented in IMPLEMENTATION_NOTES.md and the
EV-029 addendum): EV-029 §9 says no configuration dashboard is required for
the MVP, but the existing P4 frontend genuinely contains a Settings screen.
This table is event-scoped operational data — it is NOT backend environment
configuration and exposes no protected system configuration.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.core.utils import utcnow


class EventSettings(Base):
    """Per-event organizer settings used by the P4 Settings screen."""

    __tablename__ = "event_settings"

    settings_id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False, unique=True
    )
    max_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=50000)
    alert_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=85)
    auto_ai_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
