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
    assert data["role"] == "VISITOR"  # default role when `role` is omitted
    assert "password" not in str(body).lower().replace("password_hash", "")


def test_register_as_coordinator_succeeds(client):
    """A client (e.g. Flutter) may self-register explicitly as COORDINATOR."""
    response = client.post(
        "/api/auth/register",
        json={
            "username": "coordapp",
            "email": "coordapp@example.com",
            "password": "TestPass!2026",
            "role": "COORDINATOR",
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    assert response.json()["data"]["role"] == "COORDINATOR"


def test_register_role_is_case_sensitive_uppercase(client):
    """Roles are uppercase enum values; lowercase variants are rejected."""
    response = client.post(
        "/api/auth/register",
        json={
            "username": "lowercoord",
            "email": "lowercoord@example.com",
            "password": "TestPass!2026",
            "role": "coordinator",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


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


def test_register_as_organizer_succeeds(client):
    response = client.post(
        "/api/auth/register",
        json={
            "username": "neworganizer",
            "email": "neworganizer@example.com",
            "password": "TestPass!2026",
            "role": "ORGANIZER",
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    assert response.json()["data"]["role"] == "ORGANIZER"


def test_register_rejects_unknown_role(client):
    """Unknown roles are rejected rather than silently accepted."""
    response = client.post(
        "/api/auth/register",
        json={
            "username": "escalator",
            "email": "escalator@example.com",
            "password": "TestPass!2026",
            "role": "SUPERADMIN",
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


def test_login_with_email_is_case_insensitive(client):
    client.post(
        "/api/auth/register",
        json={"username": "uppermail", "email": "uppermail@example.com", "password": "TestPass!2026"},
    )
    response = client.post(
        "/api/auth/login",
        json={"login": "UPPERMAIL@EXAMPLE.COM", "password": "TestPass!2026"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["user"]["email"] == "uppermail@example.com"


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


def test_default_admin_login_works(client):
    """The startup seed creates the default admin account (admin/admin123).

    Startup seeding is skipped for ENVIRONMENT=test (it would shift the exact
    user ids the other tests assert), so the test seeds the account directly
    through the same code path and then logs in with it.
    """
    from app.core.security import hash_password
    from app.db.seed import DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, ensure_default_admin
    from app.db.session import get_engine, get_sessionmaker

    db = get_sessionmaker()()
    try:
        db.add(
            User(
                username=DEFAULT_ADMIN_USERNAME,
                email=DEFAULT_ADMIN_EMAIL,
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                role="ORGANIZER",
            )
        )
        db.commit()
    finally:
        db.close()

    # The idempotent seeder must treat the existing account as done.
    ensure_default_admin(get_engine())

    response = client.post(
        "/api/auth/login",
        json={"login": "admin", "password": "admin123"},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()["data"]
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "ORGANIZER"
    assert data["access_token"]
