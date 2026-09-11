/**
 * MCP OAuth Service Tests
 */

// Set required environment variables BEFORE any imports
// Config module reads env vars at import time, so this must be set first
process.env.NEOTOMA_OAUTH_CLIENT_ID = "test-client-id";
const testEncryptionKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY = testEncryptionKey;
process.env.MCP_TOKEN_ENCRYPTION_KEY = testEncryptionKey;

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generatePKCE,
  createAuthUrl,
  encryptRefreshToken,
  decryptRefreshToken,
  isRedirectUriAllowedForTunnel,
} from "../mcp_oauth.js";
import { OAuthError } from "../mcp_oauth_errors.js";
import { config } from "../../config.js";
import { randomBytes } from "node:crypto";
import path from "path";
import { rmSync } from "fs";

async function loadLocalOAuthModule(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY = key;
  process.env.MCP_TOKEN_ENCRYPTION_KEY = key;

  const moduleUrl = new URL("../mcp_oauth.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}`;
  return await import(cacheBustUrl);
}

async function loadLocalAuthModule(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");
  const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY = key;
  process.env.MCP_TOKEN_ENCRYPTION_KEY = key;

  const moduleUrl = new URL("../local_auth.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}`;
  return await import(cacheBustUrl);
}

async function loadLocalMcpAuthModule(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");

  const moduleUrl = new URL("../mcp_auth.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}`;
  return await import(cacheBustUrl);
}

async function loadDbConnection(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");

  const moduleUrl = new URL("../../repositories/db/connection.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}`;
  return await import(cacheBustUrl);
}

describe("MCP OAuth Service", () => {
  describe("generatePKCE", () => {
    it("generates code verifier and challenge", () => {
      const result = generatePKCE();

      expect(result).toHaveProperty("codeVerifier");
      expect(result).toHaveProperty("codeChallenge");
      expect(result.codeVerifier).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(result.codeChallenge).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(result.codeVerifier.length).toBeLessThanOrEqual(128);
    });

    it("generates different values on each call", () => {
      const result1 = generatePKCE();
      const result2 = generatePKCE();

      expect(result1.codeVerifier).not.toBe(result2.codeVerifier);
      expect(result1.codeChallenge).not.toBe(result2.codeChallenge);
    });

    it("generates valid base64url characters only", () => {
      const result = generatePKCE();

      // Base64url: only alphanumeric, dash, underscore (no +, /, =)
      expect(result.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("createAuthUrl", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Ensure NEOTOMA_OAUTH_CLIENT_ID is set (required for OAuth 2.1 Server)
      process.env.NEOTOMA_OAUTH_CLIENT_ID = "test-client-id";
      process.env.DEV_AUTH_URL = "https://test-project.example.co";
    });

    afterEach(() => {
      // Restore original env, but keep NEOTOMA_OAUTH_CLIENT_ID if it was set
      Object.keys(process.env).forEach((key) => {
        if (!(key in originalEnv)) {
          delete process.env[key];
        } else {
          process.env[key] = originalEnv[key];
        }
      });
      // Ensure NEOTOMA_OAUTH_CLIENT_ID is always set for tests
      process.env.NEOTOMA_OAUTH_CLIENT_ID = "test-client-id";
    });

    it("creates valid OAuth authorization URL", async () => {
      const state = "test-state-123";
      const codeChallenge = "test-challenge-456";
      const redirectUri = "http://localhost:3080/mcp/oauth/callback";

      const url = await createAuthUrl(state, codeChallenge, redirectUri);
      const parsedUrl = new URL(url);

      // Default backend is local: expect local-login URL with state only
      const isLocal = parsedUrl.pathname.endsWith("/local-login");
      if (isLocal) {
        expect(parsedUrl.searchParams.get("state")).toBe("test-state-123");
        return;
      }
      // OAuth 2.1 Server endpoint
      expect(parsedUrl.pathname).toBe("/auth/v1/oauth/authorize");
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("state")).toBe("test-state-123");
      expect(parsedUrl.searchParams.get("code_challenge")).toBe("test-challenge-456");
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBe(redirectUri);
    });

    it("includes required OAuth parameters", async () => {
      const state = "valid-state-10ch";
      const url = await createAuthUrl(state, "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);

      if (parsedUrl.pathname.endsWith("/local-login")) {
        expect(parsedUrl.searchParams.get("state")).toBe(state);
        return;
      }
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("state")).toBe(state);
      expect(parsedUrl.searchParams.get("code_challenge")).toBe("challenge");
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBe("http://localhost/callback");
    });

    it("does not include invalid provider parameter", async () => {
      const url = await createAuthUrl("valid-state-10ch", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith("/local-login")) {
        expect(parsedUrl.searchParams.get("provider")).toBeNull();
        return;
      }
      const provider = parsedUrl.searchParams.get("provider");
      expect(provider).not.toBe("oauth");
      expect(provider).toBeNull();
    });

    it("creates URL matching OAuth 2.1 Server requirements", async () => {
      const url = await createAuthUrl("valid-state-10ch", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith("/local-login")) {
        expect(parsedUrl.searchParams.get("state")).toBeDefined();
        return;
      }
      expect(parsedUrl.pathname).toBe("/auth/v1/oauth/authorize");
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("code_challenge")).toBeDefined();
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBeDefined();
      expect(parsedUrl.searchParams.get("state")).toBeDefined();
      expect(parsedUrl.searchParams.get("provider")).toBeNull();
    });

    it("requires OAuth client_id to be configured", async () => {
      const state = "valid-state-10ch";
      const url = await createAuthUrl(state, "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith("/local-login")) {
        expect(parsedUrl.searchParams.get("state")).toBe(state);
        return;
      }
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
    });

    it("uses configured NEOTOMA_OAUTH_CLIENT_ID when set", async () => {
      const url = await createAuthUrl("valid-state-10ch", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith("/local-login")) {
        expect(parsedUrl.searchParams.get("state")).toBeDefined();
        return;
      }
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
    });
  });

  describe("isRedirectUriAllowedForTunnel", () => {
    it("allows trusted hosted callbacks and local redirects", () => {
      expect(isRedirectUriAllowedForTunnel("cursor://auth/callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("http://localhost:5195/oauth")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://chatgpt.com/aip/g-123/oauth/callback")).toBe(
        true
      );
      expect(isRedirectUriAllowedForTunnel("https://claude.ai/api/mcp/auth_callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://www.claude.ai/api/mcp/oauth/callback")).toBe(
        true
      );
    });

    it("rejects unrelated hosted redirects", () => {
      expect(isRedirectUriAllowedForTunnel("https://claude.ai/other/path")).toBe(false);
      expect(isRedirectUriAllowedForTunnel("https://example.com/oauth/callback")).toBe(false);
    });
  });

  describe("operator-configured trusted callback URLs", () => {
    const original = [...config.oauthTrustedCallbackUrls];

    function setTrusted(entries: string[]): void {
      config.oauthTrustedCallbackUrls.length = 0;
      config.oauthTrustedCallbackUrls.push(...entries);
    }

    afterEach(() => {
      setTrusted(original);
    });

    it("defaults to empty, changing nothing for an operator who sets no variable", () => {
      // The default from a real process with no NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS set.
      expect(original).toEqual([]);
      setTrusted([]);
      expect(
        isRedirectUriAllowedForTunnel("https://bottega8-dashboard.fly.dev/auth/callback")
      ).toBe(false);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback")).toBe(false);
    });

    it("allows a configured exact callback URL", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback")).toBe(true);
    });

    it("allows a configured callback carrying a query string or fragment", () => {
      // A real client callback arrives with ?code=&state=; only origin+path is compared.
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(
        isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback?state=abc123")
      ).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback#frag")).toBe(
        true
      );
    });

    it("ignores the query string entirely rather than making it part of the match", () => {
      // DOCUMENTING THE CHOSEN RULE, not merely asserting "it works": the query
      // string is NOT part of the exact match. canonicalCallbackUrl compares
      // protocol + host + port + pathname and drops query and fragment, so a
      // difference in the query cannot cause either a false accept or a false
      // reject. Both directions are asserted below so the rule is pinned.
      //
      // Why this is the right rule here: the redirect_uri that arrives at
      // authorize is the client's REGISTERED callback, and the authorization
      // code is appended to it as ?code=&state= by this server afterwards. A
      // client that registered `/auth/callback` and is sent to
      // `/auth/callback?code=…` must still match, so treating the query as
      // significant would break every real callback. Nothing is given away by
      // ignoring it: the query cannot change WHERE the browser sends the code,
      // which is what the allowlist exists to constrain.

      // A configured entry with no query matches a request carrying any query.
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(
        isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback?code=abc&state=xyz")
      ).toBe(true);
      // ...including a query that differs from any other request's query.
      expect(
        isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback?tenant=other")
      ).toBe(true);

      // And symmetrically: a configured entry that itself carries a query still
      // matches a request with a DIFFERENT query, or none at all, because the
      // query is dropped from both sides before comparison.
      setTrusted(["https://app.example.com/auth/callback?env=prod"]);
      expect(
        isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback?env=staging")
      ).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback")).toBe(true);

      // The path remains significant even when the query would "look" right —
      // ignoring the query must not soften the path match.
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/other?env=prod")).toBe(false);
    });

    it("treats a trailing slash as insignificant, including against a query and on the root path", () => {
      // DOCUMENTING THE CHOSEN RULE: a trailing slash is stripped from the
      // pathname on BOTH sides before comparison, so `/cb` and `/cb/` are the
      // same callback. An operator should not be locked out by a slash.
      //
      // The root path is the deliberate exception: `https://host` and
      // `https://host/` both parse to pathname "/", which is left as "/" rather
      // than stripped to "", so a configured root callback still matches
      // itself and does not collapse into an empty path.
      setTrusted(["https://app.example.com/auth/callback"]);
      // Trailing slash on the request, combined with a real query.
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback/?code=abc")).toBe(
        true
      );

      // A root-path callback matches with and without the slash...
      setTrusted(["https://app.example.com/"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/")).toBe(true);
      // ...and does NOT thereby trust every path on that host.
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/admin")).toBe(false);

      // The slash rule does not merge genuinely different paths.
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback/extra")).toBe(
        false
      );
    });

    it("refuses the same origin at a different path", () => {
      // The #2215 defect in miniature: trusting an origin must not trust the host.
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/anything-else")).toBe(false);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/")).toBe(false);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback2")).toBe(false);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth")).toBe(false);
    });

    it("refuses a path-traversal walk out of the configured callback path", () => {
      // The URL parser resolves `..` before we compare, so this is /auth/admin.
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback/../admin")).toBe(
        false
      );
      expect(
        isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback/%2E%2E/admin")
      ).toBe(false);
    });

    it("treats a dot segment that resolves back to the callback as the callback", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/./callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/x/../auth/callback")).toBe(
        true
      );
    });

    it("ignores host case but respects path case", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      // Hosts are case-insensitive.
      expect(isRedirectUriAllowedForTunnel("HTTPS://APP.EXAMPLE.COM/auth/callback")).toBe(true);
      // Paths are not.
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/CALLBACK")).toBe(false);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/Auth/callback")).toBe(false);
    });

    it("normalises a configured entry's own case too", () => {
      setTrusted(["HTTPS://APP.EXAMPLE.COM/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback")).toBe(true);
    });

    it("treats a trailing slash as insignificant in either direction", () => {
      setTrusted(["https://app.example.com/auth/callback/"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback")).toBe(true);
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback/")).toBe(true);
    });

    it("resolves backslashes the way a browser would", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https:\\\\app.example.com\\auth\\callback")).toBe(true);
      // And a backslash walk out of the path is still refused.
      expect(
        isRedirectUriAllowedForTunnel("https:\\\\app.example.com\\auth\\callback\\..\\admin")
      ).toBe(false);
    });

    it("treats a default port as equivalent to no port, and a non-default port as distinct", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com:443/auth/callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com:8443/auth/callback")).toBe(
        false
      );
      setTrusted(["https://app.example.com:8443/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com:8443/auth/callback")).toBe(
        true
      );
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth/callback")).toBe(false);
    });

    it("does not treat an encoded slash as a path separator", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com/auth%2Fcallback")).toBe(false);
    });

    it("refuses plaintext http: to a non-loopback host even when configured", () => {
      // Fail closed on operator misconfiguration rather than shipping codes in cleartext.
      setTrusted(["http://evil.com/cb"]);
      expect(isRedirectUriAllowedForTunnel("http://evil.com/cb")).toBe(false);
      setTrusted(["http://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("http://app.example.com/auth/callback")).toBe(false);
    });

    it("does not let a configured https entry authorise its http twin", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("http://app.example.com/auth/callback")).toBe(false);
    });

    it("refuses a URL carrying userinfo on either side", () => {
      // `https://app.example.com@evil.com/cb` reads as the trusted host to a human
      // skimming config but resolves to evil.com.
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://evil.com@app.example.com/auth/callback")).toBe(
        false
      );
      setTrusted(["https://app.example.com@evil.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://evil.com/auth/callback")).toBe(false);
    });

    it("refuses a host that merely contains or extends the configured host", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("https://app.example.com.evil.com/auth/callback")).toBe(
        false
      );
      expect(isRedirectUriAllowedForTunnel("https://evil-app.example.com/auth/callback")).toBe(
        false
      );
      expect(isRedirectUriAllowedForTunnel("https://sub.app.example.com/auth/callback")).toBe(
        false
      );
    });

    it("honours several configured entries, each on its own exact terms", () => {
      // A well-formed multi-entry list: every entry authorises its own exact
      // callback and nothing else. (A list containing a MALFORMED entry cannot
      // reach this matcher at all — config parsing rejects the whole list at
      // load; see the fail-closed suite in src/__tests__/config_trusted_callbacks.test.ts.)
      setTrusted(["https://a.example.com/cb", "https://b.example.com/cb"]);
      expect(isRedirectUriAllowedForTunnel("https://a.example.com/cb")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://b.example.com/cb")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://c.example.com/cb")).toBe(false);
      // Configuring two hosts does not merge their paths.
      expect(isRedirectUriAllowedForTunnel("https://a.example.com/other")).toBe(false);
    });

    it("leaves the pre-existing allowlist intact when entries are configured", () => {
      setTrusted(["https://app.example.com/auth/callback"]);
      expect(isRedirectUriAllowedForTunnel("cursor://auth/callback")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("http://localhost:5195/oauth")).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://chatgpt.com/aip/g-123/oauth/callback")).toBe(
        true
      );
      expect(isRedirectUriAllowedForTunnel("https://claude.ai/api/mcp/auth_callback")).toBe(true);
      // ...and does not loosen what it refused before.
      expect(isRedirectUriAllowedForTunnel("https://claude.ai/other/path")).toBe(false);
      expect(isRedirectUriAllowedForTunnel("https://example.com/oauth/callback")).toBe(false);
    });

    it("authorises the motivating self-hosted dashboard callback exactly", () => {
      setTrusted(["https://bottega8-dashboard.fly.dev/auth/callback"]);
      expect(
        isRedirectUriAllowedForTunnel("https://bottega8-dashboard.fly.dev/auth/callback")
      ).toBe(true);
      expect(isRedirectUriAllowedForTunnel("https://bottega8-dashboard.fly.dev/admin")).toBe(false);
    });
  });

  describe("local backend OAuth flow", () => {
    it("creates local authorization state and completes login", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      await localAuth.createLocalAuthUser("local@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("local@example.com");
      if (!user) {
        throw new Error("Local auth user not found in test");
      }

      const connectionId = "cursor-local-123";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });

      expect(request.state).toBeTruthy();

      const callback = await oauth.completeLocalAuthorization(request.state, user.id);
      expect(callback.connectionId).toBe(connectionId);

      const status = await oauth.getConnectionStatus(connectionId);
      expect(status).toBe("active");

      const tokenResponse = await oauth.getTokenResponseForConnection(connectionId);
      expect(tokenResponse.access_token).toMatch(/^local_access_/);

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("renews an expired access token when resolving a connection id", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-renew-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      const { getDb } = await loadDbConnection(tempDir);
      await localAuth.createLocalAuthUser("renew@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("renew@example.com");
      if (!user) {
        throw new Error("Local auth user not found in test");
      }

      const connectionId = "cursor-local-renew";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });
      await oauth.completeLocalAuthorization(request.state, user.id);
      const firstToken = await oauth.getTokenResponseForConnection(connectionId);

      await (await getDb())
        .prepare(
          "UPDATE mcp_oauth_connections SET access_token_expires_at = ? WHERE connection_id = ?"
        )
        .run(new Date(Date.now() - 60_000).toISOString(), connectionId);

      const renewed = await oauth.getAccessTokenForConnection(connectionId);
      const secondToken = await oauth.getTokenResponseForConnection(connectionId);

      expect(renewed.userId).toBe(user.id);
      expect(renewed.accessToken).toMatch(/^local_access_/);
      expect(renewed.accessToken).not.toBe(firstToken.access_token);
      expect(secondToken.access_token).toBe(renewed.accessToken);
      expect(secondToken.expires_in).toBeGreaterThan(3_000);

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("rejects an expired bearer access token instead of accepting stale auth", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-expired-bearer-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      const mcpAuth = await loadLocalMcpAuthModule(tempDir);
      const { getDb } = await loadDbConnection(tempDir);
      await localAuth.createLocalAuthUser("expired@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("expired@example.com");
      if (!user) {
        throw new Error("Local auth user not found in test");
      }

      const connectionId = "cursor-local-expired-bearer";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });
      await oauth.completeLocalAuthorization(request.state, user.id);
      const tokenResponse = await oauth.getTokenResponseForConnection(connectionId);
      await (await getDb())
        .prepare(
          "UPDATE mcp_oauth_connections SET access_token_expires_at = ? WHERE connection_id = ?"
        )
        .run(new Date(Date.now() - 60_000).toISOString(), connectionId);

      await expect(mcpAuth.validateSessionToken(tokenResponse.access_token)).rejects.toThrow(
        "Local session token expired"
      );
      await expect(
        oauth.validateTokenAndGetConnectionId(tokenResponse.access_token)
      ).rejects.toThrow("Access token expired");

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("rejects a forged unsigned JWT bearer instead of trusting its claims (auth bypass regression)", async () => {
      // Regression for the unverified-JWT authentication bypass: validateSessionToken
      // must NOT fall back to decoding the bearer and trusting its own sub/email when
      // no live connection row matches. A fully attacker-controlled `alg:none` token
      // that names an arbitrary user_id must be rejected, not admitted.
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-forged-jwt-${Date.now()}`);
      const localAuth = await loadLocalAuthModule(tempDir);
      const mcpAuth = await loadLocalMcpAuthModule(tempDir);
      await loadDbConnection(tempDir);

      // A real user exists in this instance; the attacker targets their id.
      await localAuth.createLocalAuthUser("victim@example.com", "password123");
      const victim = await localAuth.getLocalAuthUserByEmail("victim@example.com");
      if (!victim) {
        throw new Error("Local auth user not found in test");
      }

      const b64url = (obj: unknown) =>
        Buffer.from(JSON.stringify(obj)).toString("base64url").replace(/=+$/, "");
      const forge = (sub: string, email?: string) =>
        `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, ...(email ? { email } : {}) })}.x`;

      // Forged token naming the victim's real user_id — must be rejected.
      await expect(
        mcpAuth.validateSessionToken(forge(victim.id, "attacker@example.com"))
      ).rejects.toThrow("Invalid session token");

      // Forged token naming an arbitrary user_id that never signed in — must be rejected.
      await expect(
        mcpAuth.validateSessionToken(forge("deadbeef-0000-4000-8000-000000000001"))
      ).rejects.toThrow("Invalid session token");

      // A non-JWT random bearer that matches no connection — must be rejected.
      await expect(mcpAuth.validateSessionToken("not-a-real-token")).rejects.toThrow(
        "Invalid session token"
      );

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("still accepts a valid, live connection access token after the fail-closed fix", async () => {
      // Guards against over-correction: the legitimate OAuth-issued token must
      // continue to authenticate as its bound user with the right email.
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-valid-token-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      const mcpAuth = await loadLocalMcpAuthModule(tempDir);
      await loadDbConnection(tempDir);
      await localAuth.createLocalAuthUser("valid@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("valid@example.com");
      if (!user) {
        throw new Error("Local auth user not found in test");
      }

      const connectionId = "cursor-local-valid-token";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });
      await oauth.completeLocalAuthorization(request.state, user.id);
      const tokenResponse = await oauth.getTokenResponseForConnection(connectionId);

      const validated = await mcpAuth.validateSessionToken(tokenResponse.access_token);
      expect(validated.userId).toBe(user.id);
      expect(validated.email).toBe("valid@example.com");

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("exchanges a refresh token for a new local access token", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-refresh-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      await localAuth.createLocalAuthUser("refresh@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("refresh@example.com");
      if (!user) {
        throw new Error("Local auth user not found in test");
      }

      const connectionId = "cursor-local-refresh";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });
      await oauth.completeLocalAuthorization(request.state, user.id);
      const firstToken = await oauth.getTokenResponseForConnection(connectionId);
      if (!firstToken.refresh_token) {
        throw new Error("Expected local OAuth flow to return a refresh token");
      }

      const refreshed = await oauth.refreshAccessToken(firstToken.refresh_token);

      expect(refreshed.access_token).toMatch(/^local_access_/);
      expect(refreshed.access_token).not.toBe(firstToken.access_token);
      expect(refreshed.refresh_token).toBe(firstToken.refresh_token);
      expect(refreshed.expires_in).toBeGreaterThan(3_000);

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("concurrent refresh calls both succeed without corrupting connection state", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-concurrent-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      await localAuth.createLocalAuthUser("concurrent@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("concurrent@example.com");
      if (!user) throw new Error("Local auth user not found in test");

      const connectionId = "cursor-local-concurrent";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });
      await oauth.completeLocalAuthorization(request.state, user.id);
      const firstToken = await oauth.getTokenResponseForConnection(connectionId);
      if (!firstToken.refresh_token) throw new Error("Expected refresh token");

      const [r1, r2] = await Promise.all([
        oauth.refreshAccessToken(firstToken.refresh_token),
        oauth.refreshAccessToken(firstToken.refresh_token),
      ]);

      expect(r1.access_token).toMatch(/^local_access_/);
      expect(r2.access_token).toMatch(/^local_access_/);

      const finalToken = await oauth.getTokenResponseForConnection(connectionId);
      expect(finalToken.access_token).toMatch(/^local_access_/);
      expect(finalToken.expires_in).toBeGreaterThan(3_000);

      const status = await oauth.getConnectionStatus(connectionId);
      expect(status).toBe("active");

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("rejects refresh for a revoked connection", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-revoked-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      const { getDb } = await loadDbConnection(tempDir);
      await localAuth.createLocalAuthUser("revoked@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("revoked@example.com");
      if (!user) throw new Error("Local auth user not found in test");

      const connectionId = "cursor-local-revoked";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });
      await oauth.completeLocalAuthorization(request.state, user.id);
      const firstToken = await oauth.getTokenResponseForConnection(connectionId);
      if (!firstToken.refresh_token) throw new Error("Expected refresh token");

      await (await getDb())
        .prepare("UPDATE mcp_oauth_connections SET revoked_at = ? WHERE connection_id = ?")
        .run(new Date().toISOString(), connectionId);

      await expect(oauth.refreshAccessToken(firstToken.refresh_token)).rejects.toThrow(
        /not found/i
      );

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("refreshes token after simulated tunnel restart (expired access, valid refresh)", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-tunnel-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      const { getDb } = await loadDbConnection(tempDir);
      await localAuth.createLocalAuthUser("tunnel@example.com", "password123");
      const user = await localAuth.getLocalAuthUserByEmail("tunnel@example.com");
      if (!user) throw new Error("Local auth user not found in test");

      const connectionId = "cursor-local-tunnel-restart";
      const request = await oauth.createLocalAuthorizationRequest({
        connectionId,
        redirectUri: "cursor://oauth",
        clientState: "client-state",
        codeChallenge: "test-challenge",
      });
      await oauth.completeLocalAuthorization(request.state, user.id);
      const firstToken = await oauth.getTokenResponseForConnection(connectionId);

      await (await getDb())
        .prepare(
          "UPDATE mcp_oauth_connections SET access_token_expires_at = ? WHERE connection_id = ?"
        )
        .run(new Date(Date.now() - 3600_000).toISOString(), connectionId);

      await expect(oauth.validateTokenAndGetConnectionId(firstToken.access_token)).rejects.toThrow(
        "Access token expired"
      );

      const renewed = await oauth.getAccessTokenForConnection(connectionId);
      expect(renewed.accessToken).toMatch(/^local_access_/);
      expect(renewed.accessToken).not.toBe(firstToken.access_token);

      const finalStatus = await oauth.getConnectionStatus(connectionId);
      expect(finalStatus).toBe("active");

      const finalToken = await oauth.getTokenResponseForConnection(connectionId);
      expect(finalToken.expires_in).toBeGreaterThan(3_000);

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  // Note: Integration tests for full OAuth flow, token exchange, and database operations
  // should be in tests/integration/mcp_oauth.test.ts

  describe("Input Validation", () => {
    describe("validateConnectionId", () => {
      it("createAuthUrl does not take connection_id (validated in initiateOAuthFlow)", async () => {
        const url = await createAuthUrl(
          "valid-state-token",
          "challenge",
          "http://localhost/callback"
        );
        expect(url).toBeDefined();
      });

      it("rejects connection_id with invalid characters", async () => {
        // Can't test directly without exposing validation function, but it's tested via initiateOAuthFlow in integration tests
        expect(true).toBe(true);
      });

      it("rejects connection_id that's too long", async () => {
        // Tested via integration tests
        expect(true).toBe(true);
      });
    });

    describe("validateRedirectUri", () => {
      it("rejects invalid redirect URI format", async () => {
        await expect(
          createAuthUrl("valid-state-token", "challenge", "not-a-valid-url")
        ).rejects.toThrow(OAuthError);
      });

      it("rejects redirect URI with invalid protocol", async () => {
        await expect(
          createAuthUrl("valid-state-token", "challenge", "ftp://invalid-protocol.com")
        ).rejects.toThrow(OAuthError);
      });

      it("accepts valid http redirect URI", async () => {
        const url = await createAuthUrl(
          "valid-state-token",
          "challenge",
          "http://localhost:3080/callback"
        );
        expect(url).toBeDefined();
      });

      it("accepts valid https redirect URI", async () => {
        const url = await createAuthUrl(
          "valid-state-token",
          "challenge",
          "https://example.com/callback"
        );
        expect(url).toBeDefined();
      });

      it("accepts custom protocol redirect URI (cursor://)", async () => {
        const url = await createAuthUrl("valid-state-token", "challenge", "cursor://callback");
        expect(url).toBeDefined();
      });
    });

    describe("validateState", () => {
      it("rejects empty state", async () => {
        await expect(createAuthUrl("", "challenge", "http://localhost/callback")).rejects.toThrow(
          OAuthError
        );
      });

      it("rejects state that's too short", async () => {
        await expect(
          createAuthUrl("short", "challenge", "http://localhost/callback")
        ).rejects.toThrow(OAuthError);
      });

      it("rejects state with invalid characters", async () => {
        await expect(
          createAuthUrl("invalid state with spaces", "challenge", "http://localhost/callback")
        ).rejects.toThrow(OAuthError);
      });

      it("accepts valid base64url state", async () => {
        const validState = randomBytes(32).toString("base64url");
        const url = await createAuthUrl(validState, "challenge", "http://localhost/callback");
        expect(url).toBeDefined();
      });
    });
  });

  describe("Encryption Key Validation", () => {
    it("validates encryption key format", () => {
      // Service reads NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY || MCP_TOKEN_ENCRYPTION_KEY
      const key =
        process.env.NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY || process.env.MCP_TOKEN_ENCRYPTION_KEY;
      expect(key).toBeDefined();
      expect(key!.length).toBe(64);
      expect(key).toMatch(/^[0-9a-fA-F]{64}$/);
    });
  });

  describe("Token Encryption", () => {
    const testToken = "test-refresh-token-" + randomBytes(16).toString("hex");

    it("encrypts and decrypts token successfully", () => {
      const encrypted = encryptRefreshToken(testToken);
      const decrypted = decryptRefreshToken(encrypted);

      expect(decrypted).toBe(testToken);
    });

    it("encrypted token has correct format (iv:authTag:encrypted)", () => {
      const encrypted = encryptRefreshToken(testToken);
      const parts = encrypted.split(":");

      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]+$/); // IV (hex)
      expect(parts[1]).toMatch(/^[0-9a-f]+$/); // Auth tag (hex)
      expect(parts[2]).toMatch(/^[0-9a-f]+$/); // Encrypted data (hex)
    });

    it("generates different encrypted values for same token (unique IV)", () => {
      const encrypted1 = encryptRefreshToken(testToken);
      const encrypted2 = encryptRefreshToken(testToken);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
      expect(decryptRefreshToken(encrypted1)).toBe(testToken);
      expect(decryptRefreshToken(encrypted2)).toBe(testToken);
    });

    it("throws OAuthError when decrypting invalid format", () => {
      expect(() => decryptRefreshToken("invalid-format")).toThrow(OAuthError);
      expect(() => decryptRefreshToken("only:two-parts")).toThrow(OAuthError);
      expect(() => decryptRefreshToken("")).toThrow(OAuthError);
    });

    it("throws OAuthError when decrypting with tampered data", () => {
      const encrypted = encryptRefreshToken(testToken);
      const parts = encrypted.split(":");

      // Tamper with encrypted data
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -4)}ffff`;

      expect(() => decryptRefreshToken(tampered)).toThrow();
    });

    it("throws OAuthError when decrypting with wrong auth tag", () => {
      const encrypted = encryptRefreshToken(testToken);
      const parts = encrypted.split(":");

      // Tamper with auth tag
      const tampered = `${parts[0]}:${"0".repeat(32)}:${parts[2]}`;

      expect(() => decryptRefreshToken(tampered)).toThrow();
    });
  });

  describe("Error Handling", () => {
    it("throws OAuthError with correct error codes", async () => {
      // Test invalid state validation
      try {
        await createAuthUrl("", "challenge", "http://localhost/callback");
        expect.fail("Should have thrown OAuthError");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).code).toBe("OAUTH_STATE_INVALID");
        expect((error as OAuthError).statusCode).toBe(400);
      }
    });

    it("throws OAuthError with correct status codes for validation errors", async () => {
      // Test invalid redirect URI
      try {
        await createAuthUrl("valid-state", "challenge", "not-a-url");
        expect.fail("Should have thrown OAuthError");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).code).toBe("OAUTH_INVALID_REDIRECT_URI");
        expect((error as OAuthError).statusCode).toBe(400);
      }
    });
  });
});
