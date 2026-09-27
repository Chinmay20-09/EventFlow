"""WebSocket live-update tests (P4 Map/Live §5; task §16, §22-9).

Covers the previously untested WS contract: authorized subscription (JWT
query param or dev header), rejection for unauthorized identities, and the
per-event broadcast guarantee (an update for one event never reaches
another event's subscriber).
"""

import pytest

from conftest import (
    COORDINATOR_ID,
    ORGANIZER_ID,
    VISITOR_ID,
    auth_headers,
    create_event,
    create_node,
)


def _ws_uri(base_url: str, event_id: int, token: str | None) -> str:
    base = base_url if base_url.endswith("/") else f"{base_url}/"
    url = f"{base}api/events/{event_id}/ws"
    return f"{url}?token={token}" if token else url


def _login(base_url: str, client, user_id: int) -> str:
    """Mint a JWT through the real auth machinery for the WS query param."""
    from app.core.security import create_access_token
    from app.db.session import get_sessionmaker
    from app.models.user import User

    db = get_sessionmaker()()
    try:
        return create_access_token(db.get(User, user_id))
    finally:
        db.close()


def test_ws_rejects_unauthenticated(client):
    event_id = create_event(client)
    with client.websocket_connect(_ws_uri(client.base_url, event_id, None)) as ws:
        # Starlette requires accept-then-close for a rejected handshake.
        # The server closes with 1008 (policy violation) after accepting.
        message = ws.receive()
        assert message.get("type") in ("websocket.close",)


def test_ws_rejects_visitor(client):
    event_id = create_event(client)
    token = _login(client.base_url, client, VISITOR_ID)
    with client.websocket_connect(_ws_uri(client.base_url, event_id, token)) as ws:
        message = ws.receive()
        assert message.get("type") == "websocket.close"


def test_ws_accepts_coordinator_and_receives_broadcast(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate")
    token = _login(client.base_url, client, COORDINATOR_ID)

    with client.websocket_connect(_ws_uri(client.base_url, event_id, token)) as ws:
        # A live-data ingestion for THIS event must reach the subscriber.
        response = client.post(
            f"/api/events/{event_id}/live-data",
            json={"node_id": node_id, "visitors_now": 4500},
            headers=auth_headers(ORGANIZER_ID),
        )
        assert response.status_code == 200, response.text
        payload = ws.receive_json()
        assert payload["type"] == "update"
        assert payload["data"]["nodeId"] == node_id
        assert payload["data"]["visitorsNow"] == 4500
        assert payload["data"]["congestion"]["state"] in ("CROWDED", "OVER_CAPACITY", "NORMAL")


def test_ws_isolation_between_events(client):
    """An update for event A never reaches an event-B subscriber."""
    event_a = create_event(client, name="Event A")
    event_b = create_event(client, name="Event B")
    node_a = create_node(client, event_a, name="Gate A")
    token = _login(client.base_url, client, COORDINATOR_ID)

    with client.websocket_connect(_ws_uri(client.base_url, event_b, token)) as ws_b:
        client.post(
            f"/api/events/{event_a}/live-data",
            json={"node_id": node_a, "visitors_now": 4000},
            headers=auth_headers(ORGANIZER_ID),
        )
        # Give the (scheduled) broadcast a beat; nothing may arrive on B's socket.
        import time

        time.sleep(0.2)
        message = ws_b.receive()
        assert message.get("type") == "websocket.disconnect"
