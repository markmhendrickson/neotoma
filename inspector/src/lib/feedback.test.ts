/**
 * Unit tests for the Inspector `/feedback` page helpers. These functions
 * are pulled out of `feedback.tsx` specifically to be testable without a
 * DOM, so tests here run in node env under the repo's root vitest.
 */

import { describe, it, expect } from "vitest";
import {
  STALE_THRESHOLD_MS,
  activityTimestamp,
  arrayOfStrings,
  computeBucketCounts,
  computeSummary,
  feedbackComparator,
  hasScratchAnnotations,
  isStale,
  matchesBucket,
  matchesSubmitter,
  parseUpgradeGuidance,
  scratchOf,
  snapshotOf,
  statusBucketFor,
  uniqueSubmitterIds,
} from "./feedback";

type AnyEntity = Parameters<typeof snapshotOf>[0];

function makeEntity(snapshot: Record<string, unknown>, extra: Record<string, unknown> = {}): AnyEntity {
  return {
    id: (extra.id as string) ?? `ent_${Math.random().toString(36).slice(2, 10)}`,
    entity_id: (extra.entity_id as string) ?? undefined,
    snapshot,
    ...extra,
  } as unknown as AnyEntity;
}

describe("statusBucketFor", () => {
  it("maps pipeline statuses to UI buckets", () => {
    expect(statusBucketFor("submitted")).toBe("open");
    expect(statusBucketFor("triaged")).toBe("open");
    expect(statusBucketFor("planned")).toBe("in_progress");
    expect(statusBucketFor("in_progress")).toBe("in_progress");
    expect(statusBucketFor("resolved")).toBe("resolved");
    expect(statusBucketFor("duplicate")).toBe("resolved");
    expect(statusBucketFor("wait_for_next_release")).toBe("inactive");
    expect(statusBucketFor("wontfix")).toBe("inactive");
    expect(statusBucketFor("removed")).toBe("inactive");
  });

  it("defaults unknown/missing status to open so triage is not skipped", () => {
    expect(statusBucketFor(undefined)).toBe("open");
    expect(statusBucketFor("xxx")).toBe("open");
  });
});

describe("isStale + matchesBucket", () => {
  const now = Date.UTC(2026, 3, 24, 12, 0, 0);
  const freshOpen = makeEntity({
    status: "submitted",
    last_activity_at: new Date(now - 1000 * 60 * 60).toISOString(),
  });
  const staleOpen = makeEntity({
    status: "triaged",
    last_activity_at: new Date(now - STALE_THRESHOLD_MS - 1000).toISOString(),
  });
  const resolvedOld = makeEntity({
    status: "resolved",
    last_activity_at: new Date(now - STALE_THRESHOLD_MS - 1000).toISOString(),
  });

  it("flags open items past the stale threshold", () => {
    expect(isStale(freshOpen, undefined, now)).toBe(false);
    expect(isStale(staleOpen, undefined, now)).toBe(true);
  });

  it("does not mark non-open items as stale", () => {
    expect(isStale(resolvedOld, undefined, now)).toBe(false);
  });

  it("routes stale items into the virtual 'stale' bucket only", () => {
    expect(matchesBucket(staleOpen, "all", now)).toBe(true);
    expect(matchesBucket(staleOpen, "open", now)).toBe(true);
    expect(matchesBucket(staleOpen, "stale", now)).toBe(true);
    expect(matchesBucket(freshOpen, "stale", now)).toBe(false);
    expect(matchesBucket(resolvedOld, "stale", now)).toBe(false);
  });
});

describe("activityTimestamp fallback chain", () => {
  it("prefers last_activity_at, then status_updated_at, then submitted_at, then fallback", () => {
    expect(
      activityTimestamp({
        last_activity_at: "2026-04-24T00:00:00Z",
        status_updated_at: "2026-04-23T00:00:00Z",
        submitted_at: "2026-04-22T00:00:00Z",
      }),
    ).toBe("2026-04-24T00:00:00Z");
    expect(
      activityTimestamp({
        status_updated_at: "2026-04-23T00:00:00Z",
        submitted_at: "2026-04-22T00:00:00Z",
      }),
    ).toBe("2026-04-23T00:00:00Z");
    expect(
      activityTimestamp({ submitted_at: "2026-04-22T00:00:00Z" }),
    ).toBe("2026-04-22T00:00:00Z");
    expect(activityTimestamp({}, "2026-04-01T00:00:00Z")).toBe(
      "2026-04-01T00:00:00Z",
    );
    expect(activityTimestamp({})).toBeUndefined();
  });
});

describe("computeSummary + computeBucketCounts", () => {
  const now = Date.UTC(2026, 3, 24, 12, 0, 0);
  const entities = [
    makeEntity({ status: "submitted", last_activity_at: new Date(now).toISOString() }),
    makeEntity({
      status: "triaged",
      last_activity_at: new Date(now - STALE_THRESHOLD_MS - 1).toISOString(),
    }),
    makeEntity({ status: "in_progress" }),
    makeEntity({ status: "resolved" }),
    makeEntity({ status: "removed" }),
    makeEntity({
      status: "submitted",
      regression_candidate: true,
      last_activity_at: new Date(now).toISOString(),
    }),
  ];

  it("counts totals and per-bucket including regressions", () => {
    const summary = computeSummary(entities, now);
    expect(summary.total).toBe(6);
    expect(summary.open).toBe(3);
    expect(summary.stale).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.resolved).toBe(1);
    expect(summary.regression).toBe(1);
  });

  it("tab counts match summary and add stale alongside (not replacing) open", () => {
    const counts = computeBucketCounts(entities, now);
    expect(counts.all).toBe(6);
    expect(counts.open).toBe(3);
    expect(counts.stale).toBe(1);
    expect(counts.in_progress).toBe(1);
    expect(counts.resolved).toBe(1);
    expect(counts.inactive).toBe(1);
  });
});

describe("uniqueSubmitterIds + matchesSubmitter", () => {
  it("dedupes submitters, sorts, and filters by a single id", () => {
    const entities = [
      makeEntity({ submitter_id: "alice" }),
      makeEntity({ submitter_id: "bob" }),
      makeEntity({ submitter_id: "alice" }),
      makeEntity({}),
    ];
    expect(uniqueSubmitterIds(entities)).toEqual(["alice", "bob"]);
    expect(matchesSubmitter(entities[0]!, null)).toBe(true);
    expect(matchesSubmitter(entities[0]!, "alice")).toBe(true);
    expect(matchesSubmitter(entities[1]!, "alice")).toBe(false);
  });
});

describe("hasScratchAnnotations", () => {
  it("ignores empty arrays, empty strings, and the `updated_at` marker", () => {
    expect(hasScratchAnnotations(makeEntity({}))).toBe(false);
    expect(
      hasScratchAnnotations(
        makeEntity({ inspector_scratch: { updated_at: "2026-04-24" } }),
      ),
    ).toBe(false);
    expect(
      hasScratchAnnotations(
        makeEntity({
          inspector_scratch: { triage_notes: "", issue_urls: [] },
        }),
      ),
    ).toBe(false);
    expect(
      hasScratchAnnotations(
        makeEntity({ inspector_scratch: { status: "triaged" } }),
      ),
    ).toBe(true);
    expect(
      hasScratchAnnotations(
        makeEntity({
          inspector_scratch: { issue_urls: ["https://example.test"] },
        }),
      ),
    ).toBe(true);
  });

  it("tolerates a non-object scratch field without throwing", () => {
    expect(
      hasScratchAnnotations(makeEntity({ inspector_scratch: "garbage" })),
    ).toBe(false);
    expect(scratchOf({ inspector_scratch: undefined })).toEqual({});
  });
});

describe("feedbackComparator", () => {
  const newer = makeEntity(
    { status: "submitted", last_activity_at: "2026-04-24T00:00:00Z", hit_count: 1 },
    { id: "a" },
  );
  const older = makeEntity(
    { status: "submitted", last_activity_at: "2026-04-01T00:00:00Z", hit_count: 10 },
    { id: "b" },
  );
  const inprog = makeEntity(
    { status: "in_progress", submitted_at: "2026-03-01T00:00:00Z", regression_count: 5 },
    { id: "c" },
  );

  it("recent_activity puts newer first", () => {
    const arr = [older, inprog, newer];
    arr.sort(feedbackComparator("recent_activity"));
    expect(arr[0]).toBe(newer);
  });

  it("oldest_open sinks non-open items below open ones", () => {
    const arr = [newer, inprog, older];
    arr.sort(feedbackComparator("oldest_open"));
    expect(arr.indexOf(inprog)).toBeGreaterThan(arr.indexOf(older));
    expect(arr[0]).toBe(older);
  });

  it("most_hits orders by hit_count desc", () => {
    const arr = [newer, older, inprog];
    arr.sort(feedbackComparator("most_hits"));
    expect(arr[0]).toBe(older);
  });

  it("most_regressions orders by regression_count desc", () => {
    const arr = [newer, older, inprog];
    arr.sort(feedbackComparator("most_regressions"));
    expect(arr[0]).toBe(inprog);
  });
});

describe("parseUpgradeGuidance", () => {
  it("returns null for empty or missing input", () => {
    expect(parseUpgradeGuidance(null)).toBeNull();
    expect(parseUpgradeGuidance(undefined)).toBeNull();
    expect(parseUpgradeGuidance("string")).toBeNull();
    expect(parseUpgradeGuidance({})).toBeNull();
    expect(
      parseUpgradeGuidance({
        action_required: "",
        install_commands: [],
        verification_steps: [],
      }),
    ).toBeNull();
  });

  it("extracts only string values and string arrays", () => {
    const parsed = parseUpgradeGuidance({
      action_required: "Upgrade to 0.6.1",
      install_commands: ["npm i -g neotoma@0.6.1", 123, ""],
      verification_steps: ["run /doctor"],
      verify_by: "2026-05-01",
      notes: "Affected: macOS only",
    });
    expect(parsed).toEqual({
      actionRequired: "Upgrade to 0.6.1",
      installCommands: ["npm i -g neotoma@0.6.1"],
      verificationSteps: ["run /doctor"],
      verifyBy: "2026-05-01",
      notes: "Affected: macOS only",
    });
  });
});

describe("arrayOfStrings", () => {
  it("coerces arbitrary input to a string-only array", () => {
    expect(arrayOfStrings(undefined)).toEqual([]);
    expect(arrayOfStrings("x")).toEqual([]);
    expect(arrayOfStrings(["a", 2, "", null, "b"])).toEqual(["a", "b"]);
  });
});
