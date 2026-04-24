/**
 * Integration test: `/admin/feedback/*` proxy routes.
 *
 * These routes sit on the Neotoma server and forward to
 * `agent.neotoma.io` with the shared admin bearer. They are the Phase 4
 * landing for the Inspector feedback scope plan; the contract exercised
 * here:
 *
 *   - `GET /admin/feedback/preflight` is always safe to call and reports
 *     whether the env vars are configured, so the Inspector can flip
 *     between "mirrored-only" and "maintainer triage surface" without a
 *     401.
 *   - Write-capable routes (`pending`, `by_commit`, `status`) refuse to
 *     proxy for anonymous / unverified_client tiers even when the env
 *     vars are set. The UI relies on the 403 body shape to surface a
 *     clear "requires hardware/software AAuth tier" message.
 *   - When env vars are missing, the same routes return 501 with the
 *     sentinel `admin_proxy_unconfigured` error the Inspector keys off
 *     to disable the UI.
 *
 * The upstream fetch itself is exercised against the internal helpers
 * exported from `admin_proxy.ts` rather than a live agent.neotoma.io —
 * we don't want the integration suite to depend on the pipeline being
 * online, and producing real RFC 9421 signatures just to hit the
 * forward path is a lot of ceremony for a branch that is already unit
 * covered by the identity stack.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/actions.js";
import { FEEDBACK_ADMIN_PROXY_INTERNALS } from "../../src/services/feedback/admin_proxy.js";

const TEST_USER_ID = "11111111-1111-1111-1111-111111111119";
const API_PORT = 18119;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

describe("/admin/feedback proxy", () => {
  let httpServer: ReturnType<typeof createServer>;
  const originalBaseUrl = process.env.AGENT_SITE_BASE_URL;
  const originalBearer = process.env.AGENT_SITE_ADMIN_BEARER;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    if (originalBaseUrl !== undefined)
      process.env.AGENT_SITE_BASE_URL = originalBaseUrl;
    else delete process.env.AGENT_SITE_BASE_URL;
    if (originalBearer !== undefined)
      process.env.AGENT_SITE_ADMIN_BEARER = originalBearer;
    else delete process.env.AGENT_SITE_ADMIN_BEARER;

    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("preflight reports configured=false when env vars are missing", async () => {
    delete process.env.AGENT_SITE_BASE_URL;
    delete process.env.AGENT_SITE_ADMIN_BEARER;
    const res = await fetch(`${API_BASE}/admin/feedback/preflight`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      configured: boolean;
      base_url_env: string;
      bearer_env: string;
      allowed_tiers: string[];
    };
    expect(body.configured).toBe(false);
    expect(body.base_url_env).toBe("AGENT_SITE_BASE_URL");
    expect(body.bearer_env).toBe("AGENT_SITE_ADMIN_BEARER");
    expect(body.allowed_tiers).toContain("hardware");
    expect(body.allowed_tiers).toContain("software");
  });

  it("preflight reports configured=true once both env vars are set", async () => {
    process.env.AGENT_SITE_BASE_URL = "https://agent.example.test";
    process.env.AGENT_SITE_ADMIN_BEARER = "test-bearer";
    const res = await fetch(`${API_BASE}/admin/feedback/preflight`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean };
    expect(body.configured).toBe(true);
  });

  it("write-capable routes reject anonymous sessions with 403 admin_proxy_forbidden", async () => {
    process.env.AGENT_SITE_BASE_URL = "https://agent.example.test";
    process.env.AGENT_SITE_ADMIN_BEARER = "test-bearer";
    const res = await fetch(
      `${API_BASE}/admin/feedback/pending?user_id=${TEST_USER_ID}`,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: string;
      tier: string;
    };
    expect(body.error).toBe("admin_proxy_forbidden");
    expect(["anonymous", "unverified_client"]).toContain(body.tier);
  });

  it("by_commit also refuses anonymous — only hardware/software may drive admin writes", async () => {
    process.env.AGENT_SITE_BASE_URL = "https://agent.example.test";
    process.env.AGENT_SITE_ADMIN_BEARER = "test-bearer";
    const res = await fetch(
      `${API_BASE}/admin/feedback/by_commit/abc123?user_id=${TEST_USER_ID}`,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; tier: string };
    expect(body.error).toBe("admin_proxy_forbidden");
    // HTTP-level requests without an AAuth signature and without a
    // client_name propagated through MCP initialize resolve to
    // `anonymous`. Inspector callers hit hardware/software in practice
    // because the IDE propagates AAuth via the session.
    expect(body.tier).toBe("anonymous");
  });

  it("POST /admin/feedback/:id/status also requires tier before considering env", async () => {
    delete process.env.AGENT_SITE_BASE_URL;
    delete process.env.AGENT_SITE_ADMIN_BEARER;
    const res = await fetch(
      `${API_BASE}/admin/feedback/fbk_test_1/status?user_id=${TEST_USER_ID}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "triaged" }),
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("admin_proxy helpers", () => {
  const { readAdminProxyEnv, preflightPayload, enforceTier, sendUnconfigured } =
    FEEDBACK_ADMIN_PROXY_INTERNALS;

  it("readAdminProxyEnv returns null unless both vars are set", () => {
    const originalBaseUrl = process.env.AGENT_SITE_BASE_URL;
    const originalBearer = process.env.AGENT_SITE_ADMIN_BEARER;
    try {
      delete process.env.AGENT_SITE_BASE_URL;
      delete process.env.AGENT_SITE_ADMIN_BEARER;
      expect(readAdminProxyEnv()).toBeNull();
      process.env.AGENT_SITE_BASE_URL = "https://agent.example.test/";
      expect(readAdminProxyEnv()).toBeNull();
      process.env.AGENT_SITE_ADMIN_BEARER = "secret";
      const env = readAdminProxyEnv();
      expect(env).not.toBeNull();
      expect(env?.baseUrl).toBe("https://agent.example.test");
      expect(env?.bearer).toBe("secret");
    } finally {
      if (originalBaseUrl !== undefined)
        process.env.AGENT_SITE_BASE_URL = originalBaseUrl;
      else delete process.env.AGENT_SITE_BASE_URL;
      if (originalBearer !== undefined)
        process.env.AGENT_SITE_ADMIN_BEARER = originalBearer;
      else delete process.env.AGENT_SITE_ADMIN_BEARER;
    }
  });

  it("preflightPayload surfaces env-var names so the UI can instruct operators", () => {
    expect(preflightPayload(true)).toEqual({
      configured: true,
      base_url_env: "AGENT_SITE_BASE_URL",
      bearer_env: "AGENT_SITE_ADMIN_BEARER",
      allowed_tiers: ["hardware", "software"],
    });
    expect(preflightPayload(false).configured).toBe(false);
  });

  it("enforceTier accepts hardware and software tiers", () => {
    const mkReq = (tier: string): any => ({
      aauth: {
        verified: tier === "hardware" || tier === "software",
        thumbprint: "thumb",
        algorithm: tier === "hardware" ? "ES256" : "EdDSA",
        sub: "agent",
        publicKey: "key",
      },
    });
    const mkRes = (): any => {
      const res = {
        statusCode: 0,
        payload: undefined as unknown,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(value: unknown) {
          this.payload = value;
          return this;
        },
      };
      return res;
    };

    // hardware tier (ES256) passes
    const res1 = mkRes();
    expect(enforceTier(mkReq("hardware"), res1 as any)).toBe(true);
    expect(res1.statusCode).toBe(0);

    // software tier (EdDSA) passes
    const res2 = mkRes();
    expect(enforceTier(mkReq("software"), res2 as any)).toBe(true);
    expect(res2.statusCode).toBe(0);
  });

  it("enforceTier rejects requests with no AAuth context (anonymous)", () => {
    const res = {
      statusCode: 0,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(value: unknown) {
        this.payload = value;
        return this;
      },
    };
    const req = {} as any;
    expect(enforceTier(req, res as any)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect((res.payload as any).error).toBe("admin_proxy_forbidden");
  });

  it("sendUnconfigured surfaces which env vars are missing for operator debugging", () => {
    const res = {
      statusCode: 0,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(value: unknown) {
        this.payload = value;
        return this;
      },
    };
    const originalBaseUrl = process.env.AGENT_SITE_BASE_URL;
    const originalBearer = process.env.AGENT_SITE_ADMIN_BEARER;
    try {
      delete process.env.AGENT_SITE_BASE_URL;
      delete process.env.AGENT_SITE_ADMIN_BEARER;
      sendUnconfigured(res as any);
      expect(res.statusCode).toBe(501);
      expect((res.payload as any).error).toBe("admin_proxy_unconfigured");
      expect((res.payload as any).missing).toEqual([
        "AGENT_SITE_BASE_URL",
        "AGENT_SITE_ADMIN_BEARER",
      ]);
    } finally {
      if (originalBaseUrl !== undefined)
        process.env.AGENT_SITE_BASE_URL = originalBaseUrl;
      else delete process.env.AGENT_SITE_BASE_URL;
      if (originalBearer !== undefined)
        process.env.AGENT_SITE_ADMIN_BEARER = originalBearer;
      else delete process.env.AGENT_SITE_ADMIN_BEARER;
    }
  });
});
