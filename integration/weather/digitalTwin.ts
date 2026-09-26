/**
 * DIGITAL TWIN WHAT-IF — midnight task.
 *
 * Responsibility:
 * - Define the demo venue graph (fixed, documented coordinates for the map).
 * - Run BASELINE vs WHAT-IF WEATHER through the EXISTING P1 engine
 *   (`runSandbox`) with copied inputs — the real operational state is never
 *   touched (scenario isolation is enforced by P1's sandbox and verified here).
 * - Reuse the existing P2→P1 comparison tool (`compareSimulationResults`)
 *   instead of inventing new comparison math.
 * - Produce map visualization data (venue entities + weather impact overlays).
 *
 * P1 remains the source of truth for every simulated number shown in the UI.
 */

import { runSandbox } from "../../engine/src/sandbox"
import { compareSimulationResults } from "../tools/p1_simulation_tool"
import type { SimulationResult, SandboxInput, VenueGraphInput } from "../../engine/src/types"
import { buildWeatherScenario, whatIfSnapshot, DEFAULT_WEATHER_IMPACT_CONFIG } from "./weatherImpact"
import type { WeatherImpactConfig } from "./weatherImpact"
import type { WeatherSnapshot } from "./weatherProvider"

// ------------------------------------------------------------
// Demo venue graph (deterministic; matches the existing dashboard story:
// ENTRY → Hall/Stage → Transit D → EXIT, with undersized transit edges so
// rain impact is clearly visible in P1's own numbers).
// ------------------------------------------------------------

/** Fixed coordinate mapping (documented demo geography — Mumbai venue). */
export const DEMO_VENUE_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  ENTRY: { latitude: 19.0762, longitude: 72.8772 }, // North Gate
  HALL: { latitude: 19.0759, longitude: 72.8777 }, // Central stage zone
  ALT: { latitude: 19.0761, longitude: 72.8781 }, // East alternate route
  D: { latitude: 19.0757, longitude: 72.8783 }, // Transit Hub
  EXIT: { latitude: 19.0755, longitude: 72.8779 }, // South exit
}

export const DEMO_VENUE_GRAPH: VenueGraphInput = {
  nodes: [
    { id: "ENTRY", label: "North Gate", type: "ENTRANCE", capacity: 5000, throughputCapacity: null, status: "OPEN", latitude: DEMO_VENUE_COORDINATES.ENTRY.latitude, longitude: DEMO_VENUE_COORDINATES.ENTRY.longitude },
    { id: "HALL", label: "Central Zone", type: "ZONE", capacity: 300, throughputCapacity: 120, status: "OPEN", latitude: DEMO_VENUE_COORDINATES.HALL.latitude, longitude: DEMO_VENUE_COORDINATES.HALL.longitude },
    { id: "ALT", label: "East Corridor", type: "CORRIDOR", capacity: 150, throughputCapacity: 90, status: "OPEN", latitude: DEMO_VENUE_COORDINATES.ALT.latitude, longitude: DEMO_VENUE_COORDINATES.ALT.longitude },
    { id: "D", label: "Transit Hub", type: "TRANSIT", capacity: 200, throughputCapacity: 60, status: "OPEN", latitude: DEMO_VENUE_COORDINATES.D.latitude, longitude: DEMO_VENUE_COORDINATES.D.longitude },
    { id: "EXIT", label: "South Exit", type: "EXIT", capacity: 5000, throughputCapacity: null, status: "OPEN", latitude: DEMO_VENUE_COORDINATES.EXIT.latitude, longitude: DEMO_VENUE_COORDINATES.EXIT.longitude },
  ],
  edges: [
    { id: "ENTRY_HALL", label: "Marine Drive walkway", from: "ENTRY", to: "HALL", distance: 60, baselineTime: 42, currentTime: 42, capacity: 120, status: "OPEN" },
    { id: "HALL_GATE", label: "Stage-to-transit gate", from: "HALL", to: "D", distance: 40, baselineTime: 28, currentTime: 28, capacity: 30, status: "OPEN" },
    { id: "HALL_ALT", label: "East corridor", from: "HALL", to: "ALT", distance: 70, baselineTime: 50, currentTime: 50, capacity: 90, status: "OPEN" },
    { id: "ALT_D", label: "Corridor to transit", from: "ALT", to: "D", distance: 40, baselineTime: 28, currentTime: 28, capacity: 90, status: "OPEN" },
    { id: "D_EXIT", label: "Transit approach", from: "D", to: "EXIT", distance: 50, baselineTime: 35, currentTime: 35, capacity: 60, status: "OPEN" },
  ],
  activeEntries: ["ENTRY"],
  activeExits: ["EXIT"],
}

/** Crowd fixture — sized so baseline already runs near capacity (visible deltas). */
export const DEMO_CROWD: SandboxInput["crowd"] = [
  {
    id: "CROWD_001",
    population: 500,
    currentLocation: { kind: "NODE", id: "ENTRY" },
    destination: "EXIT",
    averageSpeed: 1,
    routeFlexibility: "FLEXIBLE",
  },
]

const DEMO_START = "2026-09-24T00:00:00Z"
const DEMO_DURATION_SECONDS = 900
const DEMO_TIMESTEP_SECONDS = 15

/** Weather hits the transit edges + the transit node (outdoor exposure). */
const WEATHER_VENUE_PROFILE = {
  affectedNodeIds: ["D"],
  affectedEdgeIds: ["HALL_GATE", "D_EXIT"],
  edgeBaselineTime: {
    ENTRY_HALL: 42, HALL_GATE: 28, HALL_ALT: 50, ALT_D: 28, D_EXIT: 35,
  } as Record<string, number>,
  edgeCapacity: {
    ENTRY_HALL: 120, HALL_GATE: 30, HALL_ALT: 90, ALT_D: 90, D_EXIT: 60,
  } as Record<string, number | null>,
  nodeThroughputCapacity: {
    ENTRY: null, HALL: 120, ALT: 90, D: 60, EXIT: null,
  } as Record<string, number | null>,
}

// ------------------------------------------------------------
// Scenario construction (copies only — nothing here mutates live state)
// ------------------------------------------------------------

export interface DigitalTwinWhatIf {
  /** Rainfall intensity in mm/h (the user-controllable parameter). */
  rainfallMm: number
}

function baseSandboxInput(): SandboxInput {
  return {
    graph: DEMO_VENUE_GRAPH,
    crowd: DEMO_CROWD.map((group) => ({ ...group })),
    parameters: {
      durationSeconds: DEMO_DURATION_SECONDS,
      timestepSeconds: DEMO_TIMESTEP_SECONDS,
      simulatedStartTime: DEMO_START,
      seed: 42,
    },
    scenario: {
      id: "SCENARIO_BASELINE",
      name: "Baseline (current conditions)",
      baseline: "CURRENT_GRAPH",
      startTime: DEMO_START,
      duration: DEMO_DURATION_SECONDS,
      stepSeconds: DEMO_TIMESTEP_SECONDS,
    },
  }
}

/**
 * Weather what-if input: the adapter's disruption + travel-time overrides are
 * injected through the EXISTING ScenarioInput fields (`disruptionOverrides`,
 * `graphOverrides`) — no engine changes.
 */
export function buildWhatIfInput(
  rainfallMm: number,
  config: WeatherImpactConfig = DEFAULT_WEATHER_IMPACT_CONFIG,
): { input: SandboxInput; plan: ReturnType<typeof buildWeatherScenario>; snapshot: WeatherSnapshot } {
  const snapshot = whatIfSnapshot(rainfallMm)
  const plan = buildWeatherScenario(snapshot, WEATHER_VENUE_PROFILE, config)
  const baseline = baseSandboxInput()
  const input: SandboxInput = {
    ...baseline,
    scenario: {
      ...baseline.scenario!,
      id: `SCENARIO_WEATHER_${plan.severity}`,
      name: `What-if: ${plan.label} (${rainfallMm} mm/h)`,
      disruptionOverrides: plan.disruption ? [plan.disruption] : [],
      graphOverrides: plan.graphOverrides,
    },
  }
  return { input, plan, snapshot }
}

// ------------------------------------------------------------
// Runs (isolated; real state untouched)
// ------------------------------------------------------------

export interface DigitalTwinResult {
  baseline: SimulationResult
  whatIf: SimulationResult
  snapshot: WeatherSnapshot
  severity: ReturnType<typeof buildWeatherScenario>["severity"]
  severityLabel: string
  affectedNodeIds: string[]
  affectedEdgeIds: string[]
  /** Applied edge travel-time factors (scenario currentTime / baselineTime). */
  travelTimeFactors: Record<string, number>
  comparison: {
    peakCongestionDelta: number
    peakQueueDelta: number
    arrivedPopulationDelta: number
    estimatedDelaySecondsDelta: number
    strandedPopulationDelta: number
    capacityViolationsDelta: number
  }
}

/**
 * Run baseline + what-if through P1 and compare. Every number in the returned
 * comparison is a delta between two REAL P1 results (existing tool).
 */
export function runDigitalTwin(
  rainfallMm: number,
  config: WeatherImpactConfig = DEFAULT_WEATHER_IMPACT_CONFIG,
): DigitalTwinResult {
  const whatIf = buildWhatIfInput(rainfallMm, config)
  const baselineResult = runSandbox(baseSandboxInput())
  const whatIfResult = runSandbox(whatIf.input)
  const comparison = compareSimulationResults(baselineResult, whatIfResult)
  if (!comparison.success || !comparison.data) {
    throw new Error(comparison.error ?? "P1 comparison failed")
  }
  const travelTimeFactors: Record<string, number> = {}
  for (const override of whatIf.plan.graphOverrides) {
    const base = WEATHER_VENUE_PROFILE.edgeBaselineTime[override.targetId]
    if (base > 0 && override.currentTime !== undefined) {
      travelTimeFactors[override.targetId] = Math.round((override.currentTime / base) * 100) / 100
    }
  }
  return {
    baseline: baselineResult,
    whatIf: whatIfResult,
    snapshot: whatIf.snapshot,
    severity: whatIf.plan.severity,
    severityLabel: whatIf.plan.label,
    affectedNodeIds: whatIf.plan.affectedNodeIds,
    affectedEdgeIds: whatIf.plan.affectedEdgeIds,
    travelTimeFactors,
    comparison: comparison.data.metrics,
  }
}

// ------------------------------------------------------------
// Map visualization data (existing UI consumes this)
// ------------------------------------------------------------

export interface MapNodeView {
  id: string
  label: string
  type: string
  latitude: number
  longitude: number
  /** P1 final-state status for this run. */
  status: "OPEN" | "CLOSED"
  /** P1 utilization from the scenario final state (null = no capacity). */
  utilization: number | null
  queueSize: number
  bottleneck: boolean
  weatherAffected: boolean
}

export interface MapEdgeView {
  id: string
  label: string
  from: string
  to: string
  weatherAffected: boolean
  /** P1 flow-utilization in the scenario final state. */
  utilization: number | null
  /** scenario currentTime vs baselineTime (travel-time penalty). */
  travelTimeFactor: number | null
  bottleneck: boolean
}

export interface MapData {
  nodes: MapNodeView[]
  edges: MapEdgeView[]
  weather: {
    /** Where the weather snapshot applies. */
    latitude: number
    longitude: number
    radiusKm: number
    label: string
    severity: string
  }
}

/**
 * Build map view-model data from the RUN results — values come from P1
 * outputs, never from frontend guesses.
 */
export function buildMapData(result: DigitalTwinResult): MapData {
  const affectedNodes = new Set(result.affectedNodeIds)
  const affectedEdges = new Set(result.affectedEdgeIds)
  const finalNodeMetrics = new Map(result.whatIf.final.nodeMetrics.map((metric) => [metric.id, metric]))
  const finalEdgeMetrics = new Map(result.whatIf.final.edgeMetrics.map((metric) => [metric.id, metric]))

  const nodes: MapNodeView[] = DEMO_VENUE_GRAPH.nodes.map((node) => {
    const metric = finalNodeMetrics.get(node.id)
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      latitude: node.latitude ?? 0,
      longitude: node.longitude ?? 0,
      status: result.whatIf.finalState.affectedEntityStatus[node.id] ?? "OPEN",
      utilization: metric?.holdingUtilization ?? null,
      queueSize: metric?.queueSize ?? 0,
      bottleneck: result.whatIf.bottlenecks.some((id) => id === `NODE:${node.id}`),
      weatherAffected: affectedNodes.has(node.id),
    }
  })

  const edges: MapEdgeView[] = DEMO_VENUE_GRAPH.edges.map((edge) => {
    const metric = finalEdgeMetrics.get(edge.id)
    return {
      id: edge.id,
      label: edge.label ?? `${edge.from} -> ${edge.to}`,
      from: edge.from,
      to: edge.to,
      weatherAffected: affectedEdges.has(edge.id),
      utilization: metric?.flowUtilization ?? null,
      travelTimeFactor: result.travelTimeFactors[edge.id] ?? null,
      bottleneck: result.whatIf.bottlenecks.some((id) => id === `EDGE:${edge.id}`),
    }
  })

  return {
    nodes,
    edges,
    weather: {
      latitude: result.snapshot.latitude,
      longitude: result.snapshot.longitude,
      radiusKm: Math.max(0.5, result.snapshot.precipitation / 20),
      label: result.severityLabel,
      severity: result.severity,
    },
  }
}
