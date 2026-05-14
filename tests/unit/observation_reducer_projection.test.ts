/**
 * Unit tests for ObservationReducer schema-projection filtering.
 *
 * Verifies that only fields defined in the active schema appear in snapshots,
 * while observation data for removed fields is preserved but not surfaced.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ObservationReducer,
  type Observation,
} from "../../src/reducers/observation_reducer.js";

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

function makeObs(overrides: Partial<Observation> & { fields: Record<string, unknown> }): Observation {
  return {
    id: "obs_default",
    entity_id: "ent_test",
    entity_type: "test_type",
    schema_version: "1.0",
    source_id: "src_1",
    observed_at: "2025-01-01T00:00:00Z",
    specificity_score: 1.0,
    source_priority: 100,
    created_at: "2025-01-01T00:00:00Z",
    user_id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

describe("ObservationReducer - Schema Projection Filtering", () => {
  const reducer = new ObservationReducer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should only include fields defined in the active schema", async () => {
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-1",
      entity_type: "test_type",
      schema_version: "2.0.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: true },
          amount: { type: "number", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
          amount: { strategy: "last_write" },
        },
      },
      active: true,
    });

    const observations: Observation[] = [
      makeObs({
        id: "obs_1",
        fields: {
          name: "Test",
          amount: 100,
          removed_field: "should_not_appear",
          another_removed: 42,
        },
      }),
    ];

    const snapshot = await reducer.computeSnapshot("ent_test", observations);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.name).toBe("Test");
    expect(snapshot!.snapshot.amount).toBe(100);
    expect(snapshot!.snapshot.removed_field).toBeUndefined();
    expect(snapshot!.snapshot.another_removed).toBeUndefined();
  });

  it("should exclude fields from observations when removed from schema", async () => {
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-2",
      entity_type: "test_type",
      schema_version: "2.0.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: true },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
        },
      },
      active: true,
    });

    const observations: Observation[] = [
      makeObs({
        id: "obs_old",
        schema_version: "1.0.0",
        observed_at: "2025-01-01T00:00:00Z",
        fields: {
          title: "Original",
          deprecated_field: "old_value",
        },
      }),
      makeObs({
        id: "obs_new",
        schema_version: "2.0.0",
        observed_at: "2025-02-01T00:00:00Z",
        fields: {
          title: "Updated",
        },
      }),
    ];

    const snapshot = await reducer.computeSnapshot("ent_test", observations);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.title).toBe("Updated");
    expect(snapshot!.snapshot.deprecated_field).toBeUndefined();
    expect(snapshot!.provenance.deprecated_field).toBeUndefined();
  });

  it("should restore field data when re-added to schema", async () => {
    // Schema v3.0 re-adds a field that was removed in v2.0
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-3",
      entity_type: "test_type",
      schema_version: "3.0.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: true },
          restored_field: { type: "string", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          restored_field: { strategy: "last_write" },
        },
      },
      active: true,
    });

    const observations: Observation[] = [
      makeObs({
        id: "obs_v1",
        schema_version: "1.0.0",
        observed_at: "2025-01-01T00:00:00Z",
        fields: {
          title: "First",
          restored_field: "original_data",
        },
      }),
      makeObs({
        id: "obs_v2",
        schema_version: "2.0.0",
        observed_at: "2025-02-01T00:00:00Z",
        fields: {
          title: "Second",
          // restored_field not present (was removed in v2)
        },
      }),
    ];

    const snapshot = await reducer.computeSnapshot("ent_test", observations);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.title).toBe("Second");
    expect(snapshot!.snapshot.restored_field).toBe("original_data");
    expect(snapshot!.provenance.restored_field).toBe("obs_v1");
  });

  it("should use schema version from active schema, not observations", async () => {
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-4",
      entity_type: "test_type",
      schema_version: "2.0.0",
      schema_definition: {
        fields: {
          name: { type: "string", required: true },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write" },
        },
      },
      active: true,
    });

    const observations: Observation[] = [
      makeObs({
        id: "obs_1",
        schema_version: "1.0.0",
        fields: { name: "Test", old_noise: "junk" },
      }),
    ];

    const snapshot = await reducer.computeSnapshot("ent_test", observations);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.schema_version).toBe("2.0.0");
    expect(snapshot!.snapshot.old_noise).toBeUndefined();
  });

  it("should let null corrections clear older task date fields", async () => {
    (schemaRegistry.loadActiveSchema as any).mockResolvedValue({
      id: "schema-task",
      entity_type: "task",
      schema_version: "1.0.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: true },
          status: { type: "string", required: false },
          due_date: { type: "date", required: false },
          completed_date: { type: "date", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          status: { strategy: "last_write" },
          due_date: { strategy: "last_write" },
          completed_date: { strategy: "last_write" },
        },
      },
      active: true,
    });

    const observations: Observation[] = [
      makeObs({
        id: "obs_original",
        entity_type: "task",
        observed_at: "2025-01-01T00:00:00Z",
        fields: {
          title: "Yoga payment",
          status: "completed",
          due_date: "2026-04-30",
          completed_date: "2025-01-10",
        },
      }),
      makeObs({
        id: "obs_clear_due_date",
        entity_type: "task",
        observed_at: "2025-02-01T00:00:00Z",
        source_priority: 1000,
        fields: {
          due_date: null,
        },
      }),
      makeObs({
        id: "obs_clear_completed_date",
        entity_type: "task",
        observed_at: "2025-02-02T00:00:00Z",
        source_priority: 1000,
        fields: {
          completed_date: null,
        },
      }),
      makeObs({
        id: "obs_reopen",
        entity_type: "task",
        observed_at: "2025-02-03T00:00:00Z",
        source_priority: 1000,
        fields: {
          status: "pending",
        },
      }),
    ];

    const snapshot = await reducer.computeSnapshot("ent_test", observations);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.snapshot.title).toBe("Yoga payment");
    expect(snapshot!.snapshot.status).toBe("pending");
    expect(snapshot!.snapshot.due_date).toBeUndefined();
    expect(snapshot!.snapshot.completed_date).toBeUndefined();
    expect(snapshot!.provenance.due_date).toBeUndefined();
    expect(snapshot!.provenance.completed_date).toBeUndefined();
  });
});
