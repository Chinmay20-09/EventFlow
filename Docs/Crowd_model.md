# EV-007 — Crowd Model

**Document ID:** EV-007
**Domain:** Crowd
**Status:** MVP Specification
**Depends On:** EV-006 Graph Model (required); EV-008 Disruption Model, EV-010 Optimization, EV-011 Simulation (context inputs)
**Consumed By:** EV-009 Prediction, EV-010 Optimization, EV-011 Simulation

**Purpose:** Define crowd movement, accumulation, utilization and overload calculations.

---

## 1. Purpose

The Crowd Model represents the people moving through the EventFlow environment.

It maintains the current state of crowd groups and provides the higher-level intelligence layers with information about:

* where people are
* where they are going
* how fast they are moving
* how dense locations are
* how large queues are
* how long movement and waiting are taking
* whether crowd conditions are becoming problematic

The Crowd Model is primarily an **execution and state layer**.

It executes routing and diversion decisions supplied by higher-level intelligence, and it reports the resulting crowd state. It does not make the final strategic decision about what intervention should be taken.

---

## 2. Scope

### 2.1 In Scope

EV-007 is responsible for:

* crowd group representation
* current crowd state
* movement
* accumulation
* flow
* occupancy
* density
* queues
* waiting
* travel time
* throughput
* utilization
* overload detection
* movement-rate changes
* execution of routing and diversion decisions
* crowd-related metrics
* crowd threshold evaluation
* crowd sources and runtime adjustments

### 2.2 Out of Scope

EV-007 does not own:

| Concern | Owner |
| --- | --- |
| Graph topology, edges, capacities, status | EV-006 |
| Disruption identity, type, severity, lifecycle | EV-008 |
| Future prediction and forecasting | EV-009 |
| Strategic routing, intervention generation, ranking | EV-010 |
| Scenario execution and time progression | EV-011 |
| Authorization policy and approval | Operational layer |

EV-007 is **not** the strategic decision-making brain. Higher-level intelligence supplies routing and diversion decisions; EV-007 executes them and reports the resulting crowd state.

### 2.3 Representation

EventFlow models people primarily as **aggregate crowd groups**, rather than simulating every individual person.

The MVP does **not** use individual person agents, microscopic simulation, pedestrian physics, reinforcement learning or fluid dynamics. The model must remain deterministic, lightweight and understandable.

---

## 3. Architecture

### 3.1 Position in the EventFlow Chain

```text
EV-006 Graph          → What exists, and what is operationally available
EV-007 Crowd          → What is happening now
EV-008 Disruption     → What changed
EV-009 Prediction     → What is likely to happen next
EV-010 Optimization   → What could/should be changed
EV-011 Simulation     → What happens under a scenario
```

EV-007 consumes graph configuration and authoritative availability, computes crowd state, and publishes crowd metrics. Prediction, Optimization and Simulation consume those metrics.

### 3.2 Data Flow Direction

```text
EV-006 Graph ──┐
EV-008 Disruption ──┤
EV-010 decisions ──┼──► EV-007 Crowd ──► EV-009 Prediction
EV-011 scenario ──┤                  ──► EV-010 Optimization
sources/sensors ──┘                  ──► EV-011 Simulation
```

**EV-007 does not depend on EV-009.** Prediction consumes Crowd state; Crowd never consumes Prediction and never requires a forecast to compute its own metrics.

### 3.3 Graph Interaction Boundary

EV-007 **consumes** from EV-006:

* nodes and edges
* node and edge `status`
* node `capacity` (holding capacity, people)
* node `throughput_capacity` (service rate, people/minute)
* edge `capacity` (flow capacity, people/minute)
* edge `distance` (metres)
* edge `baseline_time` and `current_time` (seconds)
* active entries and exits

EV-007 **calculates**:

* occupancy
* actual flow
* density
* utilization
* queues
* overload
* waiting time
* travel time
* throughput

EV-007 **never writes** graph status, capacity or any other graph configuration. Graph state has one authoritative write path, owned by the operational layer (EV-006 §7.5). When crowd conditions suggest a graph change — for example a closure — EV-007 **reports the condition** and an authorized operational layer applies the change.

### 3.4 Static Configuration vs Dynamic State

| Aspect | EV-006 (Graph) | EV-007 (Crowd) |
| --- | --- | --- |
| Node holding limit | `capacity` — people | `occupancy` — people |
| Node service rate | `throughput_capacity` — people/minute | `inflow`, `throughput` — people/minute |
| Edge movement limit | `capacity` — people/minute | `flow` — people/minute |
| Traversal time | `baseline_time` / `current_time` — seconds | `travel_time`, `average_speed` — seconds, metres/second |
| Availability | `status` — authoritative | Consumed; never written |

---

## 4. Crowd Group Model

### 4.1 Crowd Group Concept

A crowd group represents a set of people that can be treated as one movement unit.

```text
CrowdGroup
    │
    ├── Population
    ├── Current Location
    ├── Destination
    ├── Entry Source
    ├── Movement Characteristics
    ├── Routing
    └── Current State
```

Example:

```text
500 people
North Entrance
        ↓
Main Arena
        ↓
MOVING
```

### 4.2 Crowd Group Schema

| Field | Type | Required | Unit | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes | — | Stable crowd-group identifier |
| `population` | integer | yes | **people** | Number of people currently represented |
| `current_location` | object | yes | — | `{ kind: NODE \| EDGE, id }` — see §6 |
| `destination` | string | yes | — | Node `id` the group intends to reach |
| `entry_source` | string | no | — | Origin or entry point (node `id` or source label) |
| `movement_rate` | number | derived | **people/minute** | Realized transfer rate of the group — see §7.3 |
| `average_speed` | number | yes | **metres/second** | Group walking speed under free-flow conditions |
| `preferred_route` | string[] | no | — | Ordered edge `id` list from origin to destination |
| `assigned_route` | string[] | no | — | Route currently being executed (may differ from `preferred_route`) |
| `route_flexibility` | enum | yes | — | `NONE`, `LIMITED`, `FLEXIBLE` — see §16.3 |
| `state` | enum | yes | — | `MOVING`, `WAITING`, `STOPPED`, `ARRIVED`, `DIVERTED` — see §5 |
| `progress` | number | derived | — | Fraction of the active edge traversed, `0`–`1` — see §7.4 |
| `waiting_time` | number | derived | **seconds** | Accumulated non-progressing time — see §14 |
| `travel_time` | number | derived | **seconds** | Accumulated actual movement time — see §14 |

`average_speed` uses **metres/second** as the single canonical speed unit throughout EV-007.

`preferred_route` and `assigned_route` are lists of EV-006 edge `id` values. They reference the actual EventGraph; EV-007 never creates a separate routing graph.

### 4.3 Derived Group Fields

For convenience, a group also exposes the metrics of its current location:

| Field | Definition |
| --- | --- |
| `density` | `density` of the group's current location (§11) |
| `density_state` | `density_state` of the group's current location (§11) |
| `queue_size` | `queue_size` of the group's current location when located at a node, otherwise `0` (§13) |

These are **projections of location metrics**, not independently computed values. The owner of `density`, `density_state` and `queue_size` is the location (node or edge), and the group value is a read-only convenience view.

### 4.4 Population Accounting Identity

Every group is located at exactly one place at any instant. Therefore:

```text
global_population = Σ node.occupancy(n) + Σ edge.occupancy(e)
```

This identity holds by construction and prevents double counting. See §6 and §9.

---

## 5. Crowd States

### 5.1 State Definitions

The MVP supports five states:

| State | Meaning | Progressing? | Location |
| --- | --- | --- | --- |
| `MOVING` | Travelling along an edge toward the next node on its route | Yes | `EDGE` |
| `WAITING` | Located at a node and queued, blocked by the node's onward service | No | `NODE` |
| `STOPPED` | Not progressing for a non-queue reason (held on an edge because the next node cannot accept people, or unable to proceed because no usable route exists) | No | `EDGE` or `NODE` |
| `ARRIVED` | Has reached its `destination` | No | `NODE` |
| `DIVERTED` | Moving along a route other than its `preferred_route`, executing an assigned diversion | Yes | `EDGE` |

### 5.2 WAITING vs STOPPED

`WAITING` and `STOPPED` both mean "not progressing", but they differ in cause and in accounting:

| Aspect | WAITING | STOPPED |
| --- | --- | --- |
| Cause | The node's onward **service** is saturated, or the next edge is at its flow limit | The next node **cannot accept people** (full or unavailable), or **no usable route exists**, or an operational hold applies |
| Location | Always at a node | On an edge (edge-end hold) or at a node (no route) |
| Contributing to `queue_size` | Yes — only WAITING people form a node queue | No |
| Contributing to `occupancy` | Yes, at that node | Yes, at its current location |
| Waiting time | Accrues | Accrues |

`queue_size` therefore counts only the `WAITING` population at a node, and is a subset of that node's occupancy.

### 5.3 DIVERTED vs MOVING

`DIVERTED` behaves exactly like `MOVING` for all movement mathematics. The distinction is routing intent:

* `MOVING` — the group is executing its `preferred_route` (or the route it was assigned with no deviation from preference).
* `DIVERTED` — the group is executing a route that differs from its `preferred_route`, because an authorized routing decision assigned an alternative, or because the preferred route became unavailable and a fallback was applied.

A group returns to `MOVING` when its `assigned_route` once again equals its `preferred_route`, or when a routing decision re-aligns the two.

### 5.4 Valid Transitions

```text
MOVING ⇄ DIVERTED              both progressing
   │                           (DIVERTED = executing a non-preferred route)
   │ blocked
   ▼
WAITING ⇄ STOPPED             both not progressing
   │                           (WAITING = node queue; STOPPED = held or unroutable)
   │ destination reached
   ▼
ARRIVED ──(new destination assigned)──► MOVING
```

| From | To | Cause |
| --- | --- | --- |
| `MOVING` | `WAITING` | Reached the next node, entered it, and cannot proceed onward this interval (service or flow saturated) |
| `MOVING` | `STOPPED` | Reached the end of the edge and the next node cannot accept people, or the onward route became unusable |
| `MOVING` | `DIVERTED` | An authorized route change was applied while moving |
| `MOVING` | `ARRIVED` | `destination` reached |
| `WAITING` | `MOVING` | Admitted from the queue and started traversing the next edge |
| `WAITING` | `STOPPED` | The node's onward route became unusable, or no usable route exists |
| `STOPPED` | `MOVING` | The blocking condition cleared and the group began traversing an edge |
| `STOPPED` | `WAITING` | The group entered a node and joined its queue |
| `DIVERTED` | `MOVING` | `assigned_route` once again equals `preferred_route` |
| `DIVERTED` | `WAITING` / `STOPPED` | The alternate route is blocked on the same terms as above |
| `DIVERTED` | `ARRIVED` | `destination` reached on the assigned route |
| `ARRIVED` | `MOVING` | A new `destination` was assigned (egress or re-routing) |

### 5.5 Reaching a Destination

When a group reaches its `destination`:

1. Its state becomes `ARRIVED` and it stops being a moving unit.
2. Its population becomes **resident population** at the destination node and is counted in that node's `occupancy`.
3. It is counted in `arrived_population` and contributes to `arrival_rate` (§15).
4. If the destination node `type` is `EXIT`, the population is instead released from the event graph as a **sink**: it is recorded as a `SINK_RELEASE` adjustment event (§9.3) and is removed from occupancy.
5. An `ARRIVED` resident group may later be assigned a new `destination` (for example an `EXIT` when egress begins). It then returns to `MOVING` or `DIVERTED`.

`ARRIVED` groups do not accrue `waiting_time`.

---

## 6. Location Model

### 6.1 Location Representation

Every crowd group is located at exactly one of:

```text
{ kind: "NODE", id: "<node id>" }   — the group is inside that location
{ kind: "EDGE", id: "<edge id>" }   — the group is traversing that connection
```

Location on an **edge** is fully supported. EV-007 does not reduce locations to nodes only.

### 6.2 Being Located on an Edge

A group located on an edge `e`:

* occupies that edge and contributes its full `population` to `edge.occupancy(e)`
* is traversing from `e.from` toward `e.to`
* holds a `progress` value in `[0, 1]` giving the fraction of `e.distance` already traversed
* has an `average_speed` and an effective speed (see §7.2)
* is subject to the edge's `capacity` (flow capacity) and `status`
* may hold at `progress = 1` while the next node cannot accept people; in that case it is `STOPPED` and remains located on the edge

### 6.3 Entering and Leaving an Edge

**Entering an edge.** A group enters edge `e` when the node at `e.from` admits it during an update interval:

* the group's state becomes `MOVING` (or `DIVERTED` if it is executing a non-preferred route)
* its `current_location` becomes `{ kind: EDGE, id: e }`
* its `progress` becomes `0`

**Leaving an edge.** A group leaves edge `e` when its `progress` reaches `1`:

* if the node at `e.to` accepts people this interval, the group's `current_location` becomes `{ kind: NODE, id: e.to }`
* if the node at `e.to` cannot accept people, the group remains on the edge with `progress` held at `1` and state `STOPPED`
* if `e.to` is the group's `destination`, the arrival rules in §5.5 apply

Partial population transfers are permitted: part of a group may enter a node while the remainder stays on the edge. When that happens, the group is split (§17).

### 6.4 Edge Traversal Time

Edge traversal time is determined by the group's effective speed and the edge length:

```text
actual_edge_travel_time(g, e) = e.distance / v_eff(g)        [seconds]
```

where `v_eff` is the group's effective speed on that edge (§7.2).

This is the **actual crowd travel time** for that traversal. It is distinct from the configured edge traversal time supplied by EV-006 (`current_time`), which is a configuration value and not a measurement. See §14.2.

### 6.5 Occupancy Accounting

| Metric | Definition | Unit | Scope |
| --- | --- | --- | --- |
| `node.occupancy(n)` | Sum of `population` of all groups whose `current_location` is `{NODE, n}` | people | Node |
| `edge.occupancy(e)` | Sum of `population` of all groups whose `current_location` is `{EDGE, e}` | people | Edge |
| `node.queue_size(n)` | Sum of `population` of groups located at `n` whose `state` is `WAITING` | people | Node |
| `arrived_population` | Cumulative people that have reached their destination | people | Event |

Rules that prevent double counting:

* a group is counted at exactly one location
* queued people are counted in `queue_size` **and** in the node's `occupancy`; `queue_size` is a subset of `occupancy`, never an addition to it
* edge population is counted only in `edge.occupancy`, never in a node's `occupancy`
* `ARRIVED` resident population is counted in the destination node's `occupancy`

---

## 7. Movement

### 7.1 Canonical Units

| Quantity | Unit |
| --- | --- |
| `population` | people |
| `occupancy` | people |
| `queue_size` | people |
| `flow` | people/minute |
| `throughput` | people/minute |
| `movement_rate` | people/minute |
| `average_speed` | **metres/second** |
| `distance` | metres |
| `baseline_time`, `current_time` | seconds |
| `waiting_time`, `travel_time` | seconds |
| `utilization` | dimensionless ratio |
| `density` | dimensionless load ratio |

Speed has exactly one canonical unit: **metres/second**.

### 7.2 Effective Speed

Crowd conditions reduce a group's speed. Higher crowd load reduces `movement_rate` through the effective speed:

```text
load(g)         = holding_utilization(to_node(g))     if that value is available, otherwise 0
speed_factor(g) = clamp( 1 - k * max(0, load(g) - L0),  F_min,  1 )
v_eff(g)        = average_speed(g) * speed_factor(g)
```

* `to_node(g)` — the node at the `to` end of the group's active edge.
* `k` — `speed_slowdown_coefficient` (configuration, §20).
* `L0` — `slowdown_start_utilization` (configuration, §20).
* `F_min` — `min_speed_factor` (configuration, §20).
* `clamp(x, lo, hi)` bounds `x` to the range `[lo, hi]`.
* `holding_utilization` is a stock measure (people), so this calculation is not circular with flow.

Below `L0` there is no slowdown. Above `L0`, speed decreases linearly until it reaches `F_min`, which is the floor.

Rationale and documented limitation: a linear load-to-speed reduction is the simplest deterministic model that satisfies "higher crowd density reduces movement rate". Edge-level crowding (people per metre of edge) is **not** modelled, because EV-006 defines no holding capacity for edges and therefore no edge-crowding denominator exists. If edge-crowding-based slowdown is required later, EV-006 must expose an edge holding quantity.

### 7.3 Movement Rate

`movement_rate` is the realized rate, in **people/minute**, at which the group transfers forward from its current edge.

```text
rate_speed(g)    = 60 * population(g) * v_eff(g) / edge.distance               [people/minute]
flow_budget(g)   = min over non-null values of:
                     edge.capacity(active_edge)
                     to_node.throughput_capacity
movement_rate(g) = min( rate_speed(g),  flow_budget(g) )                       [people/minute]
```

Rules:

* `movement_rate` is defined only for groups located on an edge and in state `MOVING` or `DIVERTED`.
* For `WAITING`, `STOPPED` and `ARRIVED` groups, `movement_rate = 0`.
* `null` values in `flow_budget` are ignored, consistent with EV-006 §9.5. If both are `null`, the flow budget is unconstrained and `movement_rate = rate_speed(g)`.
* If `population(g) = 0`, then `movement_rate = 0`.
* `rate_speed` describes how fast the moving column discharges people from the edge end: a larger population on a shorter edge discharges faster, and the cap by `flow_budget` prevents that from exceeding configured practical movement flow.

### 7.4 Edge Progress

```text
Δprogress(g) = v_eff(g) * Δt / edge.distance
progress(g)  = clamp( progress(g) + Δprogress(g),  0,  1 )
```

* `Δt` is the elapsed interval in **seconds** for this update.
* When `progress(g)` reaches `1`, the group leaves the edge per §6.3.
* If the next node cannot accept people, `progress(g)` is held at `1` and the group becomes `STOPPED`. Progress is never reversed while the group holds its position.

### 7.5 Transfer Application

People transfers are applied as counts per interval, not as continuous rates:

```text
transferred(g, Δt) = movement_rate(g) * Δt / 60                 [people]
transferred(g, Δt) = min( transferred(g, Δt), population(g) )
admitted(g, Δt)    = min( transferred(g, Δt), room(next_node) )  [people]
```

where:

```text
room(n) = max(0, capacity(n) - occupancy(n))    if capacity(n) is not null
        = unlimited                              if capacity(n) is null
```

* If `admitted(g, Δt)` is less than `population(g)`, the group is split (§17) and the remainder stays in place.
* Node inflow is blocked entirely while `room(n) = 0`.
* Node outflow is **not** blocked by the node's own occupancy; it is limited by `throughput_capacity` and the next edge's `capacity`. An overloaded node therefore drains while refusing new inflow.

### 7.6 Interval Handling

* In live operation, `Δt` is the elapsed time between consecutive crowd updates, capped by the configuration value `max_update_interval` (default 60 seconds).
* Inside EV-011, the simulation supplies `Δt` and controls time progression.
* If `Δt` exceeds `max_update_interval`, the update is applied as multiple consecutive intervals of at most `max_update_interval` so that blocking and queue behaviour is evaluated at a bounded resolution.

---

## 8. Flow

### 8.1 Actual Flow vs Configured Capacity

| Quantity | Owner | Unit | Meaning |
| --- | --- | --- | --- |
| `edge.capacity` | EV-006 | people/minute | Configured maximum practical movement flow |
| `edge.flow` | **EV-007** | people/minute | Actual realized crowd flow |
| `node.throughput_capacity` | EV-006 | people/minute | Configured maximum service rate |
| `node.inflow`, `node.throughput` | **EV-007** | people/minute | Actual realized crowd rates |

EV-006 never calculates actual crowd flow. EV-007 never redefines configured capacity.

### 8.2 Flow Definitions

```text
edge.flow(e)      = Σ movement_rate(g)   over groups with location {EDGE, e}        [people/minute]
node.inflow(n)    = Σ movement_rate(g)   over groups whose active edge has to = n   [people/minute]
node.throughput(n)= Σ movement_rate(g)   over groups whose active edge has from = n [people/minute]
```

* `edge.flow(e)` is the realized crowd flow along the edge.
* `node.inflow(n)` is the realized rate of people discharging into the node.
* `node.throughput(n)` is the realized rate at which people move onward out of the node — the node's actual service delivery.
* A group contributes to flow only while it is moving on an edge; queued and held groups contribute `0`.

Interval-averaged forms may also be reported over a measurement window as total people transferred divided by the window length in minutes.

---

## 9. Accumulation

### 9.1 Accumulation Update

For every node and every edge, occupancy accumulates as:

```text
occupancy_x(t + Δt) = occupancy_x(t)
                    + inflow_x(t, Δt)
                    - outflow_x(t, Δt)
                    + adjustment_x(t, Δt)
```

where `x` is a node or an edge, and all four terms are numbers of **people** over the interval.

* `inflow_x(t, Δt)` and `outflow_x(t, Δt)` are **physical crowd propagation** transfers produced by §7.
* `adjustment_x(t, Δt)` is the net result of **external events** (§9.3).

The result is clamped at a minimum of `0`. If the raw result is negative, the value is clamped and an `accounting_warning` event is emitted, because a negative occupancy indicates an inconsistency between physical transfers and external adjustments.

### 9.2 Physical Propagation vs External Adjustment

| Kind | Source | Conserves population? |
| --- | --- | --- |
| Physical propagation (`inflow`, `outflow`) | Crowd movement and transfers computed by §7 | Yes — every transferred person leaves one location and enters another |
| External adjustment (`adjustment`) | Sources, sinks, sensor corrections, manual changes, scenario injections | **No** — population may be added or removed |

**MVP does not require strict global conservation.** Physical propagation conserves population exactly; external events may legitimately change the number of people under management. The two are kept in separate terms so that every discrepancy is explainable.

### 9.3 Adjustment Event Types

| Adjustment reason | Direction | Meaning |
| --- | --- | --- |
| `SOURCE_DEMAND` | add | A demand source created or added people |
| `ENTRANCE_DEMAND` | add | Entrance-generated demand produced a batch of people |
| `SINK_RELEASE` | remove | People left the event graph (for example through an `EXIT`, or an explicit release) |
| `SENSOR_CORRECTION` | add or remove | A live measurement corrected the modelled occupancy or population |
| `MANUAL_ADJUSTMENT` | add or remove | An operator explicitly set or corrected a value |
| `SCENARIO_INJECTION` | add or remove | A simulation scenario injected or removed people |

Every adjustment is recorded as an event with reason, scope, target, signed value, and timestamp, so that the population difference between two instants is fully attributable.

### 9.4 Worked Form

```text
CHECKPOINT_01 occupancy, t      = 430 people
physical inflow                 =   0 people
physical outflow                = 120 people
adjustment (SENSOR_CORRECTION)  =  +0 people
--------------------------------------------------
CHECKPOINT_01 occupancy, t + Δt = 310 people
```

---

## 10. Capacity and Utilization

### 10.1 Capacity Semantics

EV-006 semantics are used exactly, and are never confused:

* node `capacity` = holding capacity, **people**
* node `throughput_capacity` = service rate, **people/minute**
* edge `capacity` = flow capacity, **people/minute**

EV-007 never redefines graph capacity.

### 10.2 Utilization Definitions

Three utilizations exist, at two entity types:

```text
holding_utilization(n) = occupancy(n) / capacity(n)              [node, dimensionless]
service_utilization(n) = node.inflow(n) / throughput_capacity(n)  [node, dimensionless]
flow_utilization(e)    = edge.flow(e) / capacity(e)               [edge, dimensionless]
```

* `holding_utilization` is the **holding utilization** of a node: how full it is.
* `flow_utilization` is the **flow utilization** of an edge: realized flow against configured flow capacity.
* `service_utilization` is the node's demand-to-service ratio, and is the measure that drives queue formation.

Holding utilization and flow utilization are different quantities with different denominators and must never be compared or substituted for one another.

### 10.3 Utilization Edge Cases

Handling is explicit and is never invented at runtime:

| Situation | Handling |
| --- | --- |
| `capacity(n)` is `null` | `holding_utilization(n) = null`. Not applicable, not an error. No utilization-based threshold or warning applies to that node. `overload(n) = null`. |
| `capacity(n) = 0` | `holding_utilization(n) = null` (no division by zero). `overload(n) = true` when `occupancy(n) > 0`, otherwise `false`. |
| `capacity(e)` is `null` or `0` | Same rules for `flow_utilization(e)`: `null`, with edge overload evaluated directly from flow against capacity. |
| `throughput_capacity(n)` is `null` or `0` | `service_utilization(n) = null`. A node with `throughput_capacity = 0` cannot serve anyone onward, so any queued group becomes `STOPPED` with a `queue_stalled` warning. |
| `utilization < 1` | Below capacity. |
| `utilization = 1` | Exactly at capacity. This is **not** overload. Overload requires strictly greater than capacity. |
| `utilization > 1` | Above capacity. For a node this means `overload = true`; for an edge this means `overload = true` when realized flow exceeds configured flow capacity. |

---

## 11. Density

### 11.1 MVP Density Representation

EV-006 does not define a node area field, so a physical `people per square metre` density cannot be computed from the available inputs.

The MVP therefore defines density as a **dimensionless load ratio**:

```text
node.density(n) = holding_utilization(n)     [occupancy / capacity]
edge.density(e) = flow_utilization(e)        [flow / capacity]
```

Density is `null` wherever the corresponding utilization is `null`.

This value is a **utilization-based load ratio**, not a physical area density. It is directly computable from data EV-006 exposes, which is the requirement. It must be labelled as a load ratio wherever it is presented so that it is never mistaken for people per square metre.

### 11.2 Dependency for Physical Density

If physical density (`people/m²`) is required by a later version, the dependency is precise: EV-006 must add a node area field (for example `area_m2`), after which:

```text
node.physical_density(n) = occupancy(n) / area_m2(n)      [people/m²]
```

EV-007 does not add arbitrary geometry or area of its own, and does not invent an area for nodes that lack one.

### 11.3 Density State

`density_state` is a categorical classification of density:

| State | Condition |
| --- | --- |
| `LOW` | `density < density_medium_threshold` |
| `MEDIUM` | `density_medium_threshold ≤ density < density_high_threshold` |
| `HIGH` | `density_high_threshold ≤ density < density_critical_threshold` |
| `CRITICAL` | `density ≥ density_critical_threshold` |
| `UNKNOWN` | `density` is `null` |

Thresholds are configuration, never hardcoded (see §20). `density_state` is a **warning classification**. It is related to overload but is not the same thing: overload is defined strictly as a capacity violation (§12), while `CRITICAL` is a configurable classification that typically coincides with, but does not define, overload.

---

## 12. Overload

### 12.1 Definition

Overload is a **capacity violation**, not simply high density:

```text
node.overload(n) = true    if capacity(n) is not null and meets either:
                             - capacity(n) > 0  and occupancy(n) > capacity(n)
                             - capacity(n) = 0  and occupancy(n) > 0
                   null    if capacity(n) is null   (not evaluable)

edge.overload(e) = true    if capacity(e) > 0 and edge.flow(e) > capacity(e)
                   true    if capacity(e) = 0 and edge.flow(e) > 0
                   null    if capacity(e) is null   (not evaluable)
```

The threshold is **strictly greater than capacity**. At exactly capacity the location is *at capacity* and is **not** overloaded.

### 12.2 Detection

* Overload is evaluated for every node and every edge on every crowd update.
* A transition from not-overloaded to overloaded emits an `overload` event.
* A transition from overloaded to not-overloaded emits an `overload_cleared` event.
* Both events carry scope, target id, the measured value, the capacity, and the derived utilization.

### 12.3 Resulting Crowd Behaviour

Overload changes crowd behaviour through the same mechanisms as ordinary capacity limits; EV-007 adds no special-case physics:

* **Overloaded node** — `room(n) = max(0, capacity(n) - occupancy(n)) = 0`, so physical inflow is blocked. Groups on incoming edges become `STOPPED` at the edge end; groups already at the node remain queued. Node outflow continues, so an overloaded node drains over time unless inflow keeps refilling it.
* **Overloaded edge** — realized flow is already capped by `flow_budget`, so `edge.flow(e)` cannot exceed `edge.capacity(e)` through normal propagation. An edge overload therefore indicates either an externally adjusted edge capacity below current flow, or a sensor/manual correction that raised measured flow. The condition is reported and the flow cap applies on the next interval.

### 12.4 Warning Behaviour

* Every overload and overload-cleared transition emits an event with full scope information.
* A configurable `utilization_warning_threshold` emits a `threshold_approaching` warning before capacity is reached.
* Warning severity and delivery are configuration; EV-007 only produces the condition and the measurement.

### 12.5 Overload Does Not Close the Graph

**EV-007 never changes graph status.** An overloaded node or edge is **not** automatically closed, and EV-007 does not request a closure as a side effect of detection.

EV-007 reports the condition. Applying a closure is an authorized operational action, performed through the single graph write path (EV-006 §7.5) by the operator, by a disruption (EV-008) or by an approved intervention (EV-010). Until such a change is applied, traversal continues to be governed solely by the node and edge `status` supplied by EV-006.

---

## 13. Queue Model

### 13.1 What Creates a Queue

A queue forms at a node when people who have entered the node cannot move onward as fast as they arrive. Causes:

* the node's `throughput_capacity` limits how many people can pass per minute
* the outgoing edge's `capacity` limits downstream flow
* the downstream node cannot accept people (at capacity or unavailable)
* the group has no usable onward route

A group that cannot proceed becomes `WAITING` at the node and joins its queue.

### 13.2 Queue Size

```text
queue_size(n) = Σ population(g) for groups at n with state = WAITING       [people]
queue_size(n) ⊆ occupancy(n)
```

Queued people are inside the node's holding area and are therefore part of its occupancy. If a deployment needs a queue that is physically separate from the node, it models the queue area as its own `ZONE` node in EV-006 — no change to the crowd model is required.

### 13.3 Growth Update

```text
queue_size(n, t + Δt) = max( 0,
                             queue_size(n, t)
                           + arrivals_to_queue(n, Δt)
                           - departures_from_queue(n, Δt) )
```

* `arrivals_to_queue(n, Δt)` — people who became `WAITING` at `n` during the interval
* `departures_from_queue(n, Δt)` — people admitted onward from the queue during the interval

### 13.4 Queue Service

Service is deterministic and first-in-first-out.

```text
service_people(n, Δt) = throughput_capacity(n) * Δt / 60     [people]   if throughput_capacity is not null
                      = unlimited                                         otherwise
```

`remaining_service` begins each interval at `service_people(n, Δt)`.

Groups in `WAITING` at node `n` are served in **FIFO order**, defined as the order in which they entered `WAITING`, ties broken by ascending group `id`.

For each queued group `g` in that order, with next edge `e_g` on its route:

```text
granted(g)  = min( remaining_service,
                   capacity(e_g) * Δt / 60,
                   population(g) )
admitted(g) = granted(g)
remaining_service = remaining_service - granted(g)
```

* Admitted people enter `e_g` and become `MOVING` (§6.3).
* If `granted(g) < population(g)`, the group is split (§17); the remainder stays in the queue in its original order position.
* The loop continues until the service budget for the interval is exhausted or no queued group can be served.
* A queued group whose next edge is unusable, or which has no usable route, becomes `STOPPED` and leaves the queue (§5.2).
* If `throughput_capacity(n) = 0`, or every queued group is blocked, no one is served and a `queue_stalled` warning is emitted.

### 13.5 Queue Change Over Time

* The net interval change is `arrivals_to_queue - departures_from_queue`.
* A positive net change sustained over `queue_warning_intervals` consecutive intervals (configuration) emits a `queue_increasing` warning.
* When `queue_size` falls to `0`, the node is queue-free and the warning is cleared.

---

## 14. Waiting and Travel Time

### 14.1 Waiting Time

Waiting time measures time spent **not progressing**. Both units below are **seconds**.

**Group waiting time** — accumulated in `WAITING` and `STOPPED` states only:

```text
waiting_time(g, t + Δt) = waiting_time(g, t) + Δt      while state ∈ {WAITING, STOPPED}
```

`MOVING`, `DIVERTED` and `ARRIVED` groups do not accrue waiting time.

**Current waiting time at a node** — the wait a new arrival would face, derived from the *current* queue, not a forecast:

```text
queue_wait(n) = 60 * queue_size(n) / throughput_capacity(n)      [seconds]   if throughput_capacity > 0
              = null                                                          otherwise
```

**Current waiting time for a queued group** — includes people ahead of it:

```text
group_wait(g) = waiting_time(g) + 60 * people_ahead(g) / throughput_capacity(n)   [seconds]
```

where `people_ahead(g)` is the summed population of queued groups served before `g` in FIFO order. If `throughput_capacity(n)` is not positive, the estimate is `null` and `queue_stalled` is emitted.

**Average waiting time** — mean `waiting_time` over groups that completed a wait (were admitted from a queue, or reached their destination) within the measurement window, in seconds.

### 14.2 Travel Time

Configured traversal time comes from EV-006. Actual crowd travel time is measured by EV-007.

| Quantity | Owner | Unit | Meaning |
| --- | --- | --- | --- |
| `edge.baseline_time` | EV-006 | seconds | Normal / free-flow configured traversal time |
| `edge.current_time` | EV-006 | seconds | Configured current-estimate traversal time |
| `actual_edge_travel_time` | **EV-007** | seconds | Measured crowd movement time on the edge: `distance / v_eff` |
| `travel_time(g)` | **EV-007** | seconds | Accumulated actual movement time for the group's route |
| `journey_time(g)` | **EV-007** | seconds | `travel_time(g) + waiting_time(g)` |

Accumulation across a route:

```text
travel_time(g) = Σ actual_edge_travel_time(g, e)   over every edge e completed or currently traversed
journey_time(g) = travel_time(g) + waiting_time(g)
```

`travel_time` excludes waiting and excludes edge-end holds. `waiting_time` captures both queued and held time. `journey_time` is the end-to-end elapsed time experienced by the group's people.

### 14.3 Consumer Contract

`waiting_time` and `travel_time` are published in **seconds** and are consumable by:

* **EV-009 Prediction** — as the current-state input from which future conditions are forecast
* **EV-010 Optimization** — as objective terms for minimizing waiting and travel time
* **EV-011 Simulation** — as measured outcomes for scenario comparison

EV-007 publishes **current and realized** values only — group values, current-at-node values and window averages. EV-007 does not forecast future waiting or travel time; forecasting belongs to EV-009. `queue_wait` and `group_wait` are derived from the present queue state and are not forecasts.

---

## 15. Throughput

Throughput is an **actual crowd metric**, in **people/minute**.

| Metric | Definition | Unit | Scope |
| --- | --- | --- | --- |
| `node.throughput(n)` | Σ `movement_rate` of groups whose active edge has `from = n` — the realized rate of people moving onward out of the node | people/minute | Node |
| `edge.throughput(e)` | `edge.flow(e)` — the realized rate of people passing along the edge | people/minute | Edge |
| `arrival_rate` | People reaching their destination per minute, from `ARRIVED` transitions over the measurement window | people/minute | Event |

Configured capacity and realized throughput are distinct and are never substituted:

* configured: `node.throughput_capacity` (people/minute), `edge.capacity` (people/minute)
* realized: `node.throughput` (people/minute), `edge.throughput` (people/minute), `arrival_rate` (people/minute)

`node.throughput` and `arrival_rate` are the metrics EV-010 and EV-011 use when maximizing delivery.

---

## 16. Routing and Diversion

### 16.1 Ownership

EV-007 does **not** own strategic route selection. Global route assignment, demand rebalancing and diversion strategies belong to higher-level intelligence and to EV-010. The operator layer may also issue routing decisions directly.

EV-007 **executes** routing and diversion decisions and reports the consequences.

### 16.2 Routes

* `preferred_route` — an ordered list of EV-006 edge `id` values describing the group's intended path from its origin to its `destination`.
* `assigned_route` — the route the group is currently executing.
* Every edge in a route must satisfy the chaining rule `edge.to` of one edge equals `edge.from` of the next, and the endpoints must connect the group's current node to its `destination`.
* Routes reference the actual EventGraph. EV-007 does not build or maintain a separate routing graph.

### 16.3 Route Flexibility

| `route_flexibility` | Behaviour when the preferred route is unavailable |
| --- | --- |
| `NONE` | The group never self-divertes. It becomes `STOPPED` and emits `route_unavailable` (or `no_valid_route` if no alternative exists). |
| `LIMITED` | The group never self-divertes. It waits for an authorized routing decision and remains `STOPPED`, emitting `route_unavailable`. |
| `FLEXIBLE` | The group may be diverted automatically by the local fallback rule in §16.5. |

### 16.4 Route Override and Diversion

When an authorized routing decision (from EV-010, the operator layer, or an EV-011 scenario intervention) supplies a new route:

1. `assigned_route` is set to the supplied route.
2. The group applies the change at its next decision point: on entering a node, or on leaving an edge. A group is never reversed mid-edge.
3. If the assigned route differs from `preferred_route`, the group's state becomes `DIVERTED`; otherwise it remains `MOVING`.
4. A diversion emits a `diverted` event carrying the group id, previous route, assigned route and reason.

### 16.5 Fallback When the Preferred Route Is Unavailable

For a `FLEXIBLE` group whose `preferred_route` is unusable (a traversal precondition in EV-006 §8.2 fails anywhere along it):

The group selects an alternative deterministically:

1. Consider only paths from its current node to its `destination` that use edges with `status = OPEN` and nodes with `status = OPEN`.
2. Choose the path with the lowest total `current_time` (sum of edge `current_time` in seconds).
3. Tie-break by lowest total `distance`.
4. Tie-break by lexicographic order of the edge `id` sequence.
5. If no such path exists, the group becomes `STOPPED` and emits `no_valid_route`.

This fallback is a **local availability fallback**, evaluated per group, at most once per group per reassignment. It is not a strategic decision: it does not trade off one group against another, does not rebalance demand across entrances, and does not consider system-wide objectives. Those remain with EV-010.

### 16.6 Manual and Sensor Unavailability

If the group's `destination` node is `CLOSED` or otherwise unusable, the group becomes `STOPPED` and emits `destination_unavailable`. It is re-evaluated on every subsequent crowd update, so it resumes automatically when the destination becomes usable again.

---

## 17. Group Merge and Split

### 17.1 Merge

Two or more crowd groups may merge into one group when all of the following are equal:

* `current_location`
* `destination`
* `state`
* `assigned_route` (or both unset)
* compatible `route_flexibility`

Merge result:

| Field | Resulting value |
| --- | --- |
| `id` | The lexicographically smallest `id` among the merged groups |
| `population` | Sum of the merged populations |
| `average_speed` | Population-weighted mean of the merged speeds |
| `entry_source` | The surviving group's `entry_source` |
| `route_flexibility` | The most restrictive value among the merged groups (`NONE` < `LIMITED` < `FLEXIBLE`) |
| `waiting_time` | Population-weighted mean |
| `travel_time` | Population-weighted mean |

### 17.2 Split

A group may split into two or more groups. Splitting is used for:

* partial admission through a node or a queue (§7.5, §13.4)
* partial diversion, where only part of a group is re-routed
* partial arrival, where only part of a group reaches a destination
* manual or sensor corrections that affect part of a group

Rules:

* The split itself **must conserve population exactly**: the sum of the child populations equals the parent population.
* Children inherit the parent's `average_speed`, `entry_source`, `route_flexibility`, `destination`, `state` and route unless the split specifies otherwise.
* The child with the largest population keeps the parent `id` (ties broken by the first child); remaining children receive new unique ids of the form `{parent_id}_{n}`.
* `waiting_time` and `travel_time` are carried to each child.
* A split emits a `split` event recording the parent id, the child ids and their populations.

### 17.3 Population Accounting

* A merge or a split conserves population exactly, so group accounting remains understandable at all times.
* Across the whole model, population changes only through recorded adjustment events (§9.3). No global conservation rule is imposed on the model as a whole.

---

## 18. Inputs

### 18.1 Input Contract

| Source | Provided to EV-007 |
| --- | --- |
| **EV-006 Graph** | nodes, edges, `status`, node `capacity`, node `throughput_capacity`, edge `capacity`, edge `distance`, `baseline_time`, `current_time`, `active_entries`, `active_exits`, graph state (Initial / Current), operational parameters |
| **EV-008 Disruption** | active disruptions; affected nodes and edges; expected duration — used for context only, never for severity interpretation (§23) |
| **EV-010 Optimization / operator** | routing decisions, diversion decisions, group re-assignment, destination changes, demand distribution changes |
| **EV-011 Simulation** | sandbox graph state, scenario conditions, controlled time progression, scenario interventions |
| **Manual demand** | explicitly created crowd groups |
| **Entrance demand** | generated arrival batches at active entries |
| **Live / sensor data** | measurements that correct modelled population, occupancy or queue values |

### 18.2 Crowd Sources

The MVP supports three input mechanisms. They do not all have to be available simultaneously; the model runs with any non-empty subset.

| Source | Mechanism |
| --- | --- |
| **1. Manual crowd groups** | A group is created with explicit `population`, `current_location`, `destination`, `entry_source` and movement characteristics. Used for planning, what-if analysis and operator input. |
| **2. Entrance-generated demand** | Demand is configured per active entry (from EV-006 `active_entries`), producing groups at a configured rate in **people/minute** over a configured window, at the entry node. The arrival profile is configuration. |
| **3. Live / sensor data** | External measurements are applied as `SENSOR_CORRECTION` adjustment events that correct runtime state. Sensor data never overwrites graph configuration and never writes graph status. |

Manual and sensor updates are applied as externally-recorded adjustments (§9.3), so any difference between physical propagation and observed reality is attributable and auditable. An invalid sensor update is rejected (§24) and leaves the previous state intact.

### 18.3 Dependency Rule

**EV-007 does not depend on EV-009.** Prediction consumes crowd state. Crowd state is computed entirely from EV-006 configuration, EV-008 disruption context, supplied routing decisions, supplied sources and elapsed time. No forecast is required at any point in the Crowd Model.

---

## 19. Outputs

### 19.1 Crowd Group Output

```json
{
  "id": "CG_01",
  "population": 500,
  "current_location": { "kind": "EDGE", "id": "EDGE_01" },
  "destination": "ZONE_01",
  "entry_source": "TRANSIT_01",
  "state": "MOVING",
  "movement_rate": 150.0,
  "average_speed": 1.30,
  "preferred_route": ["EDGE_01", "EDGE_03", "EDGE_05", "EDGE_06"],
  "route_flexibility": "FLEXIBLE",
  "progress": 0.42,
  "waiting_time": 0,
  "travel_time": 120.0
}
```

### 19.2 Runtime Metric Contract

Every metric carries a definition, a unit, a scope and an owner. For all rows below, the owner is **EV-007**.

| Metric | Definition | Unit | Scope |
| --- | --- | --- | --- |
| `occupancy` | People currently located at the node or on the edge | people | Node, Edge |
| `flow` | Realized crowd flow: Σ `movement_rate` of groups on the edge | people/minute | Edge |
| `inflow` | Realized rate of people discharging into the node | people/minute | Node |
| `throughput` | Realized rate of people moving onward out of the node or along the edge | people/minute | Node, Edge |
| `arrival_rate` | People reaching their destination per minute | people/minute | Event |
| `holding_utilization` | `occupancy / capacity` | dimensionless | Node |
| `service_utilization` | `inflow / throughput_capacity` | dimensionless | Node |
| `flow_utilization` | `flow / capacity` | dimensionless | Edge |
| `utilization` | Scope-dependent: holding utilization at a node, flow utilization at an edge | dimensionless | Node, Edge |
| `density` | Load ratio: holding utilization at a node, flow utilization at an edge | dimensionless | Node, Edge |
| `density_state` | Classification of `density`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, `UNKNOWN` | enum | Node, Edge |
| `queue_size` | People at the node in state `WAITING` | people | Node |
| `waiting_time` | Group: accumulated non-progressing time. Node: current queue wait. Also reported as a window average | seconds | Group, Node, Event |
| `travel_time` | Group: accumulated actual movement time. Edge: `distance / v_eff` for the traversing group. Also reported as a window average | seconds | Group, Edge, Event |
| `journey_time` | `travel_time + waiting_time` | seconds | Group |
| `overload` | Capacity violation: `occupancy > capacity` at a node, `flow > capacity` at an edge | boolean or null | Node, Edge |
| `global_population` | Σ node occupancy + Σ edge occupancy | people | Event |
| `arrived_population` | Cumulative people that reached their destination | people | Event |

### 19.3 Events and Warnings

EV-007 publishes the following events. Each event carries a timestamp, a scope, a target id, the measured value and the applicable threshold or capacity.

| Event | Emitted when |
| --- | --- |
| `high_density` | `density_state` becomes `HIGH` or `CRITICAL` |
| `density_cleared` | `density_state` falls back below the high-density threshold |
| `queue_increasing` | Net queue growth persists for `queue_warning_intervals` consecutive intervals |
| `queue_cleared` | `queue_size` reaches `0` |
| `queue_stalled` | A queue cannot be served (service rate zero or every queued group blocked) |
| `movement_slowing` | `speed_factor` falls below `movement_slowdown_ratio` |
| `threshold_approaching` | Utilization crosses `utilization_warning_threshold` without overload |
| `overload` | A node or edge transitions to overloaded |
| `overload_cleared` | A node or edge transitions out of overload |
| `route_unavailable` | A group's preferred route is unusable |
| `no_valid_route` | No usable path from the current node to the destination exists |
| `destination_unavailable` | The destination node is closed or otherwise unusable |
| `diverted` | A group began executing a route other than its preferred route |
| `split` | A group was split |
| `merge` | Groups were merged |
| `accounting_warning` | An occupancy update would have produced a negative value |
| `invalid_group` | A group failed validation and was rejected |
| `invalid_reference` | An update referenced an unknown node or edge and was rejected |
| `sensor_update_rejected` | A sensor or manual update was malformed and was rejected |

---

## 20. Thresholds and Warnings

All thresholds are **configuration**. They are supplied per node, per edge or per scenario, as appropriate, and are never hardcoded in crowd logic.

| Configuration key | Applies to | Purpose | Notes |
| --- | --- | --- | --- |
| `slowdown_start_utilization` (`L0`) | Node, Edge, Event | Load above which speed begins to reduce | Speeds below this load are unaffected |
| `speed_slowdown_coefficient` (`k`) | Node, Edge, Event | Rate at which speed reduces as load rises | Slope of the linear reduction |
| `min_speed_factor` (`F_min`) | Node, Edge, Event | Floor applied to `speed_factor` | Prevents movement from reaching zero speed |
| `density_medium_threshold` | Node, Edge, Event | Boundary for `MEDIUM` | — |
| `density_high_threshold` | Node, Edge, Event | Boundary for `HIGH`, and the `high_density` warning | — |
| `density_critical_threshold` | Node, Edge, Event | Boundary for `CRITICAL` | Classification only; overload is defined separately |
| `utilization_warning_threshold` | Node, Edge, Event | Emits `threshold_approaching` before capacity is reached | Below `1.0` |
| `queue_warning_intervals` | Node, Event | Consecutive intervals of net queue growth before `queue_increasing` | — |
| `movement_slowdown_ratio` | Node, Edge, Event | `speed_factor` below which `movement_slowing` is emitted | Between `F_min` and `1.0` |
| `max_update_interval` | Event | Maximum interval applied per crowd update, in seconds | Bounds queue and blocking resolution |

Threshold categories this configuration covers:

* utilization warning
* high density
* overload (defined by capacity, not by a tunable number)
* queue warning
* movement slowdown

No universal numeric threshold is embedded in EV-007. If configuration is absent, the system reports the metric and suppresses the corresponding warning rather than substituting a built-in value.

---

## 21. Event-Driven Updates

### 21.1 Model

EV-007 is **event-driven and continuous**. It does not require a universal fixed simulation tick as its conceptual architecture. The model reacts to events and recomputes only the affected scope.

### 21.2 Event Types

| Event | Effect |
| --- | --- |
| `group_enters_node` | A group's location becomes a node; state re-evaluated |
| `group_enters_edge` | A group's location becomes an edge with `progress = 0`; state becomes `MOVING` or `DIVERTED` |
| `group_leaves_edge` | `progress` reached `1`; transfer to the next node is evaluated |
| `queue_service` | The node's queue is served for the interval |
| `route_change` | A supplied routing decision updates `assigned_route` |
| `diversion` | A group begins executing a non-preferred route |
| `disruption_effect_applied` | A graph configuration change stemming from a disruption has been applied |
| `capacity_change` | An operational parameter changed a node or edge capacity |
| `status_change_applied` | A node or edge `status` changed through the authorized write path |
| `threshold_crossing` | A configured threshold was crossed |
| `external_crowd_update` | A sensor, manual or source adjustment |
| `merge` / `split` | Group accounting changed |
| `arrival` | A group reached its destination |
| `release` | Population left the event graph |

### 21.3 Ordering and Determinism

Given the same initial state, the same event sequence and the same configuration, EV-007 produces the same result. That requires a total order on events:

1. Events are ordered by timestamp in seconds.
2. Events with equal timestamps are ordered by priority class, then by scope kind (`NODE` before `EDGE`), then by target `id` ascending, then by group `id` ascending.

| Priority class | Events |
| --- | --- |
| 1 | `external_crowd_update` |
| 2 | `capacity_change`, `status_change_applied`, `disruption_effect_applied` |
| 3 | `route_change`, `diversion` |
| 4 | `merge`, `split` |
| 5 | `arrival`, `release` |
| 6 | `group_leaves_edge`, `group_enters_node`, `group_enters_edge`, `queue_service` |
| 7 | `threshold_crossing` |

Crowd logic itself is deterministic and requires no randomness. If a consumer supplies stochastic input — for example stochastic demand generation — the random seed is supplied externally by EV-011 and recorded with the simulation request.

### 21.4 Interval-Based Evaluation

Between events, movement, accumulation and queue service are evaluated over the elapsed interval `Δt` using §7.5, §9.1 and §13.4. `Δt` is bounded by `max_update_interval` (§7.6). The event-driven model and interval-based propagation are complementary: events mark discrete changes; intervals advance continuous movement.

---

## 22. Simulation Interaction

| Direction | Contract |
| --- | --- |
| EV-011 → EV-007 | sandbox graph state, scenario conditions, controlled time progression, scenario interventions, `Δt` for each step |
| EV-007 → EV-011 | crowd propagation, crowd metrics, crowd state changes, warnings and events |

Rules:

* EV-011 executes the Crowd Model; it does not redefine it.
* EV-007 operates on whatever graph instance it is given. It never distinguishes a base graph from a sandbox copy and never writes graph status in either case.
* Simulation isolation is provided by EV-011: EV-007 mutates only the state it has been given, and EV-011 supplies that state as an isolated scenario copy.
* EV-011 may pin a fixed stepping interval for numerical execution. This is an execution detail of the simulation and does not change EV-007's event-driven semantics (§21).
* EV-011 supplies the simulation seed and the baseline reference; EV-007 reports metrics per scenario so that strategies can be compared on the same metric definitions.

---

## 23. Disruption Interaction

### 23.1 Boundary

EV-008 defines disruptions — their identity, type, affected nodes and edges, severity, lifecycle and timing. EV-007 does not define, modify or interpret any of those.

EV-007 calculates **crowd consequences** of the operational change that a disruption causes. It reacts to the resulting graph configuration, not to the disruption's severity.

### 23.2 Consequence Chain

```text
EV-008 defines disruption
        ↓
Operational change is applied through the authorized graph write path
(node/edge status, capacity, operational parameter)
        ↓
EV-007 recomputes affected crowd state
(route availability, diversion, waiting, queue, flow, occupancy)
```

### 23.3 Example

```text
Disruption (EV-008):
    DISRUPTION_001 type GATE_CLOSURE, affected_nodes = ["GATE_01"]

Applied operational change:
    GATE_01 status = CLOSED
    EDGE_03, EDGE_04, EDGE_05 unusable (node closure overrides connected movement)

EV-007 consequences:
    affected groups → route_unavailable
    FLEXIBLE groups → diverted to an alternative route, or no_valid_route
    LIMITED / NONE groups → STOPPED, waiting_time accrues
    queue_size at the affected upstream node increases
    flow changes on the remaining usable edges
    overload may follow if occupancy exceeds holding capacity
```

### 23.4 Rules

* EV-007 never defines disruption lifecycle or severity.
* EV-007 never writes graph status; it consumes the status that the authorized write path produced.
* Disruption context may be used to know that an unavailability is expected to be temporary, but severity is never converted into a crowd impact value by EV-007.
* If the operational change is reverted (a disruption resolves and status is restored), EV-007 re-evaluates the affected scope on the resulting configuration change. Queues and occupancy are not reset — they continue to evolve from their current values, consistent with EV-008 §20.

---

## 24. Validation and Failure Handling

### 24.1 Validation Rules

| Condition | Handling |
| --- | --- |
| Missing or empty group `id` | Reject the group, emit `invalid_group` |
| Duplicate group `id` | Reject the new group, emit `invalid_group` |
| `population` missing, non-integer, or negative | Reject the group, emit `invalid_group` |
| `average_speed` missing or not greater than zero | Reject the group, emit `invalid_group` |
| `current_location` missing, or not one of the two location kinds | Reject the group, emit `invalid_group` |
| `destination` missing | Reject the group, emit `invalid_group` |
| `route_flexibility` not one of `NONE`, `LIMITED`, `FLEXIBLE` | Reject the group, emit `invalid_group` |
| `state` not one of the five MVP states | Reject the group, emit `invalid_group` |
| Unknown node or edge reference in location, destination or route | Reject the update that references it, keep prior state, emit `invalid_reference` |
| Route does not chain (`edge.to` ≠ next `edge.from`) | Reject the route as unusable, emit `route_unavailable` |
| Destination node `CLOSED` or otherwise unusable | Group becomes `STOPPED`, emit `destination_unavailable` |
| Preferred route unusable | Apply §16.5 by flexibility; emit `route_unavailable` |
| No usable path exists | Group becomes `STOPPED`, emit `no_valid_route` |
| `capacity` or `throughput_capacity` is `null` | Treat as unconstrained for that field (EV-006 §9.5). Affected metrics report `null`; utilization-based thresholds do not apply. Not an error. |
| `capacity = 0` | Do not divide. Utilization is `null`; overload is evaluated directly (§12.1). |
| Impossible movement (edge `CLOSED`, next node unavailable, no room, no service) | Do not transfer. Apply `WAITING` or `STOPPED`, emit the applicable event. |
| Sensor/manual update malformed, negative where not permitted, or referencing an unknown target | Reject the update, keep prior state, emit `sensor_update_rejected` |
| Occupancy update would produce a negative value | Clamp to `0`, emit `accounting_warning` |

### 24.2 Failure Isolation

* An invalid crowd group is isolated. It is rejected and the rest of the model continues to run.
* A single invalid or stalled group must not stop the event model, and must not stop updates for other groups, nodes or edges.
* Failures are reported as warnings and events, not as silent corrections.
* A failure that prevents the model from operating at all — for example a graph reference that cannot be resolved at initialization — is fatal for that run and is reported as such.

---

## 25. Domain Boundary

### 25.1 EV-007 Owns

* crowd group representation and lifecycle
* crowd state and state transitions
* movement, effective speed and movement rate
* accumulation
* actual flow
* occupancy
* density and `density_state`
* utilization (holding, service and flow)
* queue formation, queue size, queue growth and queue service
* waiting time and travel time
* throughput and arrival rate
* overload detection
* group merge and split
* execution of routing and diversion decisions, including the local availability fallback
* crowd threshold evaluation
* crowd metrics and crowd events
* application of crowd sources and runtime corrections

### 25.2 EV-007 Does Not Own

| Concern | Owner |
| --- | --- |
| Graph topology, edges, direction, capacity, status | EV-006 |
| Graph state write path and authorization | Operational layer |
| Disruption identity, type, severity, lifecycle | EV-008 |
| Future prediction and forecasting | EV-009 |
| Strategic routing, interventions, constraints, ranking | EV-010 |
| Scenario execution and time progression | EV-011 |
| Approval of operational changes | Operational layer |

### 25.3 Explicit Non-Behaviours

* EV-007 does not write graph status.
* EV-007 does not close nodes or edges, even on overload.
* EV-007 does not own or modify disruptions.
* EV-007 does not own prediction and does not require it.
* EV-007 does not perform strategic optimization or global route assignment.
* EV-007 does not use individual agents or microscopic physics.

---

## 26. MVP Requirements

| Requirement | MVP behaviour |
| --- | --- |
| Representation | Aggregate crowd groups; no individual agents |
| Group schema | `id`, `population`, `current_location`, `destination`, `entry_source`, movement characteristics, routing (§4.2) |
| Location | A group is located on a node **or** on an edge |
| States | `MOVING`, `WAITING`, `STOPPED`, `ARRIVED`, `DIVERTED` with defined transitions |
| Speed unit | Metres per second, single canonical unit |
| Movement rate | People/minute, derived from speed, distance and configured flow limits |
| Flow | Actual realized crowd flow, people/minute, owned by EV-007 |
| Accumulation | Conservation-style update with separately recorded source/sink/correction adjustments |
| Conservation | Physical propagation conserves population; no strict global conservation is required |
| Holding capacity | Node `capacity`, people, used only as a holding limit |
| Service rate | Node `throughput_capacity`, people/minute, used for queue service |
| Flow capacity | Edge `capacity`, people/minute, used for flow limits |
| Utilization | Holding (node), service (node) and flow (edge), dimensionless, with explicit `null` and zero handling |
| Density | Load ratio from utilization, dimensionless, computable from available inputs; `density_state` classification |
| Overload | Strict capacity violation, with detection, events and explicit non-closure of the graph |
| Queues | Formation, FIFO service, growth and drain, with `queue_size` as a subset of occupancy |
| Waiting time | Seconds, group and node scope, current and window average |
| Travel time | Seconds, actual measured movement time, distinct from configured edge traversal time |
| Throughput | People/minute, realized, distinguished from configured capacity |
| Routing | Preferred route, route flexibility, assigned route, diversion, unavailable route, no valid route |
| Merge / split | Supported, with exact population conservation within each operation |
| Sources | Manual groups, entrance-generated demand, live/sensor data; any non-empty subset is sufficient |
| Thresholds | Fully configurable per node, edge or scenario; never hardcoded |
| Updates | Event-driven and continuous; no fixed global tick required |
| Determinism | Deterministic given the same state, event sequence and configuration |
| Simulation | Executed by EV-011; EV-007 does not redefine scenario or time mechanics |
| Failure handling | Structured rejection and isolation; one invalid group does not stop the model |

---

## 27. Example

This example uses the graph defined in EV-006 §18.

### 27.1 Configuration Used

| Threshold | Value |
| --- | --- |
| `slowdown_start_utilization` (`L0`) | `0.70` |
| `speed_slowdown_coefficient` (`k`) | `0.50` |
| `min_speed_factor` (`F_min`) | `0.20` |
| `density_medium_threshold` | `0.50` |
| `density_high_threshold` | `0.80` |
| `density_critical_threshold` | `1.00` |
| `utilization_warning_threshold` | `0.90` |

### 27.2 State at t = 19:00:00

| Group | Population | Location | State | Destination | `average_speed` |
| --- | --- | --- | --- | --- | --- |
| `CG_01` | 500 | `EDGE_01` | `MOVING` | `ZONE_01` | 1.30 m/s |
| `CG_02` | 300 | `EDGE_03` | `MOVING` | `ZONE_01` | 1.40 m/s |
| `CG_03` | 430 | `CHECKPOINT_01` | `WAITING` | `ZONE_01` | 1.10 m/s |
| `CG_04` | 170 | `EDGE_05` | `STOPPED` | `ZONE_01` | 1.20 m/s |

Why the states are what they are:

* `CG_01` and `CG_02` are traversing open edges, so they are `MOVING`.
* `CG_03` entered `CHECKPOINT_01` but its onward service is saturated, so it queues: `WAITING`.
* `CG_04` reached the end of `EDGE_05` and `CHECKPOINT_01` cannot accept anyone, because `CHECKPOINT_01` occupancy is at its holding capacity, so `CG_04` holds at the edge end: `STOPPED`.

### 27.3 Occupancy Accounting

| Location | Occupancy | Breakdown |
| --- | --- | --- |
| `CHECKPOINT_01` | 430 people | `CG_03`, of which `queue_size = 430` |
| `EDGE_01` | 500 people | `CG_01` |
| `EDGE_03` | 300 people | `CG_02` |
| `EDGE_05` | 170 people | `CG_04` |
| All other nodes and edges | 0 people | — |
| **Global** | **1400 people** | 500 + 300 + 430 + 170 |

`global_population = Σ node occupancy + Σ edge occupancy = 430 + 970 = 1400`, matching the sum of group populations.

### 27.4 Movement Rate

For `CG_01` on `EDGE_01` (`distance = 260 m`):

```text
to_node = ROAD_01, capacity = null  →  load = 0  →  speed_factor = 1
v_eff                  = 1.30 * 1 = 1.30 m/s
rate_speed             = 60 * 500 * 1.30 / 260 = 150.0 people/minute
flow_budget            = min(EDGE_01.capacity 400, ROAD_01.throughput_capacity null) = 400
movement_rate(CG_01)   = min(150.0, 400) = 150.0 people/minute
actual_edge_travel_time = 260 / 1.30 = 200.0 seconds   (configured current_time = 210 s)
```

For `CG_02` on `EDGE_03` (`distance = 180 m`, `to_node = GATE_01`, occupancy 0 of 5000):

```text
load = 0  →  speed_factor = 1  →  v_eff = 1.40 m/s
rate_speed           = 60 * 300 * 1.40 / 180 = 140.0 people/minute
flow_budget          = min(EDGE_03.capacity 300, GATE_01.throughput_capacity 600) = 300
movement_rate(CG_02) = min(140.0, 300) = 140.0 people/minute
actual_edge_travel_time = 180 / 1.40 = 128.6 seconds   (configured current_time = 180 s)
```

For `CG_04`, state is `STOPPED`, so `movement_rate = 0 people/minute`. Its effective speed is reduced because `CHECKPOINT_01` is over capacity:

```text
load            = occupancy 430 / capacity 400 = 1.075
speed_factor    = clamp(1 - 0.50 * (1.075 - 0.70), 0.20, 1) = clamp(0.8125) = 0.8125
v_eff           = 1.20 * 0.8125 = 0.975 m/s      (applies if it starts moving)
```

### 27.5 Metrics at t = 19:00:00

**`CHECKPOINT_01`**

```text
occupancy             = 430 people
queue_size            = 430 people
capacity              = 400 people        →  room = max(0, 400 - 430) = 0  →  inflow blocked
holding_utilization   = 430 / 400 = 1.075          →  overload = true       (emit overload)
density               = 1.075                       →  density_state = CRITICAL
throughput_capacity   = 120 people/minute
queue_service order   = CG_03
queue_wait            = 60 * 430 / 120 = 215 seconds  (3 min 35 s)
```

**`EDGE_05`** (`CG_04` held)

```text
occupancy       = 170 people
flow            = 0 people/minute          (CG_04 is STOPPED)
flow_utilization= 0 / 240 = 0.0            →  overload = false
```

**Edges carrying flow**

| Edge | Occupancy | Flow (people/min) | Capacity (people/min) | `flow_utilization` | `density_state` |
| --- | --- | --- | --- | --- | --- |
| `EDGE_01` | 500 | 150.0 | 400 | 0.375 | `LOW` |
| `EDGE_03` | 300 | 140.0 | 300 | 0.467 | `LOW` |
| `EDGE_05` | 170 | 0.0 | 240 | 0.000 | `LOW` |

Events emitted at 19:00:00:

```text
overload              scope=NODE  target=CHECKPOINT_01  occupancy=430  capacity=400
high_density          scope=NODE  target=CHECKPOINT_01  density=1.075  state=CRITICAL
```

### 27.6 Interval t = 19:00:00 → 19:01:00 (`Δt = 60 s`)

`CHECKPOINT_01` queue service:

```text
service_people      = throughput_capacity 120 * 60 / 60 = 120 people
FIFO order          = [CG_03]
granted(CG_03)      = min(120, EDGE_06.capacity 180 * 60/60 = 180, population 430) = 120
CG_03 splits        → CG_03 (310 people, CHECKPOINT_01, WAITING)
                    → CG_05 (120 people, EDGE_06, MOVING)
```

`CG_04` at the `EDGE_05` end:

```text
room(CHECKPOINT_01) after service = max(0, 400 - 310) = 90 people
admitted(CG_04)                   = min(170, 90) = 90 people
CG_04 splits                      → CG_04 (80 people, EDGE_05, STOPPED)
                                  → CG_06 (90 people, CHECKPOINT_01, WAITING)
```

State after the interval:

| Location | Occupancy | Queue | `holding_utilization` | `density_state` | `overload` |
| --- | --- | --- | --- | --- | --- |
| `CHECKPOINT_01` | 400 | 400 | 1.000 | `CRITICAL` | **false** |
| `EDGE_05` | 80 | 0 | — | — | — |
| `EDGE_06` | 120 | 0 | — | — | — |

This is exactly the `utilization = 1` case from §10.3: the node is **at** capacity, so `density_state` is `CRITICAL`, but overload requires strictly greater than capacity, so `overload` is `false`. The transition emits:

```text
overload_cleared      scope=NODE  target=CHECKPOINT_01  occupancy=400  capacity=400
queue_increasing      scope=NODE  target=CHECKPOINT_01  queue_size=400
```

Population after the interval:

```text
nodes: CHECKPOINT_01 400
edges: EDGE_01 500 + EDGE_03 300 + EDGE_05 80 + EDGE_06 120 = 1000
global_population = 1400      (unchanged: only physical propagation occurred, no adjustments)
```

Travel time accumulation along the full route `EDGE_01`, `EDGE_03`, `EDGE_05`, `EDGE_06`, for a group travelling at a constant `1.30 m/s` and never held (movement time only):

```text
EDGE_01: 260 / 1.30 = 200.0 s
EDGE_03: 180 / 1.30 = 138.5 s
EDGE_05:  40 / 1.30 =  30.8 s
EDGE_06:  70 / 1.30 =  53.8 s
travel_time = 423.1 seconds
```

If that group also queued at `CHECKPOINT_01` for 215 seconds, its `journey_time` would be `423.1 + 215 = 638.1 seconds`. The difference between `travel_time` and `journey_time` is exactly `waiting_time`.

### 27.7 Disruption Consequence at t = 19:05:00

```text
EV-008:   DISRUPTION_001  type=GATE_CLOSURE  affected_nodes=["GATE_01"]  severity=HIGH
Applied:  GATE_01.status = CLOSED   (authorized graph write path; EV-007 does not do this)
```

EV-007 consequence calculation:

| Effect | Detail |
| --- | --- |
| `EDGE_03`, `EDGE_04`, `EDGE_05` unusable | Node closure overrides connected movement availability (EV-006 §7.4) |
| `CG_02` on `EDGE_03` | Completes the edge, then cannot enter `GATE_01` → `STOPPED` at the `EDGE_03` end |
| Route availability | The only route to `ZONE_01` passes through `GATE_01`, so no usable path exists |
| Warning | `route_unavailable` for `CG_02`; `no_valid_route` when no alternative exists |
| Flow | `EDGE_03` flow → 0; `EDGE_01` inflow to `ROAD_01` continues; `EDGE_05` remains 0 |
| Queue | `CHECKPOINT_01` keeps draining at 120 people/min while no new inflow arrives |
| Overload | Not caused by the disruption itself; `CHECKPOINT_01` overload state is unchanged by the closure |
| Waiting | `waiting_time` accrues for `CG_02` while `STOPPED` |

Note what EV-007 did **not** do: it did not read `severity` as a crowd impact, did not define the disruption's lifecycle, did not close or reopen `GATE_01`, and did not predict how long the closure would last. If the closure is later reverted and `GATE_01` reopens, EV-007 re-evaluates the affected scope and `CG_02` resumes from its current held position.

---

## 28. Architectural Summary

EV-007 is the crowd state and execution layer. It represents aggregate crowd groups, computes crowd movement and crowd metrics, executes routing and diversion decisions supplied by higher-level intelligence, and reports the resulting crowd state.

Key invariants:

* People are represented as **aggregate crowd groups**, never as individual agents.
* A group is located on a node **or** on an edge, and is counted at exactly one location.
* `queue_size` is a **subset** of node `occupancy`, so queues are never double counted.
* Speed has one canonical unit — **metres/second**. Population and occupancy are people. Flow, throughput and movement rate are people/minute. Waiting and travel time are seconds.
* Node `capacity` is a holding limit in people; node `throughput_capacity` is a service rate in people/minute; edge `capacity` is a flow capacity in people/minute. These are never conflated.
* Accumulation conserves population through physical propagation, while sources, sinks, sensor corrections, manual adjustments and scenario injections are recorded separately as adjustments. MVP does not require strict global conservation.
* Utilization is explicit at three scopes — holding and service at nodes, flow at edges — with defined behaviour for `null` capacity, zero capacity, and utilization below, equal to, and above `1`.
* Density is a dimensionless **load ratio** derived from utilization, because EV-006 defines no node area. A physical `people/m²` density would require EV-006 to expose an area field.
* Overload is a **strict capacity violation**, not simply high density. Detection emits events, blocks node inflow, drains node outflow, and never closes the graph.
* Queues form when onward service is saturated, are served deterministically in FIFO order, grow by arrivals minus departures, and drain when service outpaces demand.
* Waiting time and travel time are published in seconds and are consumed by EV-009, EV-010 and EV-011. EV-007 publishes current and realized values; forecasting belongs to EV-009.
* Routing is executed, not invented: preferred route, assigned route, route flexibility, diversion, unavailable route and no valid route all have defined behaviour, and the automatic fallback for flexible groups is a local availability rule rather than strategic optimization.
* Merge and split are supported and conserve population exactly within each operation.
* Thresholds are configuration at node, edge or scenario scope, never hardcoded.
* The model is event-driven and continuous, deterministic, and does not require a universal fixed tick.
* EV-007 never writes graph status, never owns disruptions, never owns prediction, and never performs strategic optimization.
