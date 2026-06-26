/**
 * Unit tests for the SOURCE_PRIORITY_IGNORED write-time warning (#1755).
 *
 * Tests the pure helper functions in
 * `src/services/source_priority_warning.ts` that drive the warning logic in
 * `src/actions.ts` and `src/server.ts`.
 *
 * Three scenarios:
 *  (a) non-default source_priority on an auto-discovered / all-last_write
 *      entity type → warning MUST fire.
 *  (b) non-default source_priority on a type whose relevant field uses
 *      `highest_priority` → NO warning (priority will be honoured).
 *  (c) default source_priority (100) → no warning regardless of policies.
 *
 * Also covers the `most_specific` + `tie_breaker: "source_priority"` case
 * and edge cases (empty fields, undefined policies).
 *
 * Extended for #1822: `ignoredFieldStrategies` and
 * `buildSourcePriorityIgnoredWarning` now include per-field strategy detail
 * in the warning message so it is self-diagnosing.
 */

import { describe, it, expect } from "vitest";
import {
  fieldHonorsPriority,
  ignoredFieldStrategies,
  sourcePriorityWillBeIgnored,
  buildSourcePriorityIgnoredWarning,
} from "../../src/services/source_priority_warning.js";

// ---------------------------------------------------------------------------
// fieldHonorsPriority
// ---------------------------------------------------------------------------

describe("fieldHonorsPriority", () => {
  it("returns true for highest_priority strategy", () => {
    expect(fieldHonorsPriority({ strategy: "highest_priority" })).toBe(true);
  });

  it("returns true for most_specific with tie_breaker: source_priority", () => {
    expect(
      fieldHonorsPriority({ strategy: "most_specific", tie_breaker: "source_priority" }),
    ).toBe(true);
  });

  it("returns false for most_specific with tie_breaker: observed_at", () => {
    expect(
      fieldHonorsPriority({ strategy: "most_specific", tie_breaker: "observed_at" }),
    ).toBe(false);
  });

  it("returns false for most_specific without tie_breaker", () => {
    expect(fieldHonorsPriority({ strategy: "most_specific" })).toBe(false);
  });

  it("returns false for last_write strategy", () => {
    expect(fieldHonorsPriority({ strategy: "last_write" })).toBe(false);
  });

  it("returns false for merge_array strategy", () => {
    expect(fieldHonorsPriority({ strategy: "merge_array" })).toBe(false);
  });

  it("returns false for undefined policy", () => {
    expect(fieldHonorsPriority(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sourcePriorityWillBeIgnored
// ---------------------------------------------------------------------------

describe("sourcePriorityWillBeIgnored", () => {
  // (a) Non-default source_priority + auto-discovered / all-last_write entity
  describe("(a) non-default priority on a last_write entity", () => {
    it("returns true when all fields have last_write policies", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 200,
        writtenFields: { name: "Alice", title: "Engineer" },
        mergePolicies: {
          name: { strategy: "last_write" },
          title: { strategy: "last_write" },
        },
      });
      expect(result).toBe(true);
    });

    it("returns true when no schema is registered (mergePolicies is undefined)", () => {
      // Auto-discovered entity: no registered schema → effectively last_write.
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 500,
        writtenFields: { notes: "Some note" },
        mergePolicies: undefined,
      });
      expect(result).toBe(true);
    });

    it("returns true when mergePolicies is null", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 500,
        writtenFields: { notes: "Some note" },
        mergePolicies: null,
      });
      expect(result).toBe(true);
    });

    it("returns true when all written fields have merge_array policies", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 300,
        writtenFields: { tags: ["a", "b"] },
        mergePolicies: { tags: { strategy: "merge_array" } },
      });
      expect(result).toBe(true);
    });

    it("returns true when fields are a mix of last_write and merge_array", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 150,
        writtenFields: { name: "Alice", tags: ["a"] },
        mergePolicies: {
          name: { strategy: "last_write" },
          tags: { strategy: "merge_array" },
        },
      });
      expect(result).toBe(true);
    });

    it("returns true even when source_priority is the 1000 correction priority", () => {
      // A correct() call at priority 1000 on a last_write entity still has no effect.
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 1000,
        writtenFields: { status: "done" },
        mergePolicies: { status: { strategy: "last_write" } },
      });
      expect(result).toBe(true);
    });

    it("returns true for a written field not present in mergePolicies", () => {
      // Field in the write but not in the registered policies — treat as last_write.
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 200,
        writtenFields: { unlisted_field: "value" },
        mergePolicies: { other_field: { strategy: "highest_priority" } },
      });
      expect(result).toBe(true);
    });
  });

  // (b) Non-default source_priority + at least one highest_priority field → NO warning
  describe("(b) non-default priority with a highest_priority field", () => {
    it("returns false when the sole written field uses highest_priority", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 200,
        writtenFields: { score: 42 },
        mergePolicies: { score: { strategy: "highest_priority" } },
      });
      expect(result).toBe(false);
    });

    it("returns false when at least one written field uses highest_priority", () => {
      // Mixed: one last_write + one highest_priority → priority IS honoured for
      // the `score` field, so no warning.
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 200,
        writtenFields: { name: "Alice", score: 42 },
        mergePolicies: {
          name: { strategy: "last_write" },
          score: { strategy: "highest_priority" },
        },
      });
      expect(result).toBe(false);
    });

    it("returns false when a written field uses most_specific + tie_breaker: source_priority", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 200,
        writtenFields: { title: "Lead" },
        mergePolicies: {
          title: { strategy: "most_specific", tie_breaker: "source_priority" },
        },
      });
      expect(result).toBe(false);
    });
  });

  // (c) Default source_priority (100) → never warn
  describe("(c) default source_priority = 100", () => {
    it("returns false when source_priority is the default 100 and all fields are last_write", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 100,
        writtenFields: { name: "Alice" },
        mergePolicies: { name: { strategy: "last_write" } },
      });
      expect(result).toBe(false);
    });

    it("returns false when source_priority is 100 and no schema exists", () => {
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 100,
        writtenFields: { name: "Alice" },
        mergePolicies: undefined,
      });
      expect(result).toBe(false);
    });
  });

  // Edge cases
  describe("edge cases", () => {
    it("returns false when writtenFields is empty (no-op write)", () => {
      // An observation with zero fields doesn't need a priority warning.
      const result = sourcePriorityWillBeIgnored({
        sourcePriority: 200,
        writtenFields: {},
        mergePolicies: undefined,
      });
      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// ignoredFieldStrategies (#1822)
// ---------------------------------------------------------------------------

describe("ignoredFieldStrategies", () => {
  it("returns all written fields with their strategies when none honour priority", () => {
    const result = ignoredFieldStrategies({
      writtenFields: { name: "Alice", title: "Engineer" },
      mergePolicies: {
        name: { strategy: "last_write" },
        title: { strategy: "merge_array" },
      },
    });
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ field: "name", strategy: "last_write" });
    expect(result).toContainEqual({ field: "title", strategy: "merge_array" });
  });

  it("defaults to last_write when the field has no policy entry", () => {
    const result = ignoredFieldStrategies({
      writtenFields: { unlisted: "value" },
      mergePolicies: { other: { strategy: "highest_priority" } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: "unlisted", strategy: "last_write" });
  });

  it("defaults to last_write when mergePolicies is undefined (no schema)", () => {
    const result = ignoredFieldStrategies({
      writtenFields: { notes: "text" },
      mergePolicies: undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: "notes", strategy: "last_write" });
  });

  it("defaults to last_write when mergePolicies is null", () => {
    const result = ignoredFieldStrategies({
      writtenFields: { notes: "text" },
      mergePolicies: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: "notes", strategy: "last_write" });
  });

  it("excludes fields that honour priority", () => {
    const result = ignoredFieldStrategies({
      writtenFields: { name: "Alice", score: 42 },
      mergePolicies: {
        name: { strategy: "last_write" },
        score: { strategy: "highest_priority" },
      },
    });
    // Only 'name' is ignored; 'score' honours priority.
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: "name", strategy: "last_write" });
  });

  it("returns empty array when all written fields honour priority", () => {
    const result = ignoredFieldStrategies({
      writtenFields: { score: 42 },
      mergePolicies: { score: { strategy: "highest_priority" } },
    });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildSourcePriorityIgnoredWarning — message detail (#1822)
// ---------------------------------------------------------------------------

describe("buildSourcePriorityIgnoredWarning message detail", () => {
  it("names the ignored field and its strategy in the message (no schema)", () => {
    const warn = buildSourcePriorityIgnoredWarning({
      sourcePriority: 200,
      writtenFields: { implied_vol: 0.25 },
      mergePolicies: undefined,
      observationIndex: 0,
      entityType: "option_quote",
      entityId: "eid-1",
    });
    expect(warn).not.toBeNull();
    expect(warn!.message).toContain("'implied_vol'");
    expect(warn!.message).toContain("last_write");
  });

  it("names multiple ignored fields in the message", () => {
    const warn = buildSourcePriorityIgnoredWarning({
      sourcePriority: 300,
      writtenFields: { name: "Alice", status: "active" },
      mergePolicies: {
        name: { strategy: "last_write" },
        status: { strategy: "last_write" },
      },
      observationIndex: 1,
      entityType: "contact",
      entityId: "eid-2",
    });
    expect(warn).not.toBeNull();
    expect(warn!.message).toContain("'name'");
    expect(warn!.message).toContain("'status'");
    expect(warn!.message).toContain("last_write");
  });

  it("reports merge_array strategy when that is the effective policy", () => {
    const warn = buildSourcePriorityIgnoredWarning({
      sourcePriority: 150,
      writtenFields: { tags: ["a", "b"] },
      mergePolicies: { tags: { strategy: "merge_array" } },
      observationIndex: 0,
      entityType: "note",
      entityId: "eid-3",
    });
    expect(warn).not.toBeNull();
    expect(warn!.message).toContain("'tags'");
    expect(warn!.message).toContain("merge_array");
  });

  it("includes the entity type and source_priority value in the message", () => {
    const warn = buildSourcePriorityIgnoredWarning({
      sourcePriority: 999,
      writtenFields: { score: 42 },
      mergePolicies: { score: { strategy: "last_write" } },
      observationIndex: 0,
      entityType: "leaderboard_entry",
      entityId: "eid-4",
    });
    expect(warn).not.toBeNull();
    expect(warn!.message).toContain("leaderboard_entry");
    expect(warn!.message).toContain("999");
    expect(warn!.message).toContain("'score'");
    expect(warn!.message).toContain("last_write");
  });

  it("returns null when source_priority is default (100)", () => {
    const warn = buildSourcePriorityIgnoredWarning({
      sourcePriority: 100,
      writtenFields: { name: "Alice" },
      mergePolicies: undefined,
      observationIndex: 0,
      entityType: "contact",
      entityId: "eid-5",
    });
    expect(warn).toBeNull();
  });

  it("returns null when a written field honours priority", () => {
    const warn = buildSourcePriorityIgnoredWarning({
      sourcePriority: 200,
      writtenFields: { score: 42 },
      mergePolicies: { score: { strategy: "highest_priority" } },
      observationIndex: 0,
      entityType: "leaderboard_entry",
      entityId: "eid-6",
    });
    expect(warn).toBeNull();
  });
});
