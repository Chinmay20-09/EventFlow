/**
 * Midnight task tests — map data, AI insight, social signals.
 */

import { describe, expect, it } from "vitest"
import { runDigitalTwin, buildMapData } from "../../integration/weather/digitalTwin"
import { explainWeatherComparison, heuristicConfidence } from "../../strategy/src/ai/weather_insight"
import {
  demoSocialSignals,
  parseSocialFeed,
  parseMastodonTimeline,
  htmlToText,
  fetchSocialSignals,
  MASTODON_WEATHER_TIMELINE_URL,
} from "../../integration/weather/socialSignals"

describe("map data generation", () => {
  it("marks weather-affected entities and carries P1-derived values", () => {
    const twin = runDigitalTwin(100)
    const map = buildMapData(twin)

    expect(map.nodes).toHaveLength(5)
    expect(map.edges).toHaveLength(5)

    const transit = map.nodes.find((node) => node.id === "D")
    expect(transit?.weatherAffected).toBe(true)

    const gateEdge = map.edges.find((edge) => edge.id === "HALL_GATE")
    expect(gateEdge?.weatherAffected).toBe(true)
    expect(gateEdge?.travelTimeFactor).toBeCloseTo(2, 6)

    // Weather marker sits at the venue location with a rain-scaled radius.
    expect(map.weather.latitude).toBeGreaterThan(18)
    expect(map.weather.radiusKm).toBeGreaterThanOrEqual(0.5)

    // Utilization values come from P1 metrics (null only where no capacity).
    expect(map.nodes.every((node) => node.utilization === null || Number.isFinite(node.utilization))).toBe(true)
  })

  it("normal weather highlights nothing", () => {
    const map = buildMapData(runDigitalTwin(3))
    expect(map.nodes.every((node) => !node.weatherAffected)).toBe(true)
    expect(map.edges.every((edge) => !edge.weatherAffected)).toBe(true)
    expect(map.edges.every((edge) => edge.travelTimeFactor === null)).toBe(true)
  })
})

describe("P2 weather insight (existing AI boundary)", () => {
  it("explains the comparison using P1 numbers and labels confidence", () => {
    const twin = runDigitalTwin(100)
    const insight = explainWeatherComparison(
      twin.snapshot,
      {
        rainfallMm: 100,
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
      demoSocialSignals(),
    )
    expect(insight.summary).toContain("100 mm/h")
    expect(insight.findings.join(" ")).toContain("Peak congestion rises")
    expect(insight.recommendations.length).toBeGreaterThan(0)
    expect(insight.confidence.level).toBe("Medium") // fallback weather + 3 demo signals
    expect(insight.confidence.basis).toContain("social signal")
  })

  it("heuristic confidence is mechanical and labelled (never fake statistics)", () => {
    expect(heuristicConfidence({ live: true, signalCount: 3 })).toEqual({
      level: "High",
      basis: "Live weather observation (+3 social signal(s) corroboration)",
    })
    expect(heuristicConfidence({ live: false, signalCount: 0 }).level).toBe("Low")
    expect(heuristicConfidence({ live: true, signalCount: 0 }).level).toBe("Medium")
  })
})

describe("social signals", () => {
  it("demo fallback is present and clearly labelled", () => {
    const signals = demoSocialSignals()
    expect(signals.length).toBeGreaterThanOrEqual(3)
    expect(signals.every((signal) => signal.source === "DEMO_FALLBACK")).toBe(true)
    expect(signals.every((signal) => signal.relevance > 0 && signal.relevance <= 1)).toBe(true)
  })

  it("parses a real bridge feed and classifies relevance", () => {
    const signals = parseSocialFeed({
      items: [
        { title: "Flooding reported on Marine Drive", pubDate: "2026-09-24T00:00:00Z", location: "Marine Drive" },
        { title: "Metro delays near stadium", pubDate: "2026-09-24T00:05:00Z" },
        { title: "Concert merch stalls open", pubDate: "2026-09-24T00:10:00Z" },
      ],
    })
    expect(signals).toHaveLength(3)
    expect(signals[0]?.signalType).toBe("WEATHER")
    expect(signals[0]?.relevance).toBe(0.9)
    expect(signals[1]?.signalType).toBe("TRANSPORT")
    expect(signals[2]?.relevance).toBe(0.3)
  })

  it("with no env config, tries the public Mastodon timeline (default live source)", async () => {
    let requestedUrl: string | undefined
    const mastodonFetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input)
      throw new Error("offline")
    }) as unknown as typeof fetch
    const result = await fetchSocialSignals(mastodonFetch)
    expect(requestedUrl).toBe(MASTODON_WEATHER_TIMELINE_URL)
    expect(result.live).toBe(false)
    expect(result.error).toBe("offline")
    expect(result.signals[0]?.source).toBe("DEMO_FALLBACK")
  })

  it("configured bridge feed wins over Mastodon and is served as LIVE_FEED", async () => {
    const holder = globalThis as { process?: { env?: Record<string, string | undefined> } }
    holder.process = holder.process ?? {}
    holder.process.env = { ...holder.process.env, VITE_SOCIAL_SIGNALS_URL: "https://example.test/feed.json" }
    const okResponse = {
      ok: true,
      json: async () => ({ items: [{ title: "Metro delays near stadium", pubDate: "2026-09-24T00:05:00Z" }] }),
    }
    const okFetch = (async () => okResponse) as unknown as typeof fetch
    const result = await fetchSocialSignals(okFetch)
    expect(result.live).toBe(true)
    expect(result.source).toBe("LIVE_FEED")
    delete holder.process.env.VITE_SOCIAL_SIGNALS_URL
  })

  it("falls back to labelled demo data when every live source fails", async () => {
    const failingFetch = (async () => { throw new Error("503") }) as unknown as typeof fetch
    const result = await fetchSocialSignals(failingFetch)
    expect(result.live).toBe(false)
    expect(result.error).toBe("503")
    expect(result.signals).toEqual(demoSocialSignals())
  })

  it("parses a real Mastodon timeline payload (HTML body, hashtags as location)", () => {
    const signals = parseMastodonTimeline([
      {
        created_at: "2026-09-26T22:20:38.000Z",
        content: "<p>Heavy rain flooding Marine Drive near the venue ⛈️</p><p>#weather #Mumbai</p>",
      },
      { content: "" },
      "not-an-object",
    ])
    expect(signals).toHaveLength(1)
    expect(signals[0]?.source).toBe("MASTODON")
    expect(signals[0]?.signalType).toBe("WEATHER")
    expect(signals[0]?.relevance).toBe(0.9)
    expect(signals[0]?.location).toBe("weather Mumbai")
    expect(signals[0]?.text).toContain("Heavy rain flooding")
    expect(signals[0]?.text).not.toContain("<p>")
  })

  it("strips HTML entities and tags", () => {
    expect(htmlToText("<p>Rain &amp; wind &lt;alert&gt;</p>")).toBe("Rain & wind <alert>")
  })

  it("rejects a non-array Mastodon payload", () => {
    expect(parseMastodonTimeline({ error: "not found" })).toEqual([])
  })
})
