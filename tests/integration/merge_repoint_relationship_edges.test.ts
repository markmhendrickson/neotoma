/**
 * Regression test for #1507: merge_entities leaves inbound relationship
 * edges dangling on the merged-away entity.
 *
 * Verifies that after merging entity B into entity A:
 *   (a) survivor A inherits all relationship edges from B
 *   (b) tombstone B has zero live relationship_observations rows
 *   (c) duplicate relationship_keys are collapsed (no duplicates on A)
 *   (d) self-loops produced by the repoint are dropped
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { repointRelationshipObservations } from "../../src/services/observation_storage.js";
import { createRelationshipObservations } from "../../src/services/interpretation.js";

const TEST_USER = "test-merge-repoint-1507";

async function cleanupUser() {
  await db.from("relationship_observations").delete().eq("user_id", TEST_USER);
  await db.from("relationship_snapshots").delete().eq("user_id", TEST_USER);
}

describe("merge_entities — repointRelationshipObservations (#1507)", () => {
  beforeEach(async () => {
    await cleanupUser();
  });

  afterEach(async () => {
    await cleanupUser();
  });

  it("(a) survivor inherits B's edges after repoint", async () => {
    const entityA = "ent_merge_A_1507";
    const entityB = "ent_merge_B_1507";
    const entityC = "ent_merge_C_1507";

    // B → C (outgoing from B)
    await createRelationshipObservations(
      [
        {
          relationship_type: "PART_OF",
          source_entity_id: entityB,
          target_entity_id: entityC,
          metadata: { note: "B→C" },
        },
      ],
      "src_1507_a",
      null,
      TEST_USER,
      50
    );

    // C → B (incoming to B)
    await createRelationshipObservations(
      [
        {
          relationship_type: "REFERS_TO",
          source_entity_id: entityC,
          target_entity_id: entityB,
          metadata: { note: "C→B" },
        },
      ],
      "src_1507_b",
      null,
      TEST_USER,
      50
    );

    // Simulate merging B into A
    const repointed = await repointRelationshipObservations(entityB, entityA, TEST_USER);

    // Survivor A should now own 2 edges
    const { data: survivorEdges } = await db
      .from("relationship_observations")
      .select("relationship_key, source_entity_id, target_entity_id")
      .eq("user_id", TEST_USER)
      .or(`source_entity_id.eq.${entityA},target_entity_id.eq.${entityA}`);

    const keys = (survivorEdges ?? []).map((r) => r.relationship_key);
    expect(keys).toContain(`PART_OF:${entityA}:${entityC}`);
    expect(keys).toContain(`REFERS_TO:${entityC}:${entityA}`);
    expect(repointed).toBe(2);
  });

  it("(b) tombstone B has zero live relationship_observations after repoint", async () => {
    const entityA = "ent_merge_A2_1507";
    const entityB = "ent_merge_B2_1507";
    const entityD = "ent_merge_D2_1507";

    await createRelationshipObservations(
      [
        {
          relationship_type: "DEPENDS_ON",
          source_entity_id: entityB,
          target_entity_id: entityD,
          metadata: {},
        },
      ],
      "src_1507_c",
      null,
      TEST_USER,
      50
    );

    await repointRelationshipObservations(entityB, entityA, TEST_USER);

    const { data: danglingEdges } = await db
      .from("relationship_observations")
      .select("id")
      .eq("user_id", TEST_USER)
      .or(`source_entity_id.eq.${entityB},target_entity_id.eq.${entityB}`);

    expect(danglingEdges ?? []).toHaveLength(0);
  });

  it("(c) duplicate relationship_keys are collapsed — no duplicate on survivor", async () => {
    const entityA = "ent_merge_A3_1507";
    const entityB = "ent_merge_B3_1507";
    const entityE = "ent_merge_E3_1507";

    // A already has A→E
    await createRelationshipObservations(
      [
        {
          relationship_type: "PART_OF",
          source_entity_id: entityA,
          target_entity_id: entityE,
          metadata: { note: "A→E existing" },
        },
      ],
      "src_1507_d",
      null,
      TEST_USER,
      50
    );

    // B also has B→E (same semantic edge, will collide after repoint)
    await createRelationshipObservations(
      [
        {
          relationship_type: "PART_OF",
          source_entity_id: entityB,
          target_entity_id: entityE,
          metadata: { note: "B→E duplicate" },
        },
      ],
      "src_1507_e",
      null,
      TEST_USER,
      50
    );

    await repointRelationshipObservations(entityB, entityA, TEST_USER);

    // There should be exactly one PART_OF:A:E row, not two
    const { data: edges } = await db
      .from("relationship_observations")
      .select("id, relationship_key")
      .eq("user_id", TEST_USER)
      .eq("relationship_key", `PART_OF:${entityA}:${entityE}`);

    expect((edges ?? []).length).toBe(1);
  });

  it("(d) self-loops produced by the repoint are dropped", async () => {
    const entityA = "ent_merge_A4_1507";
    const entityB = "ent_merge_B4_1507";

    // A→B exists; after merging B into A, source and target both become A → self-loop
    await createRelationshipObservations(
      [
        {
          relationship_type: "related_to",
          source_entity_id: entityA,
          target_entity_id: entityB,
          metadata: {},
        },
      ],
      "src_1507_f",
      null,
      TEST_USER,
      50
    );

    // Also B→A (the reverse); should also become a self-loop after repoint
    await createRelationshipObservations(
      [
        {
          relationship_type: "related_to",
          source_entity_id: entityB,
          target_entity_id: entityA,
          metadata: {},
        },
      ],
      "src_1507_g",
      null,
      TEST_USER,
      50
    );

    const repointed = await repointRelationshipObservations(entityB, entityA, TEST_USER);

    // Both rows produce self-loops (A→A), so repointed should be 0
    expect(repointed).toBe(0);

    // No related_to self-loop rows should exist
    const { data: selfLoops } = await db
      .from("relationship_observations")
      .select("id")
      .eq("user_id", TEST_USER)
      .eq("source_entity_id", entityA)
      .eq("target_entity_id", entityA);

    expect((selfLoops ?? []).length).toBe(0);
  });
});
