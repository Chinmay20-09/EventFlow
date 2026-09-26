"""Node endpoints (EV-016 §5, EV-037 §5)."""

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentEvent, DbSession
from app.api.deps_event import get_current_event
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.graph import Node
from app.schemas.node import NodeCreate, NodeOut

router = APIRouter(prefix="/api", tags=["nodes"])


def get_node_or_404(db: Session, node_id: int) -> Node:
    """Fetch a Node or raise the documented NOT_FOUND error."""
    node = db.get(Node, node_id)
    if node is None:
        raise AppError("NOT_FOUND", "Node not found", 404)
    return node


@router.post("/events/{event_id}/nodes", status_code=status.HTTP_201_CREATED)
def create_node(event_id: int, payload: NodeCreate, db: DbSession) -> dict:
    """Create a Node under an Event (EV-016 §5). Validated before writing."""
    # The event context is re-validated here: an Organizer can only create a
    # node for an event they manage; a Coordinator may create for any event.
    # `event_id` is accepted as the request-scoped event and then verified
    # against the authenticated user — never trusted from the client.
    event = get_current_event(db=db, event_id=event_id)

    # P1 ID mapping must be unambiguous within the event — reject duplicates
    # before they hit the unique constraint.
    if payload.external_id is not None:
        taken = db.execute(
            select(Node).where(
                Node.event_id == event_id, Node.external_id == payload.external_id
            )
        ).scalar_one_or_none()
        if taken is not None:
            raise AppError(
                "VALIDATION_ERROR",
                f"external_id {payload.external_id!r} is already mapped in this event",
                422,
            )

    node = Node(
        event_id=event_id,
        external_id=payload.external_id,
        name=payload.name,
        type=payload.type,
        latitude=payload.latitude,
        longitude=payload.longitude,
        capacity=payload.capacity,
        status=payload.status,
    )
    db.add(node)
    commit_or_fail(db)
    return ok(NodeOut.model_validate(node))


@router.get("/events/{event_id}/nodes")
def list_nodes(event_id: int, db: DbSession) -> dict:
    """Return the nodes of an Event (EV-016 §5)."""
    # Re-validate event ownership (same rule as create_node).
    event = get_current_event(db=db, event_id=event_id)
    nodes = db.execute(
        select(Node).where(Node.event_id == event_id).order_by(Node.node_id)
    ).scalars().all()
    return ok([NodeOut.model_validate(node) for node in nodes])


@router.get("/nodes/{node_id}")
def get_node(node_id: int, db: DbSession) -> dict:
    """Return one Node (EV-016 §5)."""
    node = get_node_or_404(db, node_id)
    return ok(NodeOut.model_validate(node))
