/**
 * P2 AI — Weather / Digital-Twin Insight (midnight task).
 *
 * Responsibility:
 * - Consume the WEATHER SNAPSHOT, SOCIAL SIGNALS and the two REAL P1
 *   simulation results (baseline vs what-if) and produce a structured,
 *   organizer-facing impact narrative.
 *
 * P2 must NOT:
 * - recalculate P1 metrics (all numbers are quoted from the P1 comparison)
 * - present the heuristic confidence as statistically validated
 *
 * This reuses the existing P2 boundary (`explainComparison` style): P1 is the
 * source of truth; P2 only explains.
 */

import type { WeatherSnapshot } from "../../../integration/weather/weatherProvider"
import type { SocialSignal } from "../../../integration/weather/socialSignals"
import type { SimulationResult } from "../../../engine/src/types"

// ============================================================
// Types
// ============================================================

export interface WeatherComparisonSummary {
  rainfallMm: number
  severityLabel: string
  baseline: SimulationResult
  whatIf: SimulationResult
  peakCongestionDelta: number
  peakQueueDelta: number
  arrivedPopulationDelta: number
  estimatedDelaySecondsDelta: number
  strandedPopulationDelta: number
  affectedNodeIds: string[]
  affectedEdgeIds: string[]
}

export interface WeatherImpactInsight {
  summary: string
  findings: string[]
  recommendations: string[]
  warnings: string[]
  /**
   * Heuristic confidence derived mechanically from data freshness/severity —
   * explicitly a MODEL ESTIMATE, never a validated probability (task §10).
   */
  confidence: { level: "Low" | "Medium" | "High"; basis: string }
}

// ============================================================
// Confidence (labelled, mechanical — no fabricated statistics)
// ============================================================

/**
 * Derive a coarse confidence level from observable inputs only:
 * live weather + corroborating social signals raise it; fallback data or
 * missing corroboration lowers it. Documented as a heuristic.
 */
export function heuristicConfidence(
  weather: { live: boolean; signalCount: number },
): WeatherImpactInsight["confidence"] {
  let score = 0
  if (weather.live) score += 1
  if (weather.signalCount > 0) score += 1
  if (weather.signalCount >= 3) score += 1
  const level = score >= 3 ? "High" : score >= 1 ? "Medium" : "Low"
  const signalNote = weather.signalCount > 0 ? ` (+${weather.signalCount} social signal(s) corroboration)` : " (no social corroboration)"
  const basis = weather.live
    ? `Live weather observation${signalNote}`
    : `Weather fallback in use — treat as scenario estimate${signalNote}`
  return { level, basis }
}

// ============================================================
// Insight builder (quotes P1 numbers — never recomputes them)
// ============================================================

export function explainWeatherComparison(
  snapshot: Pick<WeatherSnapshot, "precipitation" | "condition" | "source">,
  comparison: WeatherComparisonSummary,
  signals: SocialSignal[],
): WeatherImpactInsight {
  const findings: string[] = []
  const recommendations: string[] = []
  const warnings: string[] = []

  findings.push(
    `P1 ran the what-if scenario at ${comparison.rainfallMm} mm/h (${comparison.severityLabel}); ` +
      `condition: ${snapshot.condition} (${snapshot.source}).`,
  )

  const { peakCongestionDelta, peakQueueDelta } = comparison
  if (peakCongestionDelta > 0) {
    findings.push(
      `Peak congestion rises by ${(peakCongestionDelta * 100).toFixed(1)} percentage points ` +
        `(${(comparison.baseline.metrics.peakCongestion * 100).toFixed(0)}% → ${(comparison.whatIf.metrics.peakCongestion * 100).toFixed(0)}%).`,
    )
  } else if (peakCongestionDelta === 0) {
    findings.push("Peak congestion is unchanged — the current rainfall does not alter operations.")
  } else {
    findings.push("Peak congestion is lower in the what-if than the baseline (unexpected — verify inputs).")
    warnings.push("What-if congestion below baseline: the scenario inputs may be inconsistent.")
  }

  if (peakQueueDelta > 0) {
    findings.push(
      `Peak queue grows from ${comparison.baseline.metrics.peakQueue} to ${comparison.whatIf.metrics.peakQueue} people.`,
    )
  }

  if (comparison.arrivedPopulationDelta < 0) {
    findings.push(
      `${Math.abs(comparison.arrivedPopulationDelta)} fewer people reach the exit within the simulated window.`,
    )
  }
  if (comparison.estimatedDelaySecondsDelta > 0) {
    findings.push(`Average estimated delay increases by ${comparison.estimatedDelaySecondsDelta.toFixed(1)} s per person.`)
  }
  if (comparison.strandedPopulationDelta > 0) {
    warnings.push(
      `${comparison.strandedPopulationDelta} additional people remain in the venue at the end of the window.`,
    )
  }

  if (comparison.affectedEdgeIds.length > 0) {
    findings.push(`Weather-degraded edges: ${comparison.affectedEdgeIds.join(", ")}.`)
  }
  if (comparison.affectedNodeIds.length > 0) {
    findings.push(`Weather-affected zones: ${comparison.affectedNodeIds.join(", ")}.`)
  }

  // Recommendations are operational guidance derived from the deltas.
  if (comparison.severityLabel === "Extreme rainfall" || peakCongestionDelta >= 0.2) {
    recommendations.push("Pre-position shelter routing and consider staged egress before peak rainfall.")
  }
  if (peakQueueDelta > 50) {
    recommendations.push("Increase transit dispatch frequency or open the alternate corridor early.")
  }
  if (comparison.arrivedPopulationDelta < 0) {
    recommendations.push("Hold gate opening until queues drain; communicate delays to attendees.")
  }
  if (recommendations.length === 0) {
    recommendations.push("No operational change required at this rainfall level; continue monitoring.")
  }

  // Social signals are contextual evidence only — they never modify P1 math.
  const relevantSignals = signals.filter((signal) => signal.relevance >= 0.5)
  if (relevantSignals.length > 0) {
    findings.push(
      `${relevantSignals.length} live public signal(s) corroborate weather impact near the venue ` +
        `(e.g. "${relevantSignals[0]!.text.slice(0, 60)}").`,
    )
  } else {
    findings.push("No corroborating public signals available; insight relies on weather + simulation alone.")
  }

  return {
    summary:
      peakCongestionDelta > 0
        ? `${comparison.severityLabel} at ${comparison.rainfallMm} mm/h degrades venue egress: P1 projects higher congestion and longer queues than baseline.`
        : `${comparison.severityLabel} at ${comparison.rainfallMm} mm/h does not materially change P1's baseline projection.`,
    findings,
    recommendations,
    warnings,
    confidence: heuristicConfidence({ live: snapshot.source !== "DEMO_FALLBACK", signalCount: relevantSignals.length }),
  }
}
