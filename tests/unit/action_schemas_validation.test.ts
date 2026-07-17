import { describe, expect, it } from "vitest";
import {
  EntitiesQueryRequestSchema,
  RetrieveEntitiesRequestSchema,
} from "../../src/shared/action_schemas.js";

describe("Entity query schema validation", () => {
  it("rejects search combined with non-default sort", () => {
    const parsed = EntitiesQueryRequestSchema.safeParse({
      search: "post 2026",
      sort_by: "observation_count",
      sort_order: "desc",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects search combined with published filters", () => {
    const parsed = RetrieveEntitiesRequestSchema.safeParse({
      search: "post 2026",
      published: true,
      published_after: "2026-01-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects inverted published date ranges", () => {
    const parsed = EntitiesQueryRequestSchema.safeParse({
      published_after: "2026-12-31",
      published_before: "2026-01-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts valid structured filters without search", () => {
    const parsed = RetrieveEntitiesRequestSchema.safeParse({
      entity_type: "post",
      sort_by: "observation_count",
      sort_order: "desc",
      published: true,
      published_after: "2026-01-01",
      published_before: "2026-12-31",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts search with default sorting only", () => {
    const parsed = EntitiesQueryRequestSchema.safeParse({
      search: "release notes",
      sort_by: "entity_id",
      sort_order: "asc",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts submitted_at sort for entities/query", () => {
    const parsed = EntitiesQueryRequestSchema.safeParse({
      entity_type: "issue",
      sort_by: "submitted_at",
      sort_order: "desc",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sort_by).toBe("submitted_at");
      expect(parsed.data.sort_order).toBe("desc");
    }
  });
});

describe("#1943 cursor + pagination bounds", () => {
  // A well-formed opaque cursor for the default entity_id/asc ordering.
  const cursor = Buffer.from(
    JSON.stringify({ v: 1, sort_by: "entity_id", sort_order: "asc", entity_id: "ent_x" }),
    "utf8"
  ).toString("base64url");

  for (const [name, Schema] of [
    ["EntitiesQueryRequestSchema", EntitiesQueryRequestSchema],
    ["RetrieveEntitiesRequestSchema", RetrieveEntitiesRequestSchema],
  ] as const) {
    describe(name, () => {
      it("accepts a bare cursor (default sort, no offset)", () => {
        const parsed = Schema.safeParse({ entity_type: "contact", cursor });
        expect(parsed.success).toBe(true);
      });

      it("rejects cursor combined with a non-zero offset", () => {
        const parsed = Schema.safeParse({ cursor, offset: 100 });
        expect(parsed.success).toBe(false);
      });

      it("accepts cursor with offset explicitly 0", () => {
        const parsed = Schema.safeParse({ cursor, offset: 0 });
        expect(parsed.success).toBe(true);
      });

      it("rejects cursor combined with a non-default sort_by", () => {
        const parsed = Schema.safeParse({ cursor, sort_by: "canonical_name" });
        expect(parsed.success).toBe(false);
      });

      it("rejects cursor combined with search", () => {
        const parsed = Schema.safeParse({ cursor, search: "acme" });
        expect(parsed.success).toBe(false);
      });

      // #1943 (qa lens): published filters and snapshot_filters route into the
      // snapshot-driven scan, which ignores the keyset cursor and would silently
      // re-return page 1. Reject, matching the search/sort guards.
      it("rejects cursor combined with published", () => {
        expect(Schema.safeParse({ cursor, published: true }).success).toBe(false);
      });

      it("rejects cursor combined with published_after / published_before", () => {
        expect(Schema.safeParse({ cursor, published_after: "2026-01-01" }).success).toBe(false);
        expect(Schema.safeParse({ cursor, published_before: "2026-12-31" }).success).toBe(false);
      });

      it("rejects cursor combined with non-empty snapshot_filters", () => {
        const parsed = Schema.safeParse({
          cursor,
          snapshot_filters: { status: { op: "eq", value: "live" } },
        });
        expect(parsed.success).toBe(false);
      });

      it("accepts cursor with an EMPTY snapshot_filters (no scan diversion)", () => {
        expect(Schema.safeParse({ cursor, snapshot_filters: {} }).success).toBe(true);
      });

      it("rejects offset above the deep-scan bound", () => {
        const parsed = Schema.safeParse({ offset: 2001 });
        expect(parsed.success).toBe(false);
      });

      it("accepts offset at the deep-scan bound", () => {
        const parsed = Schema.safeParse({ offset: 2000 });
        expect(parsed.success).toBe(true);
      });

      it("rejects a large limit when include_snapshots is true (default)", () => {
        const parsed = Schema.safeParse({ limit: 501 });
        expect(parsed.success).toBe(false);
      });

      it("accepts a large limit when include_snapshots is false", () => {
        const parsed = Schema.safeParse({ limit: 5000, include_snapshots: false });
        expect(parsed.success).toBe(true);
      });
    });
  }
});

describe("snapshot_filters field-name guard", () => {
  it("accepts snake_case field names", () => {
    const parsed = EntitiesQueryRequestSchema.safeParse({
      snapshot_filters: { status: { op: "eq", value: "open" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts dotted nested field paths", () => {
    const parsed = EntitiesQueryRequestSchema.safeParse({
      snapshot_filters: { "address.city": { op: "eq", value: "Paris" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects field names carrying PostgREST filter syntax", () => {
    const parsed = EntitiesQueryRequestSchema.safeParse({
      snapshot_filters: { "id&or=(role.eq.admin)": { op: "eq", value: "x" } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects field names with operator or delimiter characters", () => {
    for (const bad of ["a->>b", "a,b", "a)b", "a b", "a;b", ""]) {
      const parsed = EntitiesQueryRequestSchema.safeParse({
        snapshot_filters: { [bad]: { op: "eq", value: "x" } },
      });
      expect(parsed.success, `expected "${bad}" to be rejected`).toBe(false);
    }
  });
});
