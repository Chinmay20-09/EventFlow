"""Event endpoints and the current event state (EV-016 §4, §13; EV-037 §3–§4).

P4 Map addition: the event creator is bound SERVER-SIDE through the existing
event_organizers ownership table (the request body never carries a user_id),
and GET /api/events/{event_id} now returns the map data (location, nodes,
edges) alongside the unchanged event fields.
"""

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.crowd import CrowdState
from app.models.disruption import Disruption
from app.models.event import Event, EventOrganizer
from app.models.graph import Edge, Node
from app.models.user import ROLE_ORGANIZER
from app.schemas.disruption import DisruptionOut
from app.schemas.edge import EdgeOut
from app.schemas.event import EventCreate, EventOut, EventStateOut, NodeStateView
from app.schemas.map import EventLocation, MapDataOut

router = APIRouter(prefix="/api", tags=["events"])


def get_event_or_404(db: Session, event_id: int) -> Event:
    """Fetch an Event or raise the documented NOT_FOUND error (EV-024 §6)."""
    event = db.get(Event, event_id)
    if event is None:
        raise AppError("NOT_FOUND", "Event not found", 404)
    return event


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: DbSession, user: CurrentUser) -> dict:
    """Create an Event (EV-016 §4); the authenticated creator becomes its Organizer.

    Validation happens before any DB write. Ownership is established through
    the EXISTING event_organizers association (P4 Map §1) — the client never
    supplies a user_id/owner_id. Coordinator-created events have no single
    owner (Coordinators are the global operational role); only ORGANIZER
    creators are bound.
    """
    event = Event(
        name=payload.name,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status="ACTIVE",
    )
    db.add(event)
    db.flush()  # assign event_id before binding the creator
    if user.role == ROLE_ORGANIZER:
        db.add(EventOrganizer(event_id=event.event_id, user_id=user.user_id))
    commit_or_fail(db)
    db.refresh(event)
    return ok(EventOut.model_validate(event))


@router.get("/events")
def list_events(db: DbSession) -> dict:
    """Return the stored events (EV-016 §4 — no pagination in the MVP)."""
    events = db.execute(select(Event).order_by(Event.event_id)).scalars().all()
    return ok([EventOut.model_validate(event) for event in events])


@router.get("/events/{event_id}")
def get_event(event_id: int, db: DbSession) -> dict:
    """Return one Event with its P4 map data: location, nodes and edges.

    Reads stay public (existing convention); the response keeps every field
    existing clients rely on and adds `location`, `nodes` and `edges`.
    """
    event = get_event_or_404(db, event_id)

    nodes = db.execute(
        select(Node).where(Node.event_id == event_id).order_by(Node.node_id)
    ).scalars().all()
    crowd_by_node: dict[int, CrowdState] = {}
    if nodes:
        crowd_rows = db.execute(
            select(CrowdState).where(CrowdState.node_id.in_([n.node_id for n in nodes]))
        ).scalars().all()
        crowd_by_node = {row.node_id: row for row in crowd_rows}
    edges = db.execute(
        select(Edge).where(Edge.event_id == event_id).order_by(Edge.edge_id)
    ).scalars().all()

    return ok(
        MapDataOut(
            event_id=event.event_id,
            name=event.name,
            status=event.status,
            start_time=event.start_time,
            end_time=event.end_time,
            location=EventLocation(
                bounds=event.location_bounds,
                zoom=event.location_zoom,
                center=event.location_center,
                saved_at=event.location_saved_at,
            ),
            nodes=[
                NodeStateView(
                    node_id=node.node_id,
                    name=node.name,
                    type=node.type,
                    capacity=node.capacity,
                    status=node.status,
                    current_crowd=crowd_by_node[node.node_id].current_crowd
                    if node.node_id in crowd_by_node
                    else None,
                    crowd_updated_at=crowd_by_node[node.node_id].updated_at
                    if node.node_id in crowd_by_node
                    else None,
                )
                for node in nodes
            ],
            edges=[EdgeOut.model_validate(edge) for edge in edges],
        )
    )


@router.get("/events/{event_id}/state")
def get_event_state(event_id: int, db: DbSession) -> dict:
    """Current live operational state (EV-016 §13).

    Assembled exclusively from stored rows: event, nodes with their current
    crowd state, and active disruptions. Simulation results are never included
    here — simulation state must not be presented as live state (EV-016 §13).
    """
    event = get_event_or_404(db, event_id)

    nodes = db.execute(
        select(Node).where(Node.event_id == event_id).order_by(Node.node_id)
    ).scalars().all()

    crowd_by_node = {}
    if nodes:
        crowd_rows = db.execute(
            select(CrowdState).where(
                CrowdState.node_id.in_([n.node_id for n in nodes])
            )
        ).scalars().all()
        crowd_by_node = {row.node_id: row for row in crowd_rows}

    disruptions = db.execute(
        select(Disruption)
        .where(Disruption.event_id == event_id, Disruption.status == "ACTIVE")
        .order_by(Disruption.disruption_id)
    ).scalars().all()

    state = EventStateOut(
        event_id=event.event_id,
        name=event.name,
        status=event.status,
        start_time=event.start_time,
        end_time=event.end_time,
        nodes=[
            NodeStateView(
                node_id=node.node_id,
                name=node.name,
                type=node.type,
                capacity=node.capacity,
                status=node.status,
                current_crowd=crowd_by_node[node.node_id].current_crowd
                if node.node_id in crowd_by_node
                else None,
                crowd_updated_at=crowd_by_node[node.node_id].updated_at
                if node.node_id in crowd_by_node
                else None,
            )
            for node in nodes
        ],
        active_disruptions=[DisruptionOut.model_validate(d) for d in disruptions],
    )
    return ok(state)
