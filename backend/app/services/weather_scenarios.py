"""Weather what-if orchestration (P4 Digital Twin; task §17–§18).

Owns the weather-scenario workflow: validate → run the REAL P1 engine
(never P3 calculations) → persist the scenario + P1's verbatim result →
serve it back. Live operational state is never modified (EV-016 §13):
these rows are simulation-only data, exactly like simulation_results.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.utils import utcnow
from app.db.session import commit_or_fail
from app.models.weather import WeatherScenario
from app.services.adapters import get_p1_engine

logger = logging.getLogger("eventflow.p3")

# Threshold presentation labels for the operator-entered rainfall. A pure
# input mapping (mm/h → label) documented beside P1's weather adapter
# thresholds (10/40/80 mm/h) — never derived from any crowd value.
_SEVERITY_LABELS = ((80.0, "Extreme rainfall"), (40.0, "Heavy rain"), (10.0, "Elevated rain"))


def severity_label_for(rainfall_mm: float) -> str:
    """Presentation label for the scenario input (dry → 'No rain')."""
    if rainfall_mm <= 0:
        return "No rain"
    for threshold, label in _SEVERITY_LABELS:
        if rainfall_mm >= threshold:
            return label
    return "Light rain"


def run_weather_scenario(db: Session, event_id: int, scenario: dict) -> WeatherScenario:
    """Run one what-if weather scenario through the real P1 engine and store it.

    The scenario id (and therefore P1's deterministic result id
    `SIMULATION_RESULT_<scenario_id>`) is derived from the new row's primary
    key: the row is inserted first, then P1 runs, then the outcome is written.
    A failed P1 run is stored with status SIMULATION_FAILURE and surfaced as
    502 — real failures are never converted into fake successes (task §12).
    """
    from app.services.adapters.p1_engine import RealP1EngineAdapter

    engine = get_p1_engine()
    if not isinstance(engine, RealP1EngineAdapter):
        # The mock adapter cannot answer a what-if question — refuse clearly
        # instead of returning the marked placeholder as if it were P1 output.
        raise AppError(
            "INTERNAL_ERROR",
            "Weather scenarios require the real P1 engine (P1_ENGINE_MODE=real)",
            500,
        )

    row = WeatherScenario(
        event_id=event_id,
        rainfall_mm=scenario["rainfall_mm"],
        duration_seconds=scenario["duration_seconds"],
        temperature_c=scenario["temperature_c"],
        wind_kmh=scenario["wind_kmh"],
        label=scenario["label"],
        status="PENDING",
    )
    db.add(row)
    db.flush()  # assign weather_scenario_id for the deterministic scenario id

    scenario_id = f"WEATHER_EVENT_{row.weather_scenario_id}"
    try:
        outcome = engine.run_weather_simulation(
            event_id,
            {
                "scenario_id": scenario_id,
                "rainfall_mm": scenario["rainfall_mm"],
                "duration_seconds": scenario["duration_seconds"],
            },
        )
    except RuntimeError as exc:
        # Runner unavailable / not executable: no P1 result exists. Store the
        # row as failed (auditable) and tell P4 the upstream failed.
        db.rollback()
        logger.warning("Weather scenario %s failed before P1 ran: %s", scenario_id, exc)
        raise AppError("INTERNAL_ERROR", "P1 engine unavailable for weather scenario", 502) from exc

    row.status = outcome.status
    row.p1_result_id = outcome.p1_result_id
    row.p1_result = outcome.predicted_metrics
    row.severity_label = severity_label_for(scenario["rainfall_mm"])
    row.created_at = utcnow()
    commit_or_fail(db)
    logger.info(
        "Weather scenario %s stored for event %s (status %s)",
        scenario_id,
        event_id,
        outcome.status,
    )
    return row


def get_weather_scenario_or_404(db: Session, event_id: int, weather_scenario_id: int) -> WeatherScenario:
    """Fetch one scenario of THIS event or raise the documented 404."""
    row = db.execute(
        select(WeatherScenario).where(
            WeatherScenario.weather_scenario_id == weather_scenario_id,
            WeatherScenario.event_id == event_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise AppError("NOT_FOUND", "Weather scenario not found", 404)
    return row


def list_weather_scenarios(db: Session, event_id: int) -> list[WeatherScenario]:
    """All weather scenarios of one event, newest first."""
    return list(
        db.execute(
            select(WeatherScenario)
            .where(WeatherScenario.event_id == event_id)
            .order_by(WeatherScenario.weather_scenario_id.desc())
        ).scalars().all()
    )

