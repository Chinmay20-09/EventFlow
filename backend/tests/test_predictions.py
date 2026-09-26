"""Tests: prediction ingestion and retrieval (req. 6, 15, 16).

Verifies P3 stores exactly what P1 supplied and never calculates a
prediction (EV-003 §10, EV-016 §20, EV-037 §8).
"""

from conftest import create_event, create_node


def _ingest(client, node_id, value=8200, horizon=600, confidence=0.91, metric="crowd"):
    return client.post(
        "/api/internal/predictions",
        json={
            "node_id": node_id,
            "metric": metric,
            "predicted_value": value,
            "prediction_horizon": horizon,
            "confidence": confidence,
        },
    )


def test_prediction_ingestion_roundtrip(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id)

    response = _ingest(client, node_id, value=8200, horizon=600, confidence=0.91)
    assert response.status_code == 201
    assert response.json()["success"] is True

    fetched = client.get(f"/api/nodes/{node_id}/prediction")
    assert fetched.status_code == 200
    data = fetched.json()["data"]
    assert data["node_id"] == node_id
    # Stored verbatim — no calculation, no conversion (P3 stores, P1 produces).
    assert data["predicted_crowd"] == 8200
    assert data["prediction_horizon"] == 600
    assert data["confidence"] == 0.91
    assert "created_at" in data


def test_latest_prediction_replaces_previous_one(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id)

    assert _ingest(client, node_id, value=5000).status_code == 201
    assert _ingest(client, node_id, value=7300).status_code == 201

    data = client.get(f"/api/nodes/{node_id}/prediction").json()["data"]
    assert data["predicted_crowd"] == 7300  # latest only (EV-005 §9)


def test_prediction_for_unknown_node_is_not_found(client):
    response = _ingest(client, 999999)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_missing_prediction_is_not_found(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id)

    response = client.get(f"/api/nodes/{node_id}/prediction")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_invalid_prediction_payloads_are_rejected(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id)
    before = client.get(f"/api/nodes/{node_id}/prediction").status_code

    # Unknown metric: P3 must not interpret metrics it does not store.
    response = _ingest(client, node_id, metric="risk")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # Negative horizon.
    response = _ingest(client, node_id, horizon=-10)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # Confidence outside [0, 1].
    response = _ingest(client, node_id, confidence=1.5)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    # Nothing invalid was stored.
    after = client.get(f"/api/nodes/{node_id}/prediction").status_code
    assert after == before
