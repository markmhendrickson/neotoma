/**
 * By-id write entrances must confirm the caller owns entity_id BEFORE
 * writing under the caller's own user_id (neotoma#2229, a separate finding
 * discovered while auditing the entity-resolution cross-owner fix — same
 * invariant: "writes resolve only to entities the writer owns").
 *
 * Covers the entrances the finding names:
 *   - resolveSyncConflict (strategy: "manual") — POST /peers/resolve_sync_conflict
 *     and MCP resolve_sync_conflict both call this one function.
 *   - applyBatchCorrection / loadEntityForEdit — shared backend for
 *     POST /entities/:id/batch_correct and `neotoma edit`.
 *
 * Each entrance is proven to fail closed (404-shaped "not found", identical
 * to a genuinely missing entity_id — no existence leak) when a caller names
 * an entity_id it does not own, and to behave normally for its own entity.
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { resolveEntityWithTrace } from "../../src/services/entity_resolution.js";
import { resolveSyncConflict } from "../../src/services/sync/conflict_resolver.js";
import { applyBatchCorrection, loadEntityForEdit } from "../../src/services/batch_correction.js";
import { db } from "../../src/db.js";

function stamp(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function makeOwnedContact(userId: string, name: string): Promise<string> {
  const result = await resolveEntityWithTrace({
    entityType: "contact",
    fields: { name },
    userId,
    commit: true,
  });
  return result.entityId;
}

describe("resolveSyncConflict (strategy: manual) — by-id ownership precheck", () => {
  it("refuses to mark sync_conflict on another user's entity; returns the not-found shape", async () => {
    const s = stamp();
    const userA = `sync-owner-a-${s}`;
    const userB = `sync-owner-b-${s}`;
    const entityId = await makeOwnedContact(userA, `Sync Conflict Owner ${s}`);

    const result = await resolveSyncConflict({
      userId: userB,
      entity_id: entityId,
      strategy: "manual",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("manual: entity not found");

    // A's entity carries no sync_conflict correction from B.
    const { data: obs } = await db
      .from("observations")
      .select("id")
      .eq("entity_id", entityId)
      .eq("user_id", userB);
    expect((obs as unknown[] | null)?.length ?? 0).toBe(0);
  });

  it("a genuinely missing entity_id returns the identical message (no existence leak)", async () => {
    const s = stamp();
    const userB = `sync-owner-b-missing-${s}`;
    const result = await resolveSyncConflict({
      userId: userB,
      entity_id: `ent_${"0".repeat(24)}`,
      strategy: "manual",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("manual: entity not found");
  });

  it("the owner can still mark their own entity's sync_conflict flag", async () => {
    const s = stamp();
    const userA = `sync-owner-a-own-${s}`;
    const entityId = await makeOwnedContact(userA, `Sync Conflict Self ${s}`);

    const result = await resolveSyncConflict({
      userId: userA,
      entity_id: entityId,
      strategy: "manual",
    });
    expect(result.ok).toBe(true);

    // sync_conflict is not a declared field on the contact schema, so (per
    // the documented unknown-field append path) it is preserved on the
    // observation itself rather than projected into the computed snapshot —
    // assert on the observation row, not entity_snapshots.
    const { data: obs } = await db
      .from("observations")
      .select("fields")
      .eq("entity_id", entityId)
      .eq("user_id", userA)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (obs as Array<{ fields: unknown }> | null)?.[0];
    const fields =
      typeof row?.fields === "string"
        ? (JSON.parse(row.fields) as Record<string, unknown>)
        : (row?.fields as Record<string, unknown> | undefined);
    expect(fields?.sync_conflict).toBe(true);
  });
});

describe("applyBatchCorrection — by-id ownership precheck", () => {
  it("throws Entity not found for another user's entity_id (changes present)", async () => {
    const s = stamp();
    const userA = `batch-owner-a-${s}`;
    const userB = `batch-owner-b-${s}`;
    const entityId = await makeOwnedContact(userA, `Batch Correct Owner ${s}`);

    await expect(
      applyBatchCorrection({
        entity_id: entityId,
        user_id: userB,
        changes: [{ field: "name", value: "Hijacked" }],
      })
    ).rejects.toThrow(/Entity not found/);

    const { data: obs } = await db
      .from("observations")
      .select("id")
      .eq("entity_id", entityId)
      .eq("user_id", userB);
    expect((obs as unknown[] | null)?.length ?? 0).toBe(0);
  });

  it("throws Entity not found for another user's entity_id even with an empty changes array (no snapshot leak)", async () => {
    const s = stamp();
    const userA = `batch-owner-a-empty-${s}`;
    const userB = `batch-owner-b-empty-${s}`;
    const entityId = await makeOwnedContact(userA, `Batch Correct Empty Owner ${s}`);

    await expect(
      applyBatchCorrection({
        entity_id: entityId,
        user_id: userB,
        changes: [],
      })
    ).rejects.toThrow(/Entity not found/);
  });

  it("the owner can still apply a batch correction to their own entity", async () => {
    const s = stamp();
    const userA = `batch-owner-a-own-${s}`;
    const entityId = await makeOwnedContact(userA, `Batch Correct Self ${s}`);

    const result = await applyBatchCorrection({
      entity_id: entityId,
      user_id: userA,
      changes: [{ field: "name", value: "Renamed By Owner" }],
    });
    expect(result.status).toBe("applied");
  });
});

describe("loadEntityForEdit — by-id ownership precheck", () => {
  it("returns null for another user's entity_id", async () => {
    const s = stamp();
    const userA = `edit-owner-a-${s}`;
    const userB = `edit-owner-b-${s}`;
    const entityId = await makeOwnedContact(userA, `Load For Edit Owner ${s}`);

    const result = await loadEntityForEdit(entityId, userB);
    expect(result).toBeNull();
  });

  it("returns the snapshot for the owner", async () => {
    const s = stamp();
    const userA = `edit-owner-a-own-${s}`;
    const entityId = await makeOwnedContact(userA, `Load For Edit Self ${s}`);

    const result = await loadEntityForEdit(entityId, userA);
    expect(result).not.toBeNull();
    expect(result?.entity_id).toBe(entityId);
  });
});
