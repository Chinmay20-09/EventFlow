import type { CapacityMetric, CrowdGroupResult, SimulationResult, VenueGraphInput } from "./types"

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

export function serializeSimulationResult(result: SimulationResult): Record<string, unknown> {
  return {
    id: result.id,
    status: result.status,
    scenario_id: result.scenarioId,
    strategy_id: result.strategyId,
    baseline: result.baseline,
    baseline_ref: result.baselineRef,
    seed: result.seed,
    simulated_start_time: result.simulatedStartTime,
    simulated_end_time: result.simulatedEndTime,
    duration: result.durationSeconds,
    metrics: {
      population: result.metrics.population, occupancy: result.metrics.occupancy, flow: result.metrics.flow,
      density: result.metrics.density, queue_size: result.metrics.queueSize, waiting_time: result.metrics.waitingTime,
      travel_time: result.metrics.travelTime, arrived_population: result.metrics.arrivedPopulation,
      diverted_population: result.metrics.divertedPopulation, congestion: result.metrics.congestion,
      capacity_utilization: result.metrics.capacityUtilization, throughput: result.metrics.throughput,
      intervention_impact: result.metrics.interventionImpact, time_to_congestion: result.metrics.timeToCongestion,
      peak_congestion: result.metrics.peakCongestion, peak_queue: result.metrics.peakQueue,
      recovery_time: result.metrics.recoveryTime, duration: result.metrics.duration,
    },
    scoped_metrics: result.scopedMetrics.map((metric) => ({
      metric: metric.metric, target_type: metric.targetType, target_id: metric.targetId,
      aggregation: metric.aggregation, value: metric.value, unit: metric.unit,
    })),
    final_state: {
      population: result.finalState.population, overloaded_nodes: result.finalState.overloadedNodes,
      overloaded_edges: result.finalState.overloadedEdges, active_scenario_disruptions: result.finalState.activeScenarioDisruptions,
      affected_entity_status: result.finalState.affectedEntityStatus,
    },
    events: result.events.map((event) => ({
      sim_time: event.simTime, type: event.type, target_type: event.targetType, target_id: event.targetId, detail: event.detail,
    })),
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
      node_metrics: step.nodeMetrics.map(serializeMetric),
      edge_metrics: step.edgeMetrics.map(serializeMetric),
      crowd: step.crowd.map(serializeCrowdGroup),
    })),
    diagnostics: result.diagnostics,
    warnings: result.warnings,
  }
}

function serializeMetric(metric: CapacityMetric): Record<string, unknown> {
  return {
    id: metric.id,
    physical_capacity: metric.physicalCapacity,
    operational_capacity: metric.operationalCapacity,
    current_occupancy: metric.currentOccupancy,
    inflow: metric.inflow,
    outflow: metric.outflow,
    utilization: metric.utilization,
    queue_size: metric.queueSize,
    overflow: metric.overflow,
    bottleneck: metric.bottleneck,
    flow: metric.flow,
    holding_utilization: metric.holdingUtilization,
    service_utilization: metric.serviceUtilization,
    flow_utilization: metric.flowUtilization,
    overloaded: metric.overloaded,
    density: metric.density,
    density_state: metric.densityState,
  }
}
