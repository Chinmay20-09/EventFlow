/**
 * LIVE WEATHER PROVIDER — midnight task (weather-driven digital twin).
 *
 * Responsibility:
 * - Fetch CURRENT weather from a real public API (Open-Meteo — no API key required).
 * - Normalize it into a small internal WeatherSnapshot.
 * - Fail gracefully: if the API is unreachable, return a clearly-labelled
 *   DEMO fallback snapshot instead of throwing (the demo must never die on stage).
 *
 * Open-Meteo response shape (current weather API):
 *   https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,precipitation,weather_code,wind_speed_10m
 *
 * This module does NOT:
 * - modify the P1 engine
 * - decide capacity/travel-time values (see weatherImpact.ts)
 *
 * Environment variables (Vite convention for the frontend):
 * - VITE_WEATHER_API_URL — override the endpoint (e.g. a proxy or OpenWeather-backed adapter)
 * - VITE_WEATHER_API_KEY — appended as `key=` query param, ONLY if set (OpenWeather style)
 * - VITE_VENUE_LAT / VITE_VENUE_LON — venue coordinates (default = the demo venue: Mumbai)
 */

// ------------------------------------------------------------
// Internal representation (task-required WeatherSnapshot shape)
// ------------------------------------------------------------

export interface WeatherSnapshot {
  latitude: number
  longitude: number
  /** ISO 8601 timestamp of the observation. */
  timestamp: string
  /** Degrees Celsius. */
  temperature: number
  /** Millimetres in the last hour (Open-Meteo "precipitation"). */
  precipitation: number
  /** km/h. */
  wind: number
  /** Human-readable condition, e.g. "Heavy rain". */
  condition: string
  /** WMO weather code when the source provides one. */
  weatherCode?: number
  /** Where this snapshot really came from — never pretend demo data is live. */
  source: "OPEN_METEO" | "CUSTOM_PROVIDER" | "DEMO_FALLBACK"
}

export interface WeatherProviderResult {
  snapshot: WeatherSnapshot
  /** true when the value came from the real live API. */
  live: boolean
  /** Set when the live call failed and the fallback was used. */
  error?: string
}

// ------------------------------------------------------------
// Demo venue location (documented fixed coordinate mapping)
// ------------------------------------------------------------

/** Demo venue: Mumbai (matches the existing "Mumbai Music Festival" dashboard). */
export const DEMO_VENUE = {
  latitude: 19.076,
  longitude: 72.8777,
  name: "Mumbai Music Festival",
}

// ------------------------------------------------------------
// WMO weather-code mapping (Open-Meteo)
// https://open-meteo.com/en/docs → current.weather_code
// ------------------------------------------------------------

export function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear sky"
  if (code <= 3) return "Cloudy"
  if (code === 45 || code === 48) return "Fog"
  if (code >= 51 && code <= 57) return "Drizzle"
  if (code >= 61 && code <= 65) return code === 65 ? "Heavy rain" : "Rain"
  if (code === 66 || code === 67) return "Freezing rain"
  if (code >= 71 && code <= 77) return "Snow"
  if (code >= 80 && code <= 82) return code === 82 ? "Violent rain showers" : "Rain showers"
  if (code >= 85 && code <= 86) return "Snow showers"
  if (code >= 95) return "Thunderstorm"
  return "Unknown"
}

// ------------------------------------------------------------
// Environment access (browser-safe; mirrors p3Config.ts style)
// ------------------------------------------------------------

function envValue(name: string): string | undefined {
  const holder = globalThis as { process?: { env?: Record<string, string | undefined> } }
  const fromProcess = holder.process?.env?.[name]
  // Vite injects import.meta.env at build time; read it defensively so this
  // module also works under Node (tests / scripts).
  try {
    const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return fromProcess ?? meta?.[name]
  } catch {
    return fromProcess
  }
}

export function venueCoordinates(): { latitude: number; longitude: number; name: string } {
  const lat = Number(envValue("VITE_VENUE_LAT"))
  const lon = Number(envValue("VITE_VENUE_LON"))
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon, name: DEMO_VENUE.name }
  }
  return DEMO_VENUE
}

// ------------------------------------------------------------
// Response parsing (pure — unit-tested)
// ------------------------------------------------------------

/**
 * Parse an Open-Meteo timestamp ("2026-09-24T00:30", naive local per its
 * `utc_offset_seconds` contract) as UTC so behavior is timezone-independent.
 */
function parseIso(value: string): string {
  const withZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`
  return new Date(withZone).toISOString()
}

export interface OpenMeteoCurrentPayload {
  latitude?: number
  longitude?: number
  current?: {
    time?: string
    temperature_2m?: number
    precipitation?: number
    weather_code?: number
    wind_speed_10m?: number
  }
}

export function parseOpenMeteo(
  payload: OpenMeteoCurrentPayload,
  fallbackLocation: { latitude: number; longitude: number },
): WeatherSnapshot {
  const current = payload.current ?? {}
  const temperature = Number(current.temperature_2m)
  const precipitation = Number(current.precipitation ?? 0)
  const wind = Number(current.wind_speed_10m ?? 0)
  const code = Number.isFinite(Number(current.weather_code)) ? Number(current.weather_code) : undefined
  if (!Number.isFinite(temperature)) throw new Error("Weather payload missing temperature_2m")
  return {
    latitude: Number(payload.latitude ?? fallbackLocation.latitude),
    longitude: Number(payload.longitude ?? fallbackLocation.longitude),
    timestamp: current.time ? parseIso(current.time) : new Date().toISOString(),
    temperature,
    precipitation: Number.isFinite(precipitation) ? precipitation : 0,
    wind: Number.isFinite(wind) ? wind : 0,
    condition: code === undefined ? "Unknown" : describeWeatherCode(code),
    weatherCode: code,
    source: "OPEN_METEO",
  }
}

// ------------------------------------------------------------
// Fallback (clearly labelled — never presented as live)
// ------------------------------------------------------------

/**
 * Deterministic demo fallback used ONLY when the live API is unreachable.
 * `source: "DEMO_FALLBACK"` must stay visible in the UI so the limitation
 * is obvious (task requirement: do NOT pretend mocked data is live).
 */
export function demoFallbackSnapshot(location = venueCoordinates()): WeatherSnapshot {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    timestamp: new Date().toISOString(),
    temperature: 27,
    precipitation: 62,
    wind: 18,
    condition: "Heavy rain",
    weatherCode: 65,
    source: "DEMO_FALLBACK",
  }
}

// ------------------------------------------------------------
// Fetch
// ------------------------------------------------------------

export async function fetchCurrentWeather(
  location = venueCoordinates(),
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherProviderResult> {
  const customUrl = envValue("VITE_WEATHER_API_URL")
  const apiKey = envValue("VITE_WEATHER_API_KEY")
  const url = customUrl
    ? `${customUrl}${customUrl.includes("?") ? "&" : "?"}latitude=${location.latitude}&longitude=${location.longitude}${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ""}`
    : `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&wind_speed_unit=kmh`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetchImpl(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`Weather API responded ${response.status}`)
      const payload = (await response.json()) as OpenMeteoCurrentPayload
      return { snapshot: parseOpenMeteo(payload, location), live: true }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { snapshot: demoFallbackSnapshot(location), live: false, error: message }
  }
}
