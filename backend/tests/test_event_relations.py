"""Event-centered relationship integrity (audit task, Phase 9).

Proves the database relationships claimed by the models, not only the API
validation layer:

* events.event_id is the parent key; every direct child carries a real
  FOREIGN KEY to it (schema introspection, works on SQLite and PostgreSQL).
* The database itself rejects child rows referencing nonexistent parents
  (FK enforcement — enabled explicitly, see fk_enforced).
* No orphan event references exist anywhere in the test database.
* The indirect chain events → strategy_sets → strategies / approvals /
  executions / simulation_results still works end-to-end through the API.
* Event-scoped retrieval returns only that event's records.

No schema is modified here; these tests verify what already exists.
"""

from sqlalchemy import inspect, text

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.session import get_sessionmaker

from conftest import (
    COORDINATOR_HEADERS,
    create_event,
    create_node,
    create_strategy_set,
)


# --------------------------------------------------------------- helpers


@pytest.fixture()
def fk_db():
    """A db session with SQLite FK enforcement turned ON (no-op on PG).

    SQLite (the automated-test database) silently ignores FOREIGN KEY
    constraints unless this pragma is set per connection. PostgreSQL, the
    production target, always enforces them — so these tests prove the same
    guarantee the live database gives.
    """
    session = get_sessionmaker()()
    if session.bind.dialect.name == "sqlite":
        session.execute(text("PRAGMA foreign_keys = ON"))
    yield session
    session.rollback()
    session.close()


def _fk_targets(db, table: str) -> set[str]:
    """Set of referenced parent tables for the given table's foreign keys."""
    inspector = inspect(db.bind)
    return {fk["referred_table"] for fk in inspector.get_foreign_keys(table)}


# ------------------------------------------------- schema-level integrity


def test_every_direct_child_has_fk_to_events(client, db):
    """Direct event children declare a real FOREIGN KEY → events (Phase 9.7)."""
    for table in ("nodes", "edges", "disruptions", "event_settings", "strategy_sets"):
        assert "events" in _fk_targets(db, table), (
            f"{table}.event_id must have a FOREIGN KEY to events.event_id"
        )


def test_events_event_id_is_primary_key(client, db):
    inspector = inspect(db.bind)
    pk = inspector.get_pk_constraint("events")["constrained_columns"]
    assert pk == ["event_id"]


def test_no_orphan_event_references_in_any_child(client, db):
    """No child row may reference an event that does not exist (Phase 9.8)."""
    orphans = db.execute(text("""
        SELECT 'nodes' AS t, COUNT(*) FROM nodes n LEFT JOIN events e
          ON n.event_id = e.event_id WHERE e.event_id IS NULL
        UNION ALL
        SELECT 'edges', COUNT(*) FROM edges c LEFT JOIN events e
          ON c.event_id = e.event_id WHERE e.event_id IS NULL
        UNION ALL
        SELECT 'disruptions', COUNT(*) FROM disruptions d LEFT JOIN events e
          ON d.event_id = e.event_id WHERE e.event_id IS NULL
        UNION ALL
        SELECT 'event_settings', COUNT(*) FROM event_settings s LEFT JOIN events e
          ON s.event_id = e.event_id WHERE e.event_id IS NULL
        UNION ALL
        SELECT 'strategy_sets', COUNT(*) FROM strategy_sets ss LEFT JOIN events e
          ON ss.event_id = e.event_id WHERE e.event_id IS NULL
        UNION ALL
        SELECT 'strategies(via set)', COUNT(*) FROM strategies s
          LEFT JOIN strategy_sets ss ON s.strategy_set_id = ss.strategy_set_id
          WHERE ss.strategy_set_id IS NULL
        UNION ALL
        SELECT 'simulation_results(via set)', COUNT(*) FROM simulation_results r
          LEFT JOIN strategy_sets ss ON r.strategy_set_id = ss.strategy_set_id
          WHERE ss.strategy_set_id IS NULL
        UNION ALL
        SELECT 'approvals(via set)', COUNT(*) FROM approvals a
          LEFT JOIN strategy_sets ss ON a.strategy_set_id = ss.strategy_set_id
          WHERE ss.strategy_set_id IS NULL
        UNION ALL
        SELECT 'executions(via set)', COUNT(*) FROM executions x
          LEFT JOIN strategy_sets ss ON x.strategy_set_id = ss.strategy_set_id
          WHERE ss.strategy_set_id IS NULL
        UNION ALL
        SELECT 'crowd_state(via node)', COUNT(*) FROM crowd_state cs
          LEFT JOIN nodes n ON cs.node_id = n.node_id WHERE n.node_id IS NULL
        UNION ALL
        SELECT 'predictions(via node)', COUNT(*) FROM predictions p
          LEFT JOIN nodes n ON p.node_id = n.node_id WHERE n.node_id IS NULL
    """)).all()
    offenders = [(t, n) for (t, n) in orphans if n > 0]
    assert offenders == [], f"orphan references found: {offenders}"


# ------------------------------------------------- FK enforcement (write path)


def test_database_rejects_node_with_unknown_event(client, fk_db):
    """INSERT with a nonexistent events.event_id must fail at the DB level."""
    from app.models.graph import Node as NodeModel

    with pytest.raises(IntegrityError):
        fk_db.add(
            NodeModel(
                event_id=999999,  # no such event
                name="Orphan Node",
                type="GATE",
                capacity=100,
            )
        )
        fk_db.flush()


def test_database_rejects_crowd_state_with_unknown_node(client, fk_db):
    from app.models.crowd import CrowdState as CrowdStateModel

    with pytest.raises(IntegrityError):
        fk_db.add(CrowdStateModel(node_id=999999, current_crowd=10))
        fk_db.flush()


# ------------------------------------------------- indirect chains (API level)


def test_indirect_chain_event_to_strategies(client):
    """events → strategy_sets → strategies still resolves (Phase 9.9)."""
    event_id = create_event(client, name="Chain Event")
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    strategy_set_id = create_strategy_set(client, event_id, north, east)

    sets = client.get(f"/api/events/{event_id}/strategy-sets").json()["data"]
    assert [s["strategy_set_id"] for s in sets] == [strategy_set_id]
    assert sets[0]["strategies"][0]["source_node_id"] == north

    single = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert single["strategies"][0]["destination_node_id"] == east


def test_indirect_chain_event_to_simulation_approval_execution(client, db):
    """events → strategy_sets → simulation / approval / execution (Phase 9.9)."""
    from app.models.workflow import Approval, Execution, SimulationResult

    event_id = create_event(client, name="Workflow Chain Event")
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    strategy_set_id = create_strategy_set(client, event_id, north, east)

    # simulate → approve → execution completes
    assert client.post(f"/api/strategy-sets/{strategy_set_id}/simulate").status_code == 200
    approve = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert approve.status_code == 200, approve.text
    sim_result_id = client.get(
        f"/api/strategy-sets/{strategy_set_id}/simulation"
    ).json()["data"]["simulation_result_id"]

    # Every downstream row resolves back to the one event through strategy_sets.
    ss = db.execute(
        text("SELECT event_id FROM strategy_sets WHERE strategy_set_id = :i"),
        {"i": strategy_set_id},
    ).scalar_one()
    assert ss == event_id

    assert (
        db.execute(
            text("SELECT COUNT(*) FROM simulation_results WHERE strategy_set_id = :i"),
            {"i": strategy_set_id},
        ).scalar_one()
        == 1
    )
    assert db.get(SimulationResult, sim_result_id) is not None
    assert db.execute(
        text("SELECT COUNT(*) FROM approvals WHERE strategy_set_id = :i"),
        {"i": strategy_set_id},
    ).scalar_one() == 1
    assert db.execute(
        text("SELECT COUNT(*) FROM executions WHERE strategy_set_id = :i"),
        {"i": strategy_set_id},
    ).scalar_one() == 1

    approval = db.query(Approval).filter_by(strategy_set_id=strategy_set_id).one()
    execution = db.query(Execution).filter_by(strategy_set_id=strategy_set_id).one()
    assert approval.approved_by == 1  # COORDINATOR_ID (server-side identity)
    assert execution.status == "EXECUTING"


def test_event_scoped_retrieval_returns_only_that_event(client):
    """Data of event A never leaks into event B (Phase 9.4)."""
    event_a = create_event(client, name="Event A")
    event_b = create_event(client, name="Event B")
    node_a = create_node(client, event_a, name="Gate A")
    create_node(client, event_b, name="Gate B")

    nodes_a = client.get(f"/api/events/{event_a}/nodes").json()["data"]
    assert [n["node_id"] for n in nodes_a] == [node_a]

    sets_a = client.get(f"/api/events/{event_a}/strategy-sets").json()["data"]
    assert sets_a == []

    state = client.get(f"/api/events/{event_a}/state").json()["data"]
    assert state["event_id"] == event_a
    assert [n["node_id"] for n in state["nodes"]] == [node_a]


def test_existing_event_data_untouched_after_child_operations(client):
    """Child writes never alter the parent event row (Phase 9.5)."""
    event_id = create_event(client, name="Stable Parent")
    before = client.get(f"/api/events/{event_id}").json()["data"]

    node_id = create_node(client, event_id, name="New Gate")
    assert client.post(
        "/api/internal/crowd",
        json={"event_id": event_id, "node_id": node_id, "current_crowd": 123},
    ).status_code == 201

    after = client.get(f"/api/events/{event_id}").json()["data"]
    parent_fields = ("event_id", "name", "status", "start_time", "end_time")
    assert {key: before[key] for key in parent_fields} == {
        key: after[key] for key in parent_fields
    }
    assert after["name"] == "Stable Parent"
