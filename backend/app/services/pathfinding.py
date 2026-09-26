"""Minimal route recomputation for the P4 live map (P4 Map §3).

P1 owns the real graph/simulation/pathfinding engine; this module exists
only because the current P1 integration boundary
(app/services/adapters/p1_engine.py) is a MOCK that performs no
pathfinding at all. It implements the smallest live-map requirement —
Dijkstra over the event's stored nodes/edges with live congestion as
dynamic edge weights — and is deliberately isolated here so it can be
replaced by the real P1 engine without touching route code (the
`recompute_routes` entry point is the seam).

Dynamic weight = edge.distance (or great-circle fallback when OSRM is
disabled — presentation-only, never an AI or simulation result) multiplied
by the target node's congestion multiplier:

    multiplier = max(1.0, visitors_now / capacity)   (capacity 0 → 1.0)

`recompute_routes` recomputes ONLY routes affected by a node change
(source node and the nodes with stored strategies referencing it) — the
existing architecture (strategy sets reference source/destination node
pairs) makes targeted recomputation natural, so the whole graph is never
blindly recalculated.
"""

from heapq import heappop, heappush
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.crowd import CrowdState
from app.models.graph import Edge, Node
from app.models.workflow import Strategy, StrategySet


def _crowd_by_node(db: Session, event_id: int) -> dict[int, int]:
    """Latest stored live count per node of the event (0 when absent)."""
    node_ids = db.execute(
        select(Node.node_id).where(Node.event_id == event_id)
    ).scalars().all()
    if not node_ids:
        return {}
    rows = db.execute(
        select(CrowdState).where(CrowdState.node_id.in_(node_ids))
    ).scalars().all()
    return {row.node_id: row.current_crowd for row in rows}


def _haversine_m(a: Node, b: Node) -> float:
    """Great-circle metres (fallback weight when edge.distance is null)."""
    if a.latitude is None or a.longitude is None or b.latitude is None or b.longitude is None:
        return 0.0
    radius = 6_371_000.0
    phi1, phi2 = radians(a.latitude), radians(b.latitude)
    dphi = radians(b.latitude - a.latitude)
    dlambda = radians(b.longitude - a.longitude)
    h = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * radius * asin(sqrt(h))


def _multiplier(visitors_now: int, capacity: int) -> float:
    if capacity <= 0:
        return 1.0
    return max(1.0, visitors_now / capacity)


def shortest_route(
    db: Session,
    event_id: int,
    source_node_id: int,
    target_node_id: int,
    crowd: dict[int, int] | None = None,
) -> tuple[list[int], float] | None:
    """Dijkstra from source to target over the event's stored graph.

    Returns (node_id path, total weight) or None when no route exists.
    Edges are treated as bidirectional (foot movement) using the stored
    rows only.
    """
    if crowd is None:
        crowd = _crowd_by_node(db, event_id)

    nodes = db.execute(
        select(Node).where(Node.event_id == event_id)
    ).scalars().all()
    node_by_id = {node.node_id: node for node in nodes}
    if source_node_id not in node_by_id or target_node_id not in node_by_id:
        return None

    adjacency: dict[int, list[tuple[int, float]]] = {node_id: [] for node_id in node_by_id}
    edges = db.execute(
        select(Edge).where(Edge.event_id == event_id)
    ).scalars().all()
    for edge in edges:
        base = (
            edge.distance
            if edge.distance is not None
            else _haversine_m(node_by_id[edge.from_node_id], node_by_id[edge.to_node_id])
        )
        # Congestion of the node being ENTERED scales the traversal cost.
        w_f = base * _multiplier(crowd.get(edge.to_node_id, 0), _capacity(node_by_id, edge.to_node_id))
        w_b = base * _multiplier(crowd.get(edge.from_node_id, 0), _capacity(node_by_id, edge.from_node_id))
        adjacency[edge.from_node_id].append((edge.to_node_id, w_f))
        adjacency[edge.to_node_id].append((edge.from_node_id, w_b))

    # Standard Dijkstra with a heap; deterministic tie-break on node id.
    dist = {source_node_id: 0.0}
    prev: dict[int, int] = {}
    heap = [(0.0, source_node_id)]
    visited: set[int] = set()
    while heap:
        d, u = heappop(heap)
        if u in visited:
            continue
        visited.add(u)
        if u == target_node_id:
            break
        for v, w in adjacency.get(u, []):
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heappush(heap, (nd, v))

    if target_node_id not in visited:
        return None

    path = [target_node_id]
    while path[-1] != source_node_id:
        path.append(prev[path[-1]])
    path.reverse()
    return path, dist[target_node_id]


def _capacity(node_by_id: dict[int, Node], node_id: int) -> int:
    node = node_by_id.get(node_id)
    return node.capacity if node else 0


def affected_node_ids(db: Session, event_id: int, changed_node_id: int) -> set[int]:
    """Nodes with stored strategies touching the changed node (their route
    recomputation is triggered); includes the changed node itself."""
    ids = {changed_node_id}
    rows = db.execute(
        select(Strategy.source_node_id, Strategy.destination_node_id)
        .join(StrategySet, Strategy.strategy_set_id == StrategySet.strategy_set_id)
        .where(StrategySet.event_id == event_id)
    ).all()
    for source, destination in rows:
        if source == changed_node_id or destination == changed_node_id:
            ids.update({source, destination})
    return ids


def recompute_routes(db: Session, event_id: int, changed_node_id: int) -> list[list[int]]:
    """Recompute only the routes affected by a change to `changed_node_id`.

    Targeted recomputation (P4 Map §3): each affected node gets a route to
    the node with the most free capacity (the natural evac/redirect target);
    when no route exists for a target, that route is skipped.
    """
    nodes = db.execute(
        select(Node).where(Node.event_id == event_id)
    ).scalars().all()
    if not nodes:
        return []

    crowd = _crowd_by_node(db, event_id)
    capacities = {node.node_id: node.capacity for node in nodes}
    best_target = max(capacities, key=lambda nid: capacities[nid], default=None)
    if best_target is None:
        return []

    routes: list[list[int]] = []
    for node_id in sorted(affected_node_ids(db, event_id, changed_node_id)):
        if node_id == best_target:
            continue
        result = shortest_route(db, event_id, node_id, best_target, crowd=crowd)
        if result is not None:
            routes.append(result[0])
    return routes
