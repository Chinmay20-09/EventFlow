"""Event and event-state schemas (EV-016 §4, EV-037 §3–§4)."""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import OrmModel
from app.schemas.disruption import DisruptionOut


def _to_naive_utc(value: datetime | None) -> datetime | None:
    """Store timestamps as naive UTC so PG and SQLite behave the same."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    start_time: datetime
    end_time: datetime

    # Reject unexpected fields instead of silently storing them (EV-024 §5).
    model_config = ConfigDict(extra="forbid")

    @field_validator("start_time", "end_time")
    @classmethod
    def _naive_utc(cls, value: datetime) -> datetime:
        return _to_naive_utc(value)

    @field_validator("end_time")
    @classmethod
    def _end_after_start(cls, value: datetime, info) -> datetime:
        start = info.data.get("start_time")
        if start is not None and value is not None and value <= start:
            raise ValueError("end_time must be after start_time")
        return value


class EventOut(BaseModel, OrmModel):
    event_id: int
    name: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    status: str


class NodeStateView(BaseModel, OrmModel):
    """Node plus its current crowd state, as stored (never recalculated)."""

    node_id: int
    name: str
    type: str
    capacity: int
    status: str
    current_crowd: int | None = None
    crowd_updated_at: datetime | None = None


class EventStateOut(BaseModel):
    """Current live operational state (EV-016 §13).

    Assembled from stored rows only. It never contains simulation state.
    """

    event_id: int
    name: str
    status: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    nodes: list[NodeStateView] = []
    active_disruptions: list[DisruptionOut] = []


class EventLocationUpdate(BaseModel):
    """P4 map location payload: {"bounds", "zoom", "center"}.

    Shape-validation only (dict bounds/center) — the P4 map clients send
    Leaflet-style structures whose internal shape is not constrained here.
    """

    bounds: dict
    zoom: float = Field(ge=0, le=25)
    center: dict

    model_config = {"extra": "forbid"}
