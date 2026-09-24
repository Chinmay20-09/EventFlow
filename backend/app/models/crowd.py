"""CrowdState entity (EV-005 §7).

One current row per node — current state only. There is intentionally no
historical crowd table (EV-005 §3). P1 calculates crowd state; P3 stores the
validated current state.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.utils import utcnow


class CrowdState(Base):
    """Latest known crowd state for a node (current state only)."""

    __tablename__ = "crowd_state"

    crowd_state_id: Mapped[int] = mapped_column(primary_key=True)
    # Uniqueness on node_id enforces "one current row per node" (EV-005 §7).
    node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False, unique=True
    )
    current_crowd: Mapped[int] = mapped_column(nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
