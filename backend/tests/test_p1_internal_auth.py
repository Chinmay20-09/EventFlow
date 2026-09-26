"""Optional shared-key auth on /api/internal/* (P1 service identity).

`P3_API_KEY` empty (default)  -> endpoints behave exactly as before.
`P3_API_KEY` set              -> `Authorization: Bearer <key>` required (401 otherwise).

The dependency reads the `settings` singleton at request time, so this module
enables the key on the singleton (and restores it afterwards) instead of
depending on import order — the conftest imports the app before this file.
"""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from conftest import ORGANIZER_HEADERS  # noqa: E402

TEST_KEY = "test-shared-secret"


@pytest.fixture(scope="module", autouse=True)
def _p1_key_enabled():
    original = settings.p3_api_key
    settings.p3_api_key = TEST_KEY
    yield
    settings.p3_api_key = original


@pytest.fixture(scope="module")
def auth_client():
    with TestClient(app) as test_client:
        yield test_client


def _event(client: TestClient) -> int:
    response = client.post(
        "/api/events",
        json={
            "name": "Auth Event",
            "start_time": "2026-10-10T10:00:00Z",
            "end_time": "2026-10-10T22:00:00Z",
        },
        headers=ORGANIZER_HEADERS,
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["event_id"]


def test_internal_endpoints_reject_missing_bearer(auth_client):
    event_id = _event(auth_client)
    response = auth_client.post(
        "/api/internal/crowd-state",
        json={"event_id": event_id, "timestamp": None, "metrics": []},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_internal_endpoints_reject_wrong_key(auth_client):
    event_id = _event(auth_client)
    response = auth_client.post(
        "/api/internal/crowd-state",
        headers={"Authorization": "Bearer wrong-key"},
        json={"event_id": event_id, "timestamp": None, "metrics": []},
    )
    assert response.status_code == 401


def test_internal_endpoints_accept_correct_bearer(auth_client):
    """Wrong key 401 vs correct key passing auth (fails later on empty metrics, 422)."""
    event_id = _event(auth_client)
    wrong = auth_client.post(
        "/api/internal/crowd-state",
        headers={"Authorization": "Bearer wrong-key"},
        json={"event_id": event_id, "timestamp": None, "metrics": []},
    )
    assert wrong.status_code == 401
    right = auth_client.post(
        "/api/internal/crowd-state",
        headers={"Authorization": f"Bearer {TEST_KEY}"},
        json={"event_id": event_id, "timestamp": None, "metrics": []},
    )
    # Auth passed; the request now fails schema validation (empty metrics) —
    # NOT 401, proving the key check is the only gate that changed.
    assert right.status_code == 422
    assert right.json()["error"]["code"] == "VALIDATION_ERROR"


def test_simulations_endpoint_requires_key_too(auth_client):
    response = auth_client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": 1, "result": {}},
    )
    assert response.status_code == 401


def test_other_endpoints_are_unaffected_by_p1_key(auth_client):
    """The P1 service key gates only /api/internal/* — P4 routes are untouched."""
    assert auth_client.get("/api/events").status_code == 200
    assert auth_client.get("/api/health").status_code == 200


def test_disabled_key_keeps_previous_behavior(monkeypatch):
    """With P3_API_KEY='' the dependency is a no-op (backward compatible)."""
    monkeypatch.setattr(settings, "p3_api_key", "")
    with TestClient(app) as disabled_client:
        event_id = _event(disabled_client)
        response = disabled_client.post(
            "/api/internal/crowd-state",
            json={"event_id": event_id, "timestamp": None, "metrics": []},
        )
        # No 401: auth disabled; validation still applies (empty metrics).
        assert response.status_code == 422
