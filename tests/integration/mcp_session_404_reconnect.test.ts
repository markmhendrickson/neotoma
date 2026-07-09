/**
 * neotoma#1923: MCP streamable-HTTP session handling must reply `404 Not
 * Found` (not `503 Service Unavailable`) to a POST carrying an unknown or
 * expired `mcp-session-id`, so spec-compliant clients auto-reinitialize
 * (MCP Streamable HTTP transport spec, Session Management §4) instead of
 * treating the server as unavailable and giving up.
 *
 * Boots the real Express `app` (src/actions.ts) on a loopback port with no
 * auth configured, so requests are admitted via the local dev-http path —
 * same pattern as tests/integration/mcp_invalid_bearer_auth.test.ts and
 * tests/integration/correct_http_mcp_parity.test.ts.
 */

import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_ENCRYPTION_ENABLED",
  "NEOTOMA_ENV",
  "NEOTOMA_HOST_URL",
  "NEOTOMA_HTTP_PORT",
  "NEOTOMA_KEY_FILE_PATH",
  "NEOTOMA_MNEMONIC",
  "NEOTOMA_MNEMONIC_PASSPHRASE",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function initializeBody(id: number) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "neotoma-1923-probe", version: "0.0.0" },
    },
  });
}

function nonInitializeBody(id: number) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/list",
    params: {},
  });
}

type JsonRpcErrorBody = {
  jsonrpc?: string;
  error?: { code?: number; message?: string };
  id?: number | string | null;
};

describe("POST /mcp unknown-session handling (#1923)", () => {
  afterEach(() => {
    vi.resetModules();
    restoreEnv();
  });

  async function bootApp(): Promise<{
    baseUrl: string;
    httpServer: ReturnType<typeof createServer>;
    tmpRoot: string;
  }> {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mcp-404-reconnect-"));
    process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
    process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
    process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
    process.env.NEOTOMA_ENV = "development";
    process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
    process.env.NEOTOMA_HTTP_PORT = "0";
    delete process.env.NEOTOMA_BEARER_TOKEN;
    delete process.env.NEOTOMA_KEY_FILE_PATH;
    delete process.env.NEOTOMA_MNEMONIC;
    delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;

    vi.resetModules();
    const { app } = await import("../../src/actions.js");

    const httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }
    return { baseUrl: `http://127.0.0.1:${address.port}`, httpServer, tmpRoot };
  }

  async function teardownApp(ctx: {
    httpServer: ReturnType<typeof createServer>;
    tmpRoot: string;
  }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      ctx.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(ctx.tmpRoot, { recursive: true, force: true });
  }

  it("returns 404 (not 503) with a spec-aligned re-initialize message for an unknown mcp-session-id", async () => {
    const ctx = await bootApp();
    try {
      const fakeSessionId = randomUUID();
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": fakeSessionId,
        },
        body: nonInitializeBody(1),
      });

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as JsonRpcErrorBody;
      expect(Object.keys(body).sort()).toEqual(["error", "id", "jsonrpc"]);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(1);
      expect(body.error?.code).toBe(-32001);
      expect(typeof body.error?.message).toBe("string");

      const message = (body.error?.message ?? "").toLowerCase();
      expect(message).not.toContain("service unavailable");
      expect(message).not.toContain("unavailable");
      expect(message).toMatch(/session.*(unknown|expired)/);
      expect(message).toMatch(/re-?initializ/);
      expect(message).toMatch(/replica|sticky/);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("branch matrix: only the (hadSessionHeader=true, unknown session, non-init) case changes to 404", async () => {
    const ctx = await bootApp();
    try {
      // Row 1: session header present but unknown, non-initialize -> 404 (the fix).
      const unknownSessionRes = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": randomUUID(),
        },
        body: nonInitializeBody(10),
      });
      expect(unknownSessionRes.status).toBe(404);

      // Row 2: session header present but unknown, initialize request -> unaffected,
      // still 200 with a freshly minted session (init branch ignores stale session ids).
      const initWithStaleSessionRes = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": randomUUID(),
        },
        body: initializeBody(11),
      });
      expect(initWithStaleSessionRes.status).toBe(200);
      expect(initWithStaleSessionRes.headers.get("mcp-session-id")).toBeTruthy();

      // Row 3: no session header, non-initialize -> unchanged 400 Bad Request.
      const noSessionRes = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: nonInitializeBody(12),
      });
      expect(noSessionRes.status).toBe(400);
      const noSessionBody = (await noSessionRes.json()) as JsonRpcErrorBody;
      expect(noSessionBody.error?.code).toBe(-32000);

      // Row 4: no session header, initialize -> unchanged 200 with a new session.
      const freshInitRes = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: initializeBody(13),
      });
      expect(freshInitRes.status).toBe(200);
      expect(freshInitRes.headers.get("mcp-session-id")).toBeTruthy();
    } finally {
      await teardownApp(ctx);
    }
  });

  it("reconnect round-trip: 404 on stale session, then a session-less initialize succeeds and registers a new transport", async () => {
    const ctx = await bootApp();
    try {
      const staleSessionId = randomUUID();

      // Step 1: simulate a post-restart client replaying its old session id.
      const staleRes = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": staleSessionId,
        },
        body: nonInitializeBody(20),
      });
      expect(staleRes.status).toBe(404);

      // Step 2: spec-compliant client behavior on 404 — re-initialize with NO session id.
      const reinitRes = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: initializeBody(21),
      });
      expect(reinitRes.status).toBe(200);
      const newSessionId = reinitRes.headers.get("mcp-session-id");
      expect(newSessionId).toBeTruthy();
      expect(newSessionId).not.toBe(staleSessionId);

      // Step 3: the new session id is live and usable for a subsequent request —
      // proves recovery actually completed, not just that initialize returned 200.
      const followUpRes = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": newSessionId!,
        },
        body: nonInitializeBody(22),
      });
      expect(followUpRes.status).not.toBe(404);
      expect(followUpRes.status).not.toBe(400);
    } finally {
      await teardownApp(ctx);
    }
  });
});
