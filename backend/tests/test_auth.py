"""Authentication API tests (task requirement 10).

Covers register (success, duplicate), login (success, wrong password,
unknown user), /auth/me (with token, without token, with the dev
X-User-Id header), protected endpoints without authentication,
Coordinator-only authorization, Organizer authorization and Visitor
read-only restrictions.

The database is the shared session-scoped SQLite file from conftest; the
seeded users (ids 1/2/3) have no credentials and keep working via the
X-User-Id flow.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import (
    COORDINATOR_ID,
    COORDINATOR_HEADERS,
    ORGANIZER_ID,
    VISITOR_ID,
    auth_headers,
)

REGISTER_PAYLOAD = {
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "sup3r-secret-pw",
}


@pytest.fixture(scope="module")
def auth_client(client):
    """Same session-wide client; depending on `client` guarantees the
    seeded users (ids 1/2/3) exist even when this file runs alone."""
    return client


# --- Registration -----------------------------------------------------------


def test_register_success(auth_client):
    response = auth_client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201, response.text

    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["username"] == "newuser"
    assert data["email"] == "newuser@example.com"
    # Self-registration can never mint a privileged role.
    assert data["role"] == "VISITOR"
    # The hash must never leave the server.
    assert "password" not in data
    assert "password_hash" not in data


def test_register_duplicate_username(auth_client):
    response = auth_client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 409
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "CONFLICT"


def test_register_duplicate_email_different_case(auth_client):
    response = auth_client.post(
        "/api/auth/register",
        json={
            "username": "otheruser",
            "email": "NEWUSER@example.com",
            "password": "another-secret-pw",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_register_rejects_role_escalation(auth_client):
    """No role field exists: passing one is a validation error (422)."""
    response = auth_client.post(
        "/api/auth/register",
        json={**REGISTER_PAYLOAD, "username": "escalator", "role": "COORDINATOR"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_register_validation_errors(auth_client):
    too_short = auth_client.post(
        "/api/auth/register",
        json={"username": "x", "email": "x@example.com", "password": "short"},
    )
    assert too_short.status_code == 422
    bad_email = auth_client.post(
        "/api/auth/register",
        json={"username": "x", "email": "not-an-email", "password": "longenough1"},
    )
    assert bad_email.status_code == 422


def test_password_stored_hashed(auth_client, db):
    from app.models.user import User

    row = db.query(User).filter(User.username == "newuser").one()
    assert row.password_hash is not None
    assert row.password_hash != REGISTER_PAYLOAD["password"]
    assert row.password_hash.startswith("$2")  # bcrypt hash format


# --- Login ------------------------------------------------------------------


def test_login_success(auth_client):
    response = auth_client.post(
        "/api/auth/login",
        json={"login": "newuser@example.com", "password": REGISTER_PAYLOAD["password"]},
    )
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["user"]["username"] == "newuser"
    assert data["user"]["role"] == "VISITOR"
    assert "password" not in str(body)


def test_login_with_username_instead_of_email(auth_client):
    response = auth_client.post(
        "/api/auth/login",
        json={"login": "newuser", "password": REGISTER_PAYLOAD["password"]},
    )
    assert response.status_code == 200
    assert response.json()["data"]["access_token"]


def test_login_wrong_password(auth_client):
    response = auth_client.post(
        "/api/auth/login",
        json={"login": "newuser@example.com", "password": "definitely-wrong"},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNAUTHORIZED"
    # Same generic message as an unknown account — no oracle for attackers.
    assert body["error"]["message"] == "Invalid credentials"


def test_login_nonexistent_user(auth_client):
    response = auth_client.post(
        "/api/auth/login",
        json={"login": "ghost@example.com", "password": "whatever-password"},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "UNAUTHORIZED"
    # Indistinguishable from a wrong password (no user enumeration).
    assert body["error"]["message"] == "Invalid credentials"


def test_login_seeded_user_without_credentials_rejected(auth_client):
    """Seeded/dev users have no password hash and cannot log in by password."""
    response = auth_client.post(
        "/api/auth/login",
        json={"login": "coordinator", "password": "anything-at-all"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


# --- /auth/me ---------------------------------------------------------------


def test_me_with_valid_token(auth_client):
    token = auth_client.post(
        "/api/auth/login",
        json={"login": "newuser@example.com", "password": REGISTER_PAYLOAD["password"]},
    ).json()["data"]["access_token"]

    response = auth_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["username"] == "newuser"
    assert body["data"]["email"] == "newuser@example.com"
    assert "password_hash" not in body["data"]


def test_me_without_token_401(auth_client):
    response = auth_client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_with_garbage_token_401(auth_client):
    response = auth_client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_with_tampered_token_401(auth_client):
    token = auth_client.post(
        "/api/auth/login",
        json={"login": "newuser@example.com", "password": REGISTER_PAYLOAD["password"]},
    ).json()["data"]["access_token"]
    response = auth_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}tampered"}
    )
    assert response.status_code == 401


def test_me_still_supports_dev_header(auth_client):
    """The existing X-User-Id convention keeps working (EV-023 §4)."""
    response = auth_client.get("/api/auth/me", headers={"X-User-Id": str(COORDINATOR_ID)})
    assert response.status_code == 200
    assert response.json()["data"]["username"] == "coordinator"
    assert response.json()["data"]["role"] == "COORDINATOR"


def test_seeded_users_get_no_token_without_credentials(auth_client):
    """Registered visitors can't log in as seeded accounts (no hash stored)."""
    response = auth_client.post(
        "/api/auth/login",
        json={"login": "visitor", "password": "nope-not-it"},
    )
    assert response.status_code == 401


# --- Protected endpoints ----------------------------------------------------


def _simulated_strategy_set(client: TestClient) -> int:
    """Create an event + strategy set and push it to SIMULATED (mock adapter)."""
    from tests.conftest import create_event, create_node, create_strategy_set

    event_id = create_event(client, "Auth Workflow Event")
    source = create_node(client, event_id, name="Src", node_type="GATE", capacity=1000)
    dest = create_node(client, event_id, name="Dst", node_type="HALL", capacity=2000)
    strategy_set_id = create_strategy_set(client, event_id, source, dest)
    response = client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    assert response.status_code == 200, response.text
    return strategy_set_id


def test_protected_endpoint_without_authentication(auth_client):
    """Coordinator-only approve without any credentials → 401 (not 403)."""
    strategy_set_id = _simulated_strategy_set(auth_client)
    response = auth_client.post(f"/api/strategy-sets/{strategy_set_id}/approve")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_coordinator_only_authorization(auth_client):
    """Organizer and Visitor tokens are 403 on Coordinator-only approve."""
    strategy_set_id = _simulated_strategy_set(auth_client)

    organizer = auth_client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        headers=auth_headers(ORGANIZER_ID),
    )
    assert organizer.status_code == 403
    assert organizer.json()["error"]["code"] == "FORBIDDEN"

    visitor = auth_client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        headers=auth_headers(VISITOR_ID),
    )
    assert visitor.status_code == 403
    assert visitor.json()["error"]["code"] == "FORBIDDEN"

    # Same set, Coordinator token: authorized (mock P5 advances to EXECUTING).
    coordinator = auth_client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        headers=auth_headers(COORDINATOR_ID),
    )
    assert coordinator.status_code == 200, coordinator.text
    assert coordinator.json()["data"]["status"] == "APPROVED"


def test_coordinator_authorization_via_x_user_id_unchanged(auth_client):
    """The pre-existing X-User-Id Coordinator flow still works (EV-023 §5)."""
    strategy_set_id = _simulated_strategy_set(auth_client)
    response = auth_client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        headers=COORDINATOR_HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "APPROVED"


def test_organizer_authorization_settings_write(auth_client):
    """Settings writes accept Organizer/Coordinator; Visitors are read-only."""
    from tests.conftest import create_event

    event_id = create_event(client := auth_client, "Auth Settings Event")

    organizer = client.put(
        f"/api/events/{event_id}/settings",
        headers=auth_headers(ORGANIZER_ID),
        json={"alert_threshold": 90},
    )
    assert organizer.status_code == 200, organizer.text
    assert organizer.json()["data"]["alert_threshold"] == 90

    coordinator = client.put(
        f"/api/events/{event_id}/settings",
        headers=auth_headers(COORDINATOR_ID),
        json={"alert_threshold": 95},
    )
    assert coordinator.status_code == 200
    assert coordinator.json()["data"]["alert_threshold"] == 95

    visitor = client.put(
        f"/api/events/{event_id}/settings",
        headers=auth_headers(VISITOR_ID),
        json={"alert_threshold": 99},
    )
    assert visitor.status_code == 403
    assert visitor.json()["error"]["code"] == "FORBIDDEN"


def test_visitor_read_only_restrictions(auth_client):
    """A token-authenticated Visitor can read public endpoints but not write."""
    from tests.conftest import create_event

    visitor = auth_headers(VISITOR_ID)
    event_id = create_event(auth_client, "Auth Visitor Event")

    # Reads stay public/allowed.
    assert auth_client.get("/api/events", headers=visitor).status_code == 200
    assert auth_client.get(f"/api/events/{event_id}", headers=visitor).status_code == 200

    # Writes are forbidden for Visitors (settings write is the operator gate).
    response = auth_client.put(
        f"/api/events/{event_id}/settings",
        headers=visitor,
        json={"max_capacity": 100},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_read_endpoints_remain_public(auth_client):
    """Visitor remains public/read-only where the contract allows it."""
    assert auth_client.get("/api/events").status_code == 200
    assert auth_client.get("/api/health").status_code == 200
