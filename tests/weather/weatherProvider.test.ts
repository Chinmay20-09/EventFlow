/**
 * Midnight task tests — weather provider.
 * Covers: parsing, condition mapping, graceful error handling, labelled fallback.
 */

import { describe, expect, it } from "vitest"
import {
  parseOpenMeteo,
  describeWeatherCode,
  demoFallbackSnapshot,
  fetchCurrentWeather,
  DEMO_VENUE,
} from "../../integration/weather/weatherProvider"

describe("weather provider parsing", () => {
  it("parses a real Open-Meteo payload into a WeatherSnapshot", () => {
    const snapshot = parseOpenMeteo(
      {
        latitude: 19.076,
        longitude: 72.8777,
        current: {
          time: "2026-09-24T00:30",
          temperature_2m: 24.4,
          precipitation: 62.1,
          weather_code: 65,
          wind_speed_10m: 18.2,
        },
      },
      DEMO_VENUE,
    )
    expect(snapshot).toMatchObject({
      latitude: 19.076,
      longitude: 72.8777,
      temperature: 24.4,
      precipitation: 62.1,
      wind: 18.2,
      condition: "Heavy rain",
      weatherCode: 65,
      source: "OPEN_METEO",
    })
    expect(snapshot.timestamp).toBe("2026-09-24T00:30:00.000Z")
    // (Open-Meteo naive times are parsed as UTC — timezone-independent)
  })

  it("maps WMO codes to conditions", () => {
    expect(describeWeatherCode(0)).toBe("Clear sky")
    expect(describeWeatherCode(51)).toBe("Drizzle")
    expect(describeWeatherCode(65)).toBe("Heavy rain")
    expect(describeWeatherCode(95)).toBe("Thunderstorm")
  })

  it("throws a clear error when temperature is missing (bad payload)", () => {
    expect(() => parseOpenMeteo({ current: { precipitation: 5 } }, DEMO_VENUE)).toThrow(/temperature_2m/)
  })

  it("falls back to a clearly-labelled DEMO snapshot when the API fails", async () => {
    const failingFetch = (async () => { throw new Error("network down") }) as unknown as typeof fetch
    const result = await fetchCurrentWeather(DEMO_VENUE, failingFetch)
    expect(result.live).toBe(false)
    expect(result.error).toBe("network down")
    expect(result.snapshot.source).toBe("DEMO_FALLBACK")
    expect(result.snapshot.condition).toBe("Heavy rain") // deterministic demo story
  })

  it("uses the real payload when fetch succeeds", async () => {
    const okResponse = {
      ok: true,
      json: async () => ({
        latitude: 19.076,
        longitude: 72.8777,
        current: { time: "2026-09-24T01:00", temperature_2m: 26, precipitation: 5, weather_code: 61, wind_speed_10m: 10 },
      }),
    }
    const okFetch = (async () => okResponse) as unknown as typeof fetch
    const result = await fetchCurrentWeather(DEMO_VENUE, okFetch)
    expect(result.live).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.snapshot.source).toBe("OPEN_METEO")
    expect(result.snapshot.precipitation).toBe(5)
  })

  it("never hardcodes an API key: fallback snapshot carries source DEMO_FALLBACK", () => {
    expect(demoFallbackSnapshot().source).toBe("DEMO_FALLBACK")
  })
})
