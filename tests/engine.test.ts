import { describe, expect, it } from "vitest"
import {
  DeterministicSimulator,
  VenueGraph,
  capacityMetric,
  compareScenarios,
  findPath,
  generateCandidates,
  optimizeSimulation,
  runSandbox,
  runSandboxSafe,
  serializeGraph,
  serializeSimulationResult,
} from "../src/engine"

const graphInput = {
  nodes: [
    { id: "A", label: "Entry", type: "ENTRANCE" as const, capacity: 100, throughputCapacity: null, status: "OPEN" as const },
    { id: "B", label: "Concourse", type: "ZONE" as const, capacity: 50, throughputCapacity: 60, status: "OPEN" as const },
    { id: "C", label: "Exit", type: "EXIT" as const, capacity: 100, throughputCapacity: null, status: "OPEN" as const },
  ],
  edges: [
    { id: "AB", from: "A", to: "B", distance: 10, baselineTime: 10, currentTime: 10, capacity: 60, status: "OPEN" as const },
    { id: "BC", from: "B", to: "C", distance: 10, baselineTime: 10, currentTime: 10, capacity: 60, status: "OPEN" as const },
  ],
}

const crowd = [{
  id: "group-1",
  population: 20,
  currentLocation: { kind: "NODE" as const, id: "A" },
  destination: "C",
  averageSpeed: 1,
}]

describe("EventFlow deterministic engine", () => {
  it("builds serializable graphs and selects directed paths", () => {
    const graph = new VenueGraph(graphInput)
    expect(findPath(graph, "A", "C")?.edgeIds).toEqual(["AB", "BC"])
    expect(graph.edge("AB")?.label).toBe("Entry -> Concourse")
    expect(JSON.parse(JSON.stringify(graph)).nodes).toHaveLength(3)
    expect(() => new VenueGraph({ ...graphInput, edges: [{ ...graphInput.edges[0], from: "missing" }] })).toThrow()
    expect(() => new VenueGraph({ ...graphInput, activeEntries: ["C"] })).toThrow()
    expect(() => new VenueGraph({
      ...graphInput,
      edges: [...graphInput.edges, { ...graphInput.edges[0], id: "AB_DUP" }],
    })).toThrow()
  })

  it("calculates capacity metrics without conflating null capacity", () => {
    expect(capacityMetric(graphInput.nodes[1], 50, 10, 5, 12)).toMatchObject({
      physicalCapacity: 50, operationalCapacity: 50, currentOccupancy: 50, queueSize: 12, overflow: 0, bottleneck: true, density: 1, densityState: "CRITICAL",
    })
    expect(capacityMetric({ ...graphInput.nodes[1], capacity: null }, 999, 0, 0).utilization).toBeNull()
  })

  it("propagates a crowd and changes outcomes after an edge disruption", () => {
    const baseline = new DeterministicSimulator(new VenueGraph(graphInput), crowd, { durationSeconds: 40, timestepSeconds: 10 }).run()
    const blocked = runSandbox({
      graph: graphInput, crowd, parameters: { durationSeconds: 40, timestepSeconds: 10 },
      disruptions: [{ id: "D1", type: "BLOCKED_CORRIDOR", affectedEdges: ["AB"], status: "ACTIVE", startTime: "2026-09-24T00:00:00Z" }],
    })
    expect(baseline.arrivedPopulation).toBeGreaterThan(0)
    expect(blocked.arrivedPopulation).toBe(0)
    expect(blocked.affectedGroups.length).toBeGreaterThan(0)
  })

  it("is deterministic and honors optimization locks and bounds", () => {
    const first = runSandbox({ graph: graphInput, crowd, parameters: { durationSeconds: 40, timestepSeconds: 10, seed: 42 } })
    const second = runSandbox({ graph: graphInput, crowd, parameters: { durationSeconds: 40, timestepSeconds: 10, seed: 42 } })
    expect(second).toEqual(first)
    const candidates = generateCandidates({ graph: graphInput, allowEdgeCapacityChange: true, minimumCapacity: { AB: 10 }, disruptionLocked: ["AB"] })
    expect(candidates.every((candidate) => !candidate.changes.some((change) => change.targetId === "AB"))).toBe(true)
  })

  it("preserves initial edge progress and reports occupancy separately from flow", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ZONE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [{ id: "AB", from: "A", to: "B", distance: 100, baselineTime: 100, currentTime: 100, capacity: 10, status: "OPEN" }],
    })
    const result = new DeterministicSimulator(graph, [{
      id: "edge-group", population: 10, currentLocation: { kind: "EDGE", id: "AB" },
      destination: "B", averageSpeed: 10, progress: 0.5,
    }], { durationSeconds: 2, timestepSeconds: 2 }).run()
    const group = result.final.crowd.find((candidate) => candidate.id === "edge-group")
    expect(group?.progress).toBeCloseTo(0.7)
    expect(group?.state).toBe("MOVING")
    expect(result.final.edgeMetrics[0].currentOccupancy).toBe(10)
    expect(result.final.edgeMetrics[0].flow).toBeGreaterThan(0)
  })

  it("reports movement flow using the documented population-rate formula", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ENTRANCE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [{ id: "AB", from: "A", to: "B", distance: 20, baselineTime: 20, currentTime: 20, capacity: 120, status: "OPEN" }],
    })
    const result = new DeterministicSimulator(graph, [{
      id: "flow", population: 3, currentLocation: { kind: "NODE", id: "A" }, destination: "B", averageSpeed: 1,
    }], { durationSeconds: 20, timestepSeconds: 10 }).run()
    expect(result.steps[1].edgeMetrics[0].flow).toBeCloseTo(9)
  })

  it("rejects fractional external populations while preserving fractional internal transfers", () => {
    expect(() => new DeterministicSimulator(new VenueGraph(graphInput), [{
      ...crowd[0], population: -1,
    }])).toThrow(/Invalid population/)
    expect(() => new DeterministicSimulator(new VenueGraph(graphInput), [{
      ...crowd[0], population: Number.NaN,
    }])).toThrow(/Invalid population/)
    expect(() => new DeterministicSimulator(new VenueGraph(graphInput), [{
      ...crowd[0], population: Number.POSITIVE_INFINITY,
    }])).toThrow(/Invalid population/)
    expect(() => new DeterministicSimulator(new VenueGraph(graphInput), [{
      ...crowd[0], population: 1.5,
    }])).toThrow(/Invalid population/)

    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ENTRANCE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [{ id: "AB", from: "A", to: "B", distance: 100, baselineTime: 100, currentTime: 100, capacity: 1, status: "OPEN" }],
    })
    const result = new DeterministicSimulator(graph, [{
      id: "mass", population: 3, currentLocation: { kind: "NODE", id: "A" }, destination: "B", averageSpeed: 1,
    }], { durationSeconds: 10, timestepSeconds: 10 }).run()
    const step = result.steps[1]
    const edgeMass = step.edgeMetrics[0].currentOccupancy
    const nodeMass = step.nodeMetrics.reduce((sum, metric) => sum + metric.currentOccupancy, 0)
    expect(edgeMass).toBeCloseTo(1 / 6)
    expect(nodeMass + edgeMass).toBeCloseTo(3)
    expect(step.transfers.nodeOut.A).toBeCloseTo(1 / 6)
    expect(step.transfers.edgeIn.AB).toBeCloseTo(1 / 6)
    expect(result.events.some((event) => event.type === "SPLIT")).toBe(true)
  })

  it("aggregates travel time across completed and split populations", () => {
    const complete = new DeterministicSimulator(new VenueGraph(graphInput), crowd, {
      durationSeconds: 40, timestepSeconds: 10,
    }).run()
    expect(complete.arrivedPopulation).toBe(20)
    expect(complete.metrics.travelTime).toBeCloseTo(20)

    const partial = new DeterministicSimulator(new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ENTRANCE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [{ id: "AB", from: "A", to: "B", distance: 100, baselineTime: 100, currentTime: 100, capacity: 1, status: "OPEN" }],
    }), [{
      id: "partial", population: 3, currentLocation: { kind: "NODE", id: "A" }, destination: "B", averageSpeed: 1,
    }], { durationSeconds: 20, timestepSeconds: 10 }).run()
    expect(partial.metrics.travelTime).toBeCloseTo(10 / 18)
  })

  it("averages different completed group travel times over the same cohort", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ENTRANCE", capacity: 100, status: "OPEN" },
        { id: "C", label: "C", type: "ENTRANCE", capacity: 100, status: "OPEN" },
        { id: "D", label: "D", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [
        { id: "AD", from: "A", to: "D", distance: 10, baselineTime: 10, currentTime: 10, capacity: 100, status: "OPEN" },
        { id: "CD", from: "C", to: "D", distance: 20, baselineTime: 20, currentTime: 20, capacity: 100, status: "OPEN" },
      ],
    })
    const result = new DeterministicSimulator(graph, [
      { id: "fast", population: 1, currentLocation: { kind: "NODE", id: "A" }, destination: "D", averageSpeed: 1 },
      { id: "slow", population: 1, currentLocation: { kind: "NODE", id: "C" }, destination: "D", averageSpeed: 1 },
    ], { durationSeconds: 30, timestepSeconds: 10 }).run()
    expect(result.arrivedPopulation).toBe(2)
    expect(result.metrics.travelTime).toBeCloseTo(15)
  })

  it("forms and releases a FIFO queue at a zero-service node", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ENTRANCE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "CHECKPOINT", capacity: 100, throughputCapacity: 0, status: "OPEN" },
        { id: "C", label: "C", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [
        { id: "AB", from: "A", to: "B", distance: 1, baselineTime: 1, currentTime: 1, capacity: 1200, status: "OPEN" },
        { id: "BC", from: "B", to: "C", distance: 1, baselineTime: 1, currentTime: 1, capacity: 1200, status: "OPEN" },
      ],
    })
    const result = new DeterministicSimulator(graph, [{
      id: "queue", population: 20, currentLocation: { kind: "NODE", id: "A" }, destination: "C", averageSpeed: 1,
    }], { durationSeconds: 5, timestepSeconds: 1 }).run()
    expect(result.final.nodeMetrics.find((metric) => metric.id === "B")?.queueSize).toBe(20)
    expect(result.strandedPopulation).toBe(20)
  })

  it("releases queued people when node service becomes available", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ZONE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "CHECKPOINT", capacity: 100, throughputCapacity: 60, status: "OPEN" },
        { id: "C", label: "C", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [
        { id: "BC", from: "B", to: "C", distance: 1, baselineTime: 1, currentTime: 1, capacity: 1200, status: "OPEN" },
      ],
    })
    const result = new DeterministicSimulator(graph, [{
      id: "release", population: 20, currentLocation: { kind: "NODE", id: "B" }, destination: "C", averageSpeed: 1,
    }], { durationSeconds: 5, timestepSeconds: 1 }).run()
    const queues = result.steps.map((step) => step.nodeMetrics.find((metric) => metric.id === "B")?.queueSize ?? 0)
    expect(queues[0]).toBe(20)
    expect(queues[queues.length - 1]).toBeLessThan(queues[0])
  })

  it("uses explicit deterministic tie-breaking and supports flexible rerouting", () => {
    const graph = {
      nodes: [
        { id: "A", label: "A", type: "ZONE" as const, capacity: 100, status: "OPEN" as const },
        { id: "B", label: "B", type: "ZONE" as const, capacity: 100, status: "OPEN" as const },
        { id: "C", label: "C", type: "ZONE" as const, capacity: 100, status: "OPEN" as const },
        { id: "D", label: "D", type: "EXIT" as const, capacity: 100, status: "OPEN" as const },
      ],
      edges: [
        { id: "E1", from: "A", to: "B", distance: 10, baselineTime: 10, currentTime: 10, capacity: 120, status: "OPEN" as const },
        { id: "E2", from: "B", to: "D", distance: 10, baselineTime: 10, currentTime: 10, capacity: 120, status: "OPEN" as const },
        { id: "F1", from: "A", to: "C", distance: 10, baselineTime: 10, currentTime: 10, capacity: 120, status: "OPEN" as const },
        { id: "F2", from: "C", to: "D", distance: 10, baselineTime: 10, currentTime: 10, capacity: 120, status: "OPEN" as const },
      ],
    }
    expect(findPath(new VenueGraph(graph), "A", "D")?.edgeIds).toEqual(["E1", "E2"])
    const result = runSandbox({
      graph,
      crowd: [{ ...crowd[0], preferredRoute: ["E1", "E2"], routeFlexibility: "FLEXIBLE" }],
      graphOverrides: [{ scope: "EDGE", targetId: "E1", status: "CLOSED" }],
      parameters: { durationSeconds: 30, timestepSeconds: 10 },
    })
    expect(result.arrivedPopulation).toBe(20)
    expect(result.final.crowd.some((group) => group.state === "DIVERTED" || group.state === "ARRIVED")).toBe(true)
  })

  it("uses actual edge usage in congestion-aware route costs", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ZONE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "ZONE", capacity: 100, status: "OPEN" },
        { id: "C", label: "C", type: "ZONE", capacity: 100, status: "OPEN" },
        { id: "D", label: "D", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [
        { id: "FAST", from: "A", to: "B", distance: 10, baselineTime: 5, currentTime: 5, capacity: 100, status: "OPEN" },
        { id: "FAST_OUT", from: "B", to: "D", distance: 10, baselineTime: 5, currentTime: 5, capacity: 100, status: "OPEN" },
        { id: "SLOW", from: "A", to: "C", distance: 10, baselineTime: 8, currentTime: 8, capacity: 100, status: "OPEN" },
        { id: "SLOW_OUT", from: "C", to: "D", distance: 10, baselineTime: 8, currentTime: 8, capacity: 100, status: "OPEN" },
      ],
    })
    expect(findPath(graph, "A", "D", new Map([["FAST", 100]])).edgeIds).toEqual(["SLOW", "SLOW_OUT"])
  })

  it("applies all supported disruption effects without silently changing restrictions into closures", () => {
    const changed = new VenueGraph(graphInput).withOverrides([], [
      { id: "CAP", type: "REDUCED_CAPACITY", affectedEdges: ["AB"], capacity: 10, status: "ACTIVE" },
      { id: "TIME", type: "INCREASED_TRAVEL_TIME", affectedEdges: ["AB"], travelTime: 30, status: "ACTIVE" },
      { id: "ZONE", type: "RESTRICTED_ZONE", affectedNodes: ["B"], restriction: "SECURITY", status: "ACTIVE" },
    ])
    expect(changed.edge("AB")?.operationalCapacity).toBe(10)
    expect(changed.edge("AB")?.currentTime).toBe(30)
    expect(changed.node("B")?.status).toBe("OPEN")
    expect(changed.node("B")?.restrictions).toEqual(["SECURITY"])
    expect(new VenueGraph(graphInput).withOverrides([], [
      { id: "EXIT", type: "EMERGENCY_EXIT_UNAVAILABLE", affectedNodes: ["C"], status: "ACTIVE" },
    ]).node("C")?.status).toBe("CLOSED")
  })

  it("applies validated EV-008 operational effects only in the scenario graph", () => {
    const effect = {
      targetType: "EDGE" as const,
      targetId: "AB",
      parameter: "capacity" as const,
      previousValue: 60,
      proposedValue: 15,
      appliedValue: 15,
      effectStatus: "APPLIED" as const,
    }
    const result = runSandbox({
      graph: graphInput,
      crowd,
      disruptions: [{
        id: "EFFECT_01", type: "BLOCKED_CORRIDOR", affectedEdges: ["AB"],
        status: "ACTIVE", startTime: "2026-09-24T00:00:00Z",
        operationalEffects: [effect],
      }],
      parameters: { durationSeconds: 0, timestepSeconds: 10 },
    })
    expect(result.final.edgeMetrics.find((metric) => metric.id === "AB")?.operationalCapacity).toBe(15)
    expect(graphInput.edges[0].capacity).toBe(60)
    expect(() => runSandbox({
      graph: graphInput,
      crowd,
      disruptions: [{
        id: "EFFECT_BAD", type: "BLOCKED_CORRIDOR", affectedEdges: ["AB"],
        status: "ACTIVE", startTime: "2026-09-24T00:00:00Z",
        operationalEffects: [{ ...effect, targetType: "EVENT", targetId: "AB" }],
      }],
    })).toThrow()
  })

  it("applies increased travel time to actual edge progress", () => {
    const slowed = new VenueGraph(graphInput).withOverrides([], [
      { id: "TIME", type: "INCREASED_TRAVEL_TIME", affectedEdges: ["AB"], travelTime: 40, status: "ACTIVE" },
    ])
    const normal = new DeterministicSimulator(new VenueGraph(graphInput), crowd, {
      durationSeconds: 20,
      timestepSeconds: 10,
    }).run()
    const delayed = new DeterministicSimulator(slowed, crowd, {
      durationSeconds: 20,
      timestepSeconds: 10,
    }).run()
    expect(delayed.final.crowd[0].progress).not.toBe(normal.final.crowd[0].progress)
  })

  it("conserves population across active state and exit arrivals", () => {
    const result = new DeterministicSimulator(new VenueGraph(graphInput), crowd, {
      durationSeconds: 40,
      timestepSeconds: 10,
    }).run()
    expect(result.finalState.population + result.arrivedPopulation).toBe(20)
  })

  it("distinguishes overflow and zero-capacity edge cases", () => {
    const node = capacityMetric({ ...graphInput.nodes[1], capacity: 50 }, 60, 0, 0, 0)
    expect(node.overflow).toBe(10)
    expect(node.overloaded).toBe(true)
    const zero = capacityMetric({ ...graphInput.nodes[1], capacity: 0 }, 1, 0, 0)
    expect(zero.utilization).toBeNull()
    expect(zero.overloaded).toBe(true)
  })

  it("rejects disconnected destinations and invalid disruption targets", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ZONE", capacity: 10, status: "OPEN" },
        { id: "B", label: "B", type: "EXIT", capacity: 10, status: "OPEN" },
      ],
      edges: [],
    })
    const result = new DeterministicSimulator(graph, [{
      id: "stranded", population: 4, currentLocation: { kind: "NODE", id: "A" }, destination: "B",
    }], { durationSeconds: 10, timestepSeconds: 5 }).run()
    expect(result.final.crowd[0].state).toBe("STOPPED")
    expect(() => graph.withOverrides([], [{ id: "D", type: "BLOCKED_CORRIDOR", affectedEdges: ["missing"], status: "ACTIVE" }])).toThrow()
  })

  it("evaluates candidates through sandbox simulation and rejects infeasible solver output", () => {
    const optimized = optimizeSimulation({
      graph: graphInput,
      crowd,
      parameters: { durationSeconds: 20, timestepSeconds: 10 },
      allowEdgeCapacityChange: true,
      minimumCapacity: { AB: 10 },
      maxCandidates: 2,
    })
    expect(optimized.status).toBe("COMPLETED")
    expect(optimized.ranked[0].simulation).not.toBeNull()
    expect(optimized.ranking).toEqual(optimized.ranked.map((candidate) => candidate.candidateId))
    expect(optimized.ranked[0].rank).toBe(1)
    expect(optimized.diagnostics?.rejectedCount).toBe(0)
    const statusCandidates = generateCandidates({ graph: graphInput, allowStatusChange: true, maxCandidates: 2 })
    expect(statusCandidates.some((candidate) => candidate.changes[0]?.parameter === "status")).toBe(true)
    const demandGraph = { ...graphInput, activeEntries: ["A"], activeExits: ["C"] }
    const demand = optimizeSimulation({
      graph: demandGraph, crowd, parameters: { durationSeconds: 0, timestepSeconds: 10 },
      allowDemandRebalancing: true, demandShares: { A: 1 }, maxCandidates: 2,
    })
    expect(demand.ranked[0]?.simulation).not.toBeNull()
    const invalid = optimizeSimulation({
      graph: graphInput,
      crowd,
      parameters: { durationSeconds: 20, timestepSeconds: 10 },
      maxCandidates: 1,
    }, undefined, {
      solve: () => [{
        id: "INVALID",
        changes: [{ scope: "EDGE", targetId: "missing", parameter: "capacity", previousValue: null, proposedValue: 1 }],
        feasible: true,
        rejectionReasons: [],
      }],
    })
    expect(invalid.status).toBe("NO_FEASIBLE_CANDIDATES")
    expect(invalid.rejected[0].rejectionReasons).toContain("UNKNOWN_ENTITY")
    const constrained = optimizeSimulation({
      graph: graphInput,
      crowd,
      minimumCapacity: { AB: 50 },
      excludedEntities: ["AB"],
      maxStatusChanges: 0,
    }, undefined, {
      solve: () => [{
        id: "CONSTRAINED",
        changes: [{ scope: "EDGE", targetId: "AB", parameter: "capacity", previousValue: 60, proposedValue: 10 }],
        feasible: true,
        rejectionReasons: [],
      }],
    })
    expect(constrained.rejected[0].rejectionReasons).toContain("EXCLUDED_ENTITY")
    expect(constrained.rejected[0].rejectionReasons).toContain("CAPACITY_OUT_OF_BOUNDS")
  })

  it("applies scenario metadata, crowd overrides, and interventions in an isolated run", () => {
    const result = runSandbox({
      graph: graphInput,
      crowd,
      scenario: {
        id: "SCENARIO_001",
        name: "Reduced route",
        baseline: "CURRENT_GRAPH",
        startTime: "2026-09-24T00:00:00Z",
        duration: 20,
        stepSeconds: 10,
        crowdOverrides: [{ groupId: "group-1", population: 5 }],
        interventions: [{ parameter: "capacity", targetType: "EDGE", targetId: "AB", proposedValue: 10 }],
      },
    })
    expect(result.scenarioId).toBe("SCENARIO_001")
    expect(result.baseline).toBe("CURRENT_GRAPH")
    expect(result.timeline).toHaveLength(3)
    expect(graphInput.edges[0].capacity).toBe(60)
  })

  it("compares sandbox scenarios in deterministic scenario-id order", () => {
    const baseline = {
      graph: graphInput,
      crowd,
      parameters: { durationSeconds: 20, timestepSeconds: 10 },
      scenario: {
        id: "SCENARIO_A", name: "baseline", baseline: "CURRENT_GRAPH" as const,
        startTime: "2026-09-24T00:00:00Z", duration: 20,
      },
    }
    const blocked = {
      ...baseline,
      scenario: { ...baseline.scenario, id: "SCENARIO_B", name: "blocked" },
      disruptions: [{ id: "D", type: "BLOCKED_CORRIDOR" as const, affectedEdges: ["AB"], status: "ACTIVE" as const, startTime: "2026-09-24T00:00:00Z" }],
    }
    const comparison = compareScenarios([blocked, baseline])
    expect(comparison.baselineScenarioId).toBe("SCENARIO_A")
    expect(comparison.results.map((result) => result.scenarioId)).toEqual(["SCENARIO_A", "SCENARIO_B"])
    expect(comparison.impact[1].arrivedPopulationDelta).toBeLessThanOrEqual(0)
  })

  it("handles zero crowd and preserves physical versus operational capacity", () => {
    const graph = new VenueGraph(graphInput).withOverrides([
      { scope: "EDGE", targetId: "AB", capacity: 10 },
    ])
    const result = new DeterministicSimulator(graph, [], { durationSeconds: 0, timestepSeconds: 10 }).run()
    expect(result.arrivedPopulation).toBe(0)
    expect(result.final.edgeMetrics[0].physicalCapacity).toBe(60)
    expect(result.final.edgeMetrics[0].operationalCapacity).toBe(10)
    expect(result.final.edgeMetrics[0].currentOccupancy).toBe(0)
    expect(result.final.edgeMetrics[0].flow).toBe(0)
  })

  it("uses an explicit snake_case serialization boundary for P3 payloads", () => {
    const result = runSandbox({ graph: graphInput, crowd, parameters: { durationSeconds: 0, timestepSeconds: 10 } })
    const graph = serializeGraph(graphInput)
    const payload = serializeSimulationResult(result)
    expect((graph.nodes[1] as Record<string, unknown>).throughput_capacity).toBe(60)
    expect(payload).toHaveProperty("arrived_population")
    expect(payload).toHaveProperty("timeline")
    expect(payload).toHaveProperty("timeline.0.node_metrics.0.density_state")
    expect(payload).not.toHaveProperty("arrivedPopulation")
  })

  it("returns the complete deterministic EV-011 identity, clock, metrics and state contract", () => {
    const result = runSandbox({
      graph: graphInput, crowd, scenario: {
        id: "SCENARIO_CONTRACT", name: "contract", baseline: "CURRENT_GRAPH",
        startTime: "2026-09-24T00:00:00Z", duration: 20, stepSeconds: 10,
      },
    })

    expect(result.id).toBe("SIMULATION_RESULT_SCENARIO_CONTRACT")
    expect(result.strategyId).toBeNull()
    expect(result.simulatedStartTime).toBe("2026-09-24T00:00:00.000Z")
    expect(result.simulatedEndTime).toBe("2026-09-24T00:00:20.000Z")
    expect(result.metrics.duration).toBe(20)
    expect(result.scopedMetrics.some((metric) => metric.metric === "population")).toBe(true)
    expect(result.finalState.population).toBe(20)
    expect(Array.isArray(result.events)).toBe(true)
    expect(result.warnings.every((warning) => typeof warning.code === "string")).toBe(true)
  })

  it("rejects invalid EV-006 topology and edge capacities", () => {
    expect(() => new VenueGraph({
      ...graphInput,
      edges: [{ ...graphInput.edges[0], from: "A", to: "A" }],
    })).toThrow("Self-loop")
    expect(() => new VenueGraph({
      ...graphInput,
      edges: [{ ...graphInput.edges[0], capacity: Number.NaN }],
    })).toThrow("Invalid capacity")
    expect(() => new VenueGraph({
      ...graphInput,
      nodes: [{ ...graphInput.nodes[0], type: "CORRIDOR" as never }, ...graphInput.nodes.slice(1)],
    })).toThrow("Invalid node type")
  })

  it("applies canonical disruption effects with restrictive conflict resolution", () => {
    const graph = new VenueGraph(graphInput).withOverrides([], [
      {
        id: "OPENING", type: "GATE_CLOSURE", affectedEdges: ["AB"], status: "ACTIVE",
        operationalEffects: [{
          targetType: "EDGE", targetId: "AB", parameter: "capacity",
          previousValue: 60, proposedValue: 40, appliedValue: 40, effectStatus: "APPLIED",
        }],
      },
      {
        id: "MORE_RESTRICTIVE", type: "ROAD_CLOSURE", affectedEdges: ["AB"], status: "ACTIVE",
        operationalEffects: [{
          targetType: "EDGE", targetId: "AB", parameter: "capacity",
          previousValue: 60, proposedValue: 10, appliedValue: 10, effectStatus: "APPLIED",
        }],
      },
    ])
    expect(graph.edge("AB")?.status).toBe("CLOSED")
    expect(graph.edge("AB")?.operationalCapacity).toBe(10)
  })

  it("marks incompatible scenario comparisons instead of silently comparing them", () => {
    const make = (id: string, duration: number) => ({
      graph: graphInput, crowd, parameters: { durationSeconds: duration, timestepSeconds: 10, seed: 7 },
      scenario: { id, name: id, baseline: "CURRENT_GRAPH" as const, startTime: "2026-09-24T00:00:00Z", duration },
    })
    const comparison = compareScenarios([make("A", 20), make("B", 30)])
    expect(comparison.valid).toBe(false)
    expect(comparison.warnings).toContain("INCOMPATIBLE_DURATION")
    expect(comparison.metricMatrix?.arrived_population).toHaveProperty("A")
  })

  it("emits queue-stalled and overload transitions from real state", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ENTRANCE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "CHECKPOINT", capacity: 5, throughputCapacity: 0, status: "OPEN" },
        { id: "C", label: "C", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [
        { id: "AB", from: "A", to: "B", distance: 1, baselineTime: 1, currentTime: 1, capacity: 1200, status: "OPEN" },
        { id: "BC", from: "B", to: "C", distance: 1, baselineTime: 1, currentTime: 1, capacity: 1200, status: "OPEN" },
      ],
    })

    const result = new DeterministicSimulator(graph, [{
      id: "queue-event", population: 20, currentLocation: { kind: "NODE", id: "B" }, destination: "C", averageSpeed: 1,
    }], { durationSeconds: 5, timestepSeconds: 1 }).run()
    expect(result.events.some((event) => event.type === "QUEUE_STALLED")).toBe(true)
    expect(result.warnings.some((warning) => warning.code === "QUEUE_STALLED")).toBe(true)
    expect(result.finalState.population).toBe(20)
  })

  it("emits density transitions and explicit exit sink releases", () => {
    const result = new DeterministicSimulator(new VenueGraph(graphInput), crowd, {
      durationSeconds: 40,
      timestepSeconds: 10,
      densityHighThreshold: 0.5,
      densityCriticalThreshold: 0.9,
    }).run()
    expect(result.events.some((event) => event.type === "HIGH_DENSITY")).toBe(true)
    expect(result.events.some((event) => event.type === "SINK_RELEASE")).toBe(true)
  })

  it("requires configured consecutive queue growth intervals before warning", () => {
    const graph = new VenueGraph({
      nodes: [
        { id: "A", label: "A", type: "ZONE", capacity: 100, status: "OPEN" },
        { id: "B", label: "B", type: "CHECKPOINT", capacity: 100, throughputCapacity: 0, status: "OPEN" },
        { id: "C", label: "C", type: "EXIT", capacity: 100, status: "OPEN" },
      ],
      edges: [
        { id: "AB", from: "A", to: "B", distance: 1, baselineTime: 1, currentTime: 1, capacity: 1200, status: "OPEN" },
        { id: "BC", from: "B", to: "C", distance: 1, baselineTime: 1, currentTime: 1, capacity: 1200, status: "OPEN" },
      ],
    })
    const result = new DeterministicSimulator(graph, [
      { id: "queue-growth-a", population: 10, currentLocation: { kind: "NODE", id: "A" }, destination: "C", averageSpeed: 1 },
      { id: "queue-growth-b", population: 10, currentLocation: { kind: "NODE", id: "B" }, destination: "C", averageSpeed: 1 },
    ], { durationSeconds: 5, timestepSeconds: 1, queueWarningIntervals: 1 }).run()
    expect(result.warnings.some((warning) => warning.code === "QUEUE_INCREASING")).toBe(true)
  })

  it("activates and resolves scheduled disruptions on the simulated clock", () => {
    const result = runSandbox({
      graph: graphInput, crowd, scenario: {
        id: "SCENARIO_SCHEDULED", name: "scheduled", baseline: "CURRENT_GRAPH",
        startTime: "2026-09-24T00:00:00Z", duration: 30, stepSeconds: 10,
        disruptionOverrides: [{
          id: "SCHEDULED", type: "BLOCKED_CORRIDOR", affectedEdges: ["AB"],
          status: "DETECTED", startTime: "2026-09-24T00:00:10Z", expectedDuration: 10, source: "SIMULATION",
        }],
      },
    })
    expect(result.events.map((event) => event.type)).toContain("DISRUPTION_ACTIVATED")
    expect(result.events.map((event) => event.type)).toContain("DISRUPTION_RESOLVED")
    expect(result.events.find((event) => event.type === "DISRUPTION_ACTIVATED")?.simTime).toBe("2026-09-24T00:00:10.000Z")
    expect(result.events.find((event) => event.type === "DISRUPTION_ACTIVATED")?.detail).toMatchObject({
      disruption_type: "BLOCKED_CORRIDOR", affected_edges: ["AB"],
    })
    expect(result.events.filter((event) => event.simTime === "2026-09-24T00:00:10.000Z").map((event) => event.type)[0])
      .toBe("DISRUPTION_ACTIVATED")
  })

  it("rejects invalid scenarios before execution", () => {
    expect(() => runSandbox({
      graph: graphInput, crowd, scenario: {
        id: "BAD", name: "", baseline: "CURRENT_GRAPH", startTime: "not-a-time", duration: -1,
      },
    })).toThrow()
  })

  it("records external population adjustments separately from physical transfers", () => {
    const result = runSandbox({
      graph: graphInput,
      crowd: [],
      adjustments: [{
        id: "INJECT_1", reason: "SCENARIO_INJECTION", scope: "NODE", targetId: "A",
        amount: 3, destination: "C", timestamp: "2026-09-24T00:00:00Z",
      }],
      parameters: { durationSeconds: 0, timestepSeconds: 10 },
    })
    expect(result.metrics.population).toBe(3)
    expect(result.events.find((event) => event.type === "EXTERNAL_CROWD_UPDATE")?.detail).toMatchObject({
      reason: "SCENARIO_INJECTION", signed_amount: 3,
    })
  })

  it("returns structured failure results at the safe sandbox boundary", () => {
    const result = runSandboxSafe({
      graph: graphInput, crowd,
      scenario: { id: "INVALID_SAFE", name: "", baseline: "CURRENT_GRAPH", startTime: "bad", duration: -1 },
    })
    expect(result.status).toBe("INVALID_SCENARIO")
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.metrics.population).toBe(0)
  })
})
