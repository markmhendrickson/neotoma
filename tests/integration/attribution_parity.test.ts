/**
 * Integration test: attribution parity across HTTP direct-write routes.
 *
 * Before Phase 1 of the AAuth parity plan, the `aauthVerify` middleware
 * and the per-request `AsyncLocalStorage` context were only mounted on
 * `/mcp` and `/session`. Direct-write HTTP routes (`/store`, `/correct`,
 * `/observations/create`, `/create_relationship`, …) bypassed both, so
 * `enforceAttributionPolicy` always saw `null` identity and every write
 * landed as `anonymous` regardless of the caller's AAuth signature or
 * `X-Client-Name` header.
 *
 * This test asserts the new contract:
 *   - Unsigned, no-client-name callers land as `anonymous` and are
 *     rejected when `NEOTOMA_ATTRIBUTION_POLICY=reject`.
 *   - Callers with `X-Client-Name` land as `unverified_client` and are
 *     allowed under `reject` mode (unless `NEOTOMA_MIN_ATTRIBUTION_TIER`
 *     floors the decision).
 *
 * We spin the Express `app` up directly (no network proxy) so the
 * middleware ordering we apply in `src/actions.ts` is exercised exactly
 * as it ships. AAuth-signature-level coverage lives in
 * `tests/integration/aauth_attribution_stamping.test.ts`; we don't
 * duplicate the RFC 9421 signer here.
 */

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, afterEach, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";

const API_PORT = 18134;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

const ENV_KEYS = [
  "NEOTOMA_ATTRIBUTION_POLICY",
  "NEOTOMA_MIN_ATTRIBUTION_TIER",
  "NEOTOMA_ATTRIBUTION_POLICY_JSON",
] as const;

describe("attribution parity: HTTP direct write routes", () => {
  let httpServer: Server;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  function setPolicy(mode: "allow" | "warn" | "reject"): void {
    process.env.NEOTOMA_ATTRIBUTION_POLICY = mode;
  }

  let idCounter = 0;
  function nextIdempotencyKey(label: string): string {
    idCounter += 1;
    return `parity_http_${label}_${Date.now()}_${idCounter}`;
  }

  async function callCorrect(
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return fetch(`${API_BASE}/correct`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  function baseCorrectPayload(label: string): Record<string, unknown> {
    const suffix = nextIdempotencyKey(label);
    return {
      entity_id: `ent_${suffix}`,
      entity_type: "note",
      field: "title",
      value: label,
      idempotency_key: suffix,
      user_id: TEST_USER_ID,
    };
  }

  interface ErrorEnvelope {
    error_code?: string;
    message?: string;
    details?: Record<string, unknown>;
  }

  it("/correct without AAuth or X-Client-Name is rejected under reject mode", async () => {
    setPolicy("reject");
    const res = await callCorrect({}, baseCorrectPayload("reject"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error_code).toBe("ATTRIBUTION_REQUIRED");
  });

  it("/correct with X-Client-Name lifts the tier above anonymous under reject mode", async () => {
    setPolicy("reject");
    const res = await callCorrect(
      {
        "x-client-name": "cli-integration-test",
        "x-client-version": "1.2.3",
      },
      baseCorrectPayload("allow"),
    );
    // reject mode treats anonymous writes as blocked. X-Client-Name
    // upgrades the tier to `unverified_client`, which passes the
    // policy gate. The write may still fail downstream for DB-shape
    // reasons — we only care that attribution did not reject.
    if (res.status === 403) {
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error_code).not.toBe("ATTRIBUTION_REQUIRED");
    } else {
      expect([200, 400, 500]).toContain(res.status);
    }
  });

  it("/correct with generic X-Client-Name values is still treated as anonymous", async () => {
    setPolicy("reject");
    // 'mcp' is on the GENERIC_CLIENT_NAMES list in src/crypto/agent_identity.ts.
    const res = await callCorrect(
      { "x-client-name": "mcp" },
      baseCorrectPayload("generic"),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error_code).toBe("ATTRIBUTION_REQUIRED");
  });

  it("/correct under min_tier=software still rejects unverified_client", async () => {
    setPolicy("allow");
    process.env.NEOTOMA_MIN_ATTRIBUTION_TIER = "software";
    const res = await callCorrect(
      { "x-client-name": "cli-min-tier" },
      baseCorrectPayload("min_tier"),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error_code).toBe("ATTRIBUTION_REQUIRED");
  });

  it("default (allow) policy lets unsigned requests through", async () => {
    const res = await callCorrect({}, baseCorrectPayload("default"));
    // No policy error shape, regardless of downstream success / failure.
    if (res.status === 403) {
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error_code).not.toBe("ATTRIBUTION_REQUIRED");
    } else {
      expect([200, 400, 500]).toContain(res.status);
    }
  });
});
