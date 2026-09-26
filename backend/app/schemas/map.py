"""Map schemas for the P4 Map/Live specification.

`EventLocationOut` projects the event's stored location columns;
`MapDataOut` is the GET /api/events/{event_id} payload shape requested by
the P4 specification (location + nodes + edges) while keeping every
existing field of the current event response so existing clients/tests
are not broken.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel
from app.schemas.edge import EdgeOut
from app.schemas.event import NodeStateView


class EventLocation(BaseModel, OrmModel):
    """The saved map viewport/location for one event."""

    bounds: dict | None = None
    zoom: float | None = None
    center: dict | None = None
    saved_at: datetime | None = Field(default=None, description="NULL until first save")


class MapDataOut(BaseModel):
    """GET /api/events/{event_id}: existing event fields + map data."""

    event_id: int
    name: str
    status: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    location: EventLocation | None = None
    nodes: list[NodeStateView] = []
    edges: list[EdgeOut] = []
