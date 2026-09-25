"""Crowd schemas (EV-016 §6, EV-037 §6).

P3 stores and serves the current crowd state — it never calculates it.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import OrmModel


class CrowdOut(BaseModel, OrmModel):
    node_id: int
    current_crowd: int = Field(ge=0)
    updated_at: datetime
    # Verbatim P1 CapacityMetric when the value arrived through the P1
    # ingestion endpoint; null when no P1 payload has been received.
    p1_metric: dict | None = None


class CrowdIngestIn(BaseModel):
    """P1 → P3 current crowd-state payload (DRAFT — P1 confirmation required).

    P1 calculates the crowd state; P3 validates and stores it (EV-016 §6,
    EV-020 §4). Units: people. Duplicate submissions for the same node are
    last-write-wins upserts of the single current row.
    """

    event_id: int
    node_id: int
    current_crowd: int = Field(ge=0)  # people
    timestamp: datetime | None = None  # when P1 measured it; defaults to server time
    source: str | None = Field(default=None, max_length=60)  # e.g. sensor/derived label
    quality: float | None = Field(default=None, ge=0.0, le=1.0)  # optional confidence

    model_config = ConfigDict(extra="forbid")
