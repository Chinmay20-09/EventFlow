"""Prediction entity (EV-005 §9).

The latest prediction per node. P1 produces prediction results; P3 only
validates, stores and serves them — P3 never calculates predictions
(EV-003 §10, EV-016 §20).
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.utils import utcnow


class Prediction(Base):
    """Latest stored prediction for a node (a forecast, not guaranteed state)."""

    __tablename__ = "predictions"

    prediction_id: Mapped[int] = mapped_column(primary_key=True)
    # Uniqueness on node_id enforces "latest prediction per node" (EV-005 §9).
    node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False, unique=True
    )
    predicted_crowd: Mapped[float] = mapped_column(Float, nullable=False)
    prediction_horizon: Mapped[int] = mapped_column(nullable=False)  # seconds (EV-037 §8)
    predicted_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # when supplied
    # Optional forecast series (list of points) as supplied by P1. DRAFT
    # contract — pending P1 confirmation. P3 stores the series verbatim and
    # never generates forecast points.
    forecast_points: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
