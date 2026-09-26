"""Disruption entity (EV-005 §8). Semantics follow EV-008."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.utils import utcnow


class Disruption(Base):
    """An operational condition affecting nodes/edges (not a crowd condition)."""

    __tablename__ = "disruptions"

    disruption_id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(60), nullable=False)
    severity: Mapped[str] = mapped_column(String(30), nullable=False)
    # EV-037 §7 example payload carries lists of affected nodes/edges.
    affected_nodes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    affected_edges: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    start_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expected_duration: Mapped[int | None] = mapped_column(nullable=True)  # seconds
    source: Mapped[str] = mapped_column(String(60), nullable=False, default="external")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
