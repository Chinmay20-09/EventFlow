"""P3 → P1 SandboxInput construction (P1 integration requirement C).

P1 is stateless and knows nothing about P3: when a simulation is requested
through `POST /api/strategy-sets/{id}/simulate`, the SandboxInput must be
constructed HERE from P3's stored event graph / crowd / disruption data and
handed to the P1 engine (see `services/adapters/p1_engine.py`). P3 never
performs any of P1's calculations itself — this module only translates
stored rows into P1's documented input shape (`engine/src/types.ts`).

Identity boundary (task §E):
    P3 event_id → P3 nodes → nodes.external_id → P1 node.id
    P3 strategy_set_id → P1 transport envelope (NEVER derived from P1 data)

Field mappings (all trivial translations of stored values, no calculations):

* `nodes.type` — P3 stores P4 map types (GATE/VENUE/JUNCTION). P1's graph
  validates entry nodes against type ENTRANCE/GATE and exit nodes against
  EXIT/GATE (`engine/src/graph.ts`), so the documented P4→P1 fallbacks
  VENUE→ZONE and JUNCTION→TRANSIT are applied; anything else is carried
  over verbatim.
* `node.id` — `nodes.external_id` verbatim when mapped, else the P3 integer
  node_id as a string (P1 accepts arbitrary string IDs; the numeric
  fallback round-trips through `_resolve_p1_node` on ingestion).
* `edges` — `distance` (metres) and `travel_time` (seconds) map to P1's
  `distance` / `baselineTime`; an edge missing either is skipped (P1
  rejects non-finite traversal values — omit rather than crash).
* `crowd` — one group per node that has a live `crowd_state` row with a
  non-zero occupancy, heading for the event's first exit. Nodes without a
  live count are omitted (P1 receives observed data only; P3 invents
  nothing).
* `disruptions` — ACTIVE disruption rows; P1 requires a parseable
  `startTime`, so a row without one is skipped, never fabricated.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.utils import utcnow
from app.models.crowd import CrowdState
from app.models.disruption import Disruption
from app.models.graph import Edge, Node

# P4 map node type → P1 venue node type (engine/src/types.ts NodeType).
# GATE is valid in both worlds; the other two P4 types have no P1 meaning.
_P4_TO_P1_NODE_TYPE = {"VENUE": "ZONE", "JUNCTION": "TRANSIT"}

# Entry/exit eligibility per P1's graph validation (engine/src/graph.ts):
# active entries must be ENTRANCE/GATE, active exits EXIT/GATE.
_ENTRY_TYPES = {"ENTRANCE", "GATE"}
_EXIT_TYPES = {"EXIT", "GATE"}


def _p1_node_type(node: Node) -> str:
    """Stored P4 type verbatim when P1 accepts it, else the documented mapping."""
    return _P4_TO_P1_NODE_TYPE.get(node.type, node.type)


def _iso(value) -> str | None:
    """Naive-UTC stored timestamp → ISO 8601 string (P1 parses ISO strings)."""
    if value is None:
        return None
    return value.isoformat(timespec="seconds") + "Z"


def _build_graph(db: Session, event_id: int) -> dict:
    """Translate nodes/edges into P1's `graph` input + entry/exit id lists."""
    nodes = db.execute(
        select(Node).where(Node.event_id == event_id).order_by(Node.node_id)
    ).scalars().all()
    if not nodes:
        raise AppError("VALIDATION_ERROR", f"Event {event_id} has no nodes to simulate", 422)

    p1_nodes: list[dict] = []
    node_id_by_p3: dict[int, str] = {}
    entries: list[str] = []
    exits: list[str] = []
    for node in nodes:
        p1_id = node.external_id if node.external_id else str(node.node_id)
        node_id_by_p3[node.node_id] = p1_id
        p1_nodes.append(
            {
                "id": p1_id,
                "label": node.name,
                "type": _p1_node_type(node),
                "capacity": node.capacity,
                "status": node.status if node.status in ("OPEN", "CLOSED") else "OPEN",
            }
        )
        # Entry/exit selection mirrors P1's type rules; a CLOSED node is never
        # offered as an active access point.
        if node.status != "CLOSED":
            p1_type = _p1_node_type(node)
            if p1_type in _ENTRY_TYPES:
                entries.append(p1_id)
            if p1_type in _EXIT_TYPES:
                exits.append(p1_id)

    if not exits:
        raise AppError(
            "VALIDATION_ERROR",
            f"Event {event_id} has no node usable as a P1 exit (EXIT/GATE type required)",
            422,
        )

    p1_edges: list[dict] = []
    edges = db.execute(
        select(Edge).where(Edge.event_id == event_id).order_by(Edge.edge_id)
    ).scalars().all()
    for edge in edges:
        from_id = node_id_by_p3.get(edge.from_node_id)
        to_id = node_id_by_p3.get(edge.to_node_id)
        if from_id is None or to_id is None:
            continue
        distance = edge.distance if edge.distance is not None else edge.travel_time
        baseline_time = edge.travel_time if edge.travel_time is not None else edge.distance
        # P1 rejects non-finite distance/baselineTime — omit unusable edges.
        if not distance or not baseline_time or distance <= 0 or baseline_time <= 0:
            continue
        p1_edges.append(
            {
                "id": f"E{edge.edge_id}",
                "from": from_id,
                "to": to_id,
                "distance": distance,
                "baselineTime": baseline_time,
                "capacity": None,  # Edge model stores no capacity column
                "status": edge.status if edge.status in ("OPEN", "CLOSED") else "OPEN",
            }
        )

    return {
        "graph": {
            "nodes": p1_nodes,
            "edges": p1_edges,
            "activeEntries": entries,
            "activeExits": exits,
        },
        "_exit_ids": exits,
        "_node_id_by_p3": node_id_by_p3,
    }


def _build_crowd(db: Session, event_id: int, node_id_by_p3: dict[int, str], exits: list[str]) -> list[dict]:
    """One crowd group per node with a non-zero live count (observed data only)."""
    states = db.execute(
        select(CrowdState)
        .join(Node, CrowdState.node_id == Node.node_id)
        .where(Node.event_id == event_id)
        .order_by(CrowdState.node_id)
    ).scalars().all()
    crowd: list[dict] = []
    for state in states:
        p1_id = node_id_by_p3.get(state.node_id)
        if p1_id is None or state.current_crowd <= 0:
            continue
        # A group already standing on the first exit heads to the next one.
        target = exits[0]
        if p1_id == target and len(exits) > 1:
            target = exits[1]
        crowd.append(
            {
                "id": f"CROWD_{len(crowd) + 1:03d}",
                "population": state.current_crowd,
                "currentLocation": {"kind": "NODE", "id": p1_id},
                "destination": target,
                "routeFlexibility": "FLEXIBLE",
            }
        )
    return crowd


def _build_disruptions(db: Session, event_id: int, node_id_by_p3: dict[int, str]) -> list[dict]:
    """ACTIVE disruption rows → P1 `Disruption` inputs (P1-enforced fields only)."""
    rows = db.execute(
        select(Disruption)
        .where(Disruption.event_id == event_id, Disruption.status == "ACTIVE")
        .order_by(Disruption.disruption_id)
    ).scalars().all()
    disruptions: list[dict] = []
    for row in rows:
        start = _iso(row.start_time)
        if start is None:
            continue  # P1 requires a parseable startTime — skip, never fabricate
        disruptions.append(
            {
                "id": f"D{row.disruption_id}",
                "type": row.type,
                "status": "ACTIVE",
                "severity": row.severity if row.severity in ("LOW", "MEDIUM", "HIGH", "CRITICAL") else "MEDIUM",
                "affectedNodes": [
                    node_id_by_p3[node_id]
                    for node_id in (row.affected_nodes or [])
                    if node_id in node_id_by_p3
                ],
                "affectedEdges": [f"E{edge_id}" for edge_id in (row.affected_edges or [])],
                "startTime": start,
                "expectedDuration": row.expected_duration,
            }
        )
    return disruptions


def build_sandbox_input(db: Session, event_id: int, scenario_id: str | None = None) -> dict:
    """Build a P1 `SandboxInput` dict from the event's stored data.

    With `scenario_id`, a scenario block is attached (id/name `STRATEGY_SET_<id>`,
    baseline CURRENT_GRAPH) so the engine returns a deterministic
    `SIMULATION_RESULT_<scenario_id>` result id — the P1 identity used for
    ingestion idempotency. The result is a plain JSON-serializable dict; how
    it reaches the TypeScript engine is the adapter's decision.
    """
    built = _build_graph(db, event_id)
    exits: list[str] = built["_exit_ids"]
    node_id_by_p3: dict[int, str] = built["_node_id_by_p3"]

    sandbox_input = {
        "graph": built["graph"],
        "crowd": _build_crowd(db, event_id, node_id_by_p3, exits),
        "disruptions": _build_disruptions(db, event_id, node_id_by_p3),
        "parameters": {"durationSeconds": 120, "timestepSeconds": 10},
    }
    if scenario_id:
        sandbox_input["scenario"] = {
            "id": scenario_id,
            "name": scenario_id,
            "baseline": "CURRENT_GRAPH",
            "startTime": _iso(utcnow()),
            "duration": sandbox_input["parameters"]["durationSeconds"],
            "stepSeconds": sandbox_input["parameters"]["timestepSeconds"],
        }
    return sandbox_input
