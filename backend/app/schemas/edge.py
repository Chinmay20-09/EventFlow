"""Edge schemas (EV-016 §6 movement connections; P4 Map edges).

`from` is a Python keyword, so the P4 payload names (`from`/`to`) are mapped
to `from_node_id`/`to_node_id` by the schema validator, and both node ids are
validated to belong to the same event by the route (which owns the event
context) — the schema validates shape only.
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import OrmModel


class EdgeCreate(BaseModel):
    """P4 payload: {"from": node_id, "to": node_id} (either naming accepted)."""

    from_node_id: int | None = Field(default=None)
    to_node_id: int | None = Field(default=None)

    model_config = {"extra": "forbid", "populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def _accept_map_naming(cls, data):
        if isinstance(data, dict):
            data = dict(data)
            if "from" in data and "from_node_id" not in data:
                data["from_node_id"] = data.pop("from")
            if "to" in data and "to_node_id" not in data:
                data["to_node_id"] = data.pop("to")
        return data

    @model_validator(mode="after")
    def _require_both(self):
        if self.from_node_id is None or self.to_node_id is None:
            raise ValueError("both 'from' and 'to' node ids are required")
        if self.from_node_id == self.to_node_id:
            raise ValueError("'from' and 'to' must be different nodes")
        return self


class EdgeOut(BaseModel, OrmModel):
    edge_id: int
    event_id: int
    from_node_id: int
    to_node_id: int
    distance: float | None = None
    travel_time: float | None = None
    status: str
    created_at: datetime | None = None