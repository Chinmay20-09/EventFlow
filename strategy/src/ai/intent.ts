/**
 * P2 AI — Intent Detection
 *
 * Responsibility:
 * - Convert organizer natural-language requests into structured intent.
 * - Extract simple entities such as gate IDs, exit IDs, zone IDs and route IDs.
 *
 * This module does NOT:
 * - calculate capacity
 * - calculate crowd density
 * - run simulations
 * - decide authoritative numerical values
 * - execute mitigation strategies
 *
 * P1 remains the source of truth for simulation and validation.
 */

// ============================================================
// Intent Types
// ============================================================

export type OrganizerIntent =
  | "analyze_congestion"
  | "identify_bottleneck"
  | "request_strategy"
  | "simulate_strategy"
  | "compare_strategy"
  | "explain_result"
  | "check_status"
  | "approve_strategy"
  | "reject_strategy"
  | "execute_strategy"
  | "unknown";

// ============================================================
// Extracted Entities
// ============================================================

export interface IntentEntities {
  gate_id?: string;
  exit_id?: string;
  zone_id?: string;
  route_id?: string;
  strategy_id?: string;

  /**
   * Optional natural-language location/entity mentioned
   * by the organizer.
   */
  location?: string;

  /**
   * Optional free-text strategy reference.
   */
  strategy_name?: string;
}

// ============================================================
// Intent Result
// ============================================================

export interface IntentResult {
  intent: OrganizerIntent;
  entities: IntentEntities;

  /**
   * Original organizer request.
   */
  original_text: string;

  /**
   * Confidence is only an interpretation of the
   * rule-based classifier. It is NOT a probability
   * of correctness.
   */
  confidence: "high" | "medium" | "low";

  /**
   * Whether P2 should ask the organizer for clarification.
   */
  requires_clarification: boolean;

  clarification_question?: string;
}

// ============================================================
// Entity Extraction
// ============================================================

function extractEntities(text: string): IntentEntities {
  const entities: IntentEntities = {};

  // Gate IDs: G1, G2, Gate G1, gate-01, etc.
  const gateMatch = text.match(
    /\b(?:gate[\s-]*)?([Gg]\d+)\b/,
  );

  if (gateMatch) {
    entities.gate_id = gateMatch[1].toUpperCase();
  }

  // Exit IDs: E1, E2, Exit E1, etc.
  const exitMatch = text.match(
    /\b(?:exit[\s-]*)?([Ee]\d+)\b/,
  );

  if (exitMatch) {
    entities.exit_id = exitMatch[1].toUpperCase();
  }

  // Zone IDs: Z1, Z2, Zone Z1, etc.
  const zoneMatch = text.match(
    /\b(?:zone[\s-]*)?([Zz]\d+)\b/,
  );

  if (zoneMatch) {
    entities.zone_id = zoneMatch[1].toUpperCase();
  }

  // Route IDs: R1, R2, Route R1, etc.
  const routeMatch = text.match(
    /\b(?:route[\s-]*)?([Rr]\d+)\b/,
  );

  if (routeMatch) {
    entities.route_id = routeMatch[1].toUpperCase();
  }

  // Strategy IDs: ST-001, ST-002, etc.
  const strategyMatch = text.match(
    /\b(ST-\d{3,})\b/i,
  );

  if (strategyMatch) {
    entities.strategy_id = strategyMatch[1].toUpperCase();
  }

  return entities;
}

// ============================================================
// Intent Classification
// ============================================================

function classifyIntent(text: string): OrganizerIntent {
  const normalized = text.toLowerCase().trim();

  // ----------------------------------------------------------
  // Approval
  // ----------------------------------------------------------

  if (
    /\b(approve|approved|give approval|accept)\b/.test(
      normalized,
    )
  ) {
    return "approve_strategy";
  }

  // ----------------------------------------------------------
  // Rejection
  // ----------------------------------------------------------

  if (
    /\b(reject|rejected|decline|cancel strategy)\b/.test(
      normalized,
    )
  ) {
    return "reject_strategy";
  }

  // ----------------------------------------------------------
  // Execution
  // ----------------------------------------------------------

  if (
    /\b(execute|apply|implement|activate|deploy)\b/.test(
      normalized,
    )
  ) {
    return "execute_strategy";
  }

  // ----------------------------------------------------------
  // Strategy comparison
  // ----------------------------------------------------------

  if (
    /\b(compare|comparison|which strategy|compare strategies)\b/.test(
      normalized,
    )
  ) {
    return "compare_strategy";
  }

  // ----------------------------------------------------------
  // Strategy simulation
  // ----------------------------------------------------------

  if (
    /\b(simulate|simulation|what happens if|test strategy)\b/.test(
      normalized,
    )
  ) {
    return "simulate_strategy";
  }

  // ----------------------------------------------------------
  // Strategy request
  // ----------------------------------------------------------

  if (
    /\b(recommend|suggest|strategy|mitigation|what should we do)\b/.test(
      normalized,
    )
  ) {
    return "request_strategy";
  }

  // ----------------------------------------------------------
  // Bottleneck detection
  // ----------------------------------------------------------

  if (
    /\b(bottleneck|bottlenecks|blockage|blocked|choke point)\b/.test(
      normalized,
    )
  ) {
    return "identify_bottleneck";
  }

  // ----------------------------------------------------------
  // Congestion analysis
  // ----------------------------------------------------------

  if (
    /\b(crowded|crowding|congestion|congested|queue|overcrowded|density)\b/.test(
      normalized,
    )
  ) {
    return "analyze_congestion";
  }

  // ----------------------------------------------------------
  // Result explanation
  // ----------------------------------------------------------

  if (
    /\b(explain|why|reason|what does this mean|interpret)\b/.test(
      normalized,
    )
  ) {
    return "explain_result";
  }

  // ----------------------------------------------------------
  // Status
  // ----------------------------------------------------------

  if (
    /\b(status|current state|current situation|how are we doing)\b/.test(
      normalized,
    )
  ) {
    return "check_status";
  }

  return "unknown";
}

// ============================================================
// Clarification Logic
// ============================================================

function determineClarification(
  intent: OrganizerIntent,
  entities: IntentEntities,
): {
  requires_clarification: boolean;
  clarification_question?: string;
} {
  switch (intent) {
    case "analyze_congestion":
      if (
        !entities.gate_id &&
        !entities.exit_id &&
        !entities.zone_id &&
        !entities.route_id
      ) {
        return {
          requires_clarification: true,
          clarification_question:
            "Which gate, exit, zone, or route should I analyze?",
        };
      }
      break;

    case "simulate_strategy":
      if (!entities.strategy_id) {
        return {
          requires_clarification: true,
          clarification_question:
            "Which mitigation strategy should I simulate?",
        };
      }
      break;

    case "compare_strategy":
      if (!entities.strategy_id) {
        return {
          requires_clarification: true,
          clarification_question:
            "Which strategy would you like to compare with the current baseline?",
        };
      }
      break;

    case "approve_strategy":
    case "reject_strategy":
    case "execute_strategy":
      if (!entities.strategy_id) {
        return {
          requires_clarification: true,
          clarification_question:
            "Which strategy are you referring to?",
        };
      }
      break;

    default:
      break;
  }

  return {
    requires_clarification: false,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Convert an organizer's natural-language request
 * into a structured P2 intent.
 */
export function detectIntent(text: string): IntentResult {
  const originalText = text.trim();

  if (!originalText) {
    return {
      intent: "unknown",
      entities: {},
      original_text: text,
      confidence: "low",
      requires_clarification: true,
      clarification_question:
        "What would you like me to analyze or do?",
    };
  }

  const intent = classifyIntent(originalText);
  const entities = extractEntities(originalText);

  const clarification = determineClarification(
    intent,
    entities,
  );

  let confidence: IntentResult["confidence"] = "medium";

if (intent === "unknown") {
  confidence = "low";
} else if (!clarification.requires_clarification) {
  confidence = "high";
}
  return {
    intent,
    entities,
    original_text: originalText,
    confidence,
    requires_clarification:
      clarification.requires_clarification,
    clarification_question:
      clarification.clarification_question,
  };
}

// ============================================================
// Helper
// ============================================================

/**
 * Check whether an intent requires a P1 tool call.
 */
export function requiresP1Tool(
  intent: OrganizerIntent,
): boolean {
  return (
    intent === "analyze_congestion" ||
    intent === "identify_bottleneck" ||
    intent === "simulate_strategy" ||
    intent === "compare_strategy" ||
    intent === "check_status"
  );
}