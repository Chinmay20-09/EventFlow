"""Tests: event creation/retrieval, event state, validation and not-found
errors (req. 2, 3, 14, 15, 16)."""

from conftest import EVENT_PAYLOAD, create_event, create_node


def test_create_event_returns_envelope(client):
    response = client.post("/api/events", json=EVENT_PAYLOAD)

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == {"success", "data"}
    assert body["success"] is True

    data = body["data"]
    assert isinstance(data["event_id"], int)  # integer IDs (EV-016 §2)
    assert data["name"] == "Mumbai Music Festival"
    assert data["status"] == "ACTIVE"


def test_list_and_get_event(client):
    event_id = create_event(client)

    listing = client.get("/api/events")
    assert listing.status_code == 200
    assert listing.json()["success"] is True
    ids = [item["event_id"] for item in listing.json()["data"]]
    assert event_id in ids

    fetched = client.get(f"/api/events/{event_id}")
    assert fetched.status_code == 200
    assert fetched.json()["data"]["event_id"] == event_id
    assert fetched.json()["data"]["name"] == "Mumbai Music Festival"


def test_missing_event_is_not_found(client):
    response = client.get("/api/events/999999")

    assert response.status_code == 404
    body = response.json()
    assert set(body.keys()) == {"success", "error"}
    assert set(body["error"].keys()) == {"code", "message"}
    assert body["error"]["code"] == "NOT_FOUND"
    # No fake/default object is returned (EV-024 §6).
    assert "data" not in body


def test_invalid_event_payload_is_rejected_and_not_stored(client):
    before = client.get("/api/events").json()["data"]

    # Missing required fields.
    response = client.post("/api/events", json={"name": "No times"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # end_time before start_time.
    response = client.post(
        "/api/events",
        json={
            "name": "Backwards",
            "start_time": "2026-10-10T22:00:00Z",
            "end_time": "2026-10-10T10:00:00Z",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # Unexpected extra fields are rejected (validation before mutation, EV-024 §5).
    response = client.post(
        "/api/events",
        json={**EVENT_PAYLOAD, "status": "HACKED"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    after = client.get("/api/events").json()["data"]
    assert len(after) == len(before)  # nothing invalid was stored


def test_event_state_contains_live_state_and_no_simulation_state(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate")

    response = client.get(f"/api/events/{event_id}/state")
    assert response.status_code == 200

    body = response.json()
    assert body["success"] is True
    data = body["data"]

    assert data["event_id"] == event_id
    assert data["name"] == "Mumbai Music Festival"
    assert isinstance(data["nodes"], list)
    assert len(data["nodes"]) == 1
    assert data["nodes"][0]["node_id"] == node_id
    assert data["nodes"][0]["current_crowd"] is None  # nothing stored yet
    assert isinstance(data["active_disruptions"], list)

    # Simulation state must never be presented as live state (EV-016 §13).
    assert "simulation" not in response.text.lower()


def test_event_state_not_found(client):
    response = client.get("/api/events/999999/state")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_custom_input_roundtrip_unique_value(client):
    """Custom Input feature (backend half): POST stores, GET returns the value.

    Proves P3 → PostgreSQL → P3 with a unique marker — the same flow the P4
    UI performs (UI → POST /api/events → PostgreSQL → GET /api/events/{id}).
    """
    marker = "EV-CUSTOM-INPUT-001"

    created = client.post(
        "/api/events",
        json={
            "name": marker,
            "start_time": "2026-10-10T10:00:00Z",
            "end_time": "2026-10-10T22:00:00Z",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["data"]["name"] == marker
    event_id = created.json()["data"]["event_id"]

    fetched = client.get(f"/api/events/{event_id}")
    assert fetched.status_code == 200
    data = fetched.json()["data"]
    assert data["event_id"] == event_id
    assert data["name"] == marker  # the unique value came back from storage
    assert data["status"] == "ACTIVE"
    assert data["start_time"] is not None and data["end_time"] is not None
