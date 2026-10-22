/**
 * neotoma#2070 — an OAuth connection id never reaches a log line.
 *
 * `X-Connection-Id` authenticates on its own at `/mcp`, so a connection id is
 * a credential. The 2026-07-28 stateless path resolves identity on every
 * request, so any log line that interpolates the id writes a credential to
 * production logs on every request. The rule is the same on the legacy
 * session path: presence or a short non-reversible fingerprint only.
 *
 * Covered, on both eras: a connection id sent as `X-Connection-Id`, one the
 * server resolves from a Bearer token (never on the wire), and an unknown id
 * (the failure branches log too). A spy on every console method and on
 * stderr captures all output; the assertion is that no id and no token value
 * appears in any of it, and (instrument check) that the fingerprinted lines
 * were in fact emitted.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  toolResultJson,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const USER = "cccccccc-2501-4ccc-8ccc-cccccccccccc";
// Synthetic values. None is a real credential.
const KNOWN_CONNECTION = "conn2501-known-7f3a9c1e5b";
const BEARER_CONNECTION = "conn2501-frombearer-4d8e2a6f";
const UNKNOWN_CONNECTION = "conn2501-unknown-9b1c3e7d";
const BEARER_TOKEN = "tok2501-bearer-value-6a2f8e";

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      if (connectionId === KNOWN_CONNECTION || connectionId === BEARER_CONNECTION) {
        return { accessToken: `access-for-${connectionId}`, userId: USER };
      }
      const error = new Error("Connection not found") as Error & { code?: string };
      error.code = "OAUTH_CONNECTION_NOT_FOUND";
      throw error;
    }),
    validateTokenAndGetConnectionId: vi.fn(async (token: string) => {
      if (token === BEARER_TOKEN) return { connectionId: BEARER_CONNECTION, userId: USER };
      throw new Error("invalid token");
    }),
  };
});

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
const SECRETS = [KNOWN_CONNECTION, BEARER_CONNECTION, UNKNOWN_CONNECTION, BEARER_TOKEN];

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function legacyInitialize(baseUrl: string, headers: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "neotoma-2501-legacy", version: "0.0.0" },
      },
    }),
  });
}

describe("connection id is never logged (#2070)", () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;
  let consoleSpies: MockInstance[] = [];
  let stderrSpy: MockInstance;

  function loggedText(): string {
    const consoleText = consoleSpies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => call.map(stringifyArg).join(" "));
    const stderrText = stderrSpy.mock.calls.map((call) => stringifyArg(call[0]));
    return [...consoleText, ...stderrText].join("\n");
  }

  beforeEach(async () => {
    env = prepareMcpTestEnv("neotoma-mcp-2501-connlog-");
    app = await bootMcpApp();
    consoleSpies = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    );
    stderrSpy = vi.spyOn(process.stderr, "write");
  });

  afterEach(async () => {
    for (const spy of consoleSpies) spy.mockRestore();
    consoleSpies = [];
    stderrSpy.mockRestore();
    await app.close();
    vi.resetModules();
    env.restore();
  });

  it("2026-07-28 requests: X-Connection-Id, Bearer-resolved and unknown ids never appear in logs", async () => {
    const viaHeader = await modernPost(
      app.baseUrl,
      { id: 1, method: "tools/call", params: { name: "get_authenticated_user", arguments: {} } },
      { connectionId: KNOWN_CONNECTION }
    );
    expect(viaHeader.status, viaHeader.text).toBe(200);
    expect(toolResultJson(viaHeader.body).user_id).toBe(USER);

    const viaBearer = await modernPost(
      app.baseUrl,
      { id: 2, method: "tools/call", params: { name: "get_authenticated_user", arguments: {} } },
      { headers: { Authorization: `Bearer ${BEARER_TOKEN}` } }
    );
    expect(viaBearer.status, viaBearer.text).toBe(200);
    expect(toolResultJson(viaBearer.body).user_id).toBe(USER);

    // Unknown id alongside a Bearer the gate does not validate: resolution
    // fails inside the stateless path, which logs on its failure branch.
    const unknown = await modernPost(
      app.baseUrl,
      { id: 3, method: "tools/list" },
      { connectionId: UNKNOWN_CONNECTION, headers: { Authorization: "Bearer not-a-real-token" } }
    );
    // (The 401 itself is asserted in mcp_http_stateless_auth_resolution.)
    expect(unknown.text).not.toContain(UNKNOWN_CONNECTION);

    const logs = loggedText();
    for (const secret of SECRETS) {
      expect(logs, `logs must not contain ${secret.slice(0, 8)}…`).not.toContain(secret);
    }
    // Instrument check: the per-request resolution lines were emitted, with
    // a fingerprint where the id used to be.
    expect(logs).toMatch(/Stateless request: connectionId=fp:[0-9a-f]{12}/);
    expect(logs).toMatch(/Initialized with OAuth connection \(fp:[0-9a-f]{12}/);
  });

  it("legacy sessions: a valid and an unknown X-Connection-Id never appear in logs", async () => {
    const valid = await legacyInitialize(app.baseUrl, { "X-Connection-Id": KNOWN_CONNECTION });
    expect(valid.status).toBe(200);
    expect(valid.headers.get("mcp-session-id")).toBeTruthy();
    await valid.text();

    const invalid = await legacyInitialize(app.baseUrl, { "X-Connection-Id": UNKNOWN_CONNECTION });
    expect(invalid.status).toBe(401);
    await invalid.text();

    const logs = loggedText();
    for (const secret of SECRETS) {
      expect(logs, `logs must not contain ${secret.slice(0, 8)}…`).not.toContain(secret);
    }
    // Instrument check: the lines that used to carry the id were emitted.
    expect(logs).toMatch(/Initialize: connectionId=fp:[0-9a-f]{12}/);
    expect(logs).toMatch(/Invalid or expired X-Connection-Id \(fp:[0-9a-f]{12}\)/);
  });
});
