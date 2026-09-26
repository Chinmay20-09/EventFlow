/**
 * SOCIAL / PUBLIC SIGNAL PROVIDER — midnight task.
 *
 * Responsibility:
 * - Fetch lightweight, publicly-available context signals (transport disruption
 *   reports) near the venue from a REAL public source — no credentials needed.
 * - Normalize into a small `SocialSignal` record for the P2 AI layer.
 * - Fail gracefully with a CLEARLY-LABELLED demo fallback (never present
 *   mocked data as live — task §8).
 *
 * REAL SOURCES (verified 2026-09):
 * - Default: **Mastodon public hashtag timeline**
 *   (`https://mastodon.social/api/v1/timelines/tag/weather`) — genuinely public,
 *   key-less, CORS-enabled (`access-control-allow-origin: *`), returns real
 *   posts about weather conditions. Works directly from the browser.
 * - Or any team-hosted RSS-to-JSON bridge via env (`VITE_SOCIAL_SIGNALS_URL`).
 * The fetch is shape-aware: a JSON array is parsed as a Mastodon timeline,
 * an `{ items: [...] }` object as a bridge feed.
 * If every live option fails, a clearly-labelled DEMO feed is served with
 * `source: "DEMO_FALLBACK"` and `live: false` surfaced in the UI.
 */

// ------------------------------------------------------------
// Internal representation (task-required SocialSignal shape)
// ------------------------------------------------------------

export interface SocialSignal {
  /** Feed/provider id, e.g. "MASTODON_PROXY" or "DEMO_FALLBACK". */
  source: string
  timestamp: string
  text: string
  /** Venue-relative location when the item carries one. */
  location?: string
  /** 0–1 relevance to weather/disruption context. */
  relevance: number
  /** Coarse signal type for UI grouping. */
  signalType: "WEATHER" | "DISRUPTION" | "TRANSPORT" | "GENERAL"
}

export interface SocialSignalsResult {
  signals: SocialSignal[]
  /** true when the items came from a real live source (Mastodon or configured). */
  live: boolean
  /** Which real source served the items ("MASTODON" / "LIVE_FEED"). */
  source?: "MASTODON" | "LIVE_FEED"
  /** Set when the live fetch failed and the fallback was used. */
  error?: string
}

// ------------------------------------------------------------
// Demo fallback (clearly labelled — never presented as live)
// ------------------------------------------------------------

/**
 * Deterministic demo items describing a developing rain/transport situation
 * near the venue. The UI renders them under a "DEMO DATA" badge.
 */
export function demoSocialSignals(): SocialSignal[] {
  const now = new Date().toISOString()
  return [
    {
      source: "DEMO_FALLBACK",
      timestamp: now,
      text: "Heavy rain starting near Marine Drive — attendees reporting slow walks to the venue",
      location: "Near venue",
      relevance: 0.9,
      signalType: "WEATHER",
    },
    {
      source: "DEMO_FALLBACK",
      timestamp: now,
      text: "Entrance congestion reported at North Gate as umbrellas queue up",
      location: "North Gate",
      relevance: 0.8,
      signalType: "DISRUPTION",
    },
    {
      source: "DEMO_FALLBACK",
      timestamp: now,
      text: "Transport delay reports increasing on transit lines approaching the venue",
      location: "Transit Hub",
      relevance: 0.85,
      signalType: "TRANSPORT",
    },
    {
      source: "DEMO_FALLBACK",
      timestamp: now,
      text: "Food court shelters filling up as attendees wait out the rain",
      location: "Central Zone",
      relevance: 0.6,
      signalType: "GENERAL",
    },
  ]
}

// ------------------------------------------------------------
// Live source 1: Mastodon public hashtag timeline (default)
// ------------------------------------------------------------

/**
 * Mastodon `GET /api/v1/timelines/tag/:hashtag` status shape — only the
 * fields this provider consumes are declared.
 */
export interface MastodonStatus {
  created_at?: string
  url?: string
  content?: string
  text?: string
}

/** Strip HTML tags + collapse whitespace from a Mastodon status body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Parse a Mastodon public-timeline payload into SocialSignals.
 * Pure — unit-tested. Hashtags are promoted into the location field.
 */
export function parseMastodonTimeline(payload: unknown, now = new Date()): SocialSignal[] {
  if (!Array.isArray(payload)) return []
  const signals: SocialSignal[] = []
  for (const status of payload as MastodonStatus[]) {
    const text = htmlToText(String(status.content ?? status.text ?? ""))
    if (!text) continue
    const hashtags = text.match(/#(\w+)/g) ?? []
    const location = hashtags.length > 0 ? hashtags.slice(0, 2).map((tag) => tag.replace(/^#/, "")).join(" ") : undefined
    const lower = text.toLowerCase()
    const isWeather = /(rain|storm|thunder|flood|hail|wind|snow|fog|drizzle|downpour)/.test(lower)
    const isDisruption = /(congestion|crowd|queue|closed|blocked|incident|cancel)/.test(lower)
    const isTransport = /(train|metro|bus|transit|delay|traffic|commut)/.test(lower)
    const relevance = isWeather ? 0.9 : isDisruption ? 0.75 : isTransport ? 0.7 : 0.3
    signals.push({
      source: "MASTODON",
      timestamp: status.created_at ?? now.toISOString(),
      text: text.slice(0, 200),
      location,
      relevance,
      signalType: isWeather ? "WEATHER" : isDisruption ? "DISRUPTION" : isTransport ? "TRANSPORT" : "GENERAL",
    })
  }
  return signals
}

// ------------------------------------------------------------
// Live source 2: generic bridge feed (env-configured)
// ------------------------------------------------------------

/**
 * Parse a generic RSS-to-JSON bridge payload (hosted by the team) into
 * SocialSignals. Kept permissive: unknown fields ignored, bad items skipped.
 */
export interface RssBridgePayload {
  items?: Array<{
    title?: string
    description?: string
    summary?: string
    pubDate?: string
    date_published?: string
    location?: string
  }>
}

export function parseSocialFeed(payload: RssBridgePayload, now = new Date()): SocialSignal[] {
  const items = Array.isArray(payload.items) ? payload.items : []
  const signals: SocialSignal[] = []
  for (const item of items) {
    const text = (item.title ?? item.description ?? item.summary ?? "").trim()
    if (!text) continue
    const lower = text.toLowerCase()
    const isWeather = /(rain|storm|thunder|flood|hail|wind)/.test(lower)
    const isTransport = /(train|metro|bus|transit|delay|cancel|traffic)/.test(lower)
    const isDisruption = /(congestion|crowd|queue|closed|blocked|incident)/.test(lower)
    const relevance = isWeather ? 0.9 : isDisruption ? 0.75 : isTransport ? 0.7 : 0.3
    signals.push({
      source: "LIVE_FEED",
      timestamp: item.pubDate ?? item.date_published ?? now.toISOString(),
      text,
      location: item.location,
      relevance,
      signalType: isWeather ? "WEATHER" : isDisruption ? "DISRUPTION" : isTransport ? "TRANSPORT" : "GENERAL",
    })
  }
  return signals
}

// ------------------------------------------------------------
// Fetch
// ------------------------------------------------------------

function envValue(name: string): string | undefined {
  const holder = globalThis as { process?: { env?: Record<string, string | undefined> } }
  const fromProcess = holder.process?.env?.[name]
  try {
    const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return fromProcess ?? meta?.[name]
  } catch {
    return fromProcess
  }
}

/**
 * Fetch social/public signals for the dashboard.
 *
 * Order of preference (first usable source wins):
 *   1. env-configured feed (`VITE_SOCIAL_SIGNALS_URL`) — parsed shape-aware
 *   2. Mastodon public hashtag timeline (default live source)
 *   3. clearly-labelled DEMO fallback
 */
export const MASTODON_WEATHER_TIMELINE_URL = "https://mastodon.social/api/v1/timelines/tag/weather?limit=20"

export async function fetchSocialSignals(
  fetchImpl: typeof fetch = fetch,
): Promise<SocialSignalsResult> {
  const customUrl = envValue("VITE_SOCIAL_SIGNALS_URL")
  const attempts: Array<{ url: string; kind: "MASTODON" | "LIVE_FEED" }> = customUrl
    ? [{ url: customUrl, kind: "LIVE_FEED" }]
    : [{ url: MASTODON_WEATHER_TIMELINE_URL, kind: "MASTODON" }]

  let lastError = customUrl
    ? undefined
    : "VITE_SOCIAL_SIGNALS_URL not configured — tried public Mastodon timeline"

  for (const attempt of attempts) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const response = await fetchImpl(attempt.url, { signal: controller.signal })
        if (!response.ok) throw new Error(`${attempt.kind} feed responded ${response.status}`)
        const payload: unknown = await response.json()
        // Shape-aware: Mastodon timelines are JSON arrays; bridges are {items}.
        const signals = Array.isArray(payload)
          ? parseMastodonTimeline(payload)
          : parseSocialFeed(payload as RssBridgePayload)
        if (signals.length === 0) throw new Error(`${attempt.kind} feed returned no usable items`)
        return { signals, live: true, source: attempt.kind }
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { signals: demoSocialSignals(), live: false, error: lastError }
}
