/**
 * WEATHER IMPACT ADAPTER — midnight task.
 *
 * Responsibility:
 * - Convert a WeatherSnapshot into OPERATIONAL SCENARIO INPUTS for the
 *   existing P1 EventFlow engine (`runSandbox`), using the documented
 *   WEATHER_EVENT disruption type (docs/engine/EV-008_Disruption_model.md:
 *   "Weather affects access or movement → reduced capacity / throughput").
 *
 * This is NOT a second simulation engine. It emits plain `Disruption[]` and
 * `GraphOverride[]` — shapes P1 already validates and applies — so every
 * number that comes out of the digital twin is P1's own calculation.
 *
 * P1 remains the source of truth for all simulation mechanics.
 */

import type { Disruption, GraphOverride } from "../../engine/src/types"
import type { WeatherSnapshot } from "./weatherProvider"

// ------------------------------------------------------------
// Severity classification (documented, configurable thresholds)
// ------------------------------------------------------------

export type WeatherSeverity = "NORMAL" | "ELEVATED" | "HEAVY" | "EXTREME"

export interface WeatherImpactConfig {
  /** mm/h — at/above this, operations become ELEVATED. */
  elevatedRainMm: number
  /** mm/h — at/above this, HEAVY. */
  heavyRainMm: number
  /** mm/h — at/above this, EXTREME. */
  extremeRainMm: number
  /** Multiplier applied to affected-edge traversal time per band. */
  elevatedTravelTimeMultiplier: number
  heavyTravelTimeMultiplier: number
  extremeTravelTimeMultiplier: number
  /** Fraction (0–1] of affected-edge/node capacity retained per band. */
  heavyCapacityFraction: number
  extremeCapacityFraction: number
}

export const DEFAULT_WEATHER_IMPACT_CONFIG: WeatherImpactConfig = {
  elevatedRainMm: 10,
  heavyRainMm: 40,
  extremeRainMm: 80,
  elevatedTravelTimeMultiplier: 1.25,
  heavyTravelTimeMultiplier: 1.5,
  extremeTravelTimeMultiplier: 2,
  heavyCapacityFraction: 0.6,
  extremeCapacityFraction: 0.4,
}

/**
 * Classify a snapshot into an operational severity band.
 * Pure + deterministic so the demo story is repeatable.
 */
export function classifyWeather(
  snapshot: Pick<WeatherSnapshot, "precipitation">,
  config: WeatherImpactConfig = DEFAULT_WEATHER_IMPACT_CONFIG,
): WeatherSeverity {
  const rain = Number.isFinite(snapshot.precipitation) ? Math.max(0, snapshot.precipitation) : 0
  if (rain >= config.extremeRainMm) return "EXTREME"
  if (rain >= config.heavyRainMm) return "HEAVY"
  if (rain >= config.elevatedRainMm) return "ELEVATED"
  return "NORMAL"
}

/** Human label used by the UI + AI layer (kept beside classification). */
export function severityLabel(severity: WeatherSeverity): string {
  switch (severity) {
    case "NORMAL": return "Normal weather"
    case "ELEVATED": return "Elevated rain"
    case "HEAVY": return "Heavy rain"
    case "EXTREME": return "Extreme rainfall"
  }
}

// ------------------------------------------------------------
// Venue profile (base values the adapter scales)
// ------------------------------------------------------------

/**
 * The base operational values of the entities weather can degrade.
 * The adapter multiplies these by configured fractions/multipliers — it
 * never invents capacities itself. digitalTwin.ts fills this from the demo
 * venue graph constants.
 */
export interface WeatherVenueProfile {
  affectedNodeIds: string[]
  affectedEdgeIds: string[]
  /** metres (edges) */
  edgeBaselineTime: Record<string, number>
  /** people/minute (edges) */
  edgeCapacity: Record<string, number | null>
  /** people/minute (nodes) */
  nodeThroughputCapacity: Record<string, number | null>
}

/** Operational plan the adapter emits for one weather state. */
export interface WeatherScenarioPlan {
  severity: WeatherSeverity
  label: string
  /** EV-008 disruption (null when NORMAL — no operational modification). */
  disruption: Disruption | null
  /** Travel-time overrides applied via the existing ScenarioInput.graphOverrides. */
  graphOverrides: GraphOverride[]
  /** Entity ids the scenario touches (for map highlighting). */
  affectedNodeIds: string[]
  affectedEdgeIds: string[]
}

const WEATHER_START = "2026-09-24T00:00:00Z"
const WEATHER_DURATION_SECONDS = 3600
const RESTRICTION = "weather-reduced-speed"

/**
 * Map a weather snapshot to a scenario plan.
 *
 * NORMAL   → null disruption, no overrides (no operational modification).
 * ELEVATED → slower travel on affected edges (restriction tag only).
 * HEAVY    → + capacity/throughput reduction via APPLIED operationalEffects.
 * EXTREME  → stronger reduction (and CRITICAL severity).
 */
export function buildWeatherScenario(
  snapshot: Pick<WeatherSnapshot, "precipitation">,
  venue: WeatherVenueProfile,
  config: WeatherImpactConfig = DEFAULT_WEATHER_IMPACT_CONFIG,
): WeatherScenarioPlan {
  const severity = classifyWeather(snapshot, config)
  const affectedNodeIds = [...venue.affectedNodeIds].sort()
  const affectedEdgeIds = [...venue.affectedEdgeIds].sort()

  if (severity === "NORMAL") {
    return { severity, label: severityLabel(severity), disruption: null, graphOverrides: [], affectedNodeIds: [], affectedEdgeIds: [] }
  }

  const extreme = severity === "EXTREME"
  const heavy = severity === "HEAVY"
  const capacityFraction = extreme ? config.extremeCapacityFraction : heavy ? config.heavyCapacityFraction : null
  const travelMultiplier = extreme
    ? config.extremeTravelTimeMultiplier
    : heavy
    ? config.heavyTravelTimeMultiplier
    : config.elevatedTravelTimeMultiplier

  const operationalEffects: Disruption["operationalEffects"] = []

  // Restriction tag (applies in every non-normal band — visible provenance).
  // P1 requires APPLIED effects to carry appliedValue (engine sandbox validation).
  for (const edgeId of affectedEdgeIds) {
    operationalEffects.push({
      targetType: "EDGE", targetId: edgeId, parameter: "restriction",
      previousValue: null, proposedValue: RESTRICTION, appliedValue: RESTRICTION, appliedAt: WEATHER_START, effectStatus: "APPLIED",
    })
  }

  // Capacity/throughput reduction (HEAVY / EXTREME only).
  if (capacityFraction !== null) {
    for (const edgeId of affectedEdgeIds) {
      const base = venue.edgeCapacity[edgeId]
      if (base !== null && base !== undefined && Number.isFinite(base) && base > 0) {
        const reduced = Math.max(1, Math.round(base * capacityFraction))
        operationalEffects.push({
          targetType: "EDGE", targetId: edgeId, parameter: "capacity",
          previousValue: base, proposedValue: reduced, appliedValue: reduced, appliedAt: WEATHER_START, effectStatus: "APPLIED",
        })
      }
    }
    for (const nodeId of affectedNodeIds) {
      const base = venue.nodeThroughputCapacity[nodeId]
      if (base !== null && base !== undefined && Number.isFinite(base) && base > 0) {
        const reduced = Math.max(1, Math.round(base * capacityFraction))
        operationalEffects.push({
          targetType: "NODE", targetId: nodeId, parameter: "throughput_capacity",
          previousValue: base, proposedValue: reduced, appliedValue: reduced, appliedAt: WEATHER_START, effectStatus: "APPLIED",
        })
      }
    }
  }

  // Travel-time increase via the existing edge `currentTime` override
  // (P1 slows traversal when currentTime > baselineTime).
  const graphOverrides: GraphOverride[] = affectedEdgeIds
    .filter((edgeId) => Number.isFinite(venue.edgeBaselineTime[edgeId]) && venue.edgeBaselineTime[edgeId] > 0)
    .map((edgeId) => ({
      scope: "EDGE" as const,
      targetId: edgeId,
      currentTime: Math.round(venue.edgeBaselineTime[edgeId] * travelMultiplier * 100) / 100,
    }))

  const disruption: Disruption = {
    id: `WEATHER_RAIN_${severity}`,
    type: "WEATHER_EVENT",
    affectedNodes: affectedNodeIds,
    affectedEdges: affectedEdgeIds,
    severity: extreme ? "CRITICAL" : heavy ? "HIGH" : "MEDIUM",
    status: "ACTIVE",
    startTime: WEATHER_START,
    expectedDuration: WEATHER_DURATION_SECONDS,
    source: "SIMULATION",
    restriction: RESTRICTION,
    operationalEffects,
  }

  return { severity, label: severityLabel(severity), disruption, graphOverrides, affectedNodeIds, affectedEdgeIds }
}

// ------------------------------------------------------------
// What-if parameter (task: user-controllable rainfall)
// ------------------------------------------------------------

/**
 * Build the hypothetical weather snapshot behind the what-if slider.
 * Labelled DEMO_FALLBACK because it is a scenario input, not an observation —
 * the UI presents it as WHAT-IF, never as live data.
 */
export function whatIfSnapshot(
  rainfallMm: number,
  location = { latitude: 19.076, longitude: 72.8777 },
): WeatherSnapshot {
  const clamped = Math.max(0, Math.min(150, rainfallMm))
  const severity = classifyWeather({ precipitation: clamped })
  const condition =
    clamped === 0 ? "Dry" :
    severity === "EXTREME" ? "Violent rain" :
    severity === "HEAVY" ? "Heavy rain" :
    severity === "ELEVATED" ? "Rain" : "Light drizzle"
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    timestamp: new Date().toISOString(),
    temperature: 26,
    precipitation: clamped,
    wind: Math.round((15 + clamped / 4) * 10) / 10,
    condition,
    source: "DEMO_FALLBACK",
  }
}
