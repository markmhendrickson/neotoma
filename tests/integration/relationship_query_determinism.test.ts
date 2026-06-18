/**
 * Determinism tests for the non-paginated relationship query methods on
 * RelationshipsService.
 *
 * `getRelationshipsForEntity` and `getRelationshipsByType` order results by
 * `last_observation_at DESC`. When two relationships share the same
 * `last_observation_at`, that ordering alone is nondeterministic. These tests
 * assert the stable secondary sort on `relationship_key ASC` (the
 * relationship_snapshots PRIMARY KEY) so ties resolve deterministically.
 *
 * See docs/architecture/determinism.md ("Sorting MUST use deterministic
 * tiebreakers").
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/db.js";
import { relationshipsService } from "../../src/services/relationships.js";

describe("RelationshipsService query determinism", () => {
  const userId = "00000000-0000-0000-0000-000000000000";
  const sourceEntityId = "det_source_entity";
  // Shared timestamp forces a tie on last_observation_at so only the
  // secondary sort distinguishes the two rows.
  const tiedTimestamp = "2026-01-01T00:00:00.000Z";

  // relationship_keys chosen so insertion order (b before a) differs from
  // the expected sorted order (a before b). This makes the test fail if the
  // secondary sort is dropped and the DB falls back to insertion/rowid order.
  const keyA = "REFERS_TO:det_source_entity:det_target_a";
  const keyB = "REFERS_TO:det_source_entity:det_target_b";

  async function insertSnapshot(relationshipKey: string, targetEntityId: string): Promise<void> {
    const { error } = await db.from("relationship_snapshots").insert({
      relationship_key: relationshipKey,
      relationship_type: "REFERS_TO",
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      schema_version: "1.0",
      snapshot: {},
      computed_at: tiedTimestamp,
      observation_count: 1,
      last_observation_at: tiedTimestamp,
      provenance: {},
      user_id: userId,
    });
    if (error) {
      throw new Error(`Failed to seed snapshot ${relationshipKey}: ${error.message}`);
    }
  }

  beforeEach(async () => {
    await db.from("relationship_snapshots").delete().eq("source_entity_id", sourceEntityId);

    // Insert B first, then A: insertion order is the reverse of expected order.
    await insertSnapshot(keyB, "det_target_b");
    await insertSnapshot(keyA, "det_target_a");
  });

  it("getRelationshipsForEntity orders ties by relationship_key ASC", async () => {
    const rels = await relationshipsService.getRelationshipsForEntity(sourceEntityId, "outgoing");

    const keys = rels.map((r) => r.relationship_key);
    expect(keys).toEqual([keyA, keyB]);
  });

  it("getRelationshipsByType orders ties by relationship_key ASC", async () => {
    const rels = await relationshipsService.getRelationshipsByType("REFERS_TO");

    const seeded = rels.filter((r) => r.source_entity_id === sourceEntityId);
    const keys = seeded.map((r) => r.relationship_key);
    expect(keys).toEqual([keyA, keyB]);
  });

  it("repeated queries return a stable order", async () => {
    const first = (
      await relationshipsService.getRelationshipsForEntity(sourceEntityId, "outgoing")
    ).map((r) => r.relationship_key);
    const second = (
      await relationshipsService.getRelationshipsForEntity(sourceEntityId, "outgoing")
    ).map((r) => r.relationship_key);

    expect(first).toEqual(second);
    expect(first).toEqual([keyA, keyB]);
  });
});
