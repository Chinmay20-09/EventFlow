# P1 Crowd Disruption Engine Status

## Status

**IN PROGRESS** — the deterministic core and the remaining fix-phase boundaries are operational; native OR-Tools and some extended schema/provenance details remain outside the current adapter.

## Implemented in this fix phase

- EV-006 graph validation now rejects unknown node types, self-loops, and non-finite/non-positive edge capacities.
- Canonical EV-008 closure types are supported alongside legacy compatibility names.
- Simultaneous applied capacity effects reconcile by the most restrictive value; closures cannot be reopened by a later effect.
- Applied disruption targets and effect parameter combinations are validated against the scenario graph.
- Simulation timelines now include termination, diversion, and recovery transitions.
- Each simulation step now serializes physical node/edge transfer ledgers, including split conservation.
- Run-level population is the initial cohort; remaining population is reported separately. Scoped occupancy/queue/utilization use documented peak aggregation.
- Scenario comparisons expose compatibility warnings, validity, and a metric matrix instead of silently treating incompatible runs as equivalent.
- Optimization fallback supports bounded status candidates, disruption-applied locks, deterministic ranks, candidate ordering, and rejection summaries.
- Optimization supports deterministic demand-share rebalancing across configured active entries with integer largest-remainder allocation.
- `runSandboxSafe` returns structured `INVALID_SCENARIO`, `INVALID_OVERRIDE`, `INVALID_INPUT`, and `SIMULATION_FAILURE` results with diagnostics.
- External populations remain integer people; internal transfers remain continuous mass without rounding.
- `travelTime` remains the population-weighted mean of accumulated movement time across the full runtime cohort.
- `strandedPopulation` remains a compatibility name for population not arrived at simulation end, not permanent stranding.

## Current contract boundaries

- Native OR-Tools CP-SAT is not installed. `StrategySolver` remains the model-agnostic boundary and the deterministic fallback is explicitly identified as such.
- Backend/API integration is outside this repository.
- Structured invalid/failure result objects and the complete EV-007 adjustment ledger still require implementation.

## Validation

- `npm test`: 35 tests passed.
- `npx tsc -b`: passed after the final fix-phase changes.
- Manual three-person route: initial `3`, arrived `3`, remaining `0`, average travel `60.00s`.
- `npm run build` and `npm run lint`: previously passed; lint retains two existing `UI/app.js` unused-function warnings.

## Specification status

| Specification | Status |
| --- | --- |
| EV-006 | Core graph and isolation implemented; coordinate/provenance extensions remain |
| EV-007 | Core propagation, capacity, queues, flow, continuous mass, travel-time semantics, transfer ledgers, split events, and typed external adjustments implemented |
| EV-008 | Timed effects, canonical closures, restrictive reconciliation, and validation implemented; full lifecycle provenance remains |
| EV-010 | Deterministic fallback boundary, bounded status/capacity/throughput/demand-share variables, feasibility, ranking, summaries, and diagnostics implemented; native OR-Tools remains unavailable |
| EV-011 | Deterministic simulation, timeline, transfer serialization, scoped metrics, structured safe failures, and comparison diagnostics implemented |
