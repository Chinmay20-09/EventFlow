/**
 * P2 AI — Orchestrator
 *
 * Responsibility:
 * - Coordinate the complete P2 intelligence flow.
 * - Detect organizer intent.
 * - Build AI context.
 * - Select candidate strategies.
 * - Invoke the LLM.
 * - Apply guardrails.
 * - Call approved P1 tools when required.
 * - Interpret P1 results.
 *
 * IMPORTANT:
 * P2 does NOT perform simulation calculations.
 * P1 remains the authoritative simulation engine.
 */

import { detectIntent } from "./intent";
import type { IntentResult } from "./intent";

import {
  createAIContext,
  addToolResult,
} from "./context";

import type {
  AIContext,
  EventContext,
  ConfiguredConstraints,
  ConversationContext,
} from "./context";

import {
  selectCandidateStrategies,
} from "./strategy_selector";

import {
  P2LLMService,
  MockLLMProvider,
} from "./llm";

import {
  validateAIAction,
  validateAIResponse,
} from "../guardrails/ai_guardrails";

import type {
  P1SimulationContext,
} from "../../../integration/tools/p1_simulation_tool";

import {
  runBaselineSimulation,
} from "../../../integration/tools/p1_simulation_tool";

import {
  explainSimulationResult,
  formatOrganizerResponse,
} from "./response";

import type {
  AIResponse,
} from "./response";

// ============================================================
// Types
// ============================================================

export interface P2OrchestratorInput {
  organizer_request: string;

  p1_context?: P1SimulationContext;

  event?: EventContext;

  constraints?: ConfiguredConstraints;

  conversation?: ConversationContext;
}

export interface P2OrchestratorResult {
  success: boolean;

  intent: IntentResult;

  response?: AIResponse;

  message: string;

  context?: AIContext;

  error?: string;
}

// ============================================================
// P2 Orchestrator
// ============================================================

export class P2Orchestrator {
  private readonly llm: P2LLMService;

  constructor(
    llmService?: P2LLMService,
  ) {
    this.llm =
      llmService ??
      new P2LLMService(
        new MockLLMProvider(),
      );
  }

  // ----------------------------------------------------------
  // Main Entry Point
  // ----------------------------------------------------------

  async process(
    input: P2OrchestratorInput,
  ): Promise<P2OrchestratorResult> {
    const request =
      input.organizer_request.trim();

    // ========================================================
    // STEP 1 — Validate Request
    // ========================================================

    if (!request) {
      return {
        success: false,

        intent: {
          intent: "unknown",
          entities: {},
          original_text: "",
          confidence: "low",
          requires_clarification: true,
          clarification_question:
            "What would you like me to analyze or do?",
        },

        message:
          "Organizer request cannot be empty.",
      };
    }

    // ========================================================
    // STEP 2 — Detect Intent
    // ========================================================

    const intent =
      detectIntent(request);

    // ========================================================
    // STEP 3 — Build AI Context
    // ========================================================

    const context =
      createAIContext(
        request,
        intent.intent,
        intent.entities,
      );

    // Add optional event data
    if (input.event) {
      context.event_data =
        input.event;
    }

    // Add optional constraints
    if (input.constraints) {
      context.constraints =
        input.constraints;
    }

    // Add optional conversation context
    if (input.conversation) {
      context.conversation =
        input.conversation;
    }

    // ========================================================
    // STEP 4 — Handle Clarification
    // ========================================================

    if (
      intent.requires_clarification
    ) {
      return {
        success: true,
        intent,
        context,
        message:
          intent.clarification_question ??
          "I need more information to process this request.",
      };
    }

    // ========================================================
    // STEP 5 — Strategy Selection
    // ========================================================

    const strategySelection =
      selectCandidateStrategies(
        context,
      );

    if (
      strategySelection.requires_clarification
    ) {
      return {
        success: true,
        intent,
        context,
        message:
          strategySelection.clarification_question ??
          "I need more information before selecting a strategy.",
      };
    }

    // ========================================================
    // STEP 6 — LLM Reasoning
    // ========================================================

    let llmOutput;

    try {
      llmOutput =
        await this.llm.generate(
          context,
        );
    } catch (error) {
      return {
        success: false,
        intent,
        context,
        message:
          "The AI reasoning service could not process the request.",
        error:
          this.getErrorMessage(error),
      };
    }

    // ========================================================
    // STEP 7 — Guardrail Validation
    // ========================================================

    const actionType =
      this.mapIntentToAction(
        intent.intent,
      );

    const guardrail =
      validateAIAction(
        actionType,
        {
          p1ResultAvailable:
            context.p1_state?.simulation !==
            undefined,

          p1ValidationPassed: false,

          strategyApproved: false,

          strategyExecuted: false,

          knownFacts:
            this.collectKnownFacts(
              context,
            ),

          missingInformation: [],
        },
      );

    if (!guardrail.allowed) {
      return {
        success: false,
        intent,
        context,
        message:
          "The requested AI action was blocked by a P2 guardrail.",
        error:
          guardrail.errors.join("; ") ||
          "AI action not permitted.",
      };
    }

    // ========================================================
    // STEP 8 — P1-Dependent Operations
    // ========================================================

    if (
      intent.intent ===
        "analyze_congestion" ||
      intent.intent ===
        "identify_bottleneck" ||
      intent.intent ===
        "check_status"
    ) {
      return this.runBaselineAnalysis(
        input,
        intent,
        context,
      );
    }

    // ========================================================
    // STEP 9 — Strategy Requests
    // ========================================================

    if (
      intent.intent ===
      "request_strategy"
    ) {
      const selected =
        strategySelection.candidates;

      if (selected.length === 0) {
        return {
          success: true,
          intent,
          context,
          message:
            "No suitable strategy was found in the configured strategy catalog.",
        };
      }

      const strategyNames =
        selected
          .map(
            (strategy) =>
              `${strategy.strategy_id}: ${strategy.name}`,
          )
          .join("\n");

      return {
        success: true,
        intent,
        context,
        message:
          llmOutput.explanation ??
          `Candidate strategies:\n${strategyNames}`,
      };
    }

    // ========================================================
    // STEP 10 — Explain Existing P1 Result
    // ========================================================

    if (
      intent.intent ===
      "explain_result"
    ) {
      const simulation =
        context.p1_state?.simulation;

      if (!simulation) {
        return {
          success: true,
          intent,
          context,
          message:
            "No P1 simulation result is currently available to explain.",
        };
      }

      const response =
        explainSimulationResult(
          simulation,
        );

      return {
        success: true,
        intent,
        context,
        response,
        message:
          formatOrganizerResponse(
            response,
          ),
      };
    }

    // ========================================================
    // STEP 11 — Strategy Approval / Execution
    // ========================================================

    if (
      intent.intent ===
        "execute_strategy" ||
      intent.intent ===
        "approve_strategy" ||
      intent.intent ===
        "reject_strategy"
    ) {
      return {
        success: true,
        intent,
        context,
        message:
          "This request requires the strategy approval and execution workflow. P2 will not claim execution until the required approval and P1 validation are confirmed.",
      };
    }

    // ========================================================
    // STEP 12 — Generic AI Response
    // ========================================================

    const response: AIResponse = {
      summary:
        llmOutput.explanation ??
        "The request was understood, but no P1 operation was required.",

      findings:
        llmOutput.reasoning ?? [],

      warnings: [],

      execution_status:
        "not_executed",
    };

    // ========================================================
    // STEP 13 — Validate Generated Response
    // ========================================================

    const validation =
      validateAIResponse(
        response.summary,
        {
          p1ResultAvailable:
            context.p1_state?.simulation !==
            undefined,

          p1ValidationPassed: false,

          strategyApproved: false,

          strategyExecuted: false,

          knownFacts:
            this.collectKnownFacts(
              context,
            ),

          missingInformation: [],
        },
      );

    if (!validation.valid) {
      return {
        success: false,
        intent,
        context,
        message:
          "The generated AI response failed P2 guardrail validation.",
        error:
          validation.errors.join("; ") ||
          "Invalid AI response.",
      };
    }

    return {
      success: true,
      intent,
      context,
      response,
      message:
        formatOrganizerResponse(
          response,
        ),
    };
  }

  // ==========================================================
  // Baseline P1 Analysis
  // ==========================================================

  private runBaselineAnalysis(
    input: P2OrchestratorInput,
    intent: IntentResult,
    context: AIContext,
  ): P2OrchestratorResult {
    if (!input.p1_context) {
      return {
        success: true,
        intent,
        context,
        message:
          "I can analyze the event, but the P1 simulation context has not been provided.",
      };
    }

    try {
      const result =
        runBaselineSimulation({
          context:
            input.p1_context,
        });

      if (!result.success) {
        return {
          success: false,
          intent,
          context,
          message:
            "P1 simulation could not be completed.",
          error:
            result.error ??
            "Unknown P1 simulation error.",
        };
      }

      context.p1_state = {
        ...context.p1_state,
        simulation: result.data,
      };

      // `addToolResult` returns an updated context copy — it must be captured,
      // otherwise the tool result is silently dropped from the AI context.
      const contextWithToolResult =
        addToolResult(
          context,
          {
            tool_name:
              "runBaselineSimulation",

            success: true,

            summary:
              "P1 baseline simulation completed.",

            data: result.data,
          },
        );

      const simulation =
        context.p1_state.simulation;

      if (!simulation) {
        return {
          success: false,
          intent,
          context: contextWithToolResult,
          message:
            "P1 completed but did not return a simulation result.",
        };
      }

      const response =
        explainSimulationResult(
          simulation,
        );

      return {
        success: true,
        intent,
        context: contextWithToolResult,
        response,
        message:
          formatOrganizerResponse(
            response,
          ),
      };
    } catch (error) {
      return {
        success: false,
        intent,
        context,
        message:
          "An error occurred while communicating with the P1 simulation engine.",
        error:
          this.getErrorMessage(error),
      };
    }
  }

  // ==========================================================
  // Intent → AI Action
  // ==========================================================

  private mapIntentToAction(
    intent: IntentResult["intent"],
  ):
    | "explain"
    | "propose_strategy"
    | "request_simulation"
    | "request_validation"
    | "request_comparison"
    | "execute_strategy" {
    switch (intent) {
      case "request_strategy":
        return "propose_strategy";

      case "simulate_strategy":
        return "request_simulation";

      case "compare_strategy":
        return "request_comparison";

      case "execute_strategy":
        return "execute_strategy";

      case "approve_strategy":
      case "reject_strategy":
        return "request_validation";

      default:
        return "explain";
    }
  }

  // ==========================================================
  // Known Facts
  // ==========================================================

  private collectKnownFacts(
    context: AIContext,
  ): string[] {
    const facts: string[] = [];

    if (
      context.p1_state?.simulation
    ) {
      facts.push(
        "A P1 simulation result is available.",
      );
    }

    if (
      context.event_data?.event_id
    ) {
      facts.push(
        `Event ID: ${context.event_data.event_id}`,
      );
    }

    if (context.entities.gate_id) {
      facts.push(
        `Gate: ${context.entities.gate_id}`,
      );
    }

    if (context.entities.zone_id) {
      facts.push(
        `Zone: ${context.entities.zone_id}`,
      );
    }

    if (context.entities.route_id) {
      facts.push(
        `Route: ${context.entities.route_id}`,
      );
    }

    if (
      context.entities.strategy_id
    ) {
      facts.push(
        `Strategy: ${context.entities.strategy_id}`,
      );
    }

    return facts;
  }

  // ==========================================================
  // Error Helper
  // ==========================================================

  private getErrorMessage(
    error: unknown,
  ): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}