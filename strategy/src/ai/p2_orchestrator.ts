import { detectIntent } from "./intent";

import {
  createAIContext,
  addToolResult,
} from "./context";

import {
  selectCandidateStrategies,
} from "./strategy_selector";

import {
  P2LLMService,
  GroqLLMProvider,
} from "./llm";

import {
  validateAIResponse,
} from "../guardrails/ai_guardrails";

import {
  p2ToolRegistry,
} from "../tools/tool_registry";

import {
  getStrategyById,
} from "../strategies/strategy_catalog";

import type {
  SimulationResult,
} from "../engine/types";

import type {
  P1SimulationContext,
} from "../tools/p1_simulation_tool";

import {
  explainSimulationResult,
  formatOrganizerResponse,
} from "./response";

import type {
  AIResponse,
} from "./response";


/* =========================================================
   INPUT
========================================================= */

export interface P2OrchestratorInput {
  organizer_request: string;

  p1_context?: P1SimulationContext;

  event_data?: {
    event_id?: string;
    event_name?: string;
    location?: string;
  };

  constraints?: {
    safe_capacity?: number;
    restricted_zones?: string[];
    emergency_routes?: string[];
    mandatory_approval?: boolean;
  };

  conversation?: {
    previous_messages?: string[];
    previous_strategy_id?: string;
  };
}


/* =========================================================
   RESULT
========================================================= */

export interface P2OrchestratorResult {
  success: boolean;

  intent: string;

  response?: string;

  context?: ReturnType<typeof createAIContext>;

  error?: string;

  message?: string;
}


/* =========================================================
   P2 ORCHESTRATOR
========================================================= */

export class P2Orchestrator {
  private readonly llm: P2LLMService;

  constructor() {
    const apiKey =
      import.meta.env.VITE_GROQ_API_KEY;

    if (!apiKey) {
      throw new Error(
        "VITE_GROQ_API_KEY is missing. Add it to your .env file."
      );
    }

    const provider =
      new GroqLLMProvider(apiKey);

    this.llm =
      new P2LLMService(provider);
  }


  /* =======================================================
     MAIN PROCESS
  ======================================================= */

  async process(
    input: P2OrchestratorInput
  ): Promise<P2OrchestratorResult> {

    const request =
      input.organizer_request.trim();

    if (!request) {
      return {
        success: false,
        intent: "unknown",
        error:
          "Organizer request cannot be empty.",
      };
    }

    try {

      /* ---------------------------------------------------
         1. Detect intent
      --------------------------------------------------- */

      const intentResult =
        detectIntent(request);


      /* ---------------------------------------------------
         2. Create AI context
      --------------------------------------------------- */

      const context =
        createAIContext(
          request,
          intentResult.intent,
          intentResult.entities
        );


      /* ---------------------------------------------------
         3. Event context
      --------------------------------------------------- */

      context.event_data = {
        ...(input.event_data ?? {}),
        organizer_request: request,
      };


      /* ---------------------------------------------------
         4. Constraints
      --------------------------------------------------- */

      if (input.constraints) {
        context.constraints =
          input.constraints;
      }


      /* ---------------------------------------------------
         5. Conversation
      --------------------------------------------------- */

      if (input.conversation) {
        context.conversation =
          input.conversation;
      }


      /* ---------------------------------------------------
         6. Clarification
      --------------------------------------------------- */

      if (
        intentResult.requires_clarification
      ) {

        return {
          success: true,

          intent:
            intentResult.intent,

          response:
            intentResult.clarification_question ??
            "Could you provide more details about the request?",

          context,
        };

      }


      /* ---------------------------------------------------
         7. Strategy selection
      --------------------------------------------------- */

      const strategySelection =
        selectCandidateStrategies(
          context
        );


      /* ---------------------------------------------------
         8. Groq
      --------------------------------------------------- */

      const llmResponse =
        await this.llm.generate(
          context
        );


      /* ---------------------------------------------------
         9. Baseline P1 analysis
      --------------------------------------------------- */

      if (
        this.requiresBaselineAnalysis(
          intentResult.intent
        )
      ) {

        if (!input.p1_context) {

          return {
            success: false,

            intent:
              intentResult.intent,

            response:
              "This request requires P1 simulation data, but no P1 context was provided.",

            context,
          };

        }


        const baselineResponse =
          this.runBaselineAnalysis(
            input.p1_context,
            context
          );


        if (!baselineResponse.success) {

          return {
            success: false,

            intent:
              intentResult.intent,

            response:
              baselineResponse.message,

            context,
          };

        }

      }


      /* ---------------------------------------------------
         10. Strategy request
      --------------------------------------------------- */

      if (
        intentResult.intent ===
        "request_strategy"
      ) {

        return this.handleStrategyRequest(
          context,
          strategySelection,
          llmResponse
        );

      }


      /* ---------------------------------------------------
         11. Strategy simulation
      --------------------------------------------------- */

      if (
        intentResult.intent ===
        "simulate_strategy"
      ) {

        return this.handleStrategySimulation(
          context,
          input.p1_context,
          llmResponse
        );

      }


      /* ---------------------------------------------------
         12. Comparison
      --------------------------------------------------- */

      if (
        intentResult.intent ===
        "compare_strategy"
      ) {

        return this.handleComparison(
          context
        );

      }


      /* ---------------------------------------------------
         13. Explanation
      --------------------------------------------------- */

      if (
        intentResult.intent ===
        "explain_result"
      ) {

        return this.handleExplanation(
          context
        );

      }


      /* ---------------------------------------------------
         14. Approval
      --------------------------------------------------- */

      if (
        intentResult.intent ===
        "approve_strategy"
      ) {

        return this.handleApproval(
          context
        );

      }


      /* ---------------------------------------------------
         15. Rejection
      --------------------------------------------------- */

      if (
        intentResult.intent ===
        "reject_strategy"
      ) {

        return this.handleRejection(
          context
        );

      }


      /* ---------------------------------------------------
         16. Execution
      --------------------------------------------------- */

      if (
        intentResult.intent ===
        "execute_strategy"
      ) {

        return this.handleExecution(
          context
        );

      }


      /* ---------------------------------------------------
         17. Generic AI response
      --------------------------------------------------- */

      const response: AIResponse = {

        summary:
          llmResponse.explanation ??
          "Request processed by P2.",

        findings:
          llmResponse.reasoning ?? [],

        recommendation:
          llmResponse.reasoning?.join(" "),

        warnings: [],

        execution_status:
          "not_executed",
      };


      return this.validateAndReturnResponse(
        context,
        response
      );

    } catch (error) {

      const message =
        error instanceof Error
          ? error.message
          : "Unknown P2 orchestration error.";

      return {
        success: false,

        intent:
          this.safeDetectIntent(request),

        error: message,

        message,
      };

    }
  }


  /* =======================================================
     BASELINE ANALYSIS
  ======================================================= */

  private runBaselineAnalysis(
    p1Context: P1SimulationContext,
    context: ReturnType<
      typeof createAIContext
    >
  ):
    | {
        success: true;
        result: SimulationResult;
      }
    | {
        success: false;
        message: string;
      } {

    const toolResult =
      p2ToolRegistry.runBaseline({
        context: p1Context,
      });


    addToolResult(
      context,
      {
        tool_name:
          "run_baseline_simulation",

        success:
          toolResult.success,

        summary:
          toolResult.success
            ? "P1 baseline simulation completed."
            : "P1 baseline simulation failed.",

        data:
          toolResult.data,
      }
    );


    if (!toolResult.success) {

      return {
        success: false,

        message:
          toolResult.error ??
          "P1 baseline simulation failed.",
      };

    }


    const result =
      toolResult.data as SimulationResult;


    context.p1_state.simulation =
      result;


    return {
      success: true,
      result,
    };

  }


  /* =======================================================
     STRATEGY REQUEST
  ======================================================= */

  private handleStrategyRequest(
    context: ReturnType<
      typeof createAIContext
    >,

    strategySelection: ReturnType<
      typeof selectCandidateStrategies
    >,

    llmResponse: Awaited<
      ReturnType<
        P2LLMService["generate"]
      >
    >
  ): P2OrchestratorResult {

    if (
      strategySelection.requires_clarification
    ) {

      return {
        success: true,

        intent:
          "request_strategy",

        response:
          strategySelection
            .clarification_question ??
          "Please provide more information so a strategy can be selected.",

        context,
      };

    }


    const candidates =
      strategySelection.candidates;


    if (candidates.length === 0) {

      return {
        success: true,

        intent:
          "request_strategy",

        response:
          llmResponse.explanation ??
          "No applicable strategy was found in the approved strategy catalog.",

        context,
      };

    }


    const names =
      candidates
        .map(
          (strategy) =>
            `${strategy.strategy_id}: ${strategy.name}`
        )
        .join("\n");


    const response: AIResponse = {

      summary:
        "P2 identified the following candidate mitigation strategies.",

      findings:
        candidates.map(
          (strategy) =>
            `${strategy.strategy_id}: ${strategy.name}`
        ),

      strategy:
        names,

      recommendation:
        "These are candidate strategies only. P1 must validate and simulate the selected strategy before execution.",

      warnings: [
        "Candidate strategies have not been executed.",
        "Operational parameters must be validated by P1.",
      ],

      execution_status:
        "pending_approval",
    };


    return this.validateAndReturnResponse(
      context,
      response
    );

  }


  /* =======================================================
     STRATEGY SIMULATION
  ======================================================= */

  private handleStrategySimulation(
    context: ReturnType<
      typeof createAIContext
    >,

    p1Context:
      P1SimulationContext | undefined,

    llmResponse: Awaited<
      ReturnType<
        P2LLMService["generate"]
      >
    >
  ): P2OrchestratorResult {

    const strategyId =
      context.entities.strategy_id;


    if (!strategyId) {

      return {
        success: true,

        intent:
          "simulate_strategy",

        response:
          "Please provide a strategy ID, for example ST-001.",

        context,
      };

    }


    const strategy =
      getStrategyById(strategyId);


    if (!strategy) {

      return {
        success: false,

        intent:
          "simulate_strategy",

        response:
          `Strategy ${strategyId} does not exist in the approved strategy catalog.`,

        context,
      };

    }


    if (!p1Context) {

      return {
        success: false,

        intent:
          "simulate_strategy",

        response:
          "P1 context is required before a strategy can be simulated.",

        context,
      };

    }


    /* ---------------------------------------------------
       Validate strategy
    --------------------------------------------------- */

    const validation =
      p2ToolRegistry.validateStrategy(
        strategy
      );


    if (!validation.success) {

      return {
        success: false,

        intent:
          "simulate_strategy",

        response:
          validation.error ??
          "Strategy validation failed.",

        context,
      };

    }


    /* ---------------------------------------------------
       Simulate strategy
    --------------------------------------------------- */

    const simulation =
      p2ToolRegistry.simulateStrategy({
        context: p1Context,
        strategy: strategy,
      });


    addToolResult(
      context,
      {
        tool_name:
          "simulate_strategy",

        success:
          simulation.success,

        summary:
          simulation.success
            ? "Strategy simulation completed."
            : "Strategy simulation is not currently available through P1.",

        data:
          simulation.data,
      }
    );


    /*
     * Current P1 only exposes baseline simulation.
     * Never fabricate strategy results.
     */

    if (!simulation.success) {

      return {
        success: true,

        intent:
          "simulate_strategy",

        response:
          "The strategy was structurally validated, but P1 does not currently expose strategy simulation. No simulated result has been fabricated.",

        context,
      };

    }


    if (!simulation.data) {

      return {
        success: true,

        intent:
          "simulate_strategy",

        response:
          "P1 did not return a strategy simulation result.",

        context,
      };

    }


    const response: AIResponse = {

      summary:
        llmResponse.explanation ??
        `P1 returned a result for ${strategy.name}.`,

      findings:
        llmResponse.reasoning ?? [],

      strategy:
        strategy.name,

      recommendation:
        "Review the P1 result before approving execution.",

      warnings: [],

      execution_status:
        "pending_approval",
    };


    return this.validateAndReturnResponse(
      context,
      response
    );

  }


  /* =======================================================
     COMPARISON
  ======================================================= */

  private handleComparison(
    context: ReturnType<
      typeof createAIContext
    >
  ): P2OrchestratorResult {

    const simulation =
      context.p1_state.simulation;


    if (!simulation) {

      return {
        success: true,

        intent:
          "compare_strategy",

        response:
          "A baseline P1 simulation result is required before comparison.",

        context,
      };

    }


    return {
      success: true,

      intent:
        "compare_strategy",

      response:
        "Comparison requires both a baseline P1 result and a strategy simulation result. P2 will not invent the missing strategy result.",

      context,
    };

  }


  /* =======================================================
     EXPLAIN RESULT
  ======================================================= */

  private handleExplanation(
    context: ReturnType<
      typeof createAIContext
    >
  ): P2OrchestratorResult {

    const result =
      context.p1_state.simulation;


    if (!result) {

      return {
        success: true,

        intent:
          "explain_result",

        response:
          "There is currently no P1 simulation result available to explain.",

        context,
      };

    }


    const explanation =
      explainSimulationResult(
        result
      );


    return {
      success: true,

      intent:
        "explain_result",

      response:
        formatOrganizerResponse(
          explanation
        ),

      context,
    };

  }


  /* =======================================================
     APPROVAL
  ======================================================= */

  private handleApproval(
    context: ReturnType<
      typeof createAIContext
    >
  ): P2OrchestratorResult {

    const strategyId =
      context.entities.strategy_id;


    if (!strategyId) {

      return {
        success: true,

        intent:
          "approve_strategy",

        response:
          "Please specify the strategy ID that should be approved.",

        context,
      };

    }


    return {
      success: true,

      intent:
        "approve_strategy",

      response:
        `Approval request received for ${strategyId}. Execution requires the defined validation and approval workflow.`,

      context,
    };

  }


  /* =======================================================
     REJECTION
  ======================================================= */

  private handleRejection(
    context: ReturnType<
      typeof createAIContext
    >
  ): P2OrchestratorResult {

    const strategyId =
      context.entities.strategy_id;


    if (!strategyId) {

      return {
        success: true,

        intent:
          "reject_strategy",

        response:
          "Please specify the strategy ID that should be rejected.",

        context,
      };

    }


    return {
      success: true,

      intent:
        "reject_strategy",

      response:
        `Strategy ${strategyId} has been marked as rejected in the P2 workflow. No execution was performed.`,

      context,
    };

  }


  /* =======================================================
     EXECUTION
  ======================================================= */

  private handleExecution(
    context: ReturnType<
      typeof createAIContext
    >
  ): P2OrchestratorResult {

    const strategyId =
      context.entities.strategy_id;


    if (!strategyId) {

      return {
        success: true,

        intent:
          "execute_strategy",

        response:
          "Please specify the strategy ID to execute.",

        context,
      };

    }


    return {
      success: true,

      intent:
        "execute_strategy",

      response:
        `Execution of ${strategyId} cannot be claimed by P2. The strategy must first pass P1 validation and the organizer approval workflow.`,

      context,
    };

  }


  /* =======================================================
     BASELINE REQUIREMENT
  ======================================================= */

  private requiresBaselineAnalysis(
    intent: string
  ): boolean {

    return (
      intent ===
        "analyze_congestion" ||

      intent ===
        "identify_bottleneck" ||

      intent ===
        "check_status"
    );

  }


  /* =======================================================
     RESPONSE VALIDATION
  ======================================================= */

  private validateAndReturnResponse(
    context: ReturnType<
      typeof createAIContext
    >,

    response: AIResponse
  ): P2OrchestratorResult {

    const guardrailContext = {

      p1ResultAvailable:
        Boolean(
          context.p1_state.simulation
        ),

      p1ValidationPassed:
        false,

      strategyApproved:
        false,

      strategyExecuted:
        false,

      knownFacts:
        this.collectKnownFacts(
          context
        ),

      missingInformation: [],
    };


    /*
     * Your guardrail function expects:
     *
     * validateAIResponse(
     *   responseText,
     *   aiResponse,
     *   guardrailContext
     * )
     *
     * Therefore we provide all three.
     */

    const responseText =
      formatOrganizerResponse(
        response
      );


    const validation =
      validateAIResponse(
        responseText,
    
        guardrailContext
      );


    if (!validation.valid) {

      return {
        success: false,

        intent:
          context.intent,

        response:
          "P2 response was blocked by AI guardrails.",

        error:
          validation.errors.join(
            "; "
          ),

        context,
      };

    }


    return {
      success: true,

      intent:
        context.intent,

      response:
        responseText,

      context,
    };

  }


  /* =======================================================
     KNOWN FACTS
  ======================================================= */

  private collectKnownFacts(
    context: ReturnType<
      typeof createAIContext
    >
  ): string[] {

    const facts: string[] = [];


    if (context.organizer_request) {

      facts.push(
        `Organizer request: ${context.organizer_request}`
      );

    }


    if (context.intent) {

      facts.push(
        `Detected intent: ${context.intent}`
      );

    }


    if (
      context.entities.strategy_id
    ) {

      facts.push(
        `Strategy ID: ${context.entities.strategy_id}`
      );

    }


    if (
      context.p1_state.simulation
    ) {

      facts.push(
        "A P1 simulation result is available."
      );

    }


    return facts;

  }


  /* =======================================================
     SAFE INTENT
  ======================================================= */

  private safeDetectIntent(
    request: string
  ): string {

    try {

      return detectIntent(
        request
      ).intent;

    } catch {

      return "unknown";

    }

  }

}


/* =========================================================
   SINGLETON
========================================================= */

export const p2Orchestrator =
  new P2Orchestrator();