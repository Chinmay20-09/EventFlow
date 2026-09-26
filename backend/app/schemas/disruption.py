"""Disruption schemas (EV-016 §7, EV-037 §7; field semantics follow EV-008)."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import OrmModel


class DisruptionCreate(BaseModel):
    type: str = Field(min_length=1, max_length=60)
    severity: str = Field(min_length=1, max_length=30)
    affected_nodes: list[int] = Field(default_factory=list)
    affected_edges: list[int] = Field(default_factory=list)
    start_time: datetime | None = None
    expected_duration: int | None = Field(default=None, ge=0)  # seconds
    source: str = Field(default="external", max_length=60)

    model_config = {"extra": "forbid"}

    @field_validator("start_time")
    @classmethod
    def _naive_utc(cls, value: datetime | None) -> datetime | None:
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)


class DisruptionOut(BaseModel, OrmModel):
    disruption_id: int
    event_id: int
    type: str
    severity: str
    affected_nodes: list[int] = []
    affected_edges: list[int] = []
    start_time: datetime | None = None
    expected_duration: int | None = None
    source: str
    status: str
    created_at: datetime | None = None
