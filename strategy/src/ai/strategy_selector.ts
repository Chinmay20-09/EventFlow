/**
 * P2 AI — Strategy Selector
 *
 * Responsibility:
 * - Select candidate strategies from the predefined strategy catalog.
 * - Use organizer intent and detected entities.
 * - Never invent a strategy outside the catalog.
 * - Never calculate authoritative strategy effectiveness.
 *
 * P1 remains responsible for:
 * - operational validation
 * - deterministic simulation
 * - numerical effects
 * - safety/capacity validation
 */

import type { OrganizerIntent } from "./intent";
import type { AIContext } from "./context";

import type { MitigationStrategy } from "../strategies/strategy_model";
import {
  STRATEGY_CATALOG,
  getStrategyById,
  getStrategiesByTrigger,
} from "../strategies/strategy_catalog";

// ============================================================
// Types
// ============================================================

export interface StrategySelectionResult {
  candidates: MitigationStrategy[];

  /**
   * True when the organizer explicitly referenced
   * a strategy ID.
   */
  explicit_strategy: boolean;

  /**
   * Whether more information is needed before selecting
   * a candidate strategy.
   */
  requires_clarification: boolean;

  clarification_question?: string;

  /**
   * Explanation for why these strategies were selected
   * as candidates.
   */
  reason: string;
}

// ============================================================
// Intent → Trigger mapping
// ============================================================

function getTriggerForIntent(
  intent: OrganizerIntent,
): MitigationStrategy["trigger"]["condition"] | undefined {
  switch (intent) {
    case "analyze_congestion":
      return "gate_congestion";

    case "identify_bottleneck":
      return "bottleneck_detected";

    case "request_strategy":
      return "bottleneck_detected";

    default:
      return undefined;
  }
}

// ============================================================
// Candidate Selection
// ============================================================

/**
 * Select candidate strategies from the predefined catalog.
 */
export function selectCandidateStrategies(
  context: AIContext,
): StrategySelectionResult {
  const strategyId = context.entities.strategy_id;

  // ----------------------------------------------------------
  // Explicit strategy request
  // ----------------------------------------------------------

  if (strategyId) {
    const strategy = getStrategyById(strategyId);

    if (!strategy) {
      return {
        candidates: [],
        explicit_strategy: true,
        requires_clarification: true,
        clarification_question:
          `Strategy ${strategyId} does not exist in the configured strategy catalog.`,
        reason:
          "The requested strategy was not found in the predefined catalog.",
      };
    }

    return {
      candidates: [strategy],
      explicit_strategy: true,
      requires_clarification: false,
      reason:
        `Organizer explicitly referenced ${strategy.strategy_id}.`,
    };
  }

  // ----------------------------------------------------------
  // Determine candidates from intent
  // ----------------------------------------------------------

  const trigger = getTriggerForIntent(context.intent);

  if (!trigger) {
    return {
      candidates: [],
      explicit_strategy: false,
      requires_clarification: true,
      clarification_question:
        "What problem or venue condition should the mitigation strategy address?",
      reason:
        "The current intent does not identify a strategy-selection trigger.",
    };
  }

  let candidates = getStrategiesByTrigger(trigger);

  // ----------------------------------------------------------
  // Entity-aware filtering
  // ----------------------------------------------------------

  const hasGate =
    context.entities.gate_id !== undefined;

  const hasExit =
    context.entities.exit_id !== undefined;

  const hasZone =
    context.entities.zone_id !== undefined;

  const hasRoute =
    context.entities.route_id !== undefined;

  /*
   * Keep only strategies relevant to the entity type when
   * the organizer explicitly mentioned one.
   */
  if (hasGate) {
    const gateStrategies = candidates.filter(
      (strategy) =>
        strategy.actions.some(
          (action) =>
            action.type === "redirect_entry_flow" ||
            action.type === "activate_gate" ||
            action.type === "control_entry_flow",
        ),
    );

    if (gateStrategies.length > 0) {
      candidates = gateStrategies;
    }
  }

  if (hasExit) {
    const exitStrategies = candidates.filter(
      (strategy) =>
        strategy.actions.some(
          (action) =>
            action.type === "redirect_exit_flow",
        ),
    );

    if (exitStrategies.length > 0) {
      candidates = exitStrategies;
    }
  }

  if (hasZone) {
    const zoneStrategies = candidates.filter(
      (strategy) =>
        strategy.actions.some(
          (action) =>
            action.type === "restrict_zone" ||
            action.type === "reopen_zone",
        ),
    );

    if (zoneStrategies.length > 0) {
      candidates = zoneStrategies;
    }
  }

  if (hasRoute) {
    const routeStrategies = candidates.filter(
      (strategy) =>
        strategy.actions.some(
          (action) =>
            action.type === "divert_route",
        ),
    );

    if (routeStrategies.length > 0) {
      candidates = routeStrategies;
    }
  }

  // ----------------------------------------------------------
  // No candidates
  // ----------------------------------------------------------

  if (candidates.length === 0) {
    return {
      candidates: [],
      explicit_strategy: false,
      requires_clarification: true,
      clarification_question:
        "I could not identify a matching mitigation strategy from the current strategy catalog.",
      reason:
        "No predefined strategy matches the current intent and available entities.",
    };
  }

  return {
    candidates,
    explicit_strategy: false,
    requires_clarification: false,
    reason:
      `Selected ${candidates.length} candidate strategy ` +
      `or strategies from the predefined catalog using the ` +
      `${trigger} trigger.`,
  };
}

// ============================================================
// Direct catalog access
// ============================================================

/**
 * Return all currently configured MVP strategies.
 *
 * Useful for the AI layer when it needs to inspect the
 * available strategy catalog.
 */
export function getAvailableStrategies(): MitigationStrategy[] {
  return [...STRATEGY_CATALOG];
}

// ============================================================
// Strategy description helper
// ============================================================

/**
 * Produce a safe human-readable summary of candidate strategies.
 *
 * This describes catalog definitions only.
 * It does not claim that any strategy will actually work.
 */
export function describeCandidateStrategies(
  candidates: MitigationStrategy[],
): string[] {
  return candidates.map(
    (strategy) =>
      `${strategy.strategy_id} — ${strategy.name}: ${strategy.description}`,
  );
}