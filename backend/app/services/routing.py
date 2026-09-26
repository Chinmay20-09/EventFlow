"""OSRM foot-routing adapter — the single P3↔OSRM boundary (P4 Map edges).

Configuration (EV-029: env-only, never hardcoded, never logged):
    OSRM_BASE_URL   e.g. http://router.project-osrm.org or a self-hosted
                    instance. EMPTY disables the integration.
    OSRM_PROFILE    default "foot" (the P4 spec requests /route/v1/foot).
    OSRM_TIMEOUT_SECONDS  short timeout — routing must never stall a write.

Behaviour:
    * distance_m() returns None when the service is unconfigured OR fails —
      the edge write still succeeds (documented graceful degradation) and
      `edges.distance` simply stays null. P3 never computes distance itself
      (the frontend must not either); when OSRM is configured and reachable,
      the OSRM route distance in metres is stored on the edge row.
    * The adapter never raises into the request path and never logs or
      returns the base URL credentials.

Tests use a deterministic stub injected through `set_routing_adapter()`;
they never touch the network.
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("eventflow.p3")


class RoutingAdapter:
    """Interface for the external routing service."""

    def distance_m(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float | None:
        """Walking distance in metres between two coordinates, or None."""
        raise NotImplementedError


class OSRMRoutingAdapter(RoutingAdapter):
    """OSRM /route/v1/{profile} client (foot profile by default)."""

    def distance_m(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float | None:
        if not settings.osrm_base_url:
            return None  # Integration disabled — edge.distance stays null.
        base = settings.osrm_base_url.rstrip("/")
        url = f"{base}/route/v1/{settings.osrm_profile}/{lng1},{lat1};{lng2},{lat2}"
        try:
            response = httpx.get(
                url,
                params={"overview": "false", "alternatives": "false", "steps": "false"},
                timeout=settings.osrm_timeout_seconds,
            )
            response.raise_for_status()
            routes = response.json().get("routes") or []
            if routes:
                distance = routes[0].get("distance")
                if isinstance(distance, (int, float)) and distance >= 0:
                    return float(distance)
                return None
            return None
        except (httpx.HTTPError, ValueError) as exc:
            # Routing failure must never break edge persistence (P4 §2).
            logger.warning("OSRM routing unavailable (edge.distance stays null): %s", exc)
            return None


class StubRoutingAdapter(RoutingAdapter):
    """Deterministic test double — haversine distance, no network."""

    def distance_m(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float | None:
        from math import asin, cos, radians, sin, sqrt

        if None in (lat1, lng1, lat2, lng2):
            return None
        radius = 6_371_000.0
        phi1, phi2 = radians(lat1), radians(lat2)
        dphi = radians(lat2 - lat1)
        dlambda = radians(lng2 - lng1)
        a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
        return round(2 * radius * asin(sqrt(a)), 1)


_adapter: RoutingAdapter = OSRMRoutingAdapter()


def get_routing_adapter() -> RoutingAdapter:
    """Return the active routing adapter (OSRM client by default)."""
    return _adapter


def set_routing_adapter(adapter: RoutingAdapter) -> None:
    """Inject a different adapter (used by tests; not thread-crossing)."""
    global _adapter
    _adapter = adapter
