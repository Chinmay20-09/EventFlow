"""Prediction endpoints (EV-016 §8, EV-037 §8).

P1 produces prediction results and submits them through the internal API;
P3 validates, stores and serves them. P3 never calculates predictions
(EV-003 §10, EV-016 §20).
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.api.routes.nodes import get_node_or_404
from app.core.errors import AppError, ok
from app.core.security import verify_p1_api_key
from app.db.session import commit_or_fail
from app.models.prediction import Prediction
from app.schemas.prediction import PredictionIn, PredictionOut
from app.services.event_settings import get_effective_settings
from app.services.read_models import build_forecast

router = APIRouter(prefix="/api", tags=["predictions"])


def ingest_prediction(payload: PredictionIn, db: DbSession) -> dict:
    """Store the latest prediction for a node (P1 → P3 ingestion, EV-016 §8).

    The stored values are exactly the values P1 supplied — nothing is
    recalculated (P3 does not calculate, EV-016 §20). Re-submitting for the
    same node replaces the previous prediction so only the latest is kept
    (EV-005 §9).
    """
    node = get_node_or_404(db, payload.node_id)

    existing = db.execute(
        select(Prediction).where(Prediction.node_id == node.node_id)
    ).scalar_one_or_none()

    # Stored verbatim: forecast points as supplied (or null when omitted).
    points = (
        [point.model_dump() for point in payload.forecast_points]
        if payload.forecast_points is not None
        else None
    )

    if existing is None:
        prediction = Prediction(
            node_id=payload.node_id,
            predicted_crowd=payload.predicted_value,
            prediction_horizon=payload.prediction_horizon,
            predicted_status=None,  # not supplied by the documented payload (EV-037 §8)
            confidence=payload.confidence,
            forecast_points=points,
        )
        db.add(prediction)
    else:
        prediction = existing
        prediction.predicted_crowd = payload.predicted_value
        prediction.prediction_horizon = payload.prediction_horizon
        prediction.confidence = payload.confidence
        prediction.forecast_points = points

    commit_or_fail(db)
    return ok(PredictionOut.model_validate(prediction))


# P1 service boundary — registered with the shared P3_API_KEY dependency the
# endpoint has always documented. (It was reachable unauthenticated only while
# P3_API_KEY was empty, which disables verify_p1_api_key.) Registered after the
# function definition; kept include_in_schema=False so the generated OpenAPI
# contract is unchanged.
router.add_api_route(
    "/internal/predictions",
    ingest_prediction,
    methods=["POST"],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_p1_api_key)],
    include_in_schema=False,
)


@router.get("/nodes/{node_id}/prediction")
def get_node_prediction(node_id: int, db: DbSession) -> dict:
    """Latest stored prediction for one node (EV-016 §8)."""
    get_node_or_404(db, node_id)
    prediction = db.execute(
        select(Prediction).where(Prediction.node_id == node_id)
    ).scalar_one_or_none()
    if prediction is None:
        raise AppError("NOT_FOUND", "Prediction not found", 404)
    return ok(PredictionOut.model_validate(prediction))


@router.get("/events/{event_id}/predictions/forecast")
def get_forecast(event_id: int, db: DbSession) -> dict:
    """Forecast data for the P4 Predictions screen (cards + 60-min chart).

    Composed from stored P1 predictions only. Empty when P1 has not
    ingested anything — P3 never fabricates forecast values or chart points.
    """
    from app.api.routes.events import get_event_or_404

    get_event_or_404(db, event_id)
    return ok(build_forecast(db, event_id))
