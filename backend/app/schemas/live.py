"""Schemas for the P4 live map: ingestion, client views and WS push payloads.

`LiveDataIn` accepts the P4 payload naming (`nodeId`) mapped onto the P3
snake_case convention. Visitors never call the ingestion endpoint (EV-023 §7
— read-only) and the endpoint never trusts a client-supplied event binding.
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import OrmModel

# Prototype-safe sources (no CCTV pipeline / sensor SDK — labels only).
LIVE_DATA_SOURCES = {"manual", "sensor", "cctv", "simulated"}


class LiveDataIn(BaseModel):
    """POST /api/events/{event_id}/live-data payload."""

    node_id: int
    visitors_now: int = Field(ge=0)
    source: str = "manual"

    model_config = {"extra": "forbid", "populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def _accept_map_naming(cls, data):
        if isinstance(data, dict):
            data = dict(data)
            if "nodeId" in data and "node_id" not in data:
                data["node_id"] = data.pop("nodeId")
            if "visitorsNow" in data and "visitors_now" not in data:
                data["visitors_now"] = data.pop("visitorsNow")
        return data

    @model_validator(mode="after")
    def _check_source(self):
        if self.source not in LIVE_DATA_SOURCES:
            raise ValueError(f"source must be one of {sorted(LIVE_DATA_SOURCES)}")
        return self


class CongestionState(BaseModel, OrmModel):
    """Deterministic congestion computation for one node (never AI-derived)."""

    node_id: int
    capacity: int
    visitors_now: int
    visitors_expected: int | None = None
    congestion_ratio: float | None = None  # visitors_now / capacity (None if capacity 0)
    congestion_pct: float | None = None  # ratio * 100, rounded
    alert_threshold: int  # the event's stored threshold
    crossed_threshold: bool  # threshold crossing detected
    state: str  # NORMAL | CROWDED (>= threshold) | OVER_CAPACITY


class MyRouteOut(BaseModel):
    """GET /api/events/{event_id}/my-route?nodeId=X — only the relevant route.

    `route` is the requested path; `updated_routes` lists the paths recomputed
    after live updates touched the requested node (empty when none).
    camelCase aliases match the P4 wire naming (populate_by_name allows both).
    """

    event_id: int
    node_id: int = Field(alias="nodeId")
    route: list[int] = []
    distance_m: float | None = Field(default=None, alias="distanceM")
    updated_routes: list[list[int]] = Field(default=[], alias="updatedRoutes")

    model_config = {"populate_by_name": True}


class CoordinatorStatusOut(BaseModel):
    """GET /api/events/{event_id}/coordinator-status?nodeId=X."""

    event_id: int
    node: dict
    congestion: CongestionState
    alert_text: str | None = None


class LiveUpdateOut(BaseModel):
    """The push/WS update payload (P4 Map/Live specification wire shape)."""

    node_id: int = Field(alias="nodeId")
    visitors_now: int = Field(alias="visitorsNow")
    updated_routes: list[list[int]] = Field(default=[], alias="updatedRoutes")
    alert_text: str | None = Field(default=None, alias="alertText")
    congestion: CongestionState | None = None
    source: str = "manual"
    created_at: datetime | None = None

    model_config = {"populate_by_name": True}
