"""Node endpoints (EV-016 §5, EV-037 §5; P4 Map node lifecycle).

P4 Map addition: PATCH (live visitorsNow + configuration) and DELETE, both
fully event-scoped-authorized. `visitors_now` persists into crowd_state —
the single live-count store shared with P1's ingestion — never a new
column. A PATCH can never move a node between events (no event_id in the
schema), and DELETE cascades to crowd_state/predictions/edges rows through
the existing FK ON DELETE CASCADE rules (no orphans possible).
"""

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.api.deps_event import EventWrite
from app.api.routes.events import get_event_or_404
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.crowd import CrowdState
from app.models.graph import Node
from app.schemas.live import LiveUpdateOut
from app.schemas.node import NodeCreate, NodeOut, NodePatch
from app.services.live_updates import process_live_update, publish_update

router = APIRouter(prefix="/api", tags=["nodes"])


def get_node_or_404(db: Session, node_id: int) -> Node:
    """Fetch a Node or raise the documented NOT_FOUND error."""
    node = db.get(Node, node_id)
    if node is None:
        raise AppError("NOT_FOUND", "Node not found", 404)
    return node


@router.post("/events/{event_id}/nodes", status_code=status.HTTP_201_CREATED)
def create_node(event_id: int, payload: NodeCreate, db: DbSession, write: EventWrite) -> dict:
    """Create a Node under an Event (EV-016 §5). Validated before writing.

    Event-scoped authorization: an Organizer only for their own events, a
    Coordinator for any event — never a Visitor (EV-023 §7).
    """
    event = write.event

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
        visitors_expected=payload.visitors_expected,
        status=payload.status,
    )
    db.add(node)
    db.flush()  # assign node_id before any crowd row references it
    if payload.visitors_now is not None:
        db.add(CrowdState(node_id=node.node_id, current_crowd=payload.visitors_now))
    commit_or_fail(db)
    db.refresh(node)
    return ok(NodeOut.model_validate(node))


@router.get("/events/{event_id}/nodes")
def list_nodes(event_id: int, db: DbSession) -> dict:
    """Return the nodes of an Event (EV-016 §5). Reads stay public."""
    get_event_or_404(db, event_id)
    nodes = db.execute(
        select(Node).where(Node.event_id == event_id).order_by(Node.node_id)
    ).scalars().all()
    return ok([NodeOut.model_validate(node) for node in nodes])


@router.patch("/events/{event_id}/nodes/{node_id}")
def patch_node(event_id: int, node_id: int, payload: NodePatch, db: DbSession, write: EventWrite) -> dict:
    """Update a node (P4 live map: primarily visitorsNow).

    Verifies: event exists, caller authorized for the event, node belongs to
    that event — then applies the partial update. `visitors_now` persists
    into crowd_state (single live-count store). Node ownership/event binding
    can never be changed through this endpoint.
    """
    event = write.event
    node = get_node_or_404(db, node_id)
    if node.event_id != event.event_id:
        raise AppError(
            "NOT_FOUND",
            f"Node {node_id} does not belong to event {event.event_id}",
            404,
        )

    if payload.name is not None:
        node.name = payload.name
    if payload.capacity is not None:
        node.capacity = payload.capacity
    if payload.visitors_expected is not None:
        node.visitors_expected = payload.visitors_expected
    if payload.status is not None:
        node.status = payload.status

    update: LiveUpdateOut | None = None
    if payload.visitors_now is not None:
        update = process_live_update(db, event, node, payload.visitors_now, source="manual")
    else:
        commit_or_fail(db)

    body = NodeOut.model_validate(node).model_dump()
    if update is not None:
        body["update"] = update.model_dump(by_alias=True)
        publish_update(event.event_id, update)
    return ok(body)


@router.delete("/events/{event_id}/nodes/{node_id}", status_code=status.HTTP_200_OK)
def delete_node(event_id: int, node_id: int, db: DbSession, write: EventWrite) -> dict:
    """Delete a node (P4 Map §2) — only within an authorized event.

    Dependent rows (crowd_state, predictions, edges, strategies) disappear
    through the existing FK ON DELETE CASCADE rules; no orphan records can
    remain. The association is verified BEFORE any deletion.
    """
    event = write.event
    node = get_node_or_404(db, node_id)
    if node.event_id != event.event_id:
        raise AppError(
            "NOT_FOUND",
            f"Node {node_id} does not belong to event {event.event_id}",
            404,
        )
    db.delete(node)
    commit_or_fail(db)
    return ok({"deleted": True, "node_id": node_id})


@router.get("/nodes/{node_id}")
def get_node(node_id: int, db: DbSession) -> dict:
    """Return one Node (EV-016 §5)."""
    node = get_node_or_404(db, node_id)
    return ok(NodeOut.model_validate(node))
