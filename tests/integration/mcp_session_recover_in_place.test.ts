/**
 * neotoma#2100: authenticated POST /mcp with an unknown/expired mcp-session-id
 * recovers in place — mint + synthetic initialize + original tools/call —
 * returning a new mcp-session-id so the client continues without a restart.
 *
 * Boot pattern matches tests/integration/mcp_session_404_reconnect.test.ts.
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

type JsonRpcBody = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: {
    content?: Array<{ type: string; text: string }>;
    protocolVersion?: string;
  };
  error?: { code?: number; message?: string };
};

async function readJsonRpc(response: Response): Promise<JsonRpcBody> {
  const text = await response.text();
  if (!text.trim()) return {};
  if (!text.startsWith("event:")) {
    return JSON.parse(text) as JsonRpcBody;
  }
  const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return {};
  return JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcBody;
}

function toolsCallBody(id: number, name: string, args: Record<string, unknown> = {}) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

describe("POST /mcp recover-in-place for stale sessions (#2100)", () => {
  afterEach(() => {
    vi.resetModules();
    restoreEnv();
  });

  async function bootApp(opts?: { bearerToken?: string }): Promise<{
    baseUrl: string;
    httpServer: ReturnType<typeof createServer>;
    tmpRoot: string;
  }> {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mcp-recover-in-place-"));
    process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
    process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
    process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
    process.env.NEOTOMA_ENV = "development";
    process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
    process.env.NEOTOMA_HTTP_PORT = "0";
    delete process.env.NEOTOMA_KEY_FILE_PATH;
    delete process.env.NEOTOMA_MNEMONIC;
    delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;
    if (opts?.bearerToken) {
      process.env.NEOTOMA_BEARER_TOKEN = opts.bearerToken;
    } else {
      delete process.env.NEOTOMA_BEARER_TOKEN;
    }

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

  it("recovers an authenticated tools/call with a stale session id (effect)", async () => {
    const ctx = await bootApp();
    try {
      const staleSessionId = randomUUID();
      const requestId = 42;
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": staleSessionId,
        },
        body: toolsCallBody(requestId, "get_entity_type_counts", {}),
      });

      expect(res.status).not.toBe(404);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

      const newSessionId = res.headers.get("mcp-session-id");
      expect(newSessionId).toBeTruthy();
      expect(newSessionId).not.toBe(staleSessionId);

      const body = await readJsonRpc(res);
      expect(body.id).toBe(requestId);
      expect(body.error).toBeUndefined();
      expect(body.result).toBeDefined();
      // Must be the tool result, not an initialize result.
      expect(body.result?.protocolVersion).toBeUndefined();
      const text = body.result?.content?.find((item) => item.type === "text")?.text;
      expect(typeof text).toBe("string");
      const payload = JSON.parse(text!) as {
        entities_by_type?: Record<string, number>;
        total_entities?: number;
        count_source?: string;
      };
      expect(payload).toHaveProperty("entities_by_type");
      expect(typeof payload.total_entities).toBe("number");

      const followUp = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": newSessionId!,
        },
        body: toolsCallBody(43, "get_entity_type_counts", {}),
      });
      expect(followUp.status).not.toBe(404);
      expect(followUp.status).toBeGreaterThanOrEqual(200);
      expect(followUp.status).toBeLessThan(300);
      const followBody = await readJsonRpc(followUp);
      expect(followBody.id).toBe(43);
      expect(followBody.error).toBeUndefined();
      expect(followBody.result?.content?.length).toBeGreaterThan(0);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("keeps auth fail-closed: wrong Bearer + stale session → 401, no new session", async () => {
    const ctx = await bootApp({ bearerToken: "shared-secret-token" });
    try {
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-token-value",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": randomUUID(),
        },
        body: toolsCallBody(7, "get_entity_type_counts", {}),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("mcp-session-id")).toBeNull();
      const body = await readJsonRpc(res);
      expect(body.error?.code).toBe(-32001);
      const message = (body.error?.message ?? "").toLowerCase();
      expect(message).not.toMatch(/mcp session is unknown/);
      expect(message).toMatch(/invalid or expired bearer token|unauthorized|authentication/i);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("does not recover GET/DELETE unknown sessions; restart-first copy without sticky", async () => {
    const ctx = await bootApp();
    try {
      const stale = randomUUID();
      for (const method of ["GET", "DELETE"] as const) {
        const res = await fetch(`${ctx.baseUrl}/mcp`, {
          method,
          headers: {
            Accept: "application/json, text/event-stream",
            "mcp-session-id": stale,
          },
        });
        expect(res.status).toBe(404);
        const body = await readJsonRpc(res);
        expect(body.error?.code).toBe(-32001);
        const message = body.error?.message ?? "";
        expect(message.toLowerCase()).toContain("mcp session is unknown");
        expect(message.toLowerCase()).toMatch(/restart|stale|re-?initializ/);
        expect(message).not.toMatch(/sticky|replica/i);
      }

      const noHeader = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: toolsCallBody(9, "get_entity_type_counts", {}),
      });
      expect(noHeader.status).toBe(400);
      const noHeaderBody = await readJsonRpc(noHeader);
      expect(noHeaderBody.error?.code).toBe(-32000);
    } finally {
      await teardownApp(ctx);
    }
  });

  it("concurrent stale-id tools/calls mint distinct new session ids", async () => {
    const ctx = await bootApp();
    try {
      const stale = randomUUID();
      const [a, b] = await Promise.all([
        fetch(`${ctx.baseUrl}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "mcp-session-id": stale,
          },
          body: toolsCallBody(100, "get_entity_type_counts", {}),
        }),
        fetch(`${ctx.baseUrl}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "mcp-session-id": stale,
          },
          body: toolsCallBody(101, "get_entity_type_counts", {}),
        }),
      ]);

      expect(a.status).not.toBe(404);
      expect(b.status).not.toBe(404);
      const idA = a.headers.get("mcp-session-id");
      const idB = b.headers.get("mcp-session-id");
      expect(idA).toBeTruthy();
      expect(idB).toBeTruthy();
      expect(idA).not.toBe(stale);
      expect(idB).not.toBe(stale);
      expect(idA).not.toBe(idB);
    } finally {
      await teardownApp(ctx);
    }
  });
});
