/**
 * A correctly signed request whose agent-grant lookup fails (a busy or
 * timed-out database read) is refused as a retryable 503
 * `ADMISSION_UNAVAILABLE` with a `Retry-After` header, not as a 401
 * "Missing Bearer token". It is still refused: nothing is written.
 *
 * What stays as it was:
 * - a signed request with no matching grant gets 401 AUTH_REQUIRED;
 * - an unsigned request gets 401 AUTH_REQUIRED.
 *
 * Each case drives the real Express app over HTTP against the local test
 * database as a remote caller (untrusted X-Forwarded-For), so the request
 * runs the real admission middleware, the real `admitFromAAuthContext` and
 * the real route gate. Only the signature verifier and the grant lookup are
 * mocked: the verifier turns a test header into a verified signature, and
 * the lookup throws or finds nothing depending on that header.
 */

import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const SIGNED_HEADER = "x-test-lookup-failed-signed";
const THUMBPRINT_PREFIX = "tp-lookup-failed-";

vi.mock("../../src/middleware/aauth_verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/middleware/aauth_verify.js")>();
  return {
    ...original,
    aauthVerify: () => (req: Request, _res: Response, next: NextFunction) => {
      const signed = req.headers[SIGNED_HEADER];
      if (typeof signed === "string") {
        (req as Request & { aauth?: unknown }).aauth = {
          verified: true,
          publicKey: '{"kty":"EC"}',
          thumbprint: `${THUMBPRINT_PREFIX}${signed}`,
          algorithm: "ES256",
          sub: "writer@agents.test",
          iss: "https://agents.test",
        };
      }
      next();
    },
  };
});

vi.mock("../../src/services/agent_grants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/agent_grants.js")>();
  return {
    ...original,
    lookupGrantForIdentity: async (input: { thumbprint?: string | null }) => {
      const key = (input.thumbprint ?? "").slice(THUMBPRINT_PREFIX.length);
      if (key === "lookup-throws") {
        throw new Error("synthetic: database request timed out");
      }
      return {
        grant: null,
        unbound_claim_match: false,
        inactive_grant: null,
        invalid_grant_id: null,
        pin_conflict: false,
      };
    },
  };
});

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

type Signed = "lookup-throws" | "no-grant" | undefined;

let httpServer: Server;
let baseUrl: string;
const probeType = `lookup_failed_probe_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

async function post(
  path: string,
  body: unknown,
  signed: Signed,
  caller: "remote" | "loopback" = "remote"
): Promise<{ status: number; body: string; retryAfter: string | null }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (caller === "remote") headers["x-forwarded-for"] = "203.0.113.9";
  if (signed) headers[SIGNED_HEADER] = signed;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.text(),
    retryAfter: response.headers.get("retry-after"),
  };
}

function storeBody(marker: string): unknown {
  return {
    idempotency_key: `lookup-failed-${marker}`,
    entities: [{ entity_type: probeType, title: marker }],
  };
}

async function probeRows(): Promise<number> {
  const { data, error } = await db.from("entities").select("id").eq("entity_type", probeType);
  if (error) throw new Error(`probe query failed: ${JSON.stringify(error)}`);
  return (data ?? []).length;
}

const MCP_INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "lookup-failed-test", version: "0.0.0" },
  },
};

beforeAll(async () => {
  httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("expected TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  const { data } = await db.from("entities").select("id").eq("entity_type", probeType);
  for (const row of (data ?? []) as Array<{ id: string }>) {
    await db.from("observations").delete().eq("entity_id", row.id);
    await db.from("entity_snapshots").delete().eq("entity_id", row.id);
    await db.from("entities").delete().eq("id", row.id);
  }
});

describe("POST /store when the agent-grant lookup fails", () => {
  it("answers 503 ADMISSION_UNAVAILABLE with Retry-After and writes nothing", async () => {
    const res = await post("/store", storeBody(`throws-${randomUUID()}`), "lookup-throws");
    expect(res.status, res.body).toBe(503);
    const body = JSON.parse(res.body) as {
      error_code?: string;
      message?: string;
      details?: { retry_after_seconds?: number };
    };
    expect(body.error_code).toBe("ADMISSION_UNAVAILABLE");
    expect(body.message).toMatch(/retry/i);
    expect(res.retryAfter).not.toBeNull();
    const seconds = Number(res.retryAfter);
    expect(Number.isInteger(seconds) && seconds > 0 && seconds <= 10).toBe(true);
    expect(body.details?.retry_after_seconds).toBe(seconds);
    expect(await probeRows()).toBe(0);
  });

  it("keeps 401 AUTH_REQUIRED for a signed request with no matching grant", async () => {
    const res = await post("/store", storeBody(`nogrant-${randomUUID()}`), "no-grant");
    expect(res.status, res.body).toBe(401);
    const body = JSON.parse(res.body) as { error_code?: string; message?: string };
    expect(body.error_code).toBe("AUTH_REQUIRED");
    expect(body.message).toBe("Missing Bearer token");
    expect(res.retryAfter).toBeNull();
    expect(await probeRows()).toBe(0);
  });

  it("keeps 401 AUTH_REQUIRED for an unsigned request", async () => {
    const res = await post("/store", storeBody(`unsigned-${randomUUID()}`), undefined);
    expect(res.status, res.body).toBe(401);
    const body = JSON.parse(res.body) as { error_code?: string; message?: string };
    expect(body.error_code).toBe("AUTH_REQUIRED");
    expect(body.message).toBe("Missing Bearer token");
    expect(await probeRows()).toBe(0);
  });

  it("the row probe finds a write when one is admitted (loopback caller)", async () => {
    // Proves `probeRows` can see a stored row, so its zero above is a real absence.
    const res = await post("/store", storeBody(`loopback-${randomUUID()}`), undefined, "loopback");
    expect(res.status, res.body).toBe(200);
    expect(await probeRows()).toBeGreaterThan(0);
  });
});

describe("POST /mcp when the agent-grant lookup fails", () => {
  it("answers 503 with a JSON-RPC error carrying ADMISSION_UNAVAILABLE and Retry-After", async () => {
    const res = await post("/mcp", MCP_INIT, "lookup-throws");
    expect(res.status, res.body).toBe(503);
    expect(res.retryAfter).not.toBeNull();
    const body = JSON.parse(res.body) as {
      error?: { code?: number; data?: { error_code?: string } };
      id?: unknown;
    };
    expect(body.error?.code).toBe(-32001);
    expect(body.error?.data?.error_code).toBe("ADMISSION_UNAVAILABLE");
    expect(body.id).toBe(1);
  });

  it("keeps 401 for a signed request with no matching grant", async () => {
    const res = await post("/mcp", MCP_INIT, "no-grant");
    expect(res.status, res.body).toBe(401);
  });

  it("keeps 401 for an unsigned request", async () => {
    const res = await post("/mcp", MCP_INIT, undefined);
    expect(res.status, res.body).toBe(401);
  });
});
