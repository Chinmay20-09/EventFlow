import { DeterministicSimulator } from "./simulation"
import { VenueGraph } from "./graph"
import type {
  CrowdGroupInput, Intervention, PopulationAdjustment, SandboxInput, ScenarioComparison, ScenarioInput,
  SimulationResult, SimulationStep,
} from "./types"

export function runSandbox(input: SandboxInput): SimulationResult {
  const scenario = input.scenario
  if (scenario) validateScenario(scenario)
  if (scenario?.baseline === "CAPTURED_STATE" && !scenario.baselineRef) {
    throw new Error(`Scenario ${scenario.id} requires baselineRef for CAPTURED_STATE`)
  }

  const scenarioOverrides = scenario?.graphOverrides ?? []
  const interventions = scenario?.interventions ?? []
  const interventionOverrides = interventions.filter((intervention) => intervention.parameter !== "demand_share").map(toGraphOverride)
  const baseGraph = new VenueGraph(input.graph).withOverrides(
    [...(input.graphOverrides ?? []), ...scenarioOverrides, ...interventionOverrides], [])
  const disruptions = [...(input.disruptions ?? []), ...(scenario?.disruptionOverrides ?? [])]
  validateDisruptions(disruptions, baseGraph, scenario?.startTime)
  const graph = baseGraph.withOverrides([], disruptions.filter((disruption) => disruption.status === "ACTIVE" && !scenario))
  const demandInterventions = interventions.filter((intervention) => intervention.parameter === "demand_share")
  const crowd = applyDemandShares(
    applyCrowdOverrides(applyAdjustments(input.crowd, input.adjustments ?? [], baseGraph), scenario?.crowdOverrides ?? []),
    demandInterventions,
    baseGraph,
  )
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
  const adjustmentEvents = (input.adjustments ?? []).slice().sort((a, b) => compareIds(a.id, b.id)).map((adjustment) => ({
    simTime: adjustment.timestamp ?? parameters.simulatedStartTime ?? "1970-01-01T00:00:00.000Z",
    type: "EXTERNAL_CROWD_UPDATE",
    targetType: adjustment.scope,
    targetId: adjustment.targetId,
    detail: { adjustment_id: adjustment.id, reason: adjustment.reason, signed_amount: adjustment.amount },
  }))
  const endMs = startMs + result.durationSeconds * 1000
  const activeDisruptions = disruptions.filter((disruption) => isActiveAt(disruption, endMs, startMs))
  const affectedNodes = [...new Set([
    ...result.affectedNodes,
    ...activeDisruptions.flatMap((disruption) => disruption.affectedNodes ?? []),
  ])].sort(compareIds)
  const affectedEdges = [...new Set([
    ...result.affectedEdges,
    ...activeDisruptions.flatMap((disruption) => disruption.affectedEdges ?? []),
  ])].sort(compareIds)
  const enriched = { ...result, affectedNodes, affectedEdges, events: [...result.events, ...adjustmentEvents].sort(compareEvents) }
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
        const out: Array<{ simTime: string; type: string; targetType: "EVENT"; targetId: string; detail: Record<string, unknown> }> =
          disruption.status !== "RESOLVED" && at >= startMs && at <= endMs ? [{
          simTime: new Date(at).toISOString(), type: "DISRUPTION_ACTIVATED", targetType: "EVENT" as const, targetId: disruption.id,
          detail: { disruption_type: disruption.type, affected_nodes: disruption.affectedNodes ?? [], affected_edges: disruption.affectedEdges ?? [] },
        }] : []
        const resolvedAt = disruption.resolvedAt ? Date.parse(disruption.resolvedAt) : end
        if (resolvedAt !== null && resolvedAt >= startMs && resolvedAt <= endMs) out.push({
          simTime: new Date(resolvedAt).toISOString(), type: "DISRUPTION_RESOLVED", targetType: "EVENT" as const, targetId: disruption.id,
          detail: { disruption_type: disruption.type, affected_nodes: disruption.affectedNodes ?? [], affected_edges: disruption.affectedEdges ?? [], reason: disruption.expectedDuration === undefined ? "DECLARED_RESOLUTION" : "DURATION_REACHED" },
        })
        return out
      }), ...result.events,
    ].sort(compareEvents),
  }

  function applyAdjustments(groups: CrowdGroupInput[], adjustments: PopulationAdjustment[], graph: VenueGraph): CrowdGroupInput[] {
    const result = groups.map((group) => ({ ...group, currentLocation: { ...group.currentLocation } }))
    for (const adjustment of adjustments.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (!adjustment.id || !Number.isInteger(adjustment.amount) || !Number.isFinite(adjustment.amount) || adjustment.amount === 0) {
        throw new Error(`Invalid population adjustment ${adjustment.id || "<unknown>"}`)
      }

      if (adjustment.scope === "NODE") {
        if (!adjustment.targetId || !graph.node(adjustment.targetId)) throw new Error(`Unknown adjustment node target: ${adjustment.targetId}`)
        if (adjustment.amount > 0) {
          if (!adjustment.destination || !graph.node(adjustment.destination)) throw new Error(`Adjustment ${adjustment.id} requires a valid destination`)
          result.push({
            id: `ADJUSTMENT_${adjustment.id}`,
            population: adjustment.amount,
            currentLocation: { kind: "NODE", id: adjustment.targetId },
            destination: adjustment.destination,
            averageSpeed: adjustment.averageSpeed ?? 1,
            routeFlexibility: "FLEXIBLE",
          })
        } else {
          removePopulation(result, adjustment.targetId, -adjustment.amount)
        }
      } else if (adjustment.scope === "GROUP") {
        const group = result.find((candidate) => candidate.id === adjustment.targetId)
        if (!group) throw new Error(`Unknown adjustment group target: ${adjustment.targetId}`)
        group.population += adjustment.amount
        if (group.population < 0) throw new Error(`Adjustment ${adjustment.id} would make population negative`)
      } else if (adjustment.amount < 0) {
        removePopulation(result, null, -adjustment.amount)
      }
    }
    return result
  }

  function removePopulation(groups: CrowdGroupInput[], nodeId: string | null, amount: number): void {
    let remaining = amount
    for (const group of groups.slice().sort((a, b) => compareIds(a.id, b.id))) {
      if (nodeId !== null && (group.currentLocation.kind !== "NODE" || group.currentLocation.id !== nodeId)) continue
      const removed = Math.min(group.population, remaining)
      group.population -= removed
      remaining -= removed
      if (remaining <= 0) break
    }
    if (remaining > 0) throw new Error("Population adjustment exceeds available population")
    for (let index = groups.length - 1; index >= 0; index -= 1) if (groups[index].population === 0) groups.splice(index, 1)
  }

  function applyDemandShares(groups: CrowdGroupInput[], interventions: Intervention[], graph: VenueGraph): CrowdGroupInput[] {
    if (interventions.length === 0) return groups
    const entries = (graph.activeEntries ?? []).slice().sort(compareIds)
    if (entries.length === 0 || interventions.length !== entries.length) throw new Error("DEMAND_SHARE_INVALID")
    const shares = new Map(interventions.map((intervention) => [intervention.targetId, Number(intervention.proposedValue)]))
    if (entries.some((entry) => !Number.isFinite(shares.get(entry)) || (shares.get(entry) ?? -1) < 0)
      || Math.abs(entries.reduce((sum, entry) => sum + (shares.get(entry) ?? 0), 0) - 1) > 1e-9) {
      throw new Error("DEMAND_SHARE_INVALID")
    }
    const total = groups.reduce((sum, group) => sum + group.population, 0)
    const template = groups[0]
    if (!template || !Number.isInteger(total)) throw new Error("Demand-share execution requires integer crowd input")
    const allocations = entries.map((entry) => {
      const exact = total * (shares.get(entry) ?? 0)
      return { entry, amount: Math.floor(exact), remainder: exact - Math.floor(exact) }
    })
    let remaining = total - allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
    for (const allocation of allocations.slice().sort((a, b) => b.remainder - a.remainder || compareIds(a.entry, b.entry))) {
      if (remaining <= 0) break
      allocation.amount += 1
      remaining -= 1
    }
    return allocations.filter((allocation) => allocation.amount > 0).map((allocation) => ({
      ...template,
      id: `${template.id}@${allocation.entry}`,
      population: allocation.amount,
      currentLocation: { kind: "NODE", id: allocation.entry },
    }))
  }
}

/** Boundary-safe execution for API consumers that need structured failure results. */
export function runSandboxSafe(input: SandboxInput): SimulationResult {
  try {
    return runSandbox(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown simulation failure"
    const status = message.includes("override") || message.includes("target")
      ? "INVALID_OVERRIDE"
      : input.scenario && (message.includes("scenario") || message.includes("duration") || message.includes("start time"))
        ? "INVALID_SCENARIO"
        : message.startsWith("Invalid") || message.includes("requires")
          ? "INVALID_INPUT"
          : "SIMULATION_FAILURE"
    const start = input.scenario?.startTime ?? input.parameters?.simulatedStartTime ?? "1970-01-01T00:00:00.000Z"
    const duration = input.scenario?.duration ?? input.parameters?.durationSeconds ?? 0
    const startMs = Number.isFinite(Date.parse(start)) ? Date.parse(start) : 0
    const emptyStep: SimulationStep = {
      timeSeconds: 0, nodeMetrics: [], edgeMetrics: [], crowd: [],
      transfers: { nodeIn: {}, nodeOut: {}, edgeIn: {}, edgeOut: {} },
    }
    return {
      id: `SIMULATION_RESULT_${input.scenario?.id ?? "INVALID"}`,
      scenarioId: input.scenario?.id ?? "INVALID",
      strategyId: input.scenario?.strategyId ?? null,
      status,
      baseline: input.scenario?.baseline ?? "CURRENT_GRAPH",
      baselineRef: input.scenario?.baselineRef ?? null,
      seed: input.parameters?.seed ?? 0,
      simulatedStartTime: new Date(startMs).toISOString(),
      simulatedEndTime: new Date(startMs + duration * 1000).toISOString(),
      metrics: emptyMetrics(duration),
      scopedMetrics: [],
      finalState: { population: 0, overloadedNodes: [], overloadedEdges: [], activeScenarioDisruptions: [], affectedEntityStatus: {} },
      events: [],
      warnings: [{ code: status, message }],
      durationSeconds: duration,
      steps: [],
      final: emptyStep,
      bottlenecks: [],
      affectedNodes: [],
      affectedEdges: [],
      affectedGroups: [],
      queueGrowth: {},
      capacityViolations: [],
      estimatedDelaySeconds: 0,
      arrivedPopulation: 0,
      strandedPopulation: 0,
      diagnostics: [message],
    }
  }
}

function emptyMetrics(duration: number): SimulationResult["metrics"] {
  return {
    population: 0, occupancy: 0, flow: 0, density: 0, queueSize: 0, waitingTime: 0, travelTime: 0,
    arrivedPopulation: 0, divertedPopulation: 0, congestion: 0, capacityUtilization: 0, throughput: 0,
    interventionImpact: null, timeToCongestion: null, peakCongestion: 0, peakQueue: 0, recoveryTime: null, duration,
  }
}

function isActiveAt(disruption: NonNullable<SandboxInput["disruptions"]>[number], timeMs: number, scenarioStartMs: number): boolean {
  if (disruption.status === "RESOLVED") return false
  const start = disruption.startTime ? Date.parse(disruption.startTime) : scenarioStartMs
  const end = disruption.expectedDuration === undefined ? Number.POSITIVE_INFINITY : start + disruption.expectedDuration * 1000
  return timeMs >= start && timeMs < end
}

function compareEvents(a: { simTime: string; type: string }, b: { simTime: string; type: string }): number {
  if (a.simTime !== b.simTime) return a.simTime < b.simTime ? -1 : 1
  const order: Record<string, number> = {
    INTERVENTION_ACTIVATED: 0, DISRUPTION_ACTIVATED: 1, DISRUPTION_RESOLVED: 2,
    THRESHOLD_CROSSED: 3, OVERLOAD: 4, OVERLOAD_CLEARED: 5, DIVERSION: 6,
    ARRIVAL: 7, RECOVERY: 8, TERMINATION: 9,
  }
  return (order[a.type] ?? 50) - (order[b.type] ?? 50) || compareIds(a.type, b.type)
}

export function runBaseline(input: Omit<SandboxInput, "disruptions" | "graphOverrides">): SimulationResult {
  return runSandbox(input)
}

export function compareScenarios(inputs: SandboxInput[]): ScenarioComparison {
  if (inputs.length === 0) throw new Error("At least one scenario is required")
  const warnings: string[] = []
  const reference = inputs[0]
  for (const input of inputs.slice(1)) {
    if (input.scenario?.baseline !== reference.scenario?.baseline
      || input.scenario?.baselineRef !== reference.scenario?.baselineRef) warnings.push("INCOMPATIBLE_BASELINE")
    if ((input.scenario?.duration ?? input.parameters?.durationSeconds)
      !== (reference.scenario?.duration ?? reference.parameters?.durationSeconds)) warnings.push("INCOMPATIBLE_DURATION")
    if ((input.scenario?.stepSeconds ?? input.parameters?.timestepSeconds)
      !== (reference.scenario?.stepSeconds ?? reference.parameters?.timestepSeconds)) warnings.push("INCOMPATIBLE_STEP")
    if ((input.parameters?.seed ?? 0) !== (reference.parameters?.seed ?? 0)) warnings.push("INCOMPATIBLE_SEED")
  }
  const results = inputs.slice().sort((a, b) => compareIds(a.scenario?.id ?? "", b.scenario?.id ?? "")).map(runSandbox)
  const baseline = results[0]
  const metricMatrix: Record<string, Record<string, number | null>> = {}
  for (const metric of ["population", "arrived_population", "travel_time", "peak_queue", "peak_congestion"]) {
    metricMatrix[metric] = Object.fromEntries(results.map((result) => [result.scenarioId, metricValue(result, metric)]))
  }
  return {
    baselineScenarioId: baseline.scenarioId ?? "BASELINE",
    results,
    impact: results.map((result) => ({
      scenarioId: result.scenarioId ?? "BASELINE",
      arrivedPopulationDelta: result.arrivedPopulation - baseline.arrivedPopulation,
      estimatedDelaySecondsDelta: result.estimatedDelaySeconds - baseline.estimatedDelaySeconds,
    })),
    valid: warnings.length === 0,
    warnings: [...new Set(warnings)].sort(compareIds),
    metricMatrix,
  }
}

function metricValue(result: SimulationResult, metric: string): number | null {
  if (metric === "population") return result.metrics.population
  if (metric === "arrived_population") return result.metrics.arrivedPopulation
  if (metric === "travel_time") return result.metrics.travelTime
  if (metric === "peak_queue") return result.metrics.peakQueue
  if (metric === "peak_congestion") return result.metrics.peakCongestion
  return null
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
    if (disruption.status === "RESOLVED" && disruption.resolvedAt !== undefined
      && (!Number.isFinite(Date.parse(disruption.resolvedAt)) || Date.parse(disruption.resolvedAt) < Date.parse(disruption.startTime))) {
      throw new Error(`Invalid resolvedAt for disruption ${disruption.id}`)
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
        if (effect.targetType === "NODE" && effect.targetId && !graph.node(effect.targetId)) {
          throw new Error(`Unknown disruption effect node target: ${effect.targetId}`)
        }
        if (effect.targetType === "EDGE" && effect.targetId && !graph.edge(effect.targetId)) {
          throw new Error(`Unknown disruption effect edge target: ${effect.targetId}`)
        }
        if (effect.parameter === "status"
          && effect.proposedValue !== "OPEN" && effect.proposedValue !== "CLOSED") {
          throw new Error(`Invalid status effect for disruption ${disruption.id}`)
        }
        if (effect.parameter === "throughput_capacity" && effect.targetType !== "NODE") {
          throw new Error(`Invalid throughput_capacity target for disruption ${disruption.id}`)
        }
        if (effect.parameter === "capacity" && effect.targetType === "NODE"
          && (typeof effect.proposedValue !== "number" || !Number.isInteger(effect.proposedValue))) {
          throw new Error(`Node capacity effect must be an integer for disruption ${disruption.id}`)
        }
        if ((effect.parameter === "capacity" || effect.parameter === "throughput_capacity")
          && (typeof effect.proposedValue !== "number" || !Number.isFinite(effect.proposedValue) || effect.proposedValue < 0)) {
          throw new Error(`Invalid capacity effect for disruption ${disruption.id}`)
        }
        if (effect.parameter === "restriction" && (typeof effect.proposedValue !== "string" || effect.proposedValue.length === 0)) {
          throw new Error(`Restriction effect ${disruption.id} requires a label`)
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
