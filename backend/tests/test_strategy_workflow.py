"""Tests: Strategy Set workflow — creation, simulation, attempt limit,
invalid transitions, approval authorization, rejection and execution
(req. 7–13, plus the workflow rules from the testing requirements).

Covers:
* third simulation attempt rejected (MAX_SIMULATION_ATTEMPTS=2)
* invalid workflow transitions rejected (INVALID_STATE)
* simulation does not become live state
* approval requires Coordinator authorization
* approved_by comes from the server, never from the request body
* execution status after approval (mock P5 trigger)
* FAILED path via simulated upstream failure (explicitly marked mock)
"""

import pytest

from app.db.session import get_sessionmaker
from app.models.workflow import Approval
from app.services import workflow as workflow_service

from conftest import (
    COORDINATOR_HEADERS,
    ORGANIZER_HEADERS,
    VISITOR_HEADERS,
    create_event,
    create_node,
    create_strategy_set,
)


def _setup(client):
    """Create an event with two nodes and one strategy set."""
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    strategy_set_id = create_strategy_set(client, event_id, north, east)
    return event_id, strategy_set_id


# ---------------------------------------------------------------- creation


def test_create_strategy_set(client):
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")

    response = client.post(
        f"/api/events/{event_id}/strategy-sets",
        json={
            "strategies": [
                {
                    "source_node_id": north,
                    "destination_node_id": east,
                    "action": "REDIRECT_FLOW",
                }
            ]
        },
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["status"] == "PROPOSED"  # EV-037 §9
    assert isinstance(data["strategy_set_id"], int)
    assert len(data["strategies"]) == 1
    assert data["strategies"][0]["action"] == "REDIRECT_FLOW"


def test_strategy_set_rejects_foreign_nodes_and_stores_nothing(client):
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    # Node belonging to a different event:
    other_event = create_event(client, name="Other Event")
    stranger = create_node(client, other_event, name="Stranger Node")

    response = client.post(
        f"/api/events/{event_id}/strategy-sets",
        json={
            "strategies": [
                {"source_node_id": north, "destination_node_id": stranger, "action": "X"}
            ]
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # Validation happens before mutation: nothing was stored.
    listing = client.get(f"/api/events/{event_id}/strategy-sets").json()["data"]
    assert listing == []


def test_empty_strategy_list_is_rejected(client):
    event_id = create_event(client)
    response = client.post(f"/api/events/{event_id}/strategy-sets", json={"strategies": []})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_get_strategy_set_not_found(client):
    response = client.get("/api/strategy-sets/999999")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


# -------------------------------------------------------------- simulation


def test_simulation_flow_and_result_retrieval(client, db):
    _, strategy_set_id = _setup(client)

    response = client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["strategy_set_id"] == strategy_set_id
    assert data["status"] == "SIMULATED"
    assert isinstance(data["simulation_result_id"], int)

    # Simulation must NOT auto-approve anything (EV-003 §7).
    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["status"] == "SIMULATED"
    assert stored["approval_status"] is None
    assert stored["attempt_count"] == 1

    # Result retrieval (req. 11).
    result = client.get(f"/api/strategy-sets/{strategy_set_id}/simulation")
    assert result.status_code == 200
    result_data = result.json()["data"]
    assert result_data["strategy_set_id"] == strategy_set_id
    assert result_data["status"] == "SUCCESS"
    # Mock adapter output must be clearly marked (task: adapter design).
    assert "[MOCK P1]" in result_data["result_summary"]
    assert "conflicts" in result_data


def test_simulation_result_not_found_before_simulation(client):
    _, strategy_set_id = _setup(client)
    response = client.get(f"/api/strategy-sets/{strategy_set_id}/simulation")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_simulation_does_not_become_live_state(client):
    event_id, strategy_set_id = _setup(client)

    before = client.get(f"/api/events/{event_id}/state").json()["data"]
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    after = client.get(f"/api/events/{event_id}/state").json()["data"]

    # Live state is unchanged by the simulation and contains no simulation data.
    assert before == after
    assert "simulation" not in str(after).lower()


def test_third_simulation_attempt_is_rejected(client):
    _, strategy_set_id = _setup(client)

    first = client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    second = client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    assert first.status_code == 200
    assert second.status_code == 200  # attempt 2 is allowed (MAX=2)

    third = client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    assert third.status_code == 409
    assert third.json()["error"]["code"] == "INVALID_STATE"
    assert "Maximum simulation attempts" in third.json()["error"]["message"]

    # The set was not mutated by the rejected attempt.
    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["attempt_count"] == 2
    assert stored["status"] == "SIMULATED"

    # The latest (2nd) attempt's result is still retrievable (EV-015 §7 latest_result).
    result = client.get(f"/api/strategy-sets/{strategy_set_id}/simulation")
    assert result.status_code == 200


def test_simulation_failure_marks_failed_and_allows_explicit_retry(client, monkeypatch):
    """EV-015 §6: SIMULATING → FAILED; retry is an explicit later action."""
    _, strategy_set_id = _setup(client)

    def boom(strategy_set_id, strategies):
        raise RuntimeError("upstream engine unavailable")

    from app.services.adapters.p1_engine import get_p1_engine

    adapter = get_p1_engine()
    monkeypatch.setattr(adapter, "run_simulation", boom)

    response = client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"

    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["status"] == "FAILED"
    assert stored["attempt_count"] == 1
    assert stored["failure_reason"]

    # No automatic retry happened (EV-024 §12) — a later explicit call may retry.
    monkeypatch.undo()
    retry = client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    assert retry.status_code == 200
    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["status"] == "SIMULATED"
    assert stored["attempt_count"] == 2


# ----------------------------------------------------- invalid transitions


def test_approve_from_proposed_is_invalid_state(client):
    _, strategy_set_id = _setup(client)

    response = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE"


def test_reject_from_proposed_is_invalid_state(client):
    _, strategy_set_id = _setup(client)

    response = client.post(
        f"/api/strategy-sets/{strategy_set_id}/reject",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE"


def test_terminal_state_cannot_be_replayed(db):
    """COMPLETED/REJECTED are terminal (EV-015 §9)."""
    from app.services.workflow import ALLOWED_TRANSITIONS

    assert ALLOWED_TRANSITIONS["COMPLETED"] == set()
    assert ALLOWED_TRANSITIONS["REJECTED"] == set()
    # No STALE state exists (EV-015 §8).
    assert "STALE" not in ALLOWED_TRANSITIONS


# --------------------------------------------------- approval authorization


def test_approve_requires_authentication(client):
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")

    response = client.post(f"/api/strategy-sets/{strategy_set_id}/approve", json={})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_approve_forbidden_for_visitor_and_organizer(client):
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")

    for headers in (VISITOR_HEADERS, ORGANIZER_HEADERS):
        response = client.post(
            f"/api/strategy-sets/{strategy_set_id}/approve", json={}, headers=headers
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"


def test_client_cannot_send_approved_by(client, db):
    """EV-023 §4: approval identity in the request body must not be accepted."""
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")

    response = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={"approved_by": "attacker"},
        headers=COORDINATOR_HEADERS,
    )
    # The body schema forbids extra fields — identity is never read from it.
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # Nothing was approved.
    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["status"] == "SIMULATED"


def test_successful_approval_records_coordinator_and_triggers_execution(client, db):
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")

    response = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["strategy_set_id"] == strategy_set_id
    assert data["status"] == "APPROVED"  # documented response (EV-037 §11)
    assert data["execution_triggered"] is True

    # Automatic execution trigger moved the set to EXECUTING (EV-022 §5).
    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["status"] == "EXECUTING"
    assert stored["approval_status"] == "APPROVED"

    # Execution status endpoint (req. via EV-037 §13).
    execution = client.get(f"/api/strategy-sets/{strategy_set_id}/execution")
    assert execution.status_code == 200
    exec_data = execution.json()["data"]
    assert exec_data["status"] == "EXECUTING"
    assert exec_data["strategy_set_id"] == strategy_set_id
    assert exec_data["started_at"] is not None

    # Audit: approved_by is the authenticated Coordinator (id 1), never a string
    # supplied by the client.
    approval = (
        db.query(Approval)
        .filter(Approval.strategy_set_id == strategy_set_id)
        .one()
    )
    assert approval.decision == "APPROVED"
    assert approval.approved_by == 1  # COORDINATOR_ID from conftest


def test_duplicate_approval_is_rejected(client):
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")

    first = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert first.status_code == 200

    # Already APPROVED/EXECUTING — cannot approve again (EV-024 §13).
    second = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "INVALID_STATE"


def test_execution_endpoint_not_found_before_approval(client):
    _, strategy_set_id = _setup(client)
    response = client.get(f"/api/strategy-sets/{strategy_set_id}/execution")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


# ---------------------------------------------------------------- rejection


def test_rejection_flow(client, db):
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")

    response = client.post(
        f"/api/strategy-sets/{strategy_set_id}/reject",
        json={"reason": "Not acceptable"},
        headers=COORDINATOR_HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "REJECTED"

    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["status"] == "REJECTED"
    assert stored["approval_status"] == "REJECTED"

    approval = (
        db.query(Approval)
        .filter(Approval.strategy_set_id == strategy_set_id)
        .one()
    )
    assert approval.decision == "REJECTED"
    assert approval.reason == "Not acceptable"
    assert approval.approved_by == 1

    # Rejected is terminal — cannot be approved afterwards (EV-015 §9).
    again = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert again.status_code == 409


def test_rejection_requires_coordinator(client):
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")

    response = client.post(
        f"/api/strategy-sets/{strategy_set_id}/reject",
        json={},
        headers=VISITOR_HEADERS,
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


# --------------------------------------------------------------- execution


def test_execution_completion_and_failure_transitions(db):
    """A PROPOSED set cannot jump to COMPLETED (invalid transition, EV-015 §9)."""
    from app.models.workflow import StrategySet

    proposed = (
        db.query(StrategySet).filter(StrategySet.status == "PROPOSED").first()
    )
    assert proposed is not None  # created by earlier tests in this session

    with pytest.raises(Exception) as excinfo:
        workflow_service.complete_execution(db, proposed.strategy_set_id)
    assert getattr(excinfo.value, "code", None) == "INVALID_STATE"


def test_execution_completion_via_service(client, db):
    _, strategy_set_id = _setup(client)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )

    # Simulate the operational layer reporting success (service-level action).
    workflow_service.complete_execution(db, strategy_set_id)

    stored = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert stored["status"] == "COMPLETED"

    execution = client.get(f"/api/strategy-sets/{strategy_set_id}/execution").json()["data"]
    assert execution["status"] == "COMPLETED"
    assert execution["completed_at"] is not None

    # Replaying completion is an invalid transition (duplicate protection).
    with pytest.raises(Exception) as excinfo:
        workflow_service.complete_execution(db, strategy_set_id)
    assert getattr(excinfo.value, "code", None) == "INVALID_STATE"
