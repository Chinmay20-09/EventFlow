"""Phase 6/9 tests: Settings screen endpoints + authorization.

Covers Organizer/Coordinator write access, Visitor read-only, missing and
unknown identity, partial updates, and validation of the P4 slider range.
"""

from conftest import (
    COORDINATOR_HEADERS,
    ORGANIZER_HEADERS,
    VISITOR_HEADERS,
    create_event,
    create_node,
)


def test_settings_defaults_match_p4_initial_state(client):
    event_id = create_event(client)

    response = client.get(f"/api/events/{event_id}/settings")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["event_id"] == event_id
    assert data["event_name"] == "Mumbai Music Festival"
    assert data["max_capacity"] == 50000
    assert data["alert_threshold"] == 85
    assert data["auto_ai_alerts"] is True
    assert data["updated_at"] is None  # no stored row yet — GET never writes


def test_settings_put_updates_all_fields(client):
    event_id = create_event(client)

    response = client.put(
        f"/api/events/{event_id}/settings",
        json={
            "event_name": "Renamed Festival",
            "max_capacity": 75000,
            "alert_threshold": 90,
            "auto_ai_alerts": False,
        },
        headers=ORGANIZER_HEADERS,
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["event_name"] == "Renamed Festival"
    assert data["max_capacity"] == 75000
    assert data["alert_threshold"] == 90
    assert data["auto_ai_alerts"] is False
    assert data["updated_at"] is not None

    # Persisted: GET reflects it, and event_name lives on the Event row
    # (single source of truth — no duplicate event-name storage).
    fetched = client.get(f"/api/events/{event_id}/settings").json()["data"]
    assert fetched["max_capacity"] == 75000
    assert client.get(f"/api/events/{event_id}").json()["data"]["name"] == "Renamed Festival"


def test_settings_partial_update_preserves_other_fields(client):
    event_id = create_event(client)
    client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 70},
        headers=ORGANIZER_HEADERS,
    )
    client.put(
        f"/api/events/{event_id}/settings",
        json={"auto_ai_alerts": False},
        headers=ORGANIZER_HEADERS,
    )

    data = client.get(f"/api/events/{event_id}/settings").json()["data"]
    assert data["alert_threshold"] == 70
    assert data["auto_ai_alerts"] is False
    assert data["max_capacity"] == 50000  # untouched default
    assert data["event_name"] == "Mumbai Music Festival"  # untouched


def test_settings_validation_errors(client):
    event_id = create_event(client)

    # Slider range from the P4 screen: 60–100.
    too_low = client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 50},
        headers=ORGANIZER_HEADERS,
    )
    assert too_low.status_code == 422
    assert too_low.json()["error"]["code"] == "VALIDATION_ERROR"

    too_high = client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 101},
        headers=ORGANIZER_HEADERS,
    )
    assert too_high.status_code == 422

    empty_name = client.put(
        f"/api/events/{event_id}/settings",
        json={"event_name": ""},
        headers=ORGANIZER_HEADERS,
    )
    assert empty_name.status_code == 422

    # Unknown fields rejected — nothing outside the screen is writable.
    extra = client.put(
        f"/api/events/{event_id}/settings",
        json={"max_simulation_attempts": 99},
        headers=ORGANIZER_HEADERS,
    )
    assert extra.status_code == 422
    assert extra.json()["error"]["code"] == "VALIDATION_ERROR"

    # Nothing changed.
    data = client.get(f"/api/events/{event_id}/settings").json()["data"]
    assert data["alert_threshold"] == 85
    assert data["max_capacity"] == 50000


def test_settings_authorization(client):
    event_id = create_event(client)

    # Unauthenticated → 401.
    unauth = client.put(
        f"/api/events/{event_id}/settings", json={"alert_threshold": 80}
    )
    assert unauth.status_code == 401
    assert unauth.json()["error"]["code"] == "UNAUTHORIZED"

    # Unknown user id → 401.
    unknown = client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 80},
        headers={"X-User-Id": "99999"},
    )
    assert unknown.status_code == 401
    assert unknown.json()["error"]["code"] == "UNAUTHORIZED"

    # Visitor is read-only → 403.
    visitor = client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 80},
        headers=VISITOR_HEADERS,
    )
    assert visitor.status_code == 403
    assert visitor.json()["error"]["code"] == "FORBIDDEN"

    # Organizer may save event settings.
    organizer = client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 80},
        headers=ORGANIZER_HEADERS,
    )
    assert organizer.status_code == 200

    # Coordinator may also save event settings.
    coordinator = client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 82},
        headers=COORDINATOR_HEADERS,
    )
    assert coordinator.status_code == 200
    assert (
        client.get(f"/api/events/{event_id}/settings").json()["data"]["alert_threshold"]
        == 82
    )

    # GET stays readable without a header (read-only access).
    assert client.get(f"/api/events/{event_id}/settings").status_code == 200


def test_settings_not_found(client):
    assert client.get("/api/events/999999/settings").status_code == 404
    put = client.put(
        "/api/events/999999/settings",
        json={"alert_threshold": 80},
        headers=ORGANIZER_HEADERS,
    )
    assert put.status_code == 404
    assert put.json()["error"]["code"] == "NOT_FOUND"


def test_settings_cannot_touch_system_configuration(client):
    """Only the four P4 screen fields exist — env/system config is unreachable."""
    event_id = create_event(client)
    for payload in (
        {"database_url": "postgresql://evil"},
        {"api_port": 1234},
        {"environment": "production"},
        {"max_simulation_attempts": 99},
    ):
        response = client.put(
            f"/api/events/{event_id}/settings",
            json=payload,
            headers=ORGANIZER_HEADERS,
        )
        assert response.status_code == 422, payload
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
