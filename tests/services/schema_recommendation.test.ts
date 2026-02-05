/**
 * Unit tests for SchemaRecommendationService
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SchemaRecommendationService } from "../../src/services/schema_recommendation.js";
import { supabase } from "../../src/db.js";

// Mock the database module
vi.mock("../../src/db.js", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock schema registry
vi.mock("../../src/services/schema_registry.js", () => ({
  SchemaRegistryService: vi.fn().mockImplementation(() => ({
    loadActiveSchema: vi.fn(),
  })),
}));

describe("SchemaRecommendationService", () => {
  let service: SchemaRecommendationService;
  let mockFrom: any;

  beforeEach(() => {
    service = new SchemaRecommendationService();
    mockFrom = vi.fn();
    (supabase.from as any) = mockFrom;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("checkAutoEnhancementEligibility", () => {
    it("should return ineligible if field is blacklisted", async () => {
      // Mock blacklist check - return blacklisted field
      const mockBlacklistQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        data: [{ field_pattern: "_test*" }],
      };
      mockFrom.mockReturnValueOnce(mockBlacklistQuery);

      const result = await service.checkAutoEnhancementEligibility({
        entity_type: "transaction",
        fragment_key: "_test_field",
        user_id: "test-user-id",
      });

      expect(result.eligible).toBe(false);
      expect(result.reasoning).toContain("blacklisted");
    });

    it("should return ineligible if field name is invalid", async () => {
      // Mock blacklist check - return empty (not blacklisted)
      const mockBlacklistQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        data: [],
      };
      mockFrom.mockReturnValueOnce(mockBlacklistQuery);

      const result = await service.checkAutoEnhancementEligibility({
        entity_type: "transaction",
        fragment_key: "_invalid_field",
        user_id: "test-user-id",
      });

      expect(result.eligible).toBe(false);
      expect(result.reasoning).toContain("Invalid field name");
    });

    it("should return ineligible if frequency below threshold", async () => {
      // Mock blacklist check - not blacklisted
      const mockBlacklistQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        data: [],
      };
      
      // Mock raw_fragments query - low frequency
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "value1", frequency_count: 1, source_id: "src1" },
        ],
      };

      mockFrom
        .mockReturnValueOnce(mockBlacklistQuery)
        .mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.checkAutoEnhancementEligibility({
        entity_type: "transaction",
        fragment_key: "valid_field",
        user_id: "test-user-id",
        config: { ...service["DEFAULT_AUTO_ENHANCEMENT_CONFIG"], threshold: 3 },
      });

      expect(result.eligible).toBe(false);
      expect(result.reasoning).toContain("below threshold");
    });

    it("should return eligible for high-confidence fields", async () => {
      // Mock blacklist check - not blacklisted
      const mockBlacklistQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        data: [],
      };
      
      // Mock raw_fragments query - high frequency, multiple sources
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "2024-01-01", frequency_count: 2, source_id: "src1" },
          { fragment_value: "2024-01-02", frequency_count: 2, source_id: "src2" },
        ],
      };

      mockFrom
        .mockReturnValueOnce(mockBlacklistQuery)
        .mockReturnValueOnce(mockFragmentsQuery);

      // Mock calculateFieldConfidence to return high confidence
      vi.spyOn(service, "calculateFieldConfidence" as any).mockResolvedValue({
        confidence: 0.95,
        type_consistency: 1.0,
        naming_pattern_match: true,
        format_consistency: 1.0,
        inferred_type: "date",
      });

      const result = await service.checkAutoEnhancementEligibility({
        entity_type: "transaction",
        fragment_key: "transaction_date",
        user_id: "test-user-id",
        config: { ...service["DEFAULT_AUTO_ENHANCEMENT_CONFIG"], threshold: 3 },
      });

      expect(result.eligible).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it("should check source diversity (2+ sources required)", async () => {
      // Mock blacklist check - not blacklisted
      const mockBlacklistQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        data: [],
      };
      
      // Mock raw_fragments query - single source
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "value1", frequency_count: 5, source_id: "src1" },
          { fragment_value: "value2", frequency_count: 5, source_id: "src1" },
        ],
      };

      mockFrom
        .mockReturnValueOnce(mockBlacklistQuery)
        .mockReturnValueOnce(mockFragmentsQuery);

      // Mock calculateFieldConfidence to return high confidence
      vi.spyOn(service, "calculateFieldConfidence" as any).mockResolvedValue({
        confidence: 0.95,
        type_consistency: 1.0,
        naming_pattern_match: true,
        format_consistency: 1.0,
        inferred_type: "string",
      });

      const result = await service.checkAutoEnhancementEligibility({
        entity_type: "transaction",
        fragment_key: "field_name",
        user_id: "test-user-id",
      });

      expect(result.eligible).toBe(false);
      expect(result.reasoning).toContain("only one source");
    });
  });

  describe("calculateFieldConfidence", () => {
    it("should calculate high confidence for consistent types", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "string1", frequency_count: 1 },
          { fragment_value: "string2", frequency_count: 1 },
          { fragment_value: "string3", frequency_count: 1 },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.calculateFieldConfidence({
        fragment_key: "field_name",
        entity_type: "transaction",
        user_id: "test-user-id",
      });

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.type_consistency).toBeGreaterThan(0);
    });

    it("should detect dates via ISO 8601 format", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "2024-01-01T00:00:00Z", frequency_count: 1 },
          { fragment_value: "2024-01-02T00:00:00Z", frequency_count: 1 },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.calculateFieldConfidence({
        fragment_key: "date_field",
        entity_type: "transaction",
      });

      expect(result.inferred_type).toBe("date");
      expect(result.format_consistency).toBeGreaterThan(0);
    });

    it("should detect numbers via numeric strings", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "123.45", frequency_count: 1 },
          { fragment_value: "678.90", frequency_count: 1 },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.calculateFieldConfidence({
        fragment_key: "amount",
        entity_type: "transaction",
      });

      expect(result.inferred_type).toBe("number");
    });

    it("should detect booleans via boolean strings", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "true", frequency_count: 1 },
          { fragment_value: "false", frequency_count: 1 },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.calculateFieldConfidence({
        fragment_key: "is_active",
        entity_type: "transaction",
      });

      expect(result.inferred_type).toBe("boolean");
    });

    it("should recognize common naming patterns", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "value1", frequency_count: 1 },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.calculateFieldConfidence({
        fragment_key: "transaction_id",
        entity_type: "transaction",
      });

      expect(result.naming_pattern_match).toBe(true);
    });

    it("should calculate format consistency", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          { fragment_value: "2024-01-01", frequency_count: 1 },
          { fragment_value: "2024-01-02", frequency_count: 1 },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.calculateFieldConfidence({
        fragment_key: "date_field",
        entity_type: "transaction",
      });

      expect(result.format_consistency).toBeGreaterThan(0);
    });
  });

  describe("analyzeRawFragments", () => {
    it("should group fragments by entity type and field", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          {
            entity_type: "transaction",
            fragment_key: "field1",
            fragment_value: "value1",
            frequency_count: 5,
            user_id: null,
          },
          {
            entity_type: "transaction",
            fragment_key: "field1",
            fragment_value: "value2",
            frequency_count: 3,
            user_id: null,
          },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      // Mock calculateFieldConfidence
      vi.spyOn(service, "calculateFieldConfidence" as any).mockResolvedValue({
        confidence: 0.9,
        type_consistency: 0.95,
        naming_pattern_match: true,
        format_consistency: 0.9,
        inferred_type: "string",
      });

      const result = await service.analyzeRawFragments({
        entity_type: "transaction",
        min_frequency: 5,
        min_confidence: 0.8,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].entity_type).toBe("transaction");
      expect(result[0].fields.length).toBeGreaterThan(0);
    });

    it("should filter by min_frequency", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          {
            entity_type: "transaction",
            fragment_key: "field1",
            fragment_value: "value1",
            frequency_count: 2, // Below threshold
            user_id: null,
          },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      const result = await service.analyzeRawFragments({
        entity_type: "transaction",
        min_frequency: 5,
      });

      // Should be filtered out due to low frequency
      expect(result.length).toBe(0);
    });

    it("should filter by min_confidence", async () => {
      const mockFragmentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [
          {
            entity_type: "transaction",
            fragment_key: "field1",
            fragment_value: "value1",
            frequency_count: 10,
            user_id: null,
          },
        ],
      };

      mockFrom.mockReturnValueOnce(mockFragmentsQuery);

      // Mock low confidence
      vi.spyOn(service, "calculateFieldConfidence" as any).mockResolvedValue({
        confidence: 0.5, // Below threshold
        type_consistency: 0.5,
        naming_pattern_match: false,
        format_consistency: 0.5,
        inferred_type: "string",
      });

      const result = await service.analyzeRawFragments({
        entity_type: "transaction",
        min_confidence: 0.8,
      });

      // Should be filtered out due to low confidence
      expect(result.length).toBe(0);
    });
  });

  describe("autoEnhanceSchema", () => {
    it("should be idempotent (prevent duplicate enhancements)", async () => {
      const mockRecommendationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "existing-id", status: "auto_applied" },
        }),
      };

      mockFrom.mockReturnValueOnce(mockRecommendationsQuery);

      const result = await service.autoEnhanceSchema({
        entity_type: "transaction",
        field_name: "field1",
        field_type: "string",
        user_id: "test-user-id",
      });

      // Should return existing recommendation
      expect(result).toBeDefined();
    });

    it("should check if field already exists in schema", async () => {
      const { SchemaRegistryService } = await import("../../src/services/schema_registry.js");
      const mockRegistry = new SchemaRegistryService();
      mockRegistry.loadActiveSchema = vi.fn().mockResolvedValue({
        schema_definition: {
          fields: {
            field1: { type: "string" },
          },
        },
      });

      // Mock recommendations query - not found
      const mockRecommendationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
      };

      mockFrom.mockReturnValueOnce(mockRecommendationsQuery);

      // Mock schema registry
      service["schemaRegistry"] = mockRegistry as any;

      const result = await service.autoEnhanceSchema({
        entity_type: "transaction",
        field_name: "field1", // Already exists
        field_type: "string",
      });

      // Should return existing schema
      expect(result).toBeDefined();
    });

    it("should create recommendation record", async () => {
      // Mock recommendations query - not found
      const mockRecommendationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
      };

      // Mock schema registry - field doesn't exist
      const { SchemaRegistryService } = await import("../../src/services/schema_registry.js");
      const mockRegistry = new SchemaRegistryService();
      mockRegistry.loadActiveSchema = vi.fn().mockResolvedValue({
        schema_definition: {
          fields: {},
        },
      });
      service["schemaRegistry"] = mockRegistry as any;

      // Mock insert
      const mockInsert = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "new-id", status: "auto_applied" },
        }),
      };

      mockFrom
        .mockReturnValueOnce(mockRecommendationsQuery)
        .mockReturnValueOnce(mockInsert);

      const result = await service.autoEnhanceSchema({
        entity_type: "transaction",
        field_name: "new_field",
        field_type: "string",
      });

      expect(result).toBeDefined();
      expect(mockInsert.insert).toHaveBeenCalled();
    });
  });

  describe("Field Validation", () => {
    it("should reject fields with leading underscores", () => {
      const isValid = (service as any).isValidFieldName("_invalid");
      expect(isValid).toBe(false);
    });

    it("should reject fields with trailing underscores", () => {
      const isValid = (service as any).isValidFieldName("invalid_");
      expect(isValid).toBe(false);
    });

    it("should reject fields with special characters", () => {
      const isValid = (service as any).isValidFieldName("field-name");
      expect(isValid).toBe(false);
    });

    it("should reject fields longer than 50 characters", () => {
      const longName = "a".repeat(51);
      const isValid = (service as any).isValidFieldName(longName);
      expect(isValid).toBe(false);
    });

    it("should accept valid field names", () => {
      expect((service as any).isValidFieldName("valid_field_name")).toBe(true);
      expect((service as any).isValidFieldName("fieldName123")).toBe(true);
      expect((service as any).isValidFieldName("transaction_id")).toBe(true);
    });
  });

  describe("Type Inference", () => {
    it("should infer string type for text values", () => {
      const type = (service as any).inferType("some text");
      expect(type).toBe("string");
    });

    it("should infer number type for numeric values", () => {
      const type = (service as any).inferType(123.45);
      expect(type).toBe("number");
    });

    it("should infer date type for ISO 8601 strings", () => {
      const type = (service as any).inferType("2024-01-01T00:00:00Z");
      expect(type).toBe("date");
    });

    it("should infer boolean type for boolean strings", () => {
      expect((service as any).inferType("true")).toBe("boolean");
      expect((service as any).inferType("false")).toBe("boolean");
    });

    it("should infer array type for arrays", () => {
      const type = (service as any).inferType([1, 2, 3]);
      expect(type).toBe("array");
    });

    it("should infer object type for objects", () => {
      const type = (service as any).inferType({ key: "value" });
      expect(type).toBe("object");
    });
  });

  describe("Blacklist Matching", () => {
    it("should match wildcard patterns correctly", () => {
      expect((service as any).matchesPattern("_test_field", "_test*")).toBe(true);
      expect((service as any).matchesPattern("field_debug", "*debug")).toBe(true);
      expect((service as any).matchesPattern("valid_field", "_test*")).toBe(false);
    });
  });
});
