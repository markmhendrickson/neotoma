import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createWriteRateLimit } from "../../src/actions.js";
import { buildToolDefinitions } from "../../src/tool_definitions.js";
import { applyBatchCorrection } from "../../src/services/batch_correction.js";
import { NeotomaServer } from "../../src/server.js";
import { PatchArrayItemRequestSchema } from "../../src/shared/action_schemas.js";
import {
  ArrayItemEntityTypeMismatchError,
  ArrayItemPolicyRequiredError,
  computeItemVersion,
  patchArrayItem,
} from "../../src/services/array_item_patch.js";
import {
  CorrectionEntityTypeMismatchError,
  createCorrection,
  createCorrectionWithVersionPrecondition,
  CorrectionIdempotencyMismatchError,
  FieldVersionConflictError,
} from "../../src/services/correction.js";
import { substrateEventBus } from "../../src/events/substrate_event_bus.js";
import * as instancePolicy from "../../src/services/instance_policy.js";
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
    expect(
      PatchArrayItemRequestSchema.safeParse({
        ...base,
        key_value: Number.MAX_SAFE_INTEGER + 1,
      }).success
    ).toBe(false);
    expect(PatchArrayItemRequestSchema.safeParse({ ...base, key_value: null }).success).toBe(false);
    expect(PatchArrayItemRequestSchema.safeParse({ ...base, key_value: { id: 1 } }).success).toBe(
      false
    );
  });

  it("publishes a portable item-version canonicalization contract", () => {
    expect(computeItemVersion({ b: "x", a: 1 })).toBe(
      "ecf9e98ec0641e23113ff3ce8bdc78d0ddd249886517fd4a7f68cc83d4e65667"
    );
    expect(computeItemVersion({ a: 1, b: "x" })).toBe(computeItemVersion({ b: "x", a: 1 }));
  });

  it("advertises entity and item CAS preconditions on the MCP tool surface", () => {
    const tools = buildToolDefinitions();
    const correct = tools.find((tool) => tool.name === "correct")!;
    const patch = tools.find((tool) => tool.name === "patch_array_item")!;
    const correctProperties = correct.inputSchema.properties as Record<string, unknown>;
    const patchProperties = patch.inputSchema.properties as Record<string, unknown>;
    expect(correctProperties).toHaveProperty("expected_version");
    expect(correctProperties).toHaveProperty("overwrite");
    expect(patchProperties).toHaveProperty("expected_item_version");
    expect(patchProperties).toHaveProperty("expected_item_absent");
  });

  it("bounds repeated keyed-patch writes with the shared write limiter", async () => {
    const limiter = createWriteRateLimit(2);
    async function invoke(): Promise<{ next: boolean; status: number; body: unknown }> {
      let status = 200;
      let body: unknown;
      let next = false;
      const req = {
        ip: "127.0.0.252",
        headers: {},
        header: () => undefined,
        app: { get: () => false },
      };
      const res = {
        setHeader: () => undefined,
        status(code: number) {
          status = code;
          return this;
        },
        send(value: unknown) {
          body = value;
          return this;
        },
      };
      await limiter(req as never, res as never, () => {
        next = true;
      });
      return { next, status, body };
    }
    expect((await invoke()).next).toBe(true);
    expect((await invoke()).next).toBe(true);
    const limited = await invoke();
    expect(limited.status).toBe(429);
    expect(String(limited.body)).toMatch(/rate limit/i);
  });

  let entityId: string;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it("lets exactly one concurrent create-if-absent writer create a key", async () => {
    const key = `creator-${Date.now()}`;
    const results = await Promise.all([
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: key,
        item: { status: "writer-a" },
        expected_item_absent: true,
        idempotency_key: `${key}-a`,
      }),
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: key,
        item: { status: "writer-b" },
        expected_item_absent: true,
        idempotency_key: `${key}-b`,
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["applied", "conflict"]);
  });

  it("replays the committed item before CAS and rejects changed patch payload reuse", async () => {
    const rowKey = `patch-replay-row-${Date.now()}`;
    const idempotencyKey = `patch-replay-${Date.now()}`;
    const first = await patchArrayItem({
      entity_id: entityId,
      entity_type: TYPE,
      user_id: USER_ID,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: rowKey,
      item: { status: "committed" },
      expected_item_absent: true,
      idempotency_key: idempotencyKey,
    });

    const replay = await patchArrayItem({
      entity_id: entityId,
      entity_type: TYPE,
      user_id: USER_ID,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: rowKey,
      item: { status: "committed" },
      expected_item_absent: true,
      idempotency_key: idempotencyKey,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.observation_id).toBe(first.observation_id);
    expect(replay.item).toEqual(first.item);
    expect(replay.item?.status).toBe("committed");

    await expect(
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: rowKey,
        item: { status: "never-stored" },
        expected_item_absent: true,
        idempotency_key: idempotencyKey,
      })
    ).rejects.toBeInstanceOf(CorrectionIdempotencyMismatchError);
  });

  it("serializes entity-level correction CAS so one writer is rejected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00.123Z"));
    const current = await getEntityWithProvenance(entityId, false, USER_ID);
    const expected = current!.entity_version;
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

  it("replays identical concurrent entity CAS retries after the first transaction commits", async () => {
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    substrateEventBus.on("substrate_event", listener);
    const payload = {
      entity_id: entityId,
      entity_type: TYPE,
      user_id: USER_ID,
      field: "title",
      value: "concurrent committed replay",
      schema_version: "1.0",
      expected_version: before!.entity_version!,
      idempotency_key: `concurrent-cas-replay-${Date.now()}`,
    };
    let results: Awaited<ReturnType<typeof createCorrectionWithVersionPrecondition>>[];
    try {
      results = await Promise.all([
        createCorrectionWithVersionPrecondition(payload),
        createCorrectionWithVersionPrecondition(payload),
      ]);
    } finally {
      substrateEventBus.removeListener("substrate_event", listener);
    }
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0].observation_id).toBe(results[1].observation_id);
    expect(events).toHaveLength(2);
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect(after!.observation_count).toBe(before!.observation_count + 1);
    expect((after!.snapshot as Record<string, unknown>).title).toBe(payload.value);
  });

  it("returns the committed correction on replay before CAS and rejects changed payload reuse", async () => {
    const key = `correct-replay-${Date.now()}`;
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    const first = await createCorrectionWithVersionPrecondition({
      entity_id: entityId,
      entity_type: TYPE,
      field: "title",
      value: "committed-value",
      schema_version: "1.0",
      user_id: USER_ID,
      idempotency_key: key,
      expected_version: before!.entity_version,
    });
    const replay = await createCorrectionWithVersionPrecondition({
      entity_id: entityId,
      entity_type: TYPE,
      field: "title",
      value: "committed-value",
      schema_version: "1.0",
      user_id: USER_ID,
      idempotency_key: key,
      expected_version: "stale-on-purpose",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.observation_id).toBe(first.observation_id);
    expect(replay.value).toBe("committed-value");
    await expect(
      createCorrectionWithVersionPrecondition({
        entity_id: entityId,
        entity_type: TYPE,
        field: "title",
        value: "never-stored",
        schema_version: "1.0",
        user_id: USER_ID,
        idempotency_key: key,
        expected_version: "stale-on-purpose",
      })
    ).rejects.toBeInstanceOf(CorrectionIdempotencyMismatchError);
  });

  it("rolls back snapshots without publishing substrate events", async () => {
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    substrateEventBus.onSubstrateEvent(listener);
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    try {
      await expect(
        createCorrectionWithVersionPrecondition({
          entity_id: entityId,
          entity_type: TYPE,
          field: "title",
          value: "phantom-value",
          schema_version: "1.0",
          user_id: USER_ID,
          idempotency_key: `rollback-${Date.now()}`,
          expected_version: before!.entity_version,
          before_commit: () => {
            throw new Error("injected rollback");
          },
        })
      ).rejects.toThrow("injected rollback");
    } finally {
      substrateEventBus.off("substrate_event", listener);
    }
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect((after!.snapshot as Record<string, unknown>).title).not.toBe("phantom-value");
    expect(after!.entity_version).toBe(before!.entity_version);
    expect(events).toHaveLength(0);
  });

  it("rolls back an array patch without publishing substrate events", async () => {
    const rowKey = `patch-rollback-${Date.now()}`;
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    substrateEventBus.onSubstrateEvent(listener);
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    try {
      await expect(
        patchArrayItem({
          entity_id: entityId,
          entity_type: TYPE,
          user_id: USER_ID,
          field: "tasks_claimed",
          key_field: "claim_id",
          key_value: rowKey,
          item: { status: "phantom" },
          expected_item_absent: true,
          idempotency_key: `patch-rollback-${Date.now()}`,
          before_commit: () => {
            throw new Error("injected patch rollback");
          },
        })
      ).rejects.toThrow("injected patch rollback");
    } finally {
      substrateEventBus.off("substrate_event", listener);
    }
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect(after!.entity_version).toBe(before!.entity_version);
    expect(
      (
        (after!.snapshot as Record<string, unknown>).tasks_claimed as Array<Record<string, unknown>>
      ).some((row) => row.claim_id === rowKey)
    ).toBe(false);
    expect(events).toHaveLength(0);
  });

  it("rolls back a batch correction without publishing substrate events", async () => {
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    substrateEventBus.onSubstrateEvent(listener);
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    try {
      await expect(
        applyBatchCorrection({
          entity_id: entityId,
          entity_type: TYPE,
          user_id: USER_ID,
          changes: [{ field: "title", value: "phantom-batch" }],
          idempotency_prefix: `batch-rollback-${Date.now()}`,
          before_commit: () => {
            throw new Error("injected batch rollback");
          },
        })
      ).rejects.toThrow("injected batch rollback");
    } finally {
      substrateEventBus.off("substrate_event", listener);
    }
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect(after!.entity_version).toBe(before!.entity_version);
    expect((after!.snapshot as Record<string, unknown>).title).not.toBe("phantom-batch");
    expect(events).toHaveLength(0);
  });

  it("enforces store policy behaviorally and writes nothing on denial", async () => {
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    vi.spyOn(instancePolicy, "assertStorePolicyAllows").mockRejectedValueOnce(
      new instancePolicy.StorePolicyDeniedError([
        {
          entity_index: 0,
          entity_type: TYPE,
          reason_code: "entity_type_denied",
          hint: "Use an allowed entity type.",
        },
      ])
    );
    await expect(
      patchArrayItem({
        entity_id: entityId,
        entity_type: TYPE,
        user_id: USER_ID,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "policy-denied",
        item: { status: "must-not-land" },
        idempotency_key: `policy-denied-${Date.now()}`,
      })
    ).rejects.toBeInstanceOf(instancePolicy.StorePolicyDeniedError);
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect(after!.entity_version).toBe(before!.entity_version);
    expect(
      (
        (after!.snapshot as Record<string, unknown>).tasks_claimed as Array<Record<string, unknown>>
      ).some((row) => row.claim_id === "policy-denied")
    ).toBe(false);
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
