"""User entity with the three MVP roles (EV-023 §2)."""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.core.utils import utcnow

ROLE_ORGANIZER = "ORGANIZER"
ROLE_COORDINATOR = "COORDINATOR"
ROLE_VISITOR = "VISITOR"
VALID_ROLES = {ROLE_ORGANIZER, ROLE_COORDINATOR, ROLE_VISITOR}


class User(Base):
    """An MVP user. Role and identity come from the authenticated account."""

    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    # --- Authentication columns (minimum fields; still the single users table)
    # Nullable by design: seeded/dev users created before authentication, and
    # the development X-User-Id flow, keep working unchanged (EV-023 §4).
    # NULL emails are all distinct under the unique constraint (SQL standard),
    # so seeded users without an email remain valid rows.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # The events this user owns. An Organizer may manage many events; each
    # Event is owned through the event_organizers association table, never
    # stored as a single event_id column on the User row.
    events: Mapped[list["Event"]] = relationship(
        "Event",
        secondary="event_organizers",
        back_populates="organizers",
        lazy="selectin",
    )
