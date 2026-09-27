import {
  STRATEGY_CATALOG,
} from "../strategies/strategy_catalog";

import type {
  MitigationStrategy,
  StrategyAction,
} from "../strategies/strategy_model";

interface SandboxScenario {
  scenario_id: string;
  name: string;
  description: string;

  trigger: {
    condition: MitigationStrategy["trigger"]["condition"];
  };

  entities: {
    source?: string;
    target?: string;
    zone?: string;
    route?: string;
    resource?: string;
  };
}

interface StrategySandboxResult {
  scenario_id: string;
  strategy_id: string;
  strategy_name: string;

  matched: boolean;

  action: {
    type: StrategyAction["type"];
    source?: string;
    target?: string;
    zone_id?: string;
    route_id?: string;
    percentage?: number;
    duration_minutes?: number;
    level?: "low" | "medium" | "high";
  };

  parameters: Record<string, unknown>;

  expected_effects: string[];

  approval_required: boolean;
}

/**
 * Sandbox scenarios used to verify that each P2 strategy
 * can be correctly selected and converted into an operational proposal.
 *
 * This tests P2 strategy generation.
 *
 * It does NOT claim that the strategy actually improves
 * the crowd state. Actual effects remain the responsibility
 * of P1 simulation/validation.
 */
export const SANDBOX_SCENARIOS: SandboxScenario[] = [
  {
    scenario_id: "SB-001",
    name: "Gate Congestion",
    description:
      "Incoming crowd is congested at GATE_A and GATE_B is available.",
    trigger: {
      condition: "gate_congestion",
    },
    entities: {
      source: "GATE_A",
      target: "GATE_B",
    },
  },

  {
    scenario_id: "SB-002",
    name: "Alternative Gate Required",
    description:
      "An additional entry gate is required because the current gate is congested.",
    trigger: {
      condition: "gate_congestion",
    },
    entities: {
      target: "GATE_B",
    },
  },

  {
    scenario_id: "SB-003",
    name: "Entry Flow Too High",
    description:
      "Incoming flow at GATE_A exceeds the acceptable entry-flow condition.",
    trigger: {
      condition: "flow_exceeds_capacity",
    },
    entities: {
      target: "GATE_A",
    },
  },

  {
    scenario_id: "SB-004",
    name: "Exit Bottleneck",
    description:
      "EXIT_A is congested and EXIT_B is available for redirected outgoing flow.",
    trigger: {
      condition: "bottleneck_detected",
    },
    entities: {
      source: "EXIT_A",
      target: "EXIT_B",
    },
  },

  {
    scenario_id: "SB-005",
    name: "High Density Zone",
    description:
      "ZONE_A has reached a condition requiring controlled access.",
    trigger: {
      condition: "high_density",
    },
    entities: {
      zone: "ZONE_A",
    },
  },

  {
    scenario_id: "SB-006",
    name: "Route Bottleneck",
    description:
      "ROUTE_A is congested and ROUTE_B is available as an alternative route.",
    trigger: {
      condition: "bottleneck_detected",
    },
    entities: {
      source: "ROUTE_A",
      route: "ROUTE_B",
    },
  },

  {
    scenario_id: "SB-007",
    name: "Emergency Resource Requirement",
    description:
      "An emergency condition requires additional crowd-management resources.",
    trigger: {
      condition: "emergency_condition",
    },
    entities: {
      resource: "crowd_management_staff",
    },
  },

  {
    scenario_id: "SB-008",
    name: "Controlled Zone Reopening",
    description:
      "A previously restricted zone can be considered for controlled reopening.",
    trigger: {
      condition: "organizer_request",
    },
    entities: {
      zone: "ZONE_A",
    },
  },
];

/**
 * Convert a strategy action into a concrete sandbox action.
 *
 * The catalog contains placeholders such as:
 *
 * source: "source_gate"
 * target: "target_gate"
 *
 * The sandbox replaces those placeholders with
 * scenario-specific entities.
 */
function resolveAction(
  action: StrategyAction,
  scenario: SandboxScenario,
): StrategySandboxResult["action"] {
  const resolvedSource =
    action.source === "source_gate" ||
    action.source === "source_exit" ||
    action.source === "blocked_or_congested_route"
      ? scenario.entities.source
      : action.source;

  const resolvedTarget =
    action.target === "target_gate" ||
    action.target === "target_exit"
      ? scenario.entities.target
      : action.target;

  const resolvedZone =
    action.zone_id === "zone_id"
      ? scenario.entities.zone
      : action.zone_id;

  const resolvedRoute =
    action.route_id === "alternative_route"
      ? scenario.entities.route
      : action.route_id;

  return {
    type: action.type,
    source: resolvedSource,
    target: resolvedTarget,
    zone_id: resolvedZone,
    route_id: resolvedRoute,
    percentage: action.percentage,
    duration_minutes: action.duration_minutes,
    level: action.level,
  };
}

/**
 * Check whether a strategy can be applied to a sandbox scenario.
 */
function isStrategyApplicable(
  strategy: MitigationStrategy,
  scenario: SandboxScenario,
): boolean {
  if (
    strategy.trigger.condition !==
    scenario.trigger.condition
  ) {
    return false;
  }

  for (const action of strategy.actions) {
    if (
      (action.source === "source_gate" ||
        action.source === "source_exit" ||
        action.source === "blocked_or_congested_route") &&
      !scenario.entities.source
    ) {
      return false;
    }

    if (
      (action.target === "target_gate" ||
        action.target === "target_exit") &&
      !scenario.entities.target
    ) {
      return false;
    }

    if (
      action.zone_id === "zone_id" &&
      !scenario.entities.zone
    ) {
      return false;
    }

    if (
      action.route_id === "alternative_route" &&
      !scenario.entities.route
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Run one strategy against one sandbox scenario.
 */
export function runStrategySandbox(
  strategy: MitigationStrategy,
  scenario: SandboxScenario,
): StrategySandboxResult {
  const matched = isStrategyApplicable(
    strategy,
    scenario,
  );

  const action = strategy.actions[0];

  if (!action) {
    throw new Error(
      `Strategy ${strategy.strategy_id} does not contain an action.`,
    );
  }

  const resolvedAction = resolveAction(
    action,
    scenario,
  );

  return {
    scenario_id: scenario.scenario_id,
    strategy_id: strategy.strategy_id,
    strategy_name: strategy.name,
    matched,
    action: resolvedAction,
    parameters: strategy.parameters,
    expected_effects: strategy.expected_effects.map(
      (effect) => effect.effect,
    ),
    approval_required: strategy.approval_required,
  };
}

/**
 * Run every strategy against its corresponding sandbox scenario.
 */
export function runAllStrategySandboxTests(): StrategySandboxResult[] {
  return SANDBOX_SCENARIOS.map((scenario) => {
    const matchingStrategies = STRATEGY_CATALOG.filter(
      (strategy) =>
        strategy.trigger.condition ===
        scenario.trigger.condition,
    );

    const strategy = matchingStrategies.find(
      (candidate) =>
        isStrategyApplicable(candidate, scenario),
    );

    if (!strategy) {
      throw new Error(
        `No applicable P2 strategy found for ${scenario.scenario_id}.`,
      );
    }

    return runStrategySandbox(
      strategy,
      scenario,
    );
  });
}

/**
 * Pretty-print the sandbox results.
 */
export function printStrategySandboxResults(): void {
  const results = runAllStrategySandboxTests();

  console.log(
    "\n==============================================",
  );
  console.log(
    "EVENTFLOW P2 STRATEGY SANDBOX",
  );
  console.log(
    "==============================================",
  );

  for (const result of results) {
    console.log(
      `\n${result.strategy_id} — ${result.strategy_name}`,
    );

    console.log(
      "----------------------------------------------",
    );

    console.log(
      `Scenario: ${result.scenario_id}`,
    );

    console.log(
      `Matched: ${
        result.matched ? "YES" : "NO"
      }`,
    );

    console.log("\nAction:");

    console.log(
      JSON.stringify(
        result.action,
        null,
        2,
      ),
    );

    console.log("\nParameters:");

    console.log(
      JSON.stringify(
        result.parameters,
        null,
        2,
      ),
    );

    console.log("\nExpected effects:");

    for (const effect of result.expected_effects) {
      console.log(`- ${effect}`);
    }

    console.log(
      `\nApproval required: ${
        result.approval_required
          ? "YES"
          : "NO"
      }`,
    );
  }

  console.log(
    "\n==============================================",
  );

  console.log(
    "P2 STRATEGY SANDBOX COMPLETE",
  );

  console.log(
    "==============================================",
  );
}