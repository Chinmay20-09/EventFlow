"""Phase 6/9 tests: dashboard aggregation, zones, recommendation.

Verifies the aggregate is composed from authoritative stored rows only,
that trivial presentation ratios are correct, and that simulation data
never appears in live aggregates.
"""

from conftest import EVENT_PAYLOAD, ORGANIZER_HEADERS, create_event, create_node


def _ingest_crowd(client, event_id, node_id, value):
    response = client.post(
        "/api/internal/crowd",
        json={"event_id": event_id, "node_id": node_id, "current_crowd": value},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_dashboard_event_info_and_envelope(client):
    event_id = create_event(client)

    response = client.get(f"/api/events/{event_id}/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"success", "data"}
    assert body["success"] is True

    data = body["data"]
    assert data["event"]["event_id"] == event_id
    assert data["event"]["name"] == EVENT_PAYLOAD["name"]
    assert data["event"]["status"] == "ACTIVE"
    for key in ("stats", "zones", "execution", "active_disruptions", "predictions"):
        assert key in data


def test_dashboard_composes_crowd_stats_from_stored_rows(client):
    event_id = create_event(client)
    main_stage = create_node(client, event_id, name="Main Stage", capacity=4000)
    transit = create_node(client, event_id, name="Transit", capacity=2000)
    create_node(client, event_id, name="East Zone", capacity=3000)  # no crowd stored

    _ingest_crowd(client, event_id, main_stage, 3200)  # 80 %
    _ingest_crowd(client, event_id, transit, 1000)  # 50 %

    data = client.get(f"/api/events/{event_id}/dashboard").json()["data"]

    # Sums only over nodes that actually have stored crowd data.
    assert data["stats"]["live_visitors"] == 4200
    assert data["stats"]["crowd_level_pct"] == 70.0  # 4200 / (4000 + 2000)
    # P4 equates network capacity with the Transit zone occupancy.
    assert data["stats"]["network_capacity_pct"] == 50.0
    # No producer exists for current operational risk — must be null, not invented.
    assert data["stats"]["risk_level"] is None

    # Embedded zones for the live crowd map.
    assert len(data["zones"]) == 3
    zone_by_name = {z["name"]: z for z in data["zones"]}
    assert zone_by_name["Main Stage"]["occupancy_pct"] == 80.0
    assert zone_by_name["Main Stage"]["current_crowd"] == 3200
    assert zone_by_name["East Zone"]["current_crowd"] is None
    assert zone_by_name["East Zone"]["occupancy_pct"] is None


def test_dashboard_execution_defaults_to_ready(client):
    event_id = create_event(client)
    data = client.get(f"/api/events/{event_id}/dashboard").json()["data"]
    assert data["execution"]["status"] == "Ready"
    assert data["execution"]["strategy_set_id"] is None


def test_dashboard_includes_disruptions_predictions_and_alert_count(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate", capacity=4000)

    disruption = client.post(
        f"/api/events/{event_id}/disruptions",
        json={
            "type": "WEATHER_EVENT",
            "severity": "HIGH",
            "affected_nodes": [node_id],
            "affected_edges": [],
            "start_time": "2026-10-10T12:10:00Z",
            "expected_duration": 1800,
            "source": "external",
        },
    )
    assert disruption.status_code == 201

    client.post(
        "/api/internal/predictions",
        json={
            "node_id": node_id,
            "metric": "crowd",
            "predicted_value": 3800,
            "prediction_horizon": 600,
            "confidence": 0.91,
        },
    )

    data = client.get(f"/api/events/{event_id}/dashboard").json()["data"]
    assert len(data["active_disruptions"]) == 1
    assert data["active_disruptions"][0]["type"] == "WEATHER_EVENT"

    assert len(data["predictions"]) == 1
    prediction = data["predictions"][0]
    assert prediction["node_name"] == "North Gate"
    assert prediction["predicted_crowd"] == 3800
    assert prediction["predicted_occupancy_pct"] == 95.0  # 3800 / 4000
    assert prediction["confidence"] == 0.91
    assert prediction["prediction_horizon"] == 600

    # Badge count matches the standalone alerts read model exactly.
    alerts = client.get(f"/api/events/{event_id}/alerts").json()["data"]
    assert data["stats"]["alert_count"] == len(alerts)


def test_dashboard_never_contains_simulation_data(client):
    """Live-vs-simulation separation (EV-016 §13, Phase 8)."""
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    set_response = client.post(
        f"/api/events/{event_id}/strategy-sets",
        json={
            "strategies": [
                {"source_node_id": north, "destination_node_id": east, "action": "REDIRECT_FLOW"}
            ]
        },
        headers=ORGANIZER_HEADERS,
    )
    strategy_set_id = set_response.json()["data"]["strategy_set_id"]
    assert client.post(f"/api/strategy-sets/{strategy_set_id}/simulate").status_code == 200

    dashboard_text = client.get(f"/api/events/{event_id}/dashboard").text
    state_text = client.get(f"/api/events/{event_id}/state").text
    for text in (dashboard_text, state_text):
        assert "[MOCK P1]" not in text
        assert "predicted_metrics" not in text
        assert "simulation" not in text.lower()


def test_dashboard_not_found(client):
    response = client.get("/api/events/999999/dashboard")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_zones_endpoint_occupancy_and_threshold(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate", capacity=4000)

    # Before crowd data: nulls, never fake zeros presented as measurements.
    zones = client.get(f"/api/events/{event_id}/zones").json()["data"]
    assert zones[0]["current_crowd"] is None
    assert zones[0]["occupancy_pct"] is None
    assert zones[0]["above_threshold"] is False

    _ingest_crowd(client, event_id, node_id, 3200)  # 80 %

    zones = client.get(f"/api/events/{event_id}/zones").json()["data"]
    assert zones[0]["occupancy_pct"] == 80.0
    assert zones[0]["above_threshold"] is False  # default threshold 85

    # Organizer lowers the threshold → trivial comparison flips.
    put = client.put(
        f"/api/events/{event_id}/settings",
        json={"alert_threshold": 75},
        headers={"X-User-Id": "2"},
    )
    assert put.status_code == 200, put.text

    zones = client.get(f"/api/events/{event_id}/zones").json()["data"]
    assert zones[0]["above_threshold"] is True


def test_zones_capacity_zero_never_divides_by_zero(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="Void", capacity=0)
    _ingest_crowd(client, event_id, node_id, 10)

    zones = client.get(f"/api/events/{event_id}/zones").json()["data"]
    assert zones[0]["occupancy_pct"] is None  # documented null rule


def test_zones_not_found(client):
    response = client.get("/api/events/999999/zones")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_recommendation_is_clearly_mock_p2(client):
    event_id = create_event(client)

    response = client.get(f"/api/events/{event_id}/recommendation")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["event_id"] == event_id
    # P3 must not invent recommendations — output comes from the P2 adapter
    # and is clearly marked while the mock is active.
    assert data["source"] == "[MOCK P2]"
    assert "[MOCK P2]" in data["headline"]
    assert "[MOCK P2]" in data["detail"]


def test_recommendation_not_found(client):
    response = client.get("/api/events/999999/recommendation")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
