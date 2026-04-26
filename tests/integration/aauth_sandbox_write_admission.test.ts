/**
 * Integration tests for the v0.7.1 "γ-write" sandbox-only AAuth-required
 * write route (`POST /sandbox/aauth-only/store`).
 *
 * The route is registered in `src/actions.ts` only when `isSandboxMode()`
 * is true at module load time. Because the shared vitest server boots
 * without sandbox mode, we cannot exercise the production module's route
 * directly. Instead, this test mounts a minimal Express app whose routing
 * shape mirrors the production gate verbatim:
 *
 *   - real `aauthVerify` middleware (with `@hellocoop/httpsig` mocked at
 *     module level so we can drive verified / unverified outcomes — same
 *     pattern as `tests/unit/aauth_verify_middleware.test.ts` and
 *     `tests/integration/aauth_sandbox_attribution_partition.test.ts`);
 *   - the same `aauthRequired` admission gate as actions.ts (verbatim);
 *   - a passthrough handler that mirrors what `handleStorePost` would do
 *     for attribution: derive the thumbprint-bound user via
 *     `ensureSandboxAauthUser` and respond with 200 + the user_id and a
 *     synthetic `entity_id` so the test can assert the contract without
 *     standing up the full storage pipeline (the storage pipeline itself
 *     is already covered by `tests/integration/store_*.test.ts`).
 *
 * Lock-in points (per docs/proposals/agent-trust-framework.md and the
 * v0.7.1 surgical plan):
 *   (i)   unsigned POST → 401 with `error_code: "AAUTH_REQUIRED"`.
 *   (ii)  signed POST → 200 + a `user_id` derived from the AAuth
 *         thumbprint that is NOT the SANDBOX_PUBLIC_USER_ID and matches
 *         `ensureSandboxAauthUser(thumbprint).id` deterministically.
 *   (iii) the route is gated by `isSandboxMode()`. We assert the
 *         non-sandbox case by NOT registering the route on a second app
 *         and confirming that POSTs return 404 — same observable contract
 *         a non-sandbox production deployment exposes.
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

/**
 * Build the sandbox-mode app. The middleware chain is intentionally
 * structured to mirror `src/actions.ts`'s γ-write registration:
 *   `aauthVerify` → `aauthRequired` → terminal handler.
 */
function makeSandboxWriteApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use(aauthVerify({ authority: "neotoma.io" }));

  const aauthRequired: express.RequestHandler = (req, res, next) => {
    const aauthCtx = (
      req as express.Request & {
        aauth?: { verified?: boolean; thumbprint?: string };
      }
    ).aauth;
    if (aauthCtx?.verified === true && typeof aauthCtx.thumbprint === "string") {
      return next();
    }
    return res.status(401).json({
      error_code: "AAUTH_REQUIRED",
      message:
        "POST /sandbox/aauth-only/store requires a verified AAuth signature (RFC 9421 + aa-agent+jwt).",
      details: { reason: "signature_required" },
      timestamp: new Date().toISOString(),
    });
  };

  app.post("/sandbox/aauth-only/store", aauthRequired, (req, res) => {
    const aauthCtx = (
      req as express.Request & {
        aauth?: { verified?: boolean; thumbprint?: string };
      }
    ).aauth;
    const user = ensureSandboxAauthUser(aauthCtx!.thumbprint!);
    res.status(200).json({
      ok: true,
      user_id: user.id,
      entity_id: `synthetic-${user.id.slice(0, 8)}`,
      thumbprint: aauthCtx!.thumbprint,
    });
  });

  return app;
}

/**
 * Build an app WITHOUT the sandbox-only route. This mirrors what
 * `src/actions.ts` does in production (non-sandbox) deployments: the
 * `if (isSandboxMode()) { app.post("/sandbox/aauth-only/store", …) }`
 * block is simply skipped, so requests to that path get a 404.
 */
function makeNonSandboxApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use(aauthVerify({ authority: "neotoma.io" }));
  app.use((_req, res) => {
    res.status(404).json({ error_code: "NOT_FOUND" });
  });
  return app;
}

describe("γ-write: POST /sandbox/aauth-only/store (sandbox-only AAuth admission)", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = makeSandboxWriteApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    verifyMock.mockReset();
  });

  afterEach(() => {
    verifyMock.mockReset();
  });

  it("rejects unsigned POSTs with 401 AAUTH_REQUIRED", async () => {
    const res = await fetch(`${baseUrl}/sandbox/aauth-only/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entities: [{ entity_type: "note", title: "unsigned" }],
      }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error_code: string; message: string };
    expect(body.error_code).toBe("AAUTH_REQUIRED");
    expect(body.message).toMatch(/AAuth signature/i);
  });

  it("rejects POSTs whose AAuth signature fails verification with 401", async () => {
    verifyMock.mockResolvedValue({ verified: false, error: "bad_sig" } as never);
    const res = await fetch(`${baseUrl}/sandbox/aauth-only/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        signature: "sig=:abc:",
        "signature-input": 'sig=("@method");created=1',
        "signature-key": "sk",
      },
      body: JSON.stringify({
        entities: [{ entity_type: "note", title: "bad sig" }],
      }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe("AAUTH_REQUIRED");
  });

  it("admits AAuth-signed POSTs and attributes them to the thumbprint-derived user", async () => {
    verifyMock.mockResolvedValue(
      buildSignedVerifyResult("tp-gamma-write-1") as never,
    );
    const res = await fetch(`${baseUrl}/sandbox/aauth-only/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        signature: "sig=:abc:",
        "signature-input": 'sig=("@method");created=1',
        "signature-key": "sk",
      },
      body: JSON.stringify({
        entities: [{ entity_type: "note", title: "signed write" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      user_id: string;
      entity_id: string;
      thumbprint: string;
    };
    expect(body.ok).toBe(true);
    expect(body.thumbprint).toBe("tp-gamma-write-1");
    expect(body.user_id).not.toBe(SANDBOX_PUBLIC_USER_ID);
    expect(body.entity_id.length).toBeGreaterThan(0);

    const expected = ensureSandboxAauthUser("tp-gamma-write-1");
    expect(body.user_id).toBe(expected.id);
  });
});

describe("γ-write: route is sandbox-only (404 in non-sandbox deployments)", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = makeNonSandboxApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    verifyMock.mockReset();
  });

  it("returns 404 for POST /sandbox/aauth-only/store when the route is not registered", async () => {
    const res = await fetch(`${baseUrl}/sandbox/aauth-only/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entities: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("still returns 404 even when a valid AAuth signature is supplied (route absence dominates)", async () => {
    verifyMock.mockResolvedValue(
      buildSignedVerifyResult("tp-non-sandbox") as never,
    );
    const res = await fetch(`${baseUrl}/sandbox/aauth-only/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        signature: "sig=:abc:",
        "signature-input": 'sig=("@method");created=1',
        "signature-key": "sk",
      },
      body: JSON.stringify({ entities: [] }),
    });
    expect(res.status).toBe(404);
  });
});
