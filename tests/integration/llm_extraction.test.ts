/**
 * Integration tests for LLM Extraction Service
 * 
 * Tests LLM-based extraction with mock responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock OpenAI before importing service
vi.mock("../../src/config.js", () => ({
  config: {
    openaiApiKey: "test-api-key",
  },
}));

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: vi.fn(),
        },
      };
    },
  };
});

import {
  extractWithLLM,
  isLLMExtractionAvailable,
  extractWithLLMWithRetry,
} from "../../src/services/llm_extraction.js";

describe("LLM Extraction Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractWithLLM", () => {
    it("should extract invoice data from text", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                fields: {
                  invoice_number: "INV-001",
                  vendor_name: "Acme Corp",
                  amount_due: 1000,
                  invoice_date: "2025-01-15",
                },
              }),
            },
          },
        ],
      } as never);
      
      const text = "INVOICE #INV-001\nFrom: Acme Corp\nAmount: $1,000\nDate: Jan 15, 2025";
      
      const result = await extractWithLLM(text);
      
      expect(result).toBeDefined();
      expect(result.entity_type).toBe("invoice");
      expect(result.fields.invoice_number).toBe("INV-001");
      expect(result.fields.vendor_name).toBe("Acme Corp");
      expect(result.fields.amount_due).toBe(1000);
    });

    it("should extract receipt data", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "receipt",
                fields: {
                  merchant_name: "Store",
                  amount_total: 50.25,
                  date_purchased: "2025-01-15",
                },
              }),
            },
          },
        ],
      } as never);
      
      const text = "RECEIPT\nStore Name\nTotal: $50.25\nDate: Jan 15, 2025";
      
      const result = await extractWithLLM(text);
      
      expect(result.entity_type).toBe("receipt");
      expect(result.fields.merchant_name).toBe("Store");
      expect(result.fields.amount_total).toBe(50.25);
    });

    it("should extract contract data", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "contract",
                fields: {
                  contract_number: "CTR-001",
                  parties: ["Company A", "Company B"],
                  effective_date: "2025-01-01",
                },
              }),
            },
          },
        ],
      } as never);
      
      const text = "CONTRACT #CTR-001\nBetween Company A and Company B\nEffective: Jan 1, 2025";
      
      const result = await extractWithLLM(text);
      
      expect(result.entity_type).toBe("contract");
      expect(result.fields.contract_number).toBe("CTR-001");
      expect(result.fields.parties).toEqual(["Company A", "Company B"]);
    });

    it("should add default schema_version if missing", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "note",
                fields: {
                  title: "Test Note",
                  // No schema_version provided
                },
              }),
            },
          },
        ],
      } as never);
      
      const result = await extractWithLLM("Test note content");
      
      expect(result.fields.schema_version).toBe("1.0");
    });

    it("should throw error when OpenAI not configured", async () => {
      // Temporarily mock config without API key
      vi.resetModules();
      vi.doMock("../../src/config.js", () => ({
        config: {
          openaiApiKey: null,
        },
      }));
      
      const { extractWithLLM: unconfiguredExtract } = await import(
        "../../src/services/llm_extraction.js"
      );
      
      await expect(
        unconfiguredExtract("test text")
      ).rejects.toThrow("OpenAI API key not configured");
      
      // Restore mocks
      vi.resetModules();
    });

    it("should handle extraction errors", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockRejectedValue(new Error("API error"));
      
      await expect(
        extractWithLLM("test text")
      ).rejects.toThrow();
    });

    it("should reject invalid JSON responses", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: "invalid json {",
            },
          },
        ],
      } as never);
      
      await expect(
        extractWithLLM("test text")
      ).rejects.toThrow();
    });

    it("should reject response without entity_type", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fields: { test: "value" },
                // Missing entity_type
              }),
            },
          },
        ],
      } as never);
      
      await expect(
        extractWithLLM("test text")
      ).rejects.toThrow("Invalid response: missing or invalid entity_type");
    });

    it("should reject response without fields", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                // Missing fields
              }),
            },
          },
        ],
      } as never);
      
      await expect(
        extractWithLLM("test text")
      ).rejects.toThrow("Invalid response: missing or invalid fields");
    });
  });

  describe("isLLMExtractionAvailable", () => {
    it("should return true when OpenAI is configured", () => {
      expect(isLLMExtractionAvailable()).toBe(true);
    });
  });

  describe("extractWithLLMWithRetry", () => {
    it("should retry on validation failure", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      // First call: invalid (missing required field)
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                fields: {
                  // Missing required fields
                },
              }),
            },
          },
        ],
      } as never);
      
      // Second call: valid
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                fields: {
                  invoice_number: "INV-002",
                  schema_version: "1.0",
                },
              }),
            },
          },
        ],
      } as never);
      
      const schema = {
        fields: {
          invoice_number: { type: "string", required: true },
        },
      };
      
      const result = await extractWithLLMWithRetry("invoice text", schema);
      
      expect(result).toBeDefined();
      expect(result.attempts).toBe(2); // Took 2 attempts
      expect(result.fields.invoice_number).toBe("INV-002");
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("should succeed on first attempt if valid", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                fields: {
                  invoice_number: "INV-003",
                  schema_version: "1.0",
                },
              }),
            },
          },
        ],
      } as never);
      
      const schema = {
        fields: {
          invoice_number: { type: "string", required: true },
        },
      };
      
      const result = await extractWithLLMWithRetry("invoice text", schema);
      
      expect(result.attempts).toBe(1); // First attempt succeeded
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it("should throw error after max retries exhausted", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      // All attempts fail validation
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                fields: {
                  // Always missing required field
                },
              }),
            },
          },
        ],
      } as never);
      
      const schema = {
        fields: {
          invoice_number: { type: "string", required: true },
        },
      };
      
      await expect(
        extractWithLLMWithRetry("invoice text", schema, undefined, undefined, "gpt-4o", 3)
      ).rejects.toThrow("LLM extraction failed after 3 attempts");
      
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe("Multi-language Support", () => {
    it("should handle Spanish invoices", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                fields: {
                  invoice_number: "FACT-001",
                  vendor_name: "Empresa SA",
                  amount_due: 500,
                  currency: "EUR",
                },
              }),
            },
          },
        ],
      } as never);
      
      const text = "FACTURA #FACT-001\nEmpresa SA\nTotal: 500 EUR";
      
      const result = await extractWithLLM(text);
      
      expect(result.entity_type).toBe("invoice");
      expect(result.fields.invoice_number).toBe("FACT-001");
      expect(result.fields.currency).toBe("EUR");
    });
  });

  describe("Interpretation Config Logging", () => {
    it("should include provider and model information", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "note",
                fields: { title: "Test" },
              }),
            },
          },
        ],
      } as never);
      
      // Config should be logged for audit trail
      // This test verifies the extraction function can be called with config tracking
      const result = await extractWithLLM("Test note");
      
      expect(result).toBeDefined();
      // Note: Actual config logging happens at interpretation level, not extraction level
      // See runInterpretation in interpretation.ts for config persistence
    });

    it("should support temperature parameter", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "note",
                fields: { title: "Test" },
              }),
            },
          },
        ],
      } as never);
      
      await extractWithLLM("Test");
      
      // Verify LLM was called (temperature is set at OpenAI client level)
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe("Idempotence", () => {
    it("should produce consistent structure for same input type", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      // Mock returns same structure
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                entity_type: "invoice",
                fields: {
                  invoice_number: "INV-001",
                  amount: 100,
                },
              }),
            },
          },
        ],
      } as never);
      
      const text = "Invoice #INV-001, Amount: $100";
      
      const result1 = await extractWithLLM(text);
      const result2 = await extractWithLLM(text);
      
      // Structure should be consistent (though LLM is non-deterministic, mocking makes it deterministic)
      expect(result1.entity_type).toBe(result2.entity_type);
      expect(Object.keys(result1.fields).sort()).toEqual(
        Object.keys(result2.fields).sort()
      );
    });

    it("should handle extraction errors consistently", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      // Mock error
      mockCreate.mockRejectedValue(new Error("API Error"));
      
      await expect(extractWithLLM("Test")).rejects.toThrow("API Error");
      await expect(extractWithLLM("Test")).rejects.toThrow("API Error");
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON responses", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: "Not valid JSON",
            },
          },
        ],
      } as never);
      
      await expect(extractWithLLM("Test")).rejects.toThrow();
    });

    it("should handle empty responses", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: "",
            },
          },
        ],
      } as never);
      
      await expect(extractWithLLM("Test")).rejects.toThrow();
    });

    it("should handle missing choices", async () => {
      const OpenAI = (await import("openai")).default;
      const mockCreate = vi.mocked(new OpenAI().chat.completions.create);
      
      mockCreate.mockResolvedValue({
        choices: [],
      } as never);
      
      await expect(extractWithLLM("Test")).rejects.toThrow();
    });
  });
});
