"""P4 dashboard/aggregate read-model schemas (Phase 6/7).

Every field here is composed at read time from authoritative stored rows
(events, nodes, crowd_state, disruptions, predictions, executions). These
schemas introduce no new source of truth — they are projections only.
"""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.disruption import DisruptionOut
from app.schemas.event import EventOut


class ZoneOut(BaseModel):
    """One node/zone as displayed by P4 (map, Crowd Monitor, Sandbox).

    `occupancy_pct` = current_crowd / capacity * 100 — a trivial presentation
    ratio of stored values (null when capacity is 0 or no crowd is stored).
    `above_threshold` = occupancy_pct >= the organizer's alert threshold —
    a trivial comparison of two stored values. P3 generates no crowd
    intelligence; P1 provides the underlying crowd state.
    """

    node_id: int
    name: str
    type: str
    capacity: int
    current_crowd: int | None = None
    occupancy_pct: float | None = None
    above_threshold: bool = False
    crowd_updated_at: datetime | None = None


class DashboardStats(BaseModel):
    """The four P4 stat cards + notification badge count."""

    live_visitors: int  # sum of stored current crowd over nodes with data
    crowd_level_pct: float | None  # sum(current)/sum(capacity) over nodes with data
    network_capacity_pct: float | None  # occupancy of the node named "Transit" (P4 mapping)
    risk_level: str | None = None  # no producer exists yet — always null (documented)
    alert_count: int  # len of the alerts read model


class ExecutionSummary(BaseModel):
    """Current execution status for the P4 Execution Status panel."""

    strategy_set_id: int | None = None
    status: str  # "Ready" when no execution exists, else EXECUTING/COMPLETED/FAILED
    started_at: datetime | None = None
    completed_at: datetime | None = None


class DashboardPrediction(BaseModel):
    """Stored latest prediction for one node (summary — no series)."""

    prediction_id: int
    node_id: int
    node_name: str
    predicted_crowd: float
    predicted_occupancy_pct: float | None  # predicted_crowd / capacity (stored values)
    prediction_horizon: int
    confidence: float | None = None
    created_at: datetime


class DashboardOut(BaseModel):
    """Aggregate for the P4 Overview screen — one request, composed from
    authoritative stored rows only. Never contains simulation state."""

    event: EventOut
    stats: DashboardStats
    zones: list[ZoneOut]
    execution: ExecutionSummary
    active_disruptions: list[DisruptionOut]
    predictions: list[DashboardPrediction]


class RecommendationOut(BaseModel):
    """P2-supplied recommendation for the P4 AI Recommendation panel.

    P3 never writes the text — it passes through the P2 adapter output
    (currently a clearly marked [MOCK P2] placeholder).
    """

    event_id: int
    headline: str
    detail: str
    source: str
