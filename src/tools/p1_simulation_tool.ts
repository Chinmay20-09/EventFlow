import { DeterministicSimulator } from "../engine/simulation";
import type {
  CrowdGroupInput,
  SimulationParameters,
  SimulationResult,
} from "../engine/types";

import type { MitigationStrategy } from "../strategies/strategy_model";

/**
 * P2 → P1 Simulation Tool
 *
 * Responsibility:
 * - Provide a clean interface for P2 to communicate with P1.
 * - Run the existing deterministic P1 simulator.
 * - Return P1's authoritative SimulationResult.
 *
 * P2 does NOT:
 * - calculate capacity
 * - calculate crowd density
 * - calculate congestion
 * - calculate travel time
 * - modify P1 simulation logic
 *
 * P1 remains the source of truth for all simulation calculations.
 */

export interface P1SimulationContext {
  graph: ConstructorParameters<typeof DeterministicSimulator>[0];
  groups: CrowdGroupInput[];
  parameters?: Partial<SimulationParameters>;
  graphAtTime?: ConstructorParameters<typeof DeterministicSimulator>[3];
}

export interface BaselineSimulationRequest {
  context: P1SimulationContext;
}

export interface StrategySimulationRequest {
  context: P1SimulationContext;
  strategy: MitigationStrategy;
}

export interface StrategySimulationResult {
  strategy: MitigationStrategy;
  simulation: SimulationResult;
}

export interface P1ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Run the current venue configuration without applying
 * a mitigation strategy.
 *
 * This is the baseline simulation.
 */
export function runBaselineSimulation(
  request: BaselineSimulationRequest,
): P1ToolResult<SimulationResult> {
  try {
    const simulator = new DeterministicSimulator(
      request.context.graph,
      request.context.groups,
      request.context.parameters ?? {},
      request.context.graphAtTime,
    );

    const result = simulator.run();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Validate whether a strategy has the required P2 structure
 * before sending it to P1.
 *
 * NOTE:
 * This is only a lightweight interface-level check.
 *
 * Actual operational validation must remain with P1.
 */
export function validateStrategyForP1(
  strategy: MitigationStrategy,
): P1ToolResult<MitigationStrategy> {
  if (!strategy.strategy_id) {
    return {
      success: false,
      error: "Strategy ID is required.",
    };
  }

  if (!strategy.name) {
    return {
      success: false,
      error: "Strategy name is required.",
    };
  }

  if (!strategy.actions || strategy.actions.length === 0) {
    return {
      success: false,
      error: "Strategy must contain at least one action.",
    };
  }

  if (!strategy.parameters) {
    return {
      success: false,
      error: "Strategy parameters are required.",
    };
  }

  return {
    success: true,
    data: strategy,
  };
}

/**
 * Run P1 using a candidate mitigation strategy.
 *
 * IMPORTANT:
 *
 * The current DeterministicSimulator API shown in the P1 source
 * performs the baseline simulation and does not expose a strategy
 * parameter.
 *
 * Therefore this function deliberately does NOT pretend that the
 * strategy has been applied.
 *
 * Until P1 exposes a strategy/scenario simulation API, the correct
 * behavior is to return a clear error rather than fabricate results.
 */
export function simulateStrategy(
  request: StrategySimulationRequest,
): P1ToolResult<StrategySimulationResult> {
  const validation = validateStrategyForP1(request.strategy);

  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
    };
  }

  return {
    success: false,
    error:
      "Strategy simulation is not yet exposed by the P1 DeterministicSimulator API. P2 must not fabricate strategy results.",
  };
}

/**
 * Compare two P1 simulation results.
 *
 * This function only performs structural comparison of results
 * returned by P1. It does not modify or recalculate P1 metrics.
 */
export interface SimulationComparison {
  baseline: SimulationResult;
  strategy: SimulationResult;

  metrics: {
    estimatedDelaySecondsDelta: number;
    arrivedPopulationDelta: number;
    strandedPopulationDelta: number;
    capacityViolationsDelta: number;
    peakCongestionDelta: number;
    peakQueueDelta: number;
  };
}

export function compareSimulationResults(
  baseline: SimulationResult,
  strategy: SimulationResult,
): P1ToolResult<SimulationComparison> {
  const baselinePeakCongestion =
    baseline.metrics.peakCongestion ?? 0;

  const strategyPeakCongestion =
    strategy.metrics.peakCongestion ?? 0;

  const baselinePeakQueue =
    baseline.metrics.peakQueue ?? 0;

  const strategyPeakQueue =
    strategy.metrics.peakQueue ?? 0;

  return {
    success: true,

    data: {
      baseline,
      strategy,

      metrics: {
        estimatedDelaySecondsDelta:
          strategy.estimatedDelaySeconds -
          baseline.estimatedDelaySeconds,

        arrivedPopulationDelta:
          strategy.arrivedPopulation -
          baseline.arrivedPopulation,

        strandedPopulationDelta:
          strategy.strandedPopulation -
          baseline.strandedPopulation,

        capacityViolationsDelta:
          strategy.capacityViolations.length -
          baseline.capacityViolations.length,

        peakCongestionDelta:
          strategyPeakCongestion -
          baselinePeakCongestion,

        peakQueueDelta:
          strategyPeakQueue -
          baselinePeakQueue,
      },
    },
  };
}

/**
 * Convert unknown thrown values into a safe error message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}