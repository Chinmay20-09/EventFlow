/**
 * P2 AI — LLM Integration
 *
 * Responsibility:
 * - Provide a controlled interface between the P2 application
 *   and an external LLM.
 * - Send structured P2 context to the model.
 * - Require structured JSON output.
 *
 * IMPORTANT:
 * The LLM is NOT the source of truth for:
 * - capacity
 * - crowd simulation
 * - safety validation
 * - numerical simulation results
 *
 * P1 remains authoritative.
 */

import type { AIContext } from "./context";
import { buildAIContextPayload } from "./context";

// ============================================================
// Types
// ============================================================

export interface LLMRequest {
  system_prompt: string;
  user_prompt: string;
  context: ReturnType<typeof buildAIContextPayload>;
}

export interface LLMResponse {
  text: string;
  raw?: unknown;
}

export interface LLMProvider {
  generate(request: LLMRequest): Promise<LLMResponse>;
}

export interface StructuredAIOutput {
  intent?: string;

  explanation?: string;

  strategy_id?: string;

  reasoning?: string[];

  clarification_question?: string;

  /**
   * LLM-proposed parameters are suggestions only.
   * P1 must validate them before simulation/execution.
   */
  proposed_parameters?: Record<string, unknown>;

  requires_p1_validation: boolean;
}

// ============================================================
// System Prompt
// ============================================================

export const P2_SYSTEM_PROMPT = `
You are the Strategy Intelligence layer of an event and stadium
simulation system.

Your role is to:
- understand organizer requests
- identify intent
- interpret current event information
- propose strategies from the configured strategy catalog
- explain deterministic P1 simulation results
- ask for clarification when required

ARCHITECTURE RULE:

P2 proposes and explains.
P1 calculates, validates, and simulates.

P1 is the authoritative source for:
- capacity
- occupancy
- crowd density
- flow
- queues
- bottlenecks
- risk calculations
- simulation results
- strategy validation
- numerical effects

NEVER:
- invent simulation results
- invent capacity values
- invent crowd measurements
- override P1 results
- claim a strategy was executed when it was not
- claim a strategy passed validation when P1 has not validated it
- create a strategy that does not exist in the configured strategy catalog
- treat an AI assumption as authoritative event data

If required information is missing:
- ask for clarification
- or clearly state that the information is unavailable

Return structured JSON only.
`;

// ============================================================
// Request Builder
// ============================================================

/**
 * Build a controlled LLM request from the current P2 context.
 */
export function buildLLMRequest(
  context: AIContext,
): LLMRequest {
  return {
    system_prompt: P2_SYSTEM_PROMPT,

    user_prompt: context.organizer_request,

    context: buildAIContextPayload(context),
  };
}

// ============================================================
// JSON Parsing
// ============================================================

/**
 * Parse structured output returned by the LLM.
 *
 * The LLM output is treated as untrusted input.
 * It must still pass P2 guardrails and P1 validation.
 */
export function parseLLMResponse(
  response: LLMResponse,
): StructuredAIOutput {
  const text = response.text.trim();

  if (!text) {
    throw new Error("LLM returned an empty response.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "LLM response was not valid JSON.",
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "LLM response must be a JSON object.",
    );
  }

  const data = parsed as Record<string, unknown>;

  return {
    intent:
      typeof data.intent === "string"
        ? data.intent
        : undefined,

    explanation:
      typeof data.explanation === "string"
        ? data.explanation
        : undefined,

    strategy_id:
      typeof data.strategy_id === "string"
        ? data.strategy_id
        : undefined,

    reasoning:
      Array.isArray(data.reasoning)
        ? data.reasoning.filter(
            (item): item is string =>
              typeof item === "string",
          )
        : undefined,

    clarification_question:
      typeof data.clarification_question === "string"
        ? data.clarification_question
        : undefined,

    proposed_parameters:
      typeof data.proposed_parameters === "object" &&
      data.proposed_parameters !== null &&
      !Array.isArray(data.proposed_parameters)
        ? (data.proposed_parameters as Record<
            string,
            unknown
          >)
        : undefined,

    requires_p1_validation:
      data.requires_p1_validation !== false,
  };
}

// ============================================================
// LLM Service
// ============================================================

export class P2LLMService {
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Send P2 context to the configured LLM.
   */
  async generate(
    context: AIContext,
  ): Promise<StructuredAIOutput> {
    const request = buildLLMRequest(context);

    const response =
      await this.provider.generate(request);

    return parseLLMResponse(response);
  }
}

// ============================================================
// Development / Testing Provider
// ============================================================

/**
 * Simple local provider for testing the P2 pipeline
 * before connecting a real LLM.
 *
 * This provider does NOT pretend to be an AI model.
 */
export class MockLLMProvider
  implements LLMProvider
{
  async generate(
    _request: LLMRequest,
  ): Promise<LLMResponse> {
    return {
      text: JSON.stringify({
        intent: "unknown",
        explanation:
          "Mock LLM response. Connect a real LLM provider for natural-language reasoning.",
        reasoning: [
          "The current provider is a development mock.",
        ],
        requires_p1_validation: true,
      }),
    };
  }
}