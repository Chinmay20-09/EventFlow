import type {
  P3StrategySetRequest,
  P3StrategySetResponse,
} from "./types";

export interface P3ClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export class P3Client {
  private readonly config: P3ClientConfig;

  constructor(config: P3ClientConfig) {
    this.config = config;
  }

  async createStrategySet(
    eventId: string,
    payload: P3StrategySetRequest
  ): Promise<P3StrategySetResponse> {
    const url = `${this.config.baseUrl}/api/events/${eventId}/strategy-sets`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey
          ? { "X-P2-Service-Key": this.config.apiKey }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorBody: unknown;

      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      throw new Error(
        `P3 strategy-set request failed (${response.status}): ${JSON.stringify(
          errorBody
        )}`
      );
    }

    return (await response.json()) as P3StrategySetResponse;
  }
}