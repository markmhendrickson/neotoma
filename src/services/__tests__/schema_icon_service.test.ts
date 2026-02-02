/**
 * Tests for Schema Icon Service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  generateIconForEntityType, 
  isIconGenerationAvailable,
  clearIconCache 
} from "../schema_icon_service.js";

// Mock OpenAI
vi.mock("openai", () => {
  return {
    default: vi.fn(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

// Mock config
vi.mock("../../config.js", () => ({
  config: {
    openaiApiKey: "test-key",
    iconGeneration: {
      enabled: true,
      confidenceThreshold: 0.8,
      model: "gpt-4o",
      cacheTTL: 86400,
    },
  },
}));

describe("Schema Icon Service", () => {
  beforeEach(() => {
    clearIconCache();
  });

  describe("generateIconForEntityType", () => {
    it("should return pattern-based match for common entity types", async () => {
      const result = await generateIconForEntityType("invoice", {
        label: "Invoice",
        description: "Money owed",
        category: "finance",
      });

      expect(result.icon_type).toBe("lucide");
      expect(result.icon_name).toBe("FileText");
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should cache icon results", async () => {
      const result1 = await generateIconForEntityType("receipt");
      const result2 = await generateIconForEntityType("receipt");

      // Should be the same object (cached)
      expect(result1).toBe(result2);
    });

    it("should use different cache keys for different metadata", async () => {
      const result1 = await generateIconForEntityType("custom_type", {
        description: "Description A",
        category: "finance",
      });
      
      const result2 = await generateIconForEntityType("custom_type", {
        description: "Description B",
        category: "finance",
      });

      // Should be different (different cache keys)
      expect(result1).not.toBe(result2);
    });

    it("should return default icon for unknown types without AI", async () => {
      // Clear OpenAI key to test fallback
      vi.mock("../../config.js", () => ({
        config: {
          openaiApiKey: "",
          iconGeneration: {
            enabled: true,
            confidenceThreshold: 0.8,
            model: "gpt-4o",
            cacheTTL: 86400,
          },
        },
      }));

      const result = await generateIconForEntityType("unknown_type");

      expect(result.icon_type).toBe("lucide");
      expect(result.icon_name).toBe("File"); // Default icon
      expect(result.confidence).toBe(0.5);
    });

    it("should include generated_at timestamp", async () => {
      const result = await generateIconForEntityType("transaction");

      expect(result.generated_at).toBeDefined();
      expect(typeof result.generated_at).toBe("string");
      // Should be valid ISO timestamp
      expect(() => new Date(result.generated_at)).not.toThrow();
    });
  });

  describe("isIconGenerationAvailable", () => {
    it("should return true when OpenAI is configured", () => {
      expect(isIconGenerationAvailable()).toBe(true);
    });
  });

  describe("pattern matching", () => {
    it("should match financial entity types", async () => {
      const types = ["invoice", "receipt", "transaction", "payment"];
      
      for (const type of types) {
        const result = await generateIconForEntityType(type);
        expect(result.icon_type).toBe("lucide");
        expect(result.icon_name).toBeTruthy();
      }
    });

    it("should match people entity types", async () => {
      const types = ["person", "contact", "company"];
      
      for (const type of types) {
        const result = await generateIconForEntityType(type);
        expect(result.icon_type).toBe("lucide");
        expect(result.icon_name).toBeTruthy();
      }
    });

    it("should match productivity entity types", async () => {
      const types = ["task", "project", "event"];
      
      for (const type of types) {
        const result = await generateIconForEntityType(type);
        expect(result.icon_type).toBe("lucide");
        expect(result.icon_name).toBeTruthy();
      }
    });
  });
});
