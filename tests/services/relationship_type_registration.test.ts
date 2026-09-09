/**
 * G25 / #1972 — relationship-type registration, the core capability.
 *
 * The defect: `relationship_type` is a CLOSED vocabulary. `validTypes` in
 * src/services/relationships.ts is the single enforcement point, and it is a
 * hardcoded 28-member Set. There is no primitive anywhere in `src/` that lets
 * a caller add a member, so a consumer needing an edge type the substrate does
 * not already know has exactly two options: bend an existing type into a shape
 * it does not mean, or simulate the edge as a field on an entity.
 *
 * This file is the fail-then-pass proof for the fix. Before the registration
 * primitive exists, `src/services/relationship_types/registry.js` cannot be
 * imported at all and `createRelationship` refuses every one of the thirteen
 * types the Ateles stage-1 cutover needs. After it exists, a type registers,
 * appears in the census, validates a write, reads back, deletes, and restores.
 *
 * A registered type with ZERO edges must appear in the census. That is the
 * distinction the pre-existing enumeration gets backwards: server.ts's
 * `SELECT DISTINCT relationship_type FROM relationship_snapshots` reports
 * types that HAVE edges, which is useless to a consumer discovering what it
 * may write BEFORE writing it.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { RelationshipsService } from "../../src/services/relationships.js";
import {
  relationshipTypeRegistry,
  RELATIONSHIP_TYPE_REGISTRY_TABLE,
} from "../../src/services/relationship_types/registry.js";
import { softDeleteRelationship, restoreRelationship } from "../../src/services/deletion.js";
import { generateEntityId } from "../../src/services/entity_resolution.js";

/** Distinct synthetic entity ids. Relationships do not FK to entity rows. */
let idCounter = 0;
const eid = (): string => generateEntityId("g25_test_node", `g25-${process.pid}-${idCounter++}`);

/**
 * The thirteen types Ateles stage 1 must register. Ten SCREAMING_SNAKE
 * (work-model edges), three lower_snake (authority-model edges). Both casings
 * are covered by construction — the existing 28 already mix them
 * (`PART_OF` and `part_of` are both members), so the naming rule must admit
 * both regardless.
 */
const STAGE_ONE_TYPES = [
  "LEASE",
  "ADDRESSED_BY",
  "FOLLOWS",
  "CLOSES",
  "SIGNED_BY",
  "PRODUCES",
  "CHECKPOINTS",
  "AWAITS",
  "RESOLVED_BY",
  "RAISED_BY",
  "principal_binding",
  "ownership_grant",
  "delegation_edge",
] as const;

const TEST_USER = "00000000-0000-0000-0000-0000000a2501";

const service = new RelationshipsService();

async function cleanup(): Promise<void> {
  for (const type of STAGE_ONE_TYPES) {
    await db.from(RELATIONSHIP_TYPE_REGISTRY_TABLE).delete().eq("relationship_type", type);
    await db.from("relationship_snapshots").delete().eq("relationship_type", type);
    await db.from("relationship_observations").delete().eq("relationship_type", type);
  }
}

describe("G25: relationship-type registration (#1972)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("refuses an unregistered type with a structured error naming the two new tools", async () => {
    await expect(
      service.createRelationship({
        relationship_type: "NOT_A_REGISTERED_TYPE",
        source_entity_id: eid(),
        target_entity_id: eid(),
        user_id: TEST_USER,
      })
    ).rejects.toThrow(/register_relationship_type/);
  });

  it("registers each of the thirteen and writes, reads, deletes, restores an edge of each", async () => {
    for (const relationshipType of STAGE_ONE_TYPES) {
      // 1. Registration.
      await relationshipTypeRegistry.register({
        relationship_type: relationshipType,
        description: `Ateles stage-1 edge: ${relationshipType}`,
        scope: "global",
        created_by: TEST_USER,
      });

      // 2. The census reports it — with ZERO edges written so far.
      const census = await relationshipTypeRegistry.list({ user_id: TEST_USER });
      expect(
        census.some((r) => r.relationship_type === relationshipType),
        `${relationshipType} missing from the registry census before any edge was written`
      ).toBe(true);

      // 3. The write now validates through the single enforcement point.
      const source = eid();
      const target = eid();
      const created = await service.createRelationship({
        relationship_type: relationshipType,
        source_entity_id: source,
        target_entity_id: target,
        user_id: TEST_USER,
      });
      expect(created.relationship_type).toBe(relationshipType);

      // 4. Read back, filtered by that type.
      const listed = await service.getRelationshipsByType(relationshipType, false, TEST_USER);
      expect(
        listed.some((r) => r.source_entity_id === source && r.target_entity_id === target),
        `${relationshipType} edge did not read back`
      ).toBe(true);

      // 5. Delete and restore — the headline bug of #1972 was that 20 of the
      //    28 types were advertised as undeletable.
      const key = `${relationshipType}:${source}:${target}`;
      await softDeleteRelationship(key, relationshipType, source, target, TEST_USER);
      const afterDelete = await service.getRelationshipsByType(relationshipType, false, TEST_USER);
      expect(
        afterDelete.some((r) => r.source_entity_id === source && r.target_entity_id === target),
        `${relationshipType} edge survived deletion`
      ).toBe(false);

      await restoreRelationship(key, relationshipType, source, target, TEST_USER);
      const afterRestore = await service.getRelationshipsByType(relationshipType, false, TEST_USER);
      expect(
        afterRestore.some((r) => r.source_entity_id === source && r.target_entity_id === target),
        `${relationshipType} did not restore`
      ).toBe(true);
    }
  });

  it("keeps the four canonical types working unchanged", async () => {
    for (const relationshipType of ["DEPENDS_ON", "PART_OF", "REFERS_TO", "DUPLICATE_OF"]) {
      const created = await service.createRelationship({
        relationship_type: relationshipType,
        source_entity_id: eid(),
        target_entity_id: eid(),
        user_id: TEST_USER,
      });
      expect(created.relationship_type).toBe(relationshipType);
    }
  });
});
