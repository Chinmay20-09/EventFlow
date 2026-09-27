/**
 * P1 execution runner — the child-process boundary between P3 (FastAPI) and
 * the real deterministic engine (engine/src).
 *
 * Sibling of `scripts/pushToP3.ts` and part of the same integration
 * architecture: P1 stays a pure calculation library and this runner is the
 * only place where the engine is invoked from the outside. FastAPI depends
 * on NOTHING TypeScript — the contract is JSON over stdio:
 *
 *   stdin:   a complete P1 `SandboxInput` (engine/src/types.ts)
 *   stdout:  `serializeSimulationResult(runSandbox(input))` — the exact
 *            snake_case payload accepted by POST /api/internal/simulations
 *   stderr:  diagnostics
 *   exit 0:  the engine produced a result (any SimulationStatus)
 *   exit 1:  the input was rejected or the engine threw (message on stderr)
 *
 * Invoked by `backend/app/services/adapters/p1_engine.py`
 * (RealP1EngineAdapter) as `node node_modules/tsx/dist/cli.mjs <this file>`.
 */
import { readFileSync } from "node:fs"
import { runSandbox, serializeSimulationResult } from "../../engine/src/index"
import type { SandboxInput } from "../../engine/src/types"

function main(): void {
  const raw = readFileSync(0, "utf8")
  let input: SandboxInput
  try {
    input = JSON.parse(raw) as SandboxInput
  } catch (error) {
    console.error(`[p1Runner] invalid JSON on stdin: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
  try {
    const result = runSandbox(input)
    process.stdout.write(JSON.stringify(serializeSimulationResult(result)))
  } catch (error) {
    // Engine-rejected input (invalid graph, scenario, disruption, ...): the
    // failure is real, never replaced by a fabricated result.
    console.error(`[p1Runner] engine error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

main()
