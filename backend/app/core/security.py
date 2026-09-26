"""Authentication/authorization dependencies (EV-023 — Security).

Two identity mechanisms coexist, by design:

1. **JWT bearer tokens** (production path): `POST /api/auth/login` returns a
   signed HS256 access token; protected endpoints accept
   `Authorization: Bearer <token>`. The signing key is `SECRET_KEY` from the
   environment — never hardcoded (EV-029). Tokens carry only the user id;
   role and identity are always re-resolved from the stored `users` table.

2. **Development identity header** (existing, unchanged): `X-User-Id: <id>`
   resolves the same way against the stored `users` table. It keeps working
   so existing integrations and tests are not broken (EV-023 §4).

In both cases the server resolves the identity **and the role** from the
stored `users` table. The client can never assert its own role, and approval
requests must not carry an `approved_by` value (EV-023 §4).

P1 service identity (P1_BACKEND_INTEGRATION_REQUIREMENTS §14) is separate
from frontend user authentication: `verify_p1_api_key` checks a shared bearer
token on /api/internal/* from the `P3_API_KEY` setting. Empty setting =
disabled (hackathon default, previous behavior).
"""

from datetime import timedelta

import bcrypt
import jwt
from fastapi import Depends, Header, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.utils import utcnow
from app.db.session import get_db
from app.models.user import ROLE_COORDINATOR, ROLE_ORGANIZER, User

ALGORITHM = "HS256"

# Bearer scheme for OpenAPI/Swagger: protected endpoints show the lock icon
# and the Swagger UI "Authorize" button works. auto_error=False because the
# X-User-Id development fallback below must stay usable (EV-023 §4).
bearer_scheme = HTTPBearer(auto_error=False)


# --- Password hashing (bcrypt; plaintext is never stored) -------------------


def hash_password(password: str) -> str:
    """Hash a password with bcrypt (salt baked into the hash)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time bcrypt verification; any failure is simply 'no match'."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


# --- Access tokens (JWT) ----------------------------------------------------


def create_access_token(user: User) -> str:
    """Sign an HS256 access token carrying only the user's id."""
    expires = utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user.user_id), "exp": expires, "iat": utcnow()}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def _resolve_token_user(token: str, db: Session) -> User:
    """Resolve a bearer token to a User or raise UNAUTHORIZED.

    Invalid and expired tokens produce the same error — never say which.
    """
    if not settings.secret_key:
        # No signing key configured: tokens cannot be verified.
        raise AppError("UNAUTHORIZED", "Authentication required", 401)
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        # Expired, tampered or malformed — never say which.
        raise AppError("UNAUTHORIZED", "Invalid or expired token", 401) from None
    subject = payload.get("sub")
    if subject is None:
        raise AppError("UNAUTHORIZED", "Invalid or expired token", 401)
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise AppError("UNAUTHORIZED", "Invalid or expired token", 401) from None
    user = db.get(User, user_id)
    if user is None:
        raise AppError("UNAUTHORIZED", "Unknown authenticated user", 401)
    return user


def get_current_user(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> User:
    """Resolve the authenticated user: bearer token first, dev header second."""
    if credentials is not None:
        return _resolve_token_user(credentials.credentials, db)

    # Development fallback (existing convention, unchanged).
    if x_user_id is None:
        raise AppError("UNAUTHORIZED", "Authentication required", 401)
    user = db.get(User, x_user_id)
    if user is None:
        # An unknown identity is not an authenticated identity.
        raise AppError("UNAUTHORIZED", "Unknown authenticated user", 401)
    return user


def get_current_coordinator(user: User = Depends(get_current_user)) -> User:
    """Require the Coordinator role (EV-023 §5: approve/reject are Coordinator-only)."""
    if user.role != ROLE_COORDINATOR:
        raise AppError("FORBIDDEN", "Coordinator role required for this action", 403)
    return user


def get_current_operator(user: User = Depends(get_current_user)) -> User:
    """Require an authenticated Organizer or Coordinator.

    Used for event-scoped settings writes: Visitors are read-only
    (EV-023 §7), and approve/reject remain Coordinator-only.
    """
    if user.role not in (ROLE_ORGANIZER, ROLE_COORDINATOR):
        raise AppError("FORBIDDEN", "Organizer or Coordinator role required", 403)
    return user


def verify_p1_api_key(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> None:
    """Shared-key service identity for the P1 ingestion endpoints.

    `Authorization: Bearer <P3_API_KEY>`. The mechanism is simple on purpose
    (hackathon MVP); it is distinct from the user-identity mechanisms above.
    """
    if not settings.p3_api_key:
        return  # Disabled — development default; identity decision still open.
    if authorization != f"Bearer {settings.p3_api_key}":
        raise AppError("UNAUTHORIZED", "Valid P1 service key required", 401)
