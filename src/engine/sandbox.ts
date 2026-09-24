import { DeterministicSimulator } from "./simulation"
import { VenueGraph } from "./graph"
import type { CrowdGroupInput, Intervention, SandboxInput, ScenarioInput, SimulationResult } from "./types"

export function runSandbox(input: SandboxInput): SimulationResult {
  const scenario = input.scenario
  if (scenario?.baseline === "CAPTURED_STATE" && !scenario.baselineRef) {
    throw new Error(`Scenario ${scenario.id} requires baselineRef for CAPTURED_STATE`)
  }
  const scenarioOverrides = scenario?.graphOverrides ?? []
  const interventions = scenario?.interventions ?? []
  const interventionOverrides = interventions.filter((intervention) => intervention.parameter !== "demand_share").map(toGraphOverride)
  if (interventions.some((intervention) => intervention.parameter === "demand_share")) {
    throw new Error("demand_share interventions require entrance-generated demand support")
  }
  const graph = new VenueGraph(input.graph).withOverrides(
    [...(input.graphOverrides ?? []), ...scenarioOverrides, ...interventionOverrides],
    [...(input.disruptions ?? []), ...(scenario?.disruptionOverrides ?? [])],
  )
  const crowd = applyCrowdOverrides(input.crowd, scenario?.crowdOverrides ?? [])
  const parameters = {
    ...input.parameters,
    ...(scenario?.duration !== undefined ? { durationSeconds: scenario.duration } : {}),
    ...(scenario?.stepSeconds !== undefined ? { timestepSeconds: scenario.stepSeconds } : {}),
  }
  const result = new DeterministicSimulator(graph, crowd, parameters).run()
  const activeDisruptions = [...(input.disruptions ?? []), ...(scenario?.disruptionOverrides ?? [])]
    .filter((disruption) => disruption.status === "ACTIVE")
  const affectedNodes = [...new Set([
    ...result.affectedNodes,
    ...activeDisruptions.flatMap((disruption) => disruption.affectedNodes ?? []),
  ])].sort(compareIds)
  const affectedEdges = [...new Set([
    ...result.affectedEdges,
    ...activeDisruptions.flatMap((disruption) => disruption.affectedEdges ?? []),
  ])].sort(compareIds)
  const enriched = { ...result, affectedNodes, affectedEdges }
  if (!scenario) return result
  return {
    ...enriched,
    scenarioId: scenario.id,
    baseline: scenario.baseline,
    baselineRef: scenario.baselineRef ?? null,
    seed: parameters.seed ?? 0,
    warnings: [],
    timeline: result.steps,
  }
}

export function runBaseline(input: Omit<SandboxInput, "disruptions" | "graphOverrides">): SimulationResult {
  return runSandbox(input)
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
