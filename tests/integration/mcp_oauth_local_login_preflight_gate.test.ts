/**
 * Coverage for the credential preflight (`NEOTOMA_REQUIRE_KEY_FOR_OAUTH`) that
 * must sit in front of dev-user authorization completion on any instance
 * reachable from outside loopback: without a valid credential session,
 * `/mcp/oauth/authorize` and `/mcp/oauth/local-login` must redirect to
 * `/mcp/oauth/key-auth` rather than reach `ensureLocalDevUser()` and complete
 * the connection.
 *
 * This is not a code-defect fix — reading src/actions.ts shows the gate
 * (`config.requireKeyForOauth && !hasValidOAuthKeySession(req)`) is present
 * and correctly placed ahead of the dev-user completion at both call sites.
 * The invariant instead depends entirely on the *value* of
 * NEOTOMA_REQUIRE_KEY_FOR_OAUTH on a given deployment (default: enabled).
 * These tests exercise both settings of that config value against the real
 * HTTP routes so a future change that weakens the gate in code — moving the
 * check after completion, or dropping it from one of the two routes — fails
 * a test rather than only an operator's manual read of a Fly secret.
 */

import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Server } from "node:http";

/** A public (non-loopback) client IP, so isLocalRequest() returns false —
 *  the reachable-from-outside-loopback condition the finding is about. */
const TUNNEL_CLIENT_IP = "203.0.113.9";

let currentTempDir: string | null = null;
let importCounter = 0;

async function loadApp(tempDir: string, requireKeyForOauth: boolean): Promise<{ app: any }> {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH = requireKeyForOauth ? "true" : "false";

  const actionsUrl = new URL("../../src/actions.js", import.meta.url).href;
  const actions = await import(`${actionsUrl}?cacheBust=${Date.now()}-${importCounter++}`);

  // `config` is a module-level singleton computed once at first import and
  // never re-read from env after that — so within one test-file process, the
  // FIRST test's NEOTOMA_REQUIRE_KEY_FOR_OAUTH value would otherwise stick
  // for every later test regardless of the env var (config.js is not
  // cache-busted the way actions.js is above, since actions.ts itself reads
  // `config` as a shared singleton and must keep doing so). Mutate the
  // already-loaded singleton directly so each test's setting actually takes
  // effect, matching the pattern the authorize-response contract test uses
  // for config.oauthTrustedCallbackUrls.
  const { config } = await import(new URL("../../src/config.js", import.meta.url).href);
  config.requireKeyForOauth = requireKeyForOauth;

  return { app: actions.app };
}

async function get(
  app: { listen: (port: number) => Server },
  urlPath: string
): Promise<{ status: number; location: string | null }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address !== "object") {
      throw new Error("Expected HTTP server to bind to an ephemeral port");
    }
    const response = await fetch(`http://127.0.0.1:${address.port}${urlPath}`, {
      redirect: "manual",
      headers: {
        "x-forwarded-for": TUNNEL_CLIENT_IP,
        "x-forwarded-host": "instance.example.com",
      },
    });
    return { status: response.status, location: response.headers.get("location") };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  }
}

describe("OAuth credential preflight gates dev-user completion", () => {
  afterEach(() => {
    delete process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH;
    if (currentTempDir) {
      rmSync(currentTempDir, { recursive: true, force: true });
      currentTempDir = null;
    }
  });

  it("/mcp/oauth/authorize redirects to key-auth when the preflight is enabled and no session exists", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-preflight-authorize-on-${Date.now()}`
    );
    const { app } = await loadApp(currentTempDir, true);

    const { status, location } = await get(
      app,
      "/mcp/oauth/authorize?" +
        new URLSearchParams({
          redirect_uri: "cursor://oauth",
          state: "state-abc",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
        }).toString()
    );

    expect(status).toBe(302);
    expect(location).toMatch(/^\/mcp\/oauth\/key-auth\?/);
  });

  it("/mcp/oauth/local-login redirects to key-auth when the preflight is enabled and no session exists", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-preflight-locallogin-on-${Date.now()}`
    );
    const { app } = await loadApp(currentTempDir, true);

    // A state value that does not resolve to any stored request: if the gate
    // were bypassed, the handler would fail on "expired or already used"
    // rather than on the key-auth redirect. Getting the key-auth redirect
    // proves the gate is checked BEFORE state lookup / dev-user completion.
    const { status, location } = await get(
      app,
      `/mcp/oauth/local-login?${new URLSearchParams({ state: "unknown-state" }).toString()}`
    );

    expect(status).toBe(302);
    expect(location).toMatch(/^\/mcp\/oauth\/key-auth\?/);
  });

  it("/mcp/oauth/authorize does NOT redirect to key-auth when the preflight is disabled (documents the risk this finding is about)", async () => {
    currentTempDir = path.join(
      process.cwd(),
      "tmp",
      `neotoma-preflight-authorize-off-${Date.now()}`
    );
    const { app } = await loadApp(currentTempDir, false);

    const { status, location } = await get(
      app,
      "/mcp/oauth/authorize?" +
        new URLSearchParams({
          redirect_uri: "cursor://oauth",
          state: "state-abc",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
        }).toString()
    );

    // With the preflight off, /authorize proceeds straight to the local-login
    // redirect instead of key-auth — i.e. nothing between a tunnel request
    // and dev-user authorization completion requires a credential. This test
    // documents that config-dependent behavior; it is not asserting a code
    // defect (see file docstring) — see security_finding
    // neotoma-2229-oauth-key-gate-posture-hosted for the operational fix
    // (keep the env var enabled on any such deployment).
    expect(status).toBe(302);
    expect(location).not.toMatch(/^\/mcp\/oauth\/key-auth/);
    expect(location).toMatch(/^\/mcp\/oauth\/local-login\?/);
  });
});
