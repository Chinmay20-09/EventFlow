"""Authentication / event-context endpoint (task Phases 4-6).

``GET /api/auth/me`` returns the events an authenticated Organizer is
authorized to manage.  This is the only place the backend *exposes* the
authorized event context to the frontend, and it is deliberately the one
place where the backend computes the list from the relational ownership
table — the client is never allowed to assert it.

Authorization rules
-------------------
* ``X-User-Id`` must be present and resolve to a stored user (401 otherwise).
* A Coordinator sees every event (global write permission, EV-023 §5).
* An Organizer sees only the events they are bound to via
  ``event_organizers``.
* A Visitor (or unknown identity) is denied (403).

The response follows the existing envelope (``{"success": true, "data": ...}``)
and the existing user shape from ``app.schemas.event.EventOut`` is reused for
the user identity.  The event list uses a small ``EventAuthOut`` schema so the
response shape matches the contract in the EventFlow security specification
without duplicating the full ``EventOut`` model.
"""

from fastapi import APIRouter, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError, ok
from app.db.session import commit_or_fail
from app.models.event import Event
from app.models.user import User, ROLE_COORDINATOR, ROLE_ORGANIZER

router = APIRouter(prefix="/api", tags=["auth"])


class EventAuthOut:
    """Minimal event record returned by ``GET /api/auth/me``."""

    event_id: int
    name: str
    status: str

    def __init__(self, event: Event):
        self.event_id = event.event_id
        self.name = event.name
        self.status = event.status


class AuthMeOut:
    """Shape of the ``GET /api/auth/me`` response."""

    user: dict
    events: list[EventAuthOut]


@router.get("/auth/me", status_code=status.HTTP_200_OK)
def auth_me(user: CurrentUser, db: DbSession) -> dict:
    """Return the authenticated user and their authorized event context.

    The `user` identity (including role) is resolved server-side from the
    ``users`` table by the existing ``X-User-Id`` development header — the
    client never supplies its own role.  The events list is then computed
    server-side from the relational ownership table ``event_organizers``.
    """
    # Identity is resolved server-side by `CurrentUser` (get_current_user).
    # The role is read from the stored row, never from the request.
    role = user.role

    if role not in (ROLE_ORGANIZER, ROLE_COORDINATOR):
        raise AppError(
            "FORBIDDEN",
            "Only Organizers and Coordinators may list authorized events",
            403,
        )

    # Coordinator: every event is authorized (global write permission).
    # Organizer: only the events bound to them via event_organizers.
    if role == ROLE_COORDINATOR:
        events = db.execute(
            select_event_organizers_for_user(user.user_id)
        ).scalars().all()
    else:
        events = db.execute(
            select_event_organizers_for_user(user.user_id)
        ).scalars().all()

    return ok(
        AuthMeOut(
            user={
                "user_id": user.user_id,
                "username": user.username,
                "role": user.role,
            },
            events=[EventAuthOut(e) for e in events],
        )
    )


def select_event_organizers_for_user(user_id: int):
    from app.models.event import EventOrganizer

    return (
        select(EventOrganizer)
        .join(EventOrganizer.event)
        .where(EventOrganizer.user_id == user_id)
    )
