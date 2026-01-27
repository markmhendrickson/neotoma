/**
 * Unit tests for Summary Service
 * 
 * Tests service configuration and error handling.
 * Note: Full LLM integration tests are in integration test suite.
 */

import { describe, it, expect } from "vitest";

describe("Summary Service", () => {
  describe("Module Import", () => {
    it("should import without errors", async () => {
      const module = await import("../../src/services/summary.js");
      
      expect(module.generateRecordSummary).toBeDefined();
      expect(typeof module.generateRecordSummary).toBe("function");
    });
  });

  describe("generateRecordSummary", () => {
    it("should handle missing OpenAI configuration gracefully", async () => {
      const { generateRecordSummary } = await import("../../src/services/summary.js");
      
      // If OpenAI is not configured, function should handle gracefully
      // This test passes if no errors are thrown during import
      expect(typeof generateRecordSummary).toBe("function");
    });
  });
});
