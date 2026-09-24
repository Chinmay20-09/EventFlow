import { describe, expect, it } from "vitest"
import {
  DeterministicSimulator,
  VenueGraph,
  capacityMetric,
  findPath,
  generateCandidates,
  optimizeSimulation,
  runSandbox,
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
    expect(JSON.parse(JSON.stringify(graph)).nodes).toHaveLength(3)
    expect(() => new VenueGraph({ ...graphInput, edges: [{ ...graphInput.edges[0], from: "missing" }] })).toThrow()
  })

  it("calculates capacity metrics without conflating null capacity", () => {
    expect(capacityMetric(graphInput.nodes[1], 50, 10, 5, 12)).toMatchObject({
      physicalCapacity: 50, operationalCapacity: 50, currentOccupancy: 50, queueSize: 12, overflow: 0, bottleneck: true,
    })
    expect(capacityMetric({ ...graphInput.nodes[1], capacity: null }, 999, 0, 0).utilization).toBeNull()
  })

  it("propagates a crowd and changes outcomes after an edge disruption", () => {
    const baseline = new DeterministicSimulator(new VenueGraph(graphInput), crowd, { durationSeconds: 40, timestepSeconds: 10 }).run()
    const blocked = runSandbox({
      graph: graphInput, crowd, parameters: { durationSeconds: 40, timestepSeconds: 10 },
      disruptions: [{ id: "D1", type: "BLOCKED_CORRIDOR", affectedEdges: ["AB"], status: "ACTIVE" }],
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
    const invalid = optimizeSimulation({
      graph: graphInput,
      crowd,
      parameters: { durationSeconds: 20, timestepSeconds: 10 },
      maxCandidates: 1,
    }, undefined, {
      generate: () => [{
        id: "INVALID",
        changes: [{ scope: "EDGE", targetId: "missing", parameter: "capacity", previousValue: null, proposedValue: 1 }],
        feasible: true,
        rejectionReasons: [],
      }],
    })
    expect(invalid.status).toBe("NO_FEASIBLE_CANDIDATES")
    expect(invalid.rejected[0].rejectionReasons).toContain("UNKNOWN_ENTITY")
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
})
