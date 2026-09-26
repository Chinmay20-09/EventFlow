"""P4 Map/Live endpoints: location, live-data ingestion, client views, WS.

Location (P4 Map §1): first write wins. Later writes are rejected with 409
INVALID_STATE unless the client sends the documented unlock flag
(`force: true` — the smallest backend-safe mechanism; there is no pre-existing
admin unlock mechanism in EventFlow). Only an authorized Organizer (bound
through event_organizers) or a Coordinator may write; an unrelated user can
never modify another event's location (403 via event-scoped authorization).

Live data (§6): persists visitorsNow into crowd_state (the single live-count
store shared with P1's push path), runs deterministic congestion detection,
recomputes only affected routes, obtains alert text through the P2 boundary
(never blocking persistence), and pushes to this event's WebSocket
subscribers — never to another event's.

WebSocket (§5): FastAPI-native replacement for the conceptual
`io.to(eventId).emit('update', ...)`. Subscribers must be authorized for the
event (Organizer bound to it, or Coordinator); Visitors cannot subscribe.
No Node.js/Socket.IO is introduced.
"""

import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.api.deps import DbSession
from app.api.deps_event import EventWrite
from app.api.routes.events import get_event_or_404
from app.core.errors import AppError, ok
from app.core.security import get_current_user
from app.db.session import commit_or_fail, get_db
from app.models.graph import Node
from app.schemas.event import EventLocationUpdate
from app.schemas.live import (
    CoordinatorStatusOut,
    LiveDataIn,
    LiveUpdateOut,
    MyRouteOut,
)
from app.services.congestion import congestion_for_node
from app.services.live_updates import manager, process_live_update, publish_update
from app.services.pathfinding import shortest_route
from app.utils import utcnow

logger = logging.getLogger("eventflow.p3")

router = APIRouter(prefix="/api", tags=["p4-map-live"])


@router.put("/events/{event_id}/location")
def save_location(
    event_id: int,
    payload: EventLocationUpdate,
    db: DbSession,
    write: EventWrite,
    force: bool = Query(default=False, description="Explicit unlock to overwrite a saved location"),
) -> dict:
    """Save the map location (bounds/zoom/center) for an event (P4 Map §1).

    First save always succeeds. A later save without `?force=true` is
    rejected with 409 INVALID_STATE — the location is never silently
    overwritten. (`force` is the smallest backend-safe unlock; replace its
    authorization with a dedicated admin mechanism if one is added later.)
    """
    event = write.event
    if event.location_saved_at is not None and not force:
        raise AppError(
            "INVALID_STATE",
            "Location already saved; resave requires the explicit unlock (?force=true)",
            409,
        )
    event.location_bounds = payload.bounds
    event.location_zoom = payload.zoom
    event.location_center = payload.center
    event.location_saved_at = utcnow()
    commit_or_fail(db)
    return ok(
        {
            "event_id": event.event_id,
            "bounds": event.location_bounds,
            "zoom": event.location_zoom,
            "center": event.location_center,
            "saved_at": event.location_saved_at,
        }
    )


@router.get("/events/{event_id}/location")
def get_location(event_id: int, db: DbSession) -> dict:
    """Return the saved location (or nulls until first save). Reads stay public."""
    event = get_event_or_404(db, event_id)
    return ok(
        {
            "event_id": event.event_id,
            "bounds": event.location_bounds,
            "zoom": event.location_zoom,
            "center": event.location_center,
            "saved_at": event.location_saved_at,
        }
    )


@router.post("/events/{event_id}/live-data")
def ingest_live_data(event_id: int, payload: LiveDataIn, db: DbSession, write: EventWrite) -> dict:
    """Prototype-safe live ingestion (P4 Map §6): update visitorsNow for a node.

    Pipeline: authorize event → verify node ownership → validate → persist
    (crowd_state) → congestion detection → targeted route recomputation →
    alert text via P2 → publish to this event's WebSocket subscribers.
    Sources are labels for the prototype (manual/sensor/cctv/simulated) —
    no CCTV pipeline or sensor SDK exists behind them.
    """
    event = write.event
    node = db.get(Node, payload.node_id)
    if node is None or node.event_id != event.event_id:
        raise AppError(
            "NOT_FOUND",
            f"Node {payload.node_id} does not belong to event {event.event_id}",
            404,
        )

    update = process_live_update(db, event, node, payload.visitors_now, source=payload.source)
    publish_update(event.event_id, update)
    return ok(update.model_dump(by_alias=True))


@router.get("/events/{event_id}/my-route")
def my_route(event_id: int, db: DbSession, node_id: int = Query(...)) -> dict:
    """Route relevant to one node (P4 Map §8) — not the whole event graph.

    Returns the shortest path from the requested node to the event's
    largest-capacity node (the redirect/evacuation target), computed by the
    route service (Dijkstra with live congestion weights; P1 seam). Only
    this route is exposed — never the full graph.
    """
    get_event_or_404(db, event_id)
    node = db.get(Node, node_id)
    if node is None or node.event_id != event_id:
        raise AppError("NOT_FOUND", f"Node {node_id} does not belong to event {event_id}", 404)

    result = shortest_route(db, event_id, node_id, _best_target_id(db, event_id))
    route = MyRouteOut(
        event_id=event_id,
        node_id=node_id,
        route=result[0] if result else [],
        distance_m=result[1] if result else None,
        updated_routes=[],
    )
    return ok(route.model_dump(by_alias=True))


@router.get("/events/{event_id}/coordinator-status")
def coordinator_status(event_id: int, db: DbSession, node_id: int = Query(...)) -> dict:
    """Per-node operational status (P4 Map §8): node info, live count,
    capacity, congestion state/ratio and the current alert text."""
    event = get_event_or_404(db, event_id)
    node = db.get(Node, node_id)
    if node is None or node.event_id != event.event_id:
        raise AppError("NOT_FOUND", f"Node {node_id} does not belong to event {event.event_id}", 404)

    congestion = congestion_for_node(db, event, node)
    alert_text = _current_alert_text(node, congestion)

    return ok(
        CoordinatorStatusOut(
            event_id=event.event_id,
            node={
                "node_id": node.node_id,
                "name": node.name,
                "type": node.type,
                "capacity": node.capacity,
                "status": node.status,
                "visitors_expected": node.visitors_expected,
            },
            congestion=congestion,
            alert_text=alert_text,
        ).model_dump()
    )


@router.websocket("/events/{event_id}/ws")
async def event_ws(
    websocket: WebSocket,
    event_id: int,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Subscribe to one event's live updates (authorized subscribers only).

    Authorization uses the EXISTING mechanisms (JWT bearer or X-User-Id):
    Organizers must be bound through event_organizers, Coordinators are
    global operators, Visitors are rejected (4011 close code). Updates for
    one event can never reach another event's subscribers (per-event
    connection registry in app.services.live_updates.manager).
    """
    from app.api.deps_event import authorize_event

    try:
        event = authorize_event(event_id, user=user, db=db)
    except AppError:
        # A rejected handshake must still be accepted-then-closed in Starlette.
        await websocket.accept()
        await websocket.close(code=1008)  # policy violation: not authorized
        return
    _ = event  # authorization validated; event context not needed further

    await manager.connect(event.event_id, websocket)
    try:
        while True:
            # Client messages are not commands — keep the socket open only.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(event.event_id, websocket)


def _best_target_id(db, event_id: int) -> int | None:
    """The event's largest-capacity node id (redirect/evacuation target)."""
    capacities = db.execute(
        select(Node.node_id, Node.capacity).where(Node.event_id == event_id)
    ).all()
    if not capacities:
        return None
    return max(capacities, key=lambda row: row.capacity).node_id


def _current_alert_text(node, congestion) -> str | None:
    """Alert text for the node's CURRENT stored state (P2 boundary)."""
    from app.services.adapters.p2_intel import AlertTextFacts, get_p2_intel
    from app.services.congestion import STATE_NORMAL

    if congestion.state == STATE_NORMAL:
        return None
    facts = AlertTextFacts(
        node_name=node.name,
        state=congestion.state,
        visitors_now=congestion.visitors_now,
        capacity=node.capacity,
        congestion_pct=congestion.congestion_pct,
        alert_threshold=congestion.alert_threshold,
    )
    return get_p2_intel().generate_alert_text(facts)
