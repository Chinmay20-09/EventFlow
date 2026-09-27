/**
 * P1 weather-scenario runner — the child-process boundary for the P4 what-if
 * weather flow (task §17–§18).
 *
 * Same architecture and contract as `p1Runner.ts` (JSON over stdio; FastAPI
 * imports no TypeScript internals; the engine itself is untouched). The only
 * difference is the input envelope: P3 sends a complete P1 `SandboxInput`
 * plus a small `weather` descriptor (the operator-entered rainfall). The
 * runner converts the rainfall into a documented P1 `WEATHER_EVENT`
 * disruption (the mapping P1's own weather adapter defines: affected
 * outdoor edges run slower; P1 applies and validates every effect), sets
 * the scenario id so the engine's deterministic result id is
 * `SIMULATION_RESULT_<scenario_id>`, and returns the exact
 * `serializeSimulationResult` payload on stdout.
 *
 * The rainfall→severity→travel-time mapping lives here (not in P3): P3 must
 * never compute P1 inputs' operational effects, and the engine's weather
 * adapter (`integration/weather/weatherImpact.ts`) is a browser-facing
 * module. The values used are that adapter's documented defaults.
 *
 * Invoked by `backend/app/services/adapters/p1_engine.py` as
 * `node node_modules/tsx/dist/cli.mjs <this file>`.
 */
import { readFileSync } from "node:fs"
import { runSandbox, serializeSimulationResult } from "../../engine/src/index"
import type { Disruption, SandboxInput } from "../../engine/src/types"

/** Envelope sent by P3 (`RealP1EngineAdapter.run_weather_simulation`). */
interface WeatherRunnerInput {
  sandbox: SandboxInput
  weather: {
    /** mm/h — the classified scenario variable (0 = dry). */
    rainfallMm: number
    /** Scenario duration inside the simulation (seconds). */
    durationSeconds: number
  }
}

/**
 * Documented mapping from rainfall (mm/h) to P1 severity and the slowdown
 * applied to affected edges. Values mirror
 * `integration/weather/weatherImpact.ts::DEFAULT_WEATHER_IMPACT_CONFIG`.
 */
function classifyRainfall(rainfallMm: number): {
  severity: "MEDIUM" | "HIGH" | "CRITICAL"
  label: string
  travelTimeMultiplier: number
} {
  if (rainfallMm >= 80) {
    return { severity: "CRITICAL", label: "Extreme rainfall", travelTimeMultiplier: 2 }
  }
  if (rainfallMm >= 40) {
    return { severity: "HIGH", label: "Heavy rain", travelTimeMultiplier: 1.5 }
  }
  return { severity: "MEDIUM", label: "Elevated rain", travelTimeMultiplier: 1.25 }
}

/** P1 disruption start (fixed epoch like the documented weather adapter). */
const WEATHER_START = "2026-09-24T00:00:00Z"
const RESTRICTION = "weather-reduced-speed"

function buildWeatherDisruption(
  sandbox: SandboxInput,
  rainfallMm: number,
  durationSeconds: number,
): Disruption | null {
  // Dry scenario: no operational modification at all.
  if (rainfallMm <= 0) {
    return null
  }
  const { severity, travelTimeMultiplier } = classifyRainfall(rainfallMm)

  // The weather affects outdoor movement: every stored edge participates
  // (P1 validates the disruption against the graph; ids are P1's own).
  const affectedEdges = sandbox.graph.edges.map((edge) => edge.id)

  return {
    id: "WEATHER_EVENT_RAIN",
    type: "WEATHER_EVENT",
    affectedNodes: [],
    affectedEdges,
    severity,
    status: "ACTIVE",
    startTime: WEATHER_START,
    expectedDuration: durationSeconds,
    source: "SIMULATION",
    restriction: RESTRICTION,
    operationalEffects: affectedEdges.map((edgeId) => ({
      targetType: "EDGE" as const,
      targetId: edgeId,
      parameter: "restriction" as const,
      previousValue: null,
      proposedValue: RESTRICTION,
      appliedValue: RESTRICTION,
      appliedAt: WEATHER_START,
      effectStatus: "APPLIED" as const,
    })),
    // Slower traversal via P1's documented edge currentTime override.
    ...(sandbox.graph.edges.length > 0
      ? {}
      : {}),
  }
}

function main(): void {
  const raw = readFileSync(0, "utf8")
  let envelope: WeatherRunnerInput
  try {
    envelope = JSON.parse(raw) as WeatherRunnerInput
  } catch (error) {
    console.error(`[p1WeatherRunner] invalid JSON on stdin: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const { sandbox, weather } = envelope
  if (!sandbox || typeof weather?.rainfallMm !== "number") {
    console.error("[p1WeatherRunner] envelope must contain sandbox + weather.rainfallMm")
    process.exit(1)
  }

  try {
    const disruption = buildWeatherDisruption(
      sandbox,
      weather.rainfallMm,
      weather.durationSeconds,
    )

    const input: SandboxInput = {
      ...sandbox,
      disruptions: disruption ? [disruption] : sandbox.disruptions ?? [],
      scenario: {
        id: sandbox.scenario?.id ?? "WEATHER_EVENT",
        name: sandbox.scenario?.name ?? "Weather what-if scenario",
        baseline: sandbox.scenario?.baseline ?? "CURRENT_GRAPH",
        startTime: sandbox.scenario?.startTime ?? WEATHER_START,
        duration: sandbox.scenario?.duration ?? weather.durationSeconds,
        ...(sandbox.scenario?.stepSeconds !== undefined
          ? { stepSeconds: sandbox.scenario.stepSeconds }
          : {}),
      },
    }

    // Slower traversal: apply the documented multiplier to every affected
    // edge through P1's own currentTime override (P1 validates override
    // targets and applies it — the multiplier is a scenario input, not a
    // P3 calculation).
    if (disruption && sandbox.graph.edges.length > 0) {
      const { travelTimeMultiplier } = classifyRainfall(weather.rainfallMm)
      input.graphOverrides = sandbox.graph.edges.map((edge) => ({
        scope: "EDGE" as const,
        targetId: edge.id,
        currentTime: Math.round(edge.baselineTime * travelTimeMultiplier * 100) / 100,
      }))
    }

    const result = runSandbox(input)
    process.stdout.write(JSON.stringify(serializeSimulationResult(result)))
  } catch (error) {
    // Engine-rejected input or engine failure: the failure is real, never
    // replaced by a fabricated result.
    console.error(`[p1WeatherRunner] engine error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

main()
