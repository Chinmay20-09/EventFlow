"""Node schemas (EV-016 §5, EV-037 §5)."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel


class NodeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=40)
    latitude: float | None = None
    longitude: float | None = None
    capacity: int = Field(ge=0)
    status: str = Field(default="OPEN", max_length=30)

    model_config = {"extra": "forbid"}


class NodeOut(BaseModel, OrmModel):
    node_id: int
    event_id: int
    name: str
    type: str
    latitude: float | None = None
    longitude: float | None = None
    capacity: int
    status: str
    created_at: datetime | None = None
