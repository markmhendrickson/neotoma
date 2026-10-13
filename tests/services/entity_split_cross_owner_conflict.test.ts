/**
 * split_entity's `newEntity.target_entity_id` is a caller-supplied id used to
 * re-point observations onto an EXISTING entity (splitting into a
 * pre-existing row rather than minting a new one). Before this fix, the
 * function tried an insert on that id and silently tolerated an
 * "already exists" failure, then proceeded to rewrite
 * observations.entity_id onto it regardless of who owned it — the
 * source_entity_id is ownership-checked, but target_entity_id never was.
 * Flagged during the entity-resolution security review (as an
 * unreproduced-but-plausible vector on security_finding
 * "cross-owner entity id collision lets a store write into another user's
 * entity") and closed here with the same EntityOwnerConflictError guard used
 * at every other write entrance.
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { resolveEntityWithTrace } from "../../src/services/entity_resolution.js";
import { splitEntity } from "../../src/services/entity_split.js";
import { EntityOwnerConflictError } from "../../src/services/entity_resolution.js";
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

async function seedTwoObservations(entityId: string, entityType: string, userId: string) {
  const now = new Date();
  const older = new Date(now.getTime() - 60_000).toISOString();
  const newer = now.toISOString();
  await db.from("observations").insert([
    {
      id: randomUUID(),
      entity_id: entityId,
      entity_type: entityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: older,
      specificity_score: 1,
      source_priority: 100,
      fields: { note: "older observation, stays on source" },
      user_id: userId,
      created_at: older,
    },
    {
      id: randomUUID(),
      entity_id: entityId,
      entity_type: entityType,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: newer,
      specificity_score: 1,
      source_priority: 100,
      fields: { note: "newer observation, moves on split" },
      user_id: userId,
      created_at: newer,
    },
  ]);
  return { older, newer };
}

describe("split_entity: target_entity_id cross-owner refusal", () => {
  it("B splitting B's own entity into A's target_entity_id is refused; A's entity is untouched", async () => {
    const s = stamp();
    const userA = `split-owner-a-${s}`;
    const userB = `split-owner-b-${s}`;

    const targetOwnedByA = await makeOwnedContact(userA, `Split Target Owned By A ${s}`);
    const sourceOwnedByB = await makeOwnedContact(userB, `Split Source Owned By B ${s}`);
    const { newer } = await seedTwoObservations(sourceOwnedByB, "contact", userB);

    const beforeObsCount =
      (await db.from("observations").select("id").eq("entity_id", targetOwnedByA)).data?.length ??
      0;

    await expect(
      splitEntity({
        sourceEntityId: sourceOwnedByB,
        userId: userB,
        predicate: { observed_at_gte: newer },
        newEntity: {
          entity_type: "contact",
          canonical_name: "irrelevant — target_entity_id wins",
          target_entity_id: targetOwnedByA,
        },
        idempotencyKey: `split-hijack-${s}`,
        splitBy: "test",
      })
    ).rejects.toBeInstanceOf(EntityOwnerConflictError);

    // A's entity received no observations from B's split.
    const afterObsCount =
      (await db.from("observations").select("id").eq("entity_id", targetOwnedByA)).data?.length ??
      0;
    expect(afterObsCount).toBe(beforeObsCount);

    // B's source entity still has both its original observations (nothing
    // was re-pointed away since the write was refused before any rewrite).
    const sourceObsCount =
      (await db.from("observations").select("id").eq("entity_id", sourceOwnedByB)).data?.length ??
      0;
    expect(sourceObsCount).toBe(2);

    const { data: targetRow } = await db
      .from("entities")
      .select("user_id")
      .eq("id", targetOwnedByA)
      .maybeSingle();
    expect((targetRow as { user_id: string | null } | null)?.user_id).toBe(userA);
  });

  it("A splitting A's own entity into A's own pre-existing entity still works (same owner)", async () => {
    const s = stamp();
    const userA = `split-owner-a-same-${s}`;

    const targetOwnedByA = await makeOwnedContact(userA, `Split Target Same Owner ${s}`);
    const sourceOwnedByA = await makeOwnedContact(userA, `Split Source Same Owner ${s}`);
    const { newer } = await seedTwoObservations(sourceOwnedByA, "contact", userA);

    const result = await splitEntity({
      sourceEntityId: sourceOwnedByA,
      userId: userA,
      predicate: { observed_at_gte: newer },
      newEntity: {
        entity_type: "contact",
        canonical_name: "irrelevant — target_entity_id wins",
        target_entity_id: targetOwnedByA,
      },
      idempotencyKey: `split-same-owner-${s}`,
      splitBy: "test",
    });

    expect(result.new_entity_id).toBe(targetOwnedByA);
    expect(result.observations_moved).toBe(1);

    const movedObsCount =
      (await db.from("observations").select("id").eq("entity_id", targetOwnedByA)).data?.length ??
      0;
    expect(movedObsCount).toBe(1);
  });
});
