"""Phase 6/9 tests: P2-supplied strategy metadata + simulation metrics.

Verifies that strategy names/descriptions/risk levels and predicted metrics
are stored VERBATIM from their upstream (mock-marked) sources — P3 never
generates them — and that simulation data never leaks into live state.
"""

from conftest import COORDINATOR_HEADERS, ORGANIZER_HEADERS, create_event, create_node


def _strategy_set_payload(client, event_id, north, east, **metadata):
    payload = {
        "strategies": [
            {"source_node_id": north, "destination_node_id": east, "action": "REDIRECT_FLOW"}
        ]
    }
    payload.update(metadata)
    response = client.post(f"/api/events/{event_id}/strategy-sets", json=payload, headers=ORGANIZER_HEADERS)
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_strategy_set_stores_p2_metadata_verbatim(client):
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")

    created = _strategy_set_payload(
        client,
        event_id,
        north,
        east,
        name="Redirect Crowd",
        description="Redirect incoming crowd from North Gate toward East Zone.",
        risk_level="LOW",
    )
    assert created["name"] == "Redirect Crowd"
    assert created["risk_level"] == "LOW"

    # Round-trips through list + single read (what the P4 Strategies page needs).
    listed = client.get(f"/api/events/{event_id}/strategy-sets").json()["data"]
    assert listed[0]["name"] == "Redirect Crowd"
    assert listed[0]["description"].startswith("Redirect incoming crowd")
    single = client.get(f"/api/strategy-sets/{created['strategy_set_id']}").json()["data"]
    assert single["risk_level"] == "LOW"


def test_strategy_set_without_metadata_has_nulls(client):
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")

    created = _strategy_set_payload(client, event_id, north, east)
    assert created["name"] is None
    assert created["description"] is None
    assert created["risk_level"] is None


def test_simulation_result_stores_real_p1_payload_verbatim(client):
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    strategy_set_id = _strategy_set_payload(client, event_id, north, east)["strategy_set_id"]

    assert (
        client.post(f"/api/strategy-sets/{strategy_set_id}/simulate").status_code == 200
    )

    result = client.get(f"/api/strategy-sets/{strategy_set_id}/simulation").json()["data"]
    # Real P1 engine (P1_ENGINE_MODE=real default): the full serialized P1
    # result is stored verbatim in p1_result — never a mock placeholder.
    assert "[MOCK P1]" not in result["result_summary"]
    p1_result = result["p1_result"]
    assert p1_result is not None
    assert p1_result["status"] == "COMPLETED"
    assert p1_result["id"] == f"SIMULATION_RESULT_STRATEGY_SET_{strategy_set_id}_ATTEMPT_1"
    assert p1_result["scenario_id"] == f"STRATEGY_SET_{strategy_set_id}_ATTEMPT_1"
    assert "metrics" in p1_result and "timeline" in p1_result
    # The engine's own metrics are simulation data, not P3 predictions.
    assert result["predicted_metrics"] is None


def test_attempt_count_exposed_to_frontend(client):
    """P4 needs the simulation attempt number (Phase 7 contract)."""
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    strategy_set_id = _strategy_set_payload(client, event_id, north, east)["strategy_set_id"]

    assert client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"][
        "attempt_count"
    ] == 0
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    assert client.get(f"/api/strategy-sets/{strategy_set_id}").json()["data"][
        "attempt_count"
    ] == 1


def test_execution_exposed_after_approval(client):
    """P4 execution panel contract: status + timestamps + strategy id."""
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    strategy_set_id = _strategy_set_payload(client, event_id, north, east)["strategy_set_id"]

    # Dashboard shows Ready before any approval.
    dashboard = client.get(f"/api/events/{event_id}/dashboard").json()["data"]
    assert dashboard["execution"]["status"] == "Ready"

    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    approve = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert approve.status_code == 200

    execution = client.get(f"/api/strategy-sets/{strategy_set_id}/execution").json()["data"]
    assert execution["status"] == "EXECUTING"
    assert execution["started_at"] is not None
    assert execution["completed_at"] is None

    dashboard = client.get(f"/api/events/{event_id}/dashboard").json()["data"]
    assert dashboard["execution"]["status"] == "EXECUTING"
    assert dashboard["execution"]["strategy_set_id"] == strategy_set_id
