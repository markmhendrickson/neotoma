/**
 * Integration test: the MCP `store` path evaluates the "observations"
 * attribution gate (#2327).
 *
 * Why this test exists separately from
 * `tests/integration/anonymous_write_policy.test.ts`: that test asserts,
 * in its own docblock, that enforcement holds "regardless of transport
 * … because the enforcement seam is deliberately placed inside the
 * service (HTTP / MCP stdio / MCP HTTP / CLI backup all reach the same
 * code path)" — and then calls `createObservation` directly. That is the
 * REST path's helper. The MCP core (`storeStructuredInternal`) does not
 * route through it: it pre-computes the observation id for its dedup
 * probe and inserts into `observations` directly. So the transport claim
 * was asserted by testing the one transport where it happened to hold,
 * and `{"observations":"reject"}` silently did nothing on the primary
 * MCP write path.
 *
 * This test dispatches an actual MCP tool call. It is the coverage the
 * comment claimed and did not have.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

const ENV_KEYS = [
  "NEOTOMA_ATTRIBUTION_POLICY",
  "NEOTOMA_MIN_ATTRIBUTION_TIER",
  "NEOTOMA_ATTRIBUTION_POLICY_JSON",
] as const;

/** Count source rows written under a given idempotency key. */
async function sourceCountForKey(key: string): Promise<number> {
  const { data } = await db
    .from("sources")
    .select("id")
    .eq("user_id", TEST_USER_ID)
    .eq("idempotency_key", key);
  return ((data ?? []) as unknown[]).length;
}

describe("MCP store honours the observations attribution policy (#2327)", () => {
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

  it("T1: rejects an MCP store when {\"observations\":\"reject\"} is configured", async () => {
    process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON = '{"observations":"reject"}';
    const marker = `mcp-attr-t1-${Date.now()}`;

    await expect(
      server.executeToolForCli(
        "store",
        {
          entities: [{ entity_type: "note", title: marker }],
          idempotency_key: marker,
        },
        TEST_USER_ID
      )
    ).rejects.toThrow(/ATTRIBUTION_REQUIRED|Attribution policy|attribution/i);
  });

  it("T2: does not over-reject an AAuth-verified session under the same policy", async () => {
    process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON = '{"observations":"reject"}';
    const marker = `mcp-attr-t2-${Date.now()}`;

    // Inject the session identity the way the MCP transport does after the
    // `initialize` handshake. `executeToolForCli` establishes its own request
    // context from the session identity, so wrapping the call in an outer
    // `runWithRequestContext` would be discarded — the session setter is the
    // seam that actually reaches the gate on this transport.
    server.setSessionAgentIdentity({
      verified: true,
      publicKey: '{"kty":"EC","crv":"P-256"}',
      thumbprint: "tp-mcp-store-2327",
      algorithm: "ES256",
      sub: "agent:mcp-store:2327",
      iss: "https://agent.example",
    } as unknown as Parameters<NeotomaServer["setSessionAgentIdentity"]>[0]);

    const result = await server.executeToolForCli(
      "store",
      {
        entities: [{ entity_type: "note", title: marker, content: marker }],
        idempotency_key: marker,
      },
      TEST_USER_ID
    );
    expect(result).toBeTruthy();
  });

  it("T3: the default policy is unchanged — an unconfigured store still succeeds", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const marker = `mcp-attr-t3-${Date.now()}`;

    const result = await server.executeToolForCli(
      "store",
      {
        entities: [{ entity_type: "note", title: marker }],
        idempotency_key: marker,
      },
      TEST_USER_ID
    );
    expect(result).toBeTruthy();
  });

  it("T4: nothing is persisted when the policy rejects", async () => {
    process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON = '{"observations":"reject"}';
    const marker = `mcp-attr-t4-${Date.now()}`;

    await expect(
      server.executeToolForCli(
        "store",
        {
          entities: [{ entity_type: "note", title: marker }],
          idempotency_key: marker,
        },
        TEST_USER_ID
      )
    ).rejects.toThrow();

    // This is what pins the gate to its placement. Gating next to the
    // observation insert instead of before `storeRawContent` would leave
    // T1 passing while a source row had already been written.
    expect(await sourceCountForKey(marker)).toBe(0);
  });
});
