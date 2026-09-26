/**
 * EV-012 — Strategy Model
 *
 * Defines the structure of a mitigation strategy.
 *
 * P2 responsibility:
 * - Define/structure candidate strategies
 * - Validate basic structure
 * - Explain strategies
 *
 * P1 responsibility:
 * - Validate operational constraints
 * - Perform deterministic simulation
 * - Calculate actual effects
 */

export type StrategyObjective =
  | "reduce_crowd_congestion"
  | "reduce_gate_utilization"
  | "reduce_zone_occupancy"
  | "redistribute_flow"
  | "reduce_risk"
  | "improve_evacuation_flow"
  | "maintain_capacity";

export type TriggerCondition =
  | "gate_congestion"
  | "high_density"
  | "bottleneck_detected"
  | "flow_exceeds_capacity"
  | "organizer_request"
  | "emergency_condition";

export type StrategyActionType =
  | "redirect_entry_flow"
  | "activate_gate"
  | "control_entry_flow"
  | "redirect_exit_flow"
  | "restrict_zone"
  | "divert_route"
  | "activate_resource"
  | "reopen_zone";

export interface StrategyAction {
  type: StrategyActionType;

  source?: string;
  target?: string;

  zone_id?: string;
  route_id?: string;

  percentage?: number;
  duration_minutes?: number;

  level?: "low" | "medium" | "high";
}

export interface StrategyTrigger {
  condition: TriggerCondition;

  /**
   * Optional value used by P2 to describe
   * why the strategy was proposed.
   *
   * P1 remains responsible for authoritative
   * threshold validation.
   */
  value?: number;

  unit?: string;

  description?: string;
}

export interface StrategyParameters {
  source_gate?: string;
  target_gate?: string;

  source_exit?: string;
  target_exit?: string;

  zone_id?: string;
  route_id?: string;

  redirect_percentage?: number;

  duration_minutes?: number;

  restriction_level?: "low" | "medium" | "high";

  flow_control_level?: "low" | "medium" | "high";

  resource_type?: string;
  quantity?: number;

  [key: string]: unknown;
}

export interface StrategyConstraint {
  id: string;
  description: string;

  /**
   * P2 records the required constraint.
   * P1 determines whether the constraint
   * is actually satisfied.
   */
  required: boolean;
}

export interface ExpectedEffect {
  effect: string;
  description: string;
}

export interface MitigationStrategy {
  /**
   * Stable identifier.
   * Example: ST-001
   */
  strategy_id: string;

  /**
   * Human-readable strategy name.
   */
  name: string;

  /**
   * Strategy version.
   */
  version: string;

  /**
   * Human-readable explanation.
   */
  description: string;

  /**
   * Primary objective.
   */
  objective: StrategyObjective;

  /**
   * Conditions under which the strategy
   * may be considered.
   */
  trigger: StrategyTrigger;

  /**
   * Operational actions represented
   * by the strategy.
   */
  actions: StrategyAction[];

  /**
   * Strategy-specific parameters.
   */
  parameters: StrategyParameters;

  /**
   * Conditions that P1 must validate.
   */
  constraints: StrategyConstraint[];

  /**
   * Expected effects.
   *
   * These are expectations, NOT calculated results.
   */
  expected_effects: ExpectedEffect[];

  /**
   * Whether organizer approval is required
   * before execution.
   */
  approval_required: boolean;
}

/**
 * Result returned after basic P2-side
 * strategy structure validation.
 */
export interface StrategyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate the structure of a strategy.
 *
 * IMPORTANT:
 * This does NOT perform operational validation.
 * Capacity, gate availability, route feasibility,
 * safety limits, etc. remain P1 responsibilities.
 */
export function validateStrategyStructure(
  strategy: MitigationStrategy,
): StrategyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!strategy.strategy_id) {
    errors.push("strategy_id is required");
  }

  if (!/^ST-\d{3,}$/.test(strategy.strategy_id)) {
    errors.push("strategy_id must follow the ST-XXX format");
  }

  if (!strategy.name.trim()) {
    errors.push("strategy name is required");
  }

  if (!strategy.version.trim()) {
    errors.push("strategy version is required");
  }

  if (!strategy.description.trim()) {
    errors.push("strategy description is required");
  }

  if (!strategy.objective) {
    errors.push("strategy objective is required");
  }

  if (!strategy.trigger?.condition) {
    errors.push("strategy trigger condition is required");
  }

  if (!strategy.actions || strategy.actions.length === 0) {
    errors.push("at least one strategy action is required");
  }

  if (!strategy.constraints) {
    errors.push("constraints must be provided");
  }

  if (!strategy.expected_effects) {
    errors.push("expected_effects must be provided");
  }

  if (strategy.approval_required !== true) {
    warnings.push(
      "Operational mitigation strategies normally require organizer approval.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}