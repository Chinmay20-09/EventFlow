"""Tests: node creation and crowd retrieval (req. 4, 5, 15, 16).

Also proves P3 stores crowd state exactly as supplied — it never calculates
crowd values (EV-003 §10, EV-016 §20).
"""

from app.db.session import get_sessionmaker
from app.models.crowd import CrowdState
from app.utils import utcnow

from conftest import create_event, create_node


def test_create_node(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate", capacity=5000)

    response = client.get(f"/api/nodes/{node_id}")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["node_id"] == node_id
    assert data["event_id"] == event_id
    assert data["name"] == "North Gate"
    assert data["capacity"] == 5000
    assert data["status"] == "OPEN"


def test_create_node_for_missing_event_is_not_found(client):
    response = client.post(
        "/api/events/999999/nodes",
        json={"name": "Ghost", "type": "GATE", "capacity": 100},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_list_nodes(client):
    event_id = create_event(client)
    create_node(client, event_id, name="North Gate")
    create_node(client, event_id, name="East Zone", node_type="ZONE")

    response = client.get(f"/api/events/{event_id}/nodes")
    assert response.status_code == 200
    names = [node["name"] for node in response.json()["data"]]
    assert "North Gate" in names and "East Zone" in names


def test_invalid_node_payload_is_rejected(client):
    event_id = create_event(client)
    response = client.post(
        f"/api/events/{event_id}/nodes",
        json={"name": "Bad", "type": "GATE", "capacity": -5},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_missing_node_is_not_found(client):
    response = client.get("/api/nodes/999999")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_crowd_missing_returns_not_found(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id)

    response = client.get(f"/api/nodes/{node_id}/crowd")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_crowd_for_unknown_node_is_not_found(client):
    response = client.get("/api/nodes/999999/crowd")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_crowd_returns_stored_values_unchanged(client):
    """Crowd state arrives as stored P1 output; P3 must not recalculate it.

    There is intentionally no crowd-write endpoint for clients — EV-016 §6
    only defines the read endpoint; P1's push path lands in the same table.
    The test writes the stored row directly to simulate that P1 push.
    """
    event_id = create_event(client)
    node_id = create_node(client, event_id, capacity=4000)

    db = get_sessionmaker()()
    try:
        db.add(
            CrowdState(node_id=node_id, current_crowd=3200, updated_at=utcnow())
        )
        db.commit()
    finally:
        db.close()

    response = client.get(f"/api/nodes/{node_id}/crowd")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["node_id"] == node_id
    assert data["current_crowd"] == 3200  # exactly what was stored
    assert "updated_at" in data
    # Capacity (graph configuration) is untouched by crowd data (EV-020 §5).
    node = client.get(f"/api/nodes/{node_id}").json()["data"]
    assert node["capacity"] == 4000
