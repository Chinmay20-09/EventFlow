"""Event endpoints and the current event state (EV-016 §4, §13; EV-037 §3–§4)."""

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.crowd import CrowdState
from app.models.disruption import Disruption
from app.models.event import Event
from app.models.graph import Node
from app.schemas.disruption import DisruptionOut
from app.schemas.event import EventCreate, EventOut, EventStateOut, NodeStateView

router = APIRouter(prefix="/api", tags=["events"])


def get_event_or_404(db: Session, event_id: int) -> Event:
    """Fetch an Event or raise the documented NOT_FOUND error (EV-024 §6)."""
    event = db.get(Event, event_id)
    if event is None:
        raise AppError("NOT_FOUND", "Event not found", 404)
    return event


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: DbSession) -> dict:
    """Create an Event (EV-016 §4). Validation happens before any DB write."""
    event = Event(
        name=payload.name,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status="ACTIVE",
    )
    db.add(event)
    commit_or_fail(db)
    return ok(EventOut.model_validate(event))


@router.get("/events")
def list_events(db: DbSession) -> dict:
    """Return the stored events (EV-016 §4 — no pagination in the MVP)."""
    events = db.execute(select(Event).order_by(Event.event_id)).scalars().all()
    return ok([EventOut.model_validate(event) for event in events])


@router.get("/events/{event_id}")
def get_event(event_id: int, db: DbSession) -> dict:
    """Return one Event (EV-016 §4)."""
    event = get_event_or_404(db, event_id)
    return ok(EventOut.model_validate(event))


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
