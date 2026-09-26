**Document Name:** `Strategy_Catalog.md`
**Owner:** P2 — AI / Strategy Intelligence
**Priority:** SHOULD
**Scope:** MVP
**Version:** 1.0

---

# 1. Purpose

This document defines the concrete mitigation strategies supported by EventFlow for the MVP.

The Strategy Catalog provides a controlled set of operational strategies that can be:

* Suggested by P2
* Structured by P2
* Validated by P1
* Simulated by P1
* Explained by P2
* Approved by the organizer
* Executed through the appropriate operational interface

The catalog prevents the AI from inventing unsupported operational actions.

The core principle is:

> **P2 may select and explain strategies from the catalog, while P1 determines whether those strategies are valid and what their actual effects are.**

---

# 2. Scope

The MVP catalog focuses on common event-management problems involving:

* Crowd congestion
* Gate utilization
* Crowd redistribution
* Flow control
* Zone restrictions
* Route changes
* Emergency movement
* Resource activation

The catalog does not define:

* Crowd simulation mathematics
* Capacity formulas
* Risk calculation formulas
* Routing algorithms
* Detailed execution mechanisms

Those responsibilities belong to P1 and the relevant operational systems.

---

# 3. Strategy Architecture

Every strategy follows the structure defined in:

`EV-012 — Strategy_Model.md`

A strategy contains:

```text
Strategy Identity
       ↓
Objective
       ↓
Trigger
       ↓
Actions
       ↓
Parameters
       ↓
Constraints
       ↓
Required Inputs
       ↓
Expected Effects
       ↓
Approval Requirement
```

---

# 4. Strategy Categories

The MVP catalog contains the following categories:

| Category            | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| Gate Management     | Redistribute entry/exit flow                     |
| Flow Control        | Control incoming or outgoing movement            |
| Zone Management     | Reduce pressure in specific zones                |
| Route Management    | Redirect movement                                |
| Capacity Management | Activate available operational capacity          |
| Emergency Response  | Support safe movement during critical conditions |

---

# 5. Strategy Catalog Summary

| ID     | Strategy                     | Primary Objective                       |
| ------ | ---------------------------- | --------------------------------------- |
| ST-001 | Gate Flow Redistribution     | Reduce gate congestion                  |
| ST-002 | Alternative Gate Activation  | Increase available gate capacity        |
| ST-003 | Temporary Entry Flow Control | Reduce incoming crowd growth            |
| ST-004 | Exit Flow Redistribution     | Reduce exit congestion                  |
| ST-005 | Zone Access Restriction      | Reduce pressure in a high-risk zone     |
| ST-006 | Crowd Route Diversion        | Redirect movement away from bottlenecks |
| ST-007 | Staff / Resource Activation  | Increase operational handling capacity  |
| ST-008 | Controlled Zone Reopening    | Restore access after conditions improve |

---

# 6. ST-001 — Gate Flow Redistribution

## 6.1 Description

Redirect a portion of attendee flow from a congested gate toward another operational gate.

Example:

```text
Gate A → Gate C
```

This strategy is useful when one gate is highly utilized while another gate has available operational capacity.

---

## 6.2 Objective

Primary objective:

> Reduce congestion at the source gate.

Secondary objectives:

* Redistribute crowd flow
* Reduce queue buildup
* Improve gate utilization balance

---

## 6.3 Trigger Conditions

Possible triggers:

```text
Gate utilization exceeds configured threshold
```

```text
Queue length exceeds threshold
```

```text
Bottleneck detected
```

```text
Organizer requests gate redistribution
```

---

## 6.4 Actions

```text
redirect_entry_flow
```

or

```text
redirect_exit_flow
```

depending on the strategy configuration.

---

## 6.5 Parameters

Example:

```json id="9n8y1k"
{
  "source_gate": "Gate_A",
  "target_gate": "Gate_C",
  "redirect_percentage": 20,
  "duration_minutes": 15
}
```

---

## 6.6 Constraints

P1 must validate:

* Source gate exists
* Target gate exists
* Target gate is operational
* Target gate has sufficient capacity
* Redirect percentage is within allowed limits
* Route between relevant areas is feasible
* Safety constraints are satisfied

---

## 6.7 Expected Effects

Possible effects:

* Reduced source gate utilization
* Increased target gate utilization
* Reduced queue pressure
* More balanced crowd distribution

Actual values must come from P1 simulation.

---

## 6.8 Approval

**Required:** Yes

---

# 7. ST-002 — Alternative Gate Activation

## 7.1 Description

Activate an available gate to increase operational entry or exit capacity.

Example:

```text
Gate D
```

is activated when existing gates become overloaded.

---

## 7.2 Objective

* Increase available operational capacity
* Reduce congestion
* Distribute attendee flow

---

## 7.3 Trigger Conditions

Examples:

```text
Multiple gates approaching capacity
```

```text
Queue growth exceeds threshold
```

```text
High crowd density near entry area
```

---

## 7.4 Actions

```text
activate_gate
```

---

## 7.5 Parameters

```json id="n5cvq6"
{
  "gate_id": "Gate_D",
  "activation_duration_minutes": 30
}
```

Optional parameters:

```text
required_staff
opening_time
operational_mode
```

---

## 7.6 Constraints

P1 must validate:

* Gate exists
* Gate is physically available
* Gate is not restricted
* Required resources are available
* Staff requirements are satisfied
* Activation does not violate safety constraints

---

## 7.7 Expected Effects

Potential effects:

* Increased available gate capacity
* Reduced pressure on existing gates
* Improved flow distribution

---

## 7.8 Trade-offs

Potential trade-offs:

* Additional staff requirement
* Operational cost
* Setup time
* Additional infrastructure requirements

---

## 7.9 Approval

**Required:** Yes

---

# 8. ST-003 — Temporary Entry Flow Control

## 8.1 Description

Temporarily reduce or control incoming attendee flow to prevent further crowd accumulation.

This strategy is useful when the current crowd is approaching a dangerous or operationally difficult state.

---

## 8.2 Objective

Primary objective:

> Reduce immediate crowd growth.

---

## 8.3 Trigger Conditions

Examples:

```text
Crowd density approaching operational limit
```

```text
Available capacity decreasing rapidly
```

```text
Entry flow exceeds processing capacity
```

---

## 8.4 Actions

```text
control_entry_flow
```

---

## 8.5 Parameters

```json id="4s4g8e"
{
  "gate_id": "Gate_A",
  "flow_control_level": "moderate",
  "duration_minutes": 10
}
```

Possible control levels:

```text
LOW
MODERATE
HIGH
FULL_HOLD
```

Exact meanings must be defined by P1 configuration.

---

## 8.6 Constraints

P1 must validate:

* Control level is allowed
* Duration is valid
* Emergency access is maintained
* Crowd conditions support the action
* Operational policy permits the restriction

---

## 8.7 Expected Effects

Potential effects:

* Reduced incoming flow
* Slower crowd growth
* Reduced pressure on congested zones

---

## 8.8 Trade-offs

Possible disadvantages:

* Increased waiting time
* Queue accumulation outside the controlled area
* Visitor experience impact

---

## 8.9 Approval

**Required:** Yes

---

# 9. ST-004 — Exit Flow Redistribution

## 9.1 Description

Redistribute outgoing attendee flow across multiple exits.

Example:

```text
Exit A → Exit B + Exit C
```

---

## 9.2 Objective

* Reduce exit congestion
* Balance outgoing flow
* Prevent bottlenecks near exits

---

## 9.3 Trigger Conditions

Examples:

```text
Exit utilization exceeds threshold
```

```text
Exit queue length increases
```

```text
Bottleneck detected near stadium exit
```

---

## 9.4 Actions

```text
redirect_exit_flow
```

---

## 9.5 Parameters

```json id="k2k25e"
{
  "source_exit": "Exit_A",
  "target_exit": "Exit_B",
  "redirect_percentage": 25
}
```

---

## 9.6 Constraints

P1 validates:

* Exit exists
* Target exit is operational
* Target exit has available capacity
* Route is accessible
* Emergency access remains available

---

## 9.7 Expected Effects

Potential effects:

* Lower source exit utilization
* Better exit distribution
* Reduced queue buildup

---

## 9.8 Approval

**Required:** Yes

---

# 10. ST-005 — Zone Access Restriction

## 10.1 Description

Temporarily restrict access to a zone experiencing excessive crowd density or elevated operational risk.

Example:

```text
Zone B → Restricted
```

---

## 10.2 Objective

* Reduce crowd density
* Prevent additional attendees from entering an affected zone
* Protect restricted or high-risk areas

---

## 10.3 Trigger Conditions

Examples:

```text
Zone density exceeds threshold
```

```text
Risk level becomes HIGH
```

```text
Operational restriction is active
```

---

## 10.4 Actions

```text
restrict_zone_access
```

---

## 10.5 Parameters

```json id="a9t5ec"
{
  "zone_id": "Zone_B",
  "restriction_level": "partial",
  "duration_minutes": 20
}
```

Possible levels:

```text
PARTIAL
FULL
```

---

## 10.6 Constraints

P1 validates:

* Zone exists
* Restriction is permitted
* Alternative routes are available where required
* Emergency access remains available
* Restriction does not create a secondary unsafe condition

---

## 10.7 Expected Effects

Potential effects:

* Reduced incoming flow into affected zone
* Lower zone density
* Reduced risk exposure

---

## 10.8 Trade-offs

Possible effects:

* Increased pressure in nearby zones
* Longer walking distance
* Reduced visitor accessibility

These effects must be evaluated by P1.

---

## 10.9 Approval

**Required:** Yes

---

# 11. ST-006 — Crowd Route Diversion

## 11.1 Description

Redirect attendee movement from a congested or affected route toward an alternative route.

Example:

```text
Route R1 → Route R2
```

---

## 11.2 Objective

* Avoid bottlenecks
* Redistribute crowd movement
* Reduce congestion in affected areas

---

## 11.3 Trigger Conditions

Examples:

```text
Route congestion detected
```

```text
Route becomes unavailable
```

```text
Zone risk increases
```

```text
Organizer requests alternative movement path
```

---

## 11.4 Actions

```text
redirect_route
```

---

## 11.5 Parameters

```json id="o4lq9s"
{
  "source_route": "Route_R1",
  "target_route": "Route_R2",
  "affected_zone": "Zone_B"
}
```

---

## 11.6 Constraints

P1 validates:

* Target route exists
* Target route is operational
* Target route has sufficient capacity
* Route does not cross restricted zones
* Emergency routes remain accessible
* New route does not create a larger bottleneck

---

## 11.7 Expected Effects

Potential effects:

* Reduced pressure on source route
* Increased utilization of alternative route
* Improved crowd distribution

---

## 11.8 Approval

**Required:** Yes

---

# 12. ST-007 — Staff / Resource Activation

## 12.1 Description

Activate additional operational resources to improve crowd handling.

Examples:

* Additional staff
* Crowd-control personnel
* Temporary checkpoints
* Operational teams

---

## 12.2 Objective

* Increase operational handling capability
* Improve crowd movement
* Support other mitigation strategies

---

## 12.3 Trigger Conditions

Examples:

```text
High congestion
```

```text
Multiple bottlenecks
```

```text
Existing staff capacity insufficient
```

---

## 12.4 Actions

```text
activate_resource
```

---

## 12.5 Parameters

```json id="1czmgl"
{
  "resource_type": "crowd_staff",
  "quantity": 5,
  "duration_minutes": 30
}
```

---

## 12.6 Constraints

P1 validates:

* Resource exists
* Resource is available
* Quantity is within allowed limits
* Activation does not exceed operational budget/resource constraints

---

## 12.7 Expected Effects

Potential effects:

* Increased operational capacity
* Improved flow management
* Reduced bottleneck severity

---

## 12.8 Trade-offs

Potential trade-offs:

* Increased cost
* Resource availability
* Coordination overhead

---

## 12.9 Approval

**Required:** Yes

---

# 13. ST-008 — Controlled Zone Reopening

## 13.1 Description

Restore access to a previously restricted zone after the conditions that caused the restriction have improved.

This strategy prevents unnecessary long-term restrictions.

---

## 13.2 Objective

* Restore normal movement
* Reduce unnecessary restrictions
* Improve visitor experience
* Return event operations to normal

---

## 13.3 Trigger Conditions

Examples:

```text
Zone density returns below threshold
```

```text
Risk condition clears
```

```text
Operational restriction no longer required
```

---

## 13.4 Actions

```text
reopen_zone
```

---

## 13.5 Parameters

```json id="7tw2os"
{
  "zone_id": "Zone_B",
  "reopen_mode": "controlled"
}
```

Possible modes:

```text
CONTROLLED
FULL
```

---

## 13.6 Constraints

P1 validates:

* Zone conditions are safe
* No active restriction requires continued closure
* Alternative routes are not negatively affected
* Reopening will not create a new bottleneck

---

## 13.7 Expected Effects

Potential effects:

* Increased available movement area
* Reduced pressure on adjacent zones
* Improved visitor experience

---

## 13.8 Approval

**Required:** Yes

---

# 14. Strategy Parameter Standards

Parameters should follow consistent naming.

Recommended standards:

| Parameter             | Meaning                    |
| --------------------- | -------------------------- |
| `source_gate`         | Origin gate                |
| `target_gate`         | Destination gate           |
| `source_exit`         | Origin exit                |
| `target_exit`         | Destination exit           |
| `zone_id`             | Affected zone              |
| `route_id`            | Route identifier           |
| `redirect_percentage` | Portion of flow redirected |
| `duration_minutes`    | Strategy duration          |
| `restriction_level`   | Restriction severity       |
| `flow_control_level`  | Entry/exit control level   |
| `resource_type`       | Operational resource       |
| `quantity`            | Resource quantity          |

---

# 15. Strategy ID Convention

Strategy IDs follow:

```text
ST-XXX
```

Examples:

```text
ST-001
ST-002
ST-003
```

IDs must remain stable once published.

Changing the behavior of an existing strategy should require a version update.

Example:

```text
ST-001 v1.0
ST-001 v1.1
ST-001 v2.0
```

---

# 16. Strategy Versioning

Each strategy should contain:

```json id="l7is3h"
{
  "strategy_id": "ST-001",
  "version": "1.0"
}
```

Version changes should occur when:

* Parameters change
* Constraints change
* Actions change
* Expected behavior changes

Strategy versions should be auditable.

---

# 17. Strategy Selection Rules

P2 may select candidate strategies based on:

* Detected problem
* Organizer request
* Available strategy catalog
* Current event state
* Organizer preferences

P2 should not select strategies that are clearly incompatible with the current situation.

Example:

If the organizer asks:

> "Reduce congestion at Gate A."

P2 should prioritize gate/flow strategies rather than unrelated zone reopening strategies.

---

# 18. Strategy Validation

Every strategy must pass P1 validation before simulation.

```text id="s7x3s5"
Candidate Strategy
       ↓
Schema Validation
       ↓
P1 Constraint Validation
       ↓
 ┌─────┴─────┐
 ↓           ↓
VALID       INVALID
 ↓           ↓
SIMULATE    REJECT
```

---

# 19. Strategy Simulation

After validation:

```text id="v7iklm"
Validated Strategy
       ↓
P1 Simulation
       ↓
Simulation Result
       ↓
P2 Explanation
```

The simulation result may contain:

* Utilization changes
* Density changes
* Flow changes
* Risk changes
* Cost changes
* Experience-related metrics
* Constraint status

---

# 20. Strategy Comparison

Multiple strategies may be simulated for the same problem.

Example:

```text id="w4qv4u"
Problem:
Gate A congestion

Candidates:

ST-001 → Redirect Gate Flow
ST-002 → Activate Gate D
ST-003 → Control Entry Flow
```

P1 evaluates each candidate.

P2 presents the resulting differences.

---

# 21. Strategy Selection and Priority Policy

Strategy comparison follows:

`EV-013 — Priority_Policy.md`

The system prioritizes:

```text
Safety
   ↓
Crowd Reduction
   ↓
Visitor Experience
   ↓
Cost
```

The exact evaluation remains deterministic.

P2 should explain the resulting trade-offs.

---

# 22. Strategy Combination

Some strategies may be combined.

Example:

```text id="kz8pkl"
ST-001
Gate Flow Redistribution

+

ST-007
Staff Activation
```

Combined execution should only be permitted if P1 confirms that:

* Both strategies are compatible.
* Combined constraints are satisfied.
* Resources are available.
* The combined simulation is valid.

P2 should not assume that two individually valid strategies are automatically valid together.

---

# 23. Strategy Conflict Examples

Potential conflicts include:

```text
ST-005 Zone Restriction
+
ST-006 Route Diversion
```

If the diversion route passes through the restricted zone, the combination is invalid.

Another example:

```text
ST-002 Gate Activation
+
ST-007 Staff Activation
```

This may be valid if the additional staff are required to operate the activated gate.

P1 determines the final validity.

---

# 24. Emergency Strategy Handling

Emergency situations may require strategies to be evaluated under higher-priority safety constraints.

Example:

```text
Emergency
   ↓
Zone Restriction
   ↓
Route Diversion
   ↓
Crowd Redistribution
   ↓
Continuous Monitoring
```

Safety requirements take precedence over:

* Cost
* Convenience
* Visitor experience

---

# 25. Strategy Lifecycle

Every strategy follows:

```text id="r4qv3g"
IDENTIFIED
    ↓
STRUCTURED
    ↓
VALIDATED
    ↓
SIMULATED
    ↓
PRESENTED
    ↓
APPROVED
    ↓
EXECUTED
    ↓
MONITORED
    ↓
COMPLETED
```

Possible failure states:

```text
INVALID
SIMULATION_FAILED
REJECTED
EXECUTION_FAILED
```

---

# 26. AI Strategy Guardrails

P2 must:

* Use only catalog-supported strategy types.
* Use valid strategy IDs.
* Produce structured parameters.
* Avoid inventing unsupported actions.
* Send strategies to P1 for validation.
* Never bypass constraints.
* Never claim a strategy is safe without authoritative validation.
* Never claim execution without execution confirmation.

---

# 27. Example Strategy Object

A complete strategy object may look like:

```json id="c6q7r4"
{
  "strategy_id": "ST-001",
  "version": "1.0",
  "name": "Gate Flow Redistribution",
  "category": "gate_management",
  "objective": "Reduce congestion at an overloaded gate",
  "trigger": {
    "condition": "gate_congestion"
  },
  "actions": [
    {
      "type": "redirect_entry_flow",
      "source": "Gate_A",
      "target": "Gate_C"
    }
  ],
  "parameters": {
    "redirect_percentage": 20,
    "duration_minutes": 15
  },
  "constraints": [
    "target_gate_operational",
    "target_gate_has_capacity",
    "redirect_percentage_within_limit"
  ],
  "expected_effects": [
    "reduce_source_gate_utilization",
    "redistribute_entry_flow",
    "reduce_congestion"
  ],
  "approval_required": true
}
```

---

# 28. Example Catalog Representation

The complete catalog may be represented as:

```json id="8mq5d4"
{
  "strategies": [
    {
      "strategy_id": "ST-001",
      "name": "Gate Flow Redistribution",
      "category": "gate_management"
    },
    {
      "strategy_id": "ST-002",
      "name": "Alternative Gate Activation",
      "category": "capacity_management"
    },
    {
      "strategy_id": "ST-003",
      "name": "Temporary Entry Flow Control",
      "category": "flow_control"
    },
    {
      "strategy_id": "ST-004",
      "name": "Exit Flow Redistribution",
      "category": "gate_management"
    },
    {
      "strategy_id": "ST-005",
      "name": "Zone Access Restriction",
      "category": "zone_management"
    },
    {
      "strategy_id": "ST-006",
      "name": "Crowd Route Diversion",
      "category": "route_management"
    },
    {
      "strategy_id": "ST-007",
      "name": "Staff / Resource Activation",
      "category": "resource_management"
    },
    {
      "strategy_id": "ST-008",
      "name": "Controlled Zone Reopening",
      "category": "zone_management"
    }
  ]
}
```

---

# 29. MVP Priority

The following strategies are recommended as the initial MVP set:

### Tier 1 — Core

```text
ST-001 Gate Flow Redistribution
ST-002 Alternative Gate Activation
ST-003 Temporary Entry Flow Control
ST-005 Zone Access Restriction
ST-006 Crowd Route Diversion
```

### Tier 2 — Supporting

```text
ST-004 Exit Flow Redistribution
ST-007 Staff / Resource Activation
ST-008 Controlled Zone Reopening
```

The catalog can be reduced further if the MVP implementation needs to remain small.

---

# 30. Example End-to-End Use Case

## Problem

P1 detects:

```text
Gate A utilization = HIGH
```

P2 receives the event state.

### P2 generates:

```text
ST-001
Redirect Gate A → Gate C

ST-002
Activate Gate D

ST-003
Control incoming flow
```

### P1 validates:

```text
ST-001 → VALID
ST-002 → VALID
ST-003 → VALID
```

### P1 simulates:

```text
ST-001 → Simulation Result A
ST-002 → Simulation Result B
ST-003 → Simulation Result C
```

### P2 explains:

```text
ST-001:
Redistributes incoming flow.

ST-002:
Creates additional gate capacity but requires resources.

ST-003:
Reduces immediate incoming flow but may increase waiting time.
```

### Organizer:

```text
Approve ST-001
```

### System:

```text
Execute ST-001
↓
Monitor
↓
Re-evaluate
```

---

# 31. Unsupported Strategy Handling

If an organizer asks for an unsupported strategy:

> "Close half the stadium and move everyone to the VIP area."

P2 should not invent a new operational command.

Instead:

> "That action is not currently supported by the MVP strategy catalog. I can evaluate the available crowd redistribution and zone-management strategies."

---

# 32. Strategy Catalog Extension

New strategies should be added through a controlled process.

Required information:

```text
Strategy ID
Strategy Name
Category
Objective
Trigger
Action
Parameters
Constraints
Required Inputs
Expected Effects
Approval Requirement
Version
```

New strategies must be tested against:

* P1 validation
* P1 simulation
* P2 tool calling
* Safety constraints
* Priority policy
* Execution interface

---

# 33. Testing Requirements

Each strategy should have tests for:

### Valid Parameters

```text
Valid gate
Valid route
Valid zone
Valid percentage
Valid duration
```

### Invalid Parameters

```text
Unknown gate
Closed gate
Invalid route
Excessive percentage
Invalid duration
Unavailable resource
```

### Constraint Tests

```text
Insufficient capacity
Restricted zone
Emergency route conflict
Resource limitation
```

### Simulation Tests

Verify that P1 returns deterministic results for identical inputs.

---

# 34. AI Testing

P2 should be tested to ensure it selects appropriate strategies.

Example:

### Input

> "Gate A is overcrowded."

Expected candidate categories:

```text
Gate Management
Flow Control
Capacity Management
```

### Input

> "Zone B is unsafe and needs to be cleared."

Expected candidate categories:

```text
Zone Management
Route Management
Emergency Response
```

### Input

> "Open something else because Gate A is crowded."

P2 should ask for clarification or inspect available gates rather than randomly selecting one.

---

# 35. Audit Requirements

Every strategy interaction should record:

```text
Strategy ID
Strategy Version
Trigger
Parameters
P1 Validation Result
Simulation Result
Policy Version
Organizer Approval
Execution Result
Timestamp
```

This allows the system to reconstruct why a strategy was considered and what happened after execution.

---

# 36. Security Requirements

The catalog must be treated as controlled configuration.

P2 should not be allowed to:

* Create arbitrary executable commands
* Modify strategy constraints
* Modify safety rules
* Modify strategy permissions
* Bypass approval requirements

Strategy definitions should be loaded from trusted configuration.

---

# 37. Future Strategies

Potential future strategies include:

```text
Dynamic Gate Balancing
Predictive Crowd Redistribution
Event Entry Scheduling
Transport Flow Coordination
Parking Flow Redistribution
Emergency Evacuation Optimization
Weather-Based Zone Management
Public Announcement Strategy
Dynamic Staff Allocation
```

These should only be added after their operational behavior can be validated and simulated.

---

# 38. Success Criteria

The Strategy Catalog is successful if:

* P2 has a controlled set of supported strategies.
* Every strategy has a unique identifier.
* Every strategy has defined parameters.
* Every strategy has explicit constraints.
* P1 can validate each strategy.
* P1 can simulate each supported strategy.
* P2 can explain strategy behavior.
* Unsupported actions are rejected.
* Strategies can be audited.
* Strategies can be versioned.
* Strategy combinations are validated before execution.

---

# 39. Key Principle

> **The Strategy Catalog provides EventFlow with a controlled vocabulary of operational mitigation actions. P2 selects, structures, and explains these strategies, while P1 validates, simulates, and determines their actual operational effects.**

In short:

```text
PROBLEM
   ↓
P2 SELECTS STRATEGY
   ↓
STRUCTURED STRATEGY
   ↓
P1 VALIDATES
   ↓
P1 SIMULATES
   ↓
P2 EXPLAINS
   ↓
ORGANIZER APPROVES
   ↓
EXECUTE
   ↓
MONITOR
```

**The AI should never invent an operational action outside this catalog unless the system explicitly supports dynamic strategy creation and validation.**
