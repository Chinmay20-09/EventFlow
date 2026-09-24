import type { CrowdGroupResult, SimulationResult, VenueGraphInput } from "./types"

/** Explicit P3-facing graph serialization; internal domain names remain camelCase. */
export function serializeGraph(graph: VenueGraphInput): Record<string, unknown> {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      ...(node.latitude === undefined ? {} : { latitude: node.latitude }),
      ...(node.longitude === undefined ? {} : { longitude: node.longitude }),
      capacity: node.capacity,
      operational_capacity: node.operationalCapacity ?? null,
      throughput_capacity: node.throughputCapacity ?? null,
      status: node.status ?? "OPEN",
      restrictions: node.restrictions ?? [],
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      ...(edge.label === undefined ? {} : { label: edge.label }),
      from: edge.from,
      to: edge.to,
      distance: edge.distance,
      baseline_time: edge.baselineTime,
      current_time: edge.currentTime ?? edge.baselineTime,
      capacity: edge.capacity,
      operational_capacity: edge.operationalCapacity ?? null,
      status: edge.status ?? "OPEN",
      restrictions: edge.restrictions ?? [],
    })),
    active_entries: graph.activeEntries ?? [],
    active_exits: graph.activeExits ?? [],
  }
}

export function serializeCrowdGroup(group: CrowdGroupResult): Record<string, unknown> {
  return {
    id: group.id,
    source_id: group.sourceId ?? group.id,
    population: group.population,
    current_location: group.currentLocation,
    destination: group.destination,
    average_speed: group.averageSpeed,
    movement_rate: group.movementRate ?? 0,
    preferred_route: group.preferredRoute ?? [],
    assigned_route: group.assignedRoute ?? [],
    route_flexibility: group.routeFlexibility,
    state: group.state,
    progress: group.progress,
    waiting_time: group.waitingTime,
    travel_time: group.travelTime,
  }
}

/** Serializes the implemented result subset without pretending to fill absent EV-011 fields. */
export function serializeSimulationResult(result: SimulationResult): Record<string, unknown> {
  return {
    status: result.status,
    scenario_id: result.scenarioId ?? null,
    baseline: result.baseline ?? null,
    baseline_ref: result.baselineRef ?? null,
    seed: result.seed ?? 0,
    duration: result.durationSeconds,
    affected_nodes: result.affectedNodes,
    affected_edges: result.affectedEdges,
    affected_groups: result.affectedGroups,
    bottlenecks: result.bottlenecks,
    capacity_violations: result.capacityViolations,
    queue_growth: result.queueGrowth,
    estimated_delay_seconds: result.estimatedDelaySeconds,
    arrived_population: result.arrivedPopulation,
    stranded_population: result.strandedPopulation,
    timeline: result.steps.map((step) => ({
      time_seconds: step.timeSeconds,
      node_metrics: step.nodeMetrics,
      edge_metrics: step.edgeMetrics,
      crowd: step.crowd.map(serializeCrowdGroup),
    })),
    diagnostics: result.diagnostics,
    warnings: result.warnings ?? [],
  }
}
