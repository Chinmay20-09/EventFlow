"""Node endpoints (EV-016 §5, EV-037 §5)."""

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
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
    from app.api.routes.events import get_event_or_404

    get_event_or_404(db, event_id)
    node = Node(
        event_id=event_id,
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
    from app.api.routes.events import get_event_or_404

    get_event_or_404(db, event_id)
    nodes = db.execute(
        select(Node).where(Node.event_id == event_id).order_by(Node.node_id)
    ).scalars().all()
    return ok([NodeOut.model_validate(node) for node in nodes])


@router.get("/nodes/{node_id}")
def get_node(node_id: int, db: DbSession) -> dict:
    """Return one Node (EV-016 §5)."""
    node = get_node_or_404(db, node_id)
    return ok(NodeOut.model_validate(node))
