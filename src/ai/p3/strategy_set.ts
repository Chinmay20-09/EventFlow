import type { MitigationStrategy, StrategyAction } from "../../strategies/strategy_model";
import type {
  P3StrategyAction,
  P3StrategySetRequest,
  RiskLevel,
} from "./types";

/**
 * Maps P2 strategy action types to the action names
 * expected by the P3 strategy-set API.
 */
const ACTION_MAP: Record<StrategyAction["type"], string> = {
  redirect_entry_flow: "REDIRECT_INCOMING_FLOW",
  activate_gate: "ACTIVATE_GATE",
  control_entry_flow: "CONTROL_ENTRY_FLOW",
  redirect_exit_flow: "REDIRECT_OUTGOING_FLOW",
  restrict_zone: "RESTRICT_ZONE",
  divert_route: "DIVERT_ROUTE",
  activate_resource: "ACTIVATE_RESOURCE",
  reopen_zone: "REOPEN_ZONE",
};

/**
 * Converts a P2 action level into the P3 risk-level format.
 */
function mapRiskLevel(
  actions: StrategyAction[],
): RiskLevel {
  const levels = actions
    .map((action) => action.level)
    .filter(
      (level): level is "low" | "medium" | "high" =>
        level !== undefined,
    );

  if (levels.includes("high")) {
    return "HIGH";
  }

  if (levels.includes("medium")) {
    return "MEDIUM";
  }

  return "LOW";
}

/**
 * Converts one P2 strategy action into the P3 API representation.
 */
function mapStrategyAction(
  action: StrategyAction,
): P3StrategyAction {
  return {
    source_node_id: action.source ?? "",
    destination_node_id: action.target ?? "",
    action: ACTION_MAP[action.type],
  };
}

/**
 * Converts a P2 MitigationStrategy into the
 * strategy-set payload expected by P3.
 *
 * P2 owns the strategy semantics.
 * P3 receives only the fields required by its API.
 */
export function toP3StrategySet(
  strategy: MitigationStrategy,
): P3StrategySetRequest {
  return {
    name: strategy.name,
    description: strategy.description,
    risk_level: mapRiskLevel(strategy.actions),
    strategies: strategy.actions.map(mapStrategyAction),
  };
}