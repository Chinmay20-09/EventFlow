    # EV-029 — Configuration

## 1. Document Purpose

This document defines how P3 backend configuration is supplied without hard-coding environment-specific values into application code.

## 2. Configuration Method

The MVP uses environment-based configuration.

Typical local development:

```text
.env
```

A safe template is:

```text
.env.example
```

The actual `.env` containing secrets must not be committed.

## 3. Configuration Categories

### API Configuration

```text
API_HOST
API_PORT
ENVIRONMENT
```

Example:

```text
API_HOST=0.0.0.0
API_PORT=8000
ENVIRONMENT=development
```

### Database Configuration

```text
DATABASE_URL
```

This contains the PostgreSQL connection information.

### Workflow Configuration

```text
MAX_SIMULATION_ATTEMPTS=2
```

The MVP default is 2.

## 4. Configurable Maximum Simulation Attempts

The maximum number of simulation attempts is configurable.

Default:

```text
MAX_SIMULATION_ATTEMPTS=2
```

P3 reads this configuration and enforces it.

Changing the configuration does not require changing the workflow code.

For the current MVP configuration, the value remains 2.

## 5. Example Configuration

```text
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
API_HOST=0.0.0.0
API_PORT=8000
ENVIRONMENT=development
MAX_SIMULATION_ATTEMPTS=2
```

These are placeholders, not real credentials.

## 6. Secrets

Secrets include items such as:

- database passwords;
- external API keys;
- authentication secrets.

They must not be:

- hard-coded;
- committed to Git;
- placed in `.env.example`;
- printed in logs.

## 7. Application Data vs Configuration

Do not place EventFlow domain data into `.env`.

These belong in PostgreSQL:

- event information;
- nodes;
- edges;
- current crowd;
- disruptions;
- predictions;
- strategies;
- Strategy Sets;
- simulations;
- approvals;
- executions;
- users.

## 8. P1 Configuration Boundary

P3 does not own P1's internal algorithm configuration.

P3 does not configure:

- crowd formulas;
- prediction formulas;
- optimization objectives;
- simulation equations.

## 9. Configuration UI

No configuration dashboard is required for the MVP.

A developer/operator changes environment configuration directly.

A backend restart may be required after configuration changes.

## 10. Environment Separation

At minimum, development/demo configuration should be separable from any future deployment configuration.

The MVP does not require a complex configuration service.

## 11. Validation

At application startup, required configuration should be validated.

For example:

```text
Missing DATABASE_URL
      ↓
Startup configuration error
      ↓
Do not start normally
```

This is safer than allowing the application to fail later on its first database request.

## 12. Related Documents

- EV-003 — Architecture
- EV-024 — Error Handling
- EV-038 — Developer Setup

    
