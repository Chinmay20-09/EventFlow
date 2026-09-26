    # EV-020 — External Data

## 1. Document Purpose

This document defines what kinds of external information can enter EventFlow and, specifically, where P3 begins and ends.

The central rule is that P3 does not become a raw-data processing engine.

## 2. Ownership Principle

External information is processed by the appropriate owner.

P1 may consume and process:

- live information;
- sensor measurements;
- GPS-related information;
- other external measurements required by the crowd/domain models.

P3 receives validated EventFlow information produced by the responsible component.

## 3. P3 Responsibilities

P3:

1. exposes APIs through which validated data can enter;
2. validates request structure and identifiers;
3. stores the required current/backend state;
4. makes stored state available through APIs;
5. stores disruption information when it is represented using EV-008.

## 4. Live/Sensor Crowd Information

The P1 crowd model supports live/sensor information as an input mechanism.

Sensor measurements may correct runtime crowd state through the P1 crowd model.

P3 stores the resulting validated current crowd state.

The raw sensor/GPS processing is not a P3 responsibility.

## 5. Graph Separation

External crowd information must not overwrite graph configuration.

For example:

```text
Sensor says current crowd = 4500
        ↓
Crowd state changes

Graph capacity remains the configured graph value.
```

P3 should preserve this separation in storage.

## 6. Weather

Weather is an example of an external disruption source.

If a weather event materially changes operations, the resulting operational condition should be represented using the disruption model.

For example:

```text
Heavy rain
   ↓
Outdoor location operational restriction
   ↓
EV-008 disruption
   ↓
P3 stores disruption
```

P3 does not decide the crowd impact of the weather.

## 7. Transport and Other External Conditions

Transport conditions or other external events follow the same principle.

If they create a material operational change, the condition can enter through the disruption model.

## 8. Raw Data Storage

The MVP does not require storing every raw external measurement or a complete raw sensor history.

The current/latest processed state is sufficient where that is all the MVP requires.

## 9. Invalid External Data

If the incoming processed EventFlow payload is invalid:

```text
Receive
  ↓
Validate
  ↓
Invalid
  ↓
Reject
```

P3 must not silently store invalid data.

## 10. Data Flow Example

```text
Live sensor/GPS information
            ↓
          P1
   process/correct state
            ↓
     validated crowd state
            ↓
           P3
            ↓
        PostgreSQL
            ↓
      API consumers
```

## 11. Important Boundaries

P3 does not:

- perform raw GPS calculations;
- generate graph topology;
- calculate crowd density;
- calculate crowd propagation;
- generate predictions;
- calculate optimization;
- determine the mathematical impact of weather.

Those remain with the relevant domain components.

## 12. Related Documents

- EV-006 — Graph Model
- EV-007 — Crowd Model
- EV-008 — Disruption Model
- EV-009 — Prediction
- EV-016 — API
- EV-024 — Error Handling

    
