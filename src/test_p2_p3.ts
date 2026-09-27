import { P3Client } from "./ai/p3/client";
import { proposeStrategyToP3 } from "./ai/p3/strategy_service";
import type { MitigationStrategy } from "./strategies/strategy_model";

const P3_BASE_URL = "http://localhost:8000";

// Use the actual event ID once P3 creates an event.
const EVENT_ID = "test-event-id";

const strategy: MitigationStrategy = {
  strategy_id: "ST-001",
  name: "Gate Flow Redistribution",
  version: "1.0",
  description:
    "Redirect incoming attendees from a congested source gate to an available alternative destination.",
  objective: "redistribute_flow",

  trigger: {
    condition: "gate_congestion",
    description: "Triggered when a gate becomes congested.",
  },

  actions: [
    {
      type: "redirect_entry_flow",
      source: "GATE_A",
      target: "GATE_B",
      level: "medium",
    },
  ],

  parameters: {
    source_gate: "GATE_A",
    target_gate: "GATE_B",
  },

  constraints: [
    {
      id: "C-001",
      description: "Target gate must be operational.",
      required: true,
    },
  ],

  expected_effects: [
    {
      effect: "reduce_congestion",
      description: "Reduce incoming flow at the congested gate.",
    },
  ],

  approval_required: true,
};

async function main(): Promise<void> {
  console.log("=================================");
  console.log("P2 → P3 CONNECTION TEST");
  console.log("=================================");

  const client = new P3Client({
    baseUrl: P3_BASE_URL,
  });

  console.log("\n[P2] Strategy:");
  console.log(JSON.stringify(strategy, null, 2));

  console.log("\n[P2] Sending strategy to P3...");

  try {
    const result = await proposeStrategyToP3(
      client,
      EVENT_ID,
      strategy,
    );

    console.log("\n[P3] Response:");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n✅ P2 → P3 connection successful.");
  } catch (error) {
    console.error("\n❌ P2 → P3 connection failed.");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

  }
}

main();