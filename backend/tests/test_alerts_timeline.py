"""Phase 6/9 tests: alerts and timeline read models.

Both are composed strictly from stored rows — no alerts/activity tables
exist, no data is invented, and thresholds come from stored settings.
"""

from app.db.session import get_sessionmaker
from app.services import workflow as workflow_service

from conftest import (
    COORDINATOR_HEADERS,
    create_event,
    create_node,
    create_strategy_set,
)


def _add_disruption(client, event_id, node_id, severity="HIGH"):
    response = client.post(
        f"/api/events/{event_id}/disruptions",
        json={
            "type": "WEATHER_EVENT",
            "severity": severity,
            "affected_nodes": [node_id],
            "affected_edges": [],
            "start_time": "2026-10-10T12:10:00Z",
            "expected_duration": 1800,
            "source": "external",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _ingest_crowd(client, event_id, node_id, value):
    response = client.post(
        "/api/internal/crowd",
        json={"event_id": event_id, "node_id": node_id, "current_crowd": value},
    )
    assert response.status_code == 201, response.text


def _ingest_prediction(client, node_id, value, horizon=600, confidence=0.9):
    response = client.post(
        "/api/internal/predictions",
        json={
            "node_id": node_id,
            "metric": "crowd",
            "predicted_value": value,
            "prediction_horizon": horizon,
            "confidence": confidence,
        },
    )
    assert response.status_code == 201, response.text


# ------------------------------------------------------------------- alerts


def test_alerts_empty_when_nothing_stored(client):
    event_id = create_event(client)
    response = client.get(f"/api/events/{event_id}/alerts")
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_alerts_include_active_disruption_with_stored_severity(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate")
    _add_disruption(client, event_id, node_id, severity="MEDIUM")

    alerts = client.get(f"/api/events/{event_id}/alerts").json()["data"]
    disruption_alerts = [a for a in alerts if a["source"] == "disruption"]
    assert len(disruption_alerts) == 1
    assert disruption_alerts[0]["level"] == "MEDIUM"  # stored severity verbatim
    assert disruption_alerts[0]["location"] == "North Gate"
    assert "Weather event disruption" in disruption_alerts[0]["title"]
    assert disruption_alerts[0]["ref_id"] > 0


def test_alerts_crowd_threshold_comparison(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate", capacity=4000)
    _ingest_crowd(client, event_id, node_id, 3200)  # 80 %

    # Default threshold 85 → no crowd alert.
    alerts = client.get(f"/api/events/{event_id}/alerts").json()["data"]
    assert [a for a in alerts if a["source"] == "crowd_threshold"] == []

    # Organizer lowers threshold to 75 → the same stored crowd now alerts.
    assert (
        client.put(
            f"/api/events/{event_id}/settings",
            json={"alert_threshold": 75},
            headers={"X-User-Id": "2"},
        ).status_code
        == 200
    )
    alerts = client.get(f"/api/events/{event_id}/alerts").json()["data"]
    crowd_alerts = [a for a in alerts if a["source"] == "crowd_threshold"]
    assert len(crowd_alerts) == 1
    assert crowd_alerts[0]["level"] == "HIGH"
    assert crowd_alerts[0]["location"] == "North Gate"


def test_prediction_threshold_alert_respects_auto_ai_alerts_setting(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate", capacity=4000)
    # Stored prediction 4000/4000 = 100 % ≥ 85 → alert while auto AI alerts ON.
    _ingest_prediction(client, node_id, 4000)

    alerts = client.get(f"/api/events/{event_id}/alerts").json()["data"]
    prediction_alerts = [a for a in alerts if a["source"] == "prediction_threshold"]
    assert len(prediction_alerts) == 1

    # Organizer switches auto AI alerts OFF → prediction alerts disappear
    # (the stored prediction itself is untouched).
    assert (
        client.put(
            f"/api/events/{event_id}/settings",
            json={"auto_ai_alerts": False},
            headers={"X-User-Id": "2"},
        ).status_code
        == 200
    )
    alerts = client.get(f"/api/events/{event_id}/alerts").json()["data"]
    assert [a for a in alerts if a["source"] == "prediction_threshold"] == []

    stored_prediction = client.get(f"/api/nodes/{node_id}/prediction")
    assert stored_prediction.status_code == 200  # data itself unchanged


def test_alerts_not_found(client):
    response = client.get("/api/events/999999/alerts")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


# ----------------------------------------------------------------- timeline


def test_timeline_empty_when_nothing_stored(client):
    """The timeline never invents entries."""
    event_id = create_event(client)
    response = client.get(f"/api/events/{event_id}/timeline")
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_timeline_composed_from_stored_rows_only(client, db):
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate", capacity=4000)
    east = create_node(client, event_id, name="East Zone")

    _add_disruption(client, event_id, north)
    strategy_set_id = create_strategy_set(client, event_id, north, east)
    assert client.post(f"/api/strategy-sets/{strategy_set_id}/simulate").status_code == 200
    approve = client.post(
        f"/api/strategy-sets/{strategy_set_id}/approve",
        json={},
        headers=COORDINATOR_HEADERS,
    )
    assert approve.status_code == 200, approve.text
    workflow_service.complete_execution(db, strategy_set_id)

    entries = client.get(f"/api/events/{event_id}/timeline").json()["data"]
    sources = {entry["source"] for entry in entries}
    assert {"disruption", "simulation", "approval", "execution"} <= sources

    messages = [entry["message"] for entry in entries]
    assert any("WEATHER_EVENT recorded" in m for m in messages)
    assert any("approved" in m for m in messages)
    assert any("Execution completed" in m for m in messages)

    # Type keys must match what the P4 timeline already renders.
    assert all(entry["type"] in ("alert", "warning", "success") for entry in entries)

    # Newest first.
    timestamps = [entry["created_at"] for entry in entries]
    assert timestamps == sorted(timestamps, reverse=True)


def test_timeline_rejection_entry_type(client):
    event_id = create_event(client)
    north = create_node(client, event_id, name="North Gate")
    east = create_node(client, event_id, name="East Zone")
    strategy_set_id = create_strategy_set(client, event_id, north, east)
    client.post(f"/api/strategy-sets/{strategy_set_id}/simulate")
    client.post(
        f"/api/strategy-sets/{strategy_set_id}/reject",
        json={"reason": "too risky"},
        headers=COORDINATOR_HEADERS,
    )

    entries = client.get(f"/api/events/{event_id}/timeline").json()["data"]
    rejection = [e for e in entries if "rejected" in e["message"]]
    assert len(rejection) == 1
    assert rejection[0]["type"] == "alert"


def test_timeline_not_found(client):
    response = client.get("/api/events/999999/timeline")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
