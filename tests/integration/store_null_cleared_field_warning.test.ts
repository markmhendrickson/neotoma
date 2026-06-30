/**
 * Integration tests for the NULL_CLEARED_FIELD store warning (#1839).
 *
 * Under the `highest_priority` reducer, a `null` observation is an explicit
 * tombstone: at the same-or-higher source_priority it wins selection and clears
 * the field from the snapshot. This is BY DESIGN (only `undefined` is ignored by
 * the reducer). The gap reported in #1839 is that the clear is SILENT — a
 * transient upstream failure that writes `null` can erase a good historical
 * value with no signal.
 *
 * This suite asserts the warn-only fix on the HTTP `/store` path (which
 * persists a typed-field null as an observation, unlike the MCP path that
 * strips it to raw_fragments):
 *  1. Store a good non-null value under a `highest_priority` field.
 *  2. Store a `null` at a higher source_priority → the snapshot field IS
 *     cleared (semantics unchanged) AND a `NULL_CLEARED_FIELD` store_warning
 *     fires with the correct code/observation_index/entity_type/entity_id.
 *  3. Storing the good value alone → no NULL_CLEARED_FIELD warning.
 *  4. Storing a null over an already-empty field → no warning (nothing lost).
 */

import { createServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../../src/actions.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";
import { db } from "../../src/db.js";
import { observationReducer } from "../../src/reducers/observation_reducer.js";

const TEST_USER_ID = LOCAL_DEV_USER_ID;

// Registered schema type whose `value` field uses `highest_priority`, so a null
// at the same/higher priority wins selection and clears the field.
const NULL_TYPE = "test_null_cleared_priority_type";

const API_PORT = 18251;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

type StoreWarning = {
  code: string;
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

type StoreResponse = {
  entities?: Array<{ entity_id: string; entity_type: string }>;
  store_warnings?: StoreWarning[];
  error?: unknown;
};

/**
 * Recompute an entity's snapshot directly from its persisted observations via
 * the reducer. Embedding-free, so the assertion does not depend on a valid
 * OPENAI_API_KEY (entity_snapshot_after in the store response is gated on a
 * successful embedding upsert, unavailable in key-less test environments).
 */
async function reduceSnapshot(entityId: string, userId: string) {
  const { data: obs } = await db
    .from("observations")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .order("observed_at", { ascending: false });
  const mapped = (obs ?? []).map((o: any) => ({
    id: o.id,
    entity_id: o.entity_id,
    entity_type: o.entity_type,
    schema_version: o.schema_version,
    source_id: o.source_id || "",
    observed_at: o.observed_at,
    specificity_score: o.specificity_score,
    source_priority: o.source_priority,
    observation_source: o.observation_source ?? undefined,
    fields: o.fields,
    created_at: o.created_at,
    user_id: o.user_id,
  }));
  const snap = await observationReducer.computeSnapshot(entityId, mapped as any);
  return (snap?.snapshot as Record<string, unknown> | undefined) ?? {};
}

async function httpStore(body: Record<string, unknown>): Promise<StoreResponse> {
  const res = await fetch(`${API_BASE}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as StoreResponse;
}

describe("store_warnings: NULL_CLEARED_FIELD (#1839)", () => {
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    if (!(await schemaRegistry.loadActiveSchema(NULL_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: NULL_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            label: { type: "string", required: false },
            value: { type: "number", required: false },
          },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: {
          merge_policies: {
            value: { strategy: "highest_priority" },
          },
        },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupEntityType(NULL_TYPE, TEST_USER_ID);
    await cleanupTestSchema(NULL_TYPE, TEST_USER_ID);
  });

  it("warns and still clears when a null wins over a prior non-null value under highest_priority", async () => {
    const canonical = `null-cleared-${Date.now()}`;

    // Step 1: store a good value at source_priority 10.
    const goodBody = await httpStore({
      idempotency_key: `null-good-${Date.now()}`,
      commit: true,
      source_priority: 10,
      observation_source: "sensor",
      entities: [
        {
          entity_type: NULL_TYPE,
          canonical_name: canonical,
          label: "t",
          value: 0.18,
        },
      ],
    });
    expect(goodBody.error).toBeUndefined();
    expect(goodBody.entities && goodBody.entities.length).toBe(1);
    const entityId = goodBody.entities![0].entity_id;
    // Good value is reduced into the snapshot.
    expect((await reduceSnapshot(entityId, TEST_USER_ID)).value).toBe(0.18);
    // No NULL_CLEARED_FIELD on the first (non-null) write.
    expect((goodBody.store_warnings ?? []).some((w) => w.code === "NULL_CLEARED_FIELD")).toBe(
      false
    );

    // Step 2: store null at a HIGHER source_priority → deterministically wins
    // selection and clears the field. (Same-priority null also wins per the
    // reducer, but two stores in one test can collide on observed_at to the
    // millisecond, making the id tie-break nondeterministic; a higher priority
    // removes that flakiness while still exercising the exact #1839 path.)
    const clearedBody = await httpStore({
      idempotency_key: `null-clear-${Date.now()}`,
      commit: true,
      source_priority: 20,
      observation_source: "sensor",
      entities: [
        {
          entity_type: NULL_TYPE,
          canonical_name: canonical,
          label: "t",
          value: null,
        },
      ],
    });
    expect(clearedBody.error).toBeUndefined();
    expect(clearedBody.entities && clearedBody.entities.length).toBe(1);
    expect(clearedBody.entities![0].entity_id).toBe(entityId);

    // Semantics unchanged: the field is cleared from the reduced snapshot.
    const reduced = await reduceSnapshot(entityId, TEST_USER_ID);
    expect(reduced.value === undefined || reduced.value === null).toBe(true);

    // The warning fires.
    const warn = (clearedBody.store_warnings ?? []).find((w) => w.code === "NULL_CLEARED_FIELD");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(NULL_TYPE);
    expect(warn!.entity_id).toBe(entityId);
    expect(warn!.observation_index).toBe(0);
    expect(warn!.message).toContain('"value"');
    expect(warn!.message).toContain("highest_priority");
  });

  it("does not warn when a null is stored over an already-empty field (nothing lost)", async () => {
    const canonical = `null-empty-${Date.now()}`;

    // First write carries only label; value was never set.
    const firstBody = await httpStore({
      idempotency_key: `null-empty-first-${Date.now()}`,
      commit: true,
      source_priority: 10,
      observation_source: "sensor",
      entities: [
        {
          entity_type: NULL_TYPE,
          canonical_name: canonical,
          label: "t",
        },
      ],
    });
    expect(firstBody.error).toBeUndefined();

    // Now store value: null — there is no prior non-null value to clear.
    const nulledBody = await httpStore({
      idempotency_key: `null-empty-null-${Date.now()}`,
      commit: true,
      source_priority: 20,
      observation_source: "sensor",
      entities: [
        {
          entity_type: NULL_TYPE,
          canonical_name: canonical,
          label: "t",
          value: null,
        },
      ],
    });
    expect(nulledBody.error).toBeUndefined();
    expect((nulledBody.store_warnings ?? []).some((w) => w.code === "NULL_CLEARED_FIELD")).toBe(
      false
    );
  });
});
