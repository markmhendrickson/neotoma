/**
 * Unit tests for `src/services/standing_rules.ts`.
 *
 * Covers:
 * - Returns empty array when no entities exist
 * - Filters out entities with enabled: false
 * - Filters out entities with no rule_text
 * - Orders by priority descending, then title ascending
 * - Handles DB errors gracefully (returns empty array)
 * - Handles unexpected exceptions gracefully (returns empty array)
 * - Passes scope through to the result
 * - Parses a snapshot delivered as JSON text (libSQL variant)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the db module — must be hoisted before any dynamic imports.
// ---------------------------------------------------------------------------

// Mutable container so individual tests can change the resolved value.
const resolvedValue: { data: unknown; error: unknown } = { data: [], error: null };

// Merge-pointer rows returned for the secondary `entities` lookup.
const mergedValue: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("../../src/db.js", () => {
  // The query is a thenable chain of .eq() calls; which table was addressed
  // decides which fixture resolves. Mirrors the real two-query shape.
  const makeChain = (table: string) => {
    const result = () => (table === "entities" ? mergedValue : resolvedValue);
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  const mockFrom = vi.fn((table: string) => ({ select: vi.fn(() => makeChain(table)) }));

  return { db: { from: mockFrom } };
});

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getActiveStandingRules } from "../../src/services/standing_rules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FakeRow {
  entity_id: string;
  canonical_name: string;
  // Backends differ on whether a JSON column arrives parsed or as text, so the
  // fixture can produce either.
  snapshot: Record<string, unknown> | string;
}

function makeRow(opts: {
  id?: string;
  canonical_name?: string;
  snapshot?: Record<string, unknown>;
  snapshotAsText?: boolean;
}): FakeRow {
  const snap = opts.snapshot ?? {};
  return {
    entity_id: opts.id ?? "entity-1",
    canonical_name: opts.canonical_name ?? "Rule One",
    snapshot: opts.snapshotAsText ? JSON.stringify(snap) : snap,
  };
}

function setMerged(rows: Array<{ id: string; merged_to_entity_id: string | null }>): void {
  mergedValue.data = rows;
  mergedValue.error = null;
}

function setRows(rows: FakeRow[], error: unknown = null): void {
  resolvedValue.data = error ? null : rows;
  resolvedValue.error = error;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getActiveStandingRules", () => {
  beforeEach(() => {
    setRows([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no entities exist", async () => {
    setRows([]);
    const result = await getActiveStandingRules("user-1");
    expect(result).toEqual([]);
  });

  it("returns empty array on DB error", async () => {
    setRows([], { message: "connection refused" });
    const result = await getActiveStandingRules("user-1");
    expect(result).toEqual([]);
  });

  it("filters out rules with enabled: false", async () => {
    setRows([
      makeRow({
        id: "e1",
        canonical_name: "Rule One",
        snapshot: { title: "Rule One", rule_text: "Do X", enabled: false },
      }),
      makeRow({
        id: "e2",
        canonical_name: "Rule Two",
        snapshot: { title: "Rule Two", rule_text: "Do Y", enabled: true },
      }),
    ]);

    const result = await getActiveStandingRules("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].entity_id).toBe("e2");
  });

  it("filters out rules with missing rule_text", async () => {
    setRows([
      makeRow({
        id: "e1",
        canonical_name: "No Text",
        snapshot: { title: "No Text" },
      }),
      makeRow({
        id: "e2",
        canonical_name: "Has Text",
        snapshot: { title: "Has Text", rule_text: "Do something" },
      }),
    ]);

    const result = await getActiveStandingRules("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].entity_id).toBe("e2");
  });

  it("orders by priority descending then title ascending", async () => {
    setRows([
      makeRow({
        id: "e1",
        canonical_name: "Bravo",
        snapshot: { title: "Bravo", rule_text: "B", priority: 10 },
      }),
      makeRow({
        id: "e2",
        canonical_name: "Alpha",
        snapshot: { title: "Alpha", rule_text: "A", priority: 10 },
      }),
      makeRow({
        id: "e3",
        canonical_name: "Charlie",
        snapshot: { title: "Charlie", rule_text: "C", priority: 5 },
      }),
    ]);

    const result = await getActiveStandingRules("user-1");
    expect(result.map((r) => r.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("uses canonical_name as title fallback when snapshot.title is missing", async () => {
    setRows([
      makeRow({
        id: "e1",
        canonical_name: "Fallback Title",
        snapshot: { rule_text: "some rule" },
      }),
    ]);

    const result = await getActiveStandingRules("user-1");
    expect(result[0].title).toBe("Fallback Title");
  });

  it("passes scope through to the result", async () => {
    setRows([
      makeRow({
        id: "e1",
        canonical_name: "Scoped Rule",
        snapshot: { title: "Scoped Rule", rule_text: "scoped text", scope: "my-project" },
      }),
    ]);

    const result = await getActiveStandingRules("user-1");
    expect(result[0].scope).toBe("my-project");
  });

  it("defaults priority to 0 when not set", async () => {
    setRows([
      makeRow({
        id: "e1",
        canonical_name: "No Priority",
        snapshot: { title: "No Priority", rule_text: "text" },
      }),
    ]);

    const result = await getActiveStandingRules("user-1");
    expect(result[0].priority).toBe(0);
  });

  it("parses a snapshot delivered as JSON text (libSQL variant)", async () => {
    setRows([
      makeRow({
        id: "e1",
        canonical_name: "Array Snap",
        snapshot: { title: "Array Snap", rule_text: "arr text" },
        snapshotAsText: true,
      }),
    ]);

    const result = await getActiveStandingRules("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Array Snap");
    expect(result[0].rule_text).toBe("arr text");
  });
});
