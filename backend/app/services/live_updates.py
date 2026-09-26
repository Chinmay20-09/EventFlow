"""Live update orchestration + WebSocket hub for the P4 Map/Live features.

Two responsibilities, isolated in this one module:

1. `process_live_update` — the ingestion pipeline (P4 Map §6): persist
   visitorsNow into `crowd_state` (the single live-count store, shared with
   P1's ingestion), run deterministic congestion detection, recompute only
   the affected routes, obtain alert text through the P2 boundary (never
   blocking persistence), and return the update payload.

2. `EventConnectionManager` — the FastAPI WebSocket equivalent of the
   specification's conceptual `io.to(eventId).emit('update', ...)`:
   connections are authorized at subscribe time by the route (event-scoped
   authorization), stored per event_id, and a broadcast for one event can
   never reach another event's subscribers. No Node.js/Socket.IO is
   introduced; no task queue — broadcasts are scheduled on the running
   event loop (captured at startup) and subscribers that fail to receive
   are dropped.

The WS push payload follows the P4 specification's wire shape
(`{"type": "update", "data": {nodeId, visitorsNow, updatedRoutes, alertText}}`).
"""

import asyncio
import json
import logging

from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import commit_or_fail
from app.models.crowd import CrowdState
from app.models.graph import Node
from app.schemas.live import CongestionState, LiveUpdateOut
from app.services.adapters.p2_intel import AlertTextFacts, get_p2_intel
from app.services.congestion import compute_congestion
from app.services.event_settings import get_effective_settings
from app.services.pathfinding import recompute_routes
from app.utils import utcnow

logger = logging.getLogger("eventflow.p3")


class EventConnectionManager:
    """Authorized WebSocket connections, keyed by event_id."""

    def __init__(self) -> None:
        self._connections: dict[int, list[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop | None) -> None:
        """Capture the running event loop at startup (for cross-thread sends)."""
        self.loop = loop

    async def connect(self, event_id: int, websocket: WebSocket) -> None:
        """Accept an (already-authorized) subscriber for one event."""
        await websocket.accept()
        self._connections.setdefault(event_id, []).append(websocket)

    def disconnect(self, event_id: int, websocket: WebSocket) -> None:
        sockets = self._connections.get(event_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if event_id in self._connections and not self._connections[event_id]:
            del self._connections[event_id]

    def subscriber_count(self, event_id: int) -> int:
        return len(self._connections.get(event_id, []))

    async def broadcast(self, event_id: int, payload: dict) -> int:
        """Deliver to this event's subscribers only — never another event."""
        sockets = list(self._connections.get(event_id, []))
        message = json.dumps(payload)
        delivered = 0
        for socket in sockets:
            try:
                await socket.send_text(message)
                delivered += 1
            except Exception as exc:  # noqa: BLE001 — a dead socket never breaks others
                logger.warning("WS delivery failed; dropping subscriber: %s", exc)
                self.disconnect(event_id, socket)
        return delivered


manager = EventConnectionManager()


def publish_update(event_id: int, update: LiveUpdateOut) -> None:
    """Queue a push to the event's WebSocket subscribers (fire-and-forget).

    Safe from any thread: when the application loop is known, the broadcast
    is scheduled onto it; when it is not (no async context), delivery is
    simply skipped — persistence is never blocked by push delivery.
    """
    payload = {
        "type": "update",
        "data": json.loads(update.model_dump_json(by_alias=True)),
    }
    loop = manager.loop
    if loop is not None and loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(event_id, payload), loop)


def process_live_update(
    db: Session, event, node: Node, visitors_now: int, source: str = "manual"
) -> LiveUpdateOut:
    """Full live-data pipeline for one node (deterministic; P2 only verbalizes)."""
    # 1) Persist visitorsNow — crowd_state is the single current-count store
    #    (last-write-wins upsert, same semantics as the P1 push path).
    row = db.execute(
        select(CrowdState).where(CrowdState.node_id == node.node_id)
    ).scalar_one_or_none()
    if row is None:
        row = CrowdState(node_id=node.node_id)
        db.add(row)
    row.current_crowd = visitors_now
    row.updated_at = utcnow()
    commit_or_fail(db)

    # 2) Deterministic congestion detection (visitor/capacity, stored threshold).
    settings = get_effective_settings(db, event)
    congestion = compute_congestion(node, visitors_now, settings)

    # 3) Targeted route recomputation only when the threshold was crossed
    #    (P1's engine will own this through the adapter seam when integrated).
    updated_routes = (
        recompute_routes(db, event.event_id, node.node_id)
        if congestion.crossed_threshold
        else []
    )

    # 4) Alert text through the P2 boundary — AI only verbalizes the
    #    deterministic facts; it never blocks persistence (graceful fallback).
    facts = AlertTextFacts(
        node_name=node.name,
        state=congestion.state,
        visitors_now=visitors_now,
        capacity=node.capacity,
        congestion_pct=congestion.congestion_pct,
        alert_threshold=congestion.alert_threshold,
    )
    alert_text = get_p2_intel().generate_alert_text(facts)

    return LiveUpdateOut(
        node_id=node.node_id,
        visitors_now=visitors_now,
        updated_routes=updated_routes,
        alert_text=alert_text,
        congestion=CongestionState(
            node_id=congestion.node_id,
            capacity=congestion.capacity,
            visitors_now=congestion.visitors_now,
            visitors_expected=congestion.visitors_expected,
            congestion_ratio=congestion.congestion_ratio,
            congestion_pct=congestion.congestion_pct,
            alert_threshold=congestion.alert_threshold,
            crossed_threshold=congestion.crossed_threshold,
            state=congestion.state,
        ),
        source=source,
        created_at=utcnow(),
    )
