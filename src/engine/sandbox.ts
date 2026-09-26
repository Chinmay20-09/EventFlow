import { DeterministicSimulator } from "./simulation"
import { VenueGraph } from "./graph"
import type { CrowdGroupInput, Intervention, SandboxInput, ScenarioComparison, ScenarioInput, SimulationResult } from "./types"

export function runSandbox(input: SandboxInput): SimulationResult {
  const scenario = input.scenario
  if (scenario) validateScenario(scenario)
  if (scenario?.baseline === "CAPTURED_STATE" && !scenario.baselineRef) {
    throw new Error(`Scenario ${scenario.id} requires baselineRef for CAPTURED_STATE`)
  }
  const scenarioOverrides = scenario?.graphOverrides ?? []
  const interventions = scenario?.interventions ?? []
  const interventionOverrides = interventions.filter((intervention) => intervention.parameter !== "demand_share").map(toGraphOverride)
  if (interventions.some((intervention) => intervention.parameter === "demand_share")) {
    throw new Error("demand_share interventions require entrance-generated demand support")
  }
  const baseGraph = new VenueGraph(input.graph).withOverrides(
    [...(input.graphOverrides ?? []), ...scenarioOverrides, ...interventionOverrides], [])
  const disruptions = [...(input.disruptions ?? []), ...(scenario?.disruptionOverrides ?? [])]
  validateDisruptions(disruptions, baseGraph, scenario?.startTime)
  const graph = baseGraph.withOverrides([], disruptions.filter((disruption) => disruption.status === "ACTIVE" && !scenario))
  const crowd = applyCrowdOverrides(input.crowd, scenario?.crowdOverrides ?? [])
  const parameters = {
    ...input.parameters,
    ...(scenario?.duration !== undefined ? { durationSeconds: scenario.duration } : {}),
    ...(scenario?.stepSeconds !== undefined ? { timestepSeconds: scenario.stepSeconds } : {}),
    ...(scenario?.startTime !== undefined ? { simulatedStartTime: scenario.startTime } : {}),
  }
  const startMs = scenario ? Date.parse(scenario.startTime) : Date.parse(parameters.simulatedStartTime ?? "1970-01-01T00:00:00.000Z")
  const simulator = new DeterministicSimulator(graph, crowd, parameters, scenario ? {
    graphAtTime: (seconds) => {
      const active = disruptions.filter((disruption) => {
        const at = disruption.startTime ? Date.parse(disruption.startTime) : startMs
        const end = disruption.expectedDuration === undefined ? Number.POSITIVE_INFINITY : at + disruption.expectedDuration * 1000
        return (disruption.status === "ACTIVE" || disruption.status === "DETECTED") && startMs + seconds * 1000 >= at && startMs + seconds * 1000 < end
      })
      return baseGraph.withOverrides([], active.map((disruption) => ({ ...disruption, status: "ACTIVE" })))
    },
  } : undefined)
  const result = simulator.run()
  const activeDisruptions = disruptions.filter((disruption) => disruption.status === "ACTIVE")
  const affectedNodes = [...new Set([
    ...result.affectedNodes,
    ...activeDisruptions.flatMap((disruption) => disruption.affectedNodes ?? []),
  ])].sort(compareIds)
  const affectedEdges = [...new Set([
    ...result.affectedEdges,
    ...activeDisruptions.flatMap((disruption) => disruption.affectedEdges ?? []),
  ])].sort(compareIds)
  const enriched = { ...result, affectedNodes, affectedEdges }
  if (!scenario) return enriched
  return {
    ...enriched,
    timeline: result.steps,
    id: `SIMULATION_RESULT_${scenario.id}`,
    scenarioId: scenario.id,
    strategyId: scenario.strategyId ?? null,
    baseline: scenario.baseline,
    baselineRef: scenario.baselineRef ?? null,
    simulatedStartTime: new Date(startMs).toISOString(),
    simulatedEndTime: new Date(startMs + result.durationSeconds * 1000).toISOString(),
    metrics: result.metrics,
    scopedMetrics: result.scopedMetrics,
    finalState: { ...result.finalState, activeScenarioDisruptions: activeDisruptions.map((d) => d.id).sort(compareIds) },
    events: [
      ...disruptions.flatMap((disruption) => {
        const at = disruption.startTime ? Date.parse(disruption.startTime) : startMs
        const end = disruption.expectedDuration === undefined ? null : at + disruption.expectedDuration * 1000
        const out = at >= startMs && at <= startMs + result.durationSeconds * 1000 ? [{
          simTime: new Date(at).toISOString(), type: "DISRUPTION_ACTIVATED", targetType: "EVENT" as const, targetId: disruption.id, detail: {},
        }] : []
        if (end !== null && end <= startMs + result.durationSeconds * 1000) out.push({
          simTime: new Date(end).toISOString(), type: "DISRUPTION_RESOLVED", targetType: "EVENT" as const, targetId: disruption.id, detail: {},
        })
        return out
      }), ...result.events,
    ].sort((a, b) => a.simTime < b.simTime ? -1 : a.simTime > b.simTime ? 1 : a.type < b.type ? -1 : 1),
  }
}

export function runBaseline(input: Omit<SandboxInput, "disruptions" | "graphOverrides">): SimulationResult {
  return runSandbox(input)
}

export function compareScenarios(inputs: SandboxInput[]): ScenarioComparison {
  if (inputs.length === 0) throw new Error("At least one scenario is required")
  const results = inputs.slice().sort((a, b) => compareIds(a.scenario?.id ?? "", b.scenario?.id ?? "")).map(runSandbox)
  const baseline = results[0]
  return {
    baselineScenarioId: baseline.scenarioId ?? "BASELINE",
    results,
    impact: results.map((result) => ({
      scenarioId: result.scenarioId ?? "BASELINE",
      arrivedPopulationDelta: result.arrivedPopulation - baseline.arrivedPopulation,
      estimatedDelaySecondsDelta: result.estimatedDelaySeconds - baseline.estimatedDelaySeconds,
    })),
  }
}

function toGraphOverride(intervention: Intervention) {
  if (intervention.targetType === "EDGE" && intervention.parameter === "throughput_capacity") {
    throw new Error(`Invalid throughput_capacity target: ${intervention.targetId}`)
  }
  return {
    scope: intervention.targetType,
    targetId: intervention.targetId,
    ...(intervention.parameter === "status" ? { status: intervention.proposedValue as "OPEN" | "CLOSED" } : {}),
    ...(intervention.parameter === "capacity" ? { capacity: Number(intervention.proposedValue) } : {}),
    ...(intervention.parameter === "throughput_capacity" ? { throughputCapacity: Number(intervention.proposedValue) } : {}),
  } as const
}

function applyCrowdOverrides(groups: CrowdGroupInput[], overrides: NonNullable<ScenarioInput["crowdOverrides"]>): CrowdGroupInput[] {
  const result = groups.map((group) => ({ ...group, currentLocation: { ...group.currentLocation } }))
  for (const override of overrides.slice().sort((a, b) => compareIds(a.groupId ?? "", b.groupId ?? ""))) {
    if (!override.groupId) {
      if (override.population === undefined || !override.currentLocation || !override.destination) {
        throw new Error("A new crowd override requires population, currentLocation, and destination")
      }
      result.push({
        id: `SCENARIO_GROUP_${String(result.length + 1).padStart(3, "0")}`,
        population: override.population,
        currentLocation: override.currentLocation,
        destination: override.destination,
        averageSpeed: override.averageSpeed,
        assignedRoute: override.assignedRoute,
        routeFlexibility: override.routeFlexibility,
        progress: override.progress,
      })
      continue
    }
    const group = result.find((candidate) => candidate.id === override.groupId)
    if (!group) throw new Error(`Unknown crowd override group: ${override.groupId}`)
    if (override.population !== undefined) group.population = override.population
    if (override.currentLocation !== undefined) group.currentLocation = override.currentLocation
    if (override.destination !== undefined) group.destination = override.destination
    if (override.averageSpeed !== undefined) group.averageSpeed = override.averageSpeed
    if (override.assignedRoute !== undefined) group.assignedRoute = [...override.assignedRoute]
    if (override.routeFlexibility !== undefined) group.routeFlexibility = override.routeFlexibility
    if (override.progress !== undefined) group.progress = override.progress
  }
  return result
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function validateScenario(scenario: ScenarioInput): void {
  if (!scenario.id || !scenario.name || !scenario.startTime || !Number.isFinite(Date.parse(scenario.startTime))) {
    throw new Error(`Invalid scenario ${scenario.id || "<unknown>"}`)
  }
  if (!Number.isInteger(scenario.duration) || scenario.duration < 0) throw new Error(`Invalid duration for scenario ${scenario.id}`)
  if (scenario.baseline === "CAPTURED_STATE" && !scenario.baselineRef) throw new Error(`Scenario ${scenario.id} requires baselineRef for CAPTURED_STATE`)
  if (scenario.baseline !== "CAPTURED_STATE" && scenario.baselineRef !== undefined && scenario.baselineRef !== null) throw new Error(`baselineRef is only valid for CAPTURED_STATE`)
  if (scenario.stepSeconds !== undefined && (!Number.isInteger(scenario.stepSeconds) || scenario.stepSeconds <= 0)) throw new Error(`Invalid stepSeconds for scenario ${scenario.id}`)
}

function validateDisruptions(disruptions: NonNullable<SandboxInput["disruptions"]>, graph: VenueGraph, scenarioStart?: string): void {
  if (scenarioStart !== undefined && !Number.isFinite(Date.parse(scenarioStart))) throw new Error("Invalid scenario start time")
  for (const disruption of disruptions) {
    if (!disruption.id || !disruption.type || !["DETECTED", "ACTIVE", "RESOLVED"].includes(disruption.status ?? "")) {
      throw new Error(`Invalid disruption ${disruption.id || "<unknown>"}`)
    }
    if (!disruption.startTime || !Number.isFinite(Date.parse(disruption.startTime))) {
      throw new Error(`Invalid startTime for disruption ${disruption.id}`)
    }
    if (disruption.expectedDuration !== undefined
      && (!Number.isInteger(disruption.expectedDuration) || disruption.expectedDuration < 0)) {
      throw new Error(`Invalid expectedDuration for disruption ${disruption.id}`)
    }
    validateOperationalEffects(disruption)
    for (const nodeId of disruption.affectedNodes ?? []) {
      if (!graph.node(nodeId)) throw new Error(`Unknown disruption node target: ${nodeId}`)
    }

    function validateOperationalEffects(disruption: NonNullable<SandboxInput["disruptions"]>[number]): void {
      for (const effect of disruption.operationalEffects ?? []) {
        if (effect.targetType === "EVENT" && effect.targetId !== null) {
          throw new Error(`Event effect ${disruption.id} must use a null targetId`)
        }
        if (effect.targetType !== "EVENT" && !effect.targetId) {
          throw new Error(`Graph effect ${disruption.id} requires a targetId`)
        }
        if (effect.parameter === "status"
          && effect.proposedValue !== "OPEN" && effect.proposedValue !== "CLOSED") {
          throw new Error(`Invalid status effect for disruption ${disruption.id}`)
        }
        if ((effect.parameter === "capacity" || effect.parameter === "throughput_capacity")
          && (typeof effect.proposedValue !== "number" || !Number.isFinite(effect.proposedValue) || effect.proposedValue < 0)) {
          throw new Error(`Invalid capacity effect for disruption ${disruption.id}`)
        }
        if (effect.effectStatus === "APPLIED" && effect.appliedValue === undefined) {
          throw new Error(`Applied effect ${disruption.id} requires appliedValue`)
        }
        if (effect.appliedAt != null && !Number.isFinite(Date.parse(effect.appliedAt))) {
          throw new Error(`Invalid appliedAt for disruption ${disruption.id}`)
        }
      }
    }
    for (const edgeId of disruption.affectedEdges ?? []) {
      if (!graph.edge(edgeId)) throw new Error(`Unknown disruption edge target: ${edgeId}`)
    }
  }
}
