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
    it("should throw error for invalid token format", async () => {
      await expect(validateSessionToken("invalid-token")).rejects.toThrow(
        /Token validation failed|Invalid local session token/
      );
    });

    it("should throw error for empty token", async () => {
      await expect(validateSessionToken("")).rejects.toThrow(
        /Token validation failed|Invalid local session token/
      );
    });

    it("should throw error for malformed JWT", async () => {
      await expect(validateSessionToken("not.a.valid.jwt")).rejects.toThrow(
        /Token validation failed|Invalid local session token/
      );
    });

    // Note: Testing valid tokens requires integration test with real auth instance
    // See tests/integration/mcp_auth.test.ts for full integration tests
  });
});
