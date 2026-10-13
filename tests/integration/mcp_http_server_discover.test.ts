/**
 * neotoma#2070 — `server/discover` on POST /mcp (MCP 2026-07-28, SEP-2575).
 *
 * 2026-07-28 removes `initialize`, so `server/discover` is where a modern
 * client learns the server's supported versions, capabilities, identity and
 * instructions. These tests use the real call shape on the real Express app:
 * a session-less POST whose `params._meta` declares the protocol version.
 *
 * Also covered, because they are the failure modes a discover probe hits
 * first: a request with no `_meta` protocol version, a missing required
 * `_meta` field, an unsupported version, and a wrong method name. Each must be
 * a typed error, never the legacy session 404.
 *
 * Legal gate: the result carries no tenant data or caller identity. Asserted
 * by comparing the results for two different users (they must be identical)
 * and checking neither contains a user id or the per-user `_neotoma` block
 * the legacy initialize response carries.
 *
 * Surface: HTTP only by design. stdio and legacy HTTP sessions are
 * initialize-based; the last test pins that a legacy session does not answer
 * `server/discover`, so a dual-era client probing it falls back to initialize.
 */

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MODERN_PROTOCOL_VERSION,
  bootMcpApp,
  modernMeta,
  modernPost,
  prepareMcpTestEnv,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const USER_A = "aaaaaaaa-2070-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-2070-4bbb-8bbb-bbbbbbbbbbbb";
const CONNECTIONS: Record<string, string> = {
  "conn-2070-a": USER_A,
  "conn-2070-b": USER_B,
};

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      const userId = CONNECTIONS[connectionId];
      if (!userId) {
        const error = new Error("Connection not found") as Error & { code?: string };
        error.code = "OAUTH_CONNECTION_NOT_FOUND";
        throw error;
      }
      return { accessToken: `test-access-${connectionId}`, userId };
    }),
  };
});

describe("POST /mcp server/discover (#2070)", () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;

  beforeEach(async () => {
    env = prepareMcpTestEnv("neotoma-mcp-2070-discover-");
    app = await bootMcpApp();
  });

  afterEach(async () => {
    await app.close();
    vi.resetModules();
    env.restore();
  });

  it("returns versions, capabilities, identity and instructions per SEP-2575", async () => {
    const reply = await modernPost(
      app.baseUrl,
      { id: "discover-1", method: "server/discover" },
      { connectionId: "conn-2070-a" }
    );
    expect(reply.status, reply.text).toBe(200);
    expect(reply.headers.get("content-type")).toContain("application/json");
    expect(reply.headers.get("mcp-session-id")).toBeNull();
    expect(reply.body?.id).toBe("discover-1");

    const result = reply.body?.result ?? {};
    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions).toEqual([MODERN_PROTOCOL_VERSION]);
    const capabilities = result.capabilities as Record<string, unknown>;
    expect(capabilities.tools).toBeDefined();
    expect(capabilities.resources).toBeDefined();
    const serverInfo = (result._meta as Record<string, unknown>)[
      "io.modelcontextprotocol/serverInfo"
    ] as { name?: string; version?: string };
    expect(serverInfo.name).toBe("neotoma");
    expect(typeof serverInfo.version).toBe("string");
    expect(typeof result.ttlMs).toBe("number");
    expect(result.cacheScope).toBe("private");

    // The instructions are where 2026-07-28 clients get them: the same
    // composition the public instruction endpoint serves.
    expect(typeof result.instructions).toBe("string");
    const publicInstructions = await fetch(`${app.baseUrl}/mcp-interaction-instructions`);
    expect(publicInstructions.status).toBe(200);
    expect(result.instructions).toBe(await publicInstructions.text());
  });

  it("carries no caller identity or tenant data", async () => {
    const [asA, asB] = await Promise.all(
      ["conn-2070-a", "conn-2070-b"].map((conn, i) =>
        modernPost(app.baseUrl, { id: 10 + i, method: "server/discover" }, { connectionId: conn })
      )
    );
    expect(asA.status, asA.text).toBe(200);
    expect(asB.status, asB.text).toBe(200);
    const strip = (r: Record<string, unknown> | undefined) => ({ ...(r ?? {}) });
    expect(strip(asA.body?.result)).toEqual(strip(asB.body?.result));
    for (const reply of [asA, asB]) {
      expect(reply.text).not.toContain(USER_A);
      expect(reply.text).not.toContain(USER_B);
      expect(reply.text).not.toContain("conn-2070-");
      // Only the SEP-2575 fields: no per-user `_neotoma` block (standing rules,
      // instance skills) of the kind the legacy initialize response carries.
      const result = reply.body?.result ?? {};
      expect(Object.keys(result).sort()).toEqual(
        [
          "_meta",
          "cacheScope",
          "capabilities",
          "instructions",
          "resultType",
          "supportedVersions",
          "ttlMs",
        ].sort()
      );
      expect(Object.keys(result._meta as Record<string, unknown>)).toEqual([
        "io.modelcontextprotocol/serverInfo",
      ]);
      expect((result._meta as Record<string, Record<string, unknown>>)[
        "io.modelcontextprotocol/serverInfo"
      ]).not.toHaveProperty("_neotoma");
    }
  });

  it("rejects an unsupported protocol version with UnsupportedProtocolVersionError", async () => {
    const meta = { ...modernMeta(), "io.modelcontextprotocol/protocolVersion": "1900-01-01" };
    const reply = await modernPost(
      app.baseUrl,
      { id: 20, method: "server/discover" },
      { connectionId: "conn-2070-a", meta, headers: { "MCP-Protocol-Version": "1900-01-01" } }
    );
    expect(reply.status).toBe(400);
    expect(reply.body?.error?.code).toBe(-32022);
    expect(reply.body?.error?.data?.supported).toEqual([MODERN_PROTOCOL_VERSION]);
    expect(reply.body?.error?.data?.requested).toBe("1900-01-01");
  });

  it("rejects a missing required _meta field with -32602, not a session error", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION };
    const reply = await modernPost(
      app.baseUrl,
      { id: 21, method: "server/discover" },
      { connectionId: "conn-2070-a", meta }
    );
    expect(reply.status).toBe(400);
    expect(reply.body?.error?.code).toBe(-32602);
    expect(reply.body?.error?.message).toContain("clientCapabilities");
    expect(reply.text.toLowerCase()).not.toContain("session");
  });

  it("answers a request without _meta protocolVersion with the typed 400, never a 404", async () => {
    const reply = await modernPost(
      app.baseUrl,
      { id: 22, method: "server/discover" },
      { connectionId: "conn-2070-a", meta: null, headers: { "MCP-Protocol-Version": null } }
    );
    expect(reply.status).toBe(400);
    expect(reply.body?.error?.code).toBe(-32000);
    expect(reply.body?.error?.message).toContain("io.modelcontextprotocol/protocolVersion");
  });

  it("answers a wrong method name with -32601 Method not found (404), not the session path", async () => {
    const reply = await modernPost(
      app.baseUrl,
      { id: 23, method: "server/discovery" },
      { connectionId: "conn-2070-a" }
    );
    expect(reply.status).toBe(404);
    expect(reply.body?.error?.code).toBe(-32601);
    expect(reply.text.toLowerCase()).not.toContain("session");
  });

  it("is served on the stateless surface and not on a legacy initialize-based session", async () => {
    const stateless = await modernPost(
      app.baseUrl,
      { id: 29, method: "server/discover" },
      { connectionId: "conn-2070-a" }
    );
    expect(stateless.status, stateless.text).toBe(200);
    expect(stateless.body?.result?.supportedVersions).toEqual([MODERN_PROTOCOL_VERSION]);

    const init = await fetch(`${app.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "X-Connection-Id": "conn-2070-a",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 30,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "neotoma-2070-legacy", version: "0.0.0" },
        },
      }),
    });
    expect(init.status).toBe(200);
    const sessionId = init.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    await init.text();

    const discover = await fetch(`${app.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "X-Connection-Id": "conn-2070-a",
        "mcp-session-id": sessionId!,
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method: "server/discover" }),
    });
    const text = await discover.text();
    expect(text).toContain("-32601");
    expect(text).not.toContain("supportedVersions");
  });
});
