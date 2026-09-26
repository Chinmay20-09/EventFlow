"""P1 → P3 integration tests (POST /api/internal/crowd-state, /api/internal/simulations).

Contract source: Crowd-Engine `engine/src/serialization.ts` (serializeMetric /
serializeSimulationResult). P3 validates and preserves P1 values — it never
recalculates crowd metrics and never invents missing ones.

Covered guarantees:
- valid payload accepted, values preserved verbatim (nulls stay null, zero stays zero)
- validation errors (missing fields, bad types, bad ranges, bad enums, extras)
- all-or-nothing writes (unknown/duplicate node id stores nothing)
- duplicate snapshots: single current row per node, no double-counting
- current crowd state stays separate from simulation results
- malformed payloads / unknown references produce documented error envelopes
- P4 endpoints keep working and can retrieve the stored P1 data
"""

from sqlalchemy import select

from app.models.crowd import CrowdState

from conftest import create_event, create_node, create_strategy_set


# --- helpers ---------------------------------------------------------------


def _metric(p1_id, **overrides):
    """A complete serializeMetric payload (every key P1 emits)."""
    metric = {
        "id": p1_id,
        "physical_capacity": 5000,
        "operational_capacity": 4500,
        "current_occupancy": 3200,
        "inflow": 120.5,
        "outflow": 100.25,
        "utilization": 0.71,
        "queue_size": 12,
        "overflow": 0,
        "bottleneck": False,
        "flow": 20.25,
        "holding_utilization": 0.6,
        "service_utilization": None,
        "flow_utilization": None,
        "overloaded": False,
        "density": 0.42,
        "density_state": "MEDIUM",
    }
    metric.update(overrides)
    return metric


def _snapshot(event_id, metrics, timestamp="2026-10-10T12:00:00Z"):
    return {"event_id": event_id, "timestamp": timestamp, "metrics": metrics}


def _create_node_with_external(client, event_id, external_id, name="Hall", capacity=5000):
    """Create a node carrying a P1 string id mapping."""
    response = client.post(
        f"/api/events/{event_id}/nodes",
        json={
            "name": name,
            "type": "ZONE",
            "capacity": capacity,
            "status": "OPEN",
            "external_id": external_id,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["node_id"]


def _sim_result(result_id="p1-sim-001", status="COMPLETED", **overrides):
    """A complete serializeSimulationResult payload (every key P1 emits)."""
    result = {
        "id": result_id,
        "status": status,
        "scenario_id": "scenario-1",
        "strategy_id": "strategy-1",
        "baseline": "CURRENT_GRAPH",
        "baseline_ref": None,
        "seed": 42,
        "simulated_start_time": "2026-10-10T10:00:00Z",
        "simulated_end_time": "2026-10-10T11:00:00Z",
        "duration": 3600,
        "metrics": {
            "population": 100,
            "occupancy": 120,
            "flow": 15.5,
            "density": 0.6,
            "queue_size": 12,
            "waiting_time": 30,
            "travel_time": 120,
            "arrived_population": 40,
            "diverted_population": 5,
            "congestion": 0.4,
            "capacity_utilization": 0.8,
            "throughput": 90.5,
            "intervention_impact": None,
            "time_to_congestion": None,
            "peak_congestion": 0.7,
            "peak_queue": 20,
            "recovery_time": None,
            "duration": 3600,
        },
        "scoped_metrics": [
            {
                "metric": "queue_size",
                "target_type": "NODE",
                "target_id": "HALL",
                "aggregation": "PEAK",
                "value": 20,
                "unit": "people",
            }
        ],
        "final_state": {
            "population": 120,
            "overloaded_nodes": ["HALL"],
            "overloaded_edges": [],
            "active_scenario_disruptions": [],
            "affected_entity_status": {"HALL": "OPEN"},
        },
        "events": [
            {
                "sim_time": "00:00:10",
                "type": "QUEUE_GROWTH",
                "target_type": "NODE",
                "target_id": "HALL",
                "detail": {"queue": 12},
            }
        ],
        "affected_nodes": ["HALL"],
        "affected_edges": ["HALL_GATE"],
        "affected_groups": ["group-1"],
        "bottlenecks": ["HALL_GATE"],
        "capacity_violations": [],
        "queue_growth": {"HALL": 12},
        "estimated_delay_seconds": 300,
        "arrived_population": 40,
        "stranded_population": 0,
        "timeline": [
            {
                "time_seconds": 60,
                "node_metrics": [_metric("HALL")],
                "edge_metrics": [_metric("HALL_GATE")],
                "crowd": [
                    {
                        "id": "group-1",
                        "source_id": "ENTRY",
                        "population": 20,
                        "current_location": {"kind": "NODE", "id": "HALL"},
                        "destination": "EXIT",
                        "average_speed": 1.2,
                        "movement_rate": 4,
                        "preferred_route": ["HALL_GATE"],
                        "assigned_route": ["HALL_GATE"],
                        "route_flexibility": "LIMITED",
                        "state": "MOVING",
                        "progress": 0.5,
                        "waiting_time": 0,
                        "travel_time": 40,
                    }
                ],
            }
        ],
        "diagnostics": [],
        "warnings": [{"code": "W1", "message": "capacity tight"}],
    }
    result.update(overrides)
    return result


# --- crowd-state: valid data ---------------------------------------------


def test_valid_p1_snapshot_is_accepted_and_values_preserved(client):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL")

    metric = _metric("HALL")
    response = client.post("/api/internal/crowd-state", json=_snapshot(event_id, [metric]))
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body.keys()) == {"success", "data"}
    assert len(body["data"]) == 1
    assert body["data"][0]["node_id"] == node_id
    assert body["data"][0]["current_crowd"] == 3200
    assert body["data"][0]["p1_metric"] == metric  # verbatim, field for field

    # P4 retrieval through the existing read endpoint.
    fetched = client.get(f"/api/nodes/{node_id}/crowd").json()["data"]
    assert fetched["current_crowd"] == 3200
    assert fetched["p1_metric"] == metric
    assert fetched["updated_at"] is not None  # freshness information


def test_p1_string_id_and_numeric_node_id_both_resolve(client):
    event_id = create_event(client)
    ext_node = _create_node_with_external(client, event_id, "GATE_A", name="Gate A")
    # A P3 integer id used as a P1 string id must also resolve (documented fallback).
    plain_node = create_node(client, event_id, name="Plain Node")

    response = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(
            event_id,
            [_metric("GATE_A", current_occupancy=100), _metric(str(plain_node), current_occupancy=200)],
        ),
    )
    assert response.status_code == 201, response.text

    assert client.get(f"/api/nodes/{ext_node}/crowd").json()["data"]["current_crowd"] == 100
    assert client.get(f"/api/nodes/{plain_node}/crowd").json()["data"]["current_crowd"] == 200


def test_null_and_zero_are_preserved_distinctly(client):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL")

    # Missing capacity => null (never turned into 0); zero occupancy => 0 (never turned into null).
    metric = _metric(
        "HALL",
        physical_capacity=None,
        operational_capacity=None,
        utilization=None,
        density=None,
        current_occupancy=0,
        queue_size=0,
    )
    response = client.post("/api/internal/crowd-state", json=_snapshot(event_id, [metric]))
    assert response.status_code == 201, response.text

    fetched = client.get(f"/api/nodes/{node_id}/crowd").json()["data"]
    assert fetched["current_crowd"] == 0  # zero is a real value
    stored = fetched["p1_metric"]
    assert stored["physical_capacity"] is None
    assert stored["operational_capacity"] is None
    assert stored["utilization"] is None
    assert stored["density"] is None
    assert stored["queue_size"] == 0


def test_p1_timestamp_is_kept_as_freshness_information(client):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL")

    response = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL")], timestamp="2026-09-01T08:30:00Z"),
    )
    assert response.status_code == 201, response.text

    # A stale timestamp is not rejected and not rewritten — P4 reads freshness
    # from updated_at instead of P3 deciding staleness on its own.
    fetched = client.get(f"/api/nodes/{node_id}/crowd").json()["data"]
    assert fetched["updated_at"].startswith("2026-09-01T08:30:00")


# --- crowd-state: validation ----------------------------------------------


def test_missing_required_field_is_rejected_and_not_stored(client):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL")

    metric = _metric("HALL")
    del metric["density_state"]
    response = client.post("/api/internal/crowd-state", json=_snapshot(event_id, [metric]))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.get(f"/api/nodes/{node_id}/crowd").status_code == 404


def test_invalid_types_are_rejected(client):
    event_id = create_event(client)
    _create_node_with_external(client, event_id, "HALL")

    bad = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL", inflow="fast")]),
    )
    assert bad.status_code == 422

    bad_bool = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL", bottleneck="maybe")]),
    )
    assert bad_bool.status_code == 422

    bad_id = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric(7)]),
    )
    assert bad_id.status_code == 422


def test_invalid_ranges_are_rejected(client):
    event_id = create_event(client)
    _create_node_with_external(client, event_id, "HALL")

    negative_occupancy = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL", current_occupancy=-1)]),
    )
    assert negative_occupancy.status_code == 422

    negative_queue = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL", queue_size=-5)]),
    )
    assert negative_queue.status_code == 422


def test_invalid_enum_and_extra_fields_are_rejected(client):
    event_id = create_event(client)
    _create_node_with_external(client, event_id, "HALL")

    bad_enum = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL", density_state="EXTREME")]),
    )
    assert bad_enum.status_code == 422

    extra_field = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL", bonus=1)]),
    )
    assert extra_field.status_code == 422

    empty = client.post("/api/internal/crowd-state", json=_snapshot(event_id, []))
    assert empty.status_code == 422


def test_unknown_and_duplicate_p1_ids_reject_the_whole_snapshot(client):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL")

    # Unknown P1 node id -> 422, nothing stored (even for resolvable entries).
    unknown = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL"), _metric("NOWHERE")]),
    )
    assert unknown.status_code == 422
    assert unknown.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.get(f"/api/nodes/{node_id}/crowd").status_code == 404

    # Duplicate P1 node id inside one payload -> 422, nothing stored.
    duplicate = client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL"), _metric("HALL")]),
    )
    assert duplicate.status_code == 422
    assert client.get(f"/api/nodes/{node_id}/crowd").status_code == 404


def test_unknown_event_is_not_found(client):
    response = client.post("/api/internal/crowd-state", json=_snapshot(999999, [_metric("HALL")]))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


# --- crowd-state: duplicates ----------------------------------------------


def test_duplicate_snapshot_is_last_write_and_never_double_counts(client, db):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL")

    first = client.post("/api/internal/crowd-state", json=_snapshot(event_id, [_metric("HALL", current_occupancy=3200)]))
    second = client.post("/api/internal/crowd-state", json=_snapshot(event_id, [_metric("HALL", current_occupancy=3500)]))
    assert first.status_code == 201
    assert second.status_code == 201  # idempotent upsert, not an error

    rows = db.execute(select(CrowdState).where(CrowdState.node_id == node_id)).scalars().all()
    assert len(rows) == 1  # single current row per node — never double-counted
    assert rows[0].current_crowd == 3500  # last write wins

    # Re-delivering the identical snapshot changes nothing.
    replay = client.post("/api/internal/crowd-state", json=_snapshot(event_id, [_metric("HALL", current_occupancy=3500)]))
    assert replay.status_code == 201
    rows = db.execute(select(CrowdState).where(CrowdState.node_id == node_id)).scalars().all()
    assert len(rows) == 1
    assert rows[0].current_crowd == 3500


def test_external_id_mapping_is_unique_within_event(client):
    event_id = create_event(client)
    other_event = create_event(client, name="Other Event")

    _create_node_with_external(client, event_id, "HALL")
    # Same P1 id in a DIFFERENT event is fine (ids are scoped per event).
    _create_node_with_external(client, other_event, "HALL", name="Other Hall")

    duplicate_map = client.post(
        f"/api/events/{event_id}/nodes",
        json={"name": "Dup", "type": "ZONE", "capacity": 100, "external_id": "HALL"},
    )
    assert duplicate_map.status_code == 422
    assert duplicate_map.json()["error"]["code"] == "VALIDATION_ERROR"


# --- simulation ingestion ---------------------------------------------------


def test_valid_simulation_is_stored_verbatim_and_retrievable(client):
    event_id = create_event(client)
    source = create_node(client, event_id, name="Source")
    dest = create_node(client, event_id, name="Dest")
    strategy_set_id = create_strategy_set(client, event_id, source, dest)

    result = _sim_result()
    response = client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": strategy_set_id, "result": result},
    )
    assert response.status_code == 201, response.text
    body = response.json()["data"]
    assert body["status"] == "SIMULATED"
    assert body["duplicate"] is False
    sim_id = body["simulation_result_id"]

    # P4 retrieval: the full P1 payload comes back field for field.
    fetched = client.get(f"/api/strategy-sets/{strategy_set_id}/simulation").json()["data"]
    assert fetched["simulation_result_id"] == sim_id
    assert fetched["status"] == "COMPLETED"  # P1's SimulationStatus, verbatim
    assert fetched["p1_result"] == result
    assert fetched["predicted_metrics"] is None  # simulation metrics are not predictions


def test_simulation_status_is_never_remapped(client):
    event_id = create_event(client)
    source = create_node(client, event_id, name="Source")
    dest = create_node(client, event_id, name="Dest")
    strategy_set_id = create_strategy_set(client, event_id, source, dest)

    response = client.post(
        "/api/internal/simulations",
        json={
            "strategy_set_id": strategy_set_id,
            "result": _sim_result(result_id="p1-sim-fail", status="SIMULATION_FAILURE"),
        },
    )
    assert response.status_code == 201, response.text

    fetched = client.get(f"/api/strategy-sets/{strategy_set_id}/simulation").json()["data"]
    assert fetched["status"] == "SIMULATION_FAILURE"  # P1 status preserved, not remapped


def test_duplicate_simulation_result_is_idempotent(client):
    event_id = create_event(client)
    source = create_node(client, event_id, name="Source")
    dest = create_node(client, event_id, name="Dest")
    strategy_set_id = create_strategy_set(client, event_id, source, dest)

    payload = {"strategy_set_id": strategy_set_id, "result": _sim_result()}
    first = client.post("/api/internal/simulations", json=payload)
    assert first.status_code == 201, first.text
    first_id = first.json()["data"]["simulation_result_id"]

    # Same P1 result id again -> duplicate acknowledged, original preserved.
    second = client.post("/api/internal/simulations", json=payload)
    assert second.status_code == 201, second.text
    assert second.json()["data"]["duplicate"] is True
    assert second.json()["data"]["simulation_result_id"] == first_id

    # No extra attempt was consumed and no second row was created.
    strategy_set = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert strategy_set["attempt_count"] == 1
    assert strategy_set["simulation_result_id"] == first_id


def test_distinct_simulation_results_respect_attempt_limit(client):
    event_id = create_event(client)
    source = create_node(client, event_id, name="Source")
    dest = create_node(client, event_id, name="Dest")
    strategy_set_id = create_strategy_set(client, event_id, source, dest)

    first = client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": strategy_set_id, "result": _sim_result(result_id="p1-sim-1")},
    )
    assert first.status_code == 201
    second = client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": strategy_set_id, "result": _sim_result(result_id="p1-sim-2")},
    )
    assert second.status_code == 201

    third = client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": strategy_set_id, "result": _sim_result(result_id="p1-sim-3")},
    )
    assert third.status_code == 409
    assert third.json()["error"]["code"] == "INVALID_STATE"


def test_malformed_simulation_payload_is_rejected_and_changes_nothing(client):
    event_id = create_event(client)
    source = create_node(client, event_id, name="Source")
    dest = create_node(client, event_id, name="Dest")
    strategy_set_id = create_strategy_set(client, event_id, source, dest)

    # Missing required top-level key.
    missing = client.post("/api/internal/simulations", json={"result": _sim_result()})
    assert missing.status_code == 422

    # Missing nested metrics key.
    bad_result = _sim_result()
    del bad_result["metrics"]
    malformed = client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": strategy_set_id, "result": bad_result},
    )
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "VALIDATION_ERROR"

    # Invalid enum value.
    bad_status = client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": strategy_set_id, "result": _sim_result(status="DONE")},
    )
    assert bad_status.status_code == 422

    # Unknown strategy set -> 404.
    unknown = client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": 999999, "result": _sim_result()},
    )
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "NOT_FOUND"

    # Nothing was written: the strategy set is untouched.
    strategy_set = client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"]
    assert strategy_set["status"] == "PROPOSED"
    assert strategy_set["simulation_result_id"] is None
    assert strategy_set["attempt_count"] == 0


def test_malformed_json_body_returns_documented_error_envelope(client):
    event_id = create_event(client)
    response = client.post(
        "/api/internal/crowd-state",
        content=b"{not json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"


# --- current vs simulation separation --------------------------------------


def test_current_crowd_and_simulation_results_stay_separate(client, db):
    event_id = create_event(client)
    source = create_node(client, event_id, name="Source", capacity=5000)
    dest = create_node(client, event_id, name="Dest")
    strategy_set_id = create_strategy_set(client, event_id, source, dest)

    # Live P1 snapshot first.
    client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric(str(source), current_occupancy=3200)]),
    )
    # Then a P1 simulation result.
    client.post(
        "/api/internal/simulations",
        json={"strategy_set_id": strategy_set_id, "result": _sim_result()},
    )

    # Simulation must not touch the current crowd row.
    crowd = client.get(f"/api/nodes/{source}/crowd").json()["data"]
    assert crowd["current_crowd"] == 3200
    assert crowd["p1_metric"]["current_occupancy"] == 3200
    assert "p1_result" not in crowd

    # Current crowd must not leak into the simulation result either.
    sim = client.get(f"/api/strategy-sets/{strategy_set_id}/simulation").json()["data"]
    assert sim["p1_result"]["metrics"]["occupancy"] == 120  # P1's simulated value
    assert sim["p1_result"]["metrics"]["occupancy"] != crowd["current_crowd"]

    # The live dashboard reads only stored current rows (no simulation data).
    dashboard = client.get(f"/api/events/{event_id}/dashboard").json()["data"]
    assert dashboard["stats"]["crowd_level_pct"] == 64.0  # 3200 / 5000


# --- P4 compatibility -------------------------------------------------------


def test_p4_nodes_endpoint_exposes_p1_mapping(client):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL")

    node = client.get(f"/api/nodes/{node_id}").json()["data"]
    assert node["external_id"] == "HALL"
    assert node["capacity"] == 5000  # graph data unchanged by P1 ingestion


def test_p4_dashboard_reflects_ingested_p1_values(client):
    event_id = create_event(client)
    node_id = _create_node_with_external(client, event_id, "HALL", capacity=5000)

    # Before any P1 data: crowd not found (no fabricated zero row).
    assert client.get(f"/api/nodes/{node_id}/crowd").status_code == 404

    client.post(
        "/api/internal/crowd-state",
        json=_snapshot(event_id, [_metric("HALL", current_occupancy=2500)]),
    )

    dashboard = client.get(f"/api/events/{event_id}/dashboard").json()["data"]
    assert dashboard["stats"]["live_visitors"] == 2500
    assert dashboard["stats"]["crowd_level_pct"] == 50.0
