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
 *
 * neotoma#2070 (dual-era transport): these legacy semantics now apply only to
 * pre-2026-07-28 clients. A session-less request whose `params._meta`
 * declares protocol version 2026-07-28 is served statelessly and must never
 * reach the unknown-session 404, the no-session 400, or any sticky-session /
 * wrong-replica operator remediation. The dispatcher-edge test pins which
 * request shapes take which path.
 */

import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const MODERN_VERSION = "2026-07-28";

function modernMeta() {
  return {
    "io.modelcontextprotocol/protocolVersion": MODERN_VERSION,
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "neotoma-2070-probe", version: "0.0.0" },
  };
}

function modernHeaders(method: string, name?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": MODERN_VERSION,
    "Mcp-Method": method,
    ...(name ? { "Mcp-Name": name } : {}),
  };
}

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

      // Row 2: no session header, non-initialize, no 2026-07-28 `_meta` (a
      // pre-2026-07-28 client) → unchanged 400 Bad Request. A 2026-07-28 client
      // is served statelessly instead; see the #2070 tests below.
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

  it("#2070: a 2026-07-28 tool call without a session is served, never 404/400, never told to use sticky sessions", async () => {
    const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    );
    const ctx = await bootApp();
    try {
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: modernHeaders("tools/call", "get_authenticated_user"),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 31,
          method: "tools/call",
          params: { name: "get_authenticated_user", arguments: {}, _meta: modernMeta() },
        }),
      });
      const text = await res.text();
      expect(res.status, text).toBe(200);
      expect(res.headers.get("mcp-session-id")).toBeNull();
      const body = JSON.parse(text) as { result?: { resultType?: string; isError?: boolean } };
      expect(body.result?.resultType).toBe("complete");
      expect(body.result?.isError).not.toBe(true);
      expect(text.toLowerCase()).not.toMatch(/sticky|wrong replica|session is unknown|no mcp session/);

      const logged = consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .map((call) => call.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" "))
        .join("\n")
        .toLowerCase();
      expect(logged).not.toMatch(/sticky|wrong replica|unknown or expired mcp-session-id/);
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
      await teardownApp(ctx);
    }
  });

  it("#2070 dispatcher edges: session header or initialize → legacy; 2026-07-28 _meta → stateless; neither → 400", async () => {
    const ctx = await bootApp();
    try {
      // (a) Mcp-Session-Id present (even with 2026-07-28 _meta) → legacy path:
      // the stale id is recovered in place (#2100) under a NEW session id.
      const staleSessionId = randomUUID();
      const withSession = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": staleSessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 41,
          method: "tools/list",
          params: { _meta: modernMeta() },
        }),
      });
      await withSession.text();
      expect(withSession.status).toBe(200);
      const recoveredSessionId = withSession.headers.get("mcp-session-id");
      expect(recoveredSessionId).toBeTruthy();
      expect(recoveredSessionId).not.toBe(staleSessionId);

      // (b) initialize body (even with modern headers) → legacy session mint.
      const init = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: modernHeaders("initialize"),
        body: initializeBody(42),
      });
      await init.text();
      expect(init.status).toBe(200);
      expect(init.headers.get("mcp-session-id")).toBeTruthy();

      // (c) neither + 2026-07-28 _meta → stateless: served, no session minted.
      const stateless = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: modernHeaders("tools/list"),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 43,
          method: "tools/list",
          params: { _meta: modernMeta() },
        }),
      });
      const statelessBody = (await stateless.json()) as {
        result?: { tools?: unknown[]; resultType?: string };
      };
      expect(stateless.status).toBe(200);
      expect(stateless.headers.get("mcp-session-id")).toBeNull();
      expect(statelessBody.result?.resultType).toBe("complete");
      expect(Array.isArray(statelessBody.result?.tools)).toBe(true);

      // (d) neither + no `_meta` → the pre-change 400, not a silent fall-through.
      const neither = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: nonInitializeBody(44),
      });
      expect(neither.status).toBe(400);
      const neitherBody = (await neither.json()) as JsonRpcErrorBody;
      expect(neitherBody.error?.code).toBe(-32000);
    } finally {
      await teardownApp(ctx);
    }
  });
});
