/**
 * EV-014 — Decision Workflow
 *
 * Defines the lifecycle followed by P2 when handling
 * a detected event-management problem.
 *
 * P2 coordinates the intelligence and decision workflow.
 * P1 remains responsible for deterministic validation,
 * simulation, calculations, and authoritative results.
 */

// ---------------------------------------------------------
// Workflow States
// ---------------------------------------------------------

export type WorkflowState =
  | "DETECTED"
  | "ANALYZING"
  | "STRATEGIES_GENERATED"
  | "VALIDATING"
  | "SIMULATING"
  | "INTERPRETING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "MONITORING"
  | "COMPLETED"
  | "FAILED";

// ---------------------------------------------------------
// Workflow Transition
// ---------------------------------------------------------

export interface WorkflowTransition {
  from: WorkflowState;

  to: WorkflowState;

  description: string;
}

// ---------------------------------------------------------
// Decision Workflow
// ---------------------------------------------------------

export const DECISION_WORKFLOW: WorkflowTransition[] = [
  {
    from: "DETECTED",
    to: "ANALYZING",
    description:
      "P2 analyzes the detected problem and identifies the relevant event context.",
  },

  {
    from: "ANALYZING",
    to: "STRATEGIES_GENERATED",
    description:
      "P2 generates one or more candidate mitigation strategies.",
  },

  {
    from: "STRATEGIES_GENERATED",
    to: "VALIDATING",
    description:
      "Candidate strategies are sent to P1 for deterministic validation.",
  },

  {
    from: "VALIDATING",
    to: "SIMULATING",
    description:
      "Validated strategies are sent to P1 for deterministic simulation.",
  },

  {
    from: "SIMULATING",
    to: "INTERPRETING",
    description:
      "P2 interprets the simulation results returned by P1.",
  },

  {
    from: "INTERPRETING",
    to: "AWAITING_APPROVAL",
    description:
      "P2 presents the strategy and simulation interpretation for organizer review.",
  },

  {
    from: "AWAITING_APPROVAL",
    to: "APPROVED",
    description:
      "Organizer approves the proposed mitigation strategy.",
  },

  {
    from: "AWAITING_APPROVAL",
    to: "REJECTED",
    description:
      "Organizer rejects the proposed mitigation strategy.",
  },

  {
    from: "APPROVED",
    to: "EXECUTING",
    description:
      "The approved strategy moves into the execution stage.",
  },

  {
    from: "EXECUTING",
    to: "MONITORING",
    description:
      "The system monitors the event after strategy execution.",
  },

  {
    from: "MONITORING",
    to: "COMPLETED",
    description:
      "The mitigation workflow completes when the situation is resolved.",
  },

  {
    from: "MONITORING",
    to: "ANALYZING",
    description:
      "The workflow returns to analysis when the situation requires reevaluation.",
  },

  {
    from: "VALIDATING",
    to: "FAILED",
    description:
      "The workflow fails when P1 validation rejects the strategy or required validation cannot be completed.",
  },

  {
    from: "SIMULATING",
    to: "FAILED",
    description:
      "The workflow fails when deterministic simulation cannot be completed.",
  },

  {
    from: "EXECUTING",
    to: "FAILED",
    description:
      "The workflow fails when strategy execution cannot be completed.",
  },
];

// ---------------------------------------------------------
// Initial State
// ---------------------------------------------------------

export const INITIAL_WORKFLOW_STATE: WorkflowState = "DETECTED";

// ---------------------------------------------------------
// Check Whether a Transition Is Valid
// ---------------------------------------------------------

export function canTransition(
  from: WorkflowState,
  to: WorkflowState,
): boolean {
  return DECISION_WORKFLOW.some(
    (transition) =>
      transition.from === from &&
      transition.to === to,
  );
}

// ---------------------------------------------------------
// Get Available Next States
// ---------------------------------------------------------

export function getNextStates(
  currentState: WorkflowState,
): WorkflowState[] {
  return DECISION_WORKFLOW
    .filter(
      (transition) => transition.from === currentState,
    )
    .map(
      (transition) => transition.to,
    );
}

// ---------------------------------------------------------
// Get Transition Description
// ---------------------------------------------------------

export function getTransitionDescription(
  from: WorkflowState,
  to: WorkflowState,
): string | undefined {
  const transition = DECISION_WORKFLOW.find(
    (item) =>
      item.from === from &&
      item.to === to,
  );

  return transition?.description;
}

// ---------------------------------------------------------
// Move Workflow to Next State
// ---------------------------------------------------------

export function transitionWorkflow(
  currentState: WorkflowState,
  nextState: WorkflowState,
): WorkflowState {
  if (!canTransition(currentState, nextState)) {
    throw new Error(
      `Invalid workflow transition: ${currentState} → ${nextState}`,
    );
  }

  return nextState;
}