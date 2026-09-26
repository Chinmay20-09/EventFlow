# EventFlow deterministic engine

The public API is exported from `engine/src/index.ts`.

- `VenueGraph` validates and owns a serializable directed digital twin. `withOverrides`
  returns an isolated graph copy, so sandbox runs never mutate live input.
- `findPath` uses deterministic Dijkstra routing. Travel time is the primary cost,
  congestion is a bounded secondary cost, and edge IDs provide stable tie-breaking.
- `capacityMetric` keeps physical/operational capacity separate from occupancy,
  flow, utilization, queue and overflow.
- `DeterministicSimulator` advances FIFO node queues in fixed timesteps. Edge and
  node capacities limit admission; blocked destinations and unavailable routes
  produce `STOPPED` groups rather than silently dropping people.
- `runSandbox` applies graph overrides and active disruptions to an isolated copy.
- `generateCandidates` is the dependency-free bounded strategy solver. It exposes
  the same separation needed by an OR-Tools adapter: candidate generation is
  independent from simulation and final strategy ranking. No native solver is
  required for deterministic baseline simulation.

Inputs and outputs are plain TypeScript data structures and can be serialized with
`JSON.stringify`. No wall clock, random iteration, or uncontrolled concurrency is
used by the engine.
