/**
 * Bearer handover slot, end to end through the real REST and MCP auth gates.
 *
 * During a rotation the server accepts the retiring bearer
 * (NEOTOMA_BEARER_TOKEN_PREVIOUS) alongside the primary until
 * NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT, so consumers can switch one at a
 * time instead of all being cut at once.
 *
 * This file deliberately imports nothing from the slot module: it drives the
 * app only through environment and HTTP, so the same file runs against a
 * server without the slot and shows which behaviours are new.
 */

import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PRIMARY = "primary-bearer-handover-test-value-7f3a91";
const PREVIOUS = "previous-bearer-handover-test-value-c42e08";
const UNKNOWN = "unknown-bearer-handover-test-value-90d1b5";

const ENV_KEYS = [
  "NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_BEARER_TOKEN_PREVIOUS",
  "NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT",
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
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv(): void {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Everything written to the console while a test runs. */
let captured: string[] = [];

function startCapture(): void {
  captured = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
}

function capturedText(): string {
  return captured.join("\n");
}

interface Harness {
  baseUrl: string;
  close: () => Promise<void>;
}

let tmpRoot = "";

async function startApp(slot: { previous?: string; expiresAt?: string }): Promise<Harness> {
  tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-bearer-handover-"));
  process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
  process.env.NEOTOMA_BEARER_TOKEN = PRIMARY;
  if (slot.previous !== undefined) process.env.NEOTOMA_BEARER_TOKEN_PREVIOUS = slot.previous;
  else delete process.env.NEOTOMA_BEARER_TOKEN_PREVIOUS;
  if (slot.expiresAt !== undefined)
    process.env.NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT = slot.expiresAt;
  else delete process.env.NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT;
  process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
  process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
  process.env.NEOTOMA_ENV = "development";
  process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
  process.env.NEOTOMA_HTTP_PORT = "0";
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
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}

/**
 * GET /session as a REMOTE caller (public forwarded client), so the local
 * no-auth paths cannot admit it and only the bearer decides.
 */
async function restSession(baseUrl: string, token: string): Promise<Response> {
  return fetch(`${baseUrl}/session`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Forwarded-For": "198.51.100.23",
      "User-Agent": "handover-test-daemon/1.0",
    },
  });
}

async function mcpInitialize(baseUrl: string, token: string): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-Forwarded-For": "198.51.100.23",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "handover-probe", version: "0.0.0" },
      },
    }),
  });
}

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function assertNoValuesIn(text: string): void {
  for (const value of [PRIMARY, PREVIOUS, UNKNOWN]) {
    expect(text).not.toContain(value);
    // No fragment long enough to act as a fingerprint either.
    expect(text).not.toContain(value.slice(-12));
  }
}

describe("bearer handover slot (REST + MCP gates)", () => {
  let harness: Harness | undefined;

  beforeEach(() => {
    startCapture();
  });

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = "";
    vi.restoreAllMocks();
    vi.resetModules();
    restoreEnv();
  });

  it("accepts the retiring bearer alongside the primary while the window is open, as the same principal", async () => {
    harness = await startApp({ previous: PREVIOUS, expiresAt: inHours(24) });

    const primaryRes = await restSession(harness.baseUrl, PRIMARY);
    expect(primaryRes.status).toBe(200);
    const primaryBody = (await primaryRes.json()) as { user_id?: string };

    const previousRes = await restSession(harness.baseUrl, PREVIOUS);
    expect(previousRes.status).toBe(200);
    const previousBody = (await previousRes.json()) as { user_id?: string };

    // Same principal: the slot never widens or changes scope.
    expect(previousBody.user_id).toBeTruthy();
    expect(previousBody.user_id).toBe(primaryBody.user_id);

    const unknownRes = await restSession(harness.baseUrl, UNKNOWN);
    expect(unknownRes.status).toBe(401);
    assertNoValuesIn(await unknownRes.text());
  });

  it("accepts the retiring bearer on the MCP gate while the window is open", async () => {
    harness = await startApp({ previous: PREVIOUS, expiresAt: inHours(24) });

    const primaryRes = await mcpInitialize(harness.baseUrl, PRIMARY);
    expect(primaryRes.status).toBe(200);
    const previousRes = await mcpInitialize(harness.baseUrl, PREVIOUS);
    expect(previousRes.status).toBe(200);
    // The MCP gate emits its own audit event for the retiring bearer.
    expect(capturedText()).toContain('"surface":"mcp"');
    expect(capturedText()).toContain("auth_bearer_previous_slot_used");

    const unknownRes = await mcpInitialize(harness.baseUrl, UNKNOWN);
    expect(unknownRes.status).toBe(401);
    assertNoValuesIn(await unknownRes.text());
  });

  it("emits a value-free audit event when the retiring bearer is used", async () => {
    harness = await startApp({ previous: PREVIOUS, expiresAt: inHours(24) });
    expect((await restSession(harness.baseUrl, PREVIOUS)).status).toBe(200);

    const text = capturedText();
    expect(text).toContain("auth_bearer_previous_slot_used");
    expect(text).toContain("handover-test-daemon/1.0");
    expect(text).toContain("auth_method=bearer_env_previous");
    assertNoValuesIn(text);
  });

  it("rejects the retiring bearer once the window has expired", async () => {
    harness = await startApp({
      previous: PREVIOUS,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect((await restSession(harness.baseUrl, PRIMARY)).status).toBe(200);
    expect((await restSession(harness.baseUrl, PREVIOUS)).status).toBe(401);
    expect((await mcpInitialize(harness.baseUrl, PREVIOUS)).status).toBe(401);
    assertNoValuesIn(capturedText());
  });

  it("rejects the retiring bearer after an explicit retire (slot unset)", async () => {
    harness = await startApp({});
    expect((await restSession(harness.baseUrl, PRIMARY)).status).toBe(200);
    expect((await restSession(harness.baseUrl, PREVIOUS)).status).toBe(401);
    expect((await mcpInitialize(harness.baseUrl, PREVIOUS)).status).toBe(401);
  });

  it.each([
    ["no expiry", { previous: PREVIOUS }],
    ["an expiry with no offset", { previous: PREVIOUS, expiresAt: "2099-01-01T00:00:00" }],
    ["an unparseable expiry", { previous: PREVIOUS, expiresAt: "next tuesday" }],
    ["an expiry beyond the maximum window", { previous: PREVIOUS, expiresAt: inHours(24 * 30) }],
    ["a value with whitespace", { previous: `${PREVIOUS} x`, expiresAt: inHours(24) }],
  ])(
    "fails closed on %s: primary only, and says so loudly",
    async (_label, slot: { previous?: string; expiresAt?: string }) => {
      harness = await startApp(slot);
      expect((await restSession(harness.baseUrl, PRIMARY)).status).toBe(200);
      expect((await restSession(harness.baseUrl, slot.previous ?? PREVIOUS)).status).toBe(401);
      expect((await mcpInitialize(harness.baseUrl, slot.previous ?? PREVIOUS)).status).toBe(401);

      const text = capturedText();
      expect(text).toContain("auth_bearer_handover_disabled");
      expect(text).toContain("primary_only");
      assertNoValuesIn(text);
    }
  );
});
