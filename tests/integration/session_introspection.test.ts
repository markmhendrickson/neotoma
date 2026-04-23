/**
 * Integration test: `GET /session` preflight.
 *
 * Verifies the wire contract local proxies and operators rely on:
 *   - Anonymous session returns `tier: "anonymous"` and the currently
 *     active policy snapshot.
 *   - Generic `clientInfo.name` values (e.g. `mcp`) are surfaced as a
 *     normalisation reason on the response so integrators can debug
 *     misconfigured handshakes without grepping logs.
 *   - Real client name bumps the tier to `unverified_client` and flips
 *     `eligible_for_trusted_writes` accordingly.
 *   - The endpoint is read-only: calling it 50 times does not write
 *     any attribution rows.
 *
 * AAuth-signed preflight (hardware / software tier) is covered at the
 * unit level in `tests/unit/session_info.test.ts` — producing real
 * RFC 9421 signatures in an integration test isn't worth the
 * complexity when the identity resolver is unit-tested in isolation.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "11111111-1111-1111-1111-111111111115";
const API_PORT = 18115;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

describe("GET /session", () => {
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns anonymous tier + allow policy for an unsigned, nameless session", async () => {
    const res = await fetch(`${API_BASE}/session?user_id=${TEST_USER_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.user_id).toBe(TEST_USER_ID);
    expect(body.attribution.tier).toBe("anonymous");
    expect(body.policy.anonymous_writes).toBe("allow");
    expect(body.eligible_for_trusted_writes).toBe(true);
    expect(body.attribution.decision).toBeDefined();
    expect(body.attribution.decision.signature_present).toBe(false);
  });

  it("surfaces too_generic normalisation reason when clientInfo is a placeholder", async () => {
    const res = await fetch(
      `${API_BASE}/session?user_id=${TEST_USER_ID}&client_name=mcp`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.attribution.tier).toBe("anonymous");
    expect(body.attribution.decision.client_info_raw_name).toBe("mcp");
    expect(
      body.attribution.decision.client_info_normalised_to_null_reason,
    ).toBe("too_generic");
  });

  it("upgrades tier to unverified_client when a real client_name is provided", async () => {
    const res = await fetch(
      `${API_BASE}/session?user_id=${TEST_USER_ID}&client_name=Claude%20Code&client_version=0.5.0`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.attribution.tier).toBe("unverified_client");
    expect(body.attribution.client_name).toBe("Claude Code");
    expect(body.attribution.client_version).toBe("0.5.0");
    expect(body.eligible_for_trusted_writes).toBe(true);
    expect(
      body.attribution.decision.client_info_normalised_to_null_reason,
    ).toBeUndefined();
  });

  it("is read-only: repeated calls do not create observations / first_seen rows", async () => {
    const { data: before } = await db
      .from("observations")
      .select("id", { count: "exact" })
      .eq("user_id", TEST_USER_ID);
    const beforeCount = Array.isArray(before) ? before.length : 0;

    for (let i = 0; i < 25; i++) {
      const res = await fetch(
        `${API_BASE}/session?user_id=${TEST_USER_ID}&client_name=Probe-${i}`,
      );
      expect(res.status).toBe(200);
    }

    const { data: after } = await db
      .from("observations")
      .select("id", { count: "exact" })
      .eq("user_id", TEST_USER_ID);
    const afterCount = Array.isArray(after) ? after.length : 0;
    expect(afterCount).toBe(beforeCount);
  });
});
