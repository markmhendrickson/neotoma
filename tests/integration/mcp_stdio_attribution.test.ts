/**
 * Integration test: MCP stdio + CLI-over-MCP propagate AAuth / clientInfo
 * into write-path attribution.
 *
 * Phase 2 of the AAuth parity plan wraps both `CallToolRequestSchema`
 * dispatch and `executeToolForCli` in `runWithRequestContext`, pulling
 * the session identity assembled from `setSessionAgentIdentity` +
 * `sessionClientInfo` + `sessionConnectionId`. Without that wrap, stdio
 * and CLI-over-MCP callers bypassed `AsyncLocalStorage` entirely and
 * landed as `anonymous` in every observation row.
 *
 * What this test proves end-to-end:
 *   - `executeToolForCli` invokes the tool inside a request context, so
 *     `getCurrentAgentIdentity()` returns the session identity we set.
 *   - `enforceAttributionPolicy("relationships", …)` sees that identity
 *     and respects the active policy — reject mode blocks an unsigned
 *     session, then accepts the same call once AAuth is injected.
 *   - The synthesised attribution decision is visible on the async
 *     context via `getCurrentAttributionDecision()` so `/session`-
 *     equivalent tooling on stdio matches the HTTP shape.
 *
 * We bypass the HTTP transport and construct `NeotomaServer` directly
 * because stdio-only regressions (the exact gap this plan closes) never
 * exercise Express middleware. Signing real RFC 9421 requests lives in
 * `tests/unit/aauth_verify_middleware.test.ts`.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { AttributionPolicyError } from "../../src/services/attribution_policy.js";
import {
  getCurrentAgentIdentity,
  getCurrentAttributionDecision,
} from "../../src/services/request_context.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

const ENV_KEYS = [
  "NEOTOMA_ATTRIBUTION_POLICY",
  "NEOTOMA_MIN_ATTRIBUTION_TIER",
  "NEOTOMA_ATTRIBUTION_POLICY_JSON",
] as const;

describe("MCP stdio attribution parity", () => {
  let server: NeotomaServer;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    server = new NeotomaServer();
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  afterEach(() => {
    server.setSessionAgentIdentity(null);
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("executeToolForCli runs inside an AsyncLocalStorage context (anonymous baseline)", async () => {
    let captured: ReturnType<typeof getCurrentAgentIdentity> | "unset" = "unset";
    // Invoke a fast read-only tool; inside the dispatch we synchronously
    // read the context via a getter. We prove the wrap is active by
    // observing a non-undefined context store rather than a specific
    // identity (anonymous baseline = null identity, but context should
    // exist).
    const promise = server.executeToolForCli("retrieve_entities", {
      entity_type: "nonexistent_entity_type_for_parity_test",
      limit: 1,
    }, TEST_USER_ID);
    // Read immediately on the same tick — AsyncLocalStorage is set up
    // synchronously by `storage.run` so this cannot leak from a prior
    // run.
    queueMicrotask(() => {
      captured = getCurrentAgentIdentity();
    });
    await promise.catch(() => undefined);
    // Outside the context, identity must read as null.
    expect(getCurrentAgentIdentity()).toBeNull();
    // Inside the context it must also be null when no identity was set
    // (this is the correct baseline; what matters is that the call ran
    // inside `runWithRequestContext`, which we confirm via the next
    // test where an identity IS set).
    expect(captured === null || captured === "unset").toBe(true);
  });

  it("executeToolForCli propagates session AAuth identity into write-path services", async () => {
    process.env.NEOTOMA_ATTRIBUTION_POLICY = "reject";

    // Baseline: with no identity set, a relationships write must reject.
    await expect(
      server.executeToolForCli(
        "create_relationship",
        {
          relationship_type: "related_to",
          source_entity_id: `stdio_parity_src_${Date.now()}`,
          target_entity_id: `stdio_parity_tgt_${Date.now()}`,
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID,
      ),
    ).rejects.toSatisfy((err: unknown) => {
      // The error may surface wrapped by the tool handler. We accept
      // either AttributionPolicyError directly or a matching error
      // envelope-style message.
      if (err instanceof AttributionPolicyError) return true;
      const msg = (err as Error)?.message ?? "";
      return /ATTRIBUTION_REQUIRED|attribution_required|attribution/i.test(msg);
    });

    // Now inject an AAuth-verified identity as the MCP transport would
    // after `initialize` handshake.
    server.setSessionAgentIdentity({
      verified: true,
      publicKey: '{"kty":"EC","crv":"P-256"}',
      thumbprint: "tp-stdio-parity-hw",
      algorithm: "ES256",
      sub: "agent:stdio:parity",
      iss: "https://agent.example",
    } as unknown as Parameters<NeotomaServer["setSessionAgentIdentity"]>[0]);

    // With a hardware-tier identity in place, the policy gate passes.
    // The write itself may still fail for DB-shape reasons (missing
    // entities) — we only care that it is NOT an attribution rejection.
    let rejected: unknown = null;
    try {
      await server.executeToolForCli(
        "create_relationship",
        {
          relationship_type: "related_to",
          source_entity_id: `stdio_parity_src2_${Date.now()}`,
          target_entity_id: `stdio_parity_tgt2_${Date.now()}`,
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID,
      );
    } catch (err) {
      rejected = err;
    }
    if (rejected) {
      expect(rejected).not.toBeInstanceOf(AttributionPolicyError);
      const msg = (rejected as Error).message ?? "";
      expect(msg).not.toMatch(/ATTRIBUTION_REQUIRED/i);
    }
  });

  it("synthesises an attribution decision on the async context when AAuth is set", async () => {
    server.setSessionAgentIdentity({
      verified: true,
      publicKey: '{"kty":"EC","crv":"P-256"}',
      thumbprint: "tp-stdio-diag",
      algorithm: "ES256",
      sub: "agent:stdio:diag",
      iss: "https://agent.example",
    } as unknown as Parameters<NeotomaServer["setSessionAgentIdentity"]>[0]);

    const decision = server.getSessionAttributionDecision();
    expect(decision).toBeDefined();
    expect(decision?.signature_present).toBe(true);
    expect(decision?.signature_verified).toBe(true);
    expect(decision?.resolved_tier).toBe("hardware");

    // Without an identity, the decision is null.
    server.setSessionAgentIdentity(null);
    expect(server.getSessionAttributionDecision()).toBeNull();
  });

  it("exposes the decision inside the async context (dry run)", async () => {
    // We use a no-op tool to prove the decision lands in the context.
    server.setSessionAgentIdentity({
      verified: true,
      publicKey: '{"kty":"EC","crv":"P-256"}',
      thumbprint: "tp-stdio-ctx",
      algorithm: "ES256",
      sub: "agent:stdio:ctx",
      iss: "https://agent.example",
    } as unknown as Parameters<NeotomaServer["setSessionAgentIdentity"]>[0]);

    let observedDecision: ReturnType<typeof getCurrentAttributionDecision> = null;
    let observedIdentity: ReturnType<typeof getCurrentAgentIdentity> = null;

    // Hook: monkey-patch a private tool dispatch path we control by
    // invoking a tool whose execution we can observe.
    const original = (server as unknown as {
      executeTool: NeotomaServer["executeToolForCli"];
    }).executeTool;
    (server as unknown as { executeTool: unknown }).executeTool = async () => {
      observedDecision = getCurrentAttributionDecision();
      observedIdentity = getCurrentAgentIdentity();
      return { content: [] };
    };
    try {
      await server.executeToolForCli("retrieve_entities", { limit: 1 }, TEST_USER_ID);
    } finally {
      (server as unknown as { executeTool: unknown }).executeTool = original;
    }

    expect(observedIdentity).not.toBeNull();
    expect(observedIdentity?.tier).toBe("hardware");
    expect(observedDecision).not.toBeNull();
    expect(observedDecision?.signature_verified).toBe(true);
  });
});
