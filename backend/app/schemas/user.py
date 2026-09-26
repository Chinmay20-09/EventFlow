"""User and authentication schemas (EV-023; IMPLEMENTATION_NOTES.md §11).

Request/response schemas are separate from the ORM model — raw database
objects (and never password hashes) are exposed (EV-016, task Phase 4).
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import ROLE_COORDINATOR, ROLE_ORGANIZER, ROLE_VISITOR
from app.schemas.common import OrmModel

RegistrationRole = Literal["VISITOR", "COORDINATOR"]


class RegisterRequest(BaseModel):
    """Fields required for self-registration from a client (e.g. the Flutter app).

    `role` is optional and defaults to VISITOR. COORDINATOR may be chosen by
    the client for operational users; ORGANIZER is deliberately not
    registrable — Organizer accounts are bound to events server-side and are
    provisioned out-of-band by an operator.
    """

    username: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: RegistrationRole = ROLE_VISITOR

    model_config = ConfigDict(extra="forbid")


class LoginRequest(BaseModel):
    """Accepts either email or username in the single `login` field."""

    login: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=72)

    model_config = ConfigDict(extra="forbid")


class TokenOut(BaseModel):
    """Login response: the access token plus the authenticated user."""

    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel, OrmModel):
    """Public view of a user — never includes the password hash."""

    user_id: int
    username: str
    role: str
    email: str | None = None
    created_at: datetime


TokenOut.model_rebuild()
