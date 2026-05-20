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
