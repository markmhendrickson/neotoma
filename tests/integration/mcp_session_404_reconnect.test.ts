/**
 * neotoma#1923 / #2100: remaining unknown-session paths (GET/DELETE) still reply
 * `404 Not Found` with `MCP session is unknown` so proxy recovery keeps matching.
 * Authenticated POST recover-in-place lives in
 * `tests/integration/mcp_session_recover_in_place.test.ts`.
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

  it("returns 404 (not 503) with restart-first copy for GET with an unknown mcp-session-id", async () => {
    const ctx = await bootApp();
    try {
      const fakeSessionId = randomUUID();
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/event-stream",
          "mcp-session-id": fakeSessionId,
        },
      });

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as JsonRpcErrorBody;
      expect(Object.keys(body).sort()).toEqual(["error", "id", "jsonrpc"]);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.error?.code).toBe(-32001);
      expect(typeof body.error?.message).toBe("string");

      const message = (body.error?.message ?? "").toLowerCase();
      expect(message).not.toContain("service unavailable");
      expect(message).toMatch(/mcp session is unknown/);
      expect(message).toMatch(/restart|stale|re-?initializ/);
      expect(message).not.toMatch(/replica|sticky/);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("branch matrix: initialize mint + no-header 400 remain; POST recover moved to #2100", async () => {
    const ctx = await bootApp();
    try {
      // Row 1: session header present but unknown, initialize → 200 with a new session.
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

      // Row 2: no session header, non-initialize → unchanged 400 Bad Request.
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

      // Row 3: no session header, initialize → unchanged 200 with a new session.
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

  it("session-less initialize still registers a transport usable for follow-up POSTs", async () => {
    const ctx = await bootApp();
    try {
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
