"""Phase 6/9 tests: POST /api/internal/crowd (P1 → P3 ingestion).

P1 calculates the crowd state; P3 validates and stores it. Key guarantees:
single current row per node (idempotent upsert), graph capacity never
changed by crowd data (EV-020 §5), invalid payloads rejected and not stored.
"""

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.crowd import CrowdState

from conftest import create_event, create_node


def _payload(event_id, node_id, value=3200, **extra):
    payload = {"event_id": event_id, "node_id": node_id, "current_crowd": value}
    payload.update(extra)
    return payload


def test_ingest_stores_crowd_and_returns_envelope(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id, capacity=4000)

    response = client.post(
        "/api/internal/crowd",
        json=_payload(
            event_id,
            node_id,
            timestamp="2026-10-10T12:00:00Z",
            source="test-sensor",
            quality=0.95,
        ),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body.keys()) == {"success", "data"}
    assert body["data"]["node_id"] == node_id
    assert body["data"]["current_crowd"] == 3200

    # Readable through the documented read endpoint (EV-037 §6 shape).
    fetched = client.get(f"/api/nodes/{node_id}/crowd").json()["data"]
    assert fetched["current_crowd"] == 3200
    assert fetched["updated_at"] is not None

    # EV-020 §5: crowd data must never change graph capacity.
    node = client.get(f"/api/nodes/{node_id}").json()["data"]
    assert node["capacity"] == 4000


def test_duplicate_ingestion_is_single_current_row(client, db):
    event_id = create_event(client)
    node_id = create_node(client, event_id, capacity=4000)

    first = client.post("/api/internal/crowd", json=_payload(event_id, node_id, 3200))
    second = client.post("/api/internal/crowd", json=_payload(event_id, node_id, 3500))
    assert first.status_code == 201
    assert second.status_code == 201  # idempotent, last write wins

    rows = db.execute(
        select(CrowdState).where(CrowdState.node_id == node_id)
    ).scalars().all()
    assert len(rows) == 1  # EV-005 §7 — one current row per node
    assert rows[0].current_crowd == 3500

    fetched = client.get(f"/api/nodes/{node_id}/crowd").json()["data"]
    assert fetched["current_crowd"] == 3500


def test_ingest_validation_errors(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id)

    # Negative crowd → rejected.
    negative = client.post(
        "/api/internal/crowd", json=_payload(event_id, node_id, -1)
    )
    assert negative.status_code == 422
    assert negative.json()["error"]["code"] == "VALIDATION_ERROR"

    # Missing fields → rejected.
    missing = client.post("/api/internal/crowd", json={"event_id": event_id})
    assert missing.status_code == 422

    # Unexpected fields → rejected (no silent storage of junk).
    extra = client.post(
        "/api/internal/crowd",
        json=_payload(event_id, node_id, extra_field="nope"),
    )
    assert extra.status_code == 422

    # Quality outside [0, 1] → rejected.
    bad_quality = client.post(
        "/api/internal/crowd", json=_payload(event_id, node_id, quality=1.7)
    )
    assert bad_quality.status_code == 422

    # Nothing invalid was stored.
    assert client.get(f"/api/nodes/{node_id}/crowd").status_code == 404


def test_ingest_unknown_ids(client):
    event_id = create_event(client)
    node_id = create_node(client, event_id)

    # Unknown event → NOT_FOUND.
    unknown_event = client.post(
        "/api/internal/crowd", json=_payload(999999, node_id)
    )
    assert unknown_event.status_code == 404
    assert unknown_event.json()["error"]["code"] == "NOT_FOUND"

    # Unknown node → NOT_FOUND.
    unknown_node = client.post(
        "/api/internal/crowd", json=_payload(event_id, 999999)
    )
    assert unknown_node.status_code == 404
    assert unknown_node.json()["error"]["code"] == "NOT_FOUND"

    # Node exists but belongs to a different event → VALIDATION_ERROR.
    other_event = create_event(client, name="Other Event")
    foreign_node = create_node(client, other_event, name="Foreign Node")
    mismatch = client.post(
        "/api/internal/crowd", json=_payload(event_id, foreign_node)
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["error"]["code"] == "VALIDATION_ERROR"

    # Nothing was stored for any of the rejected payloads.
    assert client.get(f"/api/nodes/{node_id}/crowd").status_code == 404
