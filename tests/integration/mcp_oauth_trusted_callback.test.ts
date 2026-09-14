/**
 * Effect-level coverage for NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS, driven through
 * the REAL `/mcp/oauth/authorize` HTTP handler rather than the pure allowlist
 * function.
 *
 * Why this file exists as an integration test rather than a unit test: the QA
 * contract on #2384 asks that the operator-configured callback be shown to
 * actually change what the endpoint does — "a test asserts the reported effect
 * ... not merely that the config value is accepted or parsed without error".
 * `src/services/__tests__/mcp_oauth.test.ts` already covers the matching rule
 * exhaustively at the unit level; what it cannot show is that the value is
 * WIRED — that the config the operator sets reaches the branch in
 * `src/actions.ts` that produces the 400. That wiring is what this asserts.
 *
 * Reaching the tunnel branch requires three things, all of which mirror what a
 * real hosted deployment looks like:
 *   - `config.storageBackend === "local"` (the local-backend tunnel guard);
 *   - a NON-local request, which is what the `x-forwarded-for` public IP below
 *     produces — a loopback socket alone would be treated as local and skip the
 *     allowlist entirely;
 *   - `NEOTOMA_REQUIRE_KEY_FOR_OAUTH=false`, so the handler does not redirect to
 *     the key-auth gate before it ever evaluates the redirect_uri.
 */

import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Server } from "node:http";

let currentTempDir: string | null = null;
let importCounter = 0;

/** A public (non-loopback) client IP, so `isLocalRequest` returns false. */
const TUNNEL_CLIENT_IP = "203.0.113.7";

const CONFIGURED_CALLBACK = "https://app.example.com/auth/callback";

async function loadAppWithTrustedCallbacks(
  tempDir: string,
  trusted: string | undefined
): Promise<{ app: { listen: (port: number) => Server } }> {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MCP_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  // Otherwise authorize redirects to the key-auth gate before it evaluates
  // redirect_uri, and the allowlist branch is never reached.
  process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH = "false";

  if (trusted === undefined) {
    delete process.env.NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS;
  } else {
    process.env.NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS = trusted;
  }

  const actionsUrl = new URL("../../src/actions.js", import.meta.url).href;
  const cacheBust = `cacheBust=${Date.now()}-${importCounter++}`;
  const actions = await import(`${actionsUrl}?${cacheBust}`);

  // `src/config.ts` builds `config` as a module-scope object literal, read from
  // process.env exactly once per process. Cache-busting `actions.js` does NOT
  // re-evaluate it — the specifier `../config.js` still resolves to the one
  // cached instance — so setting the env var alone would silently affect only
  // whichever test imported first. Mutating the live array in place is what the
  // unit suite does too, and it keeps the assertions honest: the app under test
  // reads the same array the handler reads.
  const { config } = await import(new URL("../../src/config.js", import.meta.url).href);
  const entries = (process.env.NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS || "")
    .split(",")
    .map((entry: string) => entry.trim())
    .filter((entry: string) => entry.length > 0);
  config.oauthTrustedCallbackUrls.length = 0;
  config.oauthTrustedCallbackUrls.push(...entries);

  return { app: actions.app };
}

/**
 * Issue an authorize request as if it arrived over a tunnel, and report what the
 * endpoint did. A 400 carrying the tunnel-refusal text is a reject; anything
 * else (a redirect to the login/consent step) means the redirect_uri was
 * accepted and the flow proceeded.
 */
async function authorizeOverTunnel(
  app: { listen: (port: number) => Server },
  redirectUri: string
): Promise<{ status: number; body: string; rejectedByAllowlist: boolean }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address !== "object") {
      throw new Error("Expected HTTP server to bind to an ephemeral port");
    }
    const query = new URLSearchParams({
      redirect_uri: redirectUri,
      state: "test-state-value",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
    });
    const response = await fetch(
      `http://127.0.0.1:${address.port}/mcp/oauth/authorize?${query}`,
      {
        redirect: "manual",
        headers: {
          // Makes the request non-local, which is what puts the tunnel
          // allowlist in the path at all.
          "x-forwarded-for": TUNNEL_CLIENT_IP,
          "x-forwarded-host": "instance.example.com",
        },
      }
    );
    const body = await response.text();
    return {
      status: response.status,
      body,
      rejectedByAllowlist:
        response.status === 400 &&
        body.includes("redirect_uri is not allowed when connecting via a tunnel"),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  }
}

describe("operator-configured OAuth trusted callback URLs (HTTP authorize surface)", () => {
  afterEach(async () => {
    delete process.env.NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS;
    delete process.env.NEOTOMA_REQUIRE_KEY_FOR_OAUTH;
    // The live config array is shared process-wide; leaving entries in it would
    // leak an operator-configured allowlist into every later suite in this file.
    const { config } = await import(new URL("../../src/config.js", import.meta.url).href);
    config.oauthTrustedCallbackUrls.length = 0;
    if (currentTempDir) {
      rmSync(currentTempDir, { recursive: true, force: true });
      currentTempDir = null;
    }
  });

  it("refuses the operator's callback when the variable is unset, and accepts it once set", async () => {
    // The whole feature in one assertion pair: the ONLY thing that changes
    // between these two runs is the environment variable, so an accept in the
    // second run cannot come from anywhere else.
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-trusted-${Date.now()}`);

    const unset = await loadAppWithTrustedCallbacks(currentTempDir, undefined);
    const before = await authorizeOverTunnel(unset.app, CONFIGURED_CALLBACK);
    expect(before.rejectedByAllowlist).toBe(true);
    // The refusal tells an operator the variable is not set, rather than
    // leaving them unable to tell that from a typo.
    expect(before.body).toContain("NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS");

    const configured = await loadAppWithTrustedCallbacks(currentTempDir, CONFIGURED_CALLBACK);
    const after = await authorizeOverTunnel(configured.app, CONFIGURED_CALLBACK);
    expect(after.rejectedByAllowlist).toBe(false);
    // Accepted means the handler moved on to the login/consent step.
    expect(after.status).toBeGreaterThanOrEqual(300);
    expect(after.status).toBeLessThan(400);
  });

  it("authorises only the configured path, not the rest of that host", async () => {
    // #2215 in miniature, asserted at the HTTP surface: configuring a callback
    // must not hand the whole origin to the caller.
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-trusted-${Date.now()}`);
    const { app } = await loadAppWithTrustedCallbacks(currentTempDir, CONFIGURED_CALLBACK);

    const sibling = await authorizeOverTunnel(app, "https://app.example.com/admin");
    expect(sibling.rejectedByAllowlist).toBe(true);

    const traversal = await authorizeOverTunnel(
      app,
      "https://app.example.com/auth/callback/../admin"
    );
    expect(traversal.rejectedByAllowlist).toBe(true);

    // A real callback carries ?code=&state=; ignoring query is what lets it match.
    const withQuery = await authorizeOverTunnel(
      app,
      "https://app.example.com/auth/callback?code=abc&state=xyz"
    );
    expect(withQuery.rejectedByAllowlist).toBe(false);
  });

  it("still refuses a host that was never configured", async () => {
    // Guards against the failure mode where the new branch is accidentally
    // wired to allow everything once any entry is configured.
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-trusted-${Date.now()}`);
    const { app } = await loadAppWithTrustedCallbacks(currentTempDir, CONFIGURED_CALLBACK);

    const unrelated = await authorizeOverTunnel(app, "https://not-configured.example.com/callback");
    expect(unrelated.rejectedByAllowlist).toBe(true);
    // ...and the refusal now reports that entries ARE configured, which is what
    // distinguishes an exact-match miss from an unset variable.
    expect(unrelated.body).toContain("1 operator-configured callback URL(s)");
  });

  it("leaves the pre-existing hardcoded allowlist deciding exactly as before", async () => {
    // The default-unset regression guard at the HTTP surface. The unit suite
    // (tests/services/__tests__/tunnel_oauth.test.ts) covers the full matrix;
    // this confirms the wiring does not disturb it.
    currentTempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-trusted-${Date.now()}`);
    const { app } = await loadAppWithTrustedCallbacks(currentTempDir, undefined);

    const loopback = await authorizeOverTunnel(app, "http://localhost:5195/oauth");
    expect(loopback.rejectedByAllowlist).toBe(false);

    const thirdParty = await authorizeOverTunnel(app, "https://evil.com/steal-code");
    expect(thirdParty.rejectedByAllowlist).toBe(true);
  });
});
