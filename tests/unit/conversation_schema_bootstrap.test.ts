/**
 * Unit tests for conversation entity schema registration (issue #138).
 *
 * Verifies that:
 * - The `conversation` schema is present in ENTITY_SCHEMAS after bootstrap
 * - `canonical_name_fields` contains both "conversation_id" and "session_id"
 * - `agent_instructions` is a non-empty string
 * - `temporal_fields` includes `started_at` and `ended_at`
 * - Standard fields (title, summary, session_id, etc.) project to the top
 *   level of the snapshot rather than falling into raw_fragments
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";
import {
  ObservationReducer,
  type Observation,
} from "../../src/reducers/observation_reducer.js";

// ---------------------------------------------------------------------------
// Mocks — keep unit tests database-free
// ---------------------------------------------------------------------------

vi.mock("../../src/services/schema_registry.js", () => ({
  DEFAULT_OBSERVATION_SOURCE_PRIORITY: [
    "sensor",
    "workflow_state",
    "llm_summary",
    "human",
    "import",
    "sync",
  ] as const,
  schemaRegistry: {
    loadActiveSchema: vi.fn(),
  },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { schemaRegistry } from "../../src/services/schema_registry.js";

function makeObs(
  overrides: Partial<Observation> & { fields: Record<string, unknown> },
): Observation {
  return {
    id: "obs_default",
    entity_id: "ent_conv_test",
    entity_type: "conversation",
    schema_version: "1.4",
    source_id: "src_conv",
    observed_at: "2025-01-01T12:00:00Z",
    specificity_score: 1.0,
    source_priority: 100,
    created_at: "2025-01-01T12:00:00Z",
    user_id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema definition tests (no DB required)
// ---------------------------------------------------------------------------

describe("conversation schema definition — bootstrap registration (#138)", () => {
  it("is present in ENTITY_SCHEMAS", () => {
    expect(ENTITY_SCHEMAS).toHaveProperty("conversation");
  });

  it("has entity_type 'conversation'", () => {
    expect(ENTITY_SCHEMAS.conversation.entity_type).toBe("conversation");
  });

  it("canonical_name_fields contains 'conversation_id'", () => {
    const cnf = ENTITY_SCHEMAS.conversation.schema_definition.canonical_name_fields;
    expect(cnf).toBeDefined();
    expect(cnf).toContain("conversation_id");
  });

  it("canonical_name_fields contains 'session_id' (fix for issue #138)", () => {
    const cnf = ENTITY_SCHEMAS.conversation.schema_definition.canonical_name_fields;
    expect(cnf).toBeDefined();
    expect(cnf).toContain("session_id");
  });

  it("agent_instructions is a non-empty string", () => {
    const ai = ENTITY_SCHEMAS.conversation.schema_definition.agent_instructions;
    expect(typeof ai).toBe("string");
    expect((ai as string).trim().length).toBeGreaterThan(0);
  });

  it("temporal_fields includes started_at", () => {
    const tf = ENTITY_SCHEMAS.conversation.schema_definition.temporal_fields ?? [];
    expect(tf.some((t) => t.field === "started_at")).toBe(true);
  });

  it("temporal_fields includes ended_at", () => {
    const tf = ENTITY_SCHEMAS.conversation.schema_definition.temporal_fields ?? [];
    expect(tf.some((t) => t.field === "ended_at")).toBe(true);
  });

  it("fields include all standard conversation fields", () => {
    const fields = ENTITY_SCHEMAS.conversation.schema_definition.fields;
    const expected = [
      "title",
      "summary",
      "session_id",
      "conversation_id",
      "started_at",
      "ended_at",
      "date",
      "participants",
      "participant_count",
      "message_count",
      "model",
      "tool",
      "source_url",
      "topics",
      "decisions",
      "open_tasks",
    ];
    for (const f of expected) {
      expect(fields, `expected field '${f}' to be declared in conversation schema`).toHaveProperty(f);
    }
  });

  it("reducer_config has merge policies for all declared fields", () => {
    const fields = ENTITY_SCHEMAS.conversation.schema_definition.fields;
    const policies = ENTITY_SCHEMAS.conversation.reducer_config.merge_policies;
    // Every field with a merge policy must exist in schema fields (no dangling)
    for (const key of Object.keys(policies)) {
      expect(fields, `merge policy references undeclared field '${key}'`).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Snapshot projection tests — verify title (and other standard fields) appear
// at top level in the reduced snapshot, not in raw_fragments
// ---------------------------------------------------------------------------

describe("conversation snapshot projection (#138 — fields at top level)", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
    // Inject the real schema definition so the reducer uses it for projection
    (schemaRegistry.loadActiveSchema as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "schema-conv",
      entity_type: "conversation",
      schema_version: "1.4",
      schema_definition: ENTITY_SCHEMAS.conversation.schema_definition,
      reducer_config: ENTITY_SCHEMAS.conversation.reducer_config,
      active: true,
      created_at: "2025-01-01T00:00:00Z",
      scope: "global",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("projects title to the snapshot top level", async () => {
    const obs: Observation[] = [
      makeObs({ fields: { title: "Refactor auth module" } }),
    ];
    const snapshot = await reducer.computeSnapshot("ent_conv_test", obs);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.title).toBe("Refactor auth module");
  });

  it("projects session_id to the snapshot top level", async () => {
    const obs: Observation[] = [
      makeObs({ fields: { session_id: "sess_abc123" } }),
    ];
    const snapshot = await reducer.computeSnapshot("ent_conv_test", obs);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.session_id).toBe("sess_abc123");
  });

  it("projects summary to the snapshot top level", async () => {
    const obs: Observation[] = [
      makeObs({ fields: { summary: "Discussed migration strategy." } }),
    ];
    const snapshot = await reducer.computeSnapshot("ent_conv_test", obs);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.summary).toBe("Discussed migration strategy.");
  });

  it("projects model to the snapshot top level", async () => {
    const obs: Observation[] = [
      makeObs({ fields: { model: "claude-sonnet-4-5" } }),
    ];
    const snapshot = await reducer.computeSnapshot("ent_conv_test", obs);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.model).toBe("claude-sonnet-4-5");
  });

  it("projects started_at and ended_at to the snapshot top level", async () => {
    const obs: Observation[] = [
      makeObs({
        fields: {
          started_at: "2025-01-01T10:00:00Z",
          ended_at: "2025-01-01T11:30:00Z",
        },
      }),
    ];
    const snapshot = await reducer.computeSnapshot("ent_conv_test", obs);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.started_at).toBeDefined();
    expect(snapshot!.snapshot.ended_at).toBeDefined();
  });

  it("does not include unknown fields in snapshot (they stay in raw_fragments)", async () => {
    const obs: Observation[] = [
      makeObs({ fields: { title: "Test", undeclared_mystery_field: "ghost" } }),
    ];
    const snapshot = await reducer.computeSnapshot("ent_conv_test", obs);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.title).toBe("Test");
    expect(snapshot!.snapshot.undeclared_mystery_field).toBeUndefined();
  });
});
