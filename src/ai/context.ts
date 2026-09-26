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
 */

import type { OrganizerIntent, IntentEntities } from "./intent";
import type { SimulationResult } from "../engine/types";

export interface P1StateContext {
  simulation?: SimulationResult;
  current_time_seconds?: number;
  active_events?: string[];
  warnings?: string[];
}

export interface EventContext {
  event_id?: string;
  event_name?: string;
  location?: string;
  organizer_request: string;
}

export interface ToolResultContext {
  tool_name: string;
  success: boolean;
  summary?: string;
  data?: unknown;
}

export interface ConfiguredConstraints {
  safe_capacity?: number;
  restricted_zones?: string[];
  emergency_routes?: string[];
  mandatory_approval?: boolean;
}

export interface ConversationContext {
  previous_messages?: string[];
  previous_strategy_id?: string;
}

export interface AIContext {
  organizer_request: string;
  intent: OrganizerIntent;
  entities: IntentEntities;

  p1_state: P1StateContext;
  event_data: EventContext;

  tool_results: ToolResultContext[];

  constraints: ConfiguredConstraints;

  conversation: ConversationContext;

  assumptions: string[];
}

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
  return {
    organizer_request: request,
    intent,
    entities,

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

/**
 * Get the most recent successful tool result.
 */
export function getLatestSuccessfulToolResult(
  context: AIContext,
): ToolResultContext | undefined {
  for (let i = context.tool_results.length - 1; i >= 0; i--) {
    const result = context.tool_results[i];

    if (result.success) {
      return result;
    }
  }

  return undefined;
}

/**
 * Determine whether authoritative P1 simulation data
 * is currently available.
 */
export function hasP1SimulationResult(
  context: AIContext,
): boolean {
  return context.p1_state.simulation !== undefined;
}

/**
 * Return a compact context object suitable for passing
 * to the AI/LLM layer.
 *
 * The full raw P1 engine object is intentionally not exposed
 * here as an internal simulator implementation detail.
 */
export function buildAIContextPayload(
  context: AIContext,
) {
  const simulation = context.p1_state.simulation;

  return {
    organizer_request: context.organizer_request,

    intent: context.intent,

    entities: context.entities,

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
      }),
    ),

    conversation: context.conversation,

    assumptions: context.assumptions,
  };
}