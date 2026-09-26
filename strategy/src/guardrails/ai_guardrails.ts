/**
 * EV-021 — AI Guardrails
 *
 * P2 AI safety and boundary layer.
 *
 * Core principle:
 *
 * P2 proposes and explains.
 * P1 calculates, validates, simulates, and remains the source of truth.
 *
 * These guardrails prevent the AI layer from:
 * - inventing simulation results
 * - inventing authoritative numerical values
 * - overriding P1 results
 * - bypassing safety constraints
 * - claiming an action was executed when it was not
 * - pretending that missing information is known
 */

import type { MitigationStrategy } from "../strategies/strategy_model";

// ============================================================
// Types
// ============================================================

export type AIActionType =
  | "explain"
  | "propose_strategy"
  | "request_simulation"
  | "request_validation"
  | "request_comparison"
  | "execute_strategy";

export interface AIGuardrailContext {
  p1ResultAvailable: boolean;
  p1ValidationPassed: boolean;
  strategyApproved: boolean;
  strategyExecuted: boolean;

  /**
   * Information explicitly provided by P1/current event state.
   */
  knownFacts: string[];

  /**
   * Values or facts that are currently unavailable.
   */
  missingInformation: string[];
}

export interface AIGuardrailResult {
  allowed: boolean;
  errors: string[];
  warnings: string[];
}

export interface AIResponseValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================
// Forbidden AI behavior
// ============================================================

const FORBIDDEN_CLAIM_PATTERNS = [
  /\bI calculated\b/i,
  /\bI determined the capacity\b/i,
  /\bI determined the crowd density\b/i,
  /\bI determined the simulation result\b/i,
  /\bthe exact capacity is\b/i,
  /\bthe exact density is\b/i,
  /\bthe exact risk is\b/i,
  /\bthe simulation shows\b/i,
  /\bthe strategy was executed\b/i,
  /\bthe strategy has been executed\b/i,
  /\bI executed the strategy\b/i,
];

/**
 * Phrases indicating that the AI is claiming authority over
 * values that should come from P1.
 */
export function containsForbiddenAuthorityClaim(
  text: string,
): boolean {
  return FORBIDDEN_CLAIM_PATTERNS.some((pattern) =>
    pattern.test(text),
  );
}

// ============================================================
// Action-level guardrails
// ============================================================

/**
 * Validate whether the requested AI action is allowed under
 * the current P1/P2 state.
 */
export function validateAIAction(
  action: AIActionType,
  context: AIGuardrailContext,
): AIGuardrailResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (action) {
    // --------------------------------------------------------
    // Explanation
    // --------------------------------------------------------
    case "explain":
      break;

    // --------------------------------------------------------
    // Strategy proposal
    // --------------------------------------------------------
    case "propose_strategy":
      if (context.missingInformation.length > 0) {
        warnings.push(
          "Some information is missing. The AI may propose a candidate strategy, but must not invent the missing values.",
        );
      }

      break;

    // --------------------------------------------------------
    // Request P1 simulation
    // --------------------------------------------------------
    case "request_simulation":
      if (!context.p1ResultAvailable) {
        warnings.push(
          "No P1 simulation result is currently available. The AI must request simulation instead of claiming a result.",
        );
      }

      break;

    // --------------------------------------------------------
    // Request P1 validation
    // --------------------------------------------------------
    case "request_validation":
      break;

    // --------------------------------------------------------
    // Compare simulation results
    // --------------------------------------------------------
    case "request_comparison":
      if (!context.p1ResultAvailable) {
        errors.push(
          "Simulation comparison requires P1 simulation results.",
        );
      }

      break;

    // --------------------------------------------------------
    // Execute strategy
    // --------------------------------------------------------
    case "execute_strategy":
      if (!context.p1ValidationPassed) {
        errors.push(
          "A strategy cannot be executed before P1 validation passes.",
        );
      }

      if (!context.strategyApproved) {
        errors.push(
          "A strategy cannot be executed before organizer approval.",
        );
      }

      break;

    default:
      errors.push("Unknown AI action.");
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// Strategy guardrails
// ============================================================

/**
 * Validate a strategy before the AI proposes it to P1.
 *
 * This does NOT replace P1 validation.
 */
export function validateStrategyProposal(
  strategy: MitigationStrategy,
): AIGuardrailResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!strategy.strategy_id) {
    errors.push("Strategy ID is required.");
  }

  if (!strategy.name?.trim()) {
    errors.push("Strategy name is required.");
  }

  if (!strategy.description?.trim()) {
    errors.push("Strategy description is required.");
  }

  if (!strategy.actions || strategy.actions.length === 0) {
    errors.push(
      "Strategy must contain at least one action.",
    );
  }

  if (!strategy.parameters) {
    errors.push(
      "Strategy parameters must be explicitly represented.",
    );
  }

  if (strategy.approval_required !== true) {
    warnings.push(
      "Mitigation strategies should normally require organizer approval.",
    );
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// P1 authority guardrail
// ============================================================

/**
 * P1 is the authoritative source for simulation results.
 *
 * This function determines whether the AI is allowed to make
 * a claim based on simulation output.
 */
export function validateP1DependentClaim(
  claim: string,
  context: AIGuardrailContext,
): AIGuardrailResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (containsForbiddenAuthorityClaim(claim)) {
    errors.push(
      "AI must not claim authoritative simulation calculations.",
    );
  }

  if (!context.p1ResultAvailable) {
    warnings.push(
      "The requested claim may depend on P1 results that are not currently available.",
    );
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// Missing information guardrail
// ============================================================

/**
 * Prevent the AI from silently treating missing information
 * as known information.
 */
export function validateRequiredInformation(
  requiredInformation: string[],
  context: AIGuardrailContext,
): AIGuardrailResult {
  const errors: string[] = [];

  for (const required of requiredInformation) {
    if (context.missingInformation.includes(required)) {
      errors.push(
        `Required information is missing: ${required}`,
      );
    }
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings: [],
  };
}

// ============================================================
// Execution guardrail
// ============================================================

/**
 * Validate whether the AI may tell the organizer that a strategy
 * has been executed.
 *
 * The AI must never claim execution simply because it proposed
 * or simulated a strategy.
 */
export function validateExecutionClaim(
  context: AIGuardrailContext,
): AIGuardrailResult {
  const errors: string[] = [];

  if (!context.strategyApproved) {
    errors.push(
      "Strategy has not received organizer approval.",
    );
  }

  if (!context.p1ValidationPassed) {
    errors.push(
      "Strategy has not passed P1 validation.",
    );
  }

  if (!context.strategyExecuted) {
    errors.push(
      "Strategy has not been confirmed as executed.",
    );
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings: [],
  };
}

// ============================================================
// AI response validation
// ============================================================

/**
 * Final validation before an AI response is presented to
 * the organizer.
 *
 * This checks for obvious violations of the P1/P2 boundary.
 */
export function validateAIResponse(
  response: string,
  context: AIGuardrailContext,
): AIResponseValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response.trim()) {
    errors.push("AI response cannot be empty.");
  }

  if (containsForbiddenAuthorityClaim(response)) {
    errors.push(
      "AI response contains a claim that may incorrectly present the AI as the authoritative simulation source.",
    );
  }

  if (
    !context.strategyExecuted &&
    /\bexecuted\b/i.test(response)
  ) {
    errors.push(
      "AI must not claim that a strategy was executed without execution confirmation.",
    );
  }

  if (
    context.missingInformation.length > 0 &&
    /\bconfirmed\b/i.test(response)
  ) {
    warnings.push(
      "Response contains a confirmation claim while required information may still be missing.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// Context priority
// ============================================================

/**
 * EV-021 context priority.
 *
 * Higher-priority information must take precedence over
 * assumptions or conversational context.
 */
export const AI_CONTEXT_PRIORITY = [
  "CURRENT_P1_STATE",
  "CURRENT_EVENT_DATA",
  "CURRENT_TOOL_RESULTS",
  "CONFIGURED_CONSTRAINTS",
  "CURRENT_ORGANIZER_REQUEST",
  "CONVERSATION_CONTEXT",
  "AI_ASSUMPTIONS",
] as const;

export type AIContextPriority =
  (typeof AI_CONTEXT_PRIORITY)[number];

/**
 * Returns whether one context source has higher priority
 * than another.
 */
export function hasHigherContextPriority(
  first: AIContextPriority,
  second: AIContextPriority,
): boolean {
  return (
    AI_CONTEXT_PRIORITY.indexOf(first) <
    AI_CONTEXT_PRIORITY.indexOf(second)
  );
}