/**
 * Unit Tests for Converter Detection Logic
 *
 * Tests the converter detection methods in isolation without database dependencies.
 */

import { describe, it, expect } from "vitest";
import { schemaRecommendationService } from "../../src/services/schema_recommendation.js";

describe("Converter Detection Unit Tests", () => {
  describe("Type inference for converter detection", () => {
    it("identifies nanosecond timestamps as date type", () => {
      const nanosTimestamp = 1766102400000000000; // 2026-01-20 in nanoseconds
      const samples = [nanosTimestamp, nanosTimestamp + 1000000000];

      // Access private method via type casting
      const service = schemaRecommendationService as any;
      const typeAnalysis = service.analyzeTypes(samples);

      expect(typeAnalysis.dominant_type).toBe("date");
      expect(typeAnalysis.consistency).toBe(1.0);
    });

    it("identifies millisecond timestamps as date type", () => {
      const msTimestamp = 1766102400000; // 2026-01-20 in milliseconds
      const samples = [msTimestamp, msTimestamp + 1000];

      const service = schemaRecommendationService as any;
      const typeAnalysis = service.analyzeTypes(samples);

      expect(typeAnalysis.dominant_type).toBe("date");
      expect(typeAnalysis.consistency).toBe(1.0);
    });

    it("identifies numeric strings as string type (keeps as string)", () => {
      const samples = ["123.45", "678.90", "999.99"];

      const service = schemaRecommendationService as any;
      const typeAnalysis = service.analyzeTypes(samples);

      // Numeric strings are kept as strings unless they're short
      expect(typeAnalysis.dominant_type).toBe("number");
      expect(typeAnalysis.consistency).toBe(1.0);
    });

    it("identifies ISO date strings as date type", () => {
      const samples = [
        "2026-01-20T00:00:00.000Z",
        "2026-01-21T00:00:00.000Z",
      ];

      const service = schemaRecommendationService as any;
      const typeAnalysis = service.analyzeTypes(samples);

      expect(typeAnalysis.dominant_type).toBe("date");
      expect(typeAnalysis.consistency).toBe(1.0);
    });
  });

  describe("detectConverterNeeded method", () => {
    it("detects timestamp_nanos_to_iso for nanosecond timestamps", async () => {
      const nanosTimestamp = 1766102400000000000;
      const fragments = [
        { fragment_value: nanosTimestamp },
        { fragment_value: nanosTimestamp + 1000000000 },
      ];

      const service = schemaRecommendationService as any;
      const result = await service.detectConverterNeeded({
        field_name: "created_at",
        schema_field: { type: "date", converters: [] },
        fragments,
      });

      expect(result).toBeDefined();
      expect(result?.converter.function).toBe("timestamp_nanos_to_iso");
      expect(result?.converter.from).toBe("number");
      expect(result?.converter.to).toBe("date");
      expect(result?.confidence).toBe(0.95);
    });

    it("detects timestamp_ms_to_iso for millisecond timestamps", async () => {
      const msTimestamp = 1766102400000;
      const fragments = [
        { fragment_value: msTimestamp },
        { fragment_value: msTimestamp + 1000 },
      ];

      const service = schemaRecommendationService as any;
      const result = await service.detectConverterNeeded({
        field_name: "updated_at",
        schema_field: { type: "date", converters: [] },
        fragments,
      });

      expect(result).toBeDefined();
      expect(result?.converter.function).toBe("timestamp_ms_to_iso");
    });

    it("detects string_to_number for numeric strings", async () => {
      const fragments = [
        { fragment_value: "123.45" },
        { fragment_value: "678.90" },
      ];

      const service = schemaRecommendationService as any;
      const result = await service.detectConverterNeeded({
        field_name: "amount",
        schema_field: { type: "number", converters: [] },
        fragments,
      });

      expect(result).toBeDefined();
      expect(result?.converter.function).toBe("string_to_number");
      expect(result?.converter.from).toBe("string");
      expect(result?.converter.to).toBe("number");
    });

    it("returns null when types already match", async () => {
      const fragments = [
        { fragment_value: "2026-01-20T00:00:00.000Z" },
        { fragment_value: "2026-01-21T00:00:00.000Z" },
      ];

      const service = schemaRecommendationService as any;
      const result = await service.detectConverterNeeded({
        field_name: "date_field",
        schema_field: { type: "date", converters: [] },
        fragments,
      });

      // Types match (date to date), no converter needed
      expect(result).toBeNull();
    });

    it("detects number_to_string converter", async () => {
      const fragments = [{ fragment_value: 123 }, { fragment_value: 456 }];

      const service = schemaRecommendationService as any;
      const result = await service.detectConverterNeeded({
        field_name: "id_field",
        schema_field: { type: "string", converters: [] },
        fragments,
      });

      expect(result).toBeDefined();
      expect(result?.converter.function).toBe("number_to_string");
    });

    it("detects timestamp_s_to_iso for second timestamps", async () => {
      const secondsTimestamp = 1766102400; // 2026-01-20 in seconds
      const fragments = [
        { fragment_value: secondsTimestamp },
        { fragment_value: secondsTimestamp + 100 },
      ];

      const service = schemaRecommendationService as any;
      const result = await service.detectConverterNeeded({
        field_name: "timestamp_field",
        schema_field: { type: "date", converters: [] },
        fragments,
      });

      expect(result).toBeDefined();
      expect(result?.converter.function).toBe("timestamp_s_to_iso");
    });
  });
});
