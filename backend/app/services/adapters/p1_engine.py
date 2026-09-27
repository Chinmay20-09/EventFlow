"""P1 engine adapter — boundary between P3 and P1's calculation engine.

P3 must NEVER calculate crowd propagation, prediction, optimization or
simulation results (EV-003 §10, EV-016 §20). This adapter is the single
seam where the real P1 engine executes (integration requirement C) and
where P1-produced results enter the backend through
`POST /api/internal/simulations`.

**Real adapter (requirement C — "replace ONLY the mock implementation").**
`RealP1EngineAdapter` builds the `SandboxInput` from P3's stored event data
(`services/p1_input.py`) and executes the REAL deterministic TypeScript
engine (`engine/src`) through the existing integration architecture: a
small runner (`integration/runner/p1Runner.ts`, sibling of
`scripts/pushToP3.ts`) is spawned as a child process with the input on
stdin and the serialized P1 result on stdout. FastAPI never imports any
TypeScript internal — the boundary is JSON over stdio.

`P1_ENGINE_MODE` selects the behavior:

* `"real"` (default) — the real engine runs; if the runner cannot be
  executed at all (Node/tsx missing, project root not found), the adapter
  degrades to the clearly-marked mock so P4 keeps working (documented
  graceful degradation, same convention as the OSRM/Groq integrations).
* `"mock"` — forces the marked mock (deterministic, Node-free).
"""

import json
import logging
import os
import shutil
import subprocess  # noqa: S404 — fixed argument vector, no shell
from dataclasses import dataclass, field
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("eventflow.p3")

# Project root = four levels above this file
# (backend/app/services/adapters/p1_engine.py -> repo root). Used only to
# locate the TypeScript runner; nothing is written outside the process.
_PROJECT_ROOT = Path(__file__).resolve().parents[4]

# Simulation wall-clock guard: the deterministic engine is fast, but a
# hung Node must never wedge the API request thread forever.
_RUNNER_TIMEOUT_SECONDS = 120

# Weather what-if runner (sibling of p1Runner.ts — same JSON-over-stdio
# architecture). It converts the operator-entered rainfall into the
# documented P1 WEATHER_EVENT disruption and runs the real engine.
_WEATHER_RUNNER = _PROJECT_ROOT / "integration" / "runner" / "p1WeatherRunner.ts"


@dataclass
class SimulationOutcome:
    """Structurally-valid simulation output as stored per EV-005 §13.

    For real P1 runs, `predicted_metrics` carries the serialized P1 result
    VERBATIM (snake_case, exactly as `serializeSimulationResult` emitted
    it) and `p1_result_id` is the engine's result id. `status` is P1's
    SimulationStatus verbatim — never remapped by P3.
    """

    status: str
    result_summary: str
    conflicts: list = field(default_factory=list)
    predicted_metrics: dict | None = None
    p1_result_id: str | None = None


class P1EngineAdapter:
    """Interface for the P1 simulation engine."""

    def run_simulation(self, strategy_set_id: int, strategies: list[dict]) -> SimulationOutcome:
        raise NotImplementedError

    def run_weather_simulation(self, event_id: int, scenario: dict) -> SimulationOutcome:
        """Run the P4 what-if weather scenario through P1 (task §17–§18).

        Only the real engine can answer a what-if question — P3 never
        calculates weather impact. Adapters that cannot run P1 must refuse
        clearly rather than fabricate an outcome.
        """
        raise NotImplementedError("Weather scenarios require the real P1 engine")


class MockP1EngineAdapter(P1EngineAdapter):
    """Marked placeholder outcome so P4 can be exercised without Node.

    It performs no calculation of its own — every value is a constant, and
    the "[MOCK P1]" marker makes a mock result unmistakable wherever it
    surfaces (P4, logs, stored rows).
    """

    def run_simulation(self, strategy_set_id: int, strategies: list[dict]) -> SimulationOutcome:
        logger.info("MOCK P1 simulation requested for strategy set %s", strategy_set_id)
        return SimulationOutcome(
            status="SUCCESS",
            result_summary=(
                "[MOCK P1] Placeholder simulation result. "
                "No real simulation was calculated — P3 does not simulate. "
                f"Strategy set {strategy_set_id} contains {len(strategies)} strategy/strategies."
            ),
            conflicts=[],
            predicted_metrics={
                "source": "[MOCK P1]",
                "crowd_level_pct": 68.0,
                "network_capacity_pct": 72.0,
                "risk_level": "Low",
            },
        )


def _node_executable() -> str | None:
    """Resolve the Node runtime; None when Node is not installed."""
    override = os.environ.get("P1_NODE_BIN")
    if override:
        return override if Path(override).exists() else None
    return shutil.which("node")


def _resolve_runner_argv(runner: Path | None = None) -> list[str] | None:
    """Build the fixed child-process command, or None when unavailable.

    Prefers the project-local tsx CLI (`node <tsx cli.mjs> <runner>`): the
    explicit node.exe prefix works on Windows where a `.cmd` shim cannot be
    exec'd directly, and tsx handles the TypeScript imports. No shell is
    involved — a fixed argument vector only. `runner` defaults to the
    strategy-set simulation runner (p1Runner.ts).
    """
    node = _node_executable()
    if node is None:
        return None
    cli = _PROJECT_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
    runner_path = runner if runner is not None else _PROJECT_ROOT / "integration" / "runner" / "p1Runner.ts"
    if not cli.exists() or not runner_path.exists():
        return None
    return [node, str(cli), str(runner_path)]


class RealP1EngineAdapter(P1EngineAdapter):
    """Runs the REAL deterministic P1 engine (engine/src) via the runner.

    The engine itself is untouched: P3 builds only its documented input.
    Any engine-reported failure (invalid input, engine error) surfaces as a
    real non-COMPLETED status — results are never fabricated here.
    """

    def run_simulation(self, strategy_set_id: int, strategies: list[dict]) -> SimulationOutcome:
        # Read-only session of our own: the adapter receives only the
        # strategy set id (the long-standing adapter interface, unchanged),
        # and the event's graph/crowd/disruption rows are read here. The
        # workflow service has already committed the SIMULATING state, so
        # the rows are visible to a fresh session.
        from app.db.session import get_sessionmaker
        from app.models.workflow import StrategySet
        from app.services.p1_input import build_sandbox_input

        db = get_sessionmaker()()
        try:
            strategy_set = db.get(StrategySet, strategy_set_id)
            if strategy_set is None:
                raise ValueError(f"Strategy set {strategy_set_id} not found")
            event_id = strategy_set.event_id
            # Attempt number makes the P1 scenario id (and therefore the
            # deterministic result id `SIMULATION_RESULT_<scenario_id>`)
            # distinct per attempt, while a replayed attempt stays
            # idempotent. attempt_count is the pre-increment value here.
            scenario_id = (
                f"STRATEGY_SET_{strategy_set_id}_ATTEMPT_{strategy_set.attempt_count + 1}"
            )
            sandbox_input = build_sandbox_input(db, event_id, scenario_id=scenario_id)
        finally:
            db.close()

        argv = _resolve_runner_argv()
        if argv is None:
            logger.warning(
                "P1 runner unavailable (Node/tsx missing); degrading to the marked mock "
                "for strategy set %s",
                strategy_set_id,
            )
            return MockP1EngineAdapter().run_simulation(strategy_set_id, strategies)

        try:
            completed = subprocess.run(
                argv,
                input=json.dumps(sandbox_input),
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=_RUNNER_TIMEOUT_SECONDS,
                cwd=str(_PROJECT_ROOT),
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            logger.warning("P1 runner could not be executed: %s", exc)
            return MockP1EngineAdapter().run_simulation(strategy_set_id, strategies)

        if completed.returncode != 0:
            # The engine ran and rejected the input, or failed: surface P1's
            # real diagnostics as a non-COMPLETED outcome (never a mock).
            detail = (completed.stderr or completed.stdout or "").strip()[-500:]
            logger.warning("P1 runner failed (rc=%s): %s", completed.returncode, detail)
            return SimulationOutcome(
                status="SIMULATION_FAILURE",
                result_summary=f"P1 simulation failed: {detail}"[:2000],
                conflicts=[],
                predicted_metrics={"error": detail},
            )

        try:
            serialized = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            logger.warning("P1 runner produced unparseable output: %s", exc)
            return SimulationOutcome(
                status="SIMULATION_FAILURE",
                result_summary="P1 runner produced an unparseable result",
                conflicts=[],
                predicted_metrics={"error": f"unparseable output: {exc}"},
            )

        # The serialized result is carried VERBATIM — no field is rewritten.
        return SimulationOutcome(
            status=serialized.get("status", "COMPLETED"),
            result_summary=f"P1 simulation {serialized.get('id', '?')} ({serialized.get('status')})",
            conflicts=[],
            predicted_metrics=serialized,
            p1_result_id=serialized.get("id"),
        )

    def run_weather_simulation(self, event_id: int, scenario: dict) -> SimulationOutcome:
        """Weather what-if through the real P1 engine (task §17–§18).

        Builds the SandboxInput from the event's stored graph/crowd/disruption
        rows (same builder the strategy-set simulation uses — the what-if
        answer describes THIS event), hands it plus the operator's rainfall
        to the weather runner, and returns P1's serialized result verbatim.
        No live-state row is touched (EV-016 §13).
        """
        from app.db.session import get_sessionmaker
        from app.services.p1_input import build_sandbox_input

        db = get_sessionmaker()()
        try:
            sandbox_input = build_sandbox_input(
                db,
                event_id,
                scenario_id=str(scenario["scenario_id"]),
            )
        finally:
            db.close()

        argv = _resolve_runner_argv(runner=_WEATHER_RUNNER)
        if argv is None:
            logger.warning(
                "P1 weather runner unavailable (Node/tsx missing); "
                "refusing to fabricate a weather scenario for event %s",
                event_id,
            )
            raise RuntimeError("P1 weather runner unavailable")

        try:
            completed = subprocess.run(
                argv,
                input=json.dumps(
                    {
                        "sandbox": sandbox_input,
                        "weather": {
                            "rainfallMm": scenario["rainfall_mm"],
                            "durationSeconds": scenario["duration_seconds"],
                        },
                    }
                ),
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=_RUNNER_TIMEOUT_SECONDS,
                cwd=str(_PROJECT_ROOT),
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            logger.warning("P1 weather runner could not be executed: %s", exc)
            raise RuntimeError("P1 weather runner could not be executed") from exc

        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip()[-500:]
            logger.warning("P1 weather runner failed (rc=%s): %s", completed.returncode, detail)
            return SimulationOutcome(
                status="SIMULATION_FAILURE",
                result_summary=f"P1 weather simulation failed: {detail}"[:2000],
                conflicts=[],
                predicted_metrics={"error": detail},
            )

        try:
            serialized = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            logger.warning("P1 weather runner produced unparseable output: %s", exc)
            return SimulationOutcome(
                status="SIMULATION_FAILURE",
                result_summary="P1 weather runner produced an unparseable result",
                conflicts=[],
                predicted_metrics={"error": f"unparseable output: {exc}"},
            )

        # The serialized result is carried VERBATIM — no field is rewritten.
        return SimulationOutcome(
            status=serialized.get("status", "COMPLETED"),
            result_summary=f"P1 weather simulation {serialized.get('id', '?')} ({serialized.get('status')})",
            conflicts=[],
            predicted_metrics=serialized,
            p1_result_id=serialized.get("id"),
        )


_adapter: P1EngineAdapter | None = None


def get_p1_engine() -> P1EngineAdapter:
    """Return the P1 adapter selected by P1_ENGINE_MODE (real by default)."""
    global _adapter
    if _adapter is None:
        if settings.p1_engine_mode == "real":
            _adapter = RealP1EngineAdapter()
        else:
            _adapter = MockP1EngineAdapter()
    return _adapter


def set_p1_engine(adapter: P1EngineAdapter | None) -> None:
    """Test seam: override or reset the process-wide adapter selection."""
    global _adapter
    _adapter = adapter
