"""Graph entities: Node and Edge (EV-005 §5–§6)."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.utils import utcnow


class Node(Base):
    """A location in the EventFlow graph.

    P3 stores node information required by the backend; P1 owns graph-domain
    behaviour and calculations (EV-005 §5).
    """

    __tablename__ = "nodes"

    node_id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    capacity: Mapped[int] = mapped_column(nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)


class Edge(Base):
    """A movement connection between two nodes (EV-005 §6).

    P3 stores edge information for graph relationships only. There is no
    historical/continuous edge-crowd tracking (EV-005 §6).
    """

    __tablename__ = "edges"

    edge_id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.event_id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False
    )
    to_node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False
    )
    distance: Mapped[float | None] = mapped_column(Float, nullable=True)
    travel_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
