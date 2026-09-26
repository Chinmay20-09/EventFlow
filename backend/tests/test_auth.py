"""Authentication endpoints: register, login, me (IMPLEMENTATION_NOTES.md §11).

Conventions reused unchanged: the `ok()`/`error_response()` envelope
(EV-016 §3), documented error codes (EV-024 §4), validation before any DB
write, and `commit_or_fail`. Passwords are stored only as bcrypt hashes;
login failures never reveal whether the account or the password was wrong.
"""

from sqlalchemy import inspect

from fastapi import status

from app.models.user import User


def test_runtime_user_model_has_auth_columns():
    """Diagnostic (task §7): the ORM model exposes email + password_hash."""
    assert set(User.__table__.columns.keys()) >= {
        "user_id",
        "username",
        "role",
        "created_at",
        "email",
        "password_hash",
    }
    # Nullable: seeded/dev users without credentials remain valid rows.
    email = User.__table__.columns["email"]
    password_hash = User.__table__.columns["password_hash"]
    assert email.nullable and password_hash.nullable
    # No event_id on User — ownership lives in event_organizers.
    assert "event_id" not in User.__table__.columns.keys()


def test_register_success(client):
    response = client.post(
        "/api/auth/register",
        json={"username": "newuser", "email": "newuser@example.com", "password": "TestPass!2026"},
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["username"] == "newuser"
    assert data["email"] == "newuser@example.com"
    assert data["role"] == "VISITOR"  # self-registration is always Visitor
    assert "password" not in str(body).lower().replace("password_hash", "")


def test_register_duplicate_username_rejected(client):
    payload = {"username": "dupuser", "email": "dup@example.com", "password": "TestPass!2026"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    conflict = client.post(
        "/api/auth/register",
        json={**payload, "email": "other@example.com"},
    )
    assert conflict.status_code == status.HTTP_409_CONFLICT
    assert conflict.json()["error"]["code"] == "CONFLICT"


def test_register_duplicate_email_rejected(client):
    payload = {"username": "first", "email": "shared@example.com", "password": "TestPass!2026"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    second = client.post(
        "/api/auth/register",
        json={"username": "second", "email": "SHARED@example.com", "password": "TestPass!2026"},
    )
    # Case-insensitive duplicate email must also be rejected (409).
    assert second.status_code == status.HTTP_409_CONFLICT
    assert second.json()["error"]["code"] == "CONFLICT"


def test_register_rejects_role_escalation(client):
    response = client.post(
        "/api/auth/register",
        json={
            "username": "escalator",
            "email": "escalator@example.com",
            "password": "TestPass!2026",
            "role": "COORDINATOR",  # not accepted — extra="forbid"
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_login_with_email_succeeds(client):
    client.post(
        "/api/auth/register",
        json={"username": "mailer", "email": "mailer@example.com", "password": "TestPass!2026"},
    )
    response = client.post(
        "/api/auth/login",
        json={"login": "mailer@example.com", "password": "TestPass!2026"},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "mailer@example.com"


def test_login_with_username_succeeds(client):
    client.post(
        "/api/auth/register",
        json={"username": "namey", "email": "namey@example.com", "password": "TestPass!2026"},
    )
    response = client.post(
        "/api/auth/login",
        json={"login": "namey", "password": "TestPass!2026"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["user"]["username"] == "namey"


def test_login_wrong_password_returns_401_not_500(client):
    client.post(
        "/api/auth/register",
        json={"username": "wrongpw", "email": "wrongpw@example.com", "password": "TestPass!2026"},
    )
    response = client.post(
        "/api/auth/login",
        json={"login": "wrongpw@example.com", "password": "DefinitelyWrong!"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNAUTHORIZED"


def test_login_unknown_account_returns_401_not_500(client):
    response = client.post(
        "/api/auth/login",
        json={"login": "ghost@example.com", "password": "whatever!123"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_seeded_user_without_credentials_rejected(client):
    """Dev/seeded users (password_hash NULL) can never token-login."""
    response = client.post(
        "/api/auth/login",
        json={"login": "coordinator", "password": "anything"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_me_with_returned_jwt(client):
    client.post(
        "/api/auth/register",
        json={"username": "tokeny", "email": "tokeny@example.com", "password": "TestPass!2026"},
    )
    token = client.post(
        "/api/auth/login",
        json={"login": "tokeny@example.com", "password": "TestPass!2026"},
    ).json()["data"]["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["data"]["username"] == "tokeny"


def test_me_without_authentication_is_protected(client):
    response = client.get("/api/auth/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_with_garbage_token_is_401(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_me_with_tampered_token_is_401(client):
    """A token signed with the wrong key must be rejected (not 500)."""
    import jwt as pyjwt

    forged = pyjwt.encode({"sub": "1"}, "attacker-key", algorithm="HS256")
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_me_still_supports_dev_header(client):
    """The development X-User-Id flow keeps working (EV-023 §4)."""
    response = client.get("/api/auth/me", headers={"X-User-Id": "1"})
    assert response.status_code == 200
    assert response.json()["data"]["user_id"] == 1


def test_password_stored_hashed(client):
    client.post(
        "/api/auth/register",
        json={"username": "hashy", "email": "hashy@example.com", "password": "TestPass!2026"},
    )
    from app.db.session import get_sessionmaker

    db = get_sessionmaker()()
    try:
        user = db.query(User).filter(User.username == "hashy").one()
        assert user.password_hash != "TestPass!2026"
        assert user.password_hash.startswith("$2")  # bcrypt
    finally:
        db.close()


def test_users_table_has_auth_columns(client, db):
    """Diagnostic (task §8): the actual test-database table carries the columns."""
    columns = {c["name"] for c in inspect(db.bind).get_columns("users")}
    assert {"user_id", "username", "role", "created_at", "email", "password_hash"} <= columns
