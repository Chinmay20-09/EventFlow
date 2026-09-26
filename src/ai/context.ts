/**
 * P2 AI — Context Management
 *
 * EV-021
 *
 * Context priority:
 * Current P1 State
 * > Current Event Data
 * > Current Tool Results
 * > Configured Constraints
 * > Current Organizer Request
 * > Conversation Context
 * > AI Assumptions
 *
 * Route intelligence:
 * - The organizer's requested source, destination and objective
 *   are stored as request context.
 * - This module does NOT calculate or select routes.
 * - P1 remains authoritative for graph/state values.
 * - P2 route intelligence uses those authoritative values
 *   to make the route decision.
 */

import type {
  OrganizerIntent,
  IntentEntities,
  RouteObjective,
} from "./intent";

import type { SimulationResult } from "../engine/types";

// ============================================================
// P1 State Context
// ============================================================

export interface P1StateContext {
  simulation?: SimulationResult;

  current_time_seconds?: number;

  active_events?: string[];

  warnings?: string[];
}

// ============================================================
// Event Context
// ============================================================

export interface EventContext {
  event_id?: string;

  event_name?: string;

  location?: string;

  organizer_request: string;
}

// ============================================================
// Route Context
// ============================================================

/**
 * Organizer's route request.
 *
 * This contains the requested routing information only.
 *
 * It does NOT contain:
 * - calculated distance
 * - calculated travel time
 * - calculated congestion
 * - selected route
 *
 * Those values belong to the P2 route-intelligence layer
 * after receiving authoritative P1 data.
 */
export interface RouteContext {
  source?: string;

  destination?: string;

  objective?: RouteObjective;
}

// ============================================================
// Tool Result Context
// ============================================================

export interface ToolResultContext {
  tool_name: string;

  success: boolean;

  summary?: string;

  data?: unknown;
}

// ============================================================
// Configured Constraints
// ============================================================

export interface ConfiguredConstraints {
  safe_capacity?: number;

  restricted_zones?: string[];

  emergency_routes?: string[];

  mandatory_approval?: boolean;
}

// ============================================================
// Conversation Context
// ============================================================

export interface ConversationContext {
  previous_messages?: string[];

  previous_strategy_id?: string;
}

// ============================================================
// AI Context
// ============================================================

export interface AIContext {
  organizer_request: string;

  intent: OrganizerIntent;

  entities: IntentEntities;

  /**
   * Route request extracted from the organizer's request.
   *
   * This is optional because not every organizer request
   * is a routing request.
   */
  route?: RouteContext;

  p1_state: P1StateContext;

  event_data: EventContext;

  tool_results: ToolResultContext[];

  constraints: ConfiguredConstraints;

  conversation: ConversationContext;

  assumptions: string[];
}

// ============================================================
// Create Initial Context
// ============================================================

/**
 * Create the initial P2 context from an organizer request.
 */
export function createAIContext(
  request: string,
  intent: OrganizerIntent,
  entities: IntentEntities,
  options?: {
    p1State?: P1StateContext;

    eventData?: Partial<EventContext>;

    constraints?: ConfiguredConstraints;

    conversation?: ConversationContext;
  },
): AIContext {
  const route =
    intent === "find_route"
      ? {
          source: entities.source,
          destination: entities.destination,
          objective: entities.route_objective,
        }
      : undefined;

  return {
    organizer_request: request,

    intent,

    entities,

    route,

    p1_state: options?.p1State ?? {},

    event_data: {
      organizer_request: request,
      ...options?.eventData,
    },

    tool_results: [],

    constraints: options?.constraints ?? {},

    conversation: options?.conversation ?? {},

    assumptions: [],
  };
}

// ============================================================
// Add Tool Result
// ============================================================

/**
 * Add a P1/tool result to the current context.
 *
 * P1/tool output is stored separately from AI assumptions.
 */
export function addToolResult(
  context: AIContext,
  result: ToolResultContext,
): AIContext {
  return {
    ...context,

    tool_results: [
      ...context.tool_results,
      result,
    ],
  };
}

// ============================================================
// Add Assumption
// ============================================================

/**
 * Add an explicit AI assumption.
 *
 * Assumptions must never overwrite authoritative P1 data.
 */
export function addAssumption(
  context: AIContext,
  assumption: string,
): AIContext {
  if (!assumption.trim()) {
    return context;
  }

  return {
    ...context,

    assumptions: [
      ...context.assumptions,
      assumption.trim(),
    ],
  };
}

// ============================================================
// Latest Successful Tool Result
// ============================================================

/**
 * Get the most recent successful tool result.
 */
export function getLatestSuccessfulToolResult(
  context: AIContext,
): ToolResultContext | undefined {
  for (
    let i = context.tool_results.length - 1;
    i >= 0;
    i--
  ) {
    const result = context.tool_results[i];

    if (result.success) {
      return result;
    }
  }

  return undefined;
}

// ============================================================
// P1 Simulation Check
// ============================================================

/**
 * Determine whether authoritative P1 simulation data
 * is currently available.
 */
export function hasP1SimulationResult(
  context: AIContext,
): boolean {
  return context.p1_state.simulation !== undefined;
}

// ============================================================
// Route Context Check
// ============================================================

/**
 * Determine whether the current context contains
 * a complete route request.
 *
 * This does NOT calculate or select a route.
 */
export function hasRouteRequest(
  context: AIContext,
): boolean {
  return (
    context.intent === "find_route" &&
    !!context.route?.source &&
    !!context.route?.destination
  );
}

// ============================================================
// AI Context Payload
// ============================================================

/**
 * Return a compact context object suitable for passing
 * to the AI/LLM layer.
 *
 * The full raw P1 engine object is intentionally not exposed
 * here as an internal simulator implementation detail.
 *
 * Route request information is included, but route metrics
 * and route decisions must come from the appropriate P2/P1
 * workflow rather than being invented by the LLM.
 */
export function buildAIContextPayload(
  context: AIContext,
) {
  const simulation = context.p1_state.simulation;

  return {
    organizer_request: context.organizer_request,

    intent: context.intent,

    entities: context.entities,

    route: context.route
      ? {
          source: context.route.source,
          destination: context.route.destination,
          objective: context.route.objective,
        }
      : null,

    p1_state: simulation
      ? {
          status: simulation.status,

          scenario_id: simulation.scenarioId,

          strategy_id: simulation.strategyId,

          metrics: simulation.metrics,

          bottlenecks: simulation.bottlenecks,

          affected_nodes: simulation.affectedNodes,

          affected_edges: simulation.affectedEdges,

          affected_groups: simulation.affectedGroups,

          warnings: simulation.warnings,
        }
      : null,

    event_data: context.event_data,

    constraints: context.constraints,

    tool_results: context.tool_results.map(
      (result) => ({
        tool_name: result.tool_name,

        success: result.success,

        summary: result.summary,

        data: result.data,
      }),
    ),

    conversation: context.conversation,

    assumptions: context.assumptions,
  };
}