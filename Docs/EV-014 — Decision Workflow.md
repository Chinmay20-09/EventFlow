**Document Name:** `Decision_Workflow.md`
**Owner:** P2 — AI / Strategy Intelligence
**Priority:** MUST
**Scope:** MVP
**Version:** 1.0

---

## 1. Purpose

This document defines the complete decision-making workflow used by EventFlow when a crowd, safety, environmental, or operational issue is detected.

The workflow establishes how EventFlow moves from:

> **Problem Detection → Situation Analysis → Strategy Generation → Validation → Simulation → Recommendation → Approval → Execution → Monitoring**

The workflow ensures that AI can assist organizers without becoming the source of truth for operational or numerical decisions.

The core principle is:

> **P2 proposes and explains. P1 validates, calculates, and simulates. The organizer approves operational actions.**

---

# 2. Scope

This document covers:

* Detection of operational problems
* AI-based situation understanding
* Natural-language organizer requests
* Strategy generation
* Strategy structuring
* Validation of strategies
* Deterministic simulation
* Strategy comparison
* AI-generated explanations
* Organizer approval
* Strategy execution
* Post-execution monitoring
* Re-evaluation
* Failure handling
* Auditability

This document does **not** define:

* Crowd simulation mathematics
* Capacity calculations
* Risk calculation formulas
* Routing algorithms
* Numerical optimization algorithms
* Physical execution systems
* Detailed strategy definitions

Those responsibilities belong primarily to the Core Engine and other system components.

---

# 3. Architectural Principle

EventFlow separates **intelligence** from **deterministic decision computation**.

### P2 — AI / Strategy Intelligence

P2 is responsible for:

* Understanding organizer requests
* Understanding detected situations
* Generating candidate strategies
* Converting natural language into structured commands
* Calling the appropriate P1 tools
* Interpreting P1 results
* Explaining bottlenecks
* Explaining strategy trade-offs
* Suggesting mitigation actions
* Managing conversational context
* Asking for clarification when necessary
* Preparing recommendations for organizer approval

### P1 — Deterministic Core Engine

P1 is responsible for:

* Capacity calculations
* Crowd simulation
* Risk calculations
* Constraint validation
* Strategy simulation
* Numerical results
* Resource limits
* Route feasibility
* Objective evaluation
* Deterministic comparison

### Organizer

The organizer is responsible for:

* Reviewing recommendations
* Providing operational preferences
* Approving or rejecting proposed actions
* Authorizing execution where required

---

# 4. High-Level Decision Workflow

```text
┌─────────────────────────┐
│ Event Monitoring        │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Problem / Risk Detected │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Situation Analysis      │
│          (P2)           │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Generate Strategies     │
│          (P2)           │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Structure Strategy      │
│          (P2)           │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Validate Strategy       │
│          (P1)           │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Simulate Strategy       │
│          (P1)           │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Interpret Results       │
│          (P2)           │
└────────────┬────────────┘
             ↓
┌─────────────────────────┐
│ Organizer Review        │
└────────────┬────────────┘
             ↓
       ┌─────┴─────┐
       ↓           ↓
   APPROVE       REJECT
       ↓           ↓
   Execute      Reconsider
       ↓
   Monitor
       ↓
 Re-evaluate
```

---

# 5. Decision Lifecycle

## 5.1 Event Monitoring

EventFlow continuously receives or maintains information about the current event state.

Example inputs:

* Current crowd distribution
* Gate utilization
* Zone occupancy
* Queue size
* Weather conditions
* Route status
* Capacity utilization
* Restricted areas
* Emergency conditions
* Operational resources

The Core Engine remains responsible for calculating authoritative operational metrics.

P2 consumes these metrics rather than independently calculating them.

---

# 5.2 Problem Detection

A decision workflow begins when a significant situation is detected.

Examples:

```text
Gate A utilization exceeds threshold
```

```text
Zone B density is increasing rapidly
```

```text
Heavy rain is expected
```

```text
An evacuation route is becoming unavailable
```

```text
Organizer asks how to reduce congestion
```

A problem may therefore originate from:

1. Automatic system detection
2. Organizer request
3. External event information

---

# 5.3 Situation Analysis

After detecting a situation, P2 interprets the available information.

Example:

> Gate A is experiencing high utilization while Gate C has available capacity.

P2 should identify:

* What is happening?
* Where is it happening?
* Which constraints are relevant?
* What objective is affected?
* What information is missing?
* Which strategies could potentially address it?

P2 should **not** independently calculate whether Gate A is actually overloaded.

That determination comes from P1.

---

# 5.4 Organizer-Initiated Requests

An organizer may directly ask a natural-language question.

Example:

> "The stadium is getting crowded near Gate A. What can we do?"

P2 converts the request into structured intent.

Example:

```json
{
  "intent": "mitigate_crowd_congestion",
  "location": "Gate_A",
  "requested_action": "suggest_strategies"
}
```

Another example:

> "What happens if we redirect people from Gate A to Gate C?"

P2 converts this into a simulation request:

```json
{
  "intent": "simulate_strategy",
  "strategy_id": "ST-001",
  "parameters": {
    "source_gate": "Gate_A",
    "target_gate": "Gate_C"
  }
}
```

P2 then calls the appropriate P1 function.

---

# 5.5 Candidate Strategy Generation

P2 identifies possible mitigation strategies based on:

* Current problem
* Available strategy catalog
* Current event context
* Organizer request
* System constraints
* Previous conversation context

Example problem:

> Gate A congestion

Possible candidate strategies:

```text
Strategy 1:
Redirect part of entry flow from Gate A → Gate C

Strategy 2:
Activate an additional entry gate

Strategy 3:
Temporarily hold incoming flow

Strategy 4:
Redistribute nearby zone access
```

These are **candidate strategies**, not final decisions.

---

# 5.6 Strategy Structuring

Each candidate strategy must be converted into the structured format defined in `EV-012 — Strategy_Model.md`.

Example:

```json
{
  "strategy_id": "ST-001",
  "name": "Gate Flow Redistribution",
  "objective": "Reduce congestion at Gate A",
  "actions": [
    {
      "type": "redirect_entry_flow",
      "source": "Gate_A",
      "target": "Gate_C"
    }
  ],
  "parameters": {
    "redirect_percentage": 20
  },
  "approval_required": true
}
```

P2 may generate the candidate structure.

P1 determines whether the proposed parameters are valid.

---

# 5.7 Strategy Validation

The structured strategy is sent to P1 for validation.

P1 checks:

* Does the referenced gate exist?
* Is the gate operational?
* Is the target location available?
* Is the route valid?
* Is the requested parameter within allowed limits?
* Are required resources available?
* Are safety constraints satisfied?
* Does the strategy violate hard constraints?

Example response:

```json
{
  "valid": true,
  "strategy_id": "ST-001",
  "validation": {
    "target_gate_operational": true,
    "target_gate_capacity_available": true,
    "redirect_percentage_valid": true
  }
}
```

If invalid:

```json
{
  "valid": false,
  "strategy_id": "ST-001",
  "reason": "Target gate has insufficient capacity"
}
```

P2 must not override P1 validation.

---

# 5.8 Strategy Simulation

Validated strategies are passed to the deterministic simulation engine.

P1 calculates the expected result.

Example:

```json
{
  "strategy_id": "ST-001",
  "simulation_result": {
    "gate_a_utilization": 0.72,
    "gate_c_utilization": 0.61,
    "zone_density_change": -0.14,
    "risk_level": "LOW"
  }
}
```

These values originate from P1.

P2 does not invent or modify them.

---

# 5.9 Result Interpretation

P2 receives the simulation result and converts it into human-readable information.

Example:

### P1 Result

```text
Gate A utilization: 92% → 72%
Gate C utilization: 45% → 61%
Zone density: -14%
Risk level: LOW
```

### P2 Explanation

> Redirecting part of the entry flow from Gate A to Gate C reduces the load on Gate A while increasing utilization at Gate C. The simulation shows that both gates remain within their operational limits.

P2 explains the result but does not change the underlying values.

---

# 5.10 Strategy Comparison

When multiple valid strategies exist, P1 evaluates them using the configured Priority Policy.

The evaluation follows the rules defined in:

`EV-013 — Priority_Policy.md`

Example:

| Strategy           | Safety | Crowd Reduction | Experience | Cost   |
| ------------------ | ------ | --------------- | ---------- | ------ |
| Redirect Gate Flow | High   | High            | Medium     | Low    |
| Activate New Gate  | High   | High            | High       | Medium |
| Hold Incoming Flow | High   | Medium          | Low        | Low    |

The authoritative evaluation is produced by P1.

P2 presents the differences to the organizer.

P2 should explain:

* Expected effect
* Main benefit
* Main trade-off
* Constraints
* Operational implications

---

# 5.11 Recommendation Presentation

P2 presents the available strategies in a clear format.

Example:

```text
Current Situation:
Gate A is experiencing high utilization.

Option 1:
Redirect entry flow to Gate C.
Expected effect: Reduce Gate A load.
Trade-off: Gate C becomes more utilized.

Option 2:
Activate Gate D.
Expected effect: Increase available entry capacity.
Trade-off: Requires additional staff.

Option 3:
Temporarily restrict incoming flow.
Expected effect: Reduce immediate crowd growth.
Trade-off: May increase waiting time.
```

P2 should not present unsupported certainty.

Instead of:

> "You must use Option 1."

P2 should say:

> "The simulation indicates that Option 1 reduces Gate A utilization while keeping the target gate within its operational constraints."

---

# 5.12 Organizer Approval

Operational strategies requiring human authorization enter the approval state.

Example:

```text
Strategy:
Redirect entry flow from Gate A to Gate C

Expected Effect:
Reduce Gate A congestion

Approval:
[ Approve ] [ Reject ]
```

The organizer may:

* Approve
* Reject
* Request another strategy
* Modify preferences
* Ask for additional simulation
* Ask for explanation

---

# 5.13 Strategy Execution

After approval, the strategy enters execution.

Execution may involve an external operational system or manual operator action.

Example:

```text
APPROVED
   ↓
Execution Command
   ↓
Gate Flow Redistribution
   ↓
Operational System
```

P2 may issue the structured execution request.

P2 must not claim execution succeeded unless an execution result confirms it.

---

# 5.14 Post-Execution Monitoring

After execution, the system continues monitoring the event.

The system checks whether the strategy produced the expected effect.

Example:

```text
Before:
Gate A utilization = 92%

Strategy:
Redirect entry flow

After:
Gate A utilization = 70%
```

If the result differs from expectations, the workflow can be restarted.

---

# 5.15 Re-Evaluation

A strategy is not necessarily permanent.

After execution:

```text
Monitor
   ↓
Check Results
   ↓
Improved?
 ┌─┴─┐
Yes  No
 ↓    ↓
Continue  Re-analyze
          ↓
     New Strategy
```

If the situation improves:

> Continue monitoring.

If the situation remains problematic:

> Generate and evaluate another strategy.

If the situation becomes worse:

> Escalate to a higher-priority response or emergency workflow.

---

# 6. Decision State Machine

The decision workflow uses explicit states.

```text
DETECTED
    ↓
ANALYZING
    ↓
STRATEGIES_GENERATED
    ↓
VALIDATING
    ↓
SIMULATING
    ↓
INTERPRETING
    ↓
AWAITING_APPROVAL
    ↓
    ├───────────────┐
    ↓               ↓
 APPROVED        REJECTED
    ↓               ↓
 EXECUTING      RECONSIDER
    ↓               ↓
 MONITORING ←───────┘
    ↓
 COMPLETED
```

---

# 7. Decision States

## 7.1 DETECTED

A problem or request has been identified.

Example:

```text
Gate A congestion detected.
```

---

## 7.2 ANALYZING

P2 is determining:

* Situation
* Intent
* Relevant context
* Potential objectives
* Required information

---

## 7.3 STRATEGIES_GENERATED

One or more candidate mitigation strategies have been identified.

---

## 7.4 VALIDATING

Strategies are being validated by P1.

---

## 7.5 SIMULATING

Valid strategies are being evaluated by the deterministic engine.

---

## 7.6 INTERPRETING

P2 is converting simulation results into understandable explanations.

---

## 7.7 AWAITING_APPROVAL

The strategy has been evaluated and requires organizer approval.

---

## 7.8 APPROVED

The organizer has authorized execution.

---

## 7.9 REJECTED

The organizer has rejected the proposed strategy.

The system may return to strategy generation.

---

## 7.10 EXECUTING

The approved strategy is being applied through the appropriate operational mechanism.

---

## 7.11 MONITORING

The system monitors the resulting event state.

---

## 7.12 COMPLETED

The strategy achieved its intended operational outcome or the workflow has been successfully completed.

---

## 7.13 FAILED

The workflow failed because of:

* Invalid strategy
* Missing data
* Engine failure
* Execution failure
* External system failure
* Timeout
* Unexpected event conditions

---

# 8. Human-in-the-Loop Policy

EventFlow should maintain human oversight for operational decisions.

AI recommendations should not automatically become operational actions unless explicitly configured as safe and authorized automated actions.

### Approval is required when:

* A strategy affects crowd flow
* A gate is opened or closed
* A zone is restricted
* An operational resource is allocated
* Visitor movement is significantly changed
* Emergency procedures are initiated
* Safety-related actions require authorization

### Automatic processing may be allowed for:

* Information retrieval
* Status summaries
* Explanations
* Non-operational simulations
* Draft strategy generation
* Monitoring
* Alert preparation

---

# 9. AI vs Core Engine Responsibilities

| Task                          |                    P2 AI |          P1 Engine |
| ----------------------------- | -----------------------: | -----------------: |
| Understand natural language   |                      Yes |                 No |
| Identify organizer intent     |                      Yes |                 No |
| Generate candidate strategies |                      Yes |                 No |
| Structure strategy request    |                      Yes |                 No |
| Validate capacity             |                       No |                Yes |
| Validate constraints          |                       No |                Yes |
| Calculate crowd metrics       |                       No |                Yes |
| Run simulation                |                       No |                Yes |
| Calculate risk                |                       No |                Yes |
| Evaluate strategy metrics     |                       No |                Yes |
| Apply priority policy         |                  Explain |      Authoritative |
| Explain results               |                      Yes |                 No |
| Compare results for organizer |                      Yes |   Yes, numerically |
| Recommend candidate actions   |                      Yes |                 No |
| Approve action                |                       No |                 No |
| Execute approved action       | Via structured interface | Operational system |
| Monitor results               |                Interpret |            Measure |

---

# 10. Tool / Function Calling

P2 should communicate with P1 through structured tools or APIs.

Example tool definitions:

```text
get_event_state()
```

Returns the current event state.

```text
get_crowd_metrics()
```

Returns authoritative crowd metrics.

```text
validate_strategy(strategy)
```

Validates a proposed strategy.

```text
simulate_strategy(strategy)
```

Runs the deterministic simulation.

```text
compare_strategies(strategies)
```

Evaluates multiple valid strategies.

```text
get_constraints()
```

Returns relevant operational constraints.

```text
execute_strategy(strategy_id)
```

Requests execution of an approved strategy.

```text
get_execution_status(strategy_id)
```

Returns execution status.

---

# 11. Example Tool Calling Flow

Organizer:

> "The stadium is crowded near Gate A. What should we do?"

### Step 1 — P2 identifies intent

```json
{
  "intent": "mitigate_congestion",
  "location": "Gate_A"
}
```

### Step 2 — P2 requests current state

```text
get_event_state()
```

### Step 3 — P1 returns state

```json
{
  "gate_a_utilization": 0.92,
  "gate_c_utilization": 0.45,
  "zone_density": "HIGH"
}
```

### Step 4 — P2 generates candidate strategies

```text
ST-001: Redirect Gate A → Gate C
ST-002: Activate Gate D
ST-003: Temporarily hold incoming flow
```

### Step 5 — P2 validates candidates

```text
validate_strategy(ST-001)
validate_strategy(ST-002)
validate_strategy(ST-003)
```

### Step 6 — P1 simulates valid strategies

```text
simulate_strategy(ST-001)
simulate_strategy(ST-002)
simulate_strategy(ST-003)
```

### Step 7 — P2 explains results

P2 summarizes:

```text
ST-001 reduces Gate A utilization by redistributing entry flow.

ST-002 increases available entry capacity but requires additional
operational resources.

ST-003 reduces immediate crowd growth but increases waiting time.
```

### Step 8 — Organizer approves

```text
Organizer → Approve ST-001
```

### Step 9 — Execution

```text
execute_strategy(ST-001)
```

### Step 10 — Monitoring

```text
get_execution_status(ST-001)
get_crowd_metrics()
```

---

# 12. Organizer Modification Workflow

The organizer may modify the requested objective.

Example:

> "I don't want to open another gate. Show me options that don't require additional staff."

P2 converts the preference into structured constraints:

```json
{
  "constraints": {
    "additional_staff": false
  }
}
```

P1 then evaluates only strategies satisfying the constraint.

P2 must not simply assume that a strategy is feasible.

---

# 13. Clarification Workflow

If the organizer's request is ambiguous, P2 should ask for clarification.

Example:

> "Reduce the crowd near the east side."

P2 may need to ask:

> "Do you want to reduce crowd density by redirecting incoming attendees, restricting the zone, or changing exit flow?"

P2 should not make an important operational assumption when required information is missing.

---

# 14. Context Management

P2 should maintain relevant conversational context.

Example:

### Organizer

> "Gate A is crowded."

### Organizer

> "What about Gate C?"

The second question should be interpreted in relation to the first request.

P2 may understand this as:

> "Evaluate whether Gate C can be used as an alternative to Gate A."

Relevant context may include:

* Current problem
* Current location
* Previously discussed strategy
* Organizer preferences
* Previous simulation results
* Current event state
* Current decision state

---

# 15. Context Safety

Conversation context must not override authoritative system state.

For example, if an earlier conversation states:

```text
Gate C is available.
```

but the current P1 state says:

```text
Gate C is closed.
```

P2 must use the current authoritative P1 state.

Therefore:

> **Current deterministic state > conversational memory**

---

# 16. Failure Handling

## 16.1 Missing Data

If required data is unavailable:

```text
Strategy cannot be evaluated because current Gate C capacity
information is unavailable.
```

P2 should ask for or retrieve the required information.

---

## 16.2 Invalid Strategy

If P1 rejects a strategy:

```text
Strategy rejected:
Target gate does not have sufficient capacity.
```

P2 may generate an alternative.

---

## 16.3 Simulation Failure

If simulation fails:

```text
The strategy could not be simulated because the simulation
engine returned an error.
```

P2 must not fabricate results.

---

## 16.4 Execution Failure

If execution fails:

```text
The approved strategy was not successfully executed.
The system has returned to monitoring/re-evaluation.
```

---

## 16.5 Timeout

If a tool does not respond within the expected time:

```text
P2 → Retry / fallback / notify organizer
```

No fabricated result should be generated.

---

# 17. Emergency Handling

Emergency conditions may require a separate high-priority workflow.

Example:

```text
Emergency detected
       ↓
Safety constraint evaluation
       ↓
Emergency response strategy
       ↓
Required authorization
       ↓
Execution
       ↓
Continuous monitoring
```

Safety-related emergency conditions must not be downgraded because of:

* Cost
* Visitor experience
* Convenience
* Organizer preference

Mandatory safety constraints take precedence.

---

# 18. Auditability

Every significant decision should generate an auditable record.

The record should include:

```json
{
  "decision_id": "DEC-001",
  "timestamp": "2026-09-20T18:30:00Z",
  "trigger": "gate_congestion",
  "context": {},
  "strategies_considered": [],
  "validation_results": [],
  "simulation_results": [],
  "selected_strategy": "ST-001",
  "approval_status": "approved",
  "execution_status": "completed"
}
```

The system should retain:

* Decision ID
* Event ID
* Trigger
* Input state
* Strategy IDs
* Strategy parameters
* Validation results
* Simulation results
* Policy version
* Approval status
* Execution status
* Timestamps
* Relevant AI interaction metadata

---

# 19. Example Scenario — Crowd Congestion

## Situation

Gate A utilization becomes high.

## Workflow

```text
Detection
   ↓
Gate A congestion identified
   ↓
P2 analyzes situation
   ↓
P2 identifies candidate strategies
   ↓
P1 validates strategies
   ↓
P1 simulates valid strategies
   ↓
P2 explains results
   ↓
Organizer reviews options
   ↓
Organizer approves one strategy
   ↓
Strategy executed
   ↓
Crowd monitored
   ↓
Situation improves
   ↓
Decision completed
```

---

# 20. Example Scenario — Weather + Crowd

Organizer:

> "Heavy rain is expected and the stadium is already getting crowded. What should we do?"

P2 identifies:

```text
Environmental condition:
Heavy rain

Operational condition:
High crowd density

Objective:
Maintain safe crowd flow
```

P2 may request relevant information from P1:

```text
get_event_state()
get_crowd_metrics()
get_weather_impact()
```

P2 then proposes relevant strategies.

P1 validates and simulates them.

P2 explains:

```text
The simulation indicates that redirecting attendees away from
the affected zone reduces density while maintaining available
capacity in the alternative zone.
```

The organizer then decides whether to approve the action.

---

# 21. Example Scenario — Strategy Rejection

Suppose P2 proposes:

```text
Redirect Gate A → Gate C
```

P1 returns:

```json
{
  "valid": false,
  "reason": "Gate C capacity constraint exceeded"
}
```

P2 responds:

> "Gate C cannot currently accept the proposed additional flow because its available capacity is insufficient. I can evaluate another gate or a different mitigation strategy."

P2 then generates alternatives.

---

# 22. Guardrails

P2 must follow these rules:

### Rule 1 — No invented numerical results

P2 must never fabricate:

* Capacity
* Density
* Risk scores
* Utilization
* Simulation results
* Cost values

---

### Rule 2 — No bypassing P1

P2 must not independently override deterministic validation.

---

### Rule 3 — No unauthorized execution

P2 must not execute operational strategies without the required approval.

---

### Rule 4 — No hidden assumptions

If a required value is missing, P2 should request it or call the appropriate tool.

---

### Rule 5 — Current state is authoritative

Current P1 state overrides outdated conversational information.

---

### Rule 6 — Safety constraints cannot be ignored

AI cannot recommend bypassing mandatory safety constraints.

---

### Rule 7 — Explain uncertainty

If simulation results are unavailable or incomplete, P2 should clearly communicate the limitation.

---

# 23. MVP Implementation

The MVP should implement:

### Required

* Natural-language organizer input
* Intent detection
* Structured command generation
* Strategy generation
* Strategy validation request
* Simulation request
* Result interpretation
* Organizer approval
* Strategy execution interface
* Monitoring
* Error handling
* Audit logging

### Example MVP flow

```text
User Message
     ↓
LLM Intent Parser
     ↓
Structured Request
     ↓
P1 Tool Call
     ↓
P1 Result
     ↓
LLM Interpretation
     ↓
Strategy Recommendation
     ↓
Organizer Approval
     ↓
Execution
```

---

# 24. Future Extensions

Future versions may include:

* Automatic strategy triggering
* Reinforcement learning
* Historical strategy effectiveness
* Predictive crowd behavior
* Long-term strategy optimization
* Multi-event learning
* Adaptive priority policies
* Advanced forecasting
* Automated emergency escalation
* Human feedback learning
* Strategy performance analytics

These are outside the MVP decision workflow unless explicitly required.

---

# 25. Success Criteria

The workflow is successful if:

* Every decision follows a defined lifecycle.
* AI can convert natural-language requests into structured actions.
* Strategies are validated before simulation.
* Numerical calculations remain deterministic.
* Invalid strategies are rejected safely.
* Simulation results are not fabricated.
* Organizers can review and approve actions.
* Approved strategies can be executed through a defined interface.
* The system monitors post-execution results.
* Failed decisions can be re-evaluated.
* Important decisions are auditable.
* Safety constraints remain authoritative.

---

# 26. Key Principle

> **EventFlow follows a controlled decision lifecycle where P2 understands the situation, generates and explains candidate strategies, P1 validates and simulates those strategies deterministically, and the organizer approves operational actions before execution.**

The complete workflow is:

```text
DETECT
  ↓
ANALYZE
  ↓
GENERATE
  ↓
STRUCTURE
  ↓
VALIDATE
  ↓
SIMULATE
  ↓
INTERPRET
  ↓
APPROVE
  ↓
EXECUTE
  ↓
MONITOR
  ↓
RE-EVALUATE
```

**P2 provides intelligence and interaction.
P1 provides deterministic truth.
The organizer remains in control of operational decisions.**
