import { describe, expect, it, vi } from "vitest";
import { seedSessionSchemas } from "../../src/services/sessions/seed_schema.js";

/**
 * Transcript ingest emits `agent_session` + `session_transcript`. A fresh
 * instance has neither registered, so the rows would land with no declared
 * schema and lose canonical-name dedupe — which is what makes re-import
 * idempotent. These assert the seeder registers both, keys them correctly, and
 * is safe to re-run.
 */
function fakeRegistry(existing: Record<string, unknown> = {}) {
  const registered: Array<Record<string, unknown>> = [];
  const incremental: Array<Record<string, unknown>> = [];
  return {
    registered,
    incremental,
    registry: {
      loadGlobalSchema: vi.fn(async (t: string) => (existing as never)[t] ?? null),
      register: vi.fn(async (args: Record<string, unknown>) => {
        registered.push(args);
        return args;
      }),
      updateSchemaIncremental: vi.fn(async (args: Record<string, unknown>) => {
        incremental.push(args);
        return args;
      }),
    },
  };
}

describe("seedSessionSchemas", () => {
  it("registers both types on a fresh instance", async () => {
    const f = fakeRegistry();
    await seedSessionSchemas({ registry: f.registry as never });

    const types = f.registered.map((r) => r.entity_type);
    expect(types).toEqual(["agent_session", "session_transcript"]);
  });

  it("keys agent_session on (harness, native_session_id) — the harness's own resume pair", async () => {
    const f = fakeRegistry();
    await seedSessionSchemas({ registry: f.registry as never });

    const agent = f.registered.find((r) => r.entity_type === "agent_session")!;
    const def = agent.schema_definition as Record<string, unknown>;
    expect(def.canonical_name_fields).toEqual([{ composite: ["harness", "native_session_id"] }]);
    const fields = def.fields as Record<string, { required?: boolean }>;
    expect(fields.harness.required).toBe(true);
    expect(fields.native_session_id.required).toBe(true);
    // cwd is what makes a stored session relocatable — must be declared.
    expect(fields.cwd).toBeDefined();
  });

  it("keys session_transcript on content_hash so re-import dedupes", async () => {
    const f = fakeRegistry();
    await seedSessionSchemas({ registry: f.registry as never });

    const tx = f.registered.find((r) => r.entity_type === "session_transcript")!;
    const def = tx.schema_definition as Record<string, unknown>;
    expect(def.canonical_name_fields).toEqual(["content_hash"]);
    const fields = def.fields as Record<string, { required?: boolean }>;
    expect(fields.content_hash.required).toBe(true);
  });

  it("does not re-register when both schemas already carry every field", async () => {
    const full = (names: string[]) => ({
      schema_definition: { fields: Object.fromEntries(names.map((n) => [n, {}])) },
    });
    const f = fakeRegistry({
      agent_session: full([
        "harness",
        "native_session_id",
        "kind",
        "title",
        "summary",
        "model",
        "status",
        "message_count",
        "created_at",
        "last_activity_at",
        "cwd",
        "repo",
        "repo_remote_url",
        "source_branch",
        "branch",
        "git_head_sha",
        "worktree_path",
        "origin_device",
        "parent_session_id",
        "is_archived",
        "resume_command",
      ]),
      session_transcript: full([
        "content_hash",
        "agent_session_id",
        "harness",
        "format",
        "format_version",
        "file_size",
        "turn_count",
        "storage_url",
        "source_id",
        "mime_type",
        "transcript_kind",
      ]),
    });

    await seedSessionSchemas({ registry: f.registry as never });

    expect(f.registered).toHaveLength(0);
    expect(f.incremental).toHaveLength(0);
  });

  it("adds only missing fields to an existing schema, never retro-requiring them", async () => {
    const f = fakeRegistry({
      agent_session: { schema_definition: { fields: { harness: {}, native_session_id: {} } } },
    });

    await seedSessionSchemas({ registry: f.registry as never });

    const patch = f.incremental.find((i) => i.entity_type === "agent_session")!;
    const added = patch.fields_to_add as Array<{ field_name: string; required: boolean }>;
    expect(added.some((a) => a.field_name === "cwd")).toBe(true);
    // Retro-requiring a field would invalidate every existing row.
    expect(added.every((a) => a.required === false)).toBe(true);
  });
});
