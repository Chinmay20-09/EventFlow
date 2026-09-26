import type { MitigationStrategy } from "./strategy_model";

/**
 * EV-032 — Strategy Catalog
 *
 * This file contains the predefined MVP mitigation strategies
 * available to the P2 Strategy Intelligence layer.
 *
 * IMPORTANT:
 * P2 defines and proposes strategies.
 * P1 remains responsible for:
 * - deterministic validation
 * - capacity calculations
 * - crowd simulation
 * - safety validation
 * - actual strategy effects
 */

export const STRATEGY_CATALOG: MitigationStrategy[] = [
  // ---------------------------------------------------------
  // ST-001 — Gate Flow Redistribution
  // ---------------------------------------------------------
  {
    strategy_id: "ST-001",
    name: "Gate Flow Redistribution",
    version: "1.0",
    description:
      "Redistribute incoming crowd flow from a congested gate toward another available gate.",
    objective: "redistribute_flow",

    trigger: {
      condition: "gate_congestion",
      description:
        "Triggered when a gate becomes congested and incoming flow should be redistributed.",
    },

    actions: [
      {
        type: "redirect_entry_flow",
        source: "source_gate",
        target: "target_gate",
        percentage: 20,
      },
    ],

    parameters: {
      source_gate: "gate_id",
      target_gate: "gate_id",
      redirect_percentage: 20,
      duration_minutes: 10,
    },

    constraints: [
      {
        id: "C-001",
        description: "Target gate must be available for additional flow.",
        required: true,
      },
      {
        id: "C-002",
        description: "Emergency access routes must remain available.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "reduced_gate_congestion",
        description:
          "Expected to reduce pressure at the congested entry gate.",
      },
      {
        effect: "redistributed_entry_flow",
        description:
          "Expected to distribute incoming flow across available gates.",
      },
    ],

    approval_required: true,
  },

  // ---------------------------------------------------------
  // ST-002 — Alternative Gate Activation
  // ---------------------------------------------------------
  {
    strategy_id: "ST-002",
    name: "Alternative Gate Activation",
    version: "1.0",
    description:
      "Activate an alternative entry gate to provide an additional route for incoming visitors.",
    objective: "reduce_gate_utilization",

    trigger: {
      condition: "gate_congestion",
      description:
        "Triggered when an existing entry gate experiences excessive congestion.",
    },

    actions: [
      {
        type: "activate_gate",
        target: "alternative_gate",
      },
    ],

    parameters: {
      target_gate: "alternative_gate_id",
      duration_minutes: 15,
    },

    constraints: [
      {
        id: "C-003",
        description: "The alternative gate must be operationally available.",
        required: true,
      },
      {
        id: "C-004",
        description: "Activation must not violate restricted-zone constraints.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "additional_entry_option",
        description:
          "Provides an additional entry route for visitors.",
      },
      {
        effect: "reduced_gate_pressure",
        description:
          "Expected to reduce congestion at existing entry gates.",
      },
    ],

    approval_required: true,
  },

  // ---------------------------------------------------------
  // ST-003 — Temporary Entry Flow Control
  // ---------------------------------------------------------
  {
    strategy_id: "ST-003",
    name: "Temporary Entry Flow Control",
    version: "1.0",
    description:
      "Temporarily control the rate of entry through a gate when incoming flow exceeds acceptable conditions.",
    objective: "reduce_crowd_congestion",

    trigger: {
      condition: "flow_exceeds_capacity",
      description:
        "Triggered when incoming flow exceeds the acceptable entry-flow condition.",
    },

    actions: [
      {
        type: "control_entry_flow",
        target: "gate_id",
        level: "medium",
        duration_minutes: 10,
      },
    ],

    parameters: {
      target_gate: "gate_id",
      flow_control_level: "medium",
      duration_minutes: 10,
    },

    constraints: [
      {
        id: "C-005",
        description: "Emergency entry and emergency access must remain available.",
        required: true,
      },
      {
        id: "C-006",
        description: "Entry control must not create an unsafe external queue.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "controlled_entry_flow",
        description:
          "Expected to reduce the rate of incoming visitors.",
      },
      {
        effect: "reduced_congestion",
        description:
          "Expected to reduce congestion near the affected entry area.",
      },
    ],

    approval_required: true,
  },

  // ---------------------------------------------------------
  // ST-004 — Exit Flow Redistribution
  // ---------------------------------------------------------
  {
    strategy_id: "ST-004",
    name: "Exit Flow Redistribution",
    version: "1.0",
    description:
      "Redistribute outgoing visitor flow from a congested exit toward another available exit.",
    objective: "redistribute_flow",

    trigger: {
      condition: "bottleneck_detected",
      description:
        "Triggered when an exit bottleneck is detected.",
    },

    actions: [
      {
        type: "redirect_exit_flow",
        source: "source_exit",
        target: "target_exit",
        percentage: 20,
      },
    ],

    parameters: {
      source_exit: "exit_id",
      target_exit: "alternative_exit_id",
      redirect_percentage: 20,
      duration_minutes: 10,
    },

    constraints: [
      {
        id: "C-007",
        description: "Target exit must be available for redirected flow.",
        required: true,
      },
      {
        id: "C-008",
        description: "Emergency evacuation routes must remain clear.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "reduced_exit_congestion",
        description:
          "Expected to reduce congestion at the affected exit.",
      },
      {
        effect: "redistributed_exit_flow",
        description:
          "Expected to distribute outgoing visitors across available exits.",
      },
    ],

    approval_required: true,
  },

  // ---------------------------------------------------------
  // ST-005 — Zone Access Restriction
  // ---------------------------------------------------------
  {
    strategy_id: "ST-005",
    name: "Zone Access Restriction",
    version: "1.0",
    description:
      "Restrict access to a zone when crowd conditions or safety conditions require controlled access.",
    objective: "reduce_zone_occupancy",

    trigger: {
      condition: "high_density",
      description:
        "Triggered when a zone reaches a condition requiring access restriction.",
    },

    actions: [
      {
        type: "restrict_zone",
        zone_id: "zone_id",
        level: "high",
      },
    ],

    parameters: {
      zone_id: "zone_id",
      restriction_level: "high",
      duration_minutes: 15,
    },

    constraints: [
      {
        id: "C-009",
        description: "Emergency access to the zone must remain possible.",
        required: true,
      },
      {
        id: "C-010",
        description: "Restriction must not block designated evacuation routes.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "reduced_zone_occupancy",
        description:
          "Expected to limit additional visitor flow into the affected zone.",
      },
      {
        effect: "reduced_zone_pressure",
        description:
          "Expected to reduce crowd pressure within the restricted zone.",
      },
    ],

    approval_required: true,
  },

  // ---------------------------------------------------------
  // ST-006 — Crowd Route Diversion
  // ---------------------------------------------------------
  {
    strategy_id: "ST-006",
    name: "Crowd Route Diversion",
    version: "1.0",
    description:
      "Redirect visitor movement away from a congested route toward an alternative route.",
    objective: "improve_evacuation_flow",

    trigger: {
      condition: "bottleneck_detected",
      description:
        "Triggered when a route bottleneck affects visitor movement.",
    },

    actions: [
      {
        type: "divert_route",
        route_id: "alternative_route",
        source: "blocked_or_congested_route",
        target: "alternative_route",
      },
    ],

    parameters: {
      route_id: "alternative_route_id",
      duration_minutes: 15,
    },

    constraints: [
      {
        id: "C-011",
        description: "Alternative route must be available.",
        required: true,
      },
      {
        id: "C-012",
        description: "Diversion must not create a new unsafe bottleneck.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "reduced_route_congestion",
        description:
          "Expected to reduce congestion on the affected route.",
      },
      {
        effect: "alternative_flow_path",
        description:
          "Provides an alternative movement path for visitors.",
      },
    ],

    approval_required: true,
  },

  // ---------------------------------------------------------
  // ST-007 — Staff / Resource Activation
  // ---------------------------------------------------------
  {
    strategy_id: "ST-007",
    name: "Staff / Resource Activation",
    version: "1.0",
    description:
      "Activate available staff or operational resources to support crowd management.",
    objective: "reduce_risk",

    trigger: {
      condition: "emergency_condition",
      description:
        "Triggered when additional operational resources may be required.",
    },

    actions: [
      {
        type: "activate_resource",
        level: "high",
      },
    ],

    parameters: {
      resource_type: "crowd_management_staff",
      quantity: 1,
      duration_minutes: 30,
    },

    constraints: [
      {
        id: "C-013",
        description: "The requested resource must be available.",
        required: true,
      },
      {
        id: "C-014",
        description: "Resource activation must follow organizer approval.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "increased_operational_support",
        description:
          "Provides additional staff or operational resources.",
      },
      {
        effect: "improved_crowd_management",
        description:
          "Expected to improve the ability to manage affected crowd areas.",
      },
    ],

    approval_required: true,
  },

  // ---------------------------------------------------------
  // ST-008 — Controlled Zone Reopening
  // ---------------------------------------------------------
  {
    strategy_id: "ST-008",
    name: "Controlled Zone Reopening",
    version: "1.0",
    description:
      "Reopen a previously restricted zone when conditions allow controlled access.",
    objective: "maintain_capacity",

    trigger: {
      condition: "organizer_request",
      description:
        "Triggered when a restricted zone is considered for controlled reopening.",
    },

    actions: [
      {
        type: "reopen_zone",
        zone_id: "zone_id",
        level: "low",
      },
    ],

    parameters: {
      zone_id: "zone_id",
      duration_minutes: 15,
    },

    constraints: [
      {
        id: "C-015",
        description: "P1 must validate that reopening is operationally safe.",
        required: true,
      },
      {
        id: "C-016",
        description: "Emergency access and restricted areas must remain protected.",
        required: true,
      },
    ],

    expected_effects: [
      {
        effect: "restored_zone_access",
        description:
          "Allows controlled visitor access to the previously restricted zone.",
      },
      {
        effect: "restored_flow_option",
        description:
          "Provides an additional available area for visitor movement.",
      },
    ],

    approval_required: true,
  },
];

/**
 * Find a strategy by its strategy ID.
 *
 * Example:
 * getStrategyById("ST-001")
 */
export function getStrategyById(
  strategyId: string,
): MitigationStrategy | undefined {
  return STRATEGY_CATALOG.find(
    (strategy) => strategy.strategy_id === strategyId,
  );
}

/**
 * Find strategies that match a particular trigger condition.
 */
export function getStrategiesByTrigger(
  condition: MitigationStrategy["trigger"]["condition"],
): MitigationStrategy[] {
  return STRATEGY_CATALOG.filter(
    (strategy) => strategy.trigger.condition === condition,
  );
}

/**
 * Find strategies based on their objective.
 */
export function getStrategiesByObjective(
  objective: MitigationStrategy["objective"],
): MitigationStrategy[] {
  return STRATEGY_CATALOG.filter(
    (strategy) => strategy.objective === objective,
  );
}