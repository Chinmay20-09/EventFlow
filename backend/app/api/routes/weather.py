"""Weather what-if endpoints (P4 Digital Twin; task §17–§18).

P4 submits the operator's scenario (rainfall/duration/temperature/wind);
P3 runs it through the REAL P1 engine and stores P1's verbatim result.
Reads stay public (EV-016 convention); the write is an event-scoped
Organizer/Coordinator action. Baseline comparison (§18) is P4's job: the
baseline is the stored dry scenario (or any previous scenario's P1 result),
so both sides of the comparison come from P1.
"""

from fastapi import APIRouter, status

from app.api.deps import CurrentOperator, DbSession
from app.api.routes.events import get_event_or_404
from app.core.errors import ok
from app.schemas.weather import WeatherScenarioCreate, WeatherScenarioOut
from app.services import weather_scenarios

router = APIRouter(prefix="/api", tags=["weather"])


def _out(row) -> dict:
    return WeatherScenarioOut.model_validate(row).model_dump()


@router.post(
    "/events/{event_id}/weather-scenarios",
    status_code=status.HTTP_201_CREATED,
)
def create_weather_scenario(
    event_id: int,
    payload: WeatherScenarioCreate,
    db: DbSession,
    operator: CurrentOperator,
) -> dict:
    """Run the operator's what-if scenario through the real P1 engine (§18)."""
    get_event_or_404(db, event_id)  # existence check (write auth via CurrentOperator)
    try:
        row = weather_scenarios.run_weather_scenario(
            db,
            event_id,
            {
                "rainfall_mm": payload.rainfall_mm,
                "duration_seconds": payload.duration_seconds,
                "temperature_c": payload.temperature_c,
                "wind_kmh": payload.wind_kmh,
                "label": payload.label,
            },
        )
    except Exception:
        # The engine failure is already stored/audited by the service when
        # possible; a runner-unavailable failure surfaces as 502 upstream.
        raise
    return ok(_out(row))


@router.get("/events/{event_id}/weather-scenarios")
def list_scenarios(event_id: int, db: DbSession) -> dict:
    """Stored weather scenarios for the event (newest first) — P4 history."""
    get_event_or_404(db, event_id)
    return ok([_out(row) for row in weather_scenarios.list_weather_scenarios(db, event_id)])


@router.get("/events/{event_id}/weather-scenarios/{weather_scenario_id}")
def get_scenario(event_id: int, weather_scenario_id: int, db: DbSession) -> dict:
    """One stored scenario incl. P1's verbatim result (baseline vs what-if)."""
    get_event_or_404(db, event_id)
    row = weather_scenarios.get_weather_scenario_or_404(db, event_id, weather_scenario_id)
    return ok(_out(row))
