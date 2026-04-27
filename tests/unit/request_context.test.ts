/**
 * Unit tests for `src/services/request_context.ts` (Phase 1.7).
 *
 * Verifies that `AsyncLocalStorage`-based propagation works the way the
 * write-path services rely on: nested awaits see the same identity,
 * outside-the-store callers see null, and `getCurrentAttribution` stamps
 * every field from the active identity.
 */

import { describe, expect, it } from "vitest";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import {
  getCurrentAgentIdentity,
  getCurrentAttribution,
  getRequestContext,
  runWithRequestContext,
} from "../../src/services/request_context.js";

describe("request_context", () => {
  it("returns null when no context is active", () => {
    expect(getRequestContext()).toBeNull();
    expect(getCurrentAgentIdentity()).toBeNull();
    expect(getCurrentAttribution()).toEqual({});
  });

  it("propagates an identity through nested awaits", async () => {
    const identity = createAgentIdentity({
      publicKey: "pk",
      thumbprint: "tp",
      algorithm: "ES256",
      sub: "agent:x",
      // Hardware tier requires attestation; tests that pass-through identity
      // need to stamp the tier explicitly. Algorithm-only inference is gone
      // (see docs/subsystems/aauth_attestation.md).
      tier: "hardware",
    });

    await runWithRequestContext({ agentIdentity: identity }, async () => {
      expect(getCurrentAgentIdentity()).toBe(identity);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(getCurrentAgentIdentity()).toBe(identity);
      const prov = getCurrentAttribution();
      expect(prov.agent_thumbprint).toBe("tp");
      expect(prov.attribution_tier).toBe("hardware");
    });

    expect(getCurrentAgentIdentity()).toBeNull();
  });

  it("isolates concurrent requests", async () => {
    const a = createAgentIdentity({ clientName: "Agent-A" });
    const b = createAgentIdentity({ clientName: "Agent-B" });

    const results = await Promise.all([
      runWithRequestContext({ agentIdentity: a }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getCurrentAgentIdentity()?.clientName;
      }),
      runWithRequestContext({ agentIdentity: b }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return getCurrentAgentIdentity()?.clientName;
      }),
    ]);

    expect(results).toEqual(["Agent-A", "Agent-B"]);
  });
});
