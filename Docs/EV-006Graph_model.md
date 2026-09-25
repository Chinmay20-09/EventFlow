# EV-006 — Graph Model

**Document ID:** EV-006
**Domain:** Graph
**Status:** MVP Specification
**Depends On:** — (root of the EventFlow chain)
**Consumed By:** EV-007 Crowd Model, EV-008 Disruption Model, EV-009 Prediction, EV-010 Optimization, EV-011 Simulation

**Purpose:** Define graph nodes, edges, capacity, movement and state.

---

## 1. Purpose

The EventFlow Graph Model represents the physical structure through which people can move during an event.

It provides the structural foundation for:

* venue representation
* surrounding access representation
* entry and exit configuration
* movement connections
* capacity constraints
* operational availability
* simulation and optimization inputs

The Graph Model defines **what exists, where it exists, what movement connections are possible, and what the configured/authorized availability of each is**.

It does **not** model the live crowd, calculate crowd density/flow/queues, or determine why congestion occurs. Those responsibilities belong to EV-007.

---

## 2. Scope

The graph covers both:

1. **Internal venue infrastructure**

   * zones
   * gates
   * entrances
   * exits
   * checkpoints

2. **Surrounding environment**

   * roads
   * parking access
   * transit access
   * public-access areas relevant to event movement

The MVP uses a **single unified logical graph**.

The graph may be filtered or viewed in logical layers, but these are **not** separate synchronized graphs. See §4.3.

Conceptually:

```text
EventGraph
│
├── External Environment
│   ├── ROAD
│   └── TRANSIT
│
└── Venue
    ├── ZONE
    ├── GATE
    ├── ENTRANCE
    ├── EXIT
    └── CHECKPOINT
```

### 2.1 Out of Scope for EV-006

The following are explicitly outside this document:

* crowd occupancy, density, flow, queues and movement rate (EV-007)
* disruption identity, severity and lifecycle (EV-008)
* prediction and forecasting (EV-009)
* intervention generation, constraints and ranking (EV-010)
* scenario execution and time progression (EV-011)
* authorization policy and approval workflow (operational/runtime layer)

---

## 3. Architecture

The Graph is the first domain in the EventFlow chain and is the structural input to every domain that follows.

```text
EV-006 Graph          → What exists, and what is operationally available
EV-007 Crowd          → What is happening now
EV-008 Disruption     → What changed
EV-009 Prediction     → What is likely to happen next
EV-010 Optimization   → What could/should be changed
EV-011 Simulation     → What happens under a scenario
```

EV-006 is the **static and configuration layer** plus the **authoritative operational availability state**. It is deliberately separated from the dynamic crowd state.

### 3.1 Static Configuration vs Dynamic Crowd State

This separation is the central architectural rule of EV-006.

| Aspect | EV-006 (Graph) | EV-007 (Crowd) |
| --- | --- | --- |
| Node holding limit | `capacity` — configured, unit **people** | Current occupancy — dynamic, unit **people** |
| Node service rate | `throughput_capacity` — configured, unit **people/minute** | Actual service/queue behaviour — dynamic |
| Edge movement limit | `capacity` — configured, unit **people/minute** | Actual crowd flow — dynamic |
| Traversal time | `baseline_time` / `current_time` — configured extremes, unit **seconds** | Observed movement and speed — dynamic |
| Availability | `status` — authoritative configured/operational availability | Consumes status; does not write it |
| Density | Not modelled | Owned by EV-007 |
| Queues | Not modelled | Owned by EV-007 |
| Congestion | **Not modelled** — see §7.3 | Owned by EV-007 |
| Reason for a change | Not modelled (disruption belongs to EV-008) | — |
| Likely future | Not modelled (belongs to EV-009) | — |

**Configured capacity is not crowd behaviour.** EV-006 defines the *configured capacity of movement relationships and locations*. EV-007 calculates the *actual* crowd flow, occupancy and queueing that occurs within those configured limits.

### 3.2 Architectural Invariants

EV-006 guarantees:

1. One unified graph — never multiple synchronized graphs.
2. Every permitted movement relationship is represented by an edge.
3. Every edge is directed (§6.2).
4. Node and edge availability is authoritative configured/operational state.
5. Dynamic crowd-derived conditions are never stored as graph availability.
6. Exactly two graph states exist in MVP: Initial Graph and Current Graph (§11).
7. Graph state has one authoritative write path (§7.5).

---

## 4. Graph Structure

### 4.1 Core Graph Concept

```text
Graph = Nodes + Edges
```

**Nodes** represent meaningful spatial or operational locations. Nodes contain location, configuration and availability information.

**Edges** represent possible movement connections between nodes. An edge answers:

> "Can an agent move from node A to node B, along a connection with what configured traversal time and what configured movement flow capacity?"

Detailed spatial and operational configuration belongs primarily to nodes. Movement-specific configuration (distance, traversal time, flow capacity, direction) belongs to edges.

### 4.2 Graph Identity

The MVP graph object contains:

| Field | Description |
| --- | --- |
| `id` | Stable machine-readable graph identifier |
| `name` | Human-facing graph name |
| `nodes` | Array of node objects |
| `edges` | Array of edge objects |

```json
{
  "id": "EVENT_GRAPH_001",
  "name": "North Arena Event Graph",
  "nodes": [],
  "edges": []
}
```

`id` is a stable system identifier and should not change casually.

`name` is intended for humans and may change without breaking system references.

Future versions may associate a graph with an event or event identifier. Event association is **not required for MVP**.

### 4.3 Graph Layers

Layers are a **view concept, not a data concept**.

The MVP maintains one graph. Observers and user interfaces may filter that graph by layer, for example:

* venue
* roads
* transit
* access

Layers are derived by filtering on node `type` and edge membership. **No separate graph object is created per layer, and no layer is independently synchronized.**

| Layer | Derived from node types |
| --- | --- |
| Venue | `ZONE`, `GATE`, `ENTRANCE`, `EXIT`, `CHECKPOINT` |
| Access | `GATE`, `ENTRANCE`, `EXIT`, `CHECKPOINT` |
| Roads | `ROAD` |
| Transit | `TRANSIT` |

Filtering a layer never removes entities from the graph and never changes graph state.

---

## 5. Node Model

### 5.1 Node Schema

Each node contains:

| Field | Type | Required | Unit | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes | — | Stable machine-readable identifier |
| `label` | string | yes | — | Human-facing name |
| `type` | enum | yes | — | Node type (see §5.2) |
| `latitude` | number | yes | degrees (GPS) | GPS latitude |
| `longitude` | number | yes | degrees (GPS) | GPS longitude |
| `capacity` | integer \| null | yes | **people** | Maximum number of people the location can hold (holding capacity) |
| `throughput_capacity` | number \| null | no | **people/minute** | Maximum service rate at which people can pass through the location |
| `status` | enum | yes | — | Operational availability (see §7.1) |

`capacity` is a **holding capacity measured in people**. It is never a rate. See §9.

`throughput_capacity` is an optional **service rate measured in people per minute**. It is present where a location constrains movement over time (for example a `CHECKPOINT` or `GATE`). It is `null` where no meaningful service rate applies.

`status` defaults to `OPEN` when it is not explicitly configured.

### 5.2 Node Types

The MVP defines exactly seven core node types:

| Type | Definition |
| --- | --- |
| `ZONE` | An internal venue area where people gather or move (stand, concourse, plaza) |
| `GATE` | A controlled entry/exit point into the venue |
| `ENTRANCE` | A designated ingress point where event arrivals enter the environment |
| `EXIT` | A designated egress point where people leave the environment |
| `TRANSIT` | A public transport access or egress point (station, stop, platform access) |
| `CHECKPOINT` | A screening or verification point that constrains movement rate |
| `ROAD` | A road or parking-access link in the surrounding environment |

Additional specialized node types may be introduced in future versions if required. MVP does not introduce node types beyond these seven.

### 5.3 Example

```json
{
  "id": "GATE_01",
  "label": "North Gate",
  "type": "GATE",
  "latitude": 19.12345,
  "longitude": 72.12345,
  "capacity": 5000,
  "throughput_capacity": 600,
  "status": "OPEN"
}
```

### 5.4 ID vs Label

`id` is a stable system identifier and should not change casually.

`label` is intended for humans and may be changed without breaking system references.

This distinction prevents the graph from becoming dependent on human-facing names.

Canonical MVP identifier grammar:

```text
<TYPE>_<NUMBER>
```

Zero-padded, for example `GATE_01`, `ZONE_12`, `CHECKPOINT_02`, `EDGE_04`.

### 5.5 Geographic Coordinates

The MVP uses GPS coordinates only.

```text
latitude  ∈ [-90, 90]
longitude ∈ [-180, 180]
```

No additional coordinate systems are required for MVP. Floor, altitude and local x/y coordinates are not part of the MVP schema.

---

## 6. Edge Model

The Edge Model defines every permitted movement relationship in the graph. A movement relationship that is not represented by an edge is not traversable.

### 6.1 Edge Schema

Every edge contains:

| Field | Type | Required | Unit | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes | — | Stable machine-readable edge identifier |
| `label` | string | no | — | Observer-facing name (see §6.4) |
| `from` | string | yes | — | Node `id` at which traversal begins |
| `to` | string | yes | — | Node `id` at which traversal ends |
| `distance` | number | yes | **metres** | Physical length of the connection |
| `baseline_time` | number | yes | **seconds** | Normal / free-flow traversal time |
| `current_time` | number | yes | **seconds** | Current estimated traversal time |
| `capacity` | number | yes | **people/minute** | Maximum practical movement flow through the connection (flow capacity) |
| `status` | enum | yes | — | Operational availability (see §7.2) |

`status` defaults to `OPEN` when it is not explicitly configured.

`distance` is always a positive number of metres.

`baseline_time` and `current_time` are always positive numbers of seconds.

### 6.2 Edge Direction

**Direction is mandatory and explicit.**

Every edge is directed: movement is permitted only from `from` to `to`, never in the reverse direction on the same edge object.

The MVP has no undirected edge type. A two-way physical connection is represented as **two directed edges**, one in each direction.

```text
Two-way physical connection between GATE_01 and ZONE_01
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  EDGE_04                  EDGE_05
  GATE_01 → ZONE_01        ZONE_01 → GATE_01
```

The two directed edges are independent configuration objects. They may carry different `distance`, `baseline_time`, `current_time`, `capacity` and `status` values, because the two directions of a physical connection can differ operationally.

### 6.3 Edge Capacity

Edge `capacity` represents the **maximum practical movement flow** through that connection.

**Unit: people per minute.**

Edge capacity is a **flow capacity**, not a holding capacity. People do not occupy an edge as a holding location in EV-006, so EV-006 does not define a holding capacity for edges.

See §9 for the full capacity model.

### 6.4 Edge Labels

Edge `label` is observer-facing.

If `label` is absent:

* the system generates the label `{from_label} → {to_label}` using the endpoint node labels, for example `North Gate → Main Arena`
* a validation **warning** is emitted

The generated label is a derived display value. It is not persisted as configuration.

A missing edge label **must not block the graph** or any scenario.

### 6.5 Edge Duplication

Multiple edges are allowed between the same pair of nodes when they represent **distinct physical connections** — for example two separate stairways, two carriageways of a road, or a fast lane and a general lane.

Each parallel connection must be distinguished by a distinct, non-empty `label` identifying the physical path.

Duplicate representation of the **same** physical connection is invalid. Two edges that share the same `from`, the same `to` and the same `distance`, and are not distinguished by distinct labels, are treated as a duplicate representation of one physical connection and produce a **critical validation error** (§13).

### 6.6 Example

```json
{
  "id": "EDGE_04",
  "label": "North Gate → Main Arena",
  "from": "GATE_01",
  "to": "ZONE_01",
  "distance": 120.0,
  "baseline_time": 90,
  "current_time": 90,
  "capacity": 450,
  "status": "OPEN"
}
```

---

## 7. State Model

### 7.1 Node Status

Node `status` describes **operational availability** — whether the location may currently be used for movement.

The MVP defines exactly two core statuses:

```text
OPEN
CLOSED
```

`OPEN` — the node is available for movement.

`CLOSED` — the node is unavailable for movement. See §8.2.

Node status is authoritative for configured and operational accessibility.

### 7.2 Edge Status

Edge `status` describes **operational availability** — whether the connection may currently be traversed.

The MVP defines exactly two core statuses:

```text
OPEN
CLOSED
```

A `CLOSED` edge cannot be traversed.

### 7.3 Congestion Is Not a Graph State

Dynamic, crowd-derived conditions are **not** graph availability states.

In particular, congestion is modelled as follows:

* congestion is derived from live crowd behaviour
* congestion is owned by EV-007 (`density_state` and related crowd metrics)
* congestion is **never** written into node or edge `status`
* congestion is never consulted to determine whether traversal is permitted

Graph availability remains authoritative for configured and operational accessibility. It must not be overwritten by a condition that can change with crowd behaviour.

If an observer-facing congestion annotation is ever displayed alongside the graph, it must be rendered as a **derived, read-only view of EV-007 state**. It must never appear in a node or edge `status` field and must never affect traversal.

Type-specific status extensions (for example a future `RESTRICTED` availability state for `ZONE`) are reserved for future versions and are not part of the MVP status domain. The MVP status domain is exactly `OPEN` and `CLOSED`. See §17.

### 7.4 Closed Traversal Behaviour

A `CLOSED` node makes movement through that node unavailable regardless of the availability of its connected edges.

Availability is evaluated as follows:

* an edge may be traversed only if the edge status is `OPEN`
* an edge may be traversed only if both endpoint nodes have status `OPEN`
* therefore node closure **overrides** connected movement availability: if an endpoint node is `CLOSED`, every edge incident to that node is unusable for traversal even if the edge itself is `OPEN`

```text
GATE_01 (CLOSED)
      │
      ├── EDGE_04 (OPEN)   → unusable, endpoint is closed
      └── EDGE_09 (OPEN)   → unusable, endpoint is closed
```

Detailed authorization and access-control logic is outside the Graph Model and outside MVP.

### 7.5 Status Provenance and the Single Write Path

Graph state has **exactly one authoritative write path** in the operational system: the operational authorization layer.

Multiple domains may *cause* or *propose* a change, but none of them writes graph state directly:

| Domain | Relationship to graph state |
| --- | --- |
| EV-006 | Defines and represents node/edge status |
| EV-008 Disruption | **Describes** the disruption and the operational change it requires. Does not own or write graph state. |
| EV-010 Optimization | **Proposes** parameter changes. Does not write graph state and does not bypass authorization. |
| Operator / authorization layer | Applies approved changes through the single write path |
| EV-007 / EV-009 / EV-011 | Read graph state only; never write it |

A lightweight provenance value may be maintained by the write path for each node and edge status:

| `status_source` | Meaning |
| --- | --- |
| `CONFIGURED` | Set by pre-event configuration |
| `DISRUPTION` | Applied as the result of a disruption (EV-008) |
| `INTERVENTION` | Applied as the result of an approved intervention (EV-010) |
| `OPERATOR` | Set directly by an authorized operator |

`status_source` is maintained by the runtime write path. It is not authored as part of the static node or edge configuration, and it is not required for a graph to be valid.

Its purpose is to answer one operational question: **which changes may later be reverted automatically.** A status applied by a disruption may be reverted when that disruption resolves, but only while `status_source` is still `DISRUPTION`. If an operator or an approved intervention has since rewritten the status, the disruption's effect is superseded and is not reverted automatically.

```json
{
  "id": "GATE_01",
  "status": "CLOSED",
  "status_source": "DISRUPTION"
}
```

Revert policy and approval workflow belong to the operational layer, not to EV-006.

---

## 8. Movement and Traversal

### 8.1 Movement Is Defined by Edges

Movement between locations is possible only along edges.

* Movement is permitted only along an edge whose `from` and `to` reference the two locations involved.
* Movement in the direction opposite to an edge requires a separate directed edge in that direction.
* There is no implicit or ad-hoc movement between nodes that are not connected by an edge.

### 8.2 Traversal Preconditions

A traversal of an edge is permitted only when all of the following hold:

1. the edge `status` is `OPEN`
2. the `from` node `status` is `OPEN`
3. the `to` node `status` is `OPEN`
4. the traversing entity is authorized (authorization policy is outside MVP)

If any precondition fails, the edge is not traversable.

### 8.3 Traversal Time

Traversal time is expressed in **seconds** and is defined on edges.

| Field | Meaning |
| --- | --- |
| `baseline_time` | Normal / free-flow traversal time for the connection |
| `current_time` | Current estimated traversal time for the connection |

Normally:

```text
current_time = baseline_time
```

Operational conditions may cause the two values to differ. When a condition changes the expected traversal time, `current_time` is updated to reflect the current estimate while `baseline_time` preserves the normal reference.

If a changed condition becomes the new normal, `current_time` may later be **promoted** to `baseline_time`. The promotion mechanism belongs outside EV-006; EV-006 defines only the two values and their meaning.

Movement time is modelled on edges only. In MVP, nodes contribute holding capacity and service rate constraints, not a separate configured traversal-time field.

### 8.4 Paths

A path is an ordered sequence of edges in which each edge's `from` matches the previous edge's `to`, beginning at a start node and ending at a destination node.

A path is usable only when every node and every edge on the path satisfies the traversal preconditions in §8.2.

Derived path quantities are simple sums of edge configuration:

```text
path distance       = Σ edge.distance
path baseline time  = Σ edge.baseline_time
path current time   = Σ edge.current_time
```

EV-006 does not compute routes, select paths, model route choice, or evaluate congestion. Those responsibilities belong to EV-007 and EV-010.

---

## 9. Capacity

EV-006 defines **configured capacity**. EV-007 calculates the **actual** occupancy, flow and queueing that occurs within those configured limits.

### 9.1 Capacity Concepts

| Concept | Field | Entity | Unit | Meaning |
| --- | --- | --- | --- | --- |
| Holding capacity | `capacity` | Node | **people** | Maximum number of people the location can hold |
| Service rate | `throughput_capacity` | Node | **people/minute** | Maximum rate at which people can pass through the location |
| Flow capacity | `capacity` | Edge | **people/minute** | Maximum practical movement flow through the connection |

### 9.2 Node Capacity

Node `capacity` is a **holding capacity**:

> The maximum number of people the location can hold.

**Unit: people.**

Capacity may be `null` where a meaningful physical holding capacity does not apply (for example a `ROAD` link).

Capacity is a configured graph constraint. It is never a rate.

**Dynamic occupancy is not stored in the Graph Model.**

```text
Configured capacity = 10,000     ← EV-006 (Graph Model)
Current occupancy   =  7,500     ← EV-007 (Crowd Model)
```

### 9.3 Node Throughput Capacity

Node `throughput_capacity` is a **service rate**:

> The maximum rate at which people can pass through the location.

**Unit: people/minute.**

It is optional and may be `null` where no meaningful service rate applies. It is distinct from holding capacity and must never be substituted for it.

This is the field to use for constraints such as a checkpoint or gate screening rate.

### 9.4 Edge Capacity

Edge `capacity` is a **flow capacity**:

> The maximum practical movement flow through the connection.

**Unit: people/minute.**

Edge capacity is distinct from node holding capacity:

* node `capacity` answers "how many people can be here?"
* edge `capacity` answers "how many people per minute can move through here?"

The field name `capacity` is preserved on both entity types. The meaning and unit are determined by the entity: **node = people, edge = people/minute.** Consumers must apply the unit of the entity they are reading.

### 9.5 Null Semantics

A `null` capacity means **no meaningful configured limit for that field**.

Consumers must treat `null` as "not constrained by this field", never as zero and never as unlimited-with-a-consequential-value. A `null` value must not cause a divide-by-zero, a zero-capacity bottleneck, or a validation failure.

### 9.6 What EV-006 Does Not Calculate

EV-006 does **not** calculate any of the following. They are owned by EV-007:

* occupancy
* density
* crowd flow
* queue size
* queue growth
* movement rate
* waiting time
* overload

EV-006 defines only the configured limits within which those quantities arise.

### 9.7 Spatial Data Available to EV-007

EV-006 exposes the following spatial and configuration data for EV-007:

* node `latitude` / `longitude`
* node `capacity` (people)
* node `throughput_capacity` (people/minute)
* edge `distance` (metres)
* edge `capacity` (people/minute)
* edge `baseline_time` / `current_time` (seconds)

EV-006 does **not** define a node area field. An area-based density model (`people per unit area`) cannot be computed from EV-006 alone. EV-007's density definition must therefore be based on data EV-006 actually exposes — node `capacity` and crowd occupancy — or EV-007 must formally require an area field to be added to the node schema.

Resolution of the density unit belongs to EV-007. EV-006 does not define a density model and does not add an area field in MVP.

---

## 10. Operational Parameters

EV-006 owns the definition of a minimal, generic **operational parameter** object used to express configurable operational limits against graph entities.

### 10.1 Parameter Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | enum | yes | The configured limit (see §10.2) |
| `scope` | enum | yes | `NODE`, `EDGE`, or `EVENT` |
| `target_id` | string \| null | yes | Node or edge `id`; `null` when scope is `EVENT` |
| `value` | number \| string | yes | The configured value for the key |
| `unit` | string \| null | no | Unit of `value` where the key is numeric |

### 10.2 MVP Parameter Keys

| `key` | Valid scope | Unit | Meaning |
| --- | --- | --- | --- |
| `capacity` | `NODE` | people | Effective holding capacity for the target node |
| `throughput_capacity` | `NODE` | people/minute | Effective service rate for the target node |
| `capacity` | `EDGE` | people/minute | Effective flow capacity for the target edge |
| `status` | `NODE`, `EDGE` | — | Effective status (`OPEN` or `CLOSED`) |
| `restriction` | `NODE`, `EDGE`, `EVENT` | — | An operational restriction label applied to the target or to the event |

```json
{
  "key": "throughput_capacity",
  "scope": "NODE",
  "target_id": "CHECKPOINT_02",
  "value": 120,
  "unit": "people/minute"
}
```

### 10.3 Ownership

EV-006 **owns the definition of the operational parameter object** because its keys express graph-level configuration: capacity, throughput capacity, availability and operational restrictions.

* EV-010 consumes operational parameters as optimization constraints.
* EV-011 applies operational parameters as scenario overrides.
* The runtime authorization layer decides which parameters are legal and who may set them.

EV-006 defines the shape and the static configuration usage. Evaluating, enforcing and optimizing against operational parameters belongs to the consuming domains.

Unknown keys, unknown scopes, invalid values and unknown `target_id` references are critical validation errors (§13).

---

## 11. Initial Graph and Current Graph

The MVP defines exactly two graph states.

### 11.1 Initial Graph

The **Initial Graph** is the locked pre-event baseline.

* It is configured before the event.
* It is immutable once the event configuration is locked.
* It is the reference for comparison, planning and post-event analysis.
* It is never modified by operational changes, disruptions, interventions or simulations.

### 11.2 Current Graph

The **Current Graph** is the latest authorized operational graph state.

* It begins as a copy of the Initial Graph.
* It diverges from the Initial Graph only through authorized operational changes.
* It reflects the resulting authorized state after configuration, disruptions, operators and approved interventions have been applied.
* It is the baseline normally used for live decision support.

### 11.3 Relationship

| Aspect | Initial Graph | Current Graph |
| --- | --- | --- |
| Purpose | Locked pre-event reference | Latest authorized operational state |
| Mutability | Immutable once locked | Changes through the single authorized write path |
| Used for | Comparison, planning, historical analysis | Live decision support, current operational state |
| Written by | Pre-event configuration | Operational authorization layer only |

```text
Initial Graph (immutable baseline)
      │
      └── derives ──► Current Graph (latest authorized state)
                            │
                            └── cloned ──► Scenario state (sandbox, isolated)
```

Both graphs use the identical schema: graph identity, nodes and edges (§4.2, §5.1, §6.1).

### 11.4 Simulation Isolation

Simulation creates **isolated scenario state** from a selected baseline.

A baseline may be:

* the Initial Graph
* the Current Graph
* a previously captured state

Simulation **must not** modify the Initial Graph, the Current Graph, live crowd state, or live disruption state. Scenario overrides exist only inside the sandbox state and are discarded when the simulation ends.

Scenario execution and override mechanics belong to EV-011. EV-006 defines only the two base graph states and the isolation rule.

Full graph history and versioning are a future extension and are not part of MVP.

---

## 12. Active Entries and Exits

Node `type` identifies the role of an access point (`ENTRANCE`, `EXIT`).

Scenario and event configuration determines which access points are **active**:

```text
active_entries = [ "ENTRANCE_01", "GATE_01" ]
active_exits   = [ "EXIT_01", "GATE_04" ]
```

Rules:

* `active_entries` and `active_exits` are arrays of node `id` values.
* `active_entries` may reference nodes of type `ENTRANCE` or `GATE`.
* `active_exits` may reference nodes of type `EXIT` or `GATE`.
* This is **configuration**, not a new node type.
* An inactive access point is not a `CLOSED` node. Activation and availability are separate concepts: `status` expresses availability, while the active lists express which access points are in operational use for the scenario.

Consumers that route arrivals or departures must use the active lists. Consumers that determine whether a location may be used at all must use `status`.

Invalid references — a missing node, or a node of the wrong type — are critical validation errors (§13).

---

## 13. Validation

EV-006 uses hybrid validation.

* **Critical** errors block scenario execution.
* **Warnings** are reported and do not block execution.

Validation runs when a graph is loaded or applied: when the Initial Graph is locked, when the Current Graph is updated, and when scenario overrides are applied.

### 13.1 Critical Errors

| Check | Condition |
| --- | --- |
| Node `id` | Missing, empty, or not unique within the graph |
| Node `type` | Missing or not one of the seven MVP node types |
| Node coordinates | Missing, or outside latitude `[-90, 90]` / longitude `[-180, 180]` |
| Node `capacity` | Present but not a non-negative integer (`null` is valid) |
| Node `throughput_capacity` | Present but not a non-negative number (`null` is valid) |
| Node `status` | Not `OPEN` or `CLOSED` |
| Edge `from` / `to` | Missing, or does not reference an existing node |
| Edge self-loop | `from` equals `to` |
| Edge `distance` | Missing, non-numeric, or not greater than zero |
| Edge `baseline_time` | Missing, non-numeric, or not greater than zero |
| Edge `current_time` | Missing, non-numeric, or not greater than zero |
| Edge `capacity` | Missing, non-numeric, or not greater than zero |
| Edge `status` | Not `OPEN` or `CLOSED` |
| Duplicate physical connection | Same `from`, same `to`, same `distance`, without distinct labels (§6.5) |
| Operational parameter | Unknown `key`, invalid `scope`, invalid `value`, or unknown `target_id` |
| Active entries/exits | Reference to a missing node, or a node of a type not permitted for that list |

A graph that fails any critical check must not be applied and must not be used to execute a scenario.

### 13.2 Warnings

| Check | Condition | Handling |
| --- | --- | --- |
| Isolated node | A node with no incident edge | Warn only. Isolated nodes are **not** invalid. |
| Duplicate labels | Two nodes, or two edges, share a `label` | Warn only |
| Missing edge label | Edge `label` absent | Warn, and generate `{from_label} → {to_label}` (§6.4) |

### 13.3 What EV-006 Does Not Validate

* There is **no universal requirement** that every entry connects to every exit.
* There is no requirement that the graph be fully connected.
* Reachability requirements, where an operational scenario requires them, are validated by the scenario layer (EV-011) rather than imposed by EV-006.
* Geospatial outlier detection, duplicate coordinate detection and advanced geospatial validation are not part of MVP.

### 13.4 Coordinate Validation

MVP validation requires only that coordinates are present and within valid GPS ranges:

```text
latitude  ∈ [-90, 90]
longitude ∈ [-180, 180]
```

No advanced geospatial validation is performed.

---

## 14. Runtime and Authorization

Graph editing is **not** casual runtime editing.

### 14.1 Before the Event

Authorized users may modify the event configuration, including nodes, edges, capacities, status, operational parameters and active entries/exits.

When the event configuration is locked, the Initial Graph is frozen (§11.1).

### 14.2 During and After the Event

Changes to the Current Graph require authorization, including credentials or password as appropriate to the operational policy.

All changes to the Current Graph pass through the single authoritative write path (§7.5). A change records the actor, the time, the parameter, and the previous and new value, so that operational state remains auditable.

### 14.3 Simulation and Base Graphs

Simulation never edits either base graph. It uses scenario overrides against isolated scenario state (§11.4).

Approving an intervention is an operational change to the Current Graph and follows §14.2. Applying an approved change is not performed by EV-010 and does not bypass authorization.

### 14.4 Ownership of Policy

EV-006 defines the requirement that the write path is singular and authorized. It does not define authorization policy, roles, credentials or approval workflow; those belong to the operational layer.

---

## 15. Simulation Interaction

EV-006 provides the following contract to EV-011:

* **Baseline selection.** A simulation selects one baseline: the Initial Graph, the Current Graph, or a previously captured state.
* **State cloning.** Simulation clones the selected baseline into isolated scenario state and operates only on that copy.
* **Scenario overrides.** Graph overrides, operational parameter overrides and status overrides apply only to the isolated copy.
* **Base graph protection.** Simulation never modifies the Initial Graph or the Current Graph, and never modifies live crowd or live disruption state.
* **Traversal configuration.** Simulation uses edge `baseline_time`, `current_time`, `distance`, `capacity` and `status` (together with node `capacity`, `throughput_capacity` and `status`) as the configured environment within which crowd propagation occurs.
* **No write-back.** Ending a simulation does not write to either base graph. Promoting a scenario result into operational state is a separate authorized operational change.

The crowd propagation behaviour that runs inside the simulation is defined by EV-007. EV-006 supplies only the environment and its configured limits.

---

## 16. Domain Boundary

### 16.1 EV-006 Owns

* graph identity
* nodes
* edges
* node types
* node holding capacity
* node throughput capacity
* edge flow capacity
* edge direction
* edge distance and traversal time configuration
* node and edge status (authoritative availability)
* Initial Graph and Current Graph
* active entries and exits configuration
* graph validation
* the operational parameter object shape
* the single-write-path requirement for graph state

### 16.2 EV-006 Does Not Own

| Concern | Owner |
| --- | --- |
| Crowd occupancy, density, flow, queues, movement rate | EV-007 |
| Crowd behaviour while located on a node or an edge | EV-007 |
| Disruption identity, type, affected entities, severity, lifecycle | EV-008 |
| Future prediction and forecasting | EV-009 |
| Intervention generation, constraints, ranking | EV-010 |
| Scenario execution and time progression | EV-011 |
| Authorization policy and approval workflow | Operational layer |

### 16.3 Interface Statement

EV-006 defines that an edge exists, where it connects, how it is directed, how long it takes to traverse, how much flow it can carry, and whether it is available.

EV-006 does **not** define what it means for people to occupy an edge, how they enter or leave it, how fast they move along it, or how they queue at its endpoints. Those behaviours are defined by EV-007.

EV-006 describes the required operational change resulting from a disruption only in the sense that graph state reflects the authorized result. The disruption itself, its severity and its lifecycle belong to EV-008.

---

## 17. MVP Requirements

The MVP Graph Model provides:

| Requirement | MVP Behaviour |
| --- | --- |
| Graph abstraction | Nodes and edges, one unified logical graph |
| Graph identity | `id`, `name`, `nodes[]`, `edges[]` |
| Node types | Exactly seven: `ZONE`, `GATE`, `ENTRANCE`, `EXIT`, `TRANSIT`, `CHECKPOINT`, `ROAD` |
| Node schema | `id`, `label`, `type`, `latitude`, `longitude`, `capacity`, `throughput_capacity` (optional), `status` |
| Node capacity | Holding capacity, unit **people**, may be `null` |
| Node throughput | Service rate, unit **people/minute**, optional, may be `null` |
| Edge schema | `id`, `label` (optional), `from`, `to`, `distance`, `baseline_time`, `current_time`, `capacity`, `status` |
| Edge direction | Every edge is directed; two-way connections use two directed edges |
| Edge capacity | Flow capacity, unit **people/minute** |
| Edge time | `baseline_time` and `current_time`, unit **seconds** |
| Node status | `OPEN`, `CLOSED` |
| Edge status | `OPEN`, `CLOSED` |
| Closed behaviour | `CLOSED` node or edge cannot be traversed; node closure overrides connected edges |
| Status provenance | Single authoritative write path; optional `status_source` |
| Graph states | Exactly two: Initial Graph and Current Graph |
| Simulation isolation | Simulation clones a baseline and never mutates either base graph |
| Active entries/exits | Configuration lists, not node types |
| Operational parameters | Minimal object for capacity, throughput capacity, availability and restrictions |
| Coordinates | GPS latitude/longitude only, validated against valid ranges |
| Validation | Hybrid: critical errors block; isolated nodes, duplicate labels and missing edge labels warn |
| Graph layers | Filtered views of one graph; no separate synchronized graphs |
| Density | Not modelled; spatial dependency documented in §9.7 |
| History/versioning | Not in MVP |

---

## 18. Example

A complete small graph containing a transit access point, a surrounding road, a gate, a checkpoint, an internal zone and an exit.

```json
{
  "id": "EVENT_GRAPH_001",
  "name": "North Arena Event Graph",
  "nodes": [
    {
      "id": "TRANSIT_01",
      "label": "Central Station Access",
      "type": "TRANSIT",
      "latitude": 19.12010,
      "longitude": 72.12010,
      "capacity": 1200,
      "throughput_capacity": 300,
      "status": "OPEN"
    },
    {
      "id": "ROAD_01",
      "label": "Approach Road",
      "type": "ROAD",
      "latitude": 19.12100,
      "longitude": 72.12100,
      "capacity": null,
      "status": "OPEN"
    },
    {
      "id": "GATE_01",
      "label": "North Gate",
      "type": "GATE",
      "latitude": 19.12345,
      "longitude": 72.12345,
      "capacity": 5000,
      "throughput_capacity": 600,
      "status": "OPEN"
    },
    {
      "id": "CHECKPOINT_01",
      "label": "North Screening",
      "type": "CHECKPOINT",
      "latitude": 19.12350,
      "longitude": 72.12350,
      "capacity": 400,
      "throughput_capacity": 120,
      "status": "OPEN"
    },
    {
      "id": "ZONE_01",
      "label": "Main Arena",
      "type": "ZONE",
      "latitude": 19.12400,
      "longitude": 72.12400,
      "capacity": 10000,
      "status": "OPEN"
    },
    {
      "id": "EXIT_01",
      "label": "East Exit",
      "type": "EXIT",
      "latitude": 19.12450,
      "longitude": 72.12450,
      "capacity": 1500,
      "throughput_capacity": 450,
      "status": "CLOSED"
    }
  ],
  "edges": [
    {
      "id": "EDGE_01",
      "label": "Central Station Access → Approach Road",
      "from": "TRANSIT_01",
      "to": "ROAD_01",
      "distance": 260.0,
      "baseline_time": 210,
      "current_time": 210,
      "capacity": 400,
      "status": "OPEN"
    },
    {
      "id": "EDGE_02",
      "label": "Approach Road → Central Station Access",
      "from": "ROAD_01",
      "to": "TRANSIT_01",
      "distance": 260.0,
      "baseline_time": 210,
      "current_time": 210,
      "capacity": 400,
      "status": "OPEN"
    },
    {
      "id": "EDGE_03",
      "label": "Approach Road → North Gate (West Lane)",
      "from": "ROAD_01",
      "to": "GATE_01",
      "distance": 180.0,
      "baseline_time": 150,
      "current_time": 180,
      "capacity": 300,
      "status": "OPEN"
    },
    {
      "id": "EDGE_04",
      "label": "Approach Road → North Gate (East Lane)",
      "from": "ROAD_01",
      "to": "GATE_01",
      "distance": 200.0,
      "baseline_time": 165,
      "current_time": 165,
      "capacity": 150,
      "status": "OPEN"
    },
    {
      "id": "EDGE_05",
      "from": "GATE_01",
      "to": "CHECKPOINT_01",
      "distance": 40.0,
      "baseline_time": 35,
      "current_time": 35,
      "capacity": 240,
      "status": "OPEN"
    },
    {
      "id": "EDGE_06",
      "label": "North Screening → Main Arena",
      "from": "CHECKPOINT_01",
      "to": "ZONE_01",
      "distance": 70.0,
      "baseline_time": 60,
      "current_time": 60,
      "capacity": 180,
      "status": "OPEN"
    },
    {
      "id": "EDGE_07",
      "label": "Main Arena → East Exit",
      "from": "ZONE_01",
      "to": "EXIT_01",
      "distance": 95.0,
      "baseline_time": 80,
      "current_time": 80,
      "capacity": 300,
      "status": "CLOSED"
    }
  ]
}
```

Notes on the example:

* `EDGE_03` and `EDGE_04` are two parallel directed connections between the same nodes. They represent distinct physical lanes and are distinguished by distinct labels. They are valid.
* `EDGE_01` and `EDGE_02` model a two-way physical connection as two directed edges.
* `EDGE_05` has no `label`. It is valid and produces a warning. The display label is generated as `North Gate → North Screening`.
* `ROAD_01` has `capacity: null` because a road link has no meaningful holding capacity. Its movement limit is carried by edge `capacity`.
* `EXIT_01` is `CLOSED`, and `EDGE_07` is `CLOSED`. Neither can be traversed, so the exit is unusable in this configuration.
* `EDGE_03` shows `current_time` (180) diverging from `baseline_time` (150), representing a current estimate that differs from the normal reference.

A usable path in this graph:

```text
TRANSIT_01 → ROAD_01 → GATE_01 → CHECKPOINT_01 → ZONE_01

path distance     = 260 + 180 + 40 + 70 = 550 metres
path current time = 210 + 180 + 35 + 60 = 485 seconds
```

---

## 19. Architectural Summary

EV-006 defines the environment and its authoritative availability. It describes **what exists, where it exists, how it can be traversed, how much movement it can carry, and whether it is currently available** — and nothing about the crowd itself.

Key invariants:

* One unified logical graph. Layers are filtered views, never separate synchronized graphs.
* Every permitted movement relationship is an edge. Every edge is directed. Two-way movement uses two directed edges.
* Node `capacity` is a holding capacity in **people**. Edge `capacity` is a flow capacity in **people/minute**. Node `throughput_capacity` is a service rate in **people/minute**. These three are never conflated.
* Traversal uses `baseline_time` (normal) and `current_time` (current estimate), both in seconds. Promotion of `current_time` to `baseline_time` happens outside EV-006.
* `CLOSED` nodes and edges cannot be traversed, and node closure overrides connected movement availability.
* Congestion is crowd-derived and is never an authoritative graph state. Crowd-derived conditions are owned by EV-007.
* Exactly two graph states exist: the immutable Initial Graph and the authorized Current Graph. Simulation clones either into isolated state and never mutates a base graph.
* Graph state has one authoritative write path. EV-008 describes disruptions and EV-010 proposes interventions; neither writes graph state, and neither bypasses authorization.
* Validation is hybrid: structural and configuration errors block execution; isolated nodes, duplicate labels and missing edge labels produce warnings.
* EV-006 defines configured limits only. Actual occupancy, density, flow, queues, movement rate and waiting time are calculated by EV-007.
