# P1 — Crowd Disruption Engine

## Status

IN PROGRESS

## Implemented

### Graph / Digital Twin

- Directed venue graph with nodes, edges, capacities, availability, validation, cloning, and deterministic serialization.
- Scenario overrides operate on isolated graph copies.

### Routing

- Deterministic pathfinding with stable tie-breaking, capacity-aware costs, congestion-aware costs, and flexible rerouting.

### Crowd Simulation

- Aggregate crowd groups with node/edge locations, movement, edge progress, waiting, stopping, diversion, arrival, travel time, and stranded-state reporting.
- FIFO queue service and deterministic timestep execution.

### Capacity

- Separate physical and operational capacity.
- Node holding/service metrics and edge occupancy/flow metrics.
- Utilization, overflow, bottleneck, overload, density, and configurable density-state thresholds.

### Disruptions

- Blocked, closed, restricted, reduced-capacity, increased-travel-time, and unavailable-exit effects.
- Deterministic scheduled activation and expected-duration resolution on the simulated clock.

### Congestion

- Node-load movement slowdown and congestion-aware route costs.
- Queue-stalled, queue-growth, overload, threshold, density, arrival, and sink-release events.

### Sandbox

- Scenario metadata, graph/crowd overrides, interventions, isolated state, deterministic simulated timestamps, and lifecycle events.

### Optimization

- `StrategySolver.solve(...)` boundary.
- Deterministic candidate fallback, feasibility checks, sandbox evaluation, objective calculation, and ranking.

### Serialization / Integration

- Explicit snake_case graph and simulation-result serialization for P2/P3 handoff.

### Testing

- 26 Vitest cases covering graph validation, routing, capacity, propagation, queues, disruptions, determinism, sandbox lifecycle, events, serialization, operational effects, and optimization feasibility.
- Interactive manual harness: `npx tsx scripts/test_Crowd.ts` with presets, custom input, comparison, step inspection, determinism checks, and JSON export.

## What Remains

### EV-007

- Complete physical transfer ledgers and adjustment-event accounting.
- Complete documented event matrix and scoped metric aggregation.

### EV-010

- Implement all documented C1-C9 decision-variable and constraint semantics.
- Match the documented optimization result, objective summary, constraint summary, and failure-status schemas.

### EV-011

- Add complete operational-parameter and EV-008 effect contracts.
- Return structured invalid/failure results instead of relying primarily on thrown validation errors.
- Complete scoped metric aggregation, comparison compatibility validation, and exact same-time event ordering.

### Integration

- Backend/API integration is outside this repository.
- Native OR-Tools CP-SAT adapter is not installed.

### Testing

- Add targeted tests for remaining EV-007 accounting, EV-010 constraints/output, EV-011 failure/comparison, and full disruption provenance semantics.

## Current Limitations

- Deterministic fallback implemented; native OR-Tools adapter not installed.
- Some documented EV-007 metrics/events and EV-011 failure/comparison semantics remain incomplete.
- Backend integration is outside the current repository.

## Validation

- `npm test`: passed — 26 tests.
- `npm run build`: passed.
- `npm run lint`: completed with two existing `UI/app.js` unused-function warnings.
- `npx tsc -b`: passed.
- Manual harness: passed for normal, blocked, gate-failure, comparison, stress, determinism, and export modes.

## Last Updated

2026-09-24
