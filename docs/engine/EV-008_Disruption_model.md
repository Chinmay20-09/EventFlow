# EV-008 — Disruption Model

**Document ID:** EV-008
**Domain:** Disruption
**Status:** MVP Specification
**Depends On:** EV-006 Graph Model (required for entity references)
**Consumed By:** EV-009 Prediction, EV-010 Optimization, EV-011 Simulation
**Applied By:** Operational layer (authorization and application of approved graph changes)

**Purpose:** Define how EventFlow represents operational disruptions, their affected graph elements, lifecycle, severity, and propagation into the rest of the system.

---

## 1. Purpose

The Disruption Model represents events or conditions that cause normal event operations to change.

The model provides a structured representation of **what changed, where it changed, how serious it is, whether it is still active, and what operational change it requires**.

The Disruption Model does not itself:

* mutate graph state
* calculate crowd metrics
* predict future conditions
* select or rank interventions
* advance simulation time

It is a **declaration layer**: it declares the disruption, declares the operational change it requires, and records the outcome of that change once the authorized operational layer has applied it.

---

## 2. Scope

### 2.1 In Scope

* disruption identity and type
* affected graph entities (nodes and edges)
* severity classification
* lifecycle state
* timing (detection, operational start, expected duration, resolution)
* the operational effect a disruption requires
* validation and failure behaviour
* idempotency of disruption records
* the boundary between a disruption and the operational change it causes

### 2.2 Out of Scope

| Concern | Owner |
| --- | --- |
| Graph topology, edge direction, capacity, authoritative status | EV-006 |
| Applying graph changes, authorization, approval | Operational layer |
| Crowd occupancy, flow, queues, waiting, travel, density, utilization, overload | EV-007 |
| Future forecasting, recovery-time estimation | EV-009 |
| Strategy generation, constraints, ranking | EV-010 |
| Scenario execution and time progression | EV-011 |

---

## 3. Core Concepts

### 3.1 What Counts as a Disruption

A disruption is **any event or condition that materially changes normal event operation.**

```text
Normal Condition
       │
       ▼
   Disruption
       │
       ├── What happened?
       ├── Where?
       ├── How severe?
       ├── When?
       └── Is it still active?
```

Materially changing normal operation includes:

* physical closures
* gate closures
* road closures
* checkpoint failures
* access restrictions
* infrastructure failures
* transport disruptions
* weather events
* operational crowd conditions
* other materially relevant external or internal events

The key criterion is:

> The condition must have a material operational impact on the EventFlow environment.

### 3.2 What Is Not a Disruption

The definition must not be so broad that every crowd metric automatically becomes a disruption.

The following are **not** disruptions by themselves:

* a crowd metric crossing a threshold (density, utilization, queue size, waiting time, overload)
* a predicted future condition
* a proposed or approved intervention
* a normal scheduled event operation (planned egress, scheduled gate opening)
* an external event that has no material effect on the EventFlow environment

A crowd-driven condition becomes a disruption **only when it is declared as one** by an authorized source, and only when that declaration names the affected graph entities. Crowd metrics remain owned by EV-007 and are not stored in EV-008 (see §12).

### 3.3 Disruption vs Crowd Condition

A disruption and a crowd condition are related but are not the same thing.

**Disruption** — describes the condition that changed normal operation.

**Crowd Model** — describes what the crowd is doing as a result.

```text
Security checkpoint failure
          ↓
       Disruption
          ↓
Checkpoint throughput_capacity reduced
          ↓
   Resulting graph configuration
          ↓
       Crowd Model
          ↓
Queue increases
          ↓
Density increases
          ↓
Movement slows
```

The Disruption Model declares the checkpoint failure and the operational change it requires. It does not calculate the queue, the density or the slowdown.

### 3.4 Disruption vs Graph State

A disruption is not a graph fact.

```text
EV-008 Disruption Model
    declares:  GATE_CLOSURE, affected_nodes = ["GATE_01"], status = ACTIVE
          │
          ▼
Operational layer
    authorizes and applies the change
          │
          ▼
EV-006 Current Graph
    GATE_01.status = CLOSED      ← this is the authoritative operational fact
          │
          ▼
EV-007 Crowd Model
    observes CLOSED, recalculates crowd consequences
```

EV-006 remains responsible for representing graph state. EV-008 remains responsible for describing why the operational condition changed. See §11.

### 3.5 Central Principle

> **Disruption describes the change; Crowd observes the operational consequence; Prediction estimates the future consequence; Optimization decides what could be changed; the operational layer applies what is authorized.**

---

## 4. Canonical Disruption Schema

This is the single canonical MVP schema. There is no second representation.

| Field | Type | Required | Unit | Allowed values | Meaning | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | string | Required | — | `DISRUPTION_<NUMBER>` | Stable disruption identifier | Must be present, match the format, and be unique |
| `type` | enum | Required | — | see §5 | Category of disruption | Must be one of the controlled MVP types |
| `affected_nodes` | string[] | Required | — | EV-006 node `id` values | Graph nodes affected by the disruption | Every referenced node must exist; emptiness rules in §6.3 |
| `affected_edges` | string[] | Required | — | EV-006 edge `id` values | Graph edges affected by the disruption | Every referenced edge must exist; emptiness rules in §6.3 |
| `severity` | enum | Required | — | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | Seriousness/priority of the disruption itself | Must be one of the four levels; see §7 |
| `start_time` | timestamp | Required | ISO-8601 UTC | valid timestamp | When the disruption began affecting operations, or was detected as beginning | Must parse as a valid timestamp |
| `expected_duration` | integer | Optional | **seconds** | ≥ 0 | Operational expectation of how long the disruption will last | Non-negative integer. Not a prediction; see §9 and §17 |
| `status` | enum | Required | — | `DETECTED`, `ACTIVE`, `RESOLVED` | Current lifecycle state | Must be one of the three states; transitions per §8 |
| `detected_at` | timestamp | Optional | ISO-8601 UTC | valid timestamp | When the system or an operator identified the disruption | Defaults to `start_time` when absent |
| `effect_started_at` | timestamp | Optional | ISO-8601 UTC | valid timestamp | When the first authorized operational effect was applied | Should equal the earliest `applied_at` across this disruption's effects (§10) |
| `resolved_at` | timestamp | Optional | ISO-8601 UTC | valid timestamp | When the disruption became `RESOLVED` | Set by the transition to `RESOLVED`; see §8 and §9 |
| `source` | enum | Optional | — | `OPERATOR`, `SENSOR`, `CROWD`, `EXTERNAL_DATA`, `SIMULATION` | Origin of the disruption record | Must be one of the listed sources; see §13 |
| `operational_effects` | array | Optional | — | `OperationalEffect[]` | Operational changes this disruption requires | Each entry validated per §10 |

### 4.1 Derived Values

| Derived value | Definition | Unit |
| --- | --- | --- |
| `actual_duration` | `resolved_at - start_time`, when both are present | seconds |
| `is_confirmed_applied` | `effect_started_at` is set, or at least one effect has `effect_status = APPLIED` | boolean |

Derived values are computed on read. They are not stored.

### 4.2 Field Skeleton

Shapes and requirements only. The complete worked example is in §27.1.

```text
Disruption
├── id                    string, required          "DISRUPTION_<NUMBER>"
├── type                  enum, required            one of the nine types (§5)
├── affected_nodes        string[], required        EV-006 node ids (may be empty per §6.3)
├── affected_edges        string[], required        EV-006 edge ids (may be empty per §6.3)
├── severity              enum, required            LOW | MEDIUM | HIGH | CRITICAL
├── start_time            timestamp, required       ISO-8601 UTC
├── expected_duration     integer, optional         seconds, >= 0
├── status                enum, required            DETECTED | ACTIVE | RESOLVED
├── detected_at           timestamp, optional       ISO-8601 UTC
├── effect_started_at     timestamp, optional       ISO-8601 UTC
├── resolved_at           timestamp, optional       ISO-8601 UTC
├── source                enum, optional            OPERATOR | SENSOR | CROWD | EXTERNAL_DATA | SIMULATION
└── operational_effects   OperationalEffect[], optional   see §10.2

OperationalEffect
├── target_type           enum, required            NODE | EDGE | EVENT
├── target_id             string | null, required    null only when target_type = EVENT
├── parameter             enum, required            status | capacity | throughput_capacity | restriction
├── previous_value        any | null, required
├── proposed_value        any, required
├── applied_value         any | null, required       null until applied
├── applied_at            timestamp | null, required null until applied
└── effect_status         enum, required            PROPOSED | APPLIED | REJECTED | SUPERSEDED
```

`expected_duration` is expressed in **seconds** (`1200` seconds = 20 minutes), consistent with the second-based durations used by EV-006 and EV-007.

---

## 5. Disruption Types

The MVP uses a controlled enum of nine types. No additional types are introduced in MVP.

| `type` | What changed | Typically affects | Empty `affected_nodes` and `affected_edges` allowed? |
| --- | --- | --- | --- |
| `GATE_CLOSURE` | A gate is unavailable | A `GATE` node | No |
| `ROAD_CLOSURE` | A road or approach link is unavailable | A `ROAD` node and/or approach edges | No |
| `CHECKPOINT_FAILURE` | A screening or verification point failed or degraded | A `CHECKPOINT` node | No |
| `ACCESS_RESTRICTION` | Authorized access is limited | Nodes and/or edges | No |
| `INFRASTRUCTURE_FAILURE` | Venue infrastructure failed | Nodes and/or edges | No |
| `TRANSPORT_DISRUPTION` | Public transport access is affected | A `TRANSIT` node | **Yes** — when the effect is applied to arrival demand rather than to the graph |
| `WEATHER_EVENT` | Weather affects access or movement | Nodes and/or edges | **Yes** — when the condition affects operations without a single identifiable graph entity (for example area-wide rain) |
| `CROWD_OPERATIONAL_CONDITION` | A crowd-driven operational condition has been declared | Nodes and/or edges | No — a declaration must name the affected entities |
| `OTHER` | A material operational change not covered above | Any | **Yes** — when the operational effect is applied outside the graph |

The taxonomy expands in future versions as EventFlow encounters additional operational scenarios. The important requirement is that every disruption identifies a meaningful operational change.

---

## 6. Affected Entity Model

### 6.1 References

```text
affected_nodes = [ "<node id>", ... ]     EV-006 node identifiers
affected_edges = [ "<edge id>", ... ]     EV-006 edge identifiers
```

* Identifiers are EV-006 identifiers. EV-008 defines no entities of its own.
* An identifier is valid only if it exists in the graph the disruption is being applied against (the Current Graph for live operation).
* EV-008 does not allow arbitrary geographic objects, coordinates, polygons or free-text locations.
* References are never invented, corrected or silently dropped. An unknown reference blocks the disruption (see §21).

### 6.2 Node-Only, Edge-Only, or Both

| Shape | Example | Notes |
| --- | --- | --- |
| **Node-only** | `affected_nodes = ["GATE_01"]`, `affected_edges = []` | Sufficient for closures that the graph already propagates. Under EV-006 §7.4, closing a node makes its connected edges unusable, so those edges do not need to be listed. |
| **Edge-only** | `affected_nodes = []`, `affected_edges = ["EDGE_03", "EDGE_04"]` | Used when the connection itself is affected but its endpoint nodes remain usable. |
| **Both** | `affected_nodes = ["ROAD_01"]`, `affected_edges = ["EDGE_03"]` | Used when a node and specific connections are affected. |

A disruption may affect many entities. Listing a node does not oblige the disruption to list its connected edges, and listing an edge does not oblige it to list its endpoint nodes.

### 6.3 Emptiness Rules

* `affected_nodes` and `affected_edges` are both required fields and may be empty arrays.
* **At least one of them must be non-empty**, unless the disruption `type` explicitly permits an external-only representation (§5).
* For the types marked "Yes" in §5, both lists may be empty only when the operational effect is applied outside the graph (for example to arrival demand) or when the disruption is monitored with no graph change.
* A disruption with both lists empty for any other type is invalid.

---

## 7. Severity

### 7.1 Levels

The MVP uses four severity levels:

| Level | Meaning |
| --- | --- |
| `LOW` | Limited operational effect |
| `MEDIUM` | Meaningful operational degradation requiring attention |
| `HIGH` | Significant disruption affecting crowd movement or important infrastructure |
| `CRITICAL` | Severe disruption requiring immediate operational attention |

### 7.2 Semantics

Severity describes **the disruption itself** — its seriousness and its priority for operational attention. It is a classification, not a measurement, and EV-008 never converts it into a numeric quantity.

Severity is **not** a prediction of future crowd impact and is **not** an operational value.

### 7.3 Severity Must Not Be Transformed Into

Severity MUST NOT directly become any of the following. Each of these is produced by its owner from its own inputs.

| Concern | Owner | Why severity must not substitute for it |
| --- | --- | --- |
| Crowd density | EV-007 | Density is computed from occupancy and capacity |
| Crowd impact / consequences | EV-007 (observed), EV-009 (predicted) | Impact depends on where the change lands in the network, not on the severity label |
| Graph capacity | EV-006, via an applied operational effect | Capacity is a configured value |
| Movement slowdown | EV-007 | Slowdown is computed from crowd load and effective speed |
| Prediction probability | EV-009 | Forecasting is EV-009's responsibility |
| Optimization score | EV-010 | Ranking is EV-010's responsibility |

### 7.4 Severity vs Impact

Severity and impact are intentionally separate concepts.

```text
Low-severity road restriction
          ↓
Large impact because it affects
the only available access route
```

EV-008 records severity. EV-007, EV-009 and downstream intelligence determine observed and predicted impact.

Consumers may use severity as **context** — for triage, for reporting, or as one input among many in their own logic — but no consumer may treat it as a physical quantity, and EV-008 never derives a graph value, crowd value or optimization value from it.

---

## 8. Lifecycle

### 8.1 States

The MVP uses exactly three lifecycle states:

| State | Meaning |
| --- | --- |
| `DETECTED` | The system or an operator has identified a potential disruption. It is **not necessarily operationally applied** yet. Operational effects may exist as `PROPOSED`. |
| `ACTIVE` | The disruption is confirmed to be currently affecting operations. |
| `RESOLVED` | The disruption is no longer active. Terminal for that disruption `id`. |

### 8.2 Allowed Transitions

```text
DETECTED ──────► ACTIVE
    │              │
    │              │
    └──────────────┴──────► RESOLVED
```

| Transition | Allowed | Meaning |
| --- | --- | --- |
| `DETECTED` → `ACTIVE` | Yes | The disruption is confirmed as operationally affecting the event |
| `DETECTED` → `RESOLVED` | Yes | Withdrawn before it became active — a false detection, a false alarm, or a condition that cleared during review |
| `ACTIVE` → `RESOLVED` | Yes | The disruption is no longer active |
| `RESOLVED` → anything | No | `RESOLVED` is terminal |
| `ACTIVE` → `DETECTED` | No | Lifecycle never moves backwards |
| A state → the same state | Not a transition | Treated as an idempotent update (§20), not a lifecycle change |

A recurrence of the same operational condition is a **new disruption with a new `id`**. A resolved disruption is never reopened, so that history cannot be rewritten.

### 8.3 Invalid Transitions

An invalid transition is rejected deterministically:

* the disruption retains its previous `status`
* no operational effect is applied as a result of the rejected transition
* an `invalid_transition` event is emitted with the disruption `id`, the current state and the attempted state

### 8.4 Resolution Semantics

`RESOLVED` means only that **the disruption is no longer active**. It does not mean:

* queues have disappeared
* crowd conditions have normalized
* the graph has been automatically reopened, unless the operational layer applied that change
* all downstream consequences have disappeared

See §16.

---

## 9. Timing

### 9.1 Timestamps

| Field | Meaning | Unit / format |
| --- | --- | --- |
| `start_time` | When the disruption began affecting operations, or the best known estimate of that moment | ISO-8601 UTC |
| `detected_at` | When the system or an operator identified the disruption | ISO-8601 UTC |
| `effect_started_at` | When the first authorized operational effect was actually applied | ISO-8601 UTC |
| `resolved_at` | When the disruption became `RESOLVED` | ISO-8601 UTC |
| `expected_duration` | Operational expectation of how long the disruption will last | **seconds** |
| `actual_duration` | `resolved_at - start_time` (derived) | seconds |

These are four distinct concepts, and they are not interchangeable:

```text
start_time ─────────► effect_started_at ─────────► resolved_at
    │                        │                          │
 when it began        when the change            when it stopped
 or was detected      was actually applied        being active
 as beginning
```

### 9.2 Detection Time vs Operational Start

* `detected_at` is when the disruption was identified. It is usually after `start_time`, and may be earlier when a disruption is anticipated.
* `effect_started_at` is when the operational change was authorized and applied. It cannot precede `start_time` in a consistent record.
* `start_time` is required. `detected_at` and `effect_started_at` are optional; when `detected_at` is absent it is treated as equal to `start_time`.

### 9.3 Expected vs Actual Duration

**Expected duration and actual duration are different things.**

* `expected_duration` is an operational expectation, supplied when known. It is optional because many disruptions cannot be estimated accurately when first detected.
* `actual_duration` is derived from `resolved_at` and `start_time` once the disruption resolves.
* `expected_duration` is **not** a prediction produced by EV-009. It is metadata that EV-009 and EV-010 may consume as context (§17, §18).

A disruption that resolves early, late, or never within its expected duration is not an error. Divergence between the two values is information, not invalidity.

### 9.4 Timing Validation

| Condition | Severity |
| --- | --- |
| `start_time` missing or unparseable | Critical |
| `expected_duration` present and negative, or not an integer | Critical |
| `resolved_at` present and earlier than `start_time` | Critical |
| `resolved_at` present and earlier than `detected_at` | Warning |
| `effect_started_at` present and earlier than `start_time` | Warning |
| `detected_at` earlier than `start_time` (anticipated disruption) | Allowed, no warning |
| `expected_duration` absent | Allowed, no warning |
| `status = RESOLVED` and `resolved_at` absent | Warning (metadata quality) |

---

## 10. Operational Effects

### 10.1 Disruption Object vs Authorized Operational Effect

These are separate things and must not be conflated.

| Concept | Owner | Meaning |
| --- | --- | --- |
| **Disruption object** | EV-008 | What changed, where, how severe, when, and whether it is still active |
| **Authorized operational effect** | Operational layer | The graph configuration change that was authorized and applied as a result |

EV-008 **declares** the required change. The operational layer **applies** it. EV-008 does not mutate graph state and does not become a second Graph Model.

### 10.2 Effect Schema

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `target_type` | enum | Required | `NODE`, `EDGE`, or `EVENT` |
| `target_id` | string \| null | Required | The node or edge `id`; `null` only when `target_type = EVENT` |
| `parameter` | enum | Required | One of the EV-006 operational parameter keys (see §10.3) |
| `previous_value` | any \| null | Required | The value **observed in the state in which the effect is evaluated and applied** — the live Current Graph in live operation, or the scenario graph copy when the same effect is executed inside EV-011 (§10.6). It is therefore state-relative by design |
| `proposed_value` | any | Required | The value the disruption requires |
| `applied_value` | any \| null | Required | The value actually applied; `null` until applied |
| `applied_at` | timestamp \| null | Required | When it was applied, ISO-8601 UTC; `null` until applied |
| `effect_status` | enum | Required | `PROPOSED`, `APPLIED`, `REJECTED`, `SUPERSEDED` |

Ownership of the fields is split and explicit:

* EV-008 declares `target_type`, `target_id`, `parameter` and `proposed_value`.
* The operational layer supplies `previous_value` at proposal time and completes `applied_value`, `applied_at` and `effect_status` when it acts.
* `effect_status = PROPOSED` means the change has been declared but not applied. `APPLIED` means it is the authoritative result. `REJECTED` means the operational layer declined it. `SUPERSEDED` means it was applied but is no longer the authoritative value because another effect takes precedence (§10.5).

Effect records are never deleted. Superseded and rejected effects remain visible for traceability.

### 10.3 Supported Parameters

Parameters map exactly to the EV-006 operational parameter keys. No other parameters are supported in MVP.

| `parameter` | Valid `target_type` | Unit | Allowed values |
| --- | --- | --- | --- |
| `status` | `NODE`, `EDGE` | — | `OPEN`, `CLOSED` |
| `capacity` | `NODE` | **people** | integer ≥ 0 (holding capacity) |
| `capacity` | `EDGE` | **people/minute** | number ≥ 0 (flow capacity) |
| `throughput_capacity` | `NODE` | **people/minute** | number ≥ 0 (service rate) |
| `restriction` | `NODE`, `EDGE`, `EVENT` | — | a restriction label (represented as an accumulating set) |

Any other combination is invalid. Specifically:

* `throughput_capacity` is not valid on an `EDGE`.
* Node `capacity` is a holding capacity in people and is never expressed as a rate.
* Edge `capacity` is a flow capacity in people/minute and is never expressed as a count of people.

### 10.4 Application Flow

```text
EV-008 Disruption Model
    declares the disruption and its required operational change
    OperationalEffect: PROPOSED
          │
          ▼
Operational layer
    authorizes, reconciles conflicts, applies the change through the
    single authoritative graph write path (EV-006 §7.5)
          │
          ▼
EV-006 Current Graph
    holds the resulting authoritative value
          │
          ▼
OperationalEffect: APPLIED
    applied_value and applied_at recorded
          │
          ▼
EV-007 Crowd Model
    observes the resulting graph configuration and recalculates crowd state
```

EV-008 never performs the step labelled "Operational layer".

### 10.5 Deterministic Conflict Handling

When more than one active disruption proposes a change to the same `(target_type, target_id, parameter)`, the operational layer resolves it with one simple, deterministic rule. No priority engine is used.

**Rule: the most restrictive value wins while at least one contributing disruption is `ACTIVE`.**

| Parameter | Most restrictive |
| --- | --- |
| `status` | `CLOSED` is more restrictive than `OPEN` |
| `capacity` (NODE, people) | The lower value |
| `capacity` (EDGE, people/minute) | The lower value |
| `throughput_capacity` (NODE, people/minute) | The lower value |
| `restriction` | Restrictions accumulate as a set; each disruption contributes its own label |

Additional rules:

* **Identical proposals are idempotent.** Two disruptions proposing the same value produce one application. Both effects are recorded; neither is duplicated.
* **Severity never determines precedence.** Precedence is decided by the parameter values themselves. This keeps severity from becoming an operational quantity (§7.3).
* **Operator-confirmed changes are never automatically superseded.** A change whose provenance is `OPERATOR` requires explicit operator action (EV-006 §7.5).
* **Conflict is recorded, not hidden.** The losing effect is marked `SUPERSEDED`; its disruption keeps its identity, its lifecycle and its own history. Simultaneous disruptions are never merged into one object (§15).

**Withdrawal on resolution.** When a disruption becomes `RESOLVED`:

1. Its effects are withdrawn from the reconciliation set.
2. The operational layer recomputes the effective value from the remaining `ACTIVE` effects for that parameter.
3. If at least one effect remains, the most restrictive remaining value becomes authoritative.
4. If no effects remain, the value recorded in `previous_value` is restored — **but only where graph provenance still indicates the change came from a disruption.** Under EV-006 §7.5, the automatic revert is permitted only while the status source is still `DISRUPTION`. If an operator or an approved intervention has since rewritten the value, it is not automatically reverted.

### 10.6 What EV-008 Does Not Do With Effects

* EV-008 does not apply effects.
* EV-008 does not revert effects. It records that a disruption resolved; the operational layer performs the withdrawal.
* EV-008 does not calculate how large a capacity reduction "should" be. The value is supplied by the disruption source or by the operational layer.
* EV-008 does not convert severity into a proposed value.
* EV-008 does not model weather intensity numerically. A weather disruption proposes a concrete operational value (for example a reduced `throughput_capacity`); the mapping from weather to that value belongs to the source or the operational layer, not to EV-008.
* EV-008 does not apply effects inside a simulation. EV-011 applies scenario effects using these same semantics, against the scenario graph copy and the scenario registry, and never touches live provenance (EV-011 §11).

### 10.7 Restriction Semantics

A `restriction` is an operational constraint. It is not a physical quantity, not a crowd metric, and not a decision variable. It has exactly three roles, and they are never conflated:

| Role | Owner | Meaning |
| --- | --- | --- |
| **Declared** | EV-008 | A disruption states that a restriction applies, as an `OperationalEffect` with `parameter = restriction` |
| **Applied** | Operational layer → EV-006 Current Graph | The operational layer applies the effect; the Current Graph holds the resulting authoritative restriction set (EV-006 §7.5) |
| **Consumed** | EV-010 | Optimization reads the active restriction as a fixed constraint. It is never a decision variable, and Optimization may not relax or remove one that an active disruption applied (EV-010 §5.2, C7) |

Additional rules:

* **Restrictions accumulate as a set.** Each contributing disruption supplies its own label. Labels are never merged into a single value the way a numeric capacity conflict is resolved.
* **A restriction is never derived from crowd metrics.** High occupancy or a long queue does not create a restriction; those are EV-007 conditions reported to the operational layer (§12).
* **EV-008 does not apply, remove or weaken a restriction.** It declares and records. Application and withdrawal belong to the operational layer, exactly as for every other parameter.
* **In simulation**, restrictions follow the same declaration and application semantics inside the scenario registry and the scenario graph copy, and never touch live state or live provenance (EV-011 §7.1, §11).

---

## 11. Disruption and Graph State

### 11.1 Division of Responsibility

| Question | Answer owner |
| --- | --- |
| What changed, where, and why? | **EV-008** |
| What operational configuration is currently authoritative? | **EV-006 Current Graph** |
| Who applies the authorized change? | **Operational layer** |
| What are the crowd consequences? | **EV-007** |

EV-008 **does not directly mutate graph state.**

### 11.2 Explicit Flow

```text
EV-008:   GATE_CLOSURE
          affected_nodes = ["GATE_01"]
          status = ACTIVE
          effect: NODE GATE_01, parameter status, OPEN → CLOSED
                │
                ▼
Operational layer: applies the authorized change through the single write path
                │
                ▼
EV-006:   Current Graph
          GATE_01.status = CLOSED
          status_source = DISRUPTION
                │
                ▼
EV-007:   observes CLOSED
          connected edges become unusable (EV-006 §7.4)
          recalculates affected crowd state
```

### 11.3 Graph States

* The **Initial Graph** is never modified by a disruption. It is the locked pre-event baseline (EV-006 §11).
* A disruption affects only the **Current Graph**, and only through the authorized write path.
* Simulation applies disruption effects to an isolated scenario copy and never to either base graph (EV-006 §11.4, §19).

### 11.4 Provenance

EV-006 §7.5 defines a single authoritative write path with an optional `status_source` (`CONFIGURED`, `DISRUPTION`, `INTERVENTION`, `OPERATOR`). A disruption-caused change is recorded with `status_source = DISRUPTION`, which is what allows a later automatic withdrawal to be distinguished from an operator decision.

EV-008 does not write this value. It relies on the operational layer to maintain it.

---

## 12. Disruption and Crowd State

### 12.1 Ownership Boundary

EV-008 owns:

* disruption identity
* disruption type
* affected graph entities
* severity
* lifecycle
* timing
* disruption metadata
* the declared operational effect

EV-007 owns:

* occupancy
* flow
* queues
* waiting
* travel time
* density
* utilization
* overload
* crowd consequences of any kind

**EV-008 must not calculate crowd metrics.** This is a hard boundary, not a guideline.

### 12.2 How EV-007 Receives a Disruption

EV-007 does not read crowd-impact values from EV-008, because none exist there.

```text
             Disruption
                  │
                  ▼
      Declared operational effect
                  │
                  ▼
      Applied graph configuration
                  │
                  ▼
             Crowd Model
                  │
                  ▼
          Crowd consequences
```

EV-007 reacts to the **resulting graph configuration**. It may also be given disruption context — for example, that an unavailability is disruption-caused and has an expected duration — but it never receives severity as a crowd metric and never converts severity into one.

### 12.3 No Automatic Coupling

* A crowd metric crossing a threshold does not create a disruption.
* A disruption does not create crowd metrics.
* A disruption resolving does not reset, normalize or clear crowd state. Queues and occupancy continue evolving from their current values under the new configuration.
* A disruption never closes a node or edge by itself. The closure exists only once the operational layer has applied it.

---

## 13. Detection and Sources

Disruptions may originate from multiple sources. The MVP does not require a source-management system; `source` is metadata.

| `source` | Meaning | Notes |
| --- | --- | --- |
| `OPERATOR` | Declared by an authorized operator | The most direct source; may be raised before or during an event |
| `SENSOR` | Detected by venue sensors or monitoring | The sensor reports a condition; the disruption record is created on declaration |
| `CROWD` | A crowd condition reported by EV-007 and then declared as a disruption | EV-007 reports conditions such as overload or queue growth; a crowd condition becomes a disruption only when declared by an authorized source, and the declaration must name the affected graph entities |
| `EXTERNAL_DATA` | Ingested external feeds (transport, weather, surrounding roads) | Belongs in EV-008 only when it materially affects the event environment (§14) |
| `SIMULATION` | Scenario-only disruption | Confined to isolated scenario state; never part of the live disruption registry (§19) |

The `source` field is metadata and never changes lifecycle, severity or effect semantics.

---

## 14. External Disruptions

EventFlow may receive disruptions originating outside the venue.

```text
External Road Accident
        ↓
ROAD_01 and approach edges affected
        ↓
Reduced access capacity
        ↓
Crowd arrival pattern changes

Transit Disruption
        ↓
TRANSIT_01 affected
        ↓
Arrival demand changes
```

### 14.1 Inclusion Rule

An external event belongs in EV-008 **only when it materially affects EventFlow's operational environment**. An external event with no operational impact on the event is not a disruption and is not recorded.

### 14.2 Entity Requirements

External disruptions must not be forced to reference a graph entity when none is meaningful.

* When the external event affects a real graph entity — for example a `ROAD` node — the disruption references it and proposes an operational effect on it.
* When the external event affects operations without a single identifiable graph entity — for example a transit disruption that changes arrival demand rather than graph capacity — the disruption may have empty `affected_nodes` and `affected_edges`, provided its type permits it (§5) and its operational effect is applied outside the graph.
* When neither applies, the event is not a disruption.

### 14.3 Examples

| External event | Type | Typical affected entities | Typical operational effect |
| --- | --- | --- | --- |
| Surrounding road accident | `ROAD_CLOSURE` | `ROAD` node and/or approach edges | `status` → `CLOSED`, or reduced `capacity` |
| Public transport failure | `TRANSPORT_DISRUPTION` | `TRANSIT` node, or empty | `status` on the `TRANSIT` node, or an effect applied to arrival demand outside the graph |
| Heavy rain across the site | `WEATHER_EVENT` | Affected nodes/edges, or empty | Reduced `throughput_capacity`, reduced `capacity`, or no graph change |

---

## 15. Simultaneous Disruptions and Conflict Handling

### 15.1 Independence

Multiple disruptions may be active simultaneously.

```text
DISRUPTION_001   GATE_CLOSURE     affected_nodes = ["GATE_01"]
DISRUPTION_002   ROAD_CLOSURE     affected_edges = ["EDGE_03"]
DISRUPTION_003   TRANSPORT_DISRUPTION  affected_nodes = ["TRANSIT_01"]
```

Rules:

* Each disruption remains an **independent object** with its own `id`, lifecycle, severity and effects.
* Disruptions may affect overlapping nodes and edges.
* The system must **not silently merge** independent disruptions into one artificial object.
* Downstream domains evaluate the combined effect themselves; EV-008 does not compute a combined effect value.

### 15.2 Conflicting Operational Effects

When two active disruptions propose different values for the same graph parameter, the deterministic rule in §10.5 applies:

* the most restrictive value is authoritative while at least one contributing disruption is `ACTIVE`
* identical proposals are idempotent
* the losing effect is marked `SUPERSEDED` and retained
* severity plays no part in precedence
* operator-confirmed changes require explicit operator action to change

No priority engine, scoring system or conflict-resolution workflow is introduced in MVP. If an operational situation cannot be resolved by the rule above, it is escalated to the operational layer, which is the authority for applying graph changes.

### 15.3 Stable Ordering

For deterministic processing and display, simultaneous disruptions are ordered by `start_time`, then by `id`. This is a presentation and processing order only; it confers no precedence on any disruption.

---

## 16. Disruption Resolution

When a disruption is resolved:

```text
ACTIVE
  ↓
RESOLVED
```

Resolution means the disruption itself is no longer active. It does **not** automatically imply that crowd conditions have returned to normal, and it does not automatically normalize graph state beyond the withdrawal rule in §10.5.

```text
Gate reopened
     ↓
Disruption resolved
     ↓
Large queue still exists
     ↓
Crowd Model continues tracking queue
```

This distinction is critical for EventFlow. Two separate facts must be tracked:

| Fact | Owner | Meaning |
| --- | --- | --- |
| The disruption is no longer active | EV-008 | The operational cause has ended |
| The crowd has recovered | EV-007 | Queues have drained, density has fallen, flow has normalized |

A disruption may be `RESOLVED` while the crowd is still significantly degraded. Conversely, crowd conditions may normalize while the disruption remains `ACTIVE` — for example if people adapted and rerouted.

Graph state follows the operational layer, not the disruption record: closing a gate requires an applied effect, and reopening it requires either a withdrawal under §10.5 or an explicit authorized change.

---

## 17. Prediction Relationship

Prediction (EV-009) may consume **active disruptions** as input context for forecasting. Disruption information such as affected entities, `start_time`, `status` and `expected_duration` is useful input to a forecast.

EV-008 itself does not predict:

* future crowd conditions
* future congestion
* recovery time
* intervention outcomes

`expected_duration` is **operational expectation metadata**. It is not a prediction produced by EV-009, and it is not derived from EV-009. If EV-009 produces a forecast recovery time, that forecast is owned by EV-009 and is a separate value.

---

## 18. Optimization Relationship

Optimization (EV-010) may consume active disruptions and their operational effects as constraints and context — for example, treating a closed gate and a reduced checkpoint capacity as fixed conditions when generating candidate strategies.

EV-008 does not:

* generate strategies
* rank or score interventions
* optimize routes
* select interventions
* decide whether a disruption should be mitigated

Optimization proposes interventions through the same authorized path that disruptions use. Both are proposals; neither applies graph changes directly.

---

## 19. Simulation Relationship

Simulation (EV-011) may create hypothetical disruptions as scenario conditions.

```text
Scenario
   │
   ├── Gate closed at 19:00
   ├── Road blocked at 19:15
   └── Transport disruption at 19:30
```

Requirements:

* Scenario disruptions use the **same disruption model** as live disruptions. There is no separate simulation-only disruption format.
* Scenario disruptions are **identifiable as scenario-specific** — they are marked `source = SIMULATION` and live in the scenario's isolated disruption registry.
* Scenario disruptions are **isolated from live state**. They must not mutate the real disruption registry, the Initial Graph or the Current Graph (EV-006 §11.4).
* Ending a simulation discards the scenario disruptions; nothing is promoted into live state automatically.

EV-008 is **not** responsible for simulation time progression. Scheduling a disruption at 19:00 within a scenario, advancing time, and firing it at the right moment are EV-011's responsibilities.

---

## 20. Idempotency

A disruption is identified by its `id`. Delivery may be repeated, and the MVP must not create duplicates.

| Situation | Behaviour |
| --- | --- |
| Incoming record with an `id` that does not exist | New disruption is created |
| Identical record with an existing `id` | **No-op.** No second object, no duplicated effects, no lifecycle change |
| Existing `id` with additional or changed operational effects | Treated as an **update** to the existing record, subject to the lifecycle rules in §8 |
| Existing `id` with a changed `type` | Rejected as a conflicting update; the existing record is retained; a warning is emitted |
| An effect re-proposed with a `proposed_value` equal to the current authoritative value | No-op. The effect is recorded as `APPLIED` with no value change |
| A resolved disruption received again | No-op. `RESOLVED` is terminal; a recurrence is a new `id` (§8.2) |

Idempotency is keyed on the disruption `id` and on `(target_type, target_id, parameter)` for effects. No deduplication window, retry framework or message-id system is required in MVP.

---

## 21. Validation

Validation runs when a disruption is created or updated.

### 21.1 Critical Errors — Block Applying the Disruption

A disruption with any critical error is rejected. It is not stored and no operational effect is applied from it.

| Check | Condition |
| --- | --- |
| `id` valid and unique | Missing, empty, not matching `DISRUPTION_<NUMBER>`, or duplicating an existing `id` with a different `type` |
| `type` valid | Missing, or not one of the nine MVP types |
| `severity` valid | Missing, or not `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `status` valid | Missing, or not `DETECTED` / `ACTIVE` / `RESOLVED` |
| `affected_nodes` valid | Not an array, or contains a node `id` that does not exist in the graph |
| `affected_edges` valid | Not an array, or contains an edge `id` that does not exist in the graph |
| Entity references present | Both `affected_nodes` and `affected_edges` are empty for a type that does not permit an external-only representation |
| `start_time` valid | Missing or unparseable |
| `expected_duration` valid | Present and negative, or not an integer |
| `resolved_at` valid | Present and earlier than `start_time` |
| Lifecycle transition valid | A transition not permitted by §8.2 |
| `source` valid | Present and not one of the listed sources |
| Effect target valid | `target_id` missing, or not resolvable; or `target_id` non-null while `target_type = EVENT` |
| Effect parameter valid | Unknown parameter, or a parameter/`target_type` combination not in §10.3 |
| Effect value valid | A value outside the allowed set for its parameter, or a unit mismatch for the parameter and target type |

### 21.2 Warnings — Non-Blocking Metadata Quality Issues

| Check | Condition | Handling |
| --- | --- | --- |
| `expected_duration` absent | No estimate supplied | Warn only — many disruptions cannot be estimated when first detected |
| `resolved_at` absent on a `RESOLVED` disruption | Metadata gap | Warn only |
| Effect proposed but never applied | `effect_status = PROPOSED` and the disruption is `ACTIVE` | Warn — the declared change has not been applied |
| Effect applied while still `DETECTED` | An effect has `effect_status = APPLIED` but the disruption `status` is `DETECTED` | Warn — the lifecycle should be advanced to `ACTIVE`, since a disruption whose change has been applied is affecting operations |
| `effect_started_at` inconsistent | It does not match the earliest effect `applied_at` | Warn |
| Redundant entity reference | An affected node is already `CLOSED` for an unrelated reason, or a proposed value already equals the authoritative value | Warn — treated as an idempotent no-op under §20 |
| `detected_at` earlier than `start_time` | Anticipated detection | Allowed, no warning |
| `resolved_at` earlier than `detected_at` | Inconsistent record | Warn |
| Duplicate `id` with changed `type` | Conflicting update | Warn and reject the update (§20) |

### 21.3 No Silent Repair

Invalid references are **never** silently repaired, invented, corrected or dropped.

* An unknown node or edge reference blocks the whole disruption. It never degrades into a partial application.
* A malformed value is never coerced into a valid one.
* A rejected disruption is not stored, and no operational effect is applied from it.
* Every rejection is reported with the disruption `id`, the failing field and the reason.

---

## 22. Failure States

Failure handling is deterministic. Each failure produces the same outcome every time.

| Failure | Behaviour |
| --- | --- |
| **Invalid disruption** | Rejected. Not stored. No operational effect applied. Rejection reported with the failing field and reason. |
| **Unknown graph reference** | Critical. The disruption is rejected and its operational effects are not applied. The reference is never created or corrected. |
| **Conflicting operational effect** | Resolved by the deterministic most-restrictive rule (§10.5). Both disruptions keep their identity. The losing effect is marked `SUPERSEDED`. Nothing is merged or deleted. If the conflict is not resolvable by the rule, it is escalated to the operational layer. |
| **Malformed timing** | Critical when `start_time` is unparseable, when `expected_duration` is negative or non-integer, or when `resolved_at` precedes `start_time`. Other timing inconsistencies are warnings (§9.4). |
| **Duplicate `id`** | No second object is created. Identical content is a no-op; differing content is an update under §20. |
| **Update to a resolved disruption** | Rejected. `RESOLVED` is terminal. A recurrence is a new `id`. The existing record is retained unchanged. |
| **Invalid lifecycle transition** | Rejected. The prior `status` is retained. No effect is applied as a result. An `invalid_transition` event is emitted. |

---

## 23. Auditability

Each applied disruption is traceable through the following minimum contract. No enterprise audit system is required.

| Trace requirement | Where it is recorded |
| --- | --- |
| Disruption identity | `id`, `type`, `source` |
| Affected entities | `affected_nodes`, `affected_edges` |
| Severity | `severity` |
| Lifecycle and timing | `status`, `start_time`, `detected_at`, `effect_started_at`, `resolved_at`, `expected_duration`, derived `actual_duration` |
| What was proposed | Each effect's `parameter`, `previous_value`, `proposed_value` |
| What was applied | Each effect's `applied_value`, `applied_at`, `effect_status` |
| Resulting authoritative configuration | The Current Graph value, which equals `applied_value` for the effect that is authoritative for that `(target_type, target_id, parameter)` |
| Who authorized it | Recorded by the operational layer per EV-006 §14.2 (actor, time, parameter, previous and new value). EV-008 does not store the actor. |

Combining a disruption record with the Current Graph and its `status_source` gives a complete answer to: what changed, why, what was proposed, what was applied, when, and whether the change is still authoritative.

---

## 24. Domain Boundary

| Domain | Owns | Does not own |
| --- | --- | --- |
| **EV-006 Graph** | Graph topology; nodes and directed edges; node `capacity` (people); node `throughput_capacity` (people/minute); edge `capacity` (people/minute); `OPEN`/`CLOSED` status; Initial Graph and Current Graph; the single authoritative write path for graph state | Disruption identity; crowd state; forecasting; strategy |
| **EV-007 Crowd** | Crowd groups; occupancy; flow; queues; waiting time; travel time; throughput; utilization; density; overload; crowd consequences | Disruption identity or lifecycle; graph status; graph capacity; severity |
| **EV-008 Disruption** | Disruption identity; type; affected entities; severity; lifecycle; timing; disruption metadata; the declared operational effect | Graph state mutation; crowd metrics; forecasting; strategy generation; scenario time progression |
| **EV-009 Prediction** | Future forecasting: future crowd, congestion, recovery estimates, prediction confidence | Disruption records; graph state; crowd state |
| **EV-010 Optimization** | Strategy generation; constraints; objectives; ranking of candidate interventions | Disruption lifecycle; graph mutation; crowd calculation |
| **EV-011 Simulation** | Scenario execution; controlled time progression; isolated scenario state; strategy comparison | Live disruption registry; base graph mutation; crowd model definition |
| **Operational layer** | Authorization; applying approved operational changes; graph write path; conflict application; provenance | Disruption definition; crowd calculation; forecasting; strategy selection |

No responsibility appears under two owners, and no owner performs a responsibility listed against another.

---

## 25. System Flow

```text
                  EVENT / EXTERNAL CONDITION
                             │
                             ▼
                      DISRUPTION MODEL
                             │
             declares what changed and why
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
        Operational      Disruption    Prediction
        layer applies    context       context
        the authorized
        change
                │
                ▼
        Graph State (Current Graph)
                │
                ▼
           Crowd Model
                │
                ▼
        Operational consequence
                │
                ▼
           Prediction
                │
                ▼
          Optimization
                │
                ▼
           Simulation
                │
                ▼
          Optimization
                │
                ▼
        Operator / Operational Layer
                │
                ▼
        Authorized graph change
```

The central principle is:

> **Disruption describes the change; Crowd observes the operational consequence; Prediction estimates the future consequence; Optimization decides what could be changed; the operational layer applies what is authorized.**

---

## 26. MVP Requirements

| Requirement | MVP behaviour |
| --- | --- |
| Disruption definition | Any event or condition that materially changes normal event operation; crowd metrics alone are not disruptions |
| Canonical schema | One schema only, with the fields in §4 and explicit validation per field |
| Disruption types | Controlled enum of nine types (§5) |
| Affected entities | EV-006 node and edge identifiers only; no geographic objects; emptiness rules per type |
| Severity | Four levels describing the disruption itself; never transformed into crowd, capacity, prediction or optimization values |
| Lifecycle | `DETECTED` → `ACTIVE` → `RESOLVED`, with `DETECTED` → `RESOLVED` for withdrawal; `RESOLVED` terminal |
| Timing | `start_time` required; `detected_at`, `effect_started_at`, `resolved_at`, `expected_duration` optional; durations in seconds; expected and actual duration kept distinct |
| Operational effects | Lightweight effect records covering `status`, `capacity`, `throughput_capacity` and `restriction`, with proposed, applied and superseded traceability |
| Graph mutation | None from EV-008; all changes go through the operational layer and the single write path |
| Conflict handling | Deterministic most-restrictive rule; independent disruptions; no merging; no priority engine |
| Crowd boundary | EV-008 calculates no crowd metrics; EV-007 reacts to the resulting graph configuration |
| Prediction boundary | EV-008 predicts nothing; `expected_duration` is operational metadata |
| Optimization boundary | EV-008 generates, ranks and selects nothing |
| Simulation boundary | Scenario disruptions reuse the same model, are isolated, and are identifiable as scenario-specific |
| Idempotency | Keyed on disruption `id` and effect target/parameter; duplicates never create second objects |
| Validation | Critical errors block; metadata issues warn; no silent repair |
| Failure handling | Deterministic outcomes for every failure in §22 |
| Auditability | Minimum traceability contract in §23 |

---

## 27. Example

### 27.1 Disruption with an Applied Effect

Using the graph from EV-006 §18.

```json
{
  "id": "DISRUPTION_001",
  "type": "GATE_CLOSURE",
  "affected_nodes": ["GATE_01"],
  "affected_edges": [],
  "severity": "HIGH",
  "start_time": "2026-09-19T18:55:00Z",
  "expected_duration": 1200,
  "status": "ACTIVE",
  "detected_at": "2026-09-19T18:55:30Z",
  "effect_started_at": "2026-09-19T18:56:00Z",
  "resolved_at": null,
  "source": "OPERATOR",
  "operational_effects": [
    {
      "target_type": "NODE",
      "target_id": "GATE_01",
      "parameter": "status",
      "previous_value": "OPEN",
      "proposed_value": "CLOSED",
      "applied_value": "CLOSED",
      "applied_at": "2026-09-19T18:56:00Z",
      "effect_status": "APPLIED"
    }
  ]
}
```

`affected_edges` is empty because EV-006 §7.4 makes the connected edges (`EDGE_03`, `EDGE_04`, `EDGE_05`) unusable once the gate node is closed. They do not need to be listed.

Application relationship:

```text
EV-008  DISRUPTION_001  GATE_CLOSURE, ACTIVE
              │ effect: NODE GATE_01, status OPEN → CLOSED
              ▼
Operational layer  applies the authorized change
              ▼
EV-006  Current Graph   GATE_01.status = CLOSED, status_source = DISRUPTION
              ▼
EV-007  Crowd           observes CLOSED
                        EDGE_03 / EDGE_04 / EDGE_05 unusable
                        affected groups report route_unavailable
                        flexible groups divert or report no_valid_route
                        queues and waiting time evolve from the new configuration
                        crowd metrics are NOT written back into EV-008
```

### 27.2 Second Disruption with a Different Parameter

```json
{
  "id": "DISRUPTION_002",
  "type": "CHECKPOINT_FAILURE",
  "affected_nodes": ["CHECKPOINT_01"],
  "affected_edges": [],
  "severity": "MEDIUM",
  "start_time": "2026-09-19T18:58:00Z",
  "expected_duration": 600,
  "status": "ACTIVE",
  "detected_at": "2026-09-19T18:58:10Z",
  "effect_started_at": "2026-09-19T18:59:00Z",
  "resolved_at": null,
  "source": "SENSOR",
  "operational_effects": [
    {
      "target_type": "NODE",
      "target_id": "CHECKPOINT_01",
      "parameter": "throughput_capacity",
      "previous_value": 120,
      "proposed_value": 60,
      "applied_value": 60,
      "applied_at": "2026-09-19T18:59:00Z",
      "effect_status": "APPLIED"
    }
  ]
}
```

`throughput_capacity` is in **people/minute** and is valid only on a `NODE`. The proposal does not restate the previous value as a rate using the old ambiguous `capacity` field — node `capacity` remains a holding capacity in people.

`DISRUPTION_001` and `DISRUPTION_002` remain two independent objects affecting different entities with different parameters. They are not merged, and EV-008 does not compute their combined effect.

### 27.3 Conflicting Effects on the Same Parameter

Two disruptions both reduce the flow capacity of `EDGE_03`:

```text
DISRUPTION_003  ROAD_CLOSURE  affected_edges = ["EDGE_03"]
    effect: EDGE EDGE_03, parameter capacity, previous 300 → proposed 120

DISRUPTION_004  WEATHER_EVENT  affected_edges = ["EDGE_03"]
    effect: EDGE EDGE_03, parameter capacity, previous 300 → proposed 60
```

Deterministic resolution:

| Effect | Status | Authoritative? |
| --- | --- | --- |
| `DISRUPTION_003` → `capacity = 120` | `SUPERSEDED` | No |
| `DISRUPTION_004` → `capacity = 60` | `APPLIED` | **Yes** — the lower value is more restrictive |

`EDGE_03.capacity = 60` (people/minute) becomes the authoritative Current Graph value. Severity had no part in the outcome; the parameter values decided it.

If `DISRUPTION_004` resolves, the operational layer re-evaluates the remaining active effects, finds `DISRUPTION_003` proposing `120`, and applies `120`. If `DISRUPTION_003` also resolves, no effects remain and the operational layer restores `previous_value = 300`, provided graph provenance still indicates the change came from a disruption (EV-006 §7.5).

### 27.4 Resolution Without Recovery

`DISRUPTION_001` is later resolved. The lifecycle update is a **partial update** — it carries only the fields that change, not a replacement record:

```json
{
  "id": "DISRUPTION_001",
  "status": "RESOLVED",
  "resolved_at": "2026-09-19T19:12:00Z"
}
```

```text
actual_duration = 19:12:00 - 18:55:00 = 1020 seconds
expected_duration                  = 1200 seconds
```

The disruption resolved earlier than expected. That is information, not an error.

The operational layer withdraws the status effect, and — because graph provenance still indicates `DISRUPTION` — `GATE_01.status` returns to `OPEN`. Crowd state does not reset:

```text
GATE_01 reopened
     ↓
DISRUPTION_001 RESOLVED
     ↓
Queue accumulated at CHECKPOINT_01 still exists
Occupancy and waiting time continue from their current values
EV-007 keeps tracking the queue
```

The disruption is `RESOLVED` while crowd conditions are still degraded. Those are two separate facts, owned by two separate domains.

---

## 28. Architectural Summary

EV-008 is the declaration layer for operational disruption. It says **what changed and why**, and it names the operational change the disruption requires. It never applies that change, never calculates the crowd consequence, and never predicts the future.

Key invariants:

* A disruption is an event or condition that materially changes normal event operation. Crowd metrics crossing thresholds are **not** disruptions by themselves; a crowd-driven condition becomes one only when an authorized source declares it and names the affected graph entities.
* One canonical schema. No second representation, no duplicated canonical block.
* Affected entities are EV-006 node and edge identifiers only. Neither list may be empty unless the disruption type permits an external-only representation.
* Severity describes the disruption itself. It is never transformed into crowd density, crowd impact, graph capacity, movement slowdown, prediction probability or an optimization score.
* Lifecycle is `DETECTED` → `ACTIVE` → `RESOLVED`, with withdrawal allowed from `DETECTED`. `RESOLVED` is terminal; a recurrence is a new `id`.
* `start_time`, `detected_at`, `effect_started_at` and `resolved_at` are four distinct moments. `expected_duration` is an operational expectation in seconds, never a prediction, and never the actual duration.
* EV-008 declares operational effects; the operational layer applies them through the single authoritative graph write path. Effects record what was proposed, what was applied, and when.
* Conflicting effects between simultaneous disruptions are resolved deterministically by the most-restrictive value. Disruptions stay independent, are never merged, and severity plays no part in precedence.
* EV-008 calculates no crowd metrics. EV-007 reacts to the resulting graph configuration.
* Resolution of a disruption and recovery of the crowd are separate concepts.
* Duplicate deliveries never create duplicate disruptions; idempotency is keyed on `id` and on effect target and parameter.
* Invalid references block the disruption and are never silently repaired. Metadata gaps are warnings.
* Scenario disruptions reuse this model, remain isolated from live state, and are identifiable as scenario-specific.
