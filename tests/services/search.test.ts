/**
 * Unit tests for Search Service
 * 
 * Tests deterministic search ranking and sorting.
 */

import { describe, it, expect } from "vitest";
import { rankSearchResults, sortRecordsDeterministically } from "../../src/services/search.js";
import type { NeotomaRecord } from "../../src/db.js";

describe("Search Service", () => {
  describe("rankSearchResults", () => {
    const createMockRecord = (overrides: Partial<NeotomaRecord> = {}): NeotomaRecord => ({
      id: `rec_${Math.random().toString(36).substring(7)}`,
      type: "transaction",
      properties: {},
      raw_text: "",
      schema_type: "transaction",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: null,
      ...overrides,
    });

    it("should return empty array for empty input", () => {
      const results = rankSearchResults([], "test");
      expect(results).toEqual([]);
    });

    it("should return results unchanged when no query provided", () => {
      const records = [
        createMockRecord({ id: "rec_1" }),
        createMockRecord({ id: "rec_2" }),
      ];
      
      const results = rankSearchResults(records);
      
      expect(results.length).toBe(2);
      expect(results[0].id).toBe("rec_1");
      expect(results[1].id).toBe("rec_2");
    });

    it("should rank exact type match highest", () => {
      const records = [
        createMockRecord({ id: "rec_1", type: "transaction" }),
        createMockRecord({ id: "rec_2", type: "invoice" }),
        createMockRecord({ id: "rec_3", type: "receipt" }),
      ];
      
      const results = rankSearchResults(records, "invoice");
      
      expect(results[0].id).toBe("rec_2"); // Exact match
    });

    it("should rank type contains query high", () => {
      const records = [
        createMockRecord({ id: "rec_1", type: "bank_transaction" }),
        createMockRecord({ id: "rec_2", type: "invoice" }),
      ];
      
      const results = rankSearchResults(records, "transaction");
      
      expect(results[0].id).toBe("rec_1"); // Contains "transaction"
    });

    it("should rank property matches", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          type: "transaction",
          properties: { vendor: "Acme Corp" },
        }),
        createMockRecord({
          id: "rec_2",
          type: "transaction",
          properties: { vendor: "Beta Inc" },
        }),
      ];
      
      const results = rankSearchResults(records, "Acme");
      
      expect(results[0].id).toBe("rec_1");
    });

    it("should rank exact property value match higher than partial", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          type: "transaction",
          properties: { vendor: "Acme Corp" },
        }),
        createMockRecord({
          id: "rec_2",
          type: "transaction",
          properties: { vendor: "Acme" },
        }),
      ];
      
      const results = rankSearchResults(records, "acme");
      
      expect(results[0].id).toBe("rec_2"); // Exact match
    });

    it("should be case insensitive", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          type: "transaction",
          properties: { vendor: "ACME CORP" },
        }),
        createMockRecord({
          id: "rec_2",
          type: "transaction",
          properties: { vendor: "other" },
        }),
      ];
      
      const results = rankSearchResults(records, "acme");
      
      expect(results[0].id).toBe("rec_1");
    });

    it("should use created_at as tiebreaker for same score", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          type: "transaction",
          created_at: "2025-01-01T00:00:00Z",
        }),
        createMockRecord({
          id: "rec_2",
          type: "transaction",
          created_at: "2025-01-02T00:00:00Z",
        }),
      ];
      
      const results = rankSearchResults(records, "transaction");
      
      // Same score, newer first
      expect(results[0].id).toBe("rec_2");
      expect(results[1].id).toBe("rec_1");
    });

    it("should use id as final tiebreaker", () => {
      const sameTime = "2025-01-01T00:00:00Z";
      const records = [
        createMockRecord({
          id: "rec_zzz",
          type: "transaction",
          created_at: sameTime,
        }),
        createMockRecord({
          id: "rec_aaa",
          type: "transaction",
          created_at: sameTime,
        }),
      ];
      
      const results = rankSearchResults(records, "transaction");
      
      // Same score, same time, lexicographic order
      expect(results[0].id).toBe("rec_aaa");
      expect(results[1].id).toBe("rec_zzz");
    });

    it("should be deterministic across multiple runs", () => {
      const records = [
        createMockRecord({ id: "rec_1", type: "invoice" }),
        createMockRecord({ id: "rec_2", type: "transaction" }),
        createMockRecord({ id: "rec_3", type: "receipt" }),
      ];
      
      const results1 = rankSearchResults([...records], "invoice");
      const results2 = rankSearchResults([...records], "invoice");
      const results3 = rankSearchResults([...records], "invoice");
      
      expect(results1.map((r) => r.id)).toEqual(results2.map((r) => r.id));
      expect(results2.map((r) => r.id)).toEqual(results3.map((r) => r.id));
    });

    it("should handle empty query", () => {
      const records = [
        createMockRecord({ id: "rec_1" }),
        createMockRecord({ id: "rec_2" }),
      ];
      
      const results = rankSearchResults(records, "");
      
      expect(results.length).toBe(2);
    });

    it("should handle special characters in query", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          properties: { vendor: "AT&T Corp" },
        }),
        createMockRecord({
          id: "rec_2",
          properties: { vendor: "Acme Inc" },
        }),
      ];
      
      const results = rankSearchResults(records, "AT&T");
      
      expect(results[0].id).toBe("rec_1");
    });

    it("should count multiple property matches", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          properties: {
            vendor: "Acme",
            description: "Payment to Acme for services",
            notes: "Acme invoice",
          },
        }),
        createMockRecord({
          id: "rec_2",
          properties: { vendor: "Acme" },
        }),
      ];
      
      const results = rankSearchResults(records, "Acme");
      
      // rec_1 has more matches, should rank higher
      expect(results[0].id).toBe("rec_1");
    });
  });

  describe("sortRecordsDeterministically", () => {
    const createMockRecord = (overrides: Partial<NeotomaRecord> = {}): NeotomaRecord => ({
      id: `rec_${Math.random().toString(36).substring(7)}`,
      type: "transaction",
      properties: {},
      raw_text: "",
      schema_type: "transaction",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: null,
      ...overrides,
    });

    it("should sort by created_at DESC (newer first)", () => {
      const records = [
        createMockRecord({ id: "rec_1", created_at: "2025-01-01T00:00:00Z" }),
        createMockRecord({ id: "rec_2", created_at: "2025-01-03T00:00:00Z" }),
        createMockRecord({ id: "rec_3", created_at: "2025-01-02T00:00:00Z" }),
      ];
      
      const sorted = sortRecordsDeterministically(records);
      
      expect(sorted[0].id).toBe("rec_2"); // 2025-01-03
      expect(sorted[1].id).toBe("rec_3"); // 2025-01-02
      expect(sorted[2].id).toBe("rec_1"); // 2025-01-01
    });

    it("should use id as tiebreaker for same created_at", () => {
      const sameTime = "2025-01-01T00:00:00Z";
      const records = [
        createMockRecord({ id: "rec_zzz", created_at: sameTime }),
        createMockRecord({ id: "rec_aaa", created_at: sameTime }),
        createMockRecord({ id: "rec_mmm", created_at: sameTime }),
      ];
      
      const sorted = sortRecordsDeterministically(records);
      
      expect(sorted[0].id).toBe("rec_aaa");
      expect(sorted[1].id).toBe("rec_mmm");
      expect(sorted[2].id).toBe("rec_zzz");
    });

    it("should be deterministic across multiple runs", () => {
      const records = [
        createMockRecord({ id: "rec_1", created_at: "2025-01-01T00:00:00Z" }),
        createMockRecord({ id: "rec_2", created_at: "2025-01-02T00:00:00Z" }),
        createMockRecord({ id: "rec_3", created_at: "2025-01-01T00:00:00Z" }),
      ];
      
      const sorted1 = sortRecordsDeterministically([...records]);
      const sorted2 = sortRecordsDeterministically([...records]);
      const sorted3 = sortRecordsDeterministically([...records]);
      
      expect(sorted1.map((r) => r.id)).toEqual(sorted2.map((r) => r.id));
      expect(sorted2.map((r) => r.id)).toEqual(sorted3.map((r) => r.id));
    });

    it("should not mutate input array", () => {
      const records = [
        createMockRecord({ id: "rec_2", created_at: "2025-01-02T00:00:00Z" }),
        createMockRecord({ id: "rec_1", created_at: "2025-01-01T00:00:00Z" }),
      ];
      
      const originalOrder = records.map((r) => r.id);
      sortRecordsDeterministically(records);
      
      expect(records.map((r) => r.id)).toEqual(originalOrder);
    });

    it("should handle empty array", () => {
      const sorted = sortRecordsDeterministically([]);
      expect(sorted).toEqual([]);
    });

    it("should handle single record", () => {
      const records = [createMockRecord({ id: "rec_1" })];
      const sorted = sortRecordsDeterministically(records);
      
      expect(sorted.length).toBe(1);
      expect(sorted[0].id).toBe("rec_1");
    });

    it("should handle records with identical timestamps and IDs", () => {
      const sameTime = "2025-01-01T00:00:00Z";
      const records = [
        createMockRecord({ id: "rec_same", created_at: sameTime }),
        createMockRecord({ id: "rec_same", created_at: sameTime }),
      ];
      
      const sorted = sortRecordsDeterministically(records);
      
      expect(sorted.length).toBe(2);
      expect(sorted[0].id).toBe("rec_same");
    });
  });

  describe("Determinism and Performance", () => {
    it("should complete ranking in reasonable time for large datasets", () => {
      const records = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `rec_${i}`,
          type: "transaction",
          properties: { amount: i },
          raw_text: "",
          schema_type: "transaction",
          created_at: new Date(2025, 0, 1 + (i % 30)).toISOString(),
          updated_at: new Date().toISOString(),
          user_id: null,
        }));
      
      const start = Date.now();
      const results = rankSearchResults(records, "transaction");
      const duration = Date.now() - start;
      
      expect(results.length).toBe(1000);
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });

    it("should produce same results for same input (determinism test)", () => {
      const records = [
        {
          id: "rec_1",
          type: "invoice",
          properties: { vendor: "Acme Corp", amount: 100 },
          raw_text: "",
          schema_type: "invoice",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
          user_id: null,
        },
        {
          id: "rec_2",
          type: "transaction",
          properties: { description: "Acme payment" },
          raw_text: "",
          schema_type: "transaction",
          created_at: "2025-01-02T00:00:00Z",
          updated_at: "2025-01-02T00:00:00Z",
          user_id: null,
        },
      ];
      
      // Run ranking 100 times
      const allResults = Array(100)
        .fill(null)
        .map(() => rankSearchResults([...records], "Acme"));
      
      // All results should be identical
      const firstResult = allResults[0].map((r) => r.id);
      const allSame = allResults.every((result) =>
        JSON.stringify(result.map((r) => r.id)) === JSON.stringify(firstResult)
      );
      
      expect(allSame).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    const createMockRecord = (overrides: Partial<NeotomaRecord> = {}): NeotomaRecord => ({
      id: `rec_${Date.now()}`,
      type: "transaction",
      properties: {},
      raw_text: "",
      schema_type: "transaction",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: null,
      ...overrides,
    });

    it("should handle null properties", () => {
      const records = [
        createMockRecord({ id: "rec_1", properties: null as any }),
      ];
      
      const results = rankSearchResults(records, "test");
      
      expect(results.length).toBe(1);
    });

    it("should handle undefined properties", () => {
      const records = [
        createMockRecord({ id: "rec_1", properties: undefined as any }),
      ];
      
      const results = rankSearchResults(records, "test");
      
      expect(results.length).toBe(1);
    });

    it("should handle empty properties object", () => {
      const records = [
        createMockRecord({ id: "rec_1", properties: {} }),
      ];
      
      const results = rankSearchResults(records, "test");
      
      expect(results.length).toBe(1);
    });

    it("should handle query with regex special characters", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          properties: { vendor: "AT&T (Corp)" },
        }),
      ];
      
      // Should not throw regex error
      const results = rankSearchResults(records, "AT&T (Corp)");
      
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("rec_1");
    });

    it("should handle very long query strings", () => {
      const longQuery = "a".repeat(1000);
      const records = [
        createMockRecord({ id: "rec_1" }),
      ];
      
      const results = rankSearchResults(records, longQuery);
      
      expect(results.length).toBe(1);
    });

    it("should handle Unicode characters", () => {
      const records = [
        createMockRecord({
          id: "rec_1",
          properties: { vendor: "Société Générale" },
        }),
      ];
      
      const results = rankSearchResults(records, "Société");
      
      expect(results[0].id).toBe("rec_1");
    });
  });
});
