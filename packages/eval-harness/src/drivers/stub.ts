/**
 * Replay-only stub driver.
 *
 * Useful for unit tests and for drivers we have not yet implemented
 * (e.g. local Ollama / Mistral). The stub never goes live; it only
 * walks the cassette against the host-tool registry + Neotoma server.
 */

import type { LLMDriver, DriverInvocation, DriverResult, RunMode } from "../types.js";
import { loadCassetteOrThrow, makeRegistryFor, replayCassetteAgainstServer } from "./base.js";

export class StubDriver implements LLMDriver {
  readonly id = "stub" as const;
  readonly capabilities = { live: false, replay: true };

  preflight(mode: RunMode): { ok: boolean; reason?: string } {
    if (mode === "record") {
      return { ok: false, reason: "stub driver only supports replay mode." };
    }
    return { ok: true };
  }

  async runOnce(invocation: DriverInvocation): Promise<DriverResult> {
    const cassette = loadCassetteOrThrow(invocation);
    const registry = makeRegistryFor(invocation);
    return replayCassetteAgainstServer(invocation, cassette, registry);
  }
}

export const stubDriver = new StubDriver();
