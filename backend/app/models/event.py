"""Event entity (EV-005 §4)."""

from datetime import datetime

from sqlalchemy import DateTime, Float, JSON, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.utils import utcnow


class Event(Base):
    """Main container for event-specific data."""

    __tablename__ = "events"

    event_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    start_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    # --- Map location (P4 Map / Live specification) -------------------------
    # 1:1 with the event, so the smallest correct storage is columns on the
    # Event row itself (no second source of truth, no redundant ids). All
    # nullable: an event exists before its map view is configured, and rows
    # created before this feature keep working. `location_saved_at` is NULL
    # until the first save — the flag that makes the first write different
    # from later (explicitly unlocked) writes.
    location_bounds: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    location_zoom: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_center: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    location_saved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Events belong to Organizers through the event_organizers association
    # table (an Organizer may manage many events; an Event may have many
    # Organizers). This is a many-to-many ownership relationship — never
    # store a single event_id directly on the User row.
    organizers: Mapped[list["User"]] = relationship(
        "User",
        secondary="event_organizers",
        back_populates="events",
        lazy="selectin",
    )


class EventOrganizer(Base):
    """Association / ownership table: which Organizers may manage which events.

    One Organizer may manage many events and one Event may have many
    Organizers. The role is fixed to ORGANIZER (per EV-023 §2) — a Coordinator
    is never an event owner through this table.
    """

    __tablename__ = "event_organizers"

    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
