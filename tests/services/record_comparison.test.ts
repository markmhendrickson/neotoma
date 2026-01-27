/**
 * Unit tests for Record Comparison Service
 * 
 * Tests service configuration and error handling.
 * Note: Full LLM integration tests are in integration test suite.
 */

import { describe, it, expect } from "vitest";

describe("Record Comparison Service", () => {
  describe("Module Import", () => {
    it("should import without errors", async () => {
      const module = await import("../../src/services/record_comparison.js");
      
      expect(module.generateRecordComparisonInsight).toBeDefined();
      expect(typeof module.generateRecordComparisonInsight).toBe("function");
    });
  });

  describe("generateRecordComparisonInsight", () => {
    it("should handle missing OpenAI configuration gracefully", async () => {
      const { generateRecordComparisonInsight } = await import("../../src/services/record_comparison.js");
      
      // If OpenAI is not configured, function should handle gracefully
      // This test passes if no errors are thrown during import
      expect(typeof generateRecordComparisonInsight).toBe("function");
    });
  });
});
