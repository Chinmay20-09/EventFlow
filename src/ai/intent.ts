/**
 * P2 AI — Intent Detection
 *
 * Responsibility:
 * - Convert organizer natural-language requests into structured intent.
 * - Extract simple entities such as gate IDs, exit IDs, zone IDs and route IDs.
 * - Extract route source, destination and routing objective.
 *
 * This module does NOT:
 * - calculate capacity
 * - calculate crowd density
 * - run simulations
 * - calculate authoritative route values
 * - select an authoritative route
 * - execute mitigation strategies
 *
 * P1 remains the source of truth for simulation and validation.
 * P2 route intelligence is responsible for route decision-making
 * after receiving authoritative P1 state/data.
 */

// ============================================================
// Intent Types
// ============================================================

export type OrganizerIntent =
  | "find_route"
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
// Route Objective
// ============================================================

export type RouteObjective =
  | "least_congested"
  | "shortest"
  | "fastest"
  | "safest";

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
   * Starting point for a route request.
   *
   * Example:
   * "Find a route from G1 to V1"
   * source = "G1"
   */
  source?: string;

  /**
   * Destination for a route request.
   *
   * Example:
   * "Find a route from G1 to V1"
   * destination = "V1"
   */
  destination?: string;

  /**
   * Organizer's requested route objective.
   *
   * This is only the requested objective.
   * It does NOT calculate or guarantee the resulting route.
   */
  route_objective?: RouteObjective;

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

  // ----------------------------------------------------------
  // Gate IDs
  // Examples:
  // G1
  // G2
  // Gate G1
  // gate-01
  // ----------------------------------------------------------

  const gateMatch = text.match(
    /\b(?:gate[\s-]*)?([Gg]\d+)\b/,
  );

  if (gateMatch) {
    entities.gate_id = gateMatch[1].toUpperCase();
  }

  // ----------------------------------------------------------
  // Exit IDs
  // Examples:
  // E1
  // Exit E1
  // exit-01
  // ----------------------------------------------------------

  const exitMatch = text.match(
    /\b(?:exit[\s-]*)?([Ee]\d+)\b/,
  );

  if (exitMatch) {
    entities.exit_id = exitMatch[1].toUpperCase();
  }

  // ----------------------------------------------------------
  // Zone IDs
  // Examples:
  // Z1
  // Zone Z1
  // zone-01
  // ----------------------------------------------------------

  const zoneMatch = text.match(
    /\b(?:zone[\s-]*)?([Zz]\d+)\b/,
  );

  if (zoneMatch) {
    entities.zone_id = zoneMatch[1].toUpperCase();
  }

  // ----------------------------------------------------------
  // Route IDs
  // Examples:
  // R1
  // Route R1
  // route-01
  // ----------------------------------------------------------

  const routeIdMatch = text.match(
    /\b(?:route[\s-]*)?([Rr]\d+)\b/,
  );

  if (routeIdMatch) {
    entities.route_id = routeIdMatch[1].toUpperCase();
  }

  // ----------------------------------------------------------
  // Strategy IDs
  // Examples:
  // ST-001
  // ST-002
  // ----------------------------------------------------------

  const strategyMatch = text.match(
    /\b(ST-\d{3,})\b/i,
  );

  if (strategyMatch) {
    entities.strategy_id = strategyMatch[1].toUpperCase();
  }

  // ----------------------------------------------------------
  // Route source / destination
  //
  // Examples:
  // "from G1 to V1"
  // "route from Gate G1 to Exit E2"
  // "G1 to V1"
  //
  // The values remain generic because the authoritative
  // node IDs belong to the P1 graph.
  // ----------------------------------------------------------

  const routePathMatch = text.match(
    /\b(?:from)\s+([A-Za-z0-9_-]+)\s+(?:to|towards)\s+([A-Za-z0-9_-]+)/i,
  );

  if (routePathMatch) {
    entities.source = normalizeEntityId(
      routePathMatch[1],
    );

    entities.destination = normalizeEntityId(
      routePathMatch[2],
    );
  } else {
    const shortRouteMatch = text.match(
      /\b([Gg]\d+|[Ee]\d+|[Zz]\d+|[Nn]\d+)\s*(?:->|→|to)\s*([A-Za-z0-9_-]+)\b/i,
    );

    if (shortRouteMatch) {
      entities.source = normalizeEntityId(
        shortRouteMatch[1],
      );

      entities.destination = normalizeEntityId(
        shortRouteMatch[2],
      );
    }
  }

  // ----------------------------------------------------------
  // Route objective
  // ----------------------------------------------------------

  if (
    /\b(least\s+congested|avoid\s+congestion|minimum\s+congestion|lowest\s+congestion|less\s+crowded|avoid\s+crowds?)\b/i.test(
      text,
    )
  ) {
    entities.route_objective = "least_congested";
  } else if (
    /\b(shortest|shortest\s+route|minimum\s+distance|least\s+distance)\b/i.test(
      text,
    )
  ) {
    entities.route_objective = "shortest";
  } else if (
    /\b(fastest|quickest|minimum\s+time|least\s+travel\s+time|quickest\s+route)\b/i.test(
      text,
    )
  ) {
    entities.route_objective = "fastest";
  } else if (
    /\b(safest|safe\s+route|maximum\s+safety|avoid\s+risk|lowest\s+risk)\b/i.test(
      text,
    )
  ) {
    entities.route_objective = "safest";
  }

  return entities;
}

// ============================================================
// Entity Normalization
// ============================================================

function normalizeEntityId(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toUpperCase();
}

// ============================================================
// Intent Classification
// ============================================================

function classifyIntent(text: string): OrganizerIntent {
  const normalized = text.toLowerCase().trim();

  // ----------------------------------------------------------
  // Route finding
  //
  // IMPORTANT:
  // This appears before congestion detection.
  //
  // Example:
  // "Find the best route from G1 to V1 avoiding congestion"
  //
  // should become:
  // find_route
  //
  // NOT:
  // analyze_congestion
  // ----------------------------------------------------------

  if (
    /\b(find|show|get|give|suggest|recommend|determine|calculate)\b.*\b(route|path|way)\b/.test(
      normalized,
    ) ||
    /\b(route|path|way)\b.*\b(from|to|reach|avoid)\b/.test(
      normalized,
    ) ||
    /\b(route|path|way)\b.*\bdestination\b/.test(
      normalized,
    )
  ) {
    return "find_route";
  }

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
    // --------------------------------------------------------
    // Route finding
    // --------------------------------------------------------

    case "find_route":
      if (!entities.source || !entities.destination) {
        return {
          requires_clarification: true,
          clarification_question:
            "What are the starting point and destination for the route?",
        };
      }

      break;

    // --------------------------------------------------------
    // Congestion analysis
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // Strategy simulation
    // --------------------------------------------------------

    case "simulate_strategy":
      if (!entities.strategy_id) {
        return {
          requires_clarification: true,
          clarification_question:
            "Which mitigation strategy should I simulate?",
        };
      }

      break;

    // --------------------------------------------------------
    // Strategy comparison
    // --------------------------------------------------------

    case "compare_strategy":
      if (!entities.strategy_id) {
        return {
          requires_clarification: true,
          clarification_question:
            "Which strategy would you like to compare with the current baseline?",
        };
      }

      break;

    // --------------------------------------------------------
    // Strategy approval/rejection/execution
    // --------------------------------------------------------

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
 *
 * Route finding requires P1 data because P1 owns the
 * authoritative graph/state values.
 *
 * P2 may decide which route is preferable, but it must
 * use authoritative P1 values for route evaluation.
 */
export function requiresP1Tool(
  intent: OrganizerIntent,
): boolean {
  return (
    intent === "find_route" ||
    intent === "analyze_congestion" ||
    intent === "identify_bottleneck" ||
    intent === "simulate_strategy" ||
    intent === "compare_strategy" ||
    intent === "check_status"
  );
}