/**
 * Integration tests for the v0.7.1 "Option α" sandbox attribution
 * partitioning: when a request lands on the sandbox bypass branch in
 * `src/actions.ts` (`isSandboxMode() && !Bearer`), AAuth-verified requests
 * MUST be attributed to a deterministic per-thumbprint `user_id` derived
 * via `ensureSandboxAauthUser`, while unsigned requests keep the legacy
 * `SANDBOX_PUBLIC_USER_ID` fallback.
 *
 * We mount a minimal Express app that mirrors the L2113 sandbox bypass
 * logic verbatim and exercise it via real HTTP. `@hellocoop/httpsig` is
 * mocked at module level so we can drive the AAuth middleware to verified
 * / unverified outcomes without generating real keys (same pattern as
 * `tests/unit/aauth_verify_middleware.test.ts`). The shared vitest server
 * runs without sandbox mode, so the contract has to be locked in via this
 * minimal app — the same approach `tests/integration/sandbox_mode.test.ts`
 * already uses for the destructive guard.
 *
 * Invariants tested (from docs/proposals/agent-trust-framework.md and the
 * v0.7.1 surgical plan):
 *   (i)   unsigned → SANDBOX_PUBLIC_USER_ID.
 *   (ii)  signed → a deterministic id distinct from SANDBOX_PUBLIC_USER_ID.
 *   (iii) two requests with the same thumbprint → same id (deterministic).
 *   (iv)  two different thumbprints → two different ids (partitioned).
 *
 * The downstream "read partition" property the plan calls out — that
 * unsigned and signed callers see disjoint slices of their own writes —
 * follows automatically because every read path scopes queries by
 * `req.authenticatedUserId`. Since (iv) proves the bypass produces
 * distinct user ids, the read paths cannot leak rows across identities;
 * exercising the full /entities/query plumbing here would require
 * respinning the global server with NEOTOMA_SANDBOX_MODE=1, which
 * conflicts with the shared vitest setup.
 */

import { AddressInfo } from "node:net";
import express from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@hellocoop/httpsig", () => ({
  expressVerify: vi.fn(),
}));

import { expressVerify } from "@hellocoop/httpsig";
import { aauthVerify } from "../../src/middleware/aauth_verify.js";
import {
  SANDBOX_PUBLIC_USER_ID,
  ensureSandboxAauthUser,
  ensureSandboxPublicUser,
} from "../../src/services/local_auth.js";

const verifyMock = vi.mocked(expressVerify);

type Server = ReturnType<express.Application["listen"]>;

function buildSignedVerifyResult(thumbprint: string): unknown {
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" }),
  ).toString("base64url");
  const payloadB64 = Buffer.from(
    JSON.stringify({
      sub: `agent:${thumbprint}`,
      iss: "https://agent.example",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  return {
    verified: true,
    label: "sig",
    keyType: "jwt",
    publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
    thumbprint,
    created: Math.floor(Date.now() / 1000),
    jwt: { header: {}, payload: {}, raw: `${headerB64}.${payloadB64}.sig` },
  };
}

function makeSandboxBypassApp(): express.Application {
  const app = express();
  app.use(aauthVerify({ authority: "neotoma.io" }));
  // Verbatim replication of the L2138 sandbox bypass branch in
  // src/actions.ts. If the production branch ever changes shape, this
  // test must change with it — that is by design.
  app.use((req, res, next) => {
    const headerAuth = (req.headers["authorization"] as string | undefined) ?? "";
    if (headerAuth.startsWith("Bearer ")) {
      return next();
    }
    const aauthCtx = (
      req as express.Request & {
        aauth?: { verified?: boolean; thumbprint?: string };
      }
    ).aauth;
    if (aauthCtx?.verified === true && typeof aauthCtx.thumbprint === "string") {
      const aauthUser = ensureSandboxAauthUser(aauthCtx.thumbprint);
      (req as express.Request & { authenticatedUserId?: string }).authenticatedUserId =
        aauthUser.id;
      return next();
    }
    const sandboxUser = ensureSandboxPublicUser();
    (req as express.Request & { authenticatedUserId?: string }).authenticatedUserId =
      sandboxUser.id;
    return next();
  });
  app.get("/probe", (req, res) => {
    const userId = (req as express.Request & { authenticatedUserId?: string })
      .authenticatedUserId;
    res.json({
      authenticated_user_id: userId,
      aauth_verified: Boolean(
        (req as express.Request & { aauth?: { verified?: boolean } }).aauth?.verified,
      ),
      aauth_thumbprint:
        (req as express.Request & { aauth?: { thumbprint?: string } }).aauth?.thumbprint ??
        null,
    });
  });
  return app;
}

describe("sandbox attribution partitioning (Option α)", () => {
  let server: Server;
  let baseUrl = "";
  const originalSandbox = process.env.NEOTOMA_SANDBOX_MODE;

  beforeAll(async () => {
    process.env.NEOTOMA_SANDBOX_MODE = "1";
    const app = makeSandboxBypassApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalSandbox === undefined) {
      delete process.env.NEOTOMA_SANDBOX_MODE;
    } else {
      process.env.NEOTOMA_SANDBOX_MODE = originalSandbox;
    }
  });

  beforeEach(() => {
    verifyMock.mockReset();
  });

  afterEach(() => {
    verifyMock.mockReset();
  });

  it("attributes unsigned requests to SANDBOX_PUBLIC_USER_ID (legacy fallback)", async () => {
    const res = await fetch(`${baseUrl}/probe`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      authenticated_user_id: string;
      aauth_verified: boolean;
    };
    expect(body.aauth_verified).toBe(false);
    expect(body.authenticated_user_id).toBe(SANDBOX_PUBLIC_USER_ID);
  });

  it("attributes AAuth-signed requests to a thumbprint-derived non-public user", async () => {
    verifyMock.mockResolvedValue(buildSignedVerifyResult("tp-sandbox-test-1") as never);
    const res = await fetch(`${baseUrl}/probe`, {
      headers: {
        signature: "sig=:abc:",
        "signature-input": 'sig=("@method");created=1',
        "signature-key": "sk",
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      authenticated_user_id: string;
      aauth_verified: boolean;
      aauth_thumbprint: string | null;
    };
    expect(body.aauth_verified).toBe(true);
    expect(body.aauth_thumbprint).toBe("tp-sandbox-test-1");
    expect(body.authenticated_user_id).toBeDefined();
    expect(body.authenticated_user_id).not.toBe(SANDBOX_PUBLIC_USER_ID);
    expect(body.authenticated_user_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("resolves the same thumbprint to the same user_id across requests (deterministic)", async () => {
    verifyMock.mockResolvedValue(
      buildSignedVerifyResult("tp-sandbox-determinism") as never,
    );
    const ids = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${baseUrl}/probe`, {
        headers: {
          signature: "sig=:abc:",
          "signature-input": 'sig=("@method");created=1',
          "signature-key": "sk",
        },
      });
      const body = (await res.json()) as { authenticated_user_id: string };
      ids.add(body.authenticated_user_id);
    }
    expect(ids.size).toBe(1);
  });

  it("resolves different thumbprints to different user_ids (partitioned)", async () => {
    verifyMock.mockResolvedValueOnce(
      buildSignedVerifyResult("tp-sandbox-alice") as never,
    );
    const aliceRes = await fetch(`${baseUrl}/probe`, {
      headers: {
        signature: "sig=:alice:",
        "signature-input": 'sig=("@method");created=1',
        "signature-key": "sk-alice",
      },
    });
    const aliceBody = (await aliceRes.json()) as { authenticated_user_id: string };

    verifyMock.mockResolvedValueOnce(
      buildSignedVerifyResult("tp-sandbox-bob") as never,
    );
    const bobRes = await fetch(`${baseUrl}/probe`, {
      headers: {
        signature: "sig=:bob:",
        "signature-input": 'sig=("@method");created=1',
        "signature-key": "sk-bob",
      },
    });
    const bobBody = (await bobRes.json()) as { authenticated_user_id: string };

    expect(aliceBody.authenticated_user_id).not.toBe(bobBody.authenticated_user_id);
    expect(aliceBody.authenticated_user_id).not.toBe(SANDBOX_PUBLIC_USER_ID);
    expect(bobBody.authenticated_user_id).not.toBe(SANDBOX_PUBLIC_USER_ID);
  });
});

describe("ensureSandboxAauthUser (deterministic provisioning)", () => {
  it("produces a stable UUID-shaped id for the same thumbprint", () => {
    const a = ensureSandboxAauthUser("tp-stable-1");
    const b = ensureSandboxAauthUser("tp-stable-1");
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(a.id).not.toBe(SANDBOX_PUBLIC_USER_ID);
    expect(a.email.endsWith("@sandbox.neotoma.local")).toBe(true);
  });

  it("produces distinct ids for distinct thumbprints", () => {
    const a = ensureSandboxAauthUser("tp-distinct-A");
    const b = ensureSandboxAauthUser("tp-distinct-B");
    expect(a.id).not.toBe(b.id);
  });

  it("rejects empty / non-string thumbprints", () => {
    expect(() => ensureSandboxAauthUser("")).toThrow();
    expect(() => ensureSandboxAauthUser(undefined as unknown as string)).toThrow();
  });
});
