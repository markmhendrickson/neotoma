import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { PatchArrayItemRequestSchema } from "../../src/shared/action_schemas.js";
import {
  ArrayItemEntityTypeMismatchError,
  ArrayItemPolicyRequiredError,
  patchArrayItem,
} from "../../src/services/array_item_patch.js";
import {
  CorrectionEntityTypeMismatchError,
  createCorrection,
  createCorrectionWithVersionPrecondition,
  FieldVersionConflictError,
} from "../../src/services/correction.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_array_item_patch_atomic";

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

describe("atomic correction primitives", () => {
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  it("accepts only non-null scalar item keys at the shared contract boundary", () => {
    const base = {
      entity_id: "ent_example",
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      item: { status: "queued" },
      idempotency_key: "contract-key",
    };

    expect(PatchArrayItemRequestSchema.safeParse({ ...base, key_value: "row" }).success).toBe(true);
    expect(PatchArrayItemRequestSchema.safeParse({ ...base, key_value: 42 }).success).toBe(true);
    expect(PatchArrayItemRequestSchema.safeParse({ ...base, key_value: false }).success).toBe(true);
    expect(PatchArrayItemRequestSchema.safeParse({ ...base, key_value: null }).success).toBe(false);
    expect(PatchArrayItemRequestSchema.safeParse({ ...base, key_value: { id: 1 } }).success).toBe(
      false
    );
  });

  let entityId: string;

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          title: { type: "string", required: false },
          tasks_claimed: { type: "array", required: false },
        },
        canonical_name_fields: ["title"],
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write" },
          tasks_claimed: { strategy: "merge_array_by_key", key_field: "claim_id" },
        },
      },
      activate: true,
    });

    const server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-array-item-atomic-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, title: "atomic workboard", tasks_claimed: [] }],
    });
    const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
    entityId = body.entities[0].entity_id;
  });

  afterAll(async () => {
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
    if (previousOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  });

  it("preserves disjoint concurrent item patches", async () => {
    const [a, b] = await Promise.all([
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "a",
        item: { status: "in_progress" },
        idempotency_key: `patch-disjoint-a-${Date.now()}`,
      }),
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "b",
        item: { status: "queued" },
        idempotency_key: `patch-disjoint-b-${Date.now()}`,
      }),
    ]);

    expect(a.status).toBe("applied");
    expect(b.status).toBe("applied");
    const current = await getEntityWithProvenance(entityId, false, USER_ID);
    const rows = (current!.snapshot as Record<string, unknown>).tasks_claimed as Array<
      Record<string, unknown>
    >;
    expect(rows.map((row) => row.claim_id).sort()).toEqual(["a", "b"]);
  });

  it("serializes same-key CAS so one writer conflicts", async () => {
    const seeded = await patchArrayItem({
      entity_id: entityId,
      entity_type: TYPE,
      user_id: USER_ID,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: "same-key",
      item: { status: "queued" },
      idempotency_key: `patch-same-seed-${Date.now()}`,
    });

    const expected = seeded.item_version!;
    const results = await Promise.all([
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "same-key",
        item: { status: "in_review" },
        expected_item_version: expected,
        idempotency_key: `patch-same-a-${Date.now()}`,
      }),
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "same-key",
        item: { status: "blocked" },
        expected_item_version: expected,
        idempotency_key: `patch-same-b-${Date.now()}`,
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["applied", "conflict"]);
  });

  it("serializes entity-level correction CAS so one writer is rejected", async () => {
    const current = await getEntityWithProvenance(entityId, false, USER_ID);
    const expected = current!.last_observation_at;
    const writes = await Promise.allSettled([
      createCorrectionWithVersionPrecondition({
        entity_id: entityId,
        entity_type: TYPE,
        field: "title",
        value: "writer-a",
        schema_version: "1.0",
        user_id: USER_ID,
        idempotency_key: `correct-cas-a-${Date.now()}`,
        expected_version: expected,
      }),
      createCorrectionWithVersionPrecondition({
        entity_id: entityId,
        entity_type: TYPE,
        field: "title",
        value: "writer-b",
        schema_version: "1.0",
        user_id: USER_ID,
        idempotency_key: `correct-cas-b-${Date.now()}`,
        expected_version: expected,
      }),
    ]);

    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = writes.find((result) => result.status === "rejected");
    expect(rejected).toBeDefined();
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(FieldVersionConflictError);
  });

  it("fails closed without a keyed-array policy and on entity type mismatch", async () => {
    await expect(
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "title",
        key_field: "claim_id",
        key_value: "not-keyed",
        item: { status: "no" },
        idempotency_key: `patch-policy-${Date.now()}`,
      })
    ).rejects.toBeInstanceOf(ArrayItemPolicyRequiredError);

    await expect(
      patchArrayItem({
        entity_id: entityId,
        entity_type: "decoy_type",
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "type-mismatch",
        item: { status: "no" },
        idempotency_key: `patch-type-${Date.now()}`,
      })
    ).rejects.toBeInstanceOf(ArrayItemEntityTypeMismatchError);

    await expect(
      createCorrection({
        entity_id: entityId,
        entity_type: "decoy_type",
        field: "title",
        value: "must-not-land",
        schema_version: "1.0",
        user_id: USER_ID,
        idempotency_key: `correct-type-${Date.now()}`,
      })
    ).rejects.toBeInstanceOf(CorrectionEntityTypeMismatchError);

    const current = await getEntityWithProvenance(entityId, false, USER_ID);
    expect((current!.snapshot as Record<string, unknown>).title).not.toBe("must-not-land");
  });
});
