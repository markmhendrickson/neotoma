import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { storeConditionalStructured } from "../../src/services/store_conditional.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { STORE_CONDITION_KEYS_SCHEMA } from "../../src/repositories/db/store_condition_schema.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/embeddings.js")>()),
  generateEmbedding: vi.fn(async () => null),
}));

/**
 * A schema stored before the registration-time pattern rules existed must keep
 * loading on every path. Its pattern is bounded at evaluation instead.
 */
const owner = "test-stored-pattern-load";
const storedPattern = "^(a+)+$";
const schema = {
  id: "test-stored-pattern-load-schema",
  entity_type: "stored_pattern_load_test",
  schema_version: "1.0",
  active: true,
  user_id: owner,
  scope: "user",
  created_at: "2026-01-01T00:00:00.000Z",
  schema_definition: {
    fields: {
      code: { type: "string" },
      status: { type: "string", constraints: { pattern: storedPattern } },
    },
    canonical_name_fields: ["code"],
  },
  reducer_config: {
    merge_policies: {
      code: { strategy: "highest_priority" },
      status: { strategy: "highest_priority" },
    },
  },
};

const request = (key: string, extra: Record<string, unknown> = {}) => ({
  userId: owner,
  idempotencyKey: key,
  sourcePriority: 100,
  entities: [{ entity_type: schema.entity_type, code: "ONE", ...extra }],
});

beforeEach(async () => {
  const connection = await getDb();
  await connection.exec("DROP TABLE IF EXISTS store_condition_keys");
  await connection.exec(STORE_CONDITION_KEYS_SCHEMA);
  for (const table of [
    "observations",
    "entity_snapshots",
    "entities",
    "raw_fragments",
    "sources",
    "store_condition_keys",
  ])
    await db.from(table).delete().eq("user_id", owner);
  const inserted = await db.from("schema_registry").upsert(schema, { onConflict: "id" });
  expect(inserted.error).toBeNull();
});

describe("stored schema holding a pattern the registration rules refuse", () => {
  it("loads in a transaction", async () => {
    const loaded = await schemaRegistry.loadActiveSchemaInTransaction(
      await getDb(),
      schema.entity_type,
      owner
    );
    expect(loaded?.schema_version).toBe("1.0");
  });

  it("keeps conditional stores working, with the pattern failing closed", async () => {
    // A store that does not touch the field succeeds.
    const stored = await storeConditionalStructured(request("without-field"));
    expect(stored.operation_receipt.entity_id).toBeTruthy();

    // A store that supplies the field is refused as a constraint violation,
    // not as a schema load failure.
    const started = performance.now();
    await expect(
      storeConditionalStructured(request("with-field", { status: "a".repeat(40) + "!" }))
    ).rejects.toMatchObject({ name: "ConstraintViolationError" });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("keeps cleared-fields snapshot reads working", async () => {
    const stored = await storeConditionalStructured(request("snapshot-source"));
    const entityId = stored.operation_receipt.entity_id;
    const snapshot = await getEntityWithProvenance(entityId, false, owner, {
      includeClearedFields: true,
    });
    expect(snapshot).not.toBeNull();
  });
});

describe("registration entry points refuse patterns outside the registration rules", () => {
  const reducer = {
    merge_policies: { code: { strategy: "highest_priority" as const } },
  };
  const registerEntityType = "registration_pattern_entry_test";

  it("register_schema refuses a constraint pattern", async () => {
    await expect(
      schemaRegistry.register({
        entity_type: registerEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: { code: { type: "string", constraints: { pattern: storedPattern } } },
          canonical_name_fields: ["code"],
        },
        reducer_config: reducer,
        user_id: owner,
        user_specific: true,
        activate: false,
      })
    ).rejects.toThrow(/constraints\.pattern for code is not accepted/);
  });

  it("register_schema refuses a derived-condition pattern", async () => {
    await expect(
      schemaRegistry.register({
        entity_type: registerEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: { code: { type: "string" } },
          canonical_name_fields: ["code"],
          derived_entities: [
            {
              conditions: [{ field: "code", op: "matches_any_pattern", patterns: [storedPattern] }],
              derived_entity_type: "task",
              derived_fields: { title: { value: "t" } },
            },
          ],
        },
        reducer_config: reducer,
        user_id: owner,
        user_specific: true,
        activate: false,
      })
    ).rejects.toThrow(/derived_entities\[0\]\.conditions\[0\]\.patterns\[0\] is not accepted/);
  });

  it("update_schema_incremental refuses a schema that already holds such a pattern", async () => {
    // The stored schema loads, but an edit re-registers it and meets the same refusal.
    await expect(
      schemaRegistry.updateSchemaIncremental({
        entity_type: schema.entity_type,
        fields_to_add: [{ field_name: "note", field_type: "string" }],
        user_id: owner,
        user_specific: true,
        activate: false,
      })
    ).rejects.toThrow(/is not accepted/);
  });
});
