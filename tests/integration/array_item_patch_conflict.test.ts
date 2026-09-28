/**
 * Regression coverage for the Waxwing ADR (ent_4b41bb83a4faf4428a73bfc8):
 * "Prevent lost updates when concurrent sessions refresh session_digest
 * workboards".
 *
 * The reproduction: two compliant writers each read-modify-full-array-write
 * `session_digest.tasks_claimed`. Writer B reads an earlier snapshot,
 * replaces the WHOLE array with its own result, and thereby reverts writer
 * A's disjoint row — even though both writes report success. This suite
 * exercises `patch_array_item` (both HTTP and MCP transports) as the fix:
 * a server-side atomic read-modify-write scoped to one key, so concurrent
 * disjoint-key writers never race, and same-key races are either resolved
 * deterministically (merge_array_by_key) or explicitly refused
 * (expected_item_version CAS).
 *
 * Pattern follows tests/integration/correct_http_mcp_parity.test.ts: boots
 * the real Express app for HTTP and the real NeotomaServer for MCP against
 * the same seeded entity.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_array_item_patch_session_digest";
const API_PORT = 18243;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

type PatchBody = Record<string, unknown>;

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

function callPatchArrayItem(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      patchArrayItem: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).patchArrayItem(params);
}

function callCorrect(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      correct: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).correct(params);
}

async function httpPatch(
  body: Record<string, unknown>
): Promise<{ status: number; body: PatchBody }> {
  const res = await fetch(`${API_BASE}/patch_array_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as PatchBody };
}

async function httpCorrect(
  body: Record<string, unknown>
): Promise<{ status: number; body: PatchBody }> {
  const res = await fetch(`${API_BASE}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as PatchBody };
}

async function fetchSnapshot(entityId: string): Promise<Record<string, unknown>> {
  const { getEntityWithProvenance } = await import("../../src/services/entity_queries.js");
  const entity = await getEntityWithProvenance(entityId, false, USER_ID);
  return (entity?.snapshot as Record<string, unknown>) ?? {};
}

describe("patch_array_item — lost-update prevention (Waxwing ADR)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;
  let entityId: string;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    if (!(await schemaRegistry.loadActiveSchema(TYPE))) {
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
            tasks_claimed: { strategy: "merge_array_by_key", key_field: "claim_id" },
          },
        },
        activate: true,
      });
    }

    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-array-item-patch-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, title: "workboard", tasks_claimed: [] }],
    });
    const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
    entityId = body.entities[0].entity_id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("agent-facing eval: two sessions refresh one workboard without losing either task", async () => {
    const [resA, resB] = await Promise.all([
      httpPatch({
        entity_id: entityId,
        entity_type: TYPE,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "pr-1320",
        item: { claim: "review PR #1320", status: "in_review" },
        idempotency_key: `patch-a-${Date.now()}`,
        user_id: USER_ID,
      }),
      httpPatch({
        entity_id: entityId,
        entity_type: TYPE,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: "vocab-review",
        item: { claim: "vocabulary review", status: "in_progress" },
        idempotency_key: `patch-b-${Date.now()}`,
        user_id: USER_ID,
      }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.item_version).toMatch(/^[a-f0-9]{64}$/);
    expect(resB.body.item_version).toMatch(/^[a-f0-9]{64}$/);

    const snapshot = await fetchSnapshot(entityId);
    const rows = snapshot.tasks_claimed as Array<Record<string, unknown>>;
    const byId = Object.fromEntries(rows.map((r) => [r.claim_id, r]));

    // The direct regression assertion: a naive full-array-replace caller
    // pattern would have dropped one of these two rows. Both must survive.
    expect(byId["pr-1320"]).toMatchObject({ status: "in_review" });
    expect(byId["vocab-review"]).toMatchObject({ status: "in_progress" });
  });

  it("atomically allows only one same-key CAS writer holding the same version", async () => {
    const key = `atomic-cas-${Date.now()}`;
    const seeded = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: key,
      item: { status: "queued" },
      idempotency_key: `atomic-seed-${Date.now()}`,
      user_id: USER_ID,
    });
    const expectedVersion = seeded.body.item_version as string;

    const [writerA, writerB] = await Promise.all([
      httpPatch({
        entity_id: entityId,
        entity_type: TYPE,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: key,
        item: { status: "in_review" },
        expected_item_version: expectedVersion,
        idempotency_key: `atomic-a-${Date.now()}`,
        user_id: USER_ID,
      }),
      httpPatch({
        entity_id: entityId,
        entity_type: TYPE,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: key,
        item: { status: "blocked" },
        expected_item_version: expectedVersion,
        idempotency_key: `atomic-b-${Date.now()}`,
        user_id: USER_ID,
      }),
    ]);

    expect([writerA.status, writerB.status].sort()).toEqual([200, 409]);
    const conflict = writerA.status === 409 ? writerA : writerB;
    expect(conflict.body.error_code).toBe("ERR_ARRAY_ITEM_CONFLICT");
    expect((conflict.body.details as Record<string, unknown>).hint).toMatch(/retry/i);
  });

  it("refuses a stale same-key write with ERR_ARRAY_ITEM_CONFLICT and writes nothing", async () => {
    const seedKey = `conflict-row-${Date.now()}`;
    const seeded = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: seedKey,
      item: { status: "queued" },
      idempotency_key: `seed-conflict-${Date.now()}`,
      user_id: USER_ID,
    });
    expect(seeded.status).toBe(200);
    const staleVersion = seeded.body.item_version as string;

    // Writer A updates the row (advancing its version).
    const writerA = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: seedKey,
      item: { status: "in_review" },
      idempotency_key: `writer-a-${Date.now()}`,
      user_id: USER_ID,
    });
    expect(writerA.status).toBe(200);

    // Writer B, holding the STALE version from before A's write, retries the
    // same key with expected_item_version. This is the literal "planted
    // stale write fails" test.
    const writerB = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: seedKey,
      item: { status: "abandoned" },
      expected_item_version: staleVersion,
      idempotency_key: `writer-b-stale-${Date.now()}`,
      user_id: USER_ID,
    });

    expect(writerB.status).toBe(409);
    expect(writerB.body.error_code).toBe("ERR_ARRAY_ITEM_CONFLICT");

    // Nothing was overwritten: the stored value still reflects A's write.
    const snapshot = await fetchSnapshot(entityId);
    const rows = snapshot.tasks_claimed as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.claim_id === seedKey);
    expect(row).toMatchObject({ status: "in_review" });
  });

  it("succeeds when B retries with a fresh expected_item_version from the 409 response", async () => {
    const seedKey = `retry-row-${Date.now()}`;
    const seeded = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: seedKey,
      item: { status: "queued" },
      idempotency_key: `seed-retry-${Date.now()}`,
      user_id: USER_ID,
    });
    const staleVersion = seeded.body.item_version as string;

    await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: seedKey,
      item: { status: "in_review" },
      idempotency_key: `writer-a-retry-${Date.now()}`,
      user_id: USER_ID,
    });

    const conflictAttempt = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: seedKey,
      item: { status: "abandoned" },
      expected_item_version: staleVersion,
      idempotency_key: `writer-b-conflict-${Date.now()}`,
      user_id: USER_ID,
    });
    expect(conflictAttempt.status).toBe(409);
    const freshVersion = conflictAttempt.body.details as Record<string, unknown>;
    const currentVersion = freshVersion.current_item_version as string;

    // Retry with the fresh version from the conflict response — no second
    // round-trip needed to fetch it.
    const retried = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: seedKey,
      item: { status: "merged" },
      expected_item_version: currentVersion,
      idempotency_key: `writer-b-retry-${Date.now()}`,
      user_id: USER_ID,
    });

    expect(retried.status).toBe(200);
    const snapshot = await fetchSnapshot(entityId);
    const rows = snapshot.tasks_claimed as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.claim_id === seedKey);
    expect(row).toMatchObject({ status: "merged" });
  });

  it("MCP patch_array_item matches the HTTP transport's natural call shape (cross-surface parity)", async () => {
    const key = `mcp-parity-${Date.now()}`;
    const result = await callPatchArrayItem(server, {
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: key,
      item: { status: "queued" },
      idempotency_key: `mcp-parity-key-${Date.now()}`,
    });
    const body = JSON.parse(result.content[0].text) as PatchBody;
    expect(body.item).toMatchObject({ claim_id: key, status: "queued" });
    expect(typeof body.item_version).toBe("string");

    const snapshot = await fetchSnapshot(entityId);
    const rows = snapshot.tasks_claimed as Array<Record<string, unknown>>;
    expect(rows.some((r) => r.claim_id === key)).toBe(true);
  });

  it("HTTP and MCP replay the committed patch result and reject changed-payload key reuse", async () => {
    for (const surface of ["http", "mcp"] as const) {
      const rowKey = `${surface}-replay-row-${Date.now()}`;
      const idempotencyKey = `${surface}-replay-key-${Date.now()}`;
      const payload = {
        entity_id: entityId,
        entity_type: TYPE,
        field: "tasks_claimed",
        key_field: "claim_id",
        key_value: rowKey,
        item: { status: "committed" },
        expected_item_absent: true,
        idempotency_key: idempotencyKey,
        user_id: USER_ID,
      };
      if (surface === "http") {
        const first = await httpPatch(payload);
        const replay = await httpPatch(payload);
        expect(first.status).toBe(200);
        expect(replay.status).toBe(200);
        expect(replay.body.replayed).toBe(true);
        expect(replay.body.observation_id).toBe(first.body.observation_id);
        expect(replay.body.item).toEqual(first.body.item);
        const mismatch = await httpPatch({
          ...payload,
          item: { status: "never-stored" },
        });
        expect(mismatch.status).toBe(400);
        expect(mismatch.body.error_code).toBe("ERR_IDEMPOTENCY_MISMATCH");
      } else {
        const firstResult = await callPatchArrayItem(server, payload);
        const replayResult = await callPatchArrayItem(server, payload);
        const first = JSON.parse(firstResult.content[0].text) as PatchBody;
        const replay = JSON.parse(replayResult.content[0].text) as PatchBody;
        expect(replay.replayed).toBe(true);
        expect(replay.observation_id).toBe(first.observation_id);
        expect(replay.item).toEqual(first.item);
        let mismatch: unknown;
        try {
          await callPatchArrayItem(server, { ...payload, item: { status: "never-stored" } });
        } catch (error) {
          mismatch = error;
        }
        expect((mismatch as { data?: { code?: string } }).data?.code).toBe(
          "ERR_IDEMPOTENCY_MISMATCH"
        );
      }

      const snapshot = await fetchSnapshot(entityId);
      const rows = snapshot.tasks_claimed as Array<Record<string, unknown>>;
      expect(rows.find((row) => row.claim_id === rowKey)?.status).toBe("committed");
    }
  });

  it("entity-level CAS on /correct rejects a stale expected_version without writing", async () => {
    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-cas-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, title: "cas-target", tasks_claimed: [] }],
    });
    const body = JSON.parse(stored.content[0].text) as {
      entities: Array<{
        entity_id: string;
        entity_snapshot_after?: { entity_version?: string };
      }>;
    };
    const casEntityId = body.entities[0].entity_id;
    const loaded = await getEntityWithProvenance(casEntityId, false, USER_ID);
    const staleVersion = loaded!.entity_version;

    // Advance the entity (a DIFFERENT field) so the collision-safe token moves.
    const bump = await httpCorrect({
      entity_id: casEntityId,
      entity_type: TYPE,
      field: "title",
      value: "cas-target-bumped",
      idempotency_key: `cas-bump-${Date.now()}`,
      user_id: USER_ID,
    });
    expect(bump.status).toBe(200);

    // A correction with the now-stale expected_version must be refused.
    const staleAttempt = await httpCorrect({
      entity_id: casEntityId,
      entity_type: TYPE,
      field: "title",
      value: "cas-target-should-not-land",
      idempotency_key: `cas-stale-${Date.now()}`,
      user_id: USER_ID,
      expected_version: staleVersion,
    });
    expect(staleAttempt.status).toBe(409);
    // Flat standard envelope (matches openapi.yaml's ErrorEnvelope schema and
    // the sibling ERR_ARRAY_ITEM_CONFLICT shape on /patch_array_item) — NOT
    // wrapped under an `error` key.
    expect(staleAttempt.body.error_code).toBe("ERR_FIELD_VERSION_CONFLICT");
    const details = staleAttempt.body.details as Record<string, unknown>;
    expect(details.entity_id).toBe(casEntityId);
    expect(details.field).toBe("title");

    // Nothing was written by the stale attempt.
    const after = await getEntityWithProvenance(casEntityId, false, USER_ID);
    expect((after?.snapshot as Record<string, unknown>).title).toBe("cas-target-bumped");
  });

  it("serializes concurrent /correct CAS writers so exactly one applies", async () => {
    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-concurrent-cas-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, title: "concurrent-cas-target", tasks_claimed: [] }],
    });
    const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
    const targetId = body.entities[0].entity_id;
    const before = await getEntityWithProvenance(targetId, false, USER_ID);
    const expectedVersion = before!.entity_version;

    const [writerA, writerB] = await Promise.all([
      httpCorrect({
        entity_id: targetId,
        entity_type: TYPE,
        field: "title",
        value: "writer-a",
        expected_version: expectedVersion,
        idempotency_key: `concurrent-correct-a-${Date.now()}`,
        user_id: USER_ID,
      }),
      httpCorrect({
        entity_id: targetId,
        entity_type: TYPE,
        field: "title",
        value: "writer-b",
        expected_version: expectedVersion,
        idempotency_key: `concurrent-correct-b-${Date.now()}`,
        user_id: USER_ID,
      }),
    ]);

    expect([writerA.status, writerB.status].sort()).toEqual([200, 409]);
    const conflict = writerA.status === 409 ? writerA : writerB;
    expect(conflict.body.error_code).toBe("ERR_FIELD_VERSION_CONFLICT");
  });

  it("MCP correct exposes entity CAS success, stale conflict, retry guidance, and no write", async () => {
    const before = await getEntityWithProvenance(entityId, false, USER_ID);
    const expectedVersion = before!.entity_version;
    const first = await callCorrect(server, {
      entity_id: entityId,
      entity_type: TYPE,
      field: "title",
      value: "mcp-cas-winner",
      expected_version: expectedVersion,
      idempotency_key: `mcp-cas-first-${Date.now()}`,
      user_id: USER_ID,
    });
    const firstBody = JSON.parse(first.content[0].text) as PatchBody;
    expect(firstBody.entity_version).toMatch(/^[a-f0-9]{64}$/);

    let conflict: unknown;
    try {
      await callCorrect(server, {
        entity_id: entityId,
        entity_type: TYPE,
        field: "title",
        value: "mcp-cas-must-not-land",
        expected_version: expectedVersion,
        idempotency_key: `mcp-cas-stale-${Date.now()}`,
        user_id: USER_ID,
      });
    } catch (error) {
      conflict = error;
    }
    const conflictData = (conflict as { data?: Record<string, unknown> }).data;
    expect(conflictData?.code).toBe("ERR_FIELD_VERSION_CONFLICT");
    expect(conflictData?.hint).toMatch(/retry/i);
    const after = await getEntityWithProvenance(entityId, false, USER_ID);
    expect((after!.snapshot as Record<string, unknown>).title).toBe("mcp-cas-winner");
  });

  it("refuses a patch whose key_field does not match the schema's declared merge_array_by_key key_field", async () => {
    // The schema declares key_field: "claim_id" for tasks_claimed (see
    // beforeAll). Calling patch_array_item with a different key_field must
    // be refused rather than silently locating/updating a row by the wrong
    // identity — the reducer always reconciles by the schema's declared
    // key_field, so a mismatched write would otherwise appear as a
    // duplicate row instead of an in-place update.
    const res = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "tasks_claimed",
      key_field: "task_id", // wrong: schema declares "claim_id"
      key_value: "should-not-write",
      item: { status: "queued" },
      idempotency_key: `key-mismatch-${Date.now()}`,
      user_id: USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("ERR_ARRAY_ITEM_KEY_FIELD_MISMATCH");
    const details = res.body.details as Record<string, unknown>;
    expect(details.declared_key_field).toBe("claim_id");
    expect(details.supplied_key_field).toBe("task_id");

    // Nothing was written.
    const snapshot = await fetchSnapshot(entityId);
    const rows = snapshot.tasks_claimed as Array<Record<string, unknown>>;
    expect(
      rows.some((r) => r.claim_id === "should-not-write" || r.task_id === "should-not-write")
    ).toBe(false);
  });

  it("MCP patch_array_item also refuses a key_field mismatch", async () => {
    await expect(
      callPatchArrayItem(server, {
        entity_id: entityId,
        entity_type: TYPE,
        field: "tasks_claimed",
        key_field: "task_id",
        key_value: "mcp-should-not-write",
        item: { status: "queued" },
        idempotency_key: `key-mismatch-mcp-${Date.now()}`,
        user_id: USER_ID,
      })
    ).rejects.toThrow(/key_field mismatch/);
  });

  it("fails closed when the field lacks a merge_array_by_key policy", async () => {
    const res = await httpPatch({
      entity_id: entityId,
      entity_type: TYPE,
      field: "title",
      key_field: "claim_id",
      key_value: "not-keyed",
      item: { status: "should-not-write" },
      idempotency_key: `missing-policy-${Date.now()}`,
      user_id: USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("ERR_ARRAY_ITEM_POLICY_REQUIRED");
  });

  it("rejects a caller-supplied entity_type that differs from the stored type", async () => {
    const res = await httpPatch({
      entity_id: entityId,
      entity_type: "unprotected_decoy_type",
      field: "tasks_claimed",
      key_field: "claim_id",
      key_value: "type-mismatch",
      item: { status: "should-not-write" },
      idempotency_key: `type-mismatch-${Date.now()}`,
      user_id: USER_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("ERR_ARRAY_ITEM_ENTITY_TYPE_MISMATCH");
  });

  it("legacy /correct calls without expected_version see zero behavior change", async () => {
    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-legacy-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, title: "legacy-target", tasks_claimed: [] }],
    });
    const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
    const legacyEntityId = body.entities[0].entity_id;

    const res = await httpCorrect({
      entity_id: legacyEntityId,
      entity_type: TYPE,
      field: "title",
      value: "legacy-target-updated",
      idempotency_key: `legacy-${Date.now()}`,
      user_id: USER_ID,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects /correct when the supplied entity_type differs from the stored type", async () => {
    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `correct-type-target-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, title: "correct-type-target", tasks_claimed: [] }],
    });
    const storedBody = JSON.parse(stored.content[0].text) as {
      entities: Array<{ entity_id: string }>;
    };
    const entityId = storedBody.entities[0].entity_id;

    const response = await httpCorrect({
      entity_id: entityId,
      entity_type: "unprotected_decoy_type",
      field: "title",
      value: "must-not-land",
      idempotency_key: "correct-type-mismatch",
    });

    expect(response.status).toBe(400);
    expect(response.body.error_code).toBe("ERR_ENTITY_TYPE_MISMATCH");

    const snapshot = await getEntityWithProvenance(entityId, false, USER_ID);
    expect(snapshot?.snapshot.title).toBe("correct-type-target");
  });
});
