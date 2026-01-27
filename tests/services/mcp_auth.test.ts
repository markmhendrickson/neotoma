/**
 * Unit tests for MCP Authentication Service
 * 
 * Tests Supabase session token validation.
 * Note: This service requires database access, so these are more like integration tests.
 */

import { describe, it, expect, vi } from "vitest";
import { validateSupabaseSessionToken } from "../../src/services/mcp_auth.js";

describe("MCP Authentication Service", () => {
  describe("validateSupabaseSessionToken", () => {
    it("should throw error for invalid token format", async () => {
      await expect(validateSupabaseSessionToken("invalid-token")).rejects.toThrow(
        "Token validation failed"
      );
    });

    it("should throw error for empty token", async () => {
      await expect(validateSupabaseSessionToken("")).rejects.toThrow(
        "Token validation failed"
      );
    });

    it("should throw error for malformed JWT", async () => {
      await expect(validateSupabaseSessionToken("not.a.valid.jwt")).rejects.toThrow(
        "Token validation failed"
      );
    });

    // Note: Testing valid tokens requires integration test with real Supabase instance
    // See tests/integration/mcp_auth.test.ts for full integration tests
  });
});
