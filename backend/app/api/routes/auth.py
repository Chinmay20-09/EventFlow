"""Authentication endpoints: register, login, me (IMPLEMENTATION_NOTES.md §11).

Conventions reused unchanged: the `ok()`/`error_response()` envelope
(EV-016 §3), documented error codes (EV-024 §4), validation before any DB
write, and `commit_or_fail`. Passwords are stored only as bcrypt hashes;
login failures never reveal whether the account or the password was wrong.
"""

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError, ok
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import commit_or_fail
from app.models.user import ROLE_COORDINATOR, ROLE_ORGANIZER, ROLE_VISITOR, User
from app.schemas.user import LoginRequest, RegisterRequest, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut.model_validate(user)


def _authenticate(db, login: str, password: str) -> User:
    """Find the user by email or username and verify the bcrypt hash.

    Both "no such account" and "wrong password" produce the same
    UNAUTHORIZED response — the error never reveals which one failed.
    """
    user = db.execute(
        select(User).where((User.email == login) | (User.username == login))
    ).scalar_one_or_none()

    if user is None or user.password_hash is None:
        # Unknown account (or seeded/dev user without credentials).
        raise AppError("UNAUTHORIZED", "Invalid credentials", 401)
    if not verify_password(password, user.password_hash):
        raise AppError("UNAUTHORIZED", "Invalid credentials", 401)
    return user


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbSession) -> dict:
    """Register a new VISITOR or COORDINATOR account (EV-023 §2).

    Role handling (client-selectable, e.g. by the Flutter app):
    * `role` omitted or "VISITOR"  -> VISITOR (default for attendees).
    * `role` == "COORDINATOR"      -> COORDINATOR (operational staff).
    * "ORGANIZER" (or any other value) -> rejected with 422: Organizer
      accounts are bound to events server-side and are provisioned
      out-of-band by an operator — never through self-registration.

    Validation happens before any DB write; username and email uniqueness
    are enforced with the documented 409 CONFLICT response.
    """
    normalized_email = payload.email.lower()

    duplicate = db.execute(
        select(User).where(
            (User.username == payload.username) | (User.email == normalized_email)
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        field = "username" if duplicate.username == payload.username else "email"
        raise AppError("CONFLICT", f"An account with this {field} already exists", 409)

    if payload.role == ROLE_ORGANIZER:
        # Unreachable through the schema (Literal type) — kept as an explicit
        # guard so the register path can never create an Organizer.
        raise AppError(
            "VALIDATION_ERROR",
            "ORGANIZER accounts cannot self-register",
            422,
        )

    user = User(
        username=payload.username,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        role=payload.role if payload.role in (ROLE_VISITOR, ROLE_COORDINATOR) else ROLE_VISITOR,
    )
    db.add(user)
    commit_or_fail(db)
    db.refresh(user)
    return ok(_user_out(user))


@router.post("/login")
def login(payload: LoginRequest, db: DbSession) -> dict:
    """Verify credentials and return a signed bearer access token.

    Only users with stored credentials (created through /register) can log
    in; seeded/dev users without a password hash are rejected with the same
    generic "Invalid credentials" response as unknown accounts.
    """
    user = _authenticate(db, payload.login, payload.password)
    return ok(TokenOut(access_token=create_access_token(user), user=_user_out(user)))


@router.get("/me")
def me(current_user: CurrentUser) -> dict:
    """Return the authenticated user (bearer token or dev X-User-Id header)."""
    return ok(_user_out(current_user))
