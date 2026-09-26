/**
 * EV-013 — Priority Policy
 *
 * Defines the priority order used by P2 when explaining
 * and comparing mitigation strategies.
 *
 * IMPORTANT:
 * P2 does NOT calculate the actual safety, crowd, capacity,
 * or simulation results.
 *
 * P1 remains the authoritative source for those results.
 *
 * Priority order:
 * 1. Safety
 * 2. Crowd Reduction
 * 3. Visitor Experience
 * 4. Cost
 */

// ---------------------------------------------------------
// Priority Categories
// ---------------------------------------------------------

export type PriorityCategory =
  | "safety"
  | "crowd_reduction"
  | "visitor_experience"
  | "cost";

// ---------------------------------------------------------
// Priority Definition
// ---------------------------------------------------------

export interface PriorityDefinition {
  category: PriorityCategory;

  /**
   * Numerical policy weight used to represent
   * the relative importance of the objective.
   *
   * These are policy values, NOT simulation results.
   */
  weight: number;

  priority_order: number;

  description: string;
}

// ---------------------------------------------------------
// Default Priority Policy
// ---------------------------------------------------------

export const PRIORITY_POLICY: PriorityDefinition[] = [
  {
    category: "safety",
    weight: 1.0,
    priority_order: 1,
    description:
      "Safety has the highest priority and must not be compromised by lower-priority objectives.",
  },

  {
    category: "crowd_reduction",
    weight: 0.8,
    priority_order: 2,
    description:
      "Reducing crowd congestion and pressure is the second priority after safety.",
  },

  {
    category: "visitor_experience",
    weight: 0.5,
    priority_order: 3,
    description:
      "Visitor experience should be maintained where possible without compromising safety or crowd management.",
  },

  {
    category: "cost",
    weight: 0.3,
    priority_order: 4,
    description:
      "Cost should be considered after safety, crowd reduction, and visitor experience.",
  },
];

// ---------------------------------------------------------
// Get Priority Definition
// ---------------------------------------------------------

export function getPriorityDefinition(
  category: PriorityCategory,
): PriorityDefinition | undefined {
  return PRIORITY_POLICY.find(
    (priority) => priority.category === category,
  );
}

// ---------------------------------------------------------
// Get Priority Order
// ---------------------------------------------------------

export function getPriorityOrder(
  category: PriorityCategory,
): number {
  const priority = getPriorityDefinition(category);

  if (!priority) {
    return Number.MAX_SAFE_INTEGER;
  }

  return priority.priority_order;
}

// ---------------------------------------------------------
// Get Priority Weight
// ---------------------------------------------------------

export function getPriorityWeight(
  category: PriorityCategory,
): number {
  const priority = getPriorityDefinition(category);

  if (!priority) {
    return 0;
  }

  return priority.weight;
}

// ---------------------------------------------------------
// Check Whether One Priority Is More Important
// ---------------------------------------------------------

export function isHigherPriority(
  first: PriorityCategory,
  second: PriorityCategory,
): boolean {
  return getPriorityOrder(first) < getPriorityOrder(second);
}

// ---------------------------------------------------------
// Get All Priorities in Policy Order
// ---------------------------------------------------------

export function getPrioritiesInOrder(): PriorityDefinition[] {
  return [...PRIORITY_POLICY].sort(
    (a, b) => a.priority_order - b.priority_order,
  );
}

// ---------------------------------------------------------
// Policy Explanation
// ---------------------------------------------------------

export function explainPriorityPolicy(): string {
  return [
    "1. Safety has the highest priority.",
    "2. Crowd reduction is considered after safety.",
    "3. Visitor experience is considered after crowd reduction.",
    "4. Cost is considered after the other objectives.",
  ].join(" ");
}