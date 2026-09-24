"""Phase 6/9 tests: prediction forecast endpoint + DRAFT series ingestion.

P3 stores whatever P1 supplies and never fabricates forecast values —
an event with no ingested predictions returns an empty forecast.
"""

from conftest import create_event, create_node


def _ingest(client, node_id, **overrides):
    payload = {
        "node_id": node_id,
        "metric": "crowd",
        "predicted_value": 4000,
        "prediction_horizon": 3600,
        "confidence": 0.9,
    }
    payload.update(overrides)
    return client.post("/api/internal/predictions", json=payload)


def test_forecast_empty_when_p1_has_not_ingested(client):
    event_id = create_event(client)
    create_node(client, event_id)  # nodes exist but no predictions

    response = client.get(f"/api/events/{event_id}/predictions/forecast")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["event_id"] == event_id
    assert data["zones"] == []  # no fabricated forecast values


def test_forecast_returns_stored_values_and_series(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, name="North Gate", capacity=5000)

    response = _ingest(
        client,
        node_id,
        forecast_points=[
            {"horizon_seconds": 600, "predicted_value": 3600, "confidence": 0.91},
            {"horizon_seconds": 3600, "predicted_value": 4000, "confidence": 0.87},
        ],
    )
    assert response.status_code == 201, response.text

    data = client.get(f"/api/events/{event_id}/predictions/forecast").json()["data"]
    assert len(data["zones"]) == 1
    zone = data["zones"][0]

    assert zone["node_name"] == "North Gate"
    assert zone["capacity"] == 5000
    assert zone["predicted_crowd"] == 4000
    assert zone["predicted_occupancy_pct"] == 80.0  # 4000 / 5000 — trivial ratio
    assert zone["prediction_horizon"] == 3600
    assert zone["confidence"] == 0.9
    assert isinstance(zone["prediction_id"], int)

    # Chart points stored verbatim, each with its trivial occupancy ratio.
    assert len(zone["forecast_points"]) == 2
    assert zone["forecast_points"][0]["horizon_seconds"] == 600
    assert zone["forecast_points"][0]["predicted_value"] == 3600
    assert zone["forecast_points"][0]["predicted_occupancy_pct"] == 72.0
    assert zone["forecast_points"][0]["confidence"] == 0.91
    assert zone["forecast_points"][1]["horizon_seconds"] == 3600


def test_forecast_without_series_has_empty_points(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, capacity=5000)

    assert _ingest(client, node_id).status_code == 201

    zone = client.get(f"/api/events/{event_id}/predictions/forecast").json()["data"][
        "zones"
    ][0]
    assert zone["forecast_points"] == []
    assert zone["predicted_crowd"] == 4000


def test_invalid_forecast_series_is_rejected_and_not_stored(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, capacity=5000)

    # Confidence outside [0, 1] inside a point.
    response = _ingest(
        client,
        node_id,
        forecast_points=[{"horizon_seconds": 600, "predicted_value": 1, "confidence": 1.5}],
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # Negative horizon inside a point.
    response = _ingest(
        client,
        node_id,
        forecast_points=[{"horizon_seconds": -10, "predicted_value": 1}],
    )
    assert response.status_code == 422

    # Unexpected fields inside a point.
    response = _ingest(
        client,
        node_id,
        forecast_points=[{"horizon_seconds": 600, "predicted_value": 1, "magic": True}],
    )
    assert response.status_code == 422

    # Nothing was stored at all.
    forecast = client.get(f"/api/events/{event_id}/predictions/forecast").json()["data"]
    assert forecast["zones"] == []


def test_series_replaces_previous_on_reingest(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, capacity=5000)

    _ingest(
        client,
        node_id,
        forecast_points=[{"horizon_seconds": 600, "predicted_value": 1000}],
    )
    _ingest(
        client,
        node_id,
        forecast_points=[{"horizon_seconds": 1200, "predicted_value": 2000}],
    )

    zone = client.get(f"/api/events/{event_id}/predictions/forecast").json()["data"][
        "zones"
    ][0]
    assert len(zone["forecast_points"]) == 1  # latest only (one row per node)
    assert zone["forecast_points"][0]["horizon_seconds"] == 1200


def test_forecast_not_found_for_unknown_event(client):
    response = client.get("/api/events/999999/predictions/forecast")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
