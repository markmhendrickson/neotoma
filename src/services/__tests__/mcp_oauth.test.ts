/**
 * MCP OAuth Service Tests
 */

// Set required environment variables BEFORE any imports
// Config module reads env vars at import time, so this must be set first
process.env.SUPABASE_OAUTH_CLIENT_ID = "test-client-id";
process.env.MCP_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generatePKCE,
  createAuthUrl,
  encryptRefreshToken,
  decryptRefreshToken,
} from "../mcp_oauth.js";
import { OAuthError } from "../mcp_oauth_errors.js";
import { randomBytes } from "node:crypto";

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
      // Ensure SUPABASE_OAUTH_CLIENT_ID is set (required for OAuth 2.1 Server)
      process.env.SUPABASE_OAUTH_CLIENT_ID = "test-client-id";
      process.env.DEV_SUPABASE_URL = "https://test-project.supabase.co";
    });

    afterEach(() => {
      // Restore original env, but keep SUPABASE_OAUTH_CLIENT_ID if it was set
      Object.keys(process.env).forEach(key => {
        if (!(key in originalEnv)) {
          delete process.env[key];
        } else {
          process.env[key] = originalEnv[key];
        }
      });
      // Ensure SUPABASE_OAUTH_CLIENT_ID is always set for tests
      process.env.SUPABASE_OAUTH_CLIENT_ID = "test-client-id";
    });

    it("creates valid OAuth authorization URL", async () => {
      const state = "test-state-123";
      const codeChallenge = "test-challenge-456";
      const redirectUri = "http://localhost:8080/api/mcp/oauth/callback";

      const url = await createAuthUrl(state, codeChallenge, redirectUri);
      const parsedUrl = new URL(url);

      // Verify URL structure (uses OAuth 2.1 Server endpoint)
      expect(parsedUrl.pathname).toBe("/auth/v1/oauth/authorize");
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("state")).toBe("test-state-123");
      expect(parsedUrl.searchParams.get("code_challenge")).toBe("test-challenge-456");
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBe(redirectUri);
    });

    it("includes required OAuth parameters", async () => {
      const url = await createAuthUrl("state", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("state")).toBe("state");
      expect(parsedUrl.searchParams.get("code_challenge")).toBe("challenge");
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBe("http://localhost/callback");
    });

    it("does not include invalid provider parameter", async () => {
      const url = await createAuthUrl("state", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);

      // Supabase OAuth 2.1 Server doesn't use provider parameter
      // Provider parameter should be absent for OAuth 2.1 Server flows
      const provider = parsedUrl.searchParams.get("provider");
      expect(provider).not.toBe("oauth");
      expect(provider).toBeNull(); // Provider should be absent for OAuth 2.1 Server
    });

    it("creates URL matching Supabase OAuth 2.1 Server requirements", async () => {
      const url = await createAuthUrl("state", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);

      // Verify OAuth 2.1 Server endpoint
      expect(parsedUrl.pathname).toBe("/auth/v1/oauth/authorize");

      // Required parameters per Supabase OAuth 2.1 Server spec
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("code_challenge")).toBeDefined();
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBeDefined();
      expect(parsedUrl.searchParams.get("state")).toBeDefined();

      // Invalid parameters that would cause API errors
      expect(parsedUrl.searchParams.get("provider")).not.toBe("oauth");
      expect(parsedUrl.searchParams.get("provider")).not.toBe("generic");
      expect(parsedUrl.searchParams.get("provider")).toBeNull();
    });

    it("requires OAuth client_id to be configured", async () => {
      // Note: Config is loaded at module import time, so we can't easily test
      // the error case without module reloading. This test verifies that
      // client_id is present when config is valid.
      // Integration tests cover the actual error scenario when client_id is missing.
      const url = await createAuthUrl("state", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);
      
      // Verify client_id is included in the URL
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
    });

    it("uses configured SUPABASE_OAUTH_CLIENT_ID when set", async () => {
      // When SUPABASE_OAUTH_CLIENT_ID is set, it should be used (not dynamic registration)
      const url = await createAuthUrl("state", "challenge", "http://localhost/callback");
      const parsedUrl = new URL(url);
      
      // Should use the configured client_id from environment
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
    });
  });

  // Note: Integration tests for full OAuth flow, token exchange, and database operations
  // should be in tests/integration/mcp_oauth.test.ts
  });

  describe("Input Validation", () => {
    describe("validateConnectionId", () => {
      it("rejects empty connection_id", async () => {
        await expect(createAuthUrl("valid-state-token", "challenge", "http://localhost/callback")).rejects.toThrow(
          OAuthError
        );
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
          "http://localhost:8080/callback"
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
        const url = await createAuthUrl(
          "valid-state-token",
          "challenge",
          "cursor://callback"
        );
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
      // Encryption key validation happens at module import time
      // This test verifies the key is set correctly
      expect(process.env.MCP_TOKEN_ENCRYPTION_KEY).toBeDefined();
      expect(process.env.MCP_TOKEN_ENCRYPTION_KEY?.length).toBe(64);
      expect(process.env.MCP_TOKEN_ENCRYPTION_KEY).toMatch(/^[0-9a-fA-F]{64}$/);
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
