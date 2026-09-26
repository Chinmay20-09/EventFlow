/**
 * Midnight task tests — weather impact adapter.
 * Covers: severity classification, weather → operational mapping, and the
 * requirement that NORMAL weather produces no operational modification.
 */

import { describe, expect, it } from "vitest"
import {
  classifyWeather,
  severityLabel,
  buildWeatherScenario,
  whatIfSnapshot,
  DEFAULT_WEATHER_IMPACT_CONFIG,
} from "../../integration/weather/weatherImpact"
import { WEATHER_VENUE_PROFILE } from "./fixtures"

describe("weather → operational impact mapping", () => {
  it("classifies rainfall into the documented bands", () => {
    expect(classifyWeather({ precipitation: 0 })).toBe("NORMAL")
    expect(classifyWeather({ precipitation: 5 })).toBe("NORMAL")
    expect(classifyWeather({ precipitation: 10 })).toBe("ELEVATED")
    expect(classifyWeather({ precipitation: 40 })).toBe("HEAVY")
    expect(classifyWeather({ precipitation: 80 })).toBe("EXTREME")
    expect(classifyWeather({ precipitation: 120 })).toBe("EXTREME")
    // Non-numeric / negative input degrades safely to NORMAL.
    expect(classifyWeather({ precipitation: Number.NaN })).toBe("NORMAL")
    expect(classifyWeather({ precipitation: -3 })).toBe("NORMAL")
  })

  it("labels severities for the UI/AI layer", () => {
    expect(severityLabel("NORMAL")).toBe("Normal weather")
    expect(severityLabel("EXTREME")).toBe("Extreme rainfall")
  })

  it("NORMAL weather produces NO operational modification", () => {
    const plan = buildWeatherScenario({ precipitation: 2 }, WEATHER_VENUE_PROFILE)
    expect(plan.severity).toBe("NORMAL")
    expect(plan.disruption).toBeNull()
    expect(plan.graphOverrides).toEqual([])
    expect(plan.affectedNodeIds).toEqual([])
    expect(plan.affectedEdgeIds).toEqual([])
  })

  it("HEAVY rain reduces affected edge/node capacity via APPLIED effects", () => {
    const plan = buildWeatherScenario({ precipitation: 62 }, WEATHER_VENUE_PROFILE)
    expect(plan.severity).toBe("HEAVY")
    expect(plan.disruption?.type).toBe("WEATHER_EVENT")
    expect(plan.disruption?.severity).toBe("HIGH")
    expect(plan.disruption?.status).toBe("ACTIVE")
    expect(plan.disruption?.affectedEdges).toEqual(["D_EXIT", "HALL_GATE"]) // sorted

    const effects = plan.disruption?.operationalEffects ?? []
    const gateCapacity = effects.find((e) => e.targetId === "HALL_GATE" && e.parameter === "capacity")
    expect(gateCapacity?.effectStatus).toBe("APPLIED")
    expect(gateCapacity?.proposedValue).toBe(Math.round(30 * DEFAULT_WEATHER_IMPACT_CONFIG.heavyCapacityFraction))
    expect(gateCapacity?.previousValue).toBe(30)

    const transitThroughput = effects.find((e) => e.targetId === "D" && e.parameter === "throughput_capacity")
    expect(transitThroughput?.proposedValue).toBe(Math.round(60 * DEFAULT_WEATHER_IMPACT_CONFIG.heavyCapacityFraction))
  })

  it("EXTREME rain applies the stronger reduction and travel-time penalty", () => {
    const plan = buildWeatherScenario({ precipitation: 100 }, WEATHER_VENUE_PROFILE)
    expect(plan.severity).toBe("EXTREME")
    expect(plan.disruption?.severity).toBe("CRITICAL")

    const dExitCapacity = plan.disruption?.operationalEffects?.find(
      (e) => e.targetId === "D_EXIT" && e.parameter === "capacity",
    )
    expect(dExitCapacity?.proposedValue).toBe(Math.round(60 * DEFAULT_WEATHER_IMPACT_CONFIG.extremeCapacityFraction))

    // Travel time increase arrives as an edge currentTime override (2x baseline).
    const override = plan.graphOverrides.find((o) => o.targetId === "D_EXIT")
    expect(override?.scope).toBe("EDGE")
    expect(override?.currentTime).toBe(70) // baseline 35 x extreme multiplier 2
  })

  it("ELEVATED rain only slows travel (restriction tag, no capacity change)", () => {
    const plan = buildWeatherScenario({ precipitation: 15 }, WEATHER_VENUE_PROFILE)
    expect(plan.severity).toBe("ELEVATED")
    const capacityEffects = (plan.disruption?.operationalEffects ?? []).filter((e) => e.parameter === "capacity")
    expect(capacityEffects).toEqual([])
    expect(plan.graphOverrides.every((o) => o.currentTime! > 0)).toBe(true)
  })

  it("whatIfSnapshot clamps input and labels the scenario source as DEMO_FALLBACK", () => {
    const dry = whatIfSnapshot(0)
    expect(dry.precipitation).toBe(0)
    expect(dry.condition).toBe("Dry")
    expect(dry.source).toBe("DEMO_FALLBACK")

    const clamped = whatIfSnapshot(5000)
    expect(clamped.precipitation).toBe(150)

    const heavy = whatIfSnapshot(62)
    expect(heavy.condition).toBe("Heavy rain")
  })
})
