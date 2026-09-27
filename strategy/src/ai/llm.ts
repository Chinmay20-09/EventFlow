import Groq from "groq-sdk";
import type { AIContext } from "./context";
import { buildAIContextPayload } from "./context";

export interface LLMRequest {
  system_prompt: string;
  user_prompt: string;
  context: Record<string, unknown>;
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
  proposed_parameters?: Record<string, unknown>;
  requires_p1_validation: boolean;
}

export const P2_SYSTEM_PROMPT = `
You are the P2 AI Strategy Intelligence layer of EventFlow.

Your responsibility is to understand organizer requests, interpret P1 simulation
results, propose mitigation strategies, explain results, and guide the organizer.

IMPORTANT ARCHITECTURE RULE:

P1 is the authoritative deterministic simulation engine.

P2 may:
- Understand natural-language organizer requests.
- Detect intent.
- Extract entities.
- Select strategies from the approved strategy catalog.
- Propose candidate strategy parameters.
- Request P1 validation.
- Request P1 simulation.
- Interpret P1 results.
- Explain bottlenecks and warnings.
- Explain strategy outcomes.
- Ask clarification questions.
- Explain what should happen next.

P2 must NOT:
- Invent simulation results.
- Invent capacity values.
- Invent occupancy values.
- Invent density values.
- Invent crowd-flow measurements.
- Invent bottlenecks.
- Invent risk values.
- Perform authoritative simulation calculations.
- Override P1 results.
- Override safety constraints.
- Claim that a strategy was validated unless P1 validated it.
- Claim that a strategy was executed unless the execution system confirms it.
- Create strategies outside the approved strategy catalog.
- Treat assumptions as actual event data.

If numerical simulation information is missing, say that P1 must provide it.

When proposing a strategy, use only strategies available in the supplied
strategy catalog.

Return structured JSON only.
`;

/* ---------------------------------------------------------
   Build LLM Request
--------------------------------------------------------- */

export function buildLLMRequest(
  context: AIContext
): LLMRequest {
  return {
    system_prompt: P2_SYSTEM_PROMPT,
    user_prompt: context.organizer_request,
    context: buildAIContextPayload(context),
  };
}

/* ---------------------------------------------------------
   Parse LLM Response
--------------------------------------------------------- */

export function parseLLMResponse(
  response: LLMResponse
): StructuredAIOutput {
  const text = response.text.trim();

  if (!text) {
    throw new Error("LLM returned an empty response.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LLM returned invalid JSON.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "LLM response must be a JSON object."
    );
  }

  const data =
    parsed as Record<string, unknown>;

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
              typeof item === "string"
          )
        : undefined,

    clarification_question:
      typeof data.clarification_question === "string"
        ? data.clarification_question
        : undefined,

    proposed_parameters:
      data.proposed_parameters &&
      typeof data.proposed_parameters === "object" &&
      !Array.isArray(data.proposed_parameters)
        ? (
            data.proposed_parameters as Record<
              string,
              unknown
            >
          )
        : undefined,

    requires_p1_validation:
      typeof data.requires_p1_validation === "boolean"
        ? data.requires_p1_validation
        : true,
  };
}

/* ---------------------------------------------------------
   Groq LLM Provider
--------------------------------------------------------- */

export class GroqLLMProvider
  implements LLMProvider
{
  private readonly client: Groq;
  private readonly model: string;

  constructor(
    apiKey: string,
    model: string = "openai/gpt-oss-20b"
  ) {
    if (!apiKey) {
      throw new Error(
        "Groq API key is missing."
      );
    }

    this.client = new Groq({
      apiKey: apiKey,
    });

    this.model = model;
  }

  async generate(
    request: LLMRequest
  ): Promise<LLMResponse> {
    const contextJson = JSON.stringify(
      request.context,
      null,
      2
    );

    const userContent = `
ORGANIZER REQUEST:
${request.user_prompt}

CURRENT P2 CONTEXT:
${contextJson}

Follow the system instructions exactly.

Return ONLY a JSON object using this structure:

{
  "intent": "string",
  "explanation": "string",
  "strategy_id": "string",
  "reasoning": ["string"],
  "clarification_question": "string",
  "proposed_parameters": {},
  "requires_p1_validation": true
}

Rules:
- Only use strategies present in the supplied strategy catalog.
- Never invent P1 numerical results.
- Never invent capacity, density, occupancy, flow, queue, risk, or simulation values.
- Never claim that P1 validated something unless the P1 result explicitly says so.
- Never claim that a strategy was executed.
- Proposed parameters are suggestions only.
- P1 must validate operational parameters.
`;

    try {
      const response =
        await this.client.chat.completions.create({
          model: this.model,

          messages: [
            {
              role: "system",
              content: request.system_prompt,
            },
            {
              role: "user",
              content: userContent,
            },
          ],

          response_format: {
            type: "json_object",
          },

          temperature: 0.2,

          max_tokens: 1000,
        });

      const text =
        response.choices[0]?.message?.content;

      if (!text) {
        throw new Error(
          "Groq returned an empty response."
        );
      }

      return {
        text: text,
        raw: response,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown Groq API error.";

      throw new Error(
        `Groq LLM request failed: ${message}`
      );
    }
  }
}

/* ---------------------------------------------------------
   Mock Provider
--------------------------------------------------------- */

export class MockLLMProvider
  implements LLMProvider
{
  async generate(
    _request: LLMRequest
  ): Promise<LLMResponse> {
    return {
      text: JSON.stringify({
        intent: "unknown",
        explanation:
          "Mock LLM response. Configure Groq for real AI reasoning.",
        strategy_id: null,
        reasoning: [
          "The request was processed using the mock provider.",
        ],
        clarification_question: null,
        proposed_parameters: {},
        requires_p1_validation: true,
      }),
    };
  }
}

/* ---------------------------------------------------------
   P2 LLM Service
--------------------------------------------------------- */

export class P2LLMService {
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async generate(
    context: AIContext
  ): Promise<StructuredAIOutput> {
    const request =
      buildLLMRequest(context);

    const response =
      await this.provider.generate(request);

    return parseLLMResponse(response);
  }
}