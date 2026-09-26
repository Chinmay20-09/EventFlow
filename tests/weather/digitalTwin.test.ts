/**
 * Midnight task tests — digital twin what-if.
 * Covers: baseline/what-if ISOLATION, that the what-if actually changes P1
 * inputs, that results come from the REAL P1 engine (not reimplemented), and
 * that the deterministic demo comparison is repeatable.
 */

import { describe, expect, it } from "vitest"
import { runSandbox } from "../../engine/src/sandbox"
import { DEMO_VENUE_GRAPH } from "../../integration/weather/digitalTwin"
import { runDigitalTwin } from "../../integration/weather/digitalTwin"
import { weatherInput, baselineInput } from "./fixtures"

describe("digital twin what-if (real P1 engine)", () => {
  it("baseline and what-if runs stay isolated (no input mutation)", () => {
    const baseline = baselineInput()
    const snapshotOf = (input: SandboxInputSnapshot): string => JSON.stringify(input)
    const before = snapshotOf(baseline as SandboxInputSnapshot)

    const weather = weatherInput(100)
    runSandbox(baseline)
    runSandbox(weather.input)

    // Inputs are byte-identical after runs — the twin never mutates state.
    expect(snapshotOf(baseline as SandboxInputSnapshot)).toBe(before)
    expect(weather.input.scenario?.disruptionOverrides?.length).toBe(1)
  })

  it("what-if changes the EXISTING P1 inputs (disruption + travel-time overrides)", () => {
    const { input, disruptionId } = weatherInput(100)
    expect(disruptionId).toBe("WEATHER_RAIN_EXTREME")
    expect(input.scenario?.graphOverrides).toEqual([
      { scope: "EDGE", targetId: "D_EXIT", currentTime: 70 }, // 35 x 2
      { scope: "EDGE", targetId: "HALL_GATE", currentTime: 56 }, // 28 x 2
    ])
    expect(input.scenario?.disruptionOverrides?.[0]?.type).toBe("WEATHER_EVENT")
  })

  it("P1 really runs both scenarios and the what-if changes P1 outcomes", () => {
    const baseline = runSandbox(baselineInput())
    const whatIf = runSandbox(weatherInput(100).input)

    // Real P1 runs (not faked): both completed with real population accounting.
    expect(baseline.status).toBe("COMPLETED")
    expect(whatIf.status).toBe("COMPLETED")
    expect(baseline.metrics.population + baseline.arrivedPopulation).toBe(500)
    expect(whatIf.metrics.population + whatIf.arrivedPopulation).toBe(500)

    // Weather scenario degrades P1's own numbers — visible causality.
    expect(whatIf.metrics.peakCongestion).toBeGreaterThan(baseline.metrics.peakCongestion)
    expect(whatIf.metrics.peakQueue).toBeGreaterThanOrEqual(baseline.metrics.peakQueue)

    // The scenario carries the weather disruption into P1's final state.
    expect(whatIf.finalState.activeScenarioDisruptions).toContain("WEATHER_RAIN_EXTREME")
  })

  it("runDigitalTwin returns P1-derived comparison deltas (existing comparison tool)", () => {
    const twin = runDigitalTwin(100)
    expect(twin.severity).toBe("EXTREME")
    expect(twin.comparison.peakCongestionDelta).toBeCloseTo(
      twin.whatIf.metrics.peakCongestion - twin.baseline.metrics.peakCongestion, 10,
    )
    expect(twin.comparison.arrivedPopulationDelta).toBe(
      twin.whatIf.arrivedPopulation - twin.baseline.arrivedPopulation,
    )
  })

  it("moderate rainfall keeps the venue at baseline conditions", () => {
    const twin = runDigitalTwin(3)
    expect(twin.severity).toBe("NORMAL")
    expect(twin.comparison.peakCongestionDelta).toBe(0)
    expect(twin.whatIf.finalState.activeScenarioDisruptions).toEqual([])
  })

  it("demo comparison is deterministic (repeatable hackathon demo)", () => {
    const first = runDigitalTwin(62)
    const second = runDigitalTwin(62)
    expect(first.baseline.metrics.peakCongestion).toBe(second.baseline.metrics.peakCongestion)
    expect(first.whatIf.metrics.peakCongestion).toBe(second.whatIf.metrics.peakCongestion)
    expect(first.comparison).toEqual(second.comparison)
  })

  it("graph is unchanged: all five demo edges/nodes still validated by P1", () => {
    // Guards against accidental edits to the demo venue graph shape.
    expect(DEMO_VENUE_GRAPH.nodes).toHaveLength(5)
    expect(DEMO_VENUE_GRAPH.edges).toHaveLength(5)
    expect(() => runSandbox(baselineInput())).not.toThrow()
  })
})

type SandboxInputSnapshot = Record<string, unknown>
