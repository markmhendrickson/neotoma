import { describe, expect, it, beforeEach, vi } from "vitest";
import type { SchemaRegistryEntry } from "../schema_registry.js";

const mockRows: Array<{ id: string; metadata: Record<string, unknown> | null }> = [];
const mockUpdates: Array<{ id: string; metadata: Record<string, unknown> }> = [];

vi.mock("../../db.js", () => ({
  db: {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        update: vi.fn((payload: { metadata: Record<string, unknown> }) => ({
          eq: vi.fn((_field: string, id: string) => {
            mockUpdates.push({ id, metadata: payload.metadata });
            return { error: null };
          }),
        })),
        get data() {
          return mockRows;
        },
        get error() {
          return null;
        },
      };
      return builder;
    }),
  },
}));

import { seedIssueSchema } from "./seed_schema.js";

function existingIssueSchema(
  metadata: SchemaRegistryEntry["metadata"] = {},
): SchemaRegistryEntry {
  return {
    id: "schema-global-issue",
    entity_type: "issue",
    schema_version: "1.7.0",
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        title: { type: "string", required: true },
        status: { type: "string", required: true },
        github_number: { type: "number", required: true },
        repo: { type: "string", required: true },
      },
      canonical_name_fields: [{ composite: ["github_number", "repo"] }, "title"],
    },
    reducer_config: { merge_policies: {} },
    active: true,
    created_at: "2026-05-11T00:00:00Z",
    user_id: null,
    scope: "global",
    metadata,
  };
}

describe("seedIssueSchema", () => {
  beforeEach(() => {
    mockRows.length = 0;
    mockUpdates.length = 0;
    vi.clearAllMocks();
  });

  it("backfills missing issue guest access metadata across active schema rows", async () => {
    const icon = {
      icon_type: "lucide" as const,
      icon_name: "File",
      generated_at: "2026-05-11T00:00:00Z",
    };
    mockRows.push(
      { id: "global-issue", metadata: { icon } },
      { id: "user-issue", metadata: null },
      { id: "operator-closed", metadata: { guest_access_policy: "closed" } },
    );

    const registry = {
      loadGlobalSchema: vi
        .fn()
        .mockResolvedValueOnce(existingIssueSchema({ icon }))
        .mockResolvedValueOnce(
          existingIssueSchema({
            icon,
            guest_access_policy: "submitter_scoped",
          }),
        ),
      register: vi.fn(),
      activate: vi.fn(),
      updateSchemaIncremental: vi.fn(async () =>
        existingIssueSchema({ guest_access_policy: "submitter_scoped" }),
      ),
    };

    await seedIssueSchema({ registry: registry as never });

    expect(mockUpdates).toEqual([
      {
        id: "global-issue",
        metadata: {
          label: "Issue",
          description:
            "Collaborative issue thread backed by GitHub Issues. Each issue has an associated conversation entity with conversation_message entities for the thread.",
          category: "productivity",
          icon,
          guest_access_policy: "submitter_scoped",
        },
      },
      {
        id: "user-issue",
        metadata: {
          label: "Issue",
          description:
            "Collaborative issue thread backed by GitHub Issues. Each issue has an associated conversation entity with conversation_message entities for the thread.",
          category: "productivity",
          guest_access_policy: "submitter_scoped",
        },
      },
    ]);
  });
});
