# Weather-Driven Digital Twin — Midnight Task (HackCelestial 3.0)

An **additive enhancement** to the existing EventFlow solution: live weather, a geospatial
map, real-world public signals, and an interactive what-if digital twin — wired through the
existing P1/P2 boundaries. **No engine file was modified** (`engine/src/*` untouched; the
map UI reuses the existing SVG map style already in the dashboard).

---

## 1. Architecture

```
LIVE WEATHER (Open-Meteo API, no key needed)
        ↓
integration/weather/weatherProvider.ts        → WeatherSnapshot (+ labelled DEMO_FALLBACK on failure)
        ↓
integration/weather/weatherImpact.ts          → severity bands + WEATHER_EVENT Disruption + travel-time GraphOverrides
        ↓                                        (plain EventFlow scenario shapes — P1 validates & applies them)
integration/weather/digitalTwin.ts            → baseline vs what-if, both run by the EXISTING P1 engine (runSandbox)
        ↓
P1 SimulationResult ×2 → compareSimulationResults (existing P2→P1 tool) → deltas
        ↓
strategy/src/ai/weather_insight.ts (P2 boundary) → structured narrative + labelled heuristic confidence
        ↓
frontend/src/components/DigitalTwinPanel.tsx  → dashboard: weather card, map, what-if slider, comparison, AI, signals

SOCIAL/PUBLIC SIGNALS (parallel input)
        ↓
integration/weather/socialSignals.ts          → SocialSignal[] (contextual evidence only — never touches P1 math)
```

---

## 2. Weather provider

- **API**: [Open-Meteo](https://open-meteo.com) current-weather endpoint — free, key-less, CORS-enabled.
  - `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,precipitation,weather_code,wind_speed_10m`
- `parseOpenMeteo` normalizes the payload into `WeatherSnapshot` (`latitude, longitude, timestamp,
  temperature °C, precipitation mm, wind km/h, condition, source`).
- **Fallback**: network/HTTP failure returns `source: "DEMO_FALLBACK"` with a deterministic
  heavy-rain snapshot. The UI shows a yellow `DEMO FALLBACK` badge — mocked data is never presented as live.
- **No key is hardcoded.** Optional overrides via env (see §11).

## 3. Weather → EventFlow mapping

Severity bands (`classifyWeather`, thresholds in `DEFAULT_WEATHER_IMPACT_CONFIG`, configurable):

| Band | Rainfall (mm/h) | Operational effect (via existing P1 scenario inputs) |
|---|---|---|
| NORMAL | < 10 | **None** — no disruption, no overrides |
| ELEVATED | ≥ 10 | Restriction tag on affected edges + edge `currentTime` ×1.25 (slower travel) |
| HEAVY | ≥ 40 | + edge `capacity` → 60% and node `throughput_capacity` → 60% (APPLIED operationalEffects) |
| EXTREME | ≥ 80 | ×2 travel time, capacity/throughput → 40%, disruption severity CRITICAL |

Affected demo entities (outdoor/transport exposure): node `D` (Transit Hub), edges
`HALL_GATE`, `D_EXIT`. The adapter only scales **existing** P1 parameters
(`capacity`, `throughput_capacity`, `currentTime`) — no new physics.

## 4. Digital-twin what-if flow

1. Operator sets **rainfall 0–150 mm/h** on the slider.
2. `Run Digital Twin` executes **two isolated P1 sandbox runs**:
   `SCENARIO_BASELINE` (no weather) and `SCENARIO_WEATHER_<BAND>` (adapter output injected via the
   existing `ScenarioInput.disruptionOverrides` / `graphOverrides` fields).
3. Deltas come from the **existing** `compareSimulationResults` P2→P1 tool.
4. What-if runs are pure scenario copies — the live event state is never mutated
   (verified by a byte-identical-input test).

## 5. Map implementation

- `buildMapData` produces `MapNodeView`/`MapEdgeView` from **P1 final-state metrics**
  (utilization, queue size, bottleneck flags) — nothing is guessed in the UI.
- The venue has a documented fixed coordinate mapping (`DEMO_VENUE_COORDINATES`, Mumbai);
  the panel projects lat/lng to a small SVG canvas.
- NORMAL: neutral network view. WEATHER: affected edges dashed red `🌧 affected ×N`,
  weather-zone circle around the venue, congested nodes orange, queue counts under labels.

## 6. AI integration (existing P2 boundary)

- `strategy/src/ai/weather_insight.ts` consumes weather + signals + **both P1 results** and quotes
  their numbers — it never recalculates capacity/congestion (P1 remains source of truth).
- Output: summary, findings, recommendations, warnings.

## 7. Uncertainty handling

`heuristicConfidence` derives `Low | Medium | High` mechanically from data provenance
(live weather, count of corroborating signals). It is always rendered as
**"AI confidence: Medium (basis…)"** — a model estimate, never presented as a validated probability.

## 8. Social signals

- **Default live source (real, verified)**: the **Mastodon public hashtag timeline**
  (`https://mastodon.social/api/v1/timelines/tag/weather?limit=20`) — public, key-less,
  CORS-enabled (`access-control-allow-origin: *`), returns real public weather posts.
  `parseMastodonTimeline` strips HTML, promotes hashtags to a location hint and classifies each
  item (WEATHER / DISRUPTION / TRANSPORT / GENERAL, relevance 0–1).
- Alternative: any team-hosted RSS-to-JSON bridge via `VITE_SOCIAL_SIGNALS_URL` — it takes
  priority over Mastodon when set. Fetching is shape-aware (JSON array → Mastodon,
  `{items:[...]}` → bridge).
- If every live option fails, the provider serves a deterministic **demo feed** with a yellow
  `DEMO DATA` badge and the failure reason printed underneath — mocked data is never
  presented as live.
- Signals are contextual evidence for the AI layer only — raw social text never modifies P1 math.

## 9. REAL vs DEMO data — explicit distinction

| Data | Source | Badge |
|---|---|---|
| Weather | Open-Meteo live call | green `LIVE` |
| Weather (offline) | deterministic fallback | yellow `DEMO FALLBACK` + reason text |
| What-if scenario weather | operator slider | presented as WHAT-IF (never labelled live) |
| Social feed | Mastodon public timeline (default) or configured endpoint | green `LIVE FEED · MASTODON` |
| Social feed (default) | demo items | yellow `DEMO DATA` |
| All simulation numbers | **P1 engine** | scenario ids shown under the comparison |

## 10. Demo instructions (2–3 minutes)

1. `npm run dev` → open the dashboard → Overview page.
2. Show the **LIVE WEATHER** card (real Open-Meteo data; badge says LIVE or DEMO FALLBACK).
3. Show the **map** — venue network with all five nodes/edges.
4. Scroll to **LIVE SOCIAL SIGNALS** — badge reads `LIVE FEED · MASTODON` with real public posts.
5. Drag **Rainfall** to ~100 mm/h → **Run Digital Twin**.
6. Point at the comparison: congestion %, queue, arrived, violations — all from P1.
7. Map now highlights `HALL_GATE`, `D_EXIT` (dashed red, ×2) and the Transit Hub.
8. **AI IMPACT ANALYSIS** explains the delta with labelled confidence.
9. Return rainfall to 5 mm/h → rerun → numbers match baseline again (state untouched).

## 11. Environment variables

Optional (sensible defaults keep everything working):

| Variable | Purpose | Default |
|---|---|---|
| `VITE_WEATHER_API_URL` | alternate weather endpoint (e.g. proxy) | Open-Meteo |
| `VITE_WEATHER_API_KEY` | appended as `key=` for key-based providers | unset |
| `VITE_VENUE_LAT` / `VITE_VENUE_LON` | venue coordinates | Mumbai (19.076, 72.8777) |
| `VITE_SOCIAL_SIGNALS_URL` | JSON feed of public signals (overrides Mastodon default) | unset → Mastodon timeline |

## 12. Tests

`tests/weather/` (28 focused tests, existing suite untouched):

- `weatherProvider.test.ts` — payload parsing, WMO mapping, error handling, labelled fallback
- `weatherImpact.test.ts` — severity bands, NORMAL = no modification, capacity/throughput effects, travel-time overrides, clamping
- `digitalTwin.test.ts` — **isolation (inputs byte-identical after runs)**, what-if changes P1 inputs, real-engine outcomes, P1-derived deltas, determinism
- `mapAndSignals.test.ts` — map data generation, AI insight quoting P1 numbers, mechanical confidence, social parsing + fallbacks
