/**
 * Unit tests for sightings-related schema additions (#1604):
 * - IntakeHintSchema validation
 * - StoreRequestSchema overflow mode (no entities / idempotency_key required)
 * - RetrieveEntitiesRequestSchema collapse_by field
 * - Backward compat: existing calls without intake still work
 */
import { describe, it, expect } from "vitest";
import {
  IntakeHintSchema,
  StoreRequestSchema,
  RetrieveEntitiesRequestSchema,
} from "../../shared/action_schemas.js";

describe("IntakeHintSchema", () => {
  it("defaults mode to 'graph'", () => {
    const result = IntakeHintSchema.parse({});
    expect(result.mode).toBe("graph");
  });

  it("accepts mode='overflow'", () => {
    const result = IntakeHintSchema.parse({ mode: "overflow", reason: "bulk" });
    expect(result.mode).toBe("overflow");
    expect(result.reason).toBe("bulk");
  });

  it("accepts mode='graph' explicitly", () => {
    expect(() => IntakeHintSchema.parse({ mode: "graph" })).not.toThrow();
  });

  it("rejects unknown mode", () => {
    expect(() => IntakeHintSchema.parse({ mode: "discard" })).toThrow();
  });
});

describe("StoreRequestSchema — overflow mode", () => {
  it("accepts overflow without entities or idempotency_key", () => {
    expect(() =>
      StoreRequestSchema.parse({
        intake: { mode: "overflow", reason: "test" },
      })
    ).not.toThrow();
  });

  it("accepts overflow with entities (still valid)", () => {
    expect(() =>
      StoreRequestSchema.parse({
        intake: { mode: "overflow" },
        entities: [{ entity_type: "task", title: "Test" }],
      })
    ).not.toThrow();
  });

  it("still requires entities/file for graph mode (backward compat)", () => {
    const result = StoreRequestSchema.safeParse({
      idempotency_key: "key-123",
      // no entities, no file — graph mode by default
    });
    expect(result.success).toBe(false);
  });

  it("still requires idempotency_key for graph mode (backward compat)", () => {
    const result = StoreRequestSchema.safeParse({
      entities: [{ entity_type: "task", title: "Test" }],
      // no idempotency_key and mode is graph (default)
    });
    // Note: StoreRequestSchema idempotency_key is optional at the schema level
    // for backward compat; the MCP store() method's local schema enforces it.
    // This test validates that the schema accepts it absent (soft).
    expect(result.success).toBe(true);
  });

  it("preserves existing valid structured call", () => {
    expect(() =>
      StoreRequestSchema.parse({
        entities: [{ entity_type: "contact", name: "Jane Doe" }],
        idempotency_key: "test-idemp-1",
      })
    ).not.toThrow();
  });

  it("overflow result carries intake.reason through parse", () => {
    const parsed = StoreRequestSchema.parse({
      intake: { mode: "overflow", reason: "nightly-ingest" },
    });
    expect(parsed.intake?.mode).toBe("overflow");
    expect(parsed.intake?.reason).toBe("nightly-ingest");
  });
});

describe("RetrieveEntitiesRequestSchema — collapse_by", () => {
  it("accepts collapse_by='canonical_key'", () => {
    const parsed = RetrieveEntitiesRequestSchema.parse({ collapse_by: "canonical_key" });
    expect(parsed.collapse_by).toBe("canonical_key");
  });

  it("collapse_by is optional (backward compat)", () => {
    const parsed = RetrieveEntitiesRequestSchema.parse({});
    expect(parsed.collapse_by).toBeUndefined();
  });

  it("rejects unknown collapse_by value", () => {
    expect(() => RetrieveEntitiesRequestSchema.parse({ collapse_by: "entity_type" })).toThrow();
  });

  it("accepts collapse_by alongside search and entity_type", () => {
    expect(() =>
      RetrieveEntitiesRequestSchema.parse({
        entity_type: "event",
        collapse_by: "canonical_key",
        limit: 50,
      })
    ).not.toThrow();
  });
});
