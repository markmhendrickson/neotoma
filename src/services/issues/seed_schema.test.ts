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

import { ISSUE_FIELD_SPECS, seedIssueSchema } from "./seed_schema.js";

function existingIssueSchema(metadata: SchemaRegistryEntry["metadata"] = {}): SchemaRegistryEntry {
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

  it("ISSUE_FIELD_SPECS declares each swarm-workflow field with expected types", () => {
    const byName = Object.fromEntries(ISSUE_FIELD_SPECS.map((s) => [s.name, s]));
    expect(byName.workflow_type?.type).toBe("string");
    expect(byName.current_owner?.type).toBe("string");
    expect(byName.owner_history?.type).toBe("array");
    expect(byName.owner_history?.reducer).toBe("merge_array");
    expect(byName.gate_status?.type).toBe("object");
    expect(byName.sign_offs?.type).toBe("array");
    expect(byName.sign_offs?.reducer).toBe("merge_array");
    expect(byName.blocked_on?.type).toBe("string");
    expect(byName.issue_number?.type).toBe("number");
    expect(byName.summary?.type).toBe("string");
    expect(byName.category?.type).toBe("string");
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
      { id: "operator-closed", metadata: { guest_access_policy: "closed" } }
    );

    const registry = {
      loadGlobalSchema: vi
        .fn()
        .mockResolvedValueOnce(existingIssueSchema({ icon }))
        .mockResolvedValueOnce(
          existingIssueSchema({
            icon,
            guest_access_policy: "submitter_scoped",
          })
        ),
      register: vi.fn(),
      activate: vi.fn(),
      updateSchemaIncremental: vi.fn(async () =>
        existingIssueSchema({ guest_access_policy: "submitter_scoped" })
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
    // Fixture omits swarm (and other) fields, so seed also requests an incremental add.
    expect(registry.updateSchemaIncremental).toHaveBeenCalled();
  });

  it("incrementally adds missing swarm-workflow fields onto an older issue schema", async () => {
    const registry = {
      loadGlobalSchema: vi
        .fn()
        .mockResolvedValueOnce(existingIssueSchema())
        .mockResolvedValueOnce(existingIssueSchema()),
      register: vi.fn(),
      activate: vi.fn(),
      updateSchemaIncremental: vi.fn(async (entry) => entry),
    };

    await seedIssueSchema({ registry: registry as never });

    expect(registry.register).not.toHaveBeenCalled();
    expect(registry.updateSchemaIncremental).toHaveBeenCalledTimes(1);
    const update = registry.updateSchemaIncremental.mock.calls[0]?.[0] as {
      fields_to_add: Array<{
        field_name: string;
        field_type: string;
        reducer_strategy?: string;
      }>;
    };
    const added = Object.fromEntries(update.fields_to_add.map((f) => [f.field_name, f]));
    for (const name of [
      "workflow_type",
      "current_owner",
      "owner_history",
      "gate_status",
      "sign_offs",
      "blocked_on",
      "issue_number",
      "summary",
      "category",
    ]) {
      expect(added[name]).toBeDefined();
    }
    expect(added.gate_status?.field_type).toBe("object");
    expect(added.owner_history?.reducer_strategy).toBe("merge_array");
    expect(added.sign_offs?.reducer_strategy).toBe("merge_array");
    expect(added.workflow_type?.field_type).toBe("string");
    expect(added.issue_number?.field_type).toBe("number");
  });
});
