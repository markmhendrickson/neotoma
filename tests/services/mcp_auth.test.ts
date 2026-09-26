/**
 * Unit tests for MCP Authentication Service
 *
 * Tests session token validation.
 * Note: This service requires database access, so these are more like integration tests.
 */

import { describe, it, expect } from "vitest";
import { validateSessionToken } from "../../src/services/mcp_auth.js";

describe("MCP Authentication Service", () => {
  describe("validateSessionToken", () => {
    // A bearer that resolves to no live mcp_oauth_connections row is rejected
    // (fail closed). The error message is "Invalid session token" — the prior
    // "Invalid local session token" wording accompanied an unverified-JWT
    // fallback that has been removed (auth-bypass fix). The regex stays tolerant
    // of either wording so the assertion is about the reject, not the phrasing.
    const rejects = /Token validation failed|Invalid( local)? session token/;

    it("should throw error for invalid token format", async () => {
      await expect(validateSessionToken("invalid-token")).rejects.toThrow(rejects);
    });

    it("should throw error for empty token", async () => {
      await expect(validateSessionToken("")).rejects.toThrow(rejects);
    });

    it("should throw error for malformed JWT", async () => {
      await expect(validateSessionToken("not.a.valid.jwt")).rejects.toThrow(rejects);
    });

    it("should throw error for a forged unsigned JWT rather than trusting its claims", async () => {
      // Regression: the removed fallback decoded this and returned its `sub` as
      // an authenticated user_id. It must now be rejected like any other
      // unknown token.
      const b64 = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString("base64url").replace(/=+$/, "");
      const forged = `${b64({ alg: "none" })}.${b64({ sub: "attacker-user-id" })}.x`;
      await expect(validateSessionToken(forged)).rejects.toThrow(rejects);
    });

    // Note: Testing valid tokens requires integration test with real auth instance
    // See tests/integration/mcp_auth.test.ts for full integration tests
  });
});
