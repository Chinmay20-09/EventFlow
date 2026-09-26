"""Edge endpoints (P4 Map §2 — movement connections).

Edges connect two nodes of the SAME event (cross-event edges are rejected
before any write). Walking distance comes from the OSRM service boundary
(app.services.routing) when configured — the frontend never calculates
distance; when OSRM is unconfigured or unreachable the edge is still stored
with `distance` null (documented graceful degradation).

DELETE verifies the edge belongs to the (authorized) event. Dependent rows
cannot orphan: nodes/edges cascade through the existing FK rules.
"""

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.api.deps_event import EventWrite
from app.api.routes.events import get_event_or_404
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.graph import Edge, Node
from app.schemas.edge import EdgeCreate, EdgeOut
from app.services.routing import get_routing_adapter

router = APIRouter(prefix="/api", tags=["edges"])


def get_edge_or_404(db, edge_id: int) -> Edge:
    edge = db.get(Edge, edge_id)
    if edge is None:
        raise AppError("NOT_FOUND", "Edge not found", 404)
    return edge


@router.post("/events/{event_id}/edges", status_code=status.HTTP_201_CREATED)
def create_edge(event_id: int, payload: EdgeCreate, db: DbSession, write: EventWrite) -> dict:
    """Create an Edge between two nodes of this event (P4 Map §2).

    Both nodes must exist and belong to THIS event — cross-event edges are
    rejected (422) before any write. Distance is resolved through the OSRM
    adapter from the stored node coordinates.
    """
    event = write.event

    from_node = db.get(Node, payload.from_node_id)
    to_node = db.get(Node, payload.to_node_id)
    missing = [
        node_id
        for node_id, node in ((payload.from_node_id, from_node), (payload.to_node_id, to_node))
        if node is None
    ]
    if missing:
        raise AppError("VALIDATION_ERROR", f"Unknown node id(s): {missing}", 422)
    wrong_event = [
        node.node_id
        for node in (from_node, to_node)
        if node.event_id != event.event_id
    ]
    if wrong_event:
        raise AppError(
            "VALIDATION_ERROR",
            f"Node(s) {wrong_event} do not belong to event {event.event_id}",
            422,
        )

    duplicate = db.execute(
        select(Edge).where(
            Edge.event_id == event.event_id,
            Edge.from_node_id == payload.from_node_id,
            Edge.to_node_id == payload.to_node_id,
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise AppError(
            "VALIDATION_ERROR",
            "An edge between these nodes already exists",
            422,
        )

    distance = get_routing_adapter().distance_m(
        from_node.latitude, from_node.longitude, to_node.latitude, to_node.longitude
    )

    edge = Edge(
        event_id=event.event_id,
        from_node_id=payload.from_node_id,
        to_node_id=payload.to_node_id,
        distance=distance,
    )
    db.add(edge)
    commit_or_fail(db)
    db.refresh(edge)
    return ok(EdgeOut.model_validate(edge))


@router.get("/events/{event_id}/edges")
def list_edges(event_id: int, db: DbSession) -> dict:
    """Return the edges of an event (reads stay public)."""
    get_event_or_404(db, event_id)
    edges = db.execute(
        select(Edge).where(Edge.event_id == event_id).order_by(Edge.edge_id)
    ).scalars().all()
    return ok([EdgeOut.model_validate(edge) for edge in edges])


@router.delete("/events/{event_id}/edges/{edge_id}")
def delete_edge(event_id: int, edge_id: int, db: DbSession, write: EventWrite) -> dict:
    """Delete an edge — only after verifying it belongs to the authorized event."""
    event = write.event
    edge = get_edge_or_404(db, edge_id)
    if edge.event_id != event.event_id:
        raise AppError(
            "NOT_FOUND",
            f"Edge {edge_id} does not belong to event {event.event_id}",
            404,
        )
    db.delete(edge)
    commit_or_fail(db)
    return ok({"deleted": True, "edge_id": edge_id})
