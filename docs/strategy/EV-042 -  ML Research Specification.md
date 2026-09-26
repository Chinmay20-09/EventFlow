**Document Name:** `ML_Research_Specification.md`
**Owner:** P2 — AI / Strategy Intelligence
**Priority:** WON'T
**Release:** MVP / Deferred
**Version:** 1.0
**Status:** Deferred for MVP

---

## 1. Purpose

This document defines the scope, boundaries, and future direction of Machine Learning (ML) research within the EventFlow system.

The primary purpose is to establish that **custom ML research is not required for the MVP**.

The MVP should use:

* Deterministic simulation and calculation from P1
* Rule-based validation and constraints
* LLM-based natural-language interaction
* Structured tool/function calling
* Strategy catalog and priority policy
* Guardrails and validation

ML research may be introduced in future versions only when a clearly defined problem cannot be adequately addressed using the existing deterministic and LLM-based architecture.

---

## 2. Scope

This document covers:

1. ML research boundaries
2. MVP ML decision
3. Difference between LLM and traditional ML
4. Deferred ML use cases
5. Conditions for introducing ML
6. Possible future ML applications
7. ML input and output requirements
8. Evaluation requirements
9. Safety and reliability considerations
10. Integration with the deterministic engine
11. Research approval criteria
12. Future implementation roadmap

This document does **not** define a production ML model for the MVP.

---

## 3. Architectural Principle

EventFlow follows a clear separation between:

> **AI Intelligence → Deterministic Simulation → Operational Decision**

The P2 intelligence layer may use an LLM to understand organizer requests and communicate with the deterministic engine.

The P1 engine remains the authoritative source for:

* Capacity calculations
* Crowd metrics
* Risk calculations
* Constraint validation
* Simulation
* Strategy evaluation
* Numerical results

ML must not replace the deterministic engine when deterministic calculations are required.

### Core Principle

> **ML may enhance prediction or learning in future versions, but it must not replace authoritative deterministic calculations or safety constraints.**

---

# 4. MVP Decision: No Custom ML Required

For the MVP, EventFlow will **not develop or train a custom Machine Learning model**.

The MVP can achieve its required functionality through:

```text
Organizer
    ↓
Natural Language
    ↓
P2 LLM
    ↓
Intent + Structured Request
    ↓
P1 Deterministic Engine
    ↓
Simulation / Validation
    ↓
P2 Result Interpretation
    ↓
Organizer
```

The system therefore does not require:

* Custom neural networks
* Crowd prediction models
* Reinforcement learning
* Custom classification models
* Custom optimization models
* Training datasets
* Model training pipelines
* GPU-based model training
* ML model deployment infrastructure

for the initial MVP.

---

# 5. Why ML Is Deferred

Introducing ML during the MVP would add significant complexity without being necessary for the core system.

Potential additional requirements would include:

* Historical event datasets
* Data cleaning
* Feature engineering
* Model selection
* Training infrastructure
* Model validation
* Model monitoring
* Dataset versioning
* Model versioning
* Drift detection
* Explainability
* Retraining pipelines

The MVP does not currently require these capabilities.

The deterministic engine already provides reliable simulation for known event conditions, while the LLM provides natural-language understanding and explanation.

Therefore:

> **ML should only be introduced when there is a measurable problem that ML can solve better than deterministic rules or existing AI capabilities.**

---

# 6. LLM vs Traditional ML

EventFlow uses the term "AI" broadly, but LLM-based intelligence and traditional ML have different responsibilities.

| Capability                       | LLM / P2            | Traditional ML | P1 Engine                         |
| -------------------------------- | ------------------- | -------------- | --------------------------------- |
| Understand natural language      | Yes                 | No             | No                                |
| Extract user intent              | Yes                 | Possible       | No                                |
| Generate structured requests     | Yes                 | Possible       | No                                |
| Explain simulation results       | Yes                 | No             | No                                |
| Generate candidate strategies    | Yes                 | Possible       | No                                |
| Calculate capacity               | No                  | No             | Yes                               |
| Validate constraints             | No                  | No             | Yes                               |
| Run deterministic simulation     | No                  | No             | Yes                               |
| Predict future crowd behavior    | Possible future use | Yes            | Possible deterministic simulation |
| Learn from historical events     | No                  | Yes            | No                                |
| Authoritative safety calculation | No                  | No             | Yes                               |

The important distinction is:

> **LLM = language and reasoning interface.**
> **ML = learned prediction or pattern detection.**
> **P1 = deterministic operational truth.**

---

# 7. Deferred ML Use Cases

The following ML capabilities are potential future research areas.

## 7.1 Crowd Density Prediction

A future model could predict crowd density for a future time period.

### Example

Historical and real-time data:

```text
Current density
+
Entry rate
+
Exit rate
+
Time
+
Event schedule
+
Gate utilization
```

could be used to predict:

```text
Expected density after 10 minutes
```

This could allow EventFlow to identify potential congestion before it becomes critical.

---

## 7.2 Crowd Flow Prediction

ML could potentially predict movement between zones.

Example:

```text
Gate A
   ↓
Zone 1
   ↓
Zone 2
```

The model could estimate how many attendees are likely to move between zones during a given period.

This could assist with proactive strategy selection.

---

## 7.3 Bottleneck Prediction

Instead of detecting an already overloaded location, ML could predict:

> "Zone B is likely to become a bottleneck within the next 10 minutes."

The prediction could be based on:

* Current occupancy
* Incoming flow
* Historical patterns
* Event schedule
* Gate activity
* Zone connectivity
* Time of day

The deterministic engine would still validate the resulting operational state.

---

## 7.4 Anomaly Detection

ML could identify unusual crowd behavior.

Examples:

* Unexpectedly high movement in one direction
* Sudden reduction in exit flow
* Abnormal gate usage
* Unexpected zone accumulation
* Unusual movement patterns

The ML model would act as an early-warning mechanism rather than an authoritative safety decision maker.

---

## 7.5 Strategy Effect Prediction

Future ML research could estimate the likely effectiveness of a strategy before running a full simulation.

Example:

```text
Strategy:
Redirect 20% of Gate A traffic to Gate C
```

ML could estimate:

```text
Expected congestion reduction
```

However, the final operational result must still be validated through P1.

---

## 7.6 Historical Event Learning

Future versions may learn from previous events.

Potential data:

* Crowd levels
* Gate utilization
* Weather
* Event schedule
* Strategy applied
* Strategy outcome
* Response time
* Resulting congestion
* Incident records

This could allow EventFlow to identify patterns across multiple events.

---

# 8. ML Must Not Replace P1

Even if ML is introduced, the following boundary remains mandatory.

### ML may:

* Predict
* Classify
* Detect patterns
* Estimate probabilities
* Identify anomalies
* Provide early warnings
* Suggest areas for investigation

### ML may not:

* Override safety constraints
* Change authoritative capacity
* Declare an unsafe condition without validation
* Modify deterministic simulation rules
* Approve operational actions
* Execute emergency actions autonomously
* Invent authoritative numerical results

The architecture remains:

```text
                ┌──────────────────────┐
                │       P2 / AI        │
                │ LLM + Future ML     │
                └──────────┬───────────┘
                           │
                           ↓
                ┌──────────────────────┐
                │   P1 Core Engine     │
                │ Deterministic Truth  │
                └──────────┬───────────┘
                           │
                           ↓
                ┌──────────────────────┐
                │ Simulation / Results │
                └──────────────────────┘
```

---

# 9. Possible Future ML Architecture

If ML is introduced later, it should exist as a separate component within the P2 intelligence ecosystem.

Example:

```text
                    Organizer
                        │
                        ↓
                ┌───────────────┐
                │   P2 / LLM    │
                └───────┬───────┘
                        │
              ┌─────────┴─────────┐
              ↓                   ↓
       ┌─────────────┐     ┌─────────────┐
       │ Future ML   │     │ P1 Engine   │
       │ Prediction  │     │ Deterministic│
       └──────┬──────┘     └──────┬──────┘
              │                   │
              └─────────┬─────────┘
                        ↓
                 Result Analysis
                        │
                        ↓
                    Organizer
```

ML predictions should be treated as **supporting information**, while P1 remains authoritative.

---

# 10. Potential ML Inputs

If future research is approved, potential inputs could include:

### Real-Time Inputs

* Current crowd density
* Gate utilization
* Zone occupancy
* Entry rate
* Exit rate
* Movement rate
* Event time
* Current weather
* Operational status

### Historical Inputs

* Previous event crowd patterns
* Previous congestion events
* Historical gate utilization
* Strategy outcomes
* Event schedules
* Weather conditions
* Incident records

### Derived Features

* Rate of crowd growth
* Rate of crowd reduction
* Zone transition frequency
* Gate load ratio
* Flow imbalance
* Historical congestion frequency

---

# 11. Potential ML Outputs

Future models may produce outputs such as:

```json
{
  "prediction_type": "crowd_density_forecast",
  "target_zone": "Zone_B",
  "forecast_horizon_minutes": 10,
  "predicted_density": 0.82,
  "confidence": 0.87
}
```

The important distinction is that:

```text
ML Prediction
      ↓
P1 Validation / Simulation
      ↓
Operational Result
```

The ML output must not directly become an operational command.

---

# 12. ML Confidence Handling

Any future predictive ML model must expose uncertainty.

A prediction should not be represented as an absolute fact.

For example:

```text
Prediction:
Zone B may reach high congestion within 10 minutes.

Confidence:
87%
```

rather than:

```text
Zone B WILL become congested.
```

The system should distinguish:

* Prediction
* Confidence
* Actual observed state
* Deterministic simulation result

---

# 13. ML Evaluation Requirements

Before any ML model is introduced into production, it must have measurable evaluation criteria.

Possible metrics include:

### Prediction Tasks

* MAE
* RMSE
* MAPE
* Prediction accuracy

### Classification Tasks

* Precision
* Recall
* F1-score
* Confusion matrix

### Anomaly Detection

* Detection rate
* False-positive rate
* False-negative rate

### Operational Metrics

* Early-warning lead time
* Missed-risk rate
* False-alert rate
* Improvement over existing rules

The exact metric must depend on the ML problem being solved.

---

# 14. Baseline Requirement

Any future ML system must first be compared against a simpler baseline.

For example:

```text
Rule-Based Prediction
        VS
ML Prediction
```

ML should only be adopted if it demonstrates meaningful improvement.

A complex ML model should not be introduced merely because it is technically possible.

---

# 15. Dataset Requirements

If ML development is approved, the dataset must be documented.

Required information includes:

* Dataset source
* Collection period
* Event types
* Number of events
* Number of records
* Features
* Target variables
* Missing-value handling
* Data quality
* Label generation method
* Train/validation/test split
* Data leakage prevention

Special care must be taken with time-series event data.

Randomly mixing future observations into training data must be avoided.

---

# 16. Training and Validation Strategy

Future models should follow a controlled pipeline:

```text
Data Collection
      ↓
Data Cleaning
      ↓
Feature Engineering
      ↓
Train / Validation / Test Split
      ↓
Baseline Model
      ↓
ML Model
      ↓
Evaluation
      ↓
Error Analysis
      ↓
Simulation Validation
      ↓
Approval
      ↓
Deployment
```

The model must not be deployed solely because its offline metric is high.

Its effect on actual EventFlow workflows must also be evaluated.

---

# 17. Safety Requirements

Because EventFlow deals with crowd and event safety, ML must be treated as a supporting capability.

ML predictions must not:

* Disable safety constraints
* Override emergency rules
* Replace deterministic validation
* Automatically execute dangerous actions
* Hide uncertainty
* Present predictions as confirmed facts

For safety-critical conditions:

```text
Observed / Deterministic State
        ↓
P1 Validation
        ↓
Authoritative Decision
```

remains the preferred path.

---

# 18. Human Oversight

Future ML-assisted recommendations should remain explainable to the organizer.

For example:

```text
Prediction:
Zone C may experience increased congestion.

Reason:
Current entry flow is increasing while exit flow
has remained below the recent average.

Suggested action:
Evaluate Gate Flow Redistribution.

Note:
This prediction is based on historical patterns.
Run simulation before taking operational action.
```

The organizer should be able to understand:

* What was predicted
* Why it was predicted
* How confident the model is
* What action could be considered
* What P1 simulation says
* Whether the action requires approval

---

# 19. ML Research Decision Gate

Before starting ML development, the following questions must be answered.

### Question 1 — Is there a real problem?

```text
Does the current deterministic + LLM architecture
fail to solve an identified requirement?
```

If no:

> Do not introduce ML.

### Question 2 — Is ML appropriate?

```text
Is the problem prediction, classification,
pattern detection, or learning from historical data?
```

If no:

> Prefer deterministic logic or LLM/tool calling.

### Question 3 — Is sufficient data available?

```text
Do we have enough reliable historical data?
```

If no:

> Do not train a custom model.

### Question 4 — Is there a measurable improvement?

```text
Can ML outperform the existing baseline?
```

If no:

> Do not introduce ML.

### Question 5 — Can the model be safely integrated?

```text
Can the ML output remain advisory and
validated by the deterministic engine?
```

If no:

> Do not use the model for that operational task.

---

# 20. Approval Criteria for Future ML

A future ML proposal should include:

1. Problem statement
2. Business/operational justification
3. Existing baseline
4. Dataset availability
5. Proposed model
6. Expected improvement
7. Evaluation metrics
8. Safety analysis
9. Explainability approach
10. Integration design
11. Monitoring strategy
12. Rollback strategy

Only after these requirements are reviewed should ML development begin.

---

# 21. Monitoring and Drift

If a future ML model is deployed, it must be monitored.

Potential monitoring signals include:

* Prediction accuracy
* Error rate
* Input distribution changes
* Output distribution changes
* Confidence degradation
* False-alert rate
* Missed-event rate

A model should be reviewed when event patterns change significantly.

Examples:

* New stadium
* Different event type
* Major layout change
* Significant change in attendance patterns
* New operational procedures

---

# 22. Model Versioning

Future ML models should use explicit versions.

Example:

```text
crowd_prediction_model_v1
crowd_prediction_model_v2
```

Each version should record:

* Training dataset
* Features
* Model architecture
* Hyperparameters
* Evaluation results
* Deployment date
* Known limitations

The system should be able to identify which model generated a prediction.

---

# 23. ML Auditability

Every ML-assisted prediction should be traceable.

Example:

```json
{
  "model_id": "crowd_prediction_model_v1",
  "input_timestamp": "2026-09-20T14:30:00",
  "prediction_type": "density_forecast",
  "target": "Zone_B",
  "prediction": 0.82,
  "confidence": 0.87
}
```

This allows future investigation of:

* What the model predicted
* What data it received
* Which model version was used
* What happened afterward

---

# 24. Recommended Future ML Research Areas

If EventFlow eventually expands its intelligence capabilities, research can be prioritized around:

### Phase 1 — Predictive Monitoring

* Crowd density forecasting
* Gate congestion forecasting
* Bottleneck prediction

### Phase 2 — Pattern Detection

* Crowd anomaly detection
* Flow pattern classification
* Unusual movement detection

### Phase 3 — Strategy Intelligence

* Strategy outcome prediction
* Historical strategy effectiveness
* Event-specific strategy recommendations

### Phase 4 — Advanced Optimization

Potential future research may investigate:

* Learning-based optimization
* Reinforcement learning
* Multi-objective optimization
* Adaptive strategy selection

These should only be considered after sufficient data and a clear operational requirement exist.

---

# 25. Reinforcement Learning Boundary

Reinforcement Learning (RL) is explicitly outside MVP scope.

RL could potentially be researched for problems involving sequential decisions such as:

```text
Observe crowd
    ↓
Choose strategy
    ↓
Observe result
    ↓
Choose next strategy
    ↓
Repeat
```

However, RL introduces additional complexity:

* Reward design
* Simulation environment
* Exploration risk
* Safety constraints
* Training stability
* Policy evaluation
* Offline/online learning concerns

Therefore, RL should not be introduced into MVP operations.

---

# 26. Relationship with Strategy Catalog

The Strategy Catalog remains the controlled vocabulary of operational strategies.

Future ML may help estimate which strategies are likely to be useful.

However:

```text
ML Prediction
      ↓
Candidate Strategy
      ↓
P1 Validation
      ↓
P1 Simulation
      ↓
Organizer Approval
```

must remain the controlled workflow.

ML should not create arbitrary operational actions that are not represented in the approved strategy catalog.

---

# 27. Relationship with Priority Policy

ML must not change the authoritative priority policy.

The priority policy defines objectives such as:

```text
Safety
Crowd Reduction
Visitor Experience
Cost
```

Future ML may estimate the expected effect of a strategy on these objectives.

However, P1 remains responsible for authoritative evaluation.

Example:

```text
ML:
"Strategy A may reduce congestion."

P1:
"Simulation shows 18% reduction."

P2:
"Strategy A reduced simulated congestion
while maintaining the required safety constraints."
```

---

# 28. Relationship with P2 AI

Future ML and the P2 LLM have complementary roles.

### LLM

Handles:

* Natural-language understanding
* Organizer conversation
* Intent detection
* Explanation
* Strategy descriptions
* Tool calling
* Context management

### ML

Handles potential future:

* Prediction
* Classification
* Pattern recognition
* Forecasting
* Anomaly detection

### P1

Handles:

* Deterministic calculations
* Constraint validation
* Simulation
* Authoritative metrics
* Strategy evaluation

---

# 29. Example Future Workflow

Organizer:

> "Will Gate A become overcrowded in the next 10 minutes?"

P2:

```text
Identify intent:
crowd_forecast
```

P2 calls future ML prediction service:

```text
predict_crowd(
    location="Gate_A",
    horizon=10
)
```

ML returns:

```text
Predicted utilization: 91%
Confidence: 84%
```

P2 explains:

> "The prediction indicates that Gate A may approach high utilization within 10 minutes."

If an action is required:

```text
Generate candidate strategy
        ↓
P1 validates strategy
        ↓
P1 simulates strategy
        ↓
P2 explains result
        ↓
Organizer approves
```

The ML prediction does not directly trigger the operational action.

---

# 30. MVP Implementation Recommendation

For the MVP, implement:

### Required

* LLM integration
* Prompt engineering
* Structured output
* Function/tool calling
* Strategy catalog
* Deterministic P1 integration
* Result interpretation
* Guardrails
* Context management
* Human approval

### Deferred

* Custom ML models
* Crowd forecasting
* Predictive analytics
* Anomaly detection models
* Reinforcement learning
* Model training pipelines
* ML monitoring infrastructure

---

# 31. Out-of-Scope for MVP

The following are explicitly outside the MVP:

* Custom crowd prediction model
* Custom congestion forecasting model
* Reinforcement learning
* Deep learning research
* Large-scale historical event modeling
* Automated model retraining
* Online learning
* Custom computer vision model
* Autonomous ML-based operational control
* ML-driven safety decisions

These may be reconsidered in future releases.

---

# 32. Future Research Proposal Format

Any future ML proposal should use the following structure:

```text
ML Research Proposal
│
├── Problem Statement
├── Current Solution
├── Limitation
├── Why ML?
├── Available Data
├── Proposed Model
├── Baseline
├── Evaluation Metrics
├── Safety Considerations
├── Integration Design
├── Expected Improvement
├── Monitoring
├── Rollback Plan
└── Approval
```

This prevents ML from being introduced without a clear engineering justification.

---

# 33. Guardrails

Future ML integrations must follow these rules:

1. ML predictions must be labeled as predictions.
2. Confidence/uncertainty should be preserved where applicable.
3. ML cannot override P1 constraints.
4. ML cannot directly execute operational actions.
5. ML cannot modify safety rules.
6. ML cannot fabricate missing data.
7. ML outputs must be validated before operational use.
8. ML model versions must be traceable.
9. Significant model failures must be detectable.
10. The system must have a fallback when ML is unavailable.

---

# 34. Failure Handling

If a future ML service fails:

```text
ML unavailable
     ↓
Use deterministic rules / P1
     ↓
Continue normal EventFlow operation
```

The absence of ML must not make the core system unusable.

For example:

```text
ML unavailable

P2:
"I cannot provide a predictive crowd forecast right now.
I can still analyze the current crowd state and run
a deterministic simulation using the available data."
```

This ensures graceful degradation.

---

# 35. Success Criteria

The ML research initiative will be considered successful only if a future ML capability:

* Solves a clearly identified problem
* Has sufficient quality data
* Outperforms an existing baseline
* Provides measurable operational value
* Can be safely integrated
* Preserves P1 authority
* Exposes appropriate uncertainty
* Can be monitored
* Can be audited
* Has a fallback mechanism

Simply adding an ML model does not constitute success.

---

# 36. Final Architectural Principle

The EventFlow MVP does not require custom Machine Learning.

The recommended architecture is:

```text
LLM
 ↓
Understand Organizer Request
 ↓
Structured Tool Call
 ↓
P1 Deterministic Engine
 ↓
Validation + Simulation
 ↓
P2 Result Interpretation
 ↓
Organizer Approval
 ↓
Execution
```

Future ML can be added as a **predictive intelligence layer** when sufficient data and a measurable requirement justify it.

The fundamental boundary remains:

> **LLM understands and communicates. ML may predict and detect. P1 calculates, validates, and simulates. The organizer approves operational actions.**

---

## 37. Summary

| Area                     | MVP         | Future          |
| ------------------------ | ----------- | --------------- |
| LLM                      | Required    | Required        |
| Tool Calling             | Required    | Required        |
| Deterministic Simulation | Required    | Required        |
| Strategy Catalog         | Required    | Required        |
| Priority Policy          | Required    | Required        |
| Custom ML                | Deferred    | Possible        |
| Crowd Prediction         | Deferred    | Possible        |
| Anomaly Detection        | Deferred    | Possible        |
| Historical Learning      | Deferred    | Possible        |
| Reinforcement Learning   | Deferred    | Research only   |
| Autonomous ML Decisions  | Not allowed | Not recommended |
| ML Safety Override       | Not allowed | Not allowed     |

### Final Rule

> **Do not add ML because the system is called AI. Add ML only when a specific prediction, classification, or learning problem exists, sufficient data is available, and ML provides measurable value over a simpler baseline.**

For EventFlow MVP, **LLM + deterministic engine + strategy catalog + tool calling + guardrails is sufficient.**
