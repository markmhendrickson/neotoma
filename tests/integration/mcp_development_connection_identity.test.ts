/**
 * The development connection identities (`dev-local`, `dev-local-http`, and
 * the test-only `test-connection-bypass`) are assigned by the server to a
 * genuinely local caller when local development mode is on. A client may
 * also send one of them in `X-Connection-Id` from a local development
 * session, but it is honoured only when:
 *
 *   - the caller is local by `isLocalRequest` — the socket's remote address
 *     is loopback and every X-Forwarded-For hop is loopback or a configured
 *     trusted proxy (a forwarded header can never make a caller local), AND
 *   - development mode is on: encryption disabled and a non-production
 *     `NEOTOMA_ENV` (or the explicit `NEOTOMA_TRUST_PROD_LOOPBACK=1` opt-in
 *     that `isLocalRequest` already honours).
 *
 * Otherwise the header is ignored and the request is authenticated (or not)
 * exactly as if it had been omitted.
 *
 * These tests drive the real `/mcp` route on the legacy (session-minting)
 * initialize path. The gate under test runs before transport selection, so
 * every `/mcp` transport shares it.
 */
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
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

const SHARED_BEARER = "shared-secret-token-for-dev-identity-tests";

type Harness = {
  baseUrl: string;
  /** Base URL reachable over a non-loopback interface, when one exists. */
  lanBaseUrl: string | null;
  close: () => Promise<void>;
};

function firstNonLoopbackIPv4(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

async function startApp(options: {
  encryptionEnabled?: boolean;
  env?: "development" | "production";
  bindAllInterfaces?: boolean;
}): Promise<Harness> {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mcp-dev-identity-"));
  process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
  process.env.NEOTOMA_BEARER_TOKEN = SHARED_BEARER;
  process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
  process.env.NEOTOMA_ENCRYPTION_ENABLED = options.encryptionEnabled ? "true" : "false";
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
  const host = options.bindAllInterfaces ? "0.0.0.0" : "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, host, () => resolve());
    httpServer.once("error", reject);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  const lanIp = options.bindAllInterfaces ? firstNonLoopbackIPv4() : null;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    lanBaseUrl: lanIp ? `http://${lanIp}:${address.port}` : null,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      rmSync(tmpRoot, { recursive: true, force: true });
    },
  };
}

type InitializeResult = {
  status: number;
  body: { result?: { serverInfo?: { title?: string } } } | string | null;
};

async function postInitialize(
  baseUrl: string,
  headers: Record<string, string>
): Promise<InitializeResult> {
  const res = await fetch(`${baseUrl}/mcp`, {
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
        clientInfo: { name: "dev-identity-probe", version: "0.0.0" },
      },
    }),
  });
  const text = await res.text();
  let body: InitializeResult["body"] = null;
  const dataLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));
  try {
    body = JSON.parse(dataLine ? dataLine.slice(5).trim() : text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** True when initialize completed as an authenticated session. */
function isAuthenticatedInitialize(result: InitializeResult): boolean {
  if (result.status !== 200 || typeof result.body !== "object" || result.body === null) {
    return false;
  }
  const serverInfo = result.body.result?.serverInfo;
  if (!serverInfo) return false;
  return serverInfo.title !== "Authentication needed" && serverInfo.title !== "Invalid connection";
}

const FORWARDED_PUBLIC_CLIENT = "198.51.100.7";

describe("/mcp development connection identity is honoured only for local development callers", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
    vi.resetModules();
    restoreEnv();
  });

  it("refuses X-Connection-Id dev-local from a proxied non-local caller", async () => {
    harness = await startApp({});
    const res = await postInitialize(harness.baseUrl, {
      "X-Connection-Id": "dev-local",
      "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
    });
    expect(res.status).toBe(401);
  });

  it("refuses X-Connection-Id dev-local-http from a proxied non-local caller", async () => {
    harness = await startApp({});
    const res = await postInitialize(harness.baseUrl, {
      "X-Connection-Id": "dev-local-http",
      "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
    });
    expect(res.status).toBe(401);
  });

  it("refuses X-Connection-Id test-connection-bypass from a proxied non-local caller that also sends an unrecognised Bearer", async () => {
    harness = await startApp({});
    const res = await postInitialize(harness.baseUrl, {
      Authorization: "Bearer not-a-provisioned-token",
      "X-Connection-Id": "test-connection-bypass",
      "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
    });
    expect(res.status).toBe(401);
  });

  it("refuses X-Connection-Id dev-local from a non-local caller that also sends an unrecognised Bearer", async () => {
    harness = await startApp({});
    const res = await postInitialize(harness.baseUrl, {
      Authorization: "Bearer not-a-provisioned-token",
      "X-Connection-Id": "dev-local",
      "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
    });
    expect(res.status).toBe(401);
  });

  it("does not let an X-Forwarded-For loopback entry make a proxied caller local", async () => {
    harness = await startApp({});
    // A client-supplied loopback hop followed by the proxy-appended real client.
    const res = await postInitialize(harness.baseUrl, {
      "X-Connection-Id": "dev-local",
      "X-Forwarded-For": `127.0.0.1, ${FORWARDED_PUBLIC_CLIENT}`,
    });
    expect(res.status).toBe(401);
  });

  const lanIp = firstNonLoopbackIPv4();
  it.skipIf(!lanIp)(
    "refuses X-Connection-Id dev-local over a non-loopback socket even when X-Forwarded-For claims loopback",
    async () => {
      harness = await startApp({ bindAllInterfaces: true });
      expect(harness.lanBaseUrl).not.toBeNull();
      const res = await postInitialize(harness.lanBaseUrl!, {
        "X-Connection-Id": "dev-local",
        "X-Forwarded-For": "127.0.0.1",
      });
      expect(res.status).toBe(401);
    }
  );

  it("refuses X-Connection-Id dev-local from a loopback caller when NEOTOMA_ENV is production", async () => {
    harness = await startApp({ env: "production" });
    const res = await postInitialize(harness.baseUrl, { "X-Connection-Id": "dev-local" });
    expect(res.status).toBe(401);
  });

  it("in production, a loopback-only X-Forwarded-For over a loopback socket is not local (401)", async () => {
    harness = await startApp({ env: "production" });
    const withDevId = await postInitialize(harness.baseUrl, {
      "X-Connection-Id": "dev-local",
      "X-Forwarded-For": "127.0.0.1",
    });
    expect(withDevId.status).toBe(401);
    const withoutDevId = await postInitialize(harness.baseUrl, {
      "X-Forwarded-For": "127.0.0.1",
    });
    expect(withoutDevId.status).toBe(401);
  });

  it("with encryption enabled, refuses X-Connection-Id dev-local from a proxied non-local caller", async () => {
    harness = await startApp({ encryptionEnabled: true });
    const res = await postInitialize(harness.baseUrl, {
      "X-Connection-Id": "dev-local",
      "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
    });
    expect(res.status).toBe(401);
  });

  it("with encryption enabled, requires the key-derived token even from a loopback caller sending dev-local", async () => {
    harness = await startApp({ encryptionEnabled: true });
    const res = await postInitialize(harness.baseUrl, { "X-Connection-Id": "dev-local" });
    expect(res.status).toBe(401);
  });

  it("still authenticates a loopback caller in development mode that sends dev-local", async () => {
    harness = await startApp({});
    const res = await postInitialize(harness.baseUrl, { "X-Connection-Id": "dev-local" });
    expect(isAuthenticatedInitialize(res)).toBe(true);
  });

  it("still authenticates a loopback caller in development mode that sends no credentials", async () => {
    harness = await startApp({});
    const res = await postInitialize(harness.baseUrl, {});
    expect(isAuthenticatedInitialize(res)).toBe(true);
  });

  it("still authenticates a proxied non-local caller that presents the configured Bearer token", async () => {
    harness = await startApp({});
    const res = await postInitialize(harness.baseUrl, {
      Authorization: `Bearer ${SHARED_BEARER}`,
      "X-Forwarded-For": FORWARDED_PUBLIC_CLIENT,
    });
    expect(isAuthenticatedInitialize(res)).toBe(true);
  });
});
