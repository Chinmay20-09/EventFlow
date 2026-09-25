**Document Name:** Priority Policy
**Owner:** P2 — AI / Strategy Intelligence
**Priority:** MUST
**Status:** MVP Specification
**Version:** 1.0

---

# 1. Purpose

This document defines how EventFlow prioritizes competing objectives when evaluating mitigation strategies.

During an event, multiple objectives may conflict.

For example:

* A strategy may improve safety but increase cost.
* A strategy may reduce crowding but negatively affect visitor experience.
* A low-cost strategy may provide less crowd reduction.
* A strategy may improve visitor flow but temporarily increase waiting time.

The Priority Policy establishes how these competing objectives are considered.

The policy provides a consistent basis for comparing mitigation strategies while ensuring that safety remains the primary concern.

---

# 2. Architectural Principle

The Priority Policy defines **what the system values**.

The deterministic Core Engine determines **what actually happens**.

P2 is responsible for:

* Maintaining the policy configuration.
* Understanding organizer preferences where supported.
* Explaining trade-offs.
* Presenting strategy comparisons.

P1 is responsible for:

* Applying the policy to deterministic simulation results.
* Calculating objective metrics.
* Validating constraints.
* Comparing strategy outcomes.

Therefore:

> **P2 defines and communicates priorities; P1 performs the authoritative mathematical evaluation.**

The LLM must not independently calculate strategy scores or override configured safety constraints.

---

# 3. Primary Objectives

The EventFlow MVP considers four primary objectives:

1. **Safety**
2. **Crowd Reduction**
3. **Cost**
4. **Visitor Experience**

These objectives may conflict and therefore require a defined priority policy.

---

# 4. Objective Definitions

## 4.1 Safety

Safety represents the ability of a strategy to maintain or improve safe operating conditions.

Safety-related measurements may include:

* Crowd density
* Capacity utilization
* Risk level
* Bottleneck severity
* Restricted-zone violations
* Evacuation conditions
* Flow constraints

Safety is treated as the highest-priority objective.

A strategy that violates a mandatory safety constraint should not become acceptable merely because it performs well on cost or visitor experience.

---

## 4.2 Crowd Reduction

Crowd reduction measures how effectively a strategy reduces congestion and crowd accumulation.

Possible metrics include:

* Reduction in zone occupancy
* Reduction in gate utilization
* Reduction in queue size
* Improvement in flow distribution
* Reduction in bottleneck severity
* Reduction in crowd density

Crowd reduction is secondary to safety.

---

## 4.3 Cost

Cost represents the operational resources required to implement a strategy.

Possible cost factors include:

* Additional staff
* Infrastructure requirements
* Operational resources
* Temporary facilities
* Additional routing requirements
* Estimated implementation effort

Cost should influence strategy selection only after required safety conditions are satisfied.

---

## 4.4 Visitor Experience

Visitor experience represents the effect of a strategy on attendee convenience and event quality.

Possible factors include:

* Waiting time
* Walking distance
* Access restrictions
* Route changes
* Queue disruption
* Convenience
* Accessibility of normal event facilities

A strategy that improves safety may temporarily reduce visitor convenience.

Such trade-offs should be clearly communicated to the organizer.

---

# 5. Priority Hierarchy

The default EventFlow priority hierarchy is:

```text
                SAFETY
                  │
                  ▼
           CROWD REDUCTION
                  │
                  ▼
        VISITOR EXPERIENCE
                  │
                  ▼
                 COST
```

This means:

```text
Safety > Crowd Reduction > Visitor Experience > Cost
```

The hierarchy is intended to prevent cost or convenience from overriding mandatory safety requirements.

---

# 6. Hard Constraints vs Soft Objectives

An important distinction is made between **hard constraints** and **soft objectives**.

## 6.1 Hard Constraints

Hard constraints must be satisfied.

Examples:

```text
Maximum safe capacity
Restricted-zone rules
Emergency access requirements
Minimum operational capacity
Required evacuation conditions
```

If a strategy violates a hard constraint:

```text
Strategy
   ↓
Constraint Check
   ↓
VIOLATION
   ↓
Strategy rejected
```

The strategy should not be selected merely because it performs well in other areas.

---

## 6.2 Soft Objectives

Soft objectives are used to compare valid strategies.

Examples:

```text
Crowd reduction
Cost
Visitor experience
Operational efficiency
```

A strategy can perform better or worse against these objectives while still remaining valid.

---

# 7. Policy Evaluation Model

A strategy should first pass mandatory constraints.

Only valid strategies should proceed to objective comparison.

Conceptually:

```text
Candidate Strategies
        ↓
Hard Constraint Validation
        ↓
 ┌──────┴──────┐
 │             │
Invalid       Valid
 │             │
Reject         ↓
        Objective Evaluation
              ↓
       Priority Policy
              ↓
       Strategy Comparison
```

---

# 8. Policy Configuration

The policy may be represented in machine-readable form.

Example:

```json
{
  "priority_policy": {
    "safety": {
      "priority": 1,
      "weight": 1.0
    },
    "crowd_reduction": {
      "priority": 2,
      "weight": 0.8
    },
    "visitor_experience": {
      "priority": 3,
      "weight": 0.5
    },
    "cost": {
      "priority": 4,
      "weight": 0.3
    }
  }
}
```

The values shown above represent an example MVP configuration.

The exact numerical values may be configured by the system specification or event configuration.

---

# 9. Safety Priority

Safety receives special treatment.

A strategy must not be considered acceptable if it violates a mandatory safety constraint.

For example:

```text
Strategy A
Safety: VALID
Crowd Reduction: HIGH
Cost: HIGH

Strategy B
Safety: INVALID
Crowd Reduction: VERY HIGH
Cost: LOW
```

Strategy B must not become acceptable simply because it is cheaper or reduces more crowding.

The safety constraint is evaluated first.

---

# 10. Strategy Comparison

Once candidate strategies satisfy mandatory constraints, the system may compare their objective performance.

Example:

```text
Strategy A
────────────────────
Safety              HIGH
Crowd Reduction     HIGH
Visitor Experience  MEDIUM
Cost                HIGH


Strategy B
────────────────────
Safety              HIGH
Crowd Reduction     MEDIUM
Visitor Experience  HIGH
Cost                LOW
```

The system can present these trade-offs to the organizer.

The final mathematical comparison is performed using the configured policy and deterministic engine.

---

# 11. Weighted Evaluation

Where the implementation uses weighted scoring, the conceptual model is:

```text
Strategy Score =
    Safety Contribution
  + Crowd Reduction Contribution
  + Experience Contribution
  + Cost Contribution
```

More formally:

```text
Score =
(Ws × Safety)
+
(Wc × CrowdReduction)
+
(We × Experience)
+
(Wcost × Cost)
```

where:

```text
Ws    = Safety weight
Wc    = Crowd reduction weight
We    = Visitor experience weight
Wcost = Cost weight
```

The implementation must also account for the direction of each metric.

For example:

* Higher safety score is desirable.
* Higher crowd reduction is desirable.
* Lower cost is desirable.
* Higher visitor experience score is desirable.

Normalization should be performed by the deterministic evaluation layer rather than by the LLM.

---

# 12. Example Weighted Policy

Example configuration:

```json
{
  "weights": {
    "safety": 1.0,
    "crowd_reduction": 0.8,
    "visitor_experience": 0.5,
    "cost": 0.3
  }
}
```

This means safety has the strongest influence in the objective model.

It does not mean that the AI can independently calculate or modify the final result.

---

# 13. P2 Responsibilities

P2 owns the intelligence/interface around the policy.

P2 may:

* Explain the priority policy.
* Explain why safety is prioritized.
* Present trade-offs.
* Explain why a strategy has certain advantages.
* Ask the organizer for supported preference information.
* Present strategy comparison results.
* Convert organizer preferences into structured policy parameters when such customization is supported.

Example:

Organizer:

> "Why are you recommending this even though it costs more?"

P2:

> "The strategy has a higher operational cost, but the simulation shows greater crowd-risk reduction while satisfying the required safety constraints."

---

# 14. P2 Restrictions

The AI must not:

* Invent policy weights.
* Change safety constraints without authorization.
* Override the Core Engine.
* Claim that a strategy is safer without simulation evidence.
* Perform authoritative numerical scoring.
* Treat its own qualitative judgment as an engine result.

For example, the AI must not independently state:

> "I calculated that Strategy A is 72% better."

unless the corresponding calculation was performed by the authorized evaluation system.

---

# 15. P1 Responsibilities

The deterministic Core Engine is responsible for:

* Calculating objective metrics.
* Applying configured weights.
* Performing normalization.
* Evaluating hard constraints.
* Comparing valid strategies.
* Producing deterministic results.
* Returning the evidence used by P2.

Example engine output:

```json
{
  "strategy_id": "ST-001",
  "constraints_valid": true,
  "metrics": {
    "safety": 0.91,
    "crowd_reduction": 0.78,
    "visitor_experience": 0.61,
    "cost": 0.40
  },
  "weighted_score": 0.79
}
```

P2 then explains the result.

---

# 16. Organizer Preferences

EventFlow may support organizer preferences where permitted by the system.

Example:

```text
Organizer:
"Keep visitor disruption as low as possible."
```

P2 may convert this into:

```json
{
  "preference": {
    "objective": "visitor_experience",
    "priority": "high"
  }
}
```

However, organizer preferences cannot override mandatory safety constraints.

For example:

```text
Organizer preference:
Minimize disruption

Safety requirement:
Do not exceed configured safe capacity
```

The safety requirement remains mandatory.

---

# 17. Policy Precedence

When objectives conflict, the following precedence applies:

```text
1. Mandatory Safety Constraints
2. Safety Objective
3. Crowd Reduction
4. Visitor Experience
5. Cost
```

This can be represented as:

```text
Hard Safety Constraints
        ↓
Safety
        ↓
Crowd Reduction
        ↓
Visitor Experience
        ↓
Cost
```

---

# 18. Example Scenario

### Situation

Gate A is heavily congested.

Three strategies are available.

```text
Strategy A
- High safety improvement
- High cost
- Medium visitor disruption

Strategy B
- Medium safety improvement
- Low cost
- Low visitor disruption

Strategy C
- Low safety improvement
- Very low cost
- Very low visitor disruption
```

The system first checks whether all three satisfy mandatory safety constraints.

If all three are valid, the configured policy is used to compare their objective performance.

P2 then explains the result.

Example:

> "Strategy A requires more operational resources, but the simulation indicates a greater reduction in the identified crowd risk. Strategy B has lower cost and lower visitor disruption but provides a smaller modeled improvement."

The AI presents the evidence rather than inventing a preference.

---

# 19. Example of Safety Constraint Failure

Suppose:

```text
Strategy A:
Safety = valid

Strategy B:
Safety = invalid
```

Even if Strategy B has:

```text
Lower cost
Better visitor experience
Higher theoretical crowd reduction
```

it must not be treated as an acceptable alternative if the safety violation is mandatory.

The system should return:

```json
{
  "strategy_id": "ST-002",
  "status": "REJECTED",
  "reason": "Mandatory safety constraint violated"
}
```

P2 can explain:

> "Strategy B was rejected because it violates a mandatory safety constraint."

---

# 20. Policy Transparency

The system should make the reason for strategy comparison understandable.

P2 should be able to answer questions such as:

* Why was this strategy considered?
* Why was another strategy rejected?
* Why does this strategy cost more?
* What safety improvement does it provide?
* What effect does it have on visitor experience?
* Which constraints affected the result?
* What trade-offs exist?

The explanation should reference deterministic engine results whenever numerical information is provided.

---

# 21. Policy Change

Policy configuration may change between events or according to authorized event configuration.

Example:

```json
{
  "event_id": "EV-001",
  "priority_policy": {
    "safety": 1.0,
    "crowd_reduction": 0.9,
    "visitor_experience": 0.4,
    "cost": 0.2
  }
}
```

Policy changes should be explicit and traceable.

The LLM must not silently modify policy configuration.

---

# 22. Auditability

A strategy evaluation should record:

* Policy version
* Policy weights
* Strategy ID
* Strategy parameters
* Constraint results
* Objective metrics
* Final evaluation result
* Timestamp
* Approval state

Example:

```json
{
  "policy_version": "1.0",
  "strategy_id": "ST-001",
  "constraints_valid": true,
  "metrics": {
    "safety": 0.91,
    "crowd_reduction": 0.78,
    "visitor_experience": 0.61,
    "cost": 0.40
  }
}
```

This allows decisions to be reviewed later.

---

# 23. Failure Handling

If policy configuration is missing:

```text
Policy Missing
     ↓
Do not perform unconfigured strategy comparison
     ↓
Return configuration error
```

If policy weights are invalid:

```text
Invalid Policy
     ↓
Reject evaluation
     ↓
Notify P2
```

The AI must not silently invent replacement values.

---

# 24. Guardrails

The following guardrails are mandatory:

1. Safety constraints cannot be overridden by the LLM.
2. AI-generated preferences must be validated.
3. Policy weights must come from authorized configuration.
4. Numerical scores must originate from the deterministic evaluation layer.
5. AI explanations must remain grounded in engine results.
6. Unsupported policy objectives must be rejected.
7. Strategy evaluation must be reproducible using the same inputs and policy.

---

# 25. MVP Scope

The MVP requires:

* Four primary objectives.
* Safety-first priority.
* Configurable objective weights.
* Hard safety constraints.
* Deterministic strategy comparison.
* P2 explanation of trade-offs.
* Policy versioning.
* Basic audit information.

The MVP does not require:

* Dynamic reinforcement learning-based priorities.
* Automatically learned weights.
* Personalized behavioral optimization.
* Autonomous policy modification.
* ML-based objective weighting.

---

# 26. Future Extensions

Future versions may support:

* Event-specific policy profiles.
* Organizer-configurable objective weights.
* Historical analysis of policy effectiveness.
* Learned preference modeling.
* Multi-event policy comparison.
* Advanced optimization algorithms.

These features must continue to respect mandatory safety constraints.

---

# 27. Success Criteria

EV-013 is considered successfully implemented when:

1. EventFlow has an explicit priority policy.
2. Safety is treated as the primary objective.
3. Mandatory safety constraints cannot be overridden.
4. Crowd reduction, cost, and visitor experience can be evaluated.
5. Objective weights are configurable.
6. P1 performs the authoritative numerical evaluation.
7. P2 can explain strategy trade-offs.
8. Policy configuration is versioned and auditable.
9. The LLM cannot silently modify the policy.
10. The same inputs and policy produce reproducible evaluation results.

---

# 28. Key Principle

> **The Priority Policy defines what EventFlow values when comparing valid mitigation strategies. Safety constraints are mandatory, P1 performs the authoritative evaluation, and P2 explains the resulting trade-offs to the organizer.**
