"""Event-scoped authentication dependency (EV-023 - Security).

Responsibilities
----------------
1. Authenticate the caller from the development identity header ``X-User-Id``.
2. Require an authenticated identity (401 otherwise).
3. Look up the requested ``event_id`` and require it to exist (404 otherwise).
4. Verify the authenticated user has permission to access that event (403
   otherwise): the user must be an Organizer (or Coordinator) and must be tied
   to the requested event through the ``event_organizers`` association table.
5. Return the validated ``Event`` context and the authenticated ``User``.

Design notes
------------
* The frontend is never trusted to assert an ``event_id``. ``GET /api/auth/me``
  returns the *server-side* list of events an Organizer may manage, so the
  client can only remember a user-selection for UX; every event-scoped
  request re-validates through ``require_event()`` / ``get_current_event()``.
* This module deliberately does not add another authentication system, login
  flow, JWT, or token refresh - the existing ``X-User-Id`` development header
  (resolved server-side against the ``users`` table) is unchanged (EV-023
  section 4, IMPLEMENTATION_NOTES section 3). Only the *event context* layer
  is added.
"""

from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import get_current_user as _resolve_current_user
from app.db.session import get_db
from app.models.event import Event, EventOrganizer
from app.models.user import User, ROLE_ORGANIZER, ROLE_COORDINATOR

__all__ = [
    "get_current_user",
    "get_organizer_events",
    "get_current_event",
    "AuthorizeEvent",
    "get_current_event",
]


def select_event_organizers_for_user(user_id: int) -> select:
    """Return the ``EventOrganizer`` rows linking a user to their events."""
    return (
        select(EventOrganizer)
        .join(EventOrganizer.event)
        .where(EventOrganizer.user_id == user_id)
    )


def get_organizer_events(
    user: User = Depends(_resolve_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    """Return the events this authenticated user is authorized to manage.

    The frontend may display these as the user's authorized events, but it can
    NEVER use them as an authorization mechanism - every subsequent
    event-scoped request independently calls :func:`require_event`.
    """
    if user.role == ROLE_COORDINATOR:
        # A Coordinator already has global write permission (EV-023 section 5):
        # approve/reject are Coordinator-only.  Coordinators are NOT event
        # owners through event_organizers - they inherit permission for every
        # event they touch, so no per-event check is needed for them.
        return []
    if user.role == ROLE_ORGANIZER:
        rows = db.execute(
            select_event_organizers_for_user(user.user_id)
        ).scalars().all()
        return [EventOrganizer.event for EventOrganizer in rows]
    # VISITOR (and anything else unexpected) is never authorized for an event.
    return []


def require_event(
    event_id: int = Query(..., alias="event_id"),
    user: User = Depends(_resolve_current_user),
    db: Session = Depends(get_db),
) -> Event:
    """Validate that ``event_id`` is both a real event and one this user owns.

    Returns the validated ``Event`` (never a raw id), or raises the documented
    error envelope codes:

    * 401 UNAUTHORIZED      - identity header missing or user not found
    * 403 FORBIDDEN         - user is not an Organizer/Coordinator bound to
                              this event (frontend-supplied ``event_id`` is
                              rejected here)
    * 404 NOT_FOUND         - the requested event does not exist

    ``event_id`` is a query parameter on every event-scoped route, never a
    path segment, so a client cannot silently route data through another event.
    """
    # 1) Identity already resolved by get_current_user (401 if missing/unknown).
    # 2) Requested event must exist.
    event = db.get(Event, event_id)
    if event is None:
        raise AppError("NOT_FOUND", "Event not found", 404)

    # 3) Permission check: the user must be bound to this event.
    authorized_ids = set()
    if user.role != ROLE_COORDINATOR:
        rows = db.execute(
            select_event_organizers_for_user(user.user_id)
        ).scalars().all()
        authorized_ids = {row.event_id for row in rows}

    if event.event_id not in authorized_ids:
        raise AppError(
            "FORBIDDEN",
            "This event is not in your authorized events",
            403,
        )

    return event


get_current_event = require_event
AuthorizeEvent = Annotated[Event, Depends(require_event)]
