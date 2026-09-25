"""Authentication/authorization dependencies (EV-023 — Security).

Pending integration decision (documented in backend/IMPLEMENTATION_NOTES.md):
the MVP authentication mechanism is not specified in the P3 documentation, so
identity is currently supplied through a development header:

    X-User-Id: <integer id of a stored user>

The server resolves the identity **and the role** from the stored `users` table.
The client can never assert its own role, and approval requests must not carry
an `approved_by` value (EV-023 §4).

P1 service identity (P1_BACKEND_INTEGRATION_REQUIREMENTS §14) is separate from
frontend user authentication: `verify_p1_api_key` checks a shared bearer token
on /api/internal/* from the `P3_API_KEY` setting. Empty setting = disabled
(hackathon default, previous behavior).
"""

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models.user import ROLE_COORDINATOR, ROLE_ORGANIZER, User


def get_current_user(
    db: Session = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> User:
    """Resolve the authenticated user from the development identity header."""
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
    (EV-023 §7), and approve/reject remain Coordinator-only. The
    development identity mechanism (X-User-Id) is unchanged.
    """
    if user.role not in (ROLE_ORGANIZER, ROLE_COORDINATOR):
        raise AppError("FORBIDDEN", "Organizer or Coordinator role required", 403)
    return user


def verify_p1_api_key(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> None:
    """Shared-key service identity for the P1 ingestion endpoints.

    `Authorization: Bearer <P3_API_KEY>`. The mechanism is simple on purpose
    (hackathon MVP); it is distinct from the X-User-Id user-identity header.
    """
    if not settings.p3_api_key:
        return  # Disabled — development default; identity decision still open.
    if authorization != f"Bearer {settings.p3_api_key}":
        raise AppError("UNAUTHORIZED", "Valid P1 service key required", 401)
