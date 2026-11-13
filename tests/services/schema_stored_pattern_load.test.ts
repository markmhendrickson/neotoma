import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { storeConditionalStructured } from "../../src/services/store_conditional.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import {
  MATCH_TIMEOUT_MS,
  MAX_SUBJECT_LENGTH,
  REQUEST_PATTERN_BUDGET_MS,
} from "../../src/services/safe_pattern.js";
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

  it.each([
    ["inner, six-digit count", "^(a{1,123456})+$"],
    ["inner, zero-padded count", "^(a{0001,0002})+$"],
    ["outer, zero-padded count", "^(a+){000006}$"],
  ])("MCP register_schema returns the typed shape refusal for %s", async (_name, pattern) => {
    const result = await new NeotomaServer().executeToolForCli(
      "register_schema",
      {
        entity_type: registerEntityType,
        schema_version: "1.0",
        schema_definition: {
          fields: { code: { type: "string", constraints: { pattern } } },
          canonical_name_fields: ["code"],
        },
        reducer_config: reducer,
        user_specific: true,
        activate: false,
      },
      owner
    );
    const body = JSON.parse(result.content[0].text) as {
      error: { error_code: string; message: string; hint: string; details: { refusal: string } };
    };
    expect(body.error.error_code).toBe("SCHEMA_VALIDATION_FAILED");
    expect(body.error.details.refusal).toBe("shape");
    // Same rewrite guidance as the other shape refusals, and the pattern is not echoed.
    expect(body.error.hint).toMatch(/bounded count/);
    expect(body.error.message).not.toContain(pattern);
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

describe("store requests against stored patterns that run past the time limit", () => {
  const budgetOwner = "test-stored-pattern-budget";
  const slowType = "stored_pattern_budget_test";
  const LONG = "a".repeat(MAX_SUBJECT_LENGTH);
  const FIELD_COUNT = 30;
  const fieldNames = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`);

  const slowSchema = (pattern: (i: number) => string, id: string) => ({
    id,
    entity_type: slowType,
    schema_version: "1.0",
    active: true,
    user_id: budgetOwner,
    scope: "user",
    created_at: "2026-01-01T00:00:00.000Z",
    schema_definition: {
      fields: {
        code: { type: "string" },
        ...Object.fromEntries(
          fieldNames.map((f, i) => [f, { type: "string", constraints: { pattern: pattern(i) } }])
        ),
      },
      canonical_name_fields: ["code"],
    },
    reducer_config: {
      merge_policies: Object.fromEntries(
        ["code", ...fieldNames].map((f) => [f, { strategy: "highest_priority" }])
      ),
    },
  });

  async function install(pattern: (i: number) => string) {
    await db.from("schema_registry").delete().eq("user_id", budgetOwner);
    const inserted = await db
      .from("schema_registry")
      .upsert(slowSchema(pattern, `stored-pattern-budget-${Math.random()}`), { onConflict: "id" });
    expect(inserted.error).toBeNull();
  }

  const entity = (n: number, fields: string[]) => ({
    entity_type: slowType,
    code: `E${n}`,
    ...Object.fromEntries(fields.map((f) => [f, LONG])),
  });

  const rest = (entities: Record<string, unknown>[], key: string) =>
    storeStructuredForApi({
      userId: budgetOwner,
      entities,
      sourcePriority: 100,
      idempotencyKey: key,
    } as Parameters<typeof storeStructuredForApi>[0]);

  const mcp = (entities: Record<string, unknown>[], key: string) =>
    new NeotomaServer().executeToolForCli("store", { entities, idempotency_key: key }, budgetOwner);

  const surfaces = [
    ["REST", rest],
    ["MCP", mcp],
  ] as const;

  it.each(surfaces)(
    "%s: many entities sharing one slow pattern finish quickly and are rejected",
    async (_name, run) => {
      await install(() => ".*.*.*.*.*x");
      const entities = Array.from({ length: 40 }, (_, n) => entity(n, ["f0"]));
      const started = performance.now();
      await expect(run(entities, `many-${_name}`)).rejects.toThrow(
        /Constraint violation|constraint/i
      );
      // The slow pattern is evaluated once, then remembered for the request.
      expect(performance.now() - started).toBeLessThan(MATCH_TIMEOUT_MS * 5 + 1500);
    },
    30_000
  );

  it.each(surfaces)(
    "%s: many distinct slow patterns stop at the request budget and reject the rest",
    async (_name, run) => {
      await install((i) => `.*.*.*.*.*x${i}`);
      const started = performance.now();
      let error: unknown;
      try {
        await run([entity(0, fieldNames), entity(1, fieldNames)], `distinct-${_name}`);
      } catch (e) {
        error = e;
      }
      const elapsed = performance.now() - started;
      expect(error).toBeDefined();
      expect(elapsed).toBeLessThan(REQUEST_PATTERN_BUDGET_MS + MATCH_TIMEOUT_MS + 400);
      const text = String((error as Error).message);
      // Every constrained field is rejected, including those checked after the budget ran out.
      expect(text).toMatch(/constraint/i);
      if (_name === "MCP") expect(text).toContain(`"f${FIELD_COUNT - 1}"`);
    },
    30_000
  );
});
