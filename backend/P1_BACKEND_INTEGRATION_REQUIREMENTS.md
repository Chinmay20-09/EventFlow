# P1 → P3 Crowd Engine Integration Requirements

**Status:** Requirements and open questions
**Audience:** P1 Crowd Engine, P3 Backend/API/Data, P4 frontend, and P2 prediction/strategy owners
**Scope:** Contract discovery and integration planning only. This document does not implement an API, database, or backend adapter.

## 1. Purpose

P1 owns the deterministic Crowd Engine. P3 owns the backend, persistence, API, and integration boundary. P1 calculates and produces crowd intelligence; P3 receives P1 output, validates it, stores it when appropriate, exposes it to P4, supplies freshness information, and handles errors at the service boundary.

P3 must not recalculate P1 crowd intelligence. In particular, P3 must not independently derive occupancy, flow, density, congestion, queue size, bottlenecks, travel time, arrivals, diversion, or simulation outcomes from a P1 payload. P3 may validate declared ranges and preserve the values supplied by P1.

The repository currently contains the TypeScript P1 engine and no backend, database, or API implementation. The current P1 public domain boundary is in `src/engine/types.ts`; serialization is explicitly snake_case for P2/P3 handoff. P1 remains partially complete against EV-007, EV-008, EV-010, and EV-011, so every item marked “P1 must confirm” is a contract question, not an assumed production guarantee.

## 2. Event Information

P1 must answer:

1. Does the Crowd Engine require an `event_id`? The current `SimulationResult` has `id` and `scenarioId`, while `SandboxInput` does not currently carry an event ID.
2. What event information is required before a graph or simulation can start?
3. Does P1 need the event name, event location, total capacity, event start/end time, number of zones, node configuration, or any other event metadata?
4. Which fields are mandatory and which are optional?
5. Who creates and owns the event configuration?
6. What format should P3 send event information to P1?
7. How are event configuration versions identified?
8. Can one event have multiple graph versions or simultaneous scenarios?
9. What is the relationship between an event ID, scenario ID, simulation ID, and strategy ID?

P1 must provide a confirmed event contract. At minimum, P3 needs to know whether event identity is transport metadata only or part of the P1 simulation input.

## 3. Node / Zone Information

### Definitions P1 must confirm

1. What is a node?
2. What is a zone?
3. Are node and zone the same concept in the Crowd Engine?
4. If zones are projections over nodes, what is the mapping?
5. What unique ID does P1 require for each node?
6. What information is required for every node?
7. Can one node belong to multiple zones?
8. Are neighboring nodes derived from directed edges, or must P3 send them separately?

### Current P1 shape to confirm

The current engine model represents a venue as a directed graph. A node currently has:

```json
{
  "id": "GATE_A",
  "label": "Gate A",
  "type": "GATE",
  "latitude": 0,
  "longitude": 0,
  "capacity": 100,
  "operationalCapacity": 80,
  "throughputCapacity": 30,
  "status": "OPEN",
  "restriction": null,
  "restrictions": []
}
```

P1 must confirm the actual serialized field names (`snake_case` or another boundary representation), required/optional status, units, nullability, and whether coordinates are required. The current TypeScript model supports node types including `ZONE`, `GATE`, `ENTRANCE`, `EXIT`, `TRANSIT`, `CHECKPOINT`, and `ROAD`, while also permitting forward-compatible strings.

P1 must answer:

1. Does every node require a name/label?
2. Is `capacity` physical holding capacity in people?
3. Is `operational_capacity` distinct from physical capacity?
4. Is `throughput_capacity` a service rate in people/minute?
5. Are coordinates descriptive only or used by simulation?
6. Does P1 require explicit entry/exit lists?
7. Can a node have zero crowd?
8. Can a node temporarily become unavailable?
9. Can nodes be added or removed while an event is running?
10. What happens if a node is missing from an update?
11. Are node IDs stable for the lifetime of an event?
12. Which node status and restriction values are valid?

## 4. Current Crowd State

This is the primary P1 → P3 contract. P1 must define the authoritative current-state payload, not only the internal TypeScript type.

P1 must answer:

1. What does the Crowd Engine output for each node?
2. Is the authoritative value visitor count, occupancy, occupancy percentage, density, crowd level, or another metric?
3. What is the unit of every value?
4. How is physical capacity represented?
5. How is operational capacity represented?
6. Does P1 calculate occupancy percentage?
7. Does P1 calculate a status such as `LOW`, `NORMAL`, `HIGH`, or `CRITICAL`?
8. If status is calculated, what are the exact threshold rules?
9. Does P1 provide confidence or measurement quality?
10. What happens when a crowd value is unavailable?
11. Are values current observations, simulation state, or both?
12. Does a payload represent the whole event or only a scoped subset?

The current P1 `CapacityMetric` contains fields including `currentOccupancy`, `inflow`, `outflow`, `utilization`, `queueSize`, `overflow`, `bottleneck`, `flow`, holding/service/flow utilization, overload, density, and density state. P1 must confirm which of these are part of the backend contract and which remain internal simulation output.

P1 must provide one complete confirmed payload. This is a template only and must not be implemented as-is:

```json
{
  "event_id": "event-example",
  "timestamp": "2026-09-24T12:00:00Z",
  "nodes": [
    {
      "node_id": "GATE_A",
      "crowd_count": 0,
      "capacity": 0,
      "occupancy_percentage": 0,
      "status": "UNKNOWN",
      "confidence": null
    }
  ]
}
```

P1 must confirm every field name, type, unit, required/optional status, nullability, and authoritative meaning.

## 5. Crowd Movement / Flow

P1 must answer:

1. Does the Crowd Engine calculate movement between nodes?
2. Does it provide source and destination node IDs?
3. Does it provide an edge/connection ID?
4. Does `flow` mean people per minute, people moved during an interval, current edge occupancy, or another quantity?
5. Is movement current, interval-based, cumulative, or historical?
6. How frequently is movement updated?
7. Can movement be directional or negative?
8. What happens when movement information is unavailable?
9. Is movement required for the MVP?
10. Does P4 need edge occupancy separately from flow?

The current P1 edge model has directed `from` and `to` node IDs, an edge ID, capacity in the edge contract, and simulation-step edge metrics including `currentOccupancy`, `flow`, `inflow`, `outflow`, utilization, queue, density, and overload. P1 must confirm the external contract and units.

Candidate shape for discussion only:

```json
{
  "event_id": "event-example",
  "timestamp": "2026-09-24T12:00:00Z",
  "edges": [
    {
      "edge_id": "GATE_A_HALL",
      "from_node_id": "GATE_A",
      "to_node_id": "HALL",
      "flow": 0,
      "flow_unit": "people/minute",
      "occupancy": 0,
      "occupancy_unit": "people"
    }
  ]
}
```

P3 must not invent movement values or infer them from two unrelated node snapshots unless P1 explicitly defines that calculation.

## 6. Historical vs Current Data

P1 must clearly distinguish:

1. Current crowd state.
2. Historical crowd state.
3. Crowd movement history.
4. Aggregated crowd statistics.
5. Simulation results versus observed/live state.

P1 must answer:

- Does P1 provide only the latest state or history?
- If history is provided, what retention window and interval apply?
- Does P1 expect P3 to store every update?
- Which data is the minimum required for P4?
- Is historical crowd data required for MVP?
- Who owns aggregation and retention?
- Are historical values immutable after publication?

P3 must not create historical storage rules until P1 confirms the required history and retention semantics.

## 7. Prediction-Related Data

The repository architecture separates Crowd from Prediction:

```text
P1 → current crowd data / simulation outcomes
P2 → prediction, recommendation, and strategy intelligence
```

P1 must answer:

1. Does P1 produce only current crowd state and deterministic simulation results?
2. Does P1 produce future forecasts?
3. If yes, what horizon, interval, model status, and confidence fields are provided?
4. Does P2 consume P1 crowd data to create predictions?
5. Which system is authoritative for predictions?
6. Does a P1 simulation estimate count as a P2 prediction or remain a P1 scenario result?

P3 must not duplicate P2 prediction or recommendation logic.

## 8. Update Frequency and Freshness

P1 must answer:

1. How often does the Crowd Engine produce updates?
2. Is the integration real-time, near-real-time, or batch?
3. What update interval is expected for live state and for simulation results?
4. What timestamp does every update contain?
5. Are timestamps ISO 8601?
6. Is the timestamp UTC or IST? The current P1 examples and simulated clock use UTC `Z`; P1 must confirm this as a contract.
7. Is the timestamp event time, simulation time, production time, or publication time?
8. How should P3 detect stale data?
9. After how long is data stale?
10. Does P1 provide `is_stale`, health, sequence, or freshness metadata?
11. What happens when P1 stops sending updates?

P1 must provide an explicit freshness rule, for example:

```text
fresh: update age <= [P1-confirmed interval]
stale: update age > [P1-confirmed interval]
unavailable: no valid update or source failure
```

P3 must expose freshness state and timestamps to P4 rather than silently serving old values as current.

## 9. Identifiers

P1 must specify the owner, format, stability, and scope of:

- event ID
- venue/graph ID
- graph version ID
- node ID
- zone ID, if different
- edge ID
- crowd group ID, if exposed
- crowd-state/update ID
- scenario ID
- simulation result ID
- strategy ID
- timestamp or sequence number

P1 must answer:

1. Who generates each ID?
2. Are IDs UUIDs, strings, integers, or another format?
3. Are IDs stable for the lifetime of an event?
4. Can IDs change while an event is running?
5. Does P1 use the same IDs as the P3 database?
6. Which IDs are globally unique versus unique only within an event?
7. Can two updates share a timestamp?
8. What field identifies a result when an update is retried?

P3 must not remap identifiers without preserving the P1 identifier and mapping version.

## 10. Validation Requirements

P1 must specify valid ranges and invariants for:

- population/crowd count
- physical capacity
- operational capacity
- throughput capacity
- occupancy percentage
- confidence
- density
- flow
- distance and travel time
- progress
- timestamps
- IDs and references

P1 must answer:

1. Can crowd count be negative?
2. Can crowd count exceed capacity, and is that an overload or invalid input?
3. Can capacity be zero or null?
4. Can operational capacity exceed physical capacity?
5. Can confidence be null?
6. What happens with invalid measurements?
7. Which validation is guaranteed by P1?
8. Which validation must P3 perform?
9. Are unknown node/edge IDs rejected?
10. Are duplicate node/edge IDs rejected?
11. Are disconnected destinations a validation error or a valid stranded outcome?

P3 should validate the contract even when P1 validates it. P3 must reject or quarantine invalid payloads rather than silently correcting them.

## 11. Missing Data

P1 must answer:

1. What happens if one node has no crowd data?
2. Should P1 omit the node, send `null`, or send an explicit `UNKNOWN` status?
3. How should P3 represent missing data to P4?
4. Should P3 ever reuse the previous value?
5. If previous values may be reused, for how long and with what stale marker?
6. How are missing edge metrics represented?
7. Is a missing value different from zero?
8. Does missing data reduce confidence or invalidate the complete update?

P3 must not fabricate zeroes for missing measurements. Zero must mean that P1 explicitly reported zero.

## 12. Failure and Retry Behavior

P1 must answer:

1. What happens if the Crowd Engine temporarily fails?
2. Does P1 retry internally?
3. Should P3 retry?
4. How many attempts and what interval/backoff?
5. What timeout should P3 use?
6. What errors can P1 return?
7. Does P1 distinguish validation error, temporary failure, permanent failure, unavailable source, and timeout?
8. Are requests safe to retry?
9. Can a simulation be cancelled?
10. How are partial results reported?
11. Is a failed result represented by a structured status or an error response only?

P3 needs a documented error taxonomy and retry-safety rule before implementing a client or worker.

## 13. Idempotency / Duplicate Data

P1 must answer:

1. Can the same crowd update be sent more than once?
2. Is there an update/event ID?
3. Is `(event_id, timestamp)` unique?
4. Can two updates have the same timestamp?
5. Is a sequence number required?
6. What should happen if P3 receives the same update twice?
7. What should happen if an older update arrives after a newer update?
8. Are simulation result IDs deterministic for identical input?

P3 needs a reliable duplicate-handling rule: accept once, identify duplicates, preserve the original payload, and never double-count a crowd update.

## 14. Authentication / Service Identity

P1 must answer:

1. How will P1 communicate with P3?
2. Does P1 require authentication?
3. Does P3 require authentication for P1?
4. What service identity is used?
5. Is the mechanism an API key, service token, mTLS, internal network identity, or another method?
6. Which side generates credentials?
7. How are credentials rotated and revoked?
8. What scopes/permissions are required?
9. Should P1 send any end-user identity?

P1 service authentication must be separate from frontend user authentication. P3 must not accept a browser session or user token as proof of P1 service identity unless the security design explicitly approves it.

## 15. Communication Method

P1 must identify the expected integration method:

- REST API
- internal TypeScript/Python service call
- message queue
- file/object exchange
- database exchange
- another documented method

P1 must answer:

1. Who calls whom?
2. Does P1 push data to P3?
3. Does P3 pull data from P1?
4. Is a callback or webhook required?
5. What endpoint or interface is expected?
6. What request and response format is used?
7. What timeout, rate limit, and payload-size limit apply?
8. Is the interaction synchronous or asynchronous?
9. How are long-running simulations submitted and retrieved?
10. How are correlation IDs propagated?

**MVP decision required:** If P1 has no existing requirement, P1 and P3 should explicitly choose one simple boundary, rather than allowing separate implementations to invent incompatible transports. The choice remains undecided until P1/P3 confirm it.

## 16. Complete Sample Payloads

P1 must provide real examples using the exact fields, types, units, IDs, timestamps, required fields, and optional fields it intends to support:

### A. Event configuration

```json
{}
```

### B. Node and graph configuration

```json
{}
```

### C. Current crowd update

```json
{}
```

### D. Movement/flow update

```json
{}
```

### E. Missing-data response

```json
{}
```

### F. Error response

```json
{}
```

The examples must distinguish omitted fields, explicit `null`, zero, stale data, and unavailable data. At least three realistic populated examples are required before P3 implementation begins.

## 17. Required P1 Deliverable

P1 must provide:

1. Crowd Engine input contract.
2. Crowd Engine output contract.
3. Node schema.
4. Edge/flow schema, if applicable.
5. Event schema.
6. Current crowd schema.
7. Simulation-result schema, if exposed to P3.
8. Timestamp and timezone rules.
9. ID and version rules.
10. Validation rules and invariants.
11. Freshness and staleness rules.
12. Error contract.
13. Retry and timeout rules.
14. Duplicate/idempotency rules.
15. Authentication and integration method.
16. Complete sample payloads.
17. Mandatory-field list.
18. Optional-field list.
19. Fields P3 must never calculate, reinterpret, or modify.
20. Explicit list of unresolved decisions and compatibility risks.

## 18. Final Questions for P1

P1 must answer these explicitly:

1. What exact information do you need from P3 to run the Crowd Engine?
2. What exact information will you send to P3?
3. What is the exact current-crowd JSON structure?
4. What is the exact node JSON structure?
5. Do you provide movement/flow data?
6. Do you provide historical crowd data?
7. Do you provide future predictions, or is that owned by P2?
8. What are the update intervals?
9. What timestamps and timezone do you use?
10. What IDs do you use?
11. How do you represent missing data?
12. How do you represent stale data?
13. What errors can occur?
14. What retry behavior is expected?
15. How are duplicate updates identified?
16. How will P1 authenticate with P3?
17. Which fields are guaranteed?
18. Which fields are optional?
19. Which fields must P3 never calculate?
20. Can you provide at least three realistic sample payloads?
21. What assumptions does P1 currently make about the backend?
22. Is anything in current P3 documentation incompatible with the Crowd Engine?
23. What information is still undecided?

## 19. P3 Integration Checklist

- [ ] Event contract confirmed
- [ ] Graph/node contract confirmed
- [ ] Zone relationship confirmed
- [ ] Current crowd contract confirmed
- [ ] Flow contract confirmed / not required
- [ ] Simulation-result contract confirmed / not required
- [ ] Historical data requirement confirmed
- [ ] Prediction ownership confirmed
- [ ] IDs and versioning confirmed
- [ ] Timestamp/timezone confirmed
- [ ] Freshness/staleness rule confirmed
- [ ] Validation rules confirmed
- [ ] Missing-data behavior confirmed
- [ ] Error contract confirmed
- [ ] Retry and timeout behavior confirmed
- [ ] Idempotency/duplicate handling confirmed
- [ ] Authentication/service identity confirmed
- [ ] Communication method confirmed
- [ ] Rate limits and payload limits confirmed
- [ ] Sample payloads received
- [ ] Mandatory fields listed
- [ ] Optional fields listed
- [ ] P3 fields-never-to-calculate list confirmed
- [ ] P1/P3 responsibilities confirmed
- [ ] P2 prediction boundary confirmed
- [ ] Open decisions and incompatibilities recorded
