"""Node schemas (EV-016 §5, EV-037 §5; P4 Map node fields)."""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import OrmModel

# P4 map node types (accepted case-insensitively, stored uppercase).
NODE_TYPES = {"GATE", "VENUE", "JUNCTION"}


class NodeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=40)
    # Optional P1 Crowd Engine string ID (e.g. "HALL") mapped to this node so
    # P1 payloads can reference it without P3 rewriting P1 identifiers.
    external_id: str | None = Field(default=None, min_length=1, max_length=80)
    # Geographic ranges validated (P4 Map requirement §10); `lat`/`lng`
    # accepted as aliases for the P4 payload naming.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    capacity: int = Field(ge=0)
    # Expected attendance (P4 map node field) and, optionally, the initial
    # live count — persisted into crowd_state (the single visitorsNow store).
    visitors_expected: int | None = Field(default=None, ge=0)
    visitors_now: int | None = Field(default=None, ge=0)
    status: str = Field(default="OPEN", max_length=30)

    model_config = {"extra": "forbid", "populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def _accept_map_naming(cls, data):
        """Accept the P4 payload names `lat`/`lng` (mapped to lat/long columns)."""
        if isinstance(data, dict):
            data = dict(data)
            if "lat" in data and "latitude" not in data:
                data["latitude"] = data.pop("lat")
            if "lng" in data and "longitude" not in data:
                data["longitude"] = data.pop("lng")
        return data

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in NODE_TYPES:
            raise ValueError(f"type must be one of {sorted(NODE_TYPES)}")
        return normalized


class NodePatch(BaseModel):
    """Partial node update (P4 live map).

    Ownership fields (`event_id`, `node_id`, `external_id`) are deliberately
    absent — a node can never be moved between events or renumbered here.
    `visitors_now` persists into crowd_state (the single live-count store).
    """

    name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=0)
    visitors_expected: int | None = Field(default=None, ge=0)
    visitors_now: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, max_length=30)

    model_config = {"extra": "forbid"}


class NodeOut(BaseModel, OrmModel):
    node_id: int
    event_id: int
    name: str
    type: str
    external_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    capacity: int
    visitors_expected: int | None = None
    status: str
    created_at: datetime | None = None
