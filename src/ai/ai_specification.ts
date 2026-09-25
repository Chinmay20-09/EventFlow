/**
 * EV-021 — AI Specification
 *
 * Defines the responsibilities, inputs, outputs, context,
 * and boundaries of the P2 AI intelligence layer.
 *
 * CORE PRINCIPLE:
 *
 * P2 proposes, interprets, explains, and communicates.
 * P1 calculates, validates, and simulates.
 *
 * The AI must never become the authoritative source
 * for deterministic simulation results.
 */

// ---------------------------------------------------------
// AI Responsibilities
// ---------------------------------------------------------

export type AIResponsibility =
  | "natural_language_understanding"
  | "intent_detection"
  | "entity_extraction"
  | "context_management"
  | "clarification"
  | "strategy_generation"
  | "tool_selection"
  | "tool_calling"
  | "result_interpretation"
  | "explanation"
  | "guardrails";

// ---------------------------------------------------------
// AI Intent Types
// ---------------------------------------------------------

export type AIIntent =
  | "query_event_state"
  | "identify_problem"
  | "generate_strategy"
  | "evaluate_strategy"
  | "explain_result"
  | "request_mitigation"
  | "request_clarification"
  | "unknown";

// ---------------------------------------------------------
// AI Entities
// ---------------------------------------------------------

export interface AIEntities {
  gate_id?: string;
  exit_id?: string;
  zone_id?: string;
  route_id?: string;

  strategy_id?: string;

  percentage?: number;
  duration_minutes?: number;

  resource_type?: string;
  quantity?: number;

  [key: string]: unknown;
}

// ---------------------------------------------------------
// AI Request
// ---------------------------------------------------------

export interface AIRequest {
  request_id: string;

  /**
   * Original natural-language request
   * from the organizer.
   */
  message: string;

  /**
   * Detected intent.
   */
  intent?: AIIntent;

  /**
   * Extracted entities from the request.
   */
  entities?: AIEntities;

  /**
   * Current conversation/session identifier.
   */
  session_id?: string;
}

// ---------------------------------------------------------
// P1 State
// ---------------------------------------------------------

export interface P1State {
  /**
   * Current authoritative state provided by P1.
   *
   * P2 should use this state instead of inventing
   * simulation values.
   */
  event_id?: string;

  timestamp?: string;

  gates?: unknown[];

  exits?: unknown[];

  zones?: unknown[];

  routes?: unknown[];

  crowd_state?: unknown;

  risk_state?: unknown;

  capacity_state?: unknown;

  [key: string]: unknown;
}

// ---------------------------------------------------------
// Tool Result
// ---------------------------------------------------------

export interface AIToolResult {
  tool_name: string;

  success: boolean;

  /**
   * Data returned by the tool/P1.
   */
  data?: unknown;

  /**
   * Error returned by the tool, if any.
   */
  error?: string;
}

// ---------------------------------------------------------
// AI Context
// ---------------------------------------------------------

export interface AIContext {
  /**
   * Priority:
   *
   * 1. Current P1 State
   * 2. Current Event Data
   * 3. Current Tool Results
   * 4. Configured Constraints
   * 5. Current Organizer Request
   * 6. Conversation Context
   * 7. AI Assumptions
   */

  p1_state?: P1State;

  event_data?: Record<string, unknown>;

  tool_results?: AIToolResult[];

  configured_constraints?: Record<string, unknown>;

  organizer_request?: AIRequest;

  conversation_context?: string[];

  ai_assumptions?: string[];
}

// ---------------------------------------------------------
// Strategy Proposal
// ---------------------------------------------------------

export interface AIStrategyProposal {
  strategy_id: string;

  reason: string;

  parameters: Record<string, unknown>;

  requires_p1_validation: boolean;

  requires_organizer_approval: boolean;
}

// ---------------------------------------------------------
// AI Response
// ---------------------------------------------------------

export interface AIResponse {
  request_id: string;

  intent: AIIntent;

  explanation: string;

  strategy_proposals?: AIStrategyProposal[];

  tool_calls?: string[];

  clarification_required?: boolean;

  clarification_question?: string;
}

// ---------------------------------------------------------
// AI Boundaries
// ---------------------------------------------------------

export interface AIBoundary {
  rule_id: string;

  rule: string;

  description: string;
}

// ---------------------------------------------------------
// AI Boundary Rules
// ---------------------------------------------------------

export const AI_BOUNDARIES: AIBoundary[] = [
  {
    rule_id: "AI-B01",
    rule: "Do not invent simulation results.",
    description:
      "The AI must not fabricate crowd, capacity, risk, flow, or other deterministic simulation values.",
  },

  {
    rule_id: "AI-B02",
    rule: "Do not override P1 validation.",
    description:
      "P1 remains the authoritative source for deterministic validation and simulation.",
  },

  {
    rule_id: "AI-B03",
    rule: "Do not override safety constraints.",
    description:
      "The AI must not recommend bypassing configured safety or hard constraints.",
  },

  {
    rule_id: "AI-B04",
    rule: "Do not pretend execution occurred.",
    description:
      "The AI must not claim that a strategy was executed unless execution was confirmed by the system.",
  },

  {
    rule_id: "AI-B05",
    rule: "Do not fabricate missing information.",
    description:
      "When required information is unavailable, the AI should request clarification or obtain the information through an available tool.",
  },

  {
    rule_id: "AI-B06",
    rule: "P1 results must remain authoritative.",
    description:
      "When P1 provides deterministic simulation results, P2 must interpret those results rather than replacing them with its own calculations.",
  },

  {
    rule_id: "AI-B07",
    rule: "Require approval where configured.",
    description:
      "Strategies requiring organizer approval must not be treated as automatically approved.",
  },
];

// ---------------------------------------------------------
// Context Priority
// ---------------------------------------------------------

export const CONTEXT_PRIORITY = [
  "p1_state",
  "event_data",
  "tool_results",
  "configured_constraints",
  "organizer_request",
  "conversation_context",
  "ai_assumptions",
] as const;

// ---------------------------------------------------------
// Validate AI Request
// ---------------------------------------------------------

export interface AIRequestValidationResult {
  valid: boolean;

  errors: string[];

  warnings: string[];
}

export function validateAIRequest(
  request: AIRequest,
): AIRequestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!request.request_id.trim()) {
    errors.push("request_id is required");
  }

  if (!request.message.trim()) {
    errors.push("message is required");
  }

  if (!request.session_id) {
    warnings.push(
      "session_id is not provided; conversation context may be limited.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------
// Check AI Boundary
// ---------------------------------------------------------

export function getAIBoundary(
  ruleId: string,
): AIBoundary | undefined {
  return AI_BOUNDARIES.find(
    (boundary) => boundary.rule_id === ruleId,
  );
}

// ---------------------------------------------------------
// Get Context Priority
// ---------------------------------------------------------

export function getContextPriority(): readonly string[] {
  return CONTEXT_PRIORITY;
}

// ---------------------------------------------------------
// Create Basic AI Response
// ---------------------------------------------------------

export function createAIResponse(
  requestId: string,
  intent: AIIntent,
  explanation: string,
): AIResponse {
  return {
    request_id: requestId,
    intent,
    explanation,
  };
}