"""External service adapters (P1 / P2 / P5).

Each adapter is an explicit boundary so the real services can replace the
mocks later without touching P3 workflow or route code.
"""

from app.services.adapters.p1_engine import get_p1_engine
from app.services.adapters.p2_intel import get_p2_intel
from app.services.adapters.p5_ops import get_p5_ops

__all__ = ["get_p1_engine", "get_p2_intel", "get_p5_ops"]
