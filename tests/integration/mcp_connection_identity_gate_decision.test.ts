/**
 * The MCP server takes a connection-id-derived identity only from the `/mcp`
 * gate's resolved decision (the session value set at mint, or the value the
 * gate resolved for the current request, carried on the request context). It
 * never reads the request's own `X-Connection-Id` header for identity.
 *
 * Two layers are covered:
 *
 *   1. The real `/mcp` route: a non-local caller admitted by AAuth that also
 *      sends a development connection id is authenticated as its grant owner.
 *      The signature check and grant lookup are stubbed (they stand in for a
 *      valid signature matched to an active grant); the gate, session mint,
 *      transport and server are real.
 *   2. The initialize, tools/list and resources/list handlers, driven with an
 *      HTTP-shaped `requestInfo` whose headers carry a development connection
 *      id that the gate did not resolve.
 *   3. The 2026-07-28 stateless path on the real `/mcp` route: the same
 *      refusals and the same grant-owner resolution as the session path.
 */
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";

const GRANT_OWNER = "22222222-2222-2222-2222-222222222222";
const DEV_USER = "00000000-0000-0000-0000-000000000000";
const ADMIT_HEADER = "x-test-aauth-admit";

vi.mock("../../src/middleware/aauth_verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/middleware/aauth_verify.js")>();
  return {
    ...original,
    getAAuthContextFromRequest: (req: { headers?: Record<string, unknown> }) =>
      req.headers?.["x-test-aauth-admit"] === "1"
        ? {
            verified: true,
            publicKey: "test-public-key",
            thumbprint: "test-thumbprint",
            algorithm: "ed25519",
            sub: "test-agent",
            iss: "https://agent.example.test",
          }
        : null,
  };
});

vi.mock("../../src/services/aauth_admission.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/aauth_admission.js")>();
  return {
    ...original,
    admitFromAAuthContext: async (ctx: { verified?: boolean } | null) =>
      ctx?.verified
        ? {
            admitted: true,
            user_id: "22222222-2222-2222-2222-222222222222",
            grant_id: "ent_test_gate_decision_grant",
            agent_label: "gate decision test grant",
            capabilities: [{ op: "retrieve", entity_types: ["*"] }],
          }
        : { admitted: false, reason: "not_signed" },
  };
});

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
  "NEOTOMA_TRUST_PROD_LOOPBACK",
  "NEOTOMA_TRUSTED_PROXY_IPS",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv(): void {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const FORWARDED_PUBLIC_CLIENT = "198.51.100.7";

type Harness = { baseUrl: string; close: () => Promise<void> };

async function startApp(options: { env?: "development" | "production" } = {}): Promise<Harness> {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mcp-gate-decision-"));
  process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
  process.env.NEOTOMA_BEARER_TOKEN = "gate-decision-shared-token";
  process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
  process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
  process.env.NEOTOMA_ENV = options.env ?? "development";
  process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
  process.env.NEOTOMA_HTTP_PORT = "0";
  delete process.env.NEOTOMA_KEY_FILE_PATH;
  delete process.env.NEOTOMA_MNEMONIC;
  delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;
  delete process.env.NEOTOMA_TRUST_PROD_LOOPBACK;
  delete process.env.NEOTOMA_TRUSTED_PROXY_IPS;

  vi.resetModules();
  const { app } = await import("../../src/actions.js");
  const httpServer = createServer(app);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.once("error", reject);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      rmSync(tmpRoot, { recursive: true, force: true });
    },
  };
}

type RpcResponse = { status: number; sessionId: string | null; body: any };

async function postRpc(
  baseUrl: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<RpcResponse> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...payload }),
  });
  const text = await res.text();
  const dataLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));
  let body: any = null;
  try {
    body = JSON.parse(dataLine ? dataLine.slice(5).trim() : text);
  } catch {
    body = text;
  }
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), body };
}

/** Initialize a session, then report the user id the session authenticated as. */
async function authenticatedUserFor(
  baseUrl: string,
  headers: Record<string, string>
): Promise<string | null> {
  const init = await postRpc(baseUrl, headers, {
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "gate-decision-probe", version: "0.0.0" },
    },
  });
  expect(init.status).toBe(200);
  expect(init.sessionId).toBeTruthy();
  const sessionHeaders = { ...headers, "mcp-session-id": init.sessionId! };
  await postRpc(baseUrl, sessionHeaders, { method: "notifications/initialized" });
  const call = await postRpc(baseUrl, sessionHeaders, {
    id: 2,
    method: "tools/call",
    params: { name: "get_authenticated_user", arguments: {} },
  });
  const text = call.body?.result?.content?.[0]?.text;
  if (typeof text !== "string") return null;
  return (JSON.parse(text) as { user_id?: string }).user_id ?? null;
}

describe("/mcp: a non-local AAuth-admitted caller is authenticated as its grant owner", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
    vi.resetModules();
    restoreEnv();
  });

  it("authenticates as the grant owner when no connection id is sent (control)", async () => {
    harness = await startApp();
    const userId = await authenticatedUserFor(harness.baseUrl, {
      [ADMIT_HEADER]: "1",
      "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
    });
    expect(userId).toBe(GRANT_OWNER);
  });

  for (const devId of ["dev-local", "dev-local-http"]) {
    it(`authenticates as the grant owner, not the development user, when it also sends ${devId}`, async () => {
      harness = await startApp();
      const userId = await authenticatedUserFor(harness.baseUrl, {
        [ADMIT_HEADER]: "1",
        "X-Connection-Id": devId,
        "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
      });
      expect(userId).toBe(GRANT_OWNER);
      expect(userId).not.toBe(DEV_USER);
    });
  }
});

type HandlerMap = Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;

async function loadServerModules() {
  vi.resetModules();
  const { NeotomaServer } = await import("../../src/server.js");
  const { runWithRequestContext } = await import("../../src/services/request_context.js");
  return { NeotomaServer, runWithRequestContext };
}

function handlersOf(server: unknown): HandlerMap {
  return (server as { mcpServer: { server: { _requestHandlers: HandlerMap } } }).mcpServer.server
    ._requestHandlers;
}

function authenticatedUserIdOf(server: unknown): string | null {
  return (server as { authenticatedUserId: string | null }).authenticatedUserId;
}

const ADMITTED = {
  admitted: true,
  user_id: GRANT_OWNER,
  grant_id: "ent_test_gate_decision_grant",
  agent_label: "gate decision test grant",
  capabilities: [{ op: "retrieve", entity_types: ["*"] }],
};

/** HTTP-shaped handler extra whose headers carry a development connection id. */
function httpExtraWithDevHeader(): Record<string, unknown> {
  return {
    requestId: "gate-decision-test",
    signal: new AbortController().signal,
    requestInfo: { headers: { "x-connection-id": "dev-local", "X-Connection-Id": "dev-local" } },
    sendNotification: async () => {},
    sendRequest: async () => ({}),
  };
}

const REQUESTS: Record<string, Record<string, unknown>> = {
  initialize: {
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "gate-decision-handler-probe", version: "0.0.0" },
    },
  },
  "tools/list": { method: "tools/list", params: {} },
  "resources/list": { method: "resources/list", params: {} },
};

describe("MCP handlers ignore a request X-Connection-Id the gate did not resolve", () => {
  afterEach(() => {
    vi.resetModules();
  });

  for (const method of Object.keys(REQUESTS)) {
    it(`${method}: an AAuth-admitted request carrying dev-local authenticates as the grant owner`, async () => {
      const { NeotomaServer, runWithRequestContext } = await loadServerModules();
      const server = new NeotomaServer();
      const handler = handlersOf(server).get(method);
      expect(handler).toBeTypeOf("function");
      await runWithRequestContext({ agentIdentity: null, aauthAdmission: ADMITTED as never }, () =>
        handler!(REQUESTS[method], httpExtraWithDevHeader())
      );
      expect(authenticatedUserIdOf(server)).toBe(GRANT_OWNER);
    });

    it(`${method}: a request with no gate decision carrying dev-local stays unauthenticated`, async () => {
      const { NeotomaServer, runWithRequestContext } = await loadServerModules();
      const server = new NeotomaServer();
      const handler = handlersOf(server).get(method);
      expect(handler).toBeTypeOf("function");
      await runWithRequestContext({ agentIdentity: null, aauthAdmission: null }, () =>
        handler!(REQUESTS[method], httpExtraWithDevHeader())
      );
      expect(authenticatedUserIdOf(server)).toBeNull();
    });
  }
});

const WHOAMI = {
  method: "tools/call",
  params: { name: "get_authenticated_user", arguments: {} },
} as const;

describe("/mcp 2026-07-28 stateless path: development connection identity", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
    vi.resetModules();
    restoreEnv();
  });

  for (const devId of ["dev-local", "dev-local-http"]) {
    it(`refuses ${devId} from a proxied non-local caller with 401`, async () => {
      harness = await startApp();
      const reply = await modernPost(
        harness.baseUrl,
        { id: 1, ...WHOAMI },
        { connectionId: devId, headers: { "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT } }
      );
      expect(reply.status, reply.text).toBe(401);
      expect(reply.text).not.toContain(DEV_USER);
    });
  }

  it("refuses test-connection-bypass from a proxied non-local caller that also sends an unrecognised Bearer", async () => {
    harness = await startApp();
    const reply = await modernPost(
      harness.baseUrl,
      { id: 2, ...WHOAMI },
      {
        connectionId: "test-connection-bypass",
        headers: {
          Authorization: "Bearer not-a-provisioned-token",
          "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
        },
      }
    );
    expect(reply.status, reply.text).toBe(401);
    expect(reply.text).not.toContain(DEV_USER);
  });

  it("in production, refuses a loopback socket whose X-Forwarded-For is loopback-only (401)", async () => {
    harness = await startApp({ env: "production" });
    const reply = await modernPost(
      harness.baseUrl,
      { id: 3, ...WHOAMI },
      { connectionId: "dev-local", headers: { "X-Forwarded-For": "127.0.0.1" } }
    );
    expect(reply.status, reply.text).toBe(401);
  });

  it("resolves a non-local AAuth-admitted caller that also sends dev-local to its grant owner", async () => {
    harness = await startApp();
    for (const devId of ["dev-local", "dev-local-http"]) {
      const reply = await modernPost(
        harness.baseUrl,
        { id: 4, ...WHOAMI },
        {
          connectionId: devId,
          headers: { [ADMIT_HEADER]: "1", "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT },
        }
      );
      expect(reply.status, reply.text).toBe(200);
      expect(toolResultJson(reply.body).user_id).toBe(GRANT_OWNER);
    }
  });

  it("still authenticates a loopback development caller that sends dev-local (control)", async () => {
    harness = await startApp();
    const reply = await modernPost(
      harness.baseUrl,
      { id: 5, ...WHOAMI },
      { connectionId: "dev-local" }
    );
    expect(reply.status, reply.text).toBe(200);
    expect(toolResultJson(reply.body).user_id).toBe(DEV_USER);
  });
});
