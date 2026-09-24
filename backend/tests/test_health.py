"""Tests: health endpoint and the documented success envelope (req. 1, 14)."""


def test_health_returns_documented_envelope(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()

    # Exact envelope shape (EV-016 §3).
    assert set(body.keys()) == {"success", "data"}
    assert body["success"] is True

    data = body["data"]
    assert data["status"] == "ok"
    assert data["max_simulation_attempts"] == 2  # EV-015 §7 default
    assert isinstance(data["environment"], str)
