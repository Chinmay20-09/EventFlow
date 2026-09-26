/**
 * P2 AI — Response / Result Interpretation
 *
 * Responsibility:
 * - Interpret authoritative P1 simulation results.
 * - Explain bottlenecks, warnings and outcomes.
 * - Produce organizer-friendly responses.
 *
 * P2 must NOT:
 * - invent metrics
 * - recalculate P1 metrics
 * - override P1 results
 * - claim strategy execution without confirmation
 */

import type { SimulationResult } from "../../../engine/src/types";
import type { MitigationStrategy } from "../strategies/strategy_model";

// ============================================================
// Types
// ============================================================

export interface AIResponse {
  summary: string;
  findings: string[];
  strategy?: string;
  recommendation?: string;
  warnings: string[];
  execution_status:
    | "not_executed"
    | "pending_approval"
    | "approved"
    | "executed";
}

// ============================================================
// Baseline Interpretation
// ============================================================

export function explainSimulationResult(
  result: SimulationResult,
): AIResponse {
  const findings: string[] = [];
  const warnings: string[] = [];

  if (result.bottlenecks.length > 0) {
    findings.push(
      `The simulation identified ${result.bottlenecks.length} bottleneck(s).`,
    );
  } else {
    findings.push(
      "The simulation did not identify a reported bottleneck.",
    );
  }

  if (result.affectedNodes.length > 0) {
    findings.push(
      `${result.affectedNodes.length} affected node(s) were reported.`,
    );
  }

  if (result.affectedEdges.length > 0) {
    findings.push(
      `${result.affectedEdges.length} affected edge(s) were reported.`,
    );
  }

  if (result.queueGrowth.length > 0) {
    findings.push(
      "Queue growth was observed during the simulation.",
    );
  }

  if (result.capacityViolations.length > 0) {
    warnings.push(
      `${result.capacityViolations.length} capacity violation(s) were reported by P1.`,
    );
  }

  if (result.warnings.length > 0) {
    warnings.push(
      `${result.warnings.length} simulation warning(s) were reported by P1.`,
    );
  }

  const summary =
    result.status === "COMPLETED"
      ? "The P1 simulation completed successfully. The following findings are based on the deterministic simulation output."
      : `The P1 simulation returned status: ${result.status}.`;

  return {
    summary,
    findings,
    warnings,
    execution_status: "not_executed",
  };
}

// ============================================================
// Strategy Result Interpretation
// ============================================================

export function explainStrategyResult(
  strategy: MitigationStrategy,
  result: SimulationResult,
): AIResponse {
  const findings: string[] = [];
  const warnings: string[] = [];

  findings.push(
    `Strategy ${strategy.strategy_id} (${strategy.name}) was evaluated using the P1 simulation result.`,
  );

  if (result.bottlenecks.length > 0) {
    findings.push(
      `P1 reported ${result.bottlenecks.length} bottleneck(s) in the simulated scenario.`,
    );
  } else {
    findings.push(
      "P1 did not report a bottleneck in the simulated scenario.",
    );
  }

  if (result.capacityViolations.length > 0) {
    warnings.push(
      `${result.capacityViolations.length} capacity violation(s) were reported by P1.`,
    );
  }

  if (result.warnings.length > 0) {
    warnings.push(
      `${result.warnings.length} warning(s) were reported by P1.`,
    );
  }

  return {
    summary:
      `P1 completed the simulation for ${strategy.strategy_id}. ` +
      "The results below are taken from the simulation output.",
    findings,
    strategy: strategy.name,
    warnings,
    execution_status: "pending_approval",
  };
}

// ============================================================
// Comparison Interpretation
// ============================================================

export interface ComparisonExplanation {
  summary: string;
  findings: string[];
  warnings: string[];
}

export function explainComparison(
  baseline: SimulationResult,
  strategy: SimulationResult,
): ComparisonExplanation {
  const findings: string[] = [];
  const warnings: string[] = [];

  const delayDelta =
    strategy.estimatedDelaySeconds -
    baseline.estimatedDelaySeconds;

  const arrivedDelta =
    strategy.arrivedPopulation -
    baseline.arrivedPopulation;

  const strandedDelta =
    strategy.strandedPopulation -
    baseline.strandedPopulation;

  const violationDelta =
    strategy.capacityViolations.length -
    baseline.capacityViolations.length;

  // These are direct comparisons of P1 outputs.
  if (delayDelta < 0) {
    findings.push(
      `Estimated delay is ${Math.abs(delayDelta)} seconds lower than the baseline.`,
    );
  } else if (delayDelta > 0) {
    findings.push(
      `Estimated delay is ${delayDelta} seconds higher than the baseline.`,
    );
  } else {
    findings.push(
      "Estimated delay is unchanged compared with the baseline.",
    );
  }

  if (arrivedDelta > 0) {
    findings.push(
      `${arrivedDelta} more visitor(s) arrived compared with the baseline.`,
    );
  } else if (arrivedDelta < 0) {
    findings.push(
      `${Math.abs(arrivedDelta)} fewer visitor(s) arrived compared with the baseline.`,
    );
  }

  if (strandedDelta < 0) {
    findings.push(
      `${Math.abs(strandedDelta)} fewer visitor(s) were stranded compared with the baseline.`,
    );
  } else if (strandedDelta > 0) {
    warnings.push(
      `${strandedDelta} additional visitor(s) were stranded compared with the baseline.`,
    );
  }

  if (violationDelta < 0) {
    findings.push(
      `${Math.abs(violationDelta)} fewer capacity violation(s) were reported.`,
    );
  } else if (violationDelta > 0) {
    warnings.push(
      `${violationDelta} additional capacity violation(s) were reported.`,
    );
  } else {
    findings.push(
      "The number of reported capacity violations is unchanged.",
    );
  }

  return {
    summary:
      "The strategy scenario has been compared with the P1 baseline using the returned simulation results.",
    findings,
    warnings,
  };
}

// ============================================================
// Organizer Response
// ============================================================

/**
 * Convert an AIResponse into simple organizer-facing text.
 */
export function formatOrganizerResponse(
  response: AIResponse,
): string {
  const sections: string[] = [];

  sections.push(response.summary);

  if (response.strategy) {
    sections.push(`Strategy: ${response.strategy}`);
  }

  if (response.findings.length > 0) {
    sections.push(
      "Findings:\n" +
        response.findings
          .map((finding) => `- ${finding}`)
          .join("\n"),
    );
  }

  if (response.recommendation) {
    sections.push(
      `Recommendation: ${response.recommendation}`,
    );
  }

  if (response.warnings.length > 0) {
    sections.push(
      "Warnings:\n" +
        response.warnings
          .map((warning) => `- ${warning}`)
          .join("\n"),
    );
  }

  sections.push(
    `Execution status: ${response.execution_status}`,
  );

  return sections.join("\n\n");
}