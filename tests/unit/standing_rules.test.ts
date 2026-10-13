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

import {
  getActiveStandingRules,
  getActiveStandingRulesResult,
} from "../../src/services/standing_rules.js";

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

  // #2131: an empty array must not be conflated with a failed lookup. That
  // ambiguity is what let a broken query masquerade as "no rules configured"
  // on every libSQL instance for weeks.
  describe("failure is distinguishable from empty (#2131)", () => {
    it("reports lookup_failed when the query errors", async () => {
      setRows([], { message: 'unrecognized token: "!"' });
      const result = await getActiveStandingRulesResult("user-1");
      expect(result.rules).toEqual([]);
      expect(result.lookup_failed).toBe(true);
      expect(result.error).toContain("unrecognized token");
    });

    it("reports lookup_failed=false when the user genuinely has no rules", async () => {
      setRows([]);
      const result = await getActiveStandingRulesResult("user-1");
      expect(result.rules).toEqual([]);
      expect(result.lookup_failed).toBe(false);
    });

    it("clears a prior failure once a lookup succeeds", async () => {
      setRows([], { message: "boom" });
      expect((await getActiveStandingRulesResult("user-1")).lookup_failed).toBe(true);
      setRows([makeRow({ snapshot: { title: "R", rule_text: "text" } })]);
      const after = await getActiveStandingRulesResult("user-1");
      expect(after.lookup_failed).toBe(false);
      expect(after.rules).toHaveLength(1);
    });

    // A driver that throws rather than returning `{ error }` reaches the outer
    // catch. That path swallowed the failure into a bare `[]`, reintroducing
    // the exact ambiguity this describe-block exists to close — just via a
    // thrown exception instead of an error-shaped result.
    it("reports lookup_failed when the driver throws", async () => {
      const { db } = (await import("../../src/db.js")) as unknown as {
        db: { from: ReturnType<typeof vi.fn> };
      };
      db.from.mockImplementationOnce(() => {
        throw new Error("connection reset");
      });

      const result = await getActiveStandingRulesResult("user-1");
      expect(result.rules).toEqual([]);
      expect(result.lookup_failed).toBe(true);
      expect(result.error).toContain("connection reset");
    });

    it("clears a thrown failure once a later lookup succeeds", async () => {
      const { db } = (await import("../../src/db.js")) as unknown as {
        db: { from: ReturnType<typeof vi.fn> };
      };
      db.from.mockImplementationOnce(() => {
        throw new Error("connection reset");
      });
      expect((await getActiveStandingRulesResult("user-1")).lookup_failed).toBe(true);

      setRows([makeRow({ snapshot: { title: "R", rule_text: "text" } })]);
      const after = await getActiveStandingRulesResult("user-1");
      expect(after.lookup_failed).toBe(false);
      expect(after.rules).toHaveLength(1);
    });

    // Regression: an earlier implementation carried the failure signal on a
    // module-level `let lastLookupFailure` variable, reset at the start of
    // each call and read again — via a separate `await` — after the call's
    // own DB query resolved. Two concurrent calls interleave at microtask
    // granularity: call A's DB query can resolve (successfully), yield the
    // microtask queue at its `await`, and then call B's DB query resolves
    // (with a failure) and sets the shared flag — all before A's paused
    // continuation resumes and reads that same shared flag. Under the
    // module-state implementation A incorrectly inherits B's failure. This
    // test forces exactly that resolution order with deferred promises and
    // asserts A's outcome reflects A's own (successful) query, not B's.
    it("keeps concurrent lookups for different users independent under adversarial interleaving", async () => {
      const { db } = (await import("../../src/db.js")) as unknown as {
        db: { from: ReturnType<typeof vi.fn> };
      };

      let releaseA: (() => void) | undefined;
      const gateA = new Promise<void>((resolve) => {
        releaseA = resolve;
      });
      let releaseB: (() => void) | undefined;
      const gateB = new Promise<void>((resolve) => {
        releaseB = resolve;
      });

      // Call A: succeeds, but its DB round-trip is gated so it resolves
      // only after we explicitly release it.
      db.from.mockImplementationOnce(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function (this: unknown) {
            return this;
          }),
          then: (resolve: (v: unknown) => unknown) =>
            gateA.then(() => resolve({ data: [], error: null })),
        })),
      }));
      const callA = getActiveStandingRulesResult("user-A");

      // Call B: fails, gated separately so we control exactly when its
      // failure is written relative to A's continuation.
      db.from.mockImplementationOnce(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function (this: unknown) {
            return this;
          }),
          then: (resolve: (v: unknown) => unknown) =>
            gateB.then(() => resolve({ data: null, error: { message: "user-B failure" } })),
        })),
      }));
      const callB = getActiveStandingRulesResult("user-B");

      // Release A's DB query first, but do NOT await callA yet — let its
      // continuation queue behind further microtasks we control below.
      releaseA?.();
      // Flush one microtask turn so A's `.then` callback (which resolves
      // A's DB call and returns from getActiveStandingRules) runs, without
      // yet running the continuation inside getActiveStandingRulesResult
      // that reads the shared flag.
      await Promise.resolve();

      // Now release B's failing query. Under the module-state
      // implementation this write can land before A's still-pending
      // getActiveStandingRulesResult continuation reads the shared flag.
      releaseB?.();

      const [resultA, resultB] = await Promise.all([callA, callB]);

      expect(resultA.lookup_failed).toBe(false);
      expect(resultA.rules).toEqual([]);
      expect(resultB.lookup_failed).toBe(true);
      expect(resultB.error).toContain("user-B failure");
    });
  });
});
