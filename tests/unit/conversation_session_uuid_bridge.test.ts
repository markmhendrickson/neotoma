/**
 * Unit tests for the conversation entity session_uuid bridge (issue #145).
 *
 * In Claude Code contexts the SessionStart hook creates a `conversation` entity
 * keyed by the raw session UUID while the MCP agent creates a slug-keyed
 * entity (conversation_id = derived slug). `session_uuid` is a declared schema
 * field on `conversation` so it projects at the top level of the snapshot and
 * can be used to cross-reference both entities.
 *
 * Tests cover:
 * - The `conversation` schema in ENTITY_SCHEMAS declares `session_uuid` as an
 *   optional field with schema_version >= 1.4
 * - A store call with a `conversation` entity including `session_uuid` projects
 *   it to the top-level snapshot (not into raw_fragments)
 * - A `conversation` entity without `session_uuid` is still valid (field is optional)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ObservationReducer,
  type Observation,
} from "../../src/reducers/observation_reducer.js";

// ---------------------------------------------------------------------------
// Mocks required by ObservationReducer
// ---------------------------------------------------------------------------

vi.mock("../../src/services/schema_registry.js", () => ({
  DEFAULT_OBSERVATION_SOURCE_PRIORITY: [
    "sensor",
    "workflow_state",
    "llm_summary",
    "human",
    "import",
  ] as const,
  schemaRegistry: {
    loadActiveSchema: vi.fn(),
  },
}));

vi.mock("../../src/services/schema_definitions.js", () => ({
  getSchemaDefinition: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/services/field_validation.js", () => ({
  validateFieldWithConverters: vi.fn().mockImplementation(
    (_field: string, value: unknown, _fieldDef: unknown) => ({
      isValid: true,
      value,
      shouldRouteToRawFragments: false,
    }),
  ),
}));

import { schemaRegistry } from "../../src/services/schema_registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversationObs(
  overrides: Partial<Observation> & { fields: Record<string, unknown> },
): Observation {
  return {
    id: "obs_default",
    entity_id: "ent_conv_test",
    entity_type: "conversation",
    schema_version: "1.4",
    source_id: "src_1",
    observed_at: "2026-05-15T00:00:00Z",
    source_priority: 500,
    observation_source: "llm_summary",
    is_deletion: false,
    is_correction: false,
    ...overrides,
  };
}

/** Full loadActiveSchema mock response for the conversation schema v1.4 */
function conversationSchemaV14() {
  return {
    id: "schema-conversation-v1.4",
    entity_type: "conversation",
    schema_version: "1.4",
    schema_definition: {
      fields: {
        schema_version: { type: "string", required: true },
        conversation_id: { type: "string", required: false },
        title: { type: "string", required: false },
        thread_kind: { type: "string", required: false },
        client_name: { type: "string", required: false },
        harness: { type: "string", required: false },
        workspace_kind: { type: "string", required: false },
        repository_name: { type: "string", required: false },
        repository_root: { type: "string", required: false },
        repository_remote: { type: "string", required: false },
        scope_summary: { type: "string", required: false },
        // v1.4: bridge field linking hook-created UUID entity to slug entity
        session_uuid: { type: "string", required: false },
      },
      canonical_name_fields: ["conversation_id"],
      name_collision_policy: "reject",
    },
    reducer_config: {
      merge_policies: {
        title: { strategy: "highest_priority", tie_breaker: "source_priority" },
        thread_kind: { strategy: "last_write" },
        client_name: { strategy: "last_write" },
        harness: { strategy: "last_write" },
        workspace_kind: { strategy: "last_write" },
        repository_name: { strategy: "last_write" },
        repository_root: { strategy: "last_write" },
        repository_remote: { strategy: "last_write" },
        scope_summary: { strategy: "last_write" },
        session_uuid: { strategy: "last_write" },
      },
    },
    active: true,
  };
}

// ---------------------------------------------------------------------------
// Schema declaration tests — import the real ENTITY_SCHEMAS (un-mocked)
// ---------------------------------------------------------------------------

describe("conversation schema declaration — session_uuid bridge", () => {
  it("ENTITY_SCHEMAS['conversation'] declares session_uuid as an optional string field", async () => {
    vi.unmock("../../src/services/schema_definitions.js");
    const { ENTITY_SCHEMAS } = await import("../../src/services/schema_definitions.js");
    const schema = ENTITY_SCHEMAS["conversation"];
    expect(schema, "conversation must be present in ENTITY_SCHEMAS").toBeDefined();
    const fields = schema?.schema_definition?.fields ?? {};
    expect(
      fields["session_uuid"],
      'conversation schema_definition.fields must include "session_uuid"',
    ).toBeDefined();
    expect(fields["session_uuid"]?.type).toBe("string");
    expect(fields["session_uuid"]?.required).toBe(false);
  });

  it("conversation schema_version is >= 1.4 (the version that added session_uuid)", async () => {
    vi.unmock("../../src/services/schema_definitions.js");
    const { ENTITY_SCHEMAS } = await import("../../src/services/schema_definitions.js");
    const version = ENTITY_SCHEMAS["conversation"]?.schema_version ?? "0";
    const [major, minor] = version.split(".").map(Number);
    const atLeast14 = major > 1 || (major === 1 && minor >= 4);
    expect(
      atLeast14,
      `conversation schema_version "${version}" must be >= 1.4`,
    ).toBe(true);
  });

  it("conversation reducer_config includes a merge_policy for session_uuid", async () => {
    vi.unmock("../../src/services/schema_definitions.js");
    const { ENTITY_SCHEMAS } = await import("../../src/services/schema_definitions.js");
    const policies = ENTITY_SCHEMAS["conversation"]?.reducer_config?.merge_policies ?? {};
    expect(
      policies["session_uuid"],
      'conversation reducer_config.merge_policies must declare a policy for "session_uuid"',
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Snapshot projection tests — verify session_uuid projects at top level
// ---------------------------------------------------------------------------

describe("conversation snapshot — session_uuid projection", () => {
  const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.mocked(schemaRegistry.loadActiveSchema).mockResolvedValue(conversationSchemaV14());
  });

  it("projects session_uuid into the snapshot top-level when stored", async () => {
    const obs = makeConversationObs({
      fields: {
        schema_version: "1.4",
        conversation_id: "my-project-fix-145",
        title: "Fix conversation UUID bridge",
        session_uuid: TEST_UUID,
      },
    });

    const result = await reducer.computeSnapshot("ent_conv_1", [obs]);

    expect(result).not.toBeNull();
    expect(result!.snapshot["session_uuid"]).toBe(TEST_UUID);
    // Must NOT appear in raw_fragments — it is a declared schema field
    const raw = (result!.snapshot["raw_fragments"] as Record<string, unknown> | undefined) ?? {};
    expect(raw["session_uuid"]).toBeUndefined();
  });

  it("conversation without session_uuid is still valid — field is optional", async () => {
    const obs = makeConversationObs({
      fields: {
        schema_version: "1.4",
        conversation_id: "non-claude-code-session",
        title: "Session without UUID bridge",
      },
    });

    const result = await reducer.computeSnapshot("ent_conv_2", [obs]);

    expect(result).not.toBeNull();
    expect(result!.snapshot["conversation_id"]).toBe("non-claude-code-session");
    // session_uuid absent is valid; its absence must not break the snapshot
    expect(result!.snapshot["session_uuid"]).toBeUndefined();
  });

  it("later observation with session_uuid overwrites earlier absent value (last_write policy)", async () => {
    const obs1 = makeConversationObs({
      id: "obs_1",
      observed_at: "2026-05-15T10:00:00Z",
      fields: {
        schema_version: "1.4",
        conversation_id: "my-project-fix-145",
        title: "Initial store without UUID",
      },
    });
    const obs2 = makeConversationObs({
      id: "obs_2",
      observed_at: "2026-05-15T10:00:01Z",
      fields: {
        schema_version: "1.4",
        conversation_id: "my-project-fix-145",
        session_uuid: TEST_UUID,
      },
    });

    const result = await reducer.computeSnapshot("ent_conv_3", [obs1, obs2]);

    expect(result).not.toBeNull();
    expect(result!.snapshot["session_uuid"]).toBe(TEST_UUID);
  });
});
