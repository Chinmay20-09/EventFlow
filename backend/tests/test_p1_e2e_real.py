"""REAL end-to-end P1 ↔ P3 integration tests (task: "ONE real end-to-end
integration test" + "a real crowd-state test").

No mocks anywhere in the chain. Each module boots the actual FastAPI
application on an ephemeral local port (uvicorn, isolated temp SQLite
database), then drives P1's REAL deterministic engine and P1's REAL
transport exactly as production would:

    engine/src (runSandbox / capacityMetric)          ← the real engine
        ↓
    engine/src/serialization.ts                       ← the real serializer
        ↓
    integration/transport/p3Client.ts (P3Client)      ← the real transport
        ↓  HTTP POST (fetch)
    uvicorn FastAPI  POST /api/internal/...           ← the real API
        ↓
    simulation_results / crowd_state (SQLite file)    ← the real DB
        ↓
    read back through the API + the DB file and verified

The P1-side half runs under Node via tsx (the repo's TS runtime, driver:
integration/runner/e2eDriver.mts); the Python half orchestrates it and
asserts. A missing Node runtime skips the tests with a clear reason
instead of failing (CI without Node).
"""

import json
import os
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
VENV_PYTHON = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
TSX_CLI = PROJECT_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
DRIVER = PROJECT_ROOT / "integration" / "runner" / "e2eDriver.mts"

API_KEY = "e2e-shared-p1-p3-key"


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _wait_until_ready(port: int, deadline_s: float = 60.0) -> None:
    """Poll /api/health until uvicorn answers (or raise)."""
    deadline = time.monotonic() + deadline_s
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/api/health", timeout=2
            ) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, OSError) as exc:
            last_error = exc
        time.sleep(0.3)
    raise RuntimeError(f"uvicorn did not become ready on port {port}: {last_error}")


@pytest.fixture(scope="module")
def p3_server():
    """One uvicorn process for the whole module (isolated temp SQLite DB)."""
    if not (VENV_PYTHON.exists() and TSX_CLI.exists() and DRIVER.exists()):
        pytest.skip("backend venv or Node/tsx driver not available on this machine")

    db_path = Path(tempfile.mkdtemp(prefix="eventflow-e2e-")) / "e2e.db"
    env = {
        **{k: v for k, v in os.environ.items()
           if k in ("SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "APPDATA",
                    "LOCALAPPDATA", "PROGRAMFILES", "WINDIR", "HOMEDRIVE",
                    "HOMEPATH", "USERPROFILE", "PATH")},
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "ENVIRONMENT": "test",
        "SECRET_KEY": "e2e-secret-key-for-eventflow-tests-only-32chars!",
        "P3_API_KEY": API_KEY,
        "P1_ENGINE_MODE": "real",
        "MAX_SIMULATION_ATTEMPTS": "2",
    }
    port = _free_port()
    process = subprocess.Popen(
        [
            str(VENV_PYTHON), "-m", "uvicorn", "app.main:app",
            "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning",
        ],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    try:
        _wait_until_ready(port)
        yield {"port": port, "db_path": db_path}
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=15)


class P3Http:
    """Tiny HTTP client carrying the shared P1↔P3 bearer key (ingestion)
    or a user bearer token (normal endpoints)."""

    def __init__(self, port: int) -> None:
        self.base = f"http://127.0.0.1:{port}"

    def post(self, path: str, payload: dict, token: str | None = None) -> dict:
        headers = {"Content-Type": "application/json"}
        headers["Authorization"] = f"Bearer {token or API_KEY}"
        request = urllib.request.Request(
            f"{self.base}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))

    def get(self, path: str, token: str | None = None) -> dict:
        headers = {"Authorization": f"Bearer {token or API_KEY}"}
        request = urllib.request.Request(f"{self.base}{path}", headers=headers)
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))


def _register_coordinator(p3: P3Http) -> str:
    """Create a coordinator account and return its bearer token.

    Self-registration creates only VISITOR/COORDINATOR accounts (by design),
    and event creation requires Organizer/Coordinator. A Coordinator is
    authorized for every event, so the E2E uses a COORDINATOR account; the
    Organizer ownership model itself stays covered by the authorization
    tests (test_events_auth.py etc.) which this E2E must not weaken.
    """
    suffix = f"{time.time_ns() % 10_000_000}"
    p3.post(
        "/api/auth/register",
        {
            "username": f"e2e_coord_{suffix}",
            "email": f"e2e_coord_{suffix}@example.com",
            "password": "e2e-password-123",
            "role": "COORDINATOR",
        },
    )
    login = p3.post(
        "/api/auth/login",
        {"login": f"e2e_coord_{suffix}", "password": "e2e-password-123"},
    )
    return login["data"]["access_token"]


def _seed_event_via_api(p3: P3Http, token: str) -> dict:
    """Create event + graph + strategy set through the normal user endpoints.

    `external_id` maps P1's string ids (ENTRY/HALL/EXIT) onto the P3 nodes —
    the event_id → nodes → nodes.external_id → P1 node.id identity bridge.
    GATE is both a valid P1 entry and exit type (engine/src/graph.ts).
    """
    event_id = p3.post("/api/events", {
        "name": "E2E Real Integration Event",
        "start_time": "2026-10-10T10:00:00Z",
        "end_time": "2026-10-10T22:00:00Z",
    }, token=token)["data"]["event_id"]

    node_ids: dict[str, int] = {}
    for p1_id, name, node_type, capacity in [
        ("ENTRY", "Main Entrance", "GATE", 5000),
        ("HALL", "Concert Hall", "VENUE", 300),
        ("EXIT", "South Exit", "GATE", 5000),
    ]:
        node_ids[p1_id] = p3.post(f"/api/events/{event_id}/nodes", {
            "name": name, "type": node_type, "capacity": capacity,
            "external_id": p1_id, "status": "OPEN",
        }, token=token)["data"]["node_id"]

    # Movement connections (distance/travel_time stay null here — OSRM is
    # disabled in tests; the E2E graph input declares real traversal values).
    p3.post(f"/api/events/{event_id}/edges",
            {"from": node_ids["ENTRY"], "to": node_ids["HALL"]}, token=token)
    p3.post(f"/api/events/{event_id}/edges",
            {"from": node_ids["HALL"], "to": node_ids["EXIT"]}, token=token)

    strategy_set_id = p3.post(f"/api/events/{event_id}/strategy-sets", {
        "strategies": [{
            "source_node_id": node_ids["HALL"],
            "destination_node_id": node_ids["EXIT"],
            "action": "REDIRECT_FLOW",
        }],
        "name": "E2E redirect",
    }, token=token)["data"]["strategy_set_id"]

    return {"event_id": event_id, "node_ids": node_ids,
            "strategy_set_id": strategy_set_id}


def _run_node_driver(mode: str, payload: dict) -> dict:
    """Run the Node driver (real engine + real transport); parse its stdout."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node runtime not available on this machine")
    completed = subprocess.run(
        [node, str(TSX_CLI), str(DRIVER), mode],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=str(PROJECT_ROOT),
        timeout=300,
        check=False,
    )
    if completed.returncode != 0:
        raise AssertionError(
            f"Node driver {mode!r} failed (rc={completed.returncode}): "
            f"{(completed.stderr or completed.stdout)[-800:]}"
        )
    return json.loads(completed.stdout)


def test_real_p1_simulation_e2e(p3_server):
    """P1 engine → serializer → transport → POST /api/internal/simulations →
    DB → read back: verify id, scenario_id, strategy_id, metrics,
    final_state, timeline and warnings."""
    p3 = P3Http(p3_server["port"])
    token = _register_coordinator(p3)
    seeded = _seed_event_via_api(p3, token)

    outcome = _run_node_driver("simulation", {
        "baseUrl": p3.base,
        "apiKey": API_KEY,
        "eventId": seeded["event_id"],
        "strategySetId": seeded["strategy_set_id"],
        "nodeIds": seeded["node_ids"],
    })
    assert outcome["push"]["status"] == "sent", outcome

    envelope = outcome["envelope"]
    result = envelope["result"]

    # Envelope carries the P3-side link; P1 identity fields are intact.
    assert envelope["strategy_set_id"] == seeded["strategy_set_id"]
    assert result["id"] == f"SIMULATION_RESULT_STRATEGY_SET_{seeded['strategy_set_id']}"
    assert result["status"] == "COMPLETED"
    assert result["scenario_id"] == f"STRATEGY_SET_{seeded['strategy_set_id']}"
    assert result["strategy_id"] is None  # no P1 strategy id — never invented

    # Read back through the API.
    stored = p3.get(f"/api/strategy-sets/{seeded['strategy_set_id']}/simulation",
                    token=token)["data"]
    assert stored["status"] == "COMPLETED"  # P1's SimulationStatus verbatim
    assert stored["p1_result"] == result    # the exact P1 payload, byte for byte
    assert stored["p1_result"]["id"] == result["id"]
    assert stored["p1_result"]["scenario_id"] == result["scenario_id"]
    assert stored["p1_result"]["strategy_id"] == result["strategy_id"]
    # The engine's real numbers — arrived accounting matches P1 exactly.
    assert (stored["p1_result"]["metrics"]["arrived_population"]
            == result["metrics"]["arrived_population"])
    assert "population" in stored["p1_result"]["final_state"]
    assert isinstance(stored["p1_result"]["timeline"], list) and stored["p1_result"]["timeline"]
    assert isinstance(stored["p1_result"]["warnings"], list)
    # Workflow advanced through the real ingestion path — no auto-approval.
    ss = p3.get(f"/api/strategy-sets/{seeded['strategy_set_id']}", token=token)["data"]
    assert ss["status"] == "SIMULATED"
    assert ss["approval_status"] is None

    # The row really is in the database file (not just an API facade).
    conn = sqlite3.connect(p3_server["db_path"])
    try:
        row = conn.execute(
            "SELECT p1_result FROM simulation_results WHERE strategy_set_id = ? "
            "ORDER BY simulation_result_id DESC LIMIT 1",
            (seeded["strategy_set_id"],),
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    assert json.loads(row[0])["id"] == result["id"]


def test_real_crowd_state_e2e(p3_server):
    """P1 capacityMetric → serializeMetric → transport → POST
    /api/internal/crowd-state → DB → read back: values match P1 exactly."""
    p3 = P3Http(p3_server["port"])
    token = _register_coordinator(p3)
    seeded = _seed_event_via_api(p3, token)

    outcome = _run_node_driver("crowd", {
        "baseUrl": p3.base,
        "apiKey": API_KEY,
        "eventId": seeded["event_id"],
        "occupancy": {"ENTRY": 120, "HALL": 290, "EXIT": 40},
    })
    assert outcome["push"]["status"] == "sent", outcome

    snapshot = outcome["envelope"]
    assert snapshot["event_id"] == seeded["event_id"]
    metric_hall = next(m for m in snapshot["metrics"] if m["id"] == "HALL")
    assert metric_hall["current_occupancy"] == 290

    # Read back per node and compare field for field against the P1 payload.
    for p1_id, node_pk in seeded["node_ids"].items():
        stored = p3.get(f"/api/nodes/{node_pk}/crowd", token=token)["data"]
        expected = next(m for m in snapshot["metrics"] if m["id"] == p1_id)
        assert stored["p1_metric"] == expected  # the full 17-field P1 metric
        assert stored["current_crowd"] == expected["current_occupancy"]
        assert stored["updated_at"] is not None

    # Directly verify a value deep inside the stored metric (P1's own
    # calculation — HALL 290/300 ≈ 0.967 → HIGH density, P1-computed).
    hall = p3.get(f"/api/nodes/{seeded['node_ids']['HALL']}/crowd", token=token)["data"]
    assert hall["p1_metric"]["density_state"] == "HIGH"
    assert hall["p1_metric"]["operational_capacity"] == 300
    assert hall["p1_metric"]["current_occupancy"] == 290

    # Rows really in the DB file.
    conn = sqlite3.connect(p3_server["db_path"])
    try:
        row = conn.execute(
            "SELECT p1_metric FROM crowd_state WHERE node_id = ?",
            (seeded["node_ids"]["HALL"],),
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    assert json.loads(row[0])["id"] == "HALL"
