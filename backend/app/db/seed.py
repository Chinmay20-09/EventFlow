"""Default account seeding (development convenience).

Seeds the default administrator account on startup so the P4 frontend can
sign in without showing the auth screen:

    username: admin
    email:    admin@eventflow.local
    password: admin123
    role:     ORGANIZER

The seed is idempotent: the row is created only when neither the username
nor the email exists, and existing users are never modified. The lifespan hook
calls this after create_all/migrations **in the development environment only**
(ENVIRONMENT=development) — a known default password is never seeded in
test/staging/production.
"""

import logging

from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import ROLE_ORGANIZER, User

logger = logging.getLogger("eventflow.p3")

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_EMAIL = "admin@eventflow.local"
DEFAULT_ADMIN_PASSWORD = "admin123"


def ensure_default_admin(engine: Engine) -> None:
    """Create the default admin account when it does not exist yet.

    NOTE: skipped for ENVIRONMENT=test at the call site (app.main lifespan):
    the automated tests seed their own users and assert exact user ids
    (tests/conftest.py), so an extra startup row would shift every id.
    """
    with Session(engine) as session:
        existing = session.execute(
            select(User).where(
                (User.username == DEFAULT_ADMIN_USERNAME)
                | (User.email == DEFAULT_ADMIN_EMAIL)
            )
        ).scalar_one_or_none()
        if existing is not None:
            logger.info("Default admin already present (user_id=%s)", existing.user_id)
            return

        session.add(
            User(
                username=DEFAULT_ADMIN_USERNAME,
                email=DEFAULT_ADMIN_EMAIL,
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                role=ROLE_ORGANIZER,
            )
        )
        session.commit()
        logger.info("Seeded default admin account '%s'", DEFAULT_ADMIN_USERNAME)
