/**
 * P2 — Tool Registry
 *
 * Responsibility:
 * - Define the tools that P2 is allowed to access.
 * - Provide a controlled interface between P2 and P1.
 *
 * IMPORTANT:
 * P2 never accesses the P1 engine directly.
 * All P1 operations must go through registered tools.
 */

import {
  runBaselineSimulation,
  validateStrategyForP1,
  simulateStrategy,
  compareSimulationResults,
} from "./p1_simulation_tool";

import type {
  BaselineSimulationRequest,
  StrategySimulationRequest,
} from "./p1_simulation_tool";

import type {
  MitigationStrategy,
} from "../strategies/strategy_model";

import type {
  SimulationResult,
} from "../engine/types";

// ============================================================
// Tool Names
// ============================================================

export type P2ToolName =
  | "run_baseline_simulation"
  | "validate_strategy"
  | "simulate_strategy"
  | "compare_simulations";

// ============================================================
// Tool Metadata
// ============================================================

export interface P2ToolDefinition {
  name: P2ToolName;

  description: string;

  requires_p1: boolean;

  requires_strategy: boolean;

  mutates_state: boolean;
}

// ============================================================
// Registered Tools
// ============================================================

export const P2_TOOL_DEFINITIONS:
  P2ToolDefinition[] = [
    {
      name:
        "run_baseline_simulation",

      description:
        "Run the deterministic P1 baseline simulation.",

      requires_p1: true,

      requires_strategy: false,

      mutates_state: false,
    },

    {
      name:
        "validate_strategy",

      description:
        "Validate a candidate mitigation strategy before P1 simulation or execution.",

      requires_p1: true,

      requires_strategy: true,

      mutates_state: false,
    },

    {
      name:
        "simulate_strategy",

      description:
        "Evaluate a mitigation strategy using the P1 simulation engine when strategy simulation is supported.",

      requires_p1: true,

      requires_strategy: true,

      mutates_state: false,
    },

    {
      name:
        "compare_simulations",

      description:
        "Compare authoritative P1 baseline and strategy simulation results.",

      requires_p1: true,

      requires_strategy: false,

      mutates_state: false,
    },
  ];

// ============================================================
// Tool Lookup
// ============================================================

export function getP2Tool(
  name: P2ToolName,
): P2ToolDefinition | undefined {
  return P2_TOOL_DEFINITIONS.find(
    (tool) => tool.name === name,
  );
}

export function isP2ToolAvailable(
  name: string,
): name is P2ToolName {
  return P2_TOOL_DEFINITIONS.some(
    (tool) => tool.name === name,
  );
}

// ============================================================
// Tool Execution Result
// ============================================================

export interface P2ToolExecutionResult<T = unknown> {
  tool_name: P2ToolName;

  success: boolean;

  data?: T;

  error?: string;
}

// ============================================================
// Tool Registry
// ============================================================

export class P2ToolRegistry {
  /**
   * Return all tools available to P2.
   */
  listTools(): P2ToolDefinition[] {
    return [
      ...P2_TOOL_DEFINITIONS,
    ];
  }

  /**
   * Check whether a tool exists.
   */
  hasTool(
    name: string,
  ): name is P2ToolName {
    return isP2ToolAvailable(name);
  }

  /**
   * Run the P1 baseline simulation.
   */
  runBaseline(
    request: BaselineSimulationRequest,
  ): P2ToolExecutionResult {
    try {
      const result =
        runBaselineSimulation(
          request,
        );

      return {
        tool_name:
          "run_baseline_simulation",

        success:
          result.success,

        data:
          result.data,

        error:
          result.error,
      };
    } catch (error) {
      return {
        tool_name:
          "run_baseline_simulation",

        success: false,

        error:
          this.getErrorMessage(error),
      };
    }
  }

  /**
   * Validate a strategy for P1.
   *
   * This is still only a validation request.
   * It does not execute the strategy.
   */
  validateStrategy(
    strategy: MitigationStrategy,
  ): P2ToolExecutionResult {
    try {
      const result =
        validateStrategyForP1(
          strategy,
        );

      return {
        tool_name:
          "validate_strategy",

        success:
          result.success,

        data:
          result.data,

        error:
          result.error,
      };
    } catch (error) {
      return {
        tool_name:
          "validate_strategy",

        success: false,

        error:
          this.getErrorMessage(error),
      };
    }
  }

  /**
   * Request strategy simulation from P1.
   *
   * The current P1 engine may not expose
   * strategy simulation yet. The underlying
   * P1 tool is responsible for reporting that.
   */
  simulateStrategy(
    request: StrategySimulationRequest,
  ): P2ToolExecutionResult {
    try {
      const result =
        simulateStrategy(
          request,
        );

      return {
        tool_name:
          "simulate_strategy",

        success:
          result.success,

        data:
          result.data,

        error:
          result.error,
      };
    } catch (error) {
      return {
        tool_name:
          "simulate_strategy",

        success: false,

        error:
          this.getErrorMessage(error),
      };
    }
  }

  /**
   * Compare two authoritative P1 results.
   */
  compareSimulations(
    baseline: SimulationResult,
    strategy: SimulationResult,
  ): P2ToolExecutionResult {
    try {
      const result =
        compareSimulationResults(
          baseline,
          strategy,
        );

      return {
        tool_name:
          "compare_simulations",

        success:
          result.success,

        data:
          result.data,

        error:
          result.error,
      };
    } catch (error) {
      return {
        tool_name:
          "compare_simulations",

        success: false,

        error:
          this.getErrorMessage(error),
      };
    }
  }

  // ----------------------------------------------------------
  // Generic Tool Information
  // ----------------------------------------------------------

  getToolDescription(
    name: P2ToolName,
  ): string {
    const tool =
      getP2Tool(name);

    return (
      tool?.description ??
      "Unknown P2 tool."
    );
  }

  // ----------------------------------------------------------
  // Error Helper
  // ----------------------------------------------------------

  private getErrorMessage(
    error: unknown,
  ): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}

// ============================================================
// Default Registry
// ============================================================

export const p2ToolRegistry =
  new P2ToolRegistry();