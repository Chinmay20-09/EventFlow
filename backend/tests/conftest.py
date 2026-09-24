"""Shared pytest setup for the P3 backend tests.

The environment variables MUST be set before the application (and its
Settings object) is imported. Tests run against a temporary SQLite file so
they can execute without a local PostgreSQL server; the application itself
targets PostgreSQL through DATABASE_URL (EV-005 §2).
"""

import os
import sys
import tempfile
from pathlib import Path

# --- Test environment (set before importing the app) ----------------------
_TEST_DB_PATH = Path(tempfile.mkdtemp(prefix="eventflow-p3-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("MAX_SIMULATION_ATTEMPTS", "2")

# Make `backend/` importable regardless of how pytest is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.session import get_sessionmaker  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import ROLE_COORDINATOR, ROLE_ORGANIZER, ROLE_VISITOR, User  # noqa: E402

# Seeded user ids (asserted below — the test database starts empty).
COORDINATOR_ID = 1
ORGANIZER_ID = 2
VISITOR_ID = 3

COORDINATOR_HEADERS = {"X-User-Id": str(COORDINATOR_ID)}
ORGANIZER_HEADERS = {"X-User-Id": str(ORGANIZER_ID)}
VISITOR_HEADERS = {"X-User-Id": str(VISITOR_ID)}

EVENT_PAYLOAD = {
    "name": "Mumbai Music Festival",
    "start_time": "2026-10-10T10:00:00Z",
    "end_time": "2026-10-10T22:00:00Z",
}


@pytest.fixture(scope="session")
def client():
    """Session-wide TestClient; runs startup (config validation + create_all)."""
    with TestClient(app) as test_client:
        db = get_sessionmaker()()
        try:
            if db.get(User, COORDINATOR_ID) is None:
                db.add_all(
                    [
                        User(username="coordinator", role=ROLE_COORDINATOR),
                        User(username="organizer", role=ROLE_ORGANIZER),
                        User(username="visitor", role=ROLE_VISITOR),
                    ]
                )
                db.commit()
                # The test database is fresh, so the ids must match the constants.
                assert db.get(User, COORDINATOR_ID) is not None
                assert db.get(User, ORGANIZER_ID) is not None
                assert db.get(User, VISITOR_ID) is not None
        finally:
            db.close()
        yield test_client


@pytest.fixture()
def db():
    """A direct database session for asserting stored rows."""
    session = get_sessionmaker()()
    yield session
    session.close()


def create_event(client: TestClient, name: str = EVENT_PAYLOAD["name"]) -> int:
    """Helper: create an event and return its id."""
    response = client.post("/api/events", json={**EVENT_PAYLOAD, "name": name})
    assert response.status_code == 201, response.text
    return response.json()["data"]["event_id"]


def create_node(
    client: TestClient,
    event_id: int,
    name: str = "North Gate",
    node_type: str = "GATE",
    capacity: int = 5000,
) -> int:
    """Helper: create a node and return its id."""
    response = client.post(
        f"/api/events/{event_id}/nodes",
        json={
            "name": name,
            "type": node_type,
            "latitude": 19.0760,
            "longitude": 72.8777,
            "capacity": capacity,
            "status": "OPEN",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["node_id"]


def create_strategy_set(client: TestClient, event_id: int, source: int, dest: int) -> int:
    """Helper: create a strategy set and return its id."""
    response = client.post(
        f"/api/events/{event_id}/strategy-sets",
        json={
            "strategies": [
                {
                    "source_node_id": source,
                    "destination_node_id": dest,
                    "action": "REDIRECT_FLOW",
                }
            ]
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["strategy_set_id"]
