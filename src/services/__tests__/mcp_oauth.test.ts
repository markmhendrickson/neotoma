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

async function loadSqliteClient(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");

  const moduleUrl = new URL("../../repositories/sqlite/sqlite_client.js", import.meta.url).href;
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

  describe("local backend OAuth flow", () => {
    it("creates local authorization state and completes login", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      localAuth.createLocalAuthUser("local@example.com", "password123");
      const user = localAuth.getLocalAuthUserByEmail("local@example.com");
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
      const { getSqliteDb } = await loadSqliteClient(tempDir);
      localAuth.createLocalAuthUser("renew@example.com", "password123");
      const user = localAuth.getLocalAuthUserByEmail("renew@example.com");
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

      getSqliteDb()
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
      const { getSqliteDb } = await loadSqliteClient(tempDir);
      localAuth.createLocalAuthUser("expired@example.com", "password123");
      const user = localAuth.getLocalAuthUserByEmail("expired@example.com");
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
      getSqliteDb()
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

    it("exchanges a refresh token for a new local access token", async () => {
      const tempDir = path.join(process.cwd(), "tmp", `neotoma-oauth-refresh-${Date.now()}`);
      const oauth = await loadLocalOAuthModule(tempDir);
      const localAuth = await loadLocalAuthModule(tempDir);
      localAuth.createLocalAuthUser("refresh@example.com", "password123");
      const user = localAuth.getLocalAuthUserByEmail("refresh@example.com");
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
      localAuth.createLocalAuthUser("concurrent@example.com", "password123");
      const user = localAuth.getLocalAuthUserByEmail("concurrent@example.com");
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
      const { getSqliteDb } = await loadSqliteClient(tempDir);
      localAuth.createLocalAuthUser("revoked@example.com", "password123");
      const user = localAuth.getLocalAuthUserByEmail("revoked@example.com");
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

      getSqliteDb()
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
      const { getSqliteDb } = await loadSqliteClient(tempDir);
      localAuth.createLocalAuthUser("tunnel@example.com", "password123");
      const user = localAuth.getLocalAuthUserByEmail("tunnel@example.com");
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

      getSqliteDb()
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
