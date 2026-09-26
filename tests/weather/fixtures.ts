/**
 * Shared test fixtures for the midnight-task weather/digital-twin tests.
 * Mirrors the demo venue used by digitalTwin.ts so tests stay representative.
 */

import type { SandboxInput, VenueGraphInput } from "../../engine/src/types"
import { DEMO_VENUE_GRAPH, DEMO_CROWD } from "../../integration/weather/digitalTwin"
import { buildWeatherScenario, whatIfSnapshot } from "../../integration/weather/weatherImpact"
import type { WeatherVenueProfile } from "../../integration/weather/weatherImpact"
import { DEFAULT_WEATHER_IMPACT_CONFIG } from "../../integration/weather/weatherImpact"

const DEMO_START = "2026-09-24T00:00:00Z"

export const WEATHER_VENUE_PROFILE: WeatherVenueProfile = {
  affectedNodeIds: ["D"],
  affectedEdgeIds: ["HALL_GATE", "D_EXIT"],
  edgeBaselineTime: { ENTRY_HALL: 42, HALL_GATE: 28, HALL_ALT: 50, ALT_D: 28, D_EXIT: 35 },
  edgeCapacity: { ENTRY_HALL: 120, HALL_GATE: 30, HALL_ALT: 90, ALT_D: 90, D_EXIT: 60 },
  nodeThroughputCapacity: { ENTRY: null, HALL: 120, ALT: 90, D: 60, EXIT: null },
}

export function baselineInput(): SandboxInput {
  return {
    graph: DEMO_VENUE_GRAPH,
    crowd: DEMO_CROWD.map((group) => ({ ...group })),
    parameters: { durationSeconds: 900, timestepSeconds: 15, simulatedStartTime: DEMO_START, seed: 42 },
    scenario: {
      id: "SCENARIO_BASELINE",
      name: "Baseline (current conditions)",
      baseline: "CURRENT_GRAPH",
      startTime: DEMO_START,
      duration: 900,
      stepSeconds: 15,
    },
  }
}

/** Build the what-if sandbox input exactly the way the UI flow does. */
export function weatherInput(rainfallMm: number): { input: SandboxInput; disruptionId: string | null } {
  const snapshot = whatIfSnapshot(rainfallMm)
  const plan = buildWeatherScenario(snapshot, WEATHER_VENUE_PROFILE, DEFAULT_WEATHER_IMPACT_CONFIG)
  const baseline = baselineInput()
  return {
    input: {
      ...baseline,
      scenario: {
        ...baseline.scenario!,
        id: `SCENARIO_WEATHER_${plan.severity}`,
        name: `What-if: ${plan.label} (${rainfallMm} mm/h)`,
        disruptionOverrides: plan.disruption ? [plan.disruption] : [],
        graphOverrides: plan.graphOverrides,
      },
    },
    disruptionId: plan.disruption?.id ?? null,
  }
}

export const demoGraph: VenueGraphInput = DEMO_VENUE_GRAPH
