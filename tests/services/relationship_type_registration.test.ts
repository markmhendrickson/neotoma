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
import { NeotomaServer } from "../../src/server.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { BUILT_IN_RELATIONSHIP_TYPES } from "../../src/services/relationship_types/seed_registry.js";
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

  it("keeps every seeded type working unchanged", async () => {
    for (const { relationship_type: relationshipType } of BUILT_IN_RELATIONSHIP_TYPES) {
      const created = await service.createRelationship({
        relationship_type: relationshipType,
        source_entity_id: eid(),
        target_entity_id: eid(),
        user_id: TEST_USER,
      });
      expect(created.relationship_type).toBe(relationshipType);
      const listed = await service.getRelationshipsByType(relationshipType, false, TEST_USER);
      expect(listed.some((r) => r.relationship_key === created.relationship_key)).toBe(true);
      await softDeleteRelationship(
        created.relationship_key,
        relationshipType,
        created.source_entity_id,
        created.target_entity_id,
        TEST_USER
      );
      expect(
        (await service.getRelationshipsByType(relationshipType, false, TEST_USER)).some(
          (r) => r.relationship_key === created.relationship_key
        )
      ).toBe(false);
      await restoreRelationship(
        created.relationship_key,
        relationshipType,
        created.source_entity_id,
        created.target_entity_id,
        TEST_USER
      );
      expect(
        (await service.getRelationshipsByType(relationshipType, false, TEST_USER)).some(
          (r) => r.relationship_key === created.relationship_key
        )
      ).toBe(true);
    }
  });
  it("isolates user registrations and exposes global registrations to both users", async () => {
    const other = "00000000-0000-0000-0000-0000000a2503";
    await relationshipTypeRegistry.register({
      relationship_type: "g25_private",
      user_id: TEST_USER,
    });
    expect(await relationshipTypeRegistry.get("g25_private", TEST_USER)).not.toBeNull();
    expect(await relationshipTypeRegistry.get("g25_private", other)).toBeNull();
    await relationshipTypeRegistry.register({
      relationship_type: "knows",
      scope: "global",
      created_by: TEST_USER,
    });
    expect(await relationshipTypeRegistry.get("knows", TEST_USER)).not.toBeNull();
    expect(await relationshipTypeRegistry.get("knows", other)).not.toBeNull();
    expect(
      (
        await service.createRelationship({
          relationship_type: "knows",
          source_entity_id: eid(),
          target_entity_id: eid(),
          user_id: TEST_USER,
        })
      ).relationship_type
    ).toBe("knows");
  });

  it.each(["mcp", "rest"])(
    "stores all thirteen registered types through %s and refuses unknown types before persistence",
    async (surface) => {
      const server = new NeotomaServer();
      (server as any).authenticatedUserId = TEST_USER;
      const store = (entities: Record<string, unknown>[], relationships: any[], key: string) =>
        surface === "mcp"
          ? (server as any).store({ entities, relationships, idempotency_key: key })
          : storeStructuredForApi({
              userId: TEST_USER,
              entities,
              relationships,
              idempotencyKey: key,
              sourcePriority: 100,
            });
      for (const type of STAGE_ONE_TYPES) {
        const source = eid(),
          target = eid();
        await store(
          [{ entity_type: "task", title: `g25-${surface}-${type}` }],
          [{ relationship_type: type, source_entity_id: source, target_entity_id: target }],
          `g25-${process.pid}-${surface}-${type}`
        );
        expect(
          (await service.getRelationshipsByType(type, false, TEST_USER)).some(
            (r) => r.source_entity_id === source && r.target_entity_id === target
          )
        ).toBe(true);
      }
      const before = await db
        .from("entities")
        .select("id", { count: "exact", head: true })
        .eq("user_id", TEST_USER);
      expect(before.error).toBeNull();
      await expect(
        store(
          [{ entity_type: "task", title: `g25-refused-${surface}` }],
          [{ relationship_type: "G25_UNKNOWN_TYPE", source_index: 0, target_entity_id: eid() }],
          `g25-refused-${process.pid}-${surface}`
        )
      ).rejects.toMatchObject({
        code: "unregistered_relationship_type",
        hint: expect.stringContaining("list_relationship_types"),
      });
      const after = await db
        .from("entities")
        .select("id", { count: "exact", head: true })
        .eq("user_id", TEST_USER);
      expect(after.error).toBeNull();
      expect(after.count).toBe(before.count);
    }
  );

  it("registering the same type twice, moments apart, is idempotent: one row is ever effective (#2389 failure mode)", async () => {
    // #2389 (schema_registry.activate) let the same entity_type end up with
    // two simultaneously-active rows because the write path had no single
    // reduction rule at read time. This registry is append-only (see the
    // module doc on `register()`): a second call to `register()` for the same
    // (relationship_type, scope, user_id) key across two different
    // registry_version timestamps is a genuine second INSERT, not a no-op.
    // Idempotency here is a property of the READ side — `latestPerKey` in
    // `resolveAll()` collapses every row sharing that key to its single
    // latest winner — so it must hold regardless of how many times
    // registration is repeated.
    const type = "g25_idempotency_probe";
    await db
      .from(RELATIONSHIP_TYPE_REGISTRY_TABLE)
      .delete()
      .eq("relationship_type", type)
      .eq("user_id", TEST_USER);
    const first = await relationshipTypeRegistry.register({
      relationship_type: type,
      description: "first registration",
      user_id: TEST_USER,
      registry_version: "2026-01-01T00:00:00.000Z",
    });
    const second = await relationshipTypeRegistry.register({
      relationship_type: type,
      description: "second registration, same key",
      user_id: TEST_USER,
      registry_version: "2026-01-01T00:00:00.001Z",
    });
    const third = await relationshipTypeRegistry.register({
      relationship_type: type,
      description: "third registration, same key",
      user_id: TEST_USER,
      registry_version: "2026-01-01T00:00:00.002Z",
    });
    expect(first.relationship_type).toBe(type);
    expect(second.relationship_type).toBe(type);
    expect(third.relationship_type).toBe(type);

    // Three distinct rows really were inserted (append-only, not an upsert) —
    // this is the fact that makes the read-side assertion below meaningful
    // rather than trivially true.
    const rawRows = await db
      .from(RELATIONSHIP_TYPE_REGISTRY_TABLE)
      .select("id")
      .eq("relationship_type", type)
      .eq("user_id", TEST_USER);
    expect(rawRows.error).toBeNull();
    expect(rawRows.data?.length).toBe(3);

    // But exactly one is ever effective: the census shows the type once, with
    // the latest description, never three entries and never a dual-active
    // split between scopes.
    const census = await relationshipTypeRegistry.list({ user_id: TEST_USER });
    const matches = census.filter((r) => r.relationship_type === type);
    expect(matches.length).toBe(1);
    expect(matches[0].description).toBe("third registration, same key");

    // get() agrees with list() — no split between the two read paths.
    const got = await relationshipTypeRegistry.get(type, TEST_USER);
    expect(got?.description).toBe("third registration, same key");

    // And the write path (the actual consumer of "is this type valid")
    // resolves through the same single reduction, so repeated registration
    // never produces an ambiguous or doubly-charged validation outcome.
    const created = await service.createRelationship({
      relationship_type: type,
      source_entity_id: eid(),
      target_entity_id: eid(),
      user_id: TEST_USER,
    });
    expect(created.relationship_type).toBe(type);
  });

  it("a truly concurrent duplicate registration (same key AND same registry_version) is absorbed, not a 500", async () => {
    // The UNIQUE index (`idx_rel_type_registry_unique` in sqlite_client.ts)
    // is on (relationship_type, scope, user_id, registry_version). Two calls
    // that race into the same millisecond — the actual concurrent-request
    // shape #2389 was named for — collide against that constraint. The
    // registry must treat that collision as "already registered" and hand
    // back the existing row, never surface it as a write failure to the
    // caller who merely happened to register what was already there.
    const type = "g25_concurrent_probe";
    await db
      .from(RELATIONSHIP_TYPE_REGISTRY_TABLE)
      .delete()
      .eq("relationship_type", type)
      .eq("user_id", TEST_USER);
    const version = "2026-02-02T00:00:00.000Z";
    const first = await relationshipTypeRegistry.register({
      relationship_type: type,
      description: "concurrent registration",
      user_id: TEST_USER,
      registry_version: version,
    });
    const second = await relationshipTypeRegistry.register({
      relationship_type: type,
      description: "concurrent registration",
      user_id: TEST_USER,
      registry_version: version,
    });
    expect(first.relationship_type).toBe(type);
    expect(second.relationship_type).toBe(type);
    expect(second.registry_version).toBe(version);

    const rawRows = await db
      .from(RELATIONSHIP_TYPE_REGISTRY_TABLE)
      .select("id")
      .eq("relationship_type", type)
      .eq("user_id", TEST_USER);
    expect(rawRows.error).toBeNull();
    expect(rawRows.data?.length).toBe(1);
  });
});
