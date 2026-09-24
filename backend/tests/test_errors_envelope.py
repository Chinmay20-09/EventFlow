"""Tests: error envelope consistency (req. 14, 15, 16).

Documents that no generic PATCH or hard-delete endpoints exist
(EV-016 §16–§17) and that every error uses the documented envelope
(EV-016 §3, EV-024 §3).
"""

from conftest import create_event


def test_success_envelope_shape(client):
    response = client.get("/api/health")
    body = response.json()
    assert set(body.keys()) == {"success", "data"}
    assert body["success"] is True


def test_error_envelope_shape_for_not_found(client):
    body = client.get("/api/strategy-sets/999999").json()
    assert set(body.keys()) == {"success", "error"}
    assert set(body["error"].keys()) == {"code", "message"}
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"


def test_error_envelope_shape_for_validation(client):
    response = client.post("/api/events", json={"name": ""})
    assert response.status_code == 422
    body = response.json()
    assert set(body.keys()) == {"success", "error"}
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_unauthorized_envelope_when_identity_header_missing(client):
    """Missing identity header → documented UNAUTHORIZED error envelope."""
    response = client.post(
        "/api/strategy-sets/1/approve",
        json={},
        headers={},  # no X-User-Id header
    )
    assert response.status_code == 401
    body = response.json()
    assert set(body.keys()) == {"success", "error"}
    assert body["error"]["code"] == "UNAUTHORIZED"


def test_no_generic_patch_endpoint_exists(client):
    """EV-016 §16: no unrestricted PATCH for workflow state."""
    event_id = create_event(client)

    for path in (
        f"/api/events/{event_id}",
        f"/api/strategy-sets/{event_id}",
    ):
        response = client.patch(path, json={"status": "APPROVED"})
        assert response.status_code in (404, 405), f"PATCH unexpectedly allowed on {path}"


def test_no_hard_delete_endpoints_exist(client):
    """EV-016 §17: no hard-delete endpoints for operational records."""
    event_id = create_event(client)

    for path in (
        f"/api/events/{event_id}",
        f"/api/strategy-sets/{event_id}",
        f"/api/disruptions/{event_id}",
    ):
        response = client.delete(path)
        assert response.status_code in (404, 405), f"DELETE unexpectedly allowed on {path}"


def test_no_execute_endpoint_exists(client):
    """EV-016 §12: there is no separate manual /execute action."""
    event_id = create_event(client)
    response = client.post(f"/api/strategy-sets/{event_id}/execute")
    assert response.status_code in (404, 405)
