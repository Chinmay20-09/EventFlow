"""Weather what-if endpoint tests (P4 Digital Twin; task §18, §22).

The endpoint must run the REAL P1 engine (P1_ENGINE_MODE=real default —
the same engine used by strategy-set simulation), store the result
verbatim, and never fabricate an outcome. The full Node-driven path is
covered by test_p1_e2e_real.py; here the runner is exercised for real
when Node is available and the failure path is asserted explicitly.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from conftest import ORGANIZER_HEADERS, VISITOR_HEADERS, create_event, create_node

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TSX_CLI = PROJECT_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"


def _event_with_nodes(client) -> int:
    event_id = create_event(client)
    create_node(client, event_id, name="North Gate")
    create_node(client, event_id, name="Main Hall", node_type="VENUE", capacity=300)
    create_node(client, event_id, name="South Exit")
    return event_id


@pytest.fixture()
def node_available():
    if shutil.which("node") is None or not TSX_CLI.exists():
        pytest.skip("Node runtime/tsx not available on this machine")


def test_weather_scenario_requires_auth(client):
    event_id = _event_with_nodes(client)
    response = client.post(
        f"/api/events/{event_id}/weather-scenarios",
        json={"rainfall_mm": 40, "duration_seconds": 3600},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_weather_scenario_forbidden_for_visitor(client):
    event_id = _event_with_nodes(client)
    response = client.post(
        f"/api/events/{event_id}/weather-scenarios",
        json={"rainfall_mm": 40},
        headers=VISITOR_HEADERS,
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_weather_scenario_unknown_event_404(client):
    response = client.post(
        "/api/events/999999/weather-scenarios",
        json={"rainfall_mm": 40},
        headers=ORGANIZER_HEADERS,
    )
    assert response.status_code == 404


def test_weather_scenario_validation(client):
    event_id = _event_with_nodes(client)
    # Negative rainfall and out-of-range values → 422, nothing stored.
    for payload in (
        {"rainfall_mm": -5},
        {"rainfall_mm": 500},
        {"rainfall_mm": 40, "duration_seconds": 0},
        {"rainfall_mm": 40, "unexpected": "field"},
    ):
        response = client.post(
            f"/api/events/{event_id}/weather-scenarios",
            json=payload,
            headers=ORGANIZER_HEADERS,
        )
        assert response.status_code == 422, payload
    listing = client.get(f"/api/events/{event_id}/weather-scenarios").json()["data"]
    assert listing == []


def test_weather_scenario_real_p1_run(client, node_available):
    """Rain → real P1 result: id, verbatim payload, severity label, history."""
    event_id = _event_with_nodes(client)

    # Give P1 observed crowd so the simulation moves people (same source the
    # strategy-set simulation reads): P1 → P3 ingestion contract.
    nodes = client.get(f"/api/events/{event_id}").json()["data"]["nodes"]
    hall = next(n for n in nodes if n["name"] == "Main Hall")
    from conftest import ORGANIZER_ID

    # Internal ingestion is keyed, but the key is disabled by default in tests.
    crowd_response = client.post(
        "/api/internal/crowd-state",
        json={
            "event_id": event_id,
            "timestamp": None,
            "metrics": [
                {
                    "id": str(hall["node_id"]),
                    "physical_capacity": hall["capacity"],
                    "operational_capacity": hall["capacity"],
                    "current_occupancy": 120,
                    "inflow": 0,
                    "outflow": 0,
                    "utilization": 0.4,
                    "queue_size": 0,
                    "overflow": 0,
                    "bottleneck": False,
                    "flow": 0,
                    "holding_utilization": 0.4,
                    "service_utilization": 0.0,
                    "flow_utilization": 0.0,
                    "overloaded": False,
                    "density": 0.0,
                    "density_state": "LOW",
                }
            ],
        },
    )
    assert crowd_response.status_code == 201, crowd_response.text

    response = client.post(
        f"/api/events/{event_id}/weather-scenarios",
        json={"rainfall_mm": 80, "duration_seconds": 1800, "temperature_c": 24, "wind_kmh": 15},
        headers=ORGANIZER_HEADERS,
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]

    # P1 ran for real: the engine's own result id, stored verbatim.
    assert data["status"] == "COMPLETED"
    assert data["p1_result_id"] == f"SIMULATION_RESULT_WEATHER_EVENT_{data['weather_scenario_id']}"
    p1 = data["p1_result"]
    assert p1 is not None
    assert p1["id"] == data["p1_result_id"]
    assert p1["scenario_id"] == f"WEATHER_EVENT_{data['weather_scenario_id']}"
    assert p1["status"] == "COMPLETED"
    assert "metrics" in p1 and "timeline" in p1
    assert data["severity_label"] == "Extreme rainfall"
    assert data["rainfall_mm"] == 80
    assert data["duration_seconds"] == 1800
    assert data["temperature_c"] == 24
    assert data["wind_kmh"] == 15

    # History + single read round-trip.
    listing = client.get(f"/api/events/{event_id}/weather-scenarios").json()["data"]
    assert [row["weather_scenario_id"] for row in listing] == [data["weather_scenario_id"]]
    single = client.get(
        f"/api/events/{event_id}/weather-scenarios/{data['weather_scenario_id']}"
    ).json()["data"]
    assert single["p1_result"]["id"] == data["p1_result_id"]

    # A dry scenario stores a completed run with no weather disruption
    # (baseline for the P4 §18 comparison — produced by P1, not P3).
    dry = client.post(
        f"/api/events/{event_id}/weather-scenarios",
        json={"rainfall_mm": 0},
        headers=ORGANIZER_HEADERS,
    )
    assert dry.status_code == 201
    assert dry.json()["data"]["status"] == "COMPLETED"
    assert dry.json()["data"]["severity_label"] == "No rain"


def test_weather_scenario_event_isolation(client):
    """Scenarios of one event are never visible through another event's path."""
    event_a = _event_with_nodes(client)
    event_b = _event_with_nodes(client)
    created = client.post(
        f"/api/events/{event_a}/weather-scenarios",
        json={"rainfall_mm": 20},
        headers=ORGANIZER_HEADERS,
    )
    assert created.status_code == 201, created.text
    scenario_id = created.json()["data"]["weather_scenario_id"]

    wrong = client.get(f"/api/events/{event_b}/weather-scenarios/{scenario_id}")
    assert wrong.status_code == 404
    assert client.get(f"/api/events/{event_b}/weather-scenarios").json()["data"] == []


def test_weather_scenario_deterministic_metrics(client, node_available):
    """Same scenario input → identical P1 metrics (deterministic engine).

    Result ids differ per stored row by design (each row carries its own
    scenario id, mirroring the ATTEMPT_n pattern of strategy sets) — but
    the engine's numbers must be identical for identical inputs.
    """
    event_id = _event_with_nodes(client)
    results = []
    for _ in range(2):
        response = client.post(
            f"/api/events/{event_id}/weather-scenarios",
            json={"rainfall_mm": 50, "duration_seconds": 1200},
            headers=ORGANIZER_HEADERS,
        )
        assert response.status_code == 201
        results.append(response.json()["data"])
    assert results[0]["p1_result_id"] is not None
    assert results[0]["p1_result_id"] != results[1]["p1_result_id"]  # row identity
    assert (
        results[0]["p1_result"]["metrics"] == results[1]["p1_result"]["metrics"]
    )  # deterministic engine
    assert (
        results[0]["p1_result"]["arrived_population"]
        == results[1]["p1_result"]["arrived_population"]
    )
