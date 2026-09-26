"""P4 Map/Live tests: event creation + ownership, location write-once.

Covers the P4 Map specification §1, §7, §11 and §12 (EVENT, LOCATION):
creator auto-binding through event_organizers, cross-organizer denial,
Visitor read-only rules, first-write-wins location semantics and the
explicit `?force=true` unlock.
"""

from app.models.event import EventOrganizer

from conftest import (
    COORDINATOR_HEADERS,
    EVENT_PAYLOAD,
    ORGANIZER_B_HEADERS,
    ORGANIZER_HEADERS,
    VISITOR_HEADERS,
    create_event,
    create_node,
)

LOCATION = {
    "bounds": {"south": 19.0, "west": 72.8, "north": 19.1, "east": 72.9},
    "zoom": 15.5,
    "center": {"lat": 19.05, "lng": 72.85},
}


# --- EVENT ------------------------------------------------------------------


def test_create_event_binds_creator_as_organizer(client, db):
    event_id = create_event(client)

    binding = (
        db.query(EventOrganizer)
        .filter_by(event_id=event_id, user_id=2)  # ORGANIZER_ID
        .one_or_none()
    )
    assert binding is not None  # server-side, through event_organizers


def test_create_event_requires_authentication(client):
    response = client.post("/api/events", json=EVENT_PAYLOAD)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_create_event_does_not_trust_client_user_id(client, db):
    """A client-supplied owner binding is rejected (extra="forbid")."""
    response = client.post(
        "/api/events",
        json={**EVENT_PAYLOAD, "user_id": 2, "owner_id": 2},
        headers=ORGANIZER_HEADERS,
    )
    assert response.status_code == 422


def test_organizer_can_access_own_event(client):
    event_id = create_event(client)
    response = client.get(f"/api/events/{event_id}", headers=ORGANIZER_HEADERS)
    assert response.status_code == 200
    assert response.json()["data"]["event_id"] == event_id


def test_unauthorized_organizer_cannot_write_other_event(client):
    event_id = create_event(client)  # owned by organizer 2
    response = client.post(
        f"/api/events/{event_id}/nodes",
        json={"name": "X", "type": "GATE", "capacity": 10},
        headers=ORGANIZER_B_HEADERS,  # organizer 4: not bound to this event
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_visitor_cannot_create_nodes(client):
    event_id = create_event(client)
    response = client.post(
        f"/api/events/{event_id}/nodes",
        json={"name": "X", "type": "GATE", "capacity": 10},
        headers=VISITOR_HEADERS,
    )
    assert response.status_code == 403


def test_visitor_can_read_event(client):
    event_id = create_event(client)
    response = client.get(f"/api/events/{event_id}", headers=VISITOR_HEADERS)
    assert response.status_code == 200


def test_coordinator_can_write_any_event(client):
    event_id = create_event(client)
    response = client.post(
        f"/api/events/{event_id}/nodes",
        json={"name": "Coord Gate", "type": "GATE", "capacity": 10},
        headers=COORDINATOR_HEADERS,
    )
    assert response.status_code == 201


# --- LOCATION ---------------------------------------------------------------


def test_location_first_save_and_retrieve(client):
    event_id = create_event(client)

    unsaved = client.get(f"/api/events/{event_id}/location").json()["data"]
    assert unsaved["bounds"] is None  # nothing stored before first save

    response = client.put(
        f"/api/events/{event_id}/location", json=LOCATION, headers=ORGANIZER_HEADERS
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["bounds"] == LOCATION["bounds"]
    assert data["zoom"] == LOCATION["zoom"]
    assert data["center"] == LOCATION["center"]
    assert data["saved_at"] is not None

    fetched = client.get(f"/api/events/{event_id}/location").json()["data"]
    assert fetched["center"] == LOCATION["center"]


def test_location_second_write_blocked_without_unlock(client):
    event_id = create_event(client)
    first = client.put(
        f"/api/events/{event_id}/location", json=LOCATION, headers=ORGANIZER_HEADERS
    )
    assert first.status_code == 200

    second = client.put(
        f"/api/events/{event_id}/location",
        json={**LOCATION, "zoom": 2.0},
        headers=ORGANIZER_HEADERS,
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "INVALID_STATE"

    # The stored location was NOT silently overwritten.
    stored = client.get(f"/api/events/{event_id}/location").json()["data"]
    assert stored["zoom"] == LOCATION["zoom"]


def test_location_second_write_allowed_with_explicit_unlock(client):
    event_id = create_event(client)
    assert (
        client.put(f"/api/events/{event_id}/location", json=LOCATION, headers=ORGANIZER_HEADERS)
        .status_code
        == 200
    )
    unlocked = client.put(
        f"/api/events/{event_id}/location?force=true",
        json={**LOCATION, "zoom": 3.0},
        headers=ORGANIZER_HEADERS,
    )
    assert unlocked.status_code == 200
    assert unlocked.json()["data"]["zoom"] == 3.0


def test_location_cross_event_update_rejected(client):
    event_id = create_event(client)
    other_event = create_event(client, name="Other")
    _ = other_event

    response = client.put(
        f"/api/events/{event_id}/location", json=LOCATION, headers=ORGANIZER_B_HEADERS
    )
    assert response.status_code == 403


def test_location_visitor_rejected(client):
    event_id = create_event(client)
    response = client.put(
        f"/api/events/{event_id}/location", json=LOCATION, headers=VISITOR_HEADERS
    )
    assert response.status_code == 403


def test_location_invalid_zoom_rejected(client):
    event_id = create_event(client)
    response = client.put(
        f"/api/events/{event_id}/location",
        json={**LOCATION, "zoom": 99},
        headers=ORGANIZER_HEADERS,
    )
    assert response.status_code == 422


def test_location_missing_event_not_found(client):
    response = client.put(
        "/api/events/999999/location", json=LOCATION, headers=ORGANIZER_HEADERS
    )
    assert response.status_code == 404


def test_get_event_returns_map_data(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate")
    assert (
        client.put(f"/api/events/{event_id}/location", json=LOCATION, headers=ORGANIZER_HEADERS)
        .status_code
        == 200
    )

    response = client.get(f"/api/events/{event_id}")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"]  # existing event fields preserved
    assert data["location"]["center"] == LOCATION["center"]
    assert data["nodes"][0]["node_id"] == node_id
    assert data["edges"] == []
