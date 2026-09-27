import type { MitigationStrategy } from "../../strategies/strategy_model";
import type { P3StrategySetResponse } from "./types";
import { P3Client } from "./client";
import { toP3StrategySet } from "./strategy_set";

export async function proposeStrategyToP3(
  client: P3Client,
  eventId: string,
  strategy: MitigationStrategy,
): Promise<P3StrategySetResponse> {
  const payload = toP3StrategySet(strategy);

  return client.createStrategySet(eventId, payload);
}