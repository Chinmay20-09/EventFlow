/**
 * WEATHER DIGITAL TWIN PANEL — midnight task (additive UI).
 *
 * Inserted into the existing Overview page. All simulated numbers come from
 * the real P1 engine via integration/weather/digitalTwin.ts — nothing here
 * fakes congestion/queue/capacity values.
 *
 * Live-vs-demo provenance is always visible:
 * - weather badge shows LIVE / DEMO FALLBACK
 * - social feed badge shows LIVE / DEMO DATA
 */

import { useEffect, useMemo, useState } from "react"
import {
  DEMO_VENUE_COORDINATES,
  buildMapData,
  runDigitalTwin,
} from "../../integration/weather/digitalTwin"
import type { DigitalTwinResult } from "../../integration/weather/digitalTwin"
import { fetchCurrentWeather } from "../../integration/weather/weatherProvider"
import type { WeatherProviderResult } from "../../integration/weather/weatherProvider"
import { fetchSocialSignals } from "../../integration/weather/socialSignals"
import type { SocialSignalsResult } from "../../integration/weather/socialSignals"
import { explainWeatherComparison } from "../../strategy/src/ai/weather_insight"
import type { WeatherImpactInsight } from "../../strategy/src/ai/weather_insight"

type ThemeClasses = (classes: string) => string

/** Fixed pixel mapping for the documented demo geography (Mumbai venue). */
const MAP_LATLNG_TO_PX = { originLat: 19.0763, originLng: 72.8770, scaleX: 15800, scaleY: -21400 }

function projectPoint(latitude: number, longitude: number): { x: number; y: number } {
  return {
    x: 160 + (longitude - MAP_LATLNG_TO_PX.originLng) * MAP_LATLNG_TO_PX.scaleX,
    y: 90 + (latitude - MAP_LATLNG_TO_PX.originLat) * MAP_LATLNG_TO_PX.scaleY,
  }
}

interface DigitalTwinPanelProps {
  themeClasses: ThemeClasses
  isDark: boolean
}

export function DigitalTwinPanel({ themeClasses, isDark }: DigitalTwinPanelProps) {
  const [rainfall, setRainfall] = useState(5)
  // Seed with the deterministic baseline (rainfall 0 → NORMAL, no weather):
  // the map shows the venue network immediately. runDigitalTwin is pure P1
  // computation — no external system, no mutation.
  const [appliedRainfall, setAppliedRainfall] = useState<number | null>(0)
  const [twin, setTwin] = useState<DigitalTwinResult | null>(() => runDigitalTwin(0))
  const [weather, setWeather] = useState<WeatherProviderResult | null>(null)
  const [signals, setSignals] = useState<SocialSignalsResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch live context on mount. setState happens after await — never synchronously.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [weatherResult, signalsResult] = await Promise.all([
        fetchCurrentWeather(),
        fetchSocialSignals(),
      ])
      if (cancelled) return
      setWeather(weatherResult)
      setSignals(signalsResult)
      if (weatherResult.snapshot.source === "DEMO_FALLBACK" && weatherResult.error) {
        setError(`Weather API unavailable (${weatherResult.error}) — demo weather in use.`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleRunTwin = () => {
    setRunning(true)
    setError(null)
    try {
      // Runs P1 twice (baseline + what-if) — synchronous, deterministic, isolated.
      const result = runDigitalTwin(rainfall)
      setTwin(result)
      setAppliedRainfall(rainfall)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  const mapData = useMemo(() => (twin ? buildMapData(twin) : null), [twin])
  const insight: WeatherImpactInsight | null = useMemo(() => {
    if (!twin || !appliedRainfall) return null
    return explainWeatherComparison(
      twin.snapshot,
      {
        rainfallMm: appliedRainfall,
        severityLabel: twin.severityLabel,
        baseline: twin.baseline,
        whatIf: twin.whatIf,
        peakCongestionDelta: twin.comparison.peakCongestionDelta,
        peakQueueDelta: twin.comparison.peakQueueDelta,
        arrivedPopulationDelta: twin.comparison.arrivedPopulationDelta,
        estimatedDelaySecondsDelta: twin.comparison.estimatedDelaySecondsDelta,
        strandedPopulationDelta: twin.comparison.strandedPopulationDelta,
        affectedNodeIds: twin.affectedNodeIds,
        affectedEdgeIds: twin.affectedEdgeIds,
      },
      signals?.signals ?? [],
    )
  }, [twin, appliedRainfall, signals])

  const weatherLive = weather?.live ?? false
  const weatherBadge = weather
    ? weatherLive
      ? "LIVE"
      : "DEMO FALLBACK"
    : "LOADING…"
  const weatherBadgeColor = weather
    ? weatherLive
      ? "bg-green-500/10 text-green-400"
      : "bg-yellow-500/10 text-yellow-400"
    : "bg-slate-500/10 text-slate-400"

  const liveWeatherNote =
    weather && !weatherLive
      ? ` (demo conditions: ${weather.snapshot.precipitation} mm — live API unavailable)`
      : ""

  return (
    <section className={themeClasses("mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6")}>

      {/* Header */}
      <div className={themeClasses("flex flex-wrap items-start justify-between gap-4")}>
        <div>
          <p className={themeClasses("text-blue-400 text-sm font-medium")}>WEATHER DIGITAL TWIN</p>
          <h3 className={themeClasses("text-xl font-semibold mt-1")}>Weather-driven what-if simulation</h3>
          <p className={themeClasses("text-sm text-slate-400 mt-2")}>
            Rainfall feeds the impact adapter → EventFlow simulation reruns → results compared.
          </p>
        </div>

        {/* LIVE WEATHER */}
        <div className={themeClasses("bg-slate-800 rounded-xl p-4 min-w-[240px]")}>
          <div className={themeClasses("flex items-center justify-between gap-3")}>
            <span className={themeClasses("text-xs text-slate-400 uppercase")}>Live Weather</span>
            <span className={`text-xs px-2 py-0.5 rounded ${weatherBadgeColor}`}>{weatherBadge}</span>
          </div>
          {weather ? (
            <>
              <p className={themeClasses("text-lg font-bold mt-2")}>
                {weather.snapshot.condition} · {weather.snapshot.precipitation} mm
              </p>
              <p className={themeClasses("text-xs text-slate-400 mt-1")}>
                {weather.snapshot.temperature}°C · wind {weather.snapshot.wind} km/h · {weather.snapshot.source}
                {liveWeatherNote}
              </p>
            </>
          ) : (
            <p className={themeClasses("text-sm text-slate-500 mt-2")}>Fetching…</p>
          )}
        </div>
      </div>

      {error && (
        <div className={themeClasses("mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3")}>
          <p className={themeClasses("text-xs text-yellow-300")}>{error}</p>
        </div>
      )}

      {/* WHAT-IF CONTROL + RUN */}
      <div className={themeClasses("mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6")}>
        <div className={themeClasses("lg:col-span-1 bg-slate-800/60 rounded-xl p-5")}>
          <p className={themeClasses("text-xs text-slate-400 uppercase")}>Weather what-if</p>
          <h4 className={themeClasses("font-semibold mt-1")}>Rainfall intensity</h4>

          <p className={themeClasses("text-3xl font-bold mt-3")}>
            {rainfall} <span className={themeClasses("text-sm text-slate-400 font-normal")}>mm/h</span>
          </p>

          <input
            type="range"
            min={0}
            max={150}
            step={1}
            value={rainfall}
            onChange={(event) => setRainfall(Number(event.target.value))}
            className={themeClasses("w-full mt-3")}
            aria-label="Rainfall intensity (mm/h)"
          />
          <div className={themeClasses("flex justify-between text-xs text-slate-500")}>
            <span>0 dry</span>
            <span>40 heavy</span>
            <span>80+ extreme</span>
          </div>

          <button
            onClick={handleRunTwin}
            disabled={running}
            className={themeClasses("mt-5 w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium")}
          >
            {running ? "Running…" : "Run Digital Twin"}
          </button>

          <p className={themeClasses("text-xs text-slate-500 mt-3")}>
            Baseline vs what-if run in an isolated P1 sandbox — the live event state is never modified.
          </p>
        </div>

        {/* MAP */}
        <div className={themeClasses("lg:col-span-2 bg-slate-800/60 rounded-xl p-5")}>
          <div className={themeClasses("flex items-center justify-between")}>
            <div>
              <p className={themeClasses("text-xs text-slate-400 uppercase")}>Geospatial map</p>
              <h4 className={themeClasses("font-semibold mt-1")}>
                {twin ? `Scenario: ${twin.severityLabel}` : "Venue network"}
              </h4>
            </div>
            {twin && (
              <span className={themeClasses("text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-300")}>
                {twin.severity === "NORMAL" ? "BASELINE" : `${appliedRainfall} mm/h WHAT-IF`}
              </span>
            )}
          </div>

          <svg viewBox="0 0 640 300" className={themeClasses("w-full h-auto mt-4 rounded-lg")} role="img" aria-label="Venue map with weather impact">
            <rect width="640" height="300" fill={isDark ? "#0f172a" : "#eef5fb"} />
            {/* Weather area marker */}
            {twin && (
              <circle
                cx={projectPoint(DEMO_VENUE_COORDINATES.D.latitude, DEMO_VENUE_COORDINATES.D.longitude).x}
                cy={projectPoint(DEMO_VENUE_COORDINATES.D.latitude, DEMO_VENUE_COORDINATES.D.longitude).y}
                r={Math.max(60, Math.min(190, 60 + (mapData?.weather.radiusKm ?? 0) * 60))}
                fill="rgba(59,130,246,0.12)"
                stroke="#60a5fa"
                strokeDasharray="6 6"
              />
            )}

            {/* Edges */}
            {(mapData?.edges ?? []).map((edge) => {
              const from = projectPoint(DEMO_VENUE_COORDINATES[edge.from].latitude, DEMO_VENUE_COORDINATES[edge.from].longitude)
              const to = projectPoint(DEMO_VENUE_COORDINATES[edge.to].latitude, DEMO_VENUE_COORDINATES[edge.to].longitude)
              const affected = edge.weatherAffected || edge.bottleneck
              return (
                <g key={edge.id}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={affected ? "#ef4444" : "#94a3b8"}
                    strokeWidth={affected ? 5 : 3}
                    strokeDasharray={edge.weatherAffected ? "10 6" : undefined}
                  />
                  {(edge.weatherAffected || edge.bottleneck) && (
                    <text
                      x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8}
                      textAnchor="middle" fontSize="9"
                      fill={edge.weatherAffected ? "#f87171" : "#fbbf24"}
                      fontWeight="700"
                    >
                      {edge.weatherAffected ? "🌧 affected" : "⚠ bottleneck"}
                      {edge.travelTimeFactor ? ` ×${edge.travelTimeFactor}` : ""}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {(mapData?.nodes ?? []).map((node) => {
              const point = projectPoint(node.latitude, node.longitude)
              const utilization = node.utilization
              const color =
                node.status === "CLOSED" ? "#ef4444"
                : node.bottleneck || (utilization !== null && utilization >= 0.85) ? "#f97316"
                : node.weatherAffected ? "#facc15"
                : "#38bdf8"
              return (
                <g key={node.id}>
                  <circle cx={point.x} cy={point.y} r="16" fill={color} stroke="white" strokeWidth="2.5" />
                  <text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f172a">
                    {node.id}
                  </text>
                  <text x={point.x} y={point.y + 30} textAnchor="middle" fontSize="9" fill={isDark ? "#cbd5e1" : "#334155"}>
                    {node.label}
                    {node.queueSize > 0 ? ` · queue ${Math.round(node.queueSize)}` : ""}
                  </text>
                </g>
              )
            })}
          </svg>

          <div className={themeClasses("mt-3 flex flex-wrap gap-4 text-xs text-slate-400")}>
            <span><span className="inline-block w-3 h-0.5 bg-slate-400 align-middle mr-1" />route</span>
            <span><span className="inline-block w-3 h-0.5 bg-red-500 align-middle mr-1" />weather-affected / bottleneck</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 align-middle mr-1" />normal</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 align-middle mr-1" />weather zone</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 align-middle mr-1" />congested</span>
          </div>
        </div>
      </div>

      {/* BASELINE vs WHAT-IF COMPARISON */}
      {twin && (
        <div className={themeClasses("mt-6 bg-slate-800/50 border border-slate-700 rounded-xl p-5")}>
          <div className={themeClasses("flex items-center justify-between")}>
            <div>
              <p className={themeClasses("text-blue-400 text-sm font-medium")}>SIMULATION COMPARISON</p>
              <h4 className={themeClasses("text-lg font-semibold mt-1")}>Baseline vs what-if weather</h4>
              <p className={themeClasses("text-xs text-slate-500 mt-1")}>
                Both runs executed by the EventFlow P1 engine (scenario ids: {twin.baseline.scenarioId} / {twin.whatIf.scenarioId}).
              </p>
            </div>
          </div>

          <div className={themeClasses("mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4")}>
            {[
              {
                label: "Peak congestion",
                baseline: `${(twin.baseline.metrics.peakCongestion * 100).toFixed(0)}%`,
                whatIf: `${(twin.whatIf.metrics.peakCongestion * 100).toFixed(0)}%`,
                delta: twin.comparison.peakCongestionDelta,
              },
              {
                label: "Peak queue",
                baseline: `${Math.round(twin.baseline.metrics.peakQueue)}`,
                whatIf: `${Math.round(twin.whatIf.metrics.peakQueue)}`,
                delta: twin.comparison.peakQueueDelta,
                people: true,
              },
              {
                label: "Arrived",
                baseline: `${twin.baseline.arrivedPopulation}`,
                whatIf: `${twin.whatIf.arrivedPopulation}`,
                delta: twin.comparison.arrivedPopulationDelta,
                people: true,
              },
              {
                label: "Capacity violations",
                baseline: `${twin.baseline.capacityViolations.length}`,
                whatIf: `${twin.whatIf.capacityViolations.length}`,
                delta: twin.whatIf.capacityViolations.length - twin.baseline.capacityViolations.length,
              },
            ].map((metric) => (
              <div key={metric.label} className={themeClasses("bg-slate-900 rounded-xl p-4")}>
                <p className={themeClasses("text-xs text-slate-400")}>{metric.label}</p>
                <div className={themeClasses("flex items-end justify-between mt-2")}>
                  <div>
                    <p className={themeClasses("text-xs text-slate-500")}>Baseline</p>
                    <p className={themeClasses("text-xl font-bold")}>{metric.baseline}</p>
                  </div>
                  <span className={themeClasses("text-slate-500 text-xs")}>→</span>
                  <div className="text-right">
                    <p className={themeClasses("text-xs text-slate-500")}>What-if</p>
                    <p className={`text-xl font-bold ${metric.delta > 0 ? "text-red-400" : metric.delta < 0 ? "text-green-400" : ""}`}>
                      {metric.whatIf}
                    </p>
                  </div>
                </div>
                {metric.delta !== 0 && (
                  <p className={`text-xs mt-2 ${metric.delta > 0 ? "text-red-400" : "text-green-400"}`}>
                    {metric.delta > 0 ? "+" : ""}{metric.people ? Math.round(metric.delta) : Number(metric.delta.toFixed(3))}
                    {metric.people ? " people" : ""} vs baseline
                  </p>
                )}
              </div>
            ))}
          </div>

          {twin.affectedEdgeIds.length > 0 && (
            <p className={themeClasses("text-xs text-slate-400 mt-4")}>
              Weather-degraded entities: {twin.affectedEdgeIds.join(", ")}
              {twin.affectedNodeIds.length > 0 ? ` · zone ${twin.affectedNodeIds.join(", ")}` : ""}
              {Object.entries(twin.travelTimeFactors).map(([edgeId, factor]) => ` · ${edgeId} ×${factor}`).join("")}
            </p>
          )}
        </div>
      )}

      {/* AI IMPACT ANALYSIS */}
      {insight && (
        <div className={themeClasses("mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-5")}>
          <div className={themeClasses("flex items-center justify-between")}>
            <p className={themeClasses("text-blue-300 text-sm font-medium")}>AI IMPACT ANALYSIS</p>
            <span className={themeClasses("text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-300")}>
              AI confidence: {insight.confidence.level} ({insight.confidence.basis})
            </span>
          </div>

          <h4 className={themeClasses("text-lg font-semibold mt-2")}>{insight.summary}</h4>

          <div className={themeClasses("grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4")}>
            <div>
              <p className={themeClasses("text-xs text-slate-400 uppercase")}>Findings</p>
              <ul className={themeClasses("mt-2 space-y-1.5")}>
                {insight.findings.map((finding, index) => (
                  <li key={index} className={themeClasses("text-sm text-slate-300")}>• {finding}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className={themeClasses("text-xs text-slate-400 uppercase")}>Recommended response</p>
              <ul className={themeClasses("mt-2 space-y-1.5")}>
                {insight.recommendations.map((recommendation, index) => (
                  <li key={index} className={themeClasses("text-sm text-slate-300")}>→ {recommendation}</li>
                ))}
              </ul>
              {insight.warnings.length > 0 && (
                <div className={themeClasses("mt-3 bg-red-500/10 rounded-lg p-3")}>
                  {insight.warnings.map((warning, index) => (
                    <p key={index} className={themeClasses("text-sm text-red-300")}>⚠ {warning}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LIVE SOCIAL SIGNALS */}
      <div className={themeClasses("mt-6 bg-slate-800/60 rounded-xl p-5")}>
        <div className={themeClasses("flex items-center justify-between")}>
          <div>
            <p className={themeClasses("text-xs text-slate-400 uppercase")}>Public signals</p>
            <h4 className={themeClasses("font-semibold mt-1")}>Live social signals</h4>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${
            signals?.live ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
          }`}>
            {signals === null
              ? "LOADING…"
              : signals.live
              ? `LIVE FEED${signals.source ? ` · ${signals.source}` : ""}`
              : "DEMO DATA"}
          </span>
        </div>

        <div className={themeClasses("mt-4 space-y-2")}>
          {(signals?.signals ?? []).slice(0, 5).map((signal, index) => (
            <div key={`${signal.timestamp}-${index}`} className={themeClasses("flex items-start gap-3 bg-slate-900 rounded-lg p-3")}>
              <span className={themeClasses("text-sm")}>
                {signal.signalType === "WEATHER" ? "🌧" : signal.signalType === "DISRUPTION" ? "⚠" : signal.signalType === "TRANSPORT" ? "🚌" : "ℹ"}
              </span>
              <div className="flex-1">
                <p className={themeClasses("text-sm text-slate-200")}>{signal.text}</p>
                <p className={themeClasses("text-xs text-slate-500 mt-0.5")}>
                  {signal.location ? `${signal.location} · ` : ""}{signal.signalType.toLowerCase()} · relevance {(signal.relevance * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          ))}
          {signals && !signals.live && signals.error && (
            <p className={themeClasses("text-xs text-slate-500")}>{signals.error}</p>
          )}
        </div>
      </div>

    </section>
  )
}

export default DigitalTwinPanel
