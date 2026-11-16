import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The issue tools (`submit_issue`, `add_issue_message` and the thread read-through) reach a
 * remote client that, outside embedded mode, signs with the host user's key pair under the
 * home directory and falls back to a built-in remote target.
 *
 * In embedded mode that client must use only the explicit configuration: no read under a
 * home directory, no host signing identity, no default remote target, and no request unless
 * the host named a target in `env`. With none named the tools refuse with a structured error.
 *
 * Every test runs against a synthetic home directory that holds a fake key pair and a
 * `config.json`, with the network intercepted. Nothing real is read or contacted.
 */

const USER_ID = "00000000-0000-4000-8000-0000000000e1";
const NAMED_TARGET = "https://issues-target.invalid";

interface Fixture {
  root: string;
  homeDir: string;
  dataDir: string;
  keyPath: string;
  homeConfigPath: string;
}

let f: Fixture;
let fetchSpy: ReturnType<typeof vi.fn>;
let reads: string[];
let netCalls: string[];
let realFetch: typeof globalThis.fetch;

const FS_PROMISE_METHODS = ["readFile", "access", "stat", "lstat", "open", "readdir"] as const;

async function makeFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-embedded-issues-"));
  const homeDir = path.join(root, "home");
  const dataDir = path.join(root, "data");
  const aauthDir = path.join(homeDir, ".neotoma", "aauth");
  await fs.mkdir(aauthDir, { recursive: true });
  await fs.mkdir(path.join(homeDir, ".config", "neotoma"), { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  const keyPath = path.join(aauthDir, "private.jwk");
  // Fake, non-functional key material: never a real key.
  await fs.writeFile(keyPath, JSON.stringify({ kty: "OKP", crv: "Ed25519", d: "fake", x: "fake" }));
  await fs.writeFile(
    path.join(aauthDir, "config.json"),
    JSON.stringify({ sub: "synthetic-host-identity", kid: "synthetic-kid" })
  );
  const homeConfigPath = path.join(homeDir, ".config", "neotoma", "config.json");
  await fs.writeFile(
    homeConfigPath,
    JSON.stringify({ issues: { target_url: "https://home-config-target.invalid" } })
  );
  return { root, homeDir, dataDir, keyPath, homeConfigPath };
}

function homeAccesses(): string[] {
  return reads.filter((p) => p.startsWith(f.homeDir));
}

beforeEach(async () => {
  f = await makeFixture();
  reads = [];
  netCalls = [];
  realFetch = globalThis.fetch;
  fetchSpy = vi.fn(async (input: unknown) => {
    netCalls.push(String(input instanceof Request ? input.url : input));
    return new Response(JSON.stringify({ error: "intercepted" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  for (const method of FS_PROMISE_METHODS) {
    const original = (fs as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    vi.spyOn(fs as never, method as never).mockImplementation(((...args: unknown[]) => {
      reads.push(String(args[0]));
      return original.apply(fs, args);
    }) as never);
  }
  // Any other network path (a raw http/https request) is recorded and refused.
  for (const mod of [http, https] as const) {
    vi.spyOn(mod, "request").mockImplementation(((...args: unknown[]) => {
      netCalls.push(String(args[0]));
      throw new Error("network blocked in test");
    }) as never);
  }
  vi.resetModules();
  vi.stubEnv("HOME", f.homeDir);
  vi.stubEnv("USERPROFILE", f.homeDir);
  vi.stubEnv("NEOTOMA_ALLOW_USER_ENV_IN_TEST", "1");
  // Host settings that must have no effect in embedded mode.
  vi.stubEnv("NEOTOMA_AAUTH_PRIVATE_JWK_PATH", f.keyPath);
  vi.stubEnv("NEOTOMA_CLI_AAUTH_DISABLE", "1");
  vi.stubEnv("NEOTOMA_ISSUES_TARGET_URL", "https://host-env-target.invalid");
  vi.stubEnv("NEOTOMA_FORCE_LOCAL_TRANSPORT", "true");
});

afterEach(async () => {
  const { clearEmbeddedConfig } = await import("../../src/config_embedded.ts");
  clearEmbeddedConfig();
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(f.root, { recursive: true, force: true });
});

async function embed(extra: Record<string, unknown> = {}) {
  vi.resetModules();
  const { createEmbeddedNeotoma } = await import("../../src/embedded.ts");
  const neotoma = await createEmbeddedNeotoma({ dataDir: f.dataDir, ...extra });
  return neotoma.createOperations({ userId: USER_ID });
}

describe("embedded mode: issue tools with no explicit target", () => {
  it("submit_issue refuses with a structured error, no request, no home read", async () => {
    const ops = await embed();
    const before = reads.length;
    await expect(
      ops.executeTool("submit_issue", {
        title: "Synthetic title",
        body: "Synthetic body",
        visibility: "private",
      })
    ).rejects.toThrow(/not configured for this embedded instance/);
    expect(netCalls).toEqual([]);
    expect(homeAccesses()).toEqual([]);
    expect(reads.length).toBeGreaterThanOrEqual(before);
  });

  it("add_issue_message refuses the same way", async () => {
    const ops = await embed();
    await expect(
      ops.executeTool("add_issue_message", {
        issue_number: 1,
        body: "Synthetic message",
        visibility: "private",
      })
    ).rejects.toThrow(/not configured for this embedded instance/);
    expect(netCalls).toEqual([]);
    expect(homeAccesses()).toEqual([]);
  });

  it("the thread read-through and status read return nothing and send nothing", async () => {
    await embed();
    const client = await import("../../src/services/issues/neotoma_client.ts");
    expect(await client.fetchRemoteIssueThread({ issueEntityId: "ent_synthetic" })).toBeNull();
    expect(await client.getRemoteIssueStatus({ issueEntityId: "ent_synthetic" })).toBeNull();
    expect(netCalls).toEqual([]);
    expect(homeAccesses()).toEqual([]);
  });

  it("the default remote target is not used and the home config target is ignored", async () => {
    await embed();
    const { loadIssuesConfig } = await import("../../src/services/issues/config.ts");
    const config = await loadIssuesConfig();
    expect(config.target_url).toBe("");
    expect(homeAccesses()).toEqual([]);
  });
});

describe("embedded mode: issue tools with an explicit target", () => {
  it("sends only to the named target, unsigned, without reading the home key pair", async () => {
    const ops = await embed({ env: { NEOTOMA_ISSUES_TARGET_URL: NAMED_TARGET } });
    await ops
      .executeTool("submit_issue", {
        title: "Synthetic title",
        body: "Synthetic body",
        visibility: "private",
      })
      .catch(() => undefined);
    expect(netCalls.length).toBeGreaterThan(0);
    expect(netCalls.every((u) => u.startsWith(NAMED_TARGET))).toBe(true);
    for (const call of fetchSpy.mock.calls) {
      const init = (call[1] ?? {}) as { headers?: HeadersInit };
      const headers = new Headers(init.headers);
      expect(headers.has("signature")).toBe(false);
      expect(headers.has("signature-input")).toBe(false);
      expect(headers.has("signature-key")).toBe(false);
    }
    expect(homeAccesses()).toEqual([]);
  });

  it("does not start or fall back to the local transport, even when the map asks for it", async () => {
    await embed({
      env: { NEOTOMA_ISSUES_TARGET_URL: NAMED_TARGET, NEOTOMA_FORCE_LOCAL_TRANSPORT: "true" },
    });
    const { createApiClient } = await import("../../src/shared/api_client.ts");
    const client = createApiClient({ baseUrl: NAMED_TARGET });
    await client.GET("/health" as never, {} as never).catch(() => undefined);
    await client.POST("/issues/submit" as never, { body: {} } as never).catch(() => undefined);
    expect(netCalls.every((u) => u.startsWith(NAMED_TARGET))).toBe(true);
    expect(homeAccesses()).toEqual([]);
    const { getLocalTransportClient } = await import("../../src/shared/local_transport.ts");
    await expect(getLocalTransportClient({ baseUrl: NAMED_TARGET })).rejects.toThrow(
      /not available in embedded mode/
    );
  });
});

describe("standard mode is unchanged", () => {
  it("falls back to the built-in target and consults the home key pair when signing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("HOME", f.homeDir);
    vi.stubEnv("USERPROFILE", f.homeDir);
    vi.stubEnv("NEOTOMA_ALLOW_USER_ENV_IN_TEST", "1");
    vi.stubEnv("NEOTOMA_ENV", "development");
    delete process.env.NEOTOMA_ISSUES_TARGET_URL;
    vi.resetModules();
    const { clearEmbeddedConfig } = await import("../../src/config_embedded.ts");
    clearEmbeddedConfig();
    const { loadIssuesConfig } = await import("../../src/services/issues/config.ts");
    const { DEFAULT_ISSUES_TARGET_URL } = await import("../../src/services/issues/types.ts");
    // Standard mode still reads the home config...
    expect((await loadIssuesConfig()).target_url).toBe("https://home-config-target.invalid");
    // ...and falls back to the built-in target when nothing names one.
    await fs.writeFile(f.homeConfigPath, JSON.stringify({}));
    expect((await loadIssuesConfig()).target_url).toBe(DEFAULT_ISSUES_TARGET_URL);
    // The standard-mode client looks for the key pair under the home directory.
    const client = await import("../../src/services/issues/neotoma_client.ts");
    vi.stubEnv("NEOTOMA_ISSUES_TARGET_URL", NAMED_TARGET);
    await client.getRemoteIssueStatus({ issueEntityId: "ent_synthetic" });
    expect(reads).toContain(f.keyPath);
    expect(netCalls.some((u) => u.startsWith(NAMED_TARGET))).toBe(true);
  });
});

describe("embedded mode: AAuth-signed peer delivery", () => {
  it("is refused without reading the home key pair or sending a request", async () => {
    await embed();
    const { postOutboundSyncWebhook } =
      await import("../../src/services/sync/sync_webhook_outbound.ts");
    const result = await postOutboundSyncWebhook({
      peerUrlBase: "https://peer.example.com",
      authMethod: "aauth",
      payload: {} as never,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("aauth_peer_delivery_unavailable_in_embedded_mode");
    expect(netCalls).toEqual([]);
    expect(homeAccesses()).toEqual([]);
  });
});
