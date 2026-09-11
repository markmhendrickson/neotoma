/**
 * Unit tests for `src/services/standing_rules.ts` (the instruction-entity
 * service).
 *
 * Covers:
 * - Returns empty array when no entities exist
 * - Filters out entities with enabled: false
 * - Filters out entities with no instruction text
 * - Orders by priority descending, then title ascending
 * - Handles DB errors gracefully (returns empty array)
 * - Handles unexpected exceptions gracefully (returns empty array)
 * - Passes scope through to the result
 * - Parses a snapshot delivered as JSON text (libSQL variant)
 * - #2054: mixed-type loading, per-type field mapping, scope union,
 *   the cap, malformed config, and the dual-emit legacy reshape
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the db module — must be hoisted before any dynamic imports.
// ---------------------------------------------------------------------------

// Mutable container so individual tests can change the resolved value.
// Keyed by entity_type so a single test can seed several types at once, which
// is what mixed-type loading needs. `default` backs the legacy single-type
// helpers so the pre-existing cases below keep reading naturally.
const resolvedValue: { data: unknown; error: unknown } = { data: [], error: null };
const byEntityType = new Map<string, { data: unknown; error: unknown }>();

// Merge-pointer rows returned for the secondary `entities` lookup.
const mergedValue: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("../../src/db.js", () => {
  // The query is a thenable chain of .eq() calls; which table was addressed
  // and which entity_type was filtered on decide which fixture resolves.
  // Mirrors the real two-query shape.
  const makeChain = (table: string) => {
    let entityType: string | undefined;
    const result = () => {
      if (table === "entities") return mergedValue;
      if (entityType !== undefined && byEntityType.has(entityType)) {
        return byEntityType.get(entityType)!;
      }
      // A type with no explicit fixture resolves empty, so seeding one type
      // never serves its rows to another. The untyped `resolvedValue`
      // fixture backs `standing_rule` only — that is the type the legacy
      // suite below is about, and letting it also answer the `agent_policy`
      // query would silently double every one of those assertions.
      if (entityType === "standing_rule") return resolvedValue;
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn((column: string, value: unknown) => {
      if (column === "entity_type" && typeof value === "string") entityType = value;
      return chain;
    });
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
  getInstructionEntitiesResult,
  toLegacyStandingRules,
  INSTRUCTION_TYPE_MAP,
  RULE_KIND_RANK,
} from "../../src/services/standing_rules.js";
import { logger } from "../../src/utils/logger.js";

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

/** Seed rows for one specific entity_type (mixed-type fixtures). */
function setRowsForType(entityType: string, rows: FakeRow[], error: unknown = null): void {
  byEntityType.set(entityType, { data: error ? null : rows, error });
}

function clearTypedRows(): void {
  byEntityType.clear();
}

/**
 * Default options for the generalized loader.
 *
 * Tests pass these explicitly rather than mutating `config`, so a test's
 * intent is readable at the call site and no test leaks env state into
 * another.
 */
const DEFAULTS = {
  entityTypes: ["standing_rule", "agent_policy"],
  scopes: ["global", "swarm"],
  maxEntities: 50,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getActiveStandingRules", () => {
  beforeEach(() => {
    clearTypedRows();
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

// ---------------------------------------------------------------------------
// #2054 — generalized instruction-entity loading
// ---------------------------------------------------------------------------

describe("getInstructionEntitiesResult (#2054)", () => {
  beforeEach(() => {
    clearTypedRows();
    setRows([]);
    setMerged([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The reported gap, stated as a test.
   *
   * This is the regression case: against the pre-#2054 loader — hardcoded to
   * `entity_type = "standing_rule"` and to the `rule_text` field — an
   * `agent_policy` row could not reach the payload at all, no matter how it
   * was configured. It fails on that code and passes on this.
   */
  it("injects an active agent_policy alongside standing rules", async () => {
    setRowsForType("standing_rule", [
      makeRow({
        id: "sr1",
        canonical_name: "A Standing Rule",
        snapshot: { title: "A Standing Rule", rule_text: "rule text", priority: 10 },
      }),
    ]);
    setRowsForType("agent_policy", [
      makeRow({
        id: "ap1",
        canonical_name: "A Policy",
        snapshot: {
          title: "A Policy",
          rule: "policy instruction",
          status: "active",
          rule_kind: "mandatory",
          scope: "global",
        },
      }),
    ]);

    const result = await getInstructionEntitiesResult("user-1", DEFAULTS);

    expect(result.lookup_failed).toBe(false);
    const policy = result.entities.find((e) => e.entity_id === "ap1");
    expect(policy, "agent_policy did not reach the payload").toBeDefined();
    expect(policy?.entity_type).toBe("agent_policy");
    // The field mismatch: policy text lives on `rule`, not `rule_text`.
    expect(policy?.text).toBe("policy instruction");
    expect(result.entities.map((e) => e.entity_id)).toContain("sr1");
  });

  it("reads each type's own text field via the registry", async () => {
    setRowsForType("standing_rule", [
      makeRow({ id: "sr1", snapshot: { title: "SR", rule_text: "from rule_text" } }),
    ]);
    setRowsForType("agent_policy", [
      makeRow({
        id: "ap1",
        snapshot: { title: "AP", rule: "from rule", status: "active", scope: "global" },
      }),
    ]);

    const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
    const byId = Object.fromEntries(result.entities.map((e) => [e.entity_id, e.text]));
    expect(byId["sr1"]).toBe("from rule_text");
    expect(byId["ap1"]).toBe("from rule");
  });

  // The prod-shape case behind the empty payload: rows carrying the
  // instruction under `instruction`/`content` with `status: active` and no
  // `rule_text`/`enabled` at all. The pre-#2054 loader dropped every one of
  // these silently, producing an empty array indistinguishable from "no
  // rules configured".
  it("reads standing_rule text from instruction/content when rule_text is absent", async () => {
    setRowsForType("standing_rule", [
      makeRow({
        id: "sr_instruction",
        snapshot: { title: "Via instruction", instruction: "do the thing", status: "active" },
      }),
      makeRow({
        id: "sr_content",
        snapshot: { title: "Via content", content: "do the other thing", status: "active" },
      }),
    ]);

    const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
    const byId = Object.fromEntries(result.entities.map((e) => [e.entity_id, e.text]));
    expect(byId["sr_instruction"]).toBe("do the thing");
    expect(byId["sr_content"]).toBe("do the other thing");
  });

  it("never injects agent_policy body", async () => {
    setRowsForType("agent_policy", [
      makeRow({
        id: "ap1",
        snapshot: {
          title: "AP",
          rule: "the instruction",
          body: "LONG PROVENANCE WAR STORY",
          status: "active",
          scope: "global",
        },
      }),
    ]);

    const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
    expect(result.entities).toHaveLength(1);
    expect(JSON.stringify(result.entities)).not.toContain("LONG PROVENANCE WAR STORY");
    expect((result.entities[0] as Record<string, unknown>)["body"]).toBeUndefined();
  });

  it("skips agent_policy whose status is not active", async () => {
    setRowsForType("agent_policy", [
      makeRow({
        id: "ap_inactive",
        snapshot: { title: "Inactive", rule: "x", status: "superseded", scope: "global" },
      }),
      makeRow({
        id: "ap_active",
        snapshot: { title: "Active", rule: "y", status: "active", scope: "global" },
      }),
    ]);

    const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
    expect(result.entities.map((e) => e.entity_id)).toEqual(["ap_active"]);
  });

  it("ranks mixed types on the shared scale, rank desc then title asc", async () => {
    setRowsForType("standing_rule", [
      makeRow({ id: "sr250", snapshot: { title: "SR250", rule_text: "t", priority: 250 } }),
    ]);
    setRowsForType("agent_policy", [
      makeRow({
        id: "ap_mand",
        snapshot: {
          title: "Mandatory",
          rule: "t",
          status: "active",
          rule_kind: "mandatory",
          scope: "global",
        },
      }),
      makeRow({
        id: "ap_rec",
        snapshot: {
          title: "Recommended",
          rule: "t",
          status: "active",
          rule_kind: "recommended",
          scope: "global",
        },
      }),
      makeRow({
        id: "ap_disc",
        snapshot: {
          title: "Discipline",
          rule: "t",
          status: "active",
          rule_kind: "operating_discipline",
          scope: "global",
        },
      }),
    ]);

    const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
    // 300 mandatory > 250 standing rule > 200 recommended > 100 discipline
    expect(result.entities.map((e) => e.entity_id)).toEqual([
      "ap_mand",
      "sr250",
      "ap_rec",
      "ap_disc",
    ]);
    expect(RULE_KIND_RANK).toEqual({
      mandatory: 300,
      recommended: 200,
      operating_discipline: 100,
    });
  });

  it("breaks rank ties by title ascending across types", async () => {
    setRowsForType("standing_rule", [
      makeRow({ id: "sr_z", snapshot: { title: "Zulu", rule_text: "t", priority: 300 } }),
    ]);
    setRowsForType("agent_policy", [
      makeRow({
        id: "ap_a",
        snapshot: {
          title: "Alpha",
          rule: "t",
          status: "active",
          rule_kind: "mandatory",
          scope: "global",
        },
      }),
    ]);

    const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
    expect(result.entities.map((e) => e.title)).toEqual(["Alpha", "Zulu"]);
  });

  describe("scope filtering is a union, never an intersection", () => {
    it("includes an agent_policy whose scope is in the configured set", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap_global",
          snapshot: { title: "G", rule: "t", status: "active", scope: "global" },
        }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
      expect(result.entities.map((e) => e.entity_id)).toEqual(["ap_global"]);
    });

    it("excludes an out-of-scope agent_policy with no matching domain", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap_copy",
          snapshot: {
            title: "Voice",
            rule: "t",
            status: "active",
            scope: "copy",
            domain: "lanius@ateles-swarm",
          },
        }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
      expect(result.entities).toEqual([]);
    });

    // The concrete case the issue calls out: a per-agent voice guide carries
    // `scope: copy` (not in the configured set) plus `domain: <agent>`. An
    // intersection would drop that agent's own policy from that agent's own
    // session — exactly backwards.
    it("includes an out-of-scope agent_policy when its domain matches the session agent", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap_copy",
          snapshot: {
            title: "Voice",
            rule: "t",
            status: "active",
            scope: "copy",
            domain: "lanius@ateles-swarm",
          },
        }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", {
        ...DEFAULTS,
        agentIdentity: "lanius@ateles-swarm",
      });
      expect(result.entities.map((e) => e.entity_id)).toEqual(["ap_copy"]);
    });

    it("does not leak another agent's domain-scoped policy", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap_other",
          snapshot: {
            title: "Other",
            rule: "t",
            status: "active",
            scope: "copy",
            domain: "cicada@ateles-swarm",
          },
        }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", {
        ...DEFAULTS,
        agentIdentity: "lanius@ateles-swarm",
      });
      expect(result.entities).toEqual([]);
    });

    // stdio / CLI-over-MCP: no AAuth attribution to resolve. Shared rules
    // still load; per-agent rules must not.
    it("falls back to configured scopes only when no agent identity is resolved", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap_global",
          snapshot: { title: "G", rule: "t", status: "active", scope: "global" },
        }),
        makeRow({
          id: "ap_domain",
          snapshot: {
            title: "D",
            rule: "t",
            status: "active",
            scope: "copy",
            domain: "lanius@ateles-swarm",
          },
        }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", {
        ...DEFAULTS,
        agentIdentity: null,
      });
      expect(result.entities.map((e) => e.entity_id)).toEqual(["ap_global"]);
    });

    // standing_rule scope has always been a free-form label the loader never
    // filtered on. Subjecting it to {global, swarm} would silently stop
    // injecting every project-scoped rule on every existing instance.
    it("does not scope-filter standing_rule, preserving existing behaviour", async () => {
      setRowsForType("standing_rule", [
        makeRow({
          id: "sr_project",
          snapshot: { title: "Project Rule", rule_text: "t", scope: "my-project" },
        }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
      expect(result.entities.map((e) => e.entity_id)).toEqual(["sr_project"]);
      expect(result.entities[0].scope).toBe("my-project");
    });
  });

  describe("cap", () => {
    it("sorts before capping and warns with the dropped ids", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap_low",
          snapshot: {
            title: "Low",
            rule: "t",
            status: "active",
            rule_kind: "operating_discipline",
            scope: "global",
          },
        }),
        makeRow({
          id: "ap_high",
          snapshot: {
            title: "High",
            rule: "t",
            status: "active",
            rule_kind: "mandatory",
            scope: "global",
          },
        }),
      ]);

      const result = await getInstructionEntitiesResult("user-1", { ...DEFAULTS, maxEntities: 1 });

      // Sort-then-cap: the mandatory policy survives, not the query-order one.
      expect(result.entities.map((e) => e.entity_id)).toEqual(["ap_high"]);

      const warned = vi.mocked(logger.warn).mock.calls.map((c) => String(c[0]));
      const capWarn = warned.find((m) => m.includes("cap reached"));
      expect(capWarn, "no cap warning emitted").toBeDefined();
      expect(capWarn).toContain("ap_low");
      expect(capWarn).toContain("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES");
    });

    // Never log instruction text: a cap-drop warning must name ids, counts
    // and env vars only.
    it("never includes instruction text in the cap warning", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap_a",
          snapshot: {
            title: "A",
            rule: "SECRET_INSTRUCTION_TEXT",
            status: "active",
            rule_kind: "mandatory",
            scope: "global",
          },
        }),
        makeRow({
          id: "ap_b",
          snapshot: {
            title: "B",
            rule: "ANOTHER_SECRET_TEXT",
            status: "active",
            rule_kind: "recommended",
            scope: "global",
          },
        }),
      ]);

      await getInstructionEntitiesResult("user-1", { ...DEFAULTS, maxEntities: 1 });

      const allWarnings = vi.mocked(logger.warn).mock.calls.map((c) => String(c[0])).join("\n");
      expect(allWarnings).not.toContain("SECRET_INSTRUCTION_TEXT");
      expect(allWarnings).not.toContain("ANOTHER_SECRET_TEXT");
    });
  });

  describe("config fallback", () => {
    it("warns and skips a configured type with no registry entry", async () => {
      setRowsForType("standing_rule", [
        makeRow({ id: "sr1", snapshot: { title: "SR", rule_text: "t" } }),
      ]);

      const result = await getInstructionEntitiesResult("user-1", {
        ...DEFAULTS,
        entityTypes: ["standing_rule", "not_a_real_type"],
      });

      // The known type still loads; only the unmapped one is skipped.
      expect(result.entities.map((e) => e.entity_id)).toEqual(["sr1"]);

      const warned = vi.mocked(logger.warn).mock.calls.map((c) => String(c[0]));
      const unknownWarn = warned.find((m) => m.includes("not_a_real_type"));
      expect(unknownWarn, "no unknown-type warning emitted").toBeDefined();
      expect(unknownWarn).toContain("NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES");
      expect(unknownWarn).toContain("standing_rule");
    });

    it("disables injection entirely when the configured type list is empty", async () => {
      setRowsForType("standing_rule", [
        makeRow({ id: "sr1", snapshot: { title: "SR", rule_text: "t" } }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", {
        ...DEFAULTS,
        entityTypes: [],
      });
      expect(result.entities).toEqual([]);
      expect(result.lookup_failed).toBe(false);
    });

    it("exposes only registered types on the registry", () => {
      expect(Object.keys(INSTRUCTION_TYPE_MAP).sort()).toEqual(["agent_policy", "standing_rule"]);
    });
  });

  describe("fail-soft", () => {
    it("keeps loading other types when one type's query fails", async () => {
      setRowsForType("standing_rule", [
        makeRow({ id: "sr1", snapshot: { title: "SR", rule_text: "t" } }),
      ]);
      setRowsForType("agent_policy", [], { message: "agent_policy table missing" });

      const result = await getInstructionEntitiesResult("user-1", DEFAULTS);

      // The healthy type still reaches the session...
      expect(result.entities.map((e) => e.entity_id)).toEqual(["sr1"]);
      // ...but the failure is reported rather than rendered as "none configured".
      expect(result.lookup_failed).toBe(true);
      expect(result.error).toContain("agent_policy table missing");
    });

    it("returns an empty array rather than throwing when the driver throws", async () => {
      const { db } = (await import("../../src/db.js")) as unknown as {
        db: { from: ReturnType<typeof vi.fn> };
      };
      db.from.mockImplementation(() => {
        throw new Error("connection reset");
      });

      const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
      expect(result.entities).toEqual([]);
      expect(result.lookup_failed).toBe(true);

      db.from.mockReset();
    });
  });

  describe("dual-emit legacy reshape", () => {
    it("reshapes agent_policy into the legacy standing_rule item shape", async () => {
      setRowsForType("agent_policy", [
        makeRow({
          id: "ap1",
          snapshot: {
            title: "A Policy",
            rule: "policy instruction",
            body: "LONG BODY",
            status: "active",
            rule_kind: "mandatory",
            scope: "global",
          },
        }),
      ]);

      const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
      const legacy = toLegacyStandingRules(result.entities);

      expect(legacy).toEqual([
        {
          entity_id: "ap1",
          title: "A Policy",
          rule_text: "policy instruction",
          scope: "global",
          priority: 300,
        },
      ]);
      // The deprecated alias must not become a body leak either.
      expect(JSON.stringify(legacy)).not.toContain("LONG BODY");
    });

    it("keeps a standing_rule's authored priority through the reshape", async () => {
      setRowsForType("standing_rule", [
        makeRow({ id: "sr1", snapshot: { title: "SR", rule_text: "t", priority: 42 } }),
      ]);
      const result = await getInstructionEntitiesResult("user-1", DEFAULTS);
      expect(toLegacyStandingRules(result.entities)[0].priority).toBe(42);
    });
  });
});
