/**
 * Unit tests for `src/services/usage_stats.ts`.
 *
 * Covers:
 * - Returns zero counts when DB returns empty rows
 * - Correctly counts entities_by_type and sorts by count descending
 * - Correctly counts entities_created_last_7_days and entities_created_last_30_days
 * - Correctly counts observations_by_source, treating null as "unclassified"
 * - Correctly computes entity_types_with_schema (intersection of entities and schema_registry)
 * - Applies user_id filter when provided
 * - Returns last_updated as a valid ISO string
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// DB mock helpers — each test overrides mockFrom to return test data.
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("../../src/db.js", () => ({
  db: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Import after mocking
const { getUsageStats } = await import("../../src/services/usage_stats.js");

// ---------------------------------------------------------------------------
// Helpers to build chainable Supabase query stubs
// ---------------------------------------------------------------------------

type MockRow = Record<string, unknown>;

function entityQueryStub(rows: MockRow[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    data: rows,
    error: null,
  };
  // make awaiting the chain object return { data, error }
  Object.defineProperty(chain, "then", {
    value: (resolve: (v: { data: MockRow[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  });
  return chain;
}

function obsQueryStub(rows: MockRow[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    data: rows,
    error: null,
  };
  Object.defineProperty(chain, "then", {
    value: (resolve: (v: { data: MockRow[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  });
  return chain;
}

function schemaQueryStub(rows: MockRow[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    data: rows,
    error: null,
  };
  Object.defineProperty(chain, "then", {
    value: (resolve: (v: { data: MockRow[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getUsageStats", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("returns zero counts when all DB tables are empty", async () => {
    mockFrom
      .mockReturnValueOnce(entityQueryStub([]))
      .mockReturnValueOnce(obsQueryStub([]))
      .mockReturnValueOnce(schemaQueryStub([]));

    const stats = await getUsageStats();

    expect(stats.total_entities).toBe(0);
    expect(stats.entities_by_type).toEqual({});
    expect(stats.total_observations).toBe(0);
    expect(stats.observations_by_source).toEqual({});
    expect(stats.entities_created_last_7_days).toBe(0);
    expect(stats.entities_created_last_30_days).toBe(0);
    expect(stats.entity_types_with_schema).toBe(0);
    expect(stats.entity_types_total).toBe(0);
    expect(new Date(stats.last_updated).toString()).not.toBe("Invalid Date");
  });

  it("counts entities_by_type and sorts by count descending", async () => {
    const now = new Date();
    const entities = [
      { entity_type: "contact", created_at: now.toISOString() },
      { entity_type: "task", created_at: now.toISOString() },
      { entity_type: "contact", created_at: now.toISOString() },
      { entity_type: "note", created_at: now.toISOString() },
      { entity_type: "contact", created_at: now.toISOString() },
      { entity_type: "task", created_at: now.toISOString() },
    ];
    mockFrom
      .mockReturnValueOnce(entityQueryStub(entities))
      .mockReturnValueOnce(obsQueryStub([]))
      .mockReturnValueOnce(schemaQueryStub([]));

    const stats = await getUsageStats();

    expect(stats.total_entities).toBe(6);
    expect(stats.entity_types_total).toBe(3);

    const typeEntries = Object.entries(stats.entities_by_type);
    // Sorted by count descending
    expect(typeEntries[0]).toEqual(["contact", 3]);
    expect(typeEntries[1]).toEqual(["task", 2]);
    expect(typeEntries[2]).toEqual(["note", 1]);
  });

  it("counts entities_created_last_7_days and _last_30_days", async () => {
    const now = new Date();
    const recent3d = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const recent15d = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const old60d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const entities = [
      { entity_type: "contact", created_at: recent3d },
      { entity_type: "contact", created_at: recent15d },
      { entity_type: "note", created_at: old60d },
    ];
    mockFrom
      .mockReturnValueOnce(entityQueryStub(entities))
      .mockReturnValueOnce(obsQueryStub([]))
      .mockReturnValueOnce(schemaQueryStub([]));

    const stats = await getUsageStats();

    expect(stats.entities_created_last_7_days).toBe(1);
    expect(stats.entities_created_last_30_days).toBe(2);
  });

  it("counts observations_by_source and treats null as 'unclassified'", async () => {
    const observations = [
      { observation_source: "llm_summary" },
      { observation_source: "human" },
      { observation_source: "llm_summary" },
      { observation_source: null },
      { observation_source: "llm_summary" },
    ];
    mockFrom
      .mockReturnValueOnce(entityQueryStub([]))
      .mockReturnValueOnce(obsQueryStub(observations))
      .mockReturnValueOnce(schemaQueryStub([]));

    const stats = await getUsageStats();

    expect(stats.total_observations).toBe(5);
    expect(stats.observations_by_source["llm_summary"]).toBe(3);
    expect(stats.observations_by_source["human"]).toBe(1);
    expect(stats.observations_by_source["unclassified"]).toBe(1);
  });

  it("computes entity_types_with_schema as intersection of entity types and registry", async () => {
    const now = new Date();
    const entities = [
      { entity_type: "contact", created_at: now.toISOString() },
      { entity_type: "task", created_at: now.toISOString() },
      { entity_type: "project", created_at: now.toISOString() },
    ];
    const schemaRows = [
      { entity_type: "contact" },
      { entity_type: "task" },
      // "project" is NOT in schema_registry
    ];
    mockFrom
      .mockReturnValueOnce(entityQueryStub(entities))
      .mockReturnValueOnce(obsQueryStub([]))
      .mockReturnValueOnce(schemaQueryStub(schemaRows));

    const stats = await getUsageStats();

    expect(stats.entity_types_total).toBe(3);
    expect(stats.entity_types_with_schema).toBe(2);
  });

  it("applies user_id filter when provided", async () => {
    mockFrom
      .mockReturnValueOnce(entityQueryStub([]))
      .mockReturnValueOnce(obsQueryStub([]))
      .mockReturnValueOnce(schemaQueryStub([]));

    await getUsageStats("test-user-id");

    // First call is the entities query — verify it called eq() for user filtering
    const entitiesChain = mockFrom.mock.results[0].value;
    expect(entitiesChain.eq).toHaveBeenCalledWith("user_id", "test-user-id");

    // Second call is the observations query — verify it called eq() for user filtering
    const obsChain = mockFrom.mock.results[1].value;
    expect(obsChain.eq).toHaveBeenCalledWith("user_id", "test-user-id");
  });

  it("does not apply user_id filter when userId is undefined", async () => {
    mockFrom
      .mockReturnValueOnce(entityQueryStub([]))
      .mockReturnValueOnce(obsQueryStub([]))
      .mockReturnValueOnce(schemaQueryStub([]));

    await getUsageStats(undefined);

    // No eq() calls for user_id
    const entitiesChain = mockFrom.mock.results[0].value;
    expect(entitiesChain.eq).not.toHaveBeenCalled();
  });

  it("returns last_updated as a valid ISO 8601 string", async () => {
    mockFrom
      .mockReturnValueOnce(entityQueryStub([]))
      .mockReturnValueOnce(obsQueryStub([]))
      .mockReturnValueOnce(schemaQueryStub([]));

    const stats = await getUsageStats();

    expect(stats.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(stats.last_updated).toISOString()).toBe(stats.last_updated);
  });
});
