/**
 * Source, file-URL, relationship and collection reads are scoped to the
 * authenticated user.
 *
 * Companion to `mcp_resource_tenant_isolation.test.ts` (entity resources by
 * id) and `tenant_isolation_matrix.test.ts` (HTTP query endpoints). This file
 * covers the remaining MCP resource handlers (source by id, and every
 * collection resource), MCP `retrieve_file_url`, the related-entities block
 * of store responses, relationship creation, and the HTTP `/get_file_url`,
 * `/create_relationship` and `/health_check_snapshots` routes. It also covers
 * the write paths that must respect the same ownership rule: relationship and
 * entity restore (MCP and HTTP), and how `store` reports a relationship it
 * could not create.
 *
 * The contract under test: an item owned by another user is indistinguishable
 * from one that does not exist. So each "other user" case is paired with a
 * "missing id" case and asserts the two responses match, alongside an owner
 * case proving the read works at all. The other-user assertions fail against
 * the unscoped code, which is what makes them evidence rather than decoration.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { relationshipsService } from "../../src/services/relationships.js";
import {
  isEntityDeleted,
  restoreRelationship,
  softDeleteEntity,
  softDeleteRelationship,
} from "../../src/services/deletion.js";
import { config } from "../../src/config.js";

const PREFIX = "scoped_src_rel_test";
const PORT = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TIMELINE_YEAR = "2031";

interface Fixture {
  userId: string;
  entityId: string;
  otherEntityId: string;
  sourceId: string;
  storageUrl: string;
  referenceSourceId: string;
  relationshipKey: string;
  timelineEventId: string;
}

async function seed(label: string, userId: string = randomUUID()): Promise<Fixture> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entityId = `${PREFIX}_ent_${label}_${suffix}`;
  const otherEntityId = `${PREFIX}_ent2_${label}_${suffix}`;
  const sourceId = randomUUID();
  const referenceSourceId = randomUUID();
  const storageUrl = `${userId}/${PREFIX}_${label}_${suffix}`;
  const relationshipKey = `${PREFIX}_rel_${label}_${suffix}`;
  const timelineEventId = `${PREFIX}_tl_${label}_${suffix}`;

  await db.from("entities").insert([
    { id: entityId, user_id: userId, entity_type: "test", canonical_name: `${label} primary` },
    { id: otherEntityId, user_id: userId, entity_type: "test", canonical_name: `${label} other` },
  ]);
  await db.from("entity_snapshots").insert({
    entity_id: entityId,
    user_id: userId,
    entity_type: "test",
    schema_version: "1.0",
    snapshot: JSON.stringify({ marker: `${label}-only-value` }),
    provenance: JSON.stringify({}),
    observation_count: 1,
  });
  await db.from("sources").insert([
    {
      id: sourceId,
      user_id: userId,
      content_hash: `${PREFIX}_hash_${label}_${suffix}`,
      mime_type: "text/plain",
      storage_url: storageUrl,
      file_size: 3,
    },
    {
      id: referenceSourceId,
      user_id: userId,
      content_hash: `${PREFIX}_refhash_${label}_${suffix}`,
      mime_type: "text/plain",
      storage_url: `reference://${PREFIX}-host/${label}/${suffix}.txt`,
      storage_mode: "reference",
      reference_path: `/${PREFIX}/${label}/${suffix}.txt`,
      host_id: `${PREFIX}-host`,
      file_size: 3,
    },
  ]);
  await db.from("observations").insert({
    id: randomUUID(),
    entity_id: entityId,
    entity_type: "test",
    schema_version: "1.0",
    observed_at: new Date().toISOString(),
    source_priority: 0,
    source_id: sourceId,
    fields: { marker: `${label}-observation` },
    user_id: userId,
  });
  await db.from("relationship_snapshots").insert({
    relationship_key: relationshipKey,
    relationship_type: "REFERS_TO",
    source_entity_id: entityId,
    target_entity_id: otherEntityId,
    schema_version: "1",
    snapshot: JSON.stringify({}),
    user_id: userId,
  });
  await db.from("timeline_events").insert({
    id: timelineEventId,
    event_type: "test_event",
    event_timestamp: `${TIMELINE_YEAR}-03-15T00:00:00Z`,
    entity_id: entityId,
    source_id: sourceId,
    user_id: userId,
  });

  return {
    userId,
    entityId,
    otherEntityId,
    sourceId,
    storageUrl,
    referenceSourceId,
    relationshipKey,
    timelineEventId,
  };
}

async function cleanup(f: Fixture): Promise<void> {
  const ids = [f.entityId, f.otherEntityId];
  await db.from("timeline_events").delete().eq("id", f.timelineEventId);
  await db.from("relationship_observations").delete().in("source_entity_id", ids);
  await db.from("relationship_snapshots").delete().in("source_entity_id", ids);
  await db.from("relationship_snapshots").delete().in("target_entity_id", ids);
  await db.from("observations").delete().in("entity_id", ids);
  await db.from("entity_snapshots").delete().in("entity_id", ids);
  await db.from("entities").delete().in("id", ids);
  await db.from("sources").delete().in("id", [f.sourceId, f.referenceSourceId]);
  if (f.userId !== LOCAL_DEV_USER_ID) {
    // Random per-run users: also drop rows the handlers created for them.
    await db.from("relationship_observations").delete().eq("user_id", f.userId);
    await db.from("relationship_snapshots").delete().eq("user_id", f.userId);
    await db.from("sources").delete().eq("user_id", f.userId);
  }
}

/** Replace a specific id in an error message so two refusals can be compared. */
function normalize(message: string, id: string): string {
  return message.split(id).join("<id>");
}

/** Drop the per-response timestamp so two error bodies can be compared. */
function withoutTimestamp(body: Record<string, unknown>): Record<string, unknown> {
  const { timestamp: _timestamp, ...rest } = body ?? {};
  return rest;
}

async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the call to be refused, but it succeeded");
}

describe("scoped source, file-URL and relationship reads", () => {
  let server: NeotomaServer;
  let alice: Fixture;
  let bob: Fixture;
  const extraRelationshipKeys: string[] = [];

  const actAs = (userId: string) => {
    (server as any).authenticatedUserId = userId;
  };

  beforeAll(async () => {
    server = new NeotomaServer();
    alice = await seed("alice");
    bob = await seed("bob");
  });

  afterAll(async () => {
    if (extraRelationshipKeys.length > 0) {
      await db
        .from("relationship_snapshots")
        .delete()
        .in("relationship_key", extraRelationshipKeys);
    }
    await cleanup(alice);
    await cleanup(bob);
  });

  describe("MCP neotoma://source/{id}", () => {
    it("the owner reads their own source and its observations", async () => {
      actAs(alice.userId);
      const result = await (server as any).handleSource(alice.sourceId);
      expect(result.source_id).toBe(alice.sourceId);
      expect(result.observations.map((o: any) => o.entity_id)).toContain(alice.entityId);
    });

    it("another user's source is refused exactly like a missing one", async () => {
      actAs(bob.userId);
      const missingId = randomUUID();
      const foreign = await rejection((server as any).handleSource(alice.sourceId));
      const missing = await rejection((server as any).handleSource(missingId));
      expect(normalize(foreign.message, alice.sourceId)).toBe(
        normalize(missing.message, missingId)
      );
      expect((foreign as any).code).toBe((missing as any).code);
    });
  });

  describe("MCP neotoma://sources", () => {
    it("lists only the caller's sources", async () => {
      actAs(bob.userId);
      const result = await (server as any).handleSourceCollection({ limit: 1000 });
      const ids = result.sources.map((s: any) => s.id);
      expect(ids).toContain(bob.sourceId);
      expect(ids).not.toContain(alice.sourceId);
      expect(result.sources.every((s: any) => s.user_id === bob.userId)).toBe(true);
      expect(result.total).toBe(result.sources.length);
    });

    it("refuses a user_id parameter naming a different user", async () => {
      actAs(bob.userId);
      await expect(
        (server as any).handleSourceCollection({ user_id: alice.userId })
      ).rejects.toThrow(/does not match authenticated user/);
    });
  });

  describe("MCP collection resources", () => {
    it("neotoma://entities lists only the caller's entities", async () => {
      actAs(bob.userId);
      const result = await (server as any).handleEntityCollectionAll({ limit: 1000 });
      const ids = result.entities.map((e: any) => e.entity_id ?? e.id);
      expect(ids).toContain(bob.entityId);
      expect(ids).not.toContain(alice.entityId);
    });

    it("neotoma://entities/{type} lists only the caller's entities", async () => {
      actAs(bob.userId);
      const result = await (server as any).handleEntityCollection("test", { limit: 1000 });
      const ids = result.entities.map((e: any) => e.entity_id ?? e.id);
      expect(ids).toContain(bob.entityId);
      expect(ids).not.toContain(alice.entityId);
    });

    it("neotoma://entities refuses a user_id parameter naming a different user", async () => {
      actAs(bob.userId);
      await expect(
        (server as any).handleEntityCollectionAll({ user_id: alice.userId })
      ).rejects.toThrow(/does not match authenticated user/);
    });

    it("neotoma://relationships lists only the caller's relationships", async () => {
      actAs(bob.userId);
      const all = await (server as any).handleRelationshipCollectionAll({ limit: 1000 });
      const keys = all.relationships.map((r: any) => r.relationship_key);
      expect(keys).toContain(bob.relationshipKey);
      expect(keys).not.toContain(alice.relationshipKey);

      const typed = await (server as any).handleRelationshipCollection("REFERS_TO", {
        limit: 1000,
      });
      const typedKeys = typed.relationships.map((r: any) => r.relationship_key);
      expect(typedKeys).toContain(bob.relationshipKey);
      expect(typedKeys).not.toContain(alice.relationshipKey);
    });

    it("neotoma://timeline/{year} and /{year}-{month} list only the caller's events", async () => {
      actAs(bob.userId);
      const year = await (server as any).handleTimelineYear(TIMELINE_YEAR, { limit: 1000 });
      const yearIds = year.events.map((e: any) => e.id);
      expect(yearIds).toContain(bob.timelineEventId);
      expect(yearIds).not.toContain(alice.timelineEventId);

      const month = await (server as any).handleTimelineMonth(TIMELINE_YEAR, "03", {
        limit: 1000,
      });
      const monthIds = month.events.map((e: any) => e.id);
      expect(monthIds).toContain(bob.timelineEventId);
      expect(monthIds).not.toContain(alice.timelineEventId);
    });
  });

  describe("MCP retrieve_file_url", () => {
    const parse = (r: any) => JSON.parse(r.content[0].text);

    it("the owner gets a signed URL for their own source and storage path", async () => {
      actAs(alice.userId);
      const bySource = parse(await (server as any).retrieveFileUrl({ source_id: alice.sourceId }));
      expect(typeof bySource.signed_url).toBe("string");
      const byPath = parse(await (server as any).retrieveFileUrl({ file_path: alice.storageUrl }));
      expect(typeof byPath.signed_url).toBe("string");
    });

    it("the owner gets reference metadata for their own reference source", async () => {
      actAs(alice.userId);
      const result = parse(
        await (server as any).retrieveFileUrl({ source_id: alice.referenceSourceId })
      );
      // The file is not on disk, so the resolver reports it unavailable —
      // proving the owner's row was found.
      expect(result.error ?? result.storage_mode).toBeTruthy();
    });

    it("another user's source_id is refused exactly like a missing one", async () => {
      actAs(bob.userId);
      const missing = await rejection((server as any).retrieveFileUrl({ source_id: randomUUID() }));
      const foreign = await rejection(
        (server as any).retrieveFileUrl({ source_id: alice.sourceId })
      );
      expect(foreign.message).toBe(missing.message);
    });

    it("another user's reference source_id is refused exactly like a missing one", async () => {
      actAs(bob.userId);
      const missing = await rejection((server as any).retrieveFileUrl({ source_id: randomUUID() }));
      const foreign = await rejection(
        (server as any).retrieveFileUrl({ source_id: alice.referenceSourceId })
      );
      expect(foreign.message).toBe(missing.message);
    });

    it("another user's storage path is refused exactly like a nonexistent one", async () => {
      actAs(bob.userId);
      const missing = await rejection(
        (server as any).retrieveFileUrl({ file_path: `${randomUUID()}/${PREFIX}_nothing` })
      );
      const foreign = await rejection(
        (server as any).retrieveFileUrl({ file_path: alice.storageUrl })
      );
      expect(foreign.message).toBe(missing.message);
    });
  });

  describe("store response related entities", () => {
    it("omits another user's entity reached through a relationship row", async () => {
      // A relationship row owned by bob that points at alice's entity (as
      // could exist from before relationship targets were checked), and one
      // owned by alice that points at bob's entity.
      const bobToAlice = `${PREFIX}_rel_b2a_${randomUUID().slice(0, 8)}`;
      const aliceToBob = `${PREFIX}_rel_a2b_${randomUUID().slice(0, 8)}`;
      extraRelationshipKeys.push(bobToAlice, aliceToBob);
      await db.from("relationship_snapshots").insert([
        {
          relationship_key: bobToAlice,
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: alice.entityId,
          schema_version: "1",
          snapshot: JSON.stringify({}),
          user_id: bob.userId,
        },
        {
          relationship_key: aliceToBob,
          relationship_type: "REFERS_TO",
          source_entity_id: alice.otherEntityId,
          target_entity_id: bob.entityId,
          schema_version: "1",
          snapshot: JSON.stringify({}),
          user_id: alice.userId,
        },
      ]);

      const related = await (server as any).getRelatedEntitiesAndRelationships(
        [bob.entityId],
        bob.userId
      );
      const entityIds = related.entities.map((e: any) => e.id);
      const keys = related.relationships.map((r: any) => r.relationship_key);

      // bob's own edge to his own entity is still returned
      expect(keys).toContain(bob.relationshipKey);
      expect(entityIds).toContain(bob.otherEntityId);
      // alice's entity and snapshot look exactly like a missing target: absent
      expect(entityIds).not.toContain(alice.entityId);
      expect(JSON.stringify(related.entities)).not.toContain("alice-only-value");
      // alice's edge onto bob's entity is not returned to bob
      expect(keys).not.toContain(aliceToBob);
    });
  });

  describe("MCP create_relationship", () => {
    it("links two of the caller's own entities", async () => {
      actAs(bob.userId);
      const result = await (server as any).createRelationship({
        relationship_type: "REFERS_TO",
        source_entity_id: bob.otherEntityId,
        target_entity_id: bob.entityId,
      });
      const snapshot = JSON.parse(result.content[0].text);
      expect(snapshot.target_entity_id).toBe(bob.entityId);
    });

    it("refuses another user's target exactly like a missing one", async () => {
      actAs(bob.userId);
      const missingId = `${PREFIX}_missing_${randomUUID().slice(0, 8)}`;
      // The MCP handler keys its per-call source on Date.now(); keep calls
      // in distinct milliseconds.
      await new Promise((r) => setTimeout(r, 5));
      const missing = await rejection(
        (server as any).createRelationship({
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: missingId,
        })
      );
      await new Promise((r) => setTimeout(r, 5));
      const foreign = await rejection(
        (server as any).createRelationship({
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: alice.entityId,
        })
      );
      expect(normalize(foreign.message, alice.entityId)).toBe(
        normalize(missing.message, missingId)
      );
      expect((foreign as any).code).toBe((missing as any).code);

      // No edge was written for the refused call.
      const { data: rows } = await db
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", `REFERS_TO:${bob.entityId}:${alice.entityId}`)
        .eq("user_id", bob.userId);
      expect(rows ?? []).toEqual([]);
    });

    it("refuses another user's source endpoint too", async () => {
      actAs(bob.userId);
      await new Promise((r) => setTimeout(r, 5));
      await expect(
        (server as any).createRelationship({
          relationship_type: "REFERS_TO",
          source_entity_id: alice.entityId,
          target_entity_id: bob.entityId,
        })
      ).rejects.toThrow(/Entity not found/);
    });
  });

  describe("relationship restore", () => {
    let aliceKey: string;

    beforeAll(async () => {
      // alice links two of her own entities, then deletes the link.
      const created = await relationshipsService.createRelationship({
        relationship_type: "REFERS_TO",
        source_entity_id: alice.entityId,
        target_entity_id: alice.otherEntityId,
        user_id: alice.userId,
      });
      aliceKey = created.relationship_key;
      extraRelationshipKeys.push(aliceKey);
      const deleted = await softDeleteRelationship(
        aliceKey,
        "REFERS_TO",
        alice.entityId,
        alice.otherEntityId,
        alice.userId
      );
      expect(deleted.success).toBe(true);
    });

    async function bobObservationsFor(key: string) {
      const { data } = await db
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", key)
        .eq("user_id", bob.userId);
      return data ?? [];
    }

    it("refuses another user's relationship, and a never-held one, exactly like a missing one", async () => {
      actAs(bob.userId);
      const missingId = `${PREFIX}_missing_${randomUUID().slice(0, 8)}`;
      const attempts = {
        // bob's own two entities, but no relationship between them was ever held
        neverHeld: {
          relationship_type: "PART_OF",
          source_entity_id: bob.entityId,
          target_entity_id: bob.otherEntityId,
        },
        // an endpoint that does not exist
        missingEndpoint: {
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: missingId,
        },
        // alice's deleted relationship
        foreignRelationship: {
          relationship_type: "REFERS_TO",
          source_entity_id: alice.entityId,
          target_entity_id: alice.otherEntityId,
        },
        // a new edge from bob's entity to alice's entity
        foreignTarget: {
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: alice.entityId,
        },
      };

      const refusals: Record<string, Error> = {};
      for (const [name, args] of Object.entries(attempts)) {
        refusals[name] = await rejection((server as any).restoreRelationship(args));
      }
      const reference = refusals.neverHeld;
      for (const name of Object.keys(attempts)) {
        expect(refusals[name].message, name).toBe(reference.message);
        expect((refusals[name] as any).code, name).toBe((reference as any).code);
        expect((refusals[name] as any).data, name).toEqual((reference as any).data);
      }

      // Nothing was written under bob for any of them.
      for (const args of Object.values(attempts)) {
        const key = `${args.relationship_type}:${args.source_entity_id}:${args.target_entity_id}`;
        expect(await bobObservationsFor(key), key).toEqual([]);
      }
      // alice's relationship is still deleted.
      const { data: aliceSnapshot } = await db
        .from("relationship_snapshots")
        .select("user_id, is_live")
        .eq("relationship_key", aliceKey)
        .maybeSingle();
      expect(aliceSnapshot?.user_id).toBe(alice.userId);
      expect(Number(aliceSnapshot?.is_live)).toBe(0);
    });

    it("refuses a relationship type that is not registered", async () => {
      const type = `UNREGISTERED_${randomUUID().slice(0, 8).toUpperCase()}`;
      await expect(
        restoreRelationship(
          `${type}:${bob.entityId}:${bob.otherEntityId}`,
          type,
          bob.entityId,
          bob.otherEntityId,
          bob.userId
        )
      ).rejects.toThrow(/register_relationship_type/);
      expect(await bobObservationsFor(`${type}:${bob.entityId}:${bob.otherEntityId}`)).toEqual([]);
    });

    it("the owner restores their own deleted relationship", async () => {
      actAs(alice.userId);
      const result = JSON.parse(
        (
          await (server as any).restoreRelationship({
            relationship_type: "REFERS_TO",
            source_entity_id: alice.entityId,
            target_entity_id: alice.otherEntityId,
          })
        ).content[0].text
      );
      expect(result.success).toBe(true);
      const { data: snapshot } = await db
        .from("relationship_snapshots")
        .select("is_live")
        .eq("relationship_key", aliceKey)
        .maybeSingle();
      expect(Number(snapshot?.is_live)).toBe(1);
    });
  });

  describe("entity restore", () => {
    let aliceDeletedEntity: string;

    beforeAll(async () => {
      aliceDeletedEntity = `${PREFIX}_ent3_alice_${randomUUID().slice(0, 8)}`;
      await db.from("entities").insert({
        id: aliceDeletedEntity,
        user_id: alice.userId,
        entity_type: "test",
        canonical_name: "alice restorable",
      });
      const deleted = await softDeleteEntity(aliceDeletedEntity, "test", alice.userId);
      expect(deleted.success).toBe(true);
    });

    afterAll(async () => {
      await db.from("observations").delete().eq("entity_id", aliceDeletedEntity);
      await db.from("entity_snapshots").delete().eq("entity_id", aliceDeletedEntity);
      await db.from("entities").delete().eq("id", aliceDeletedEntity);
    });

    it("refuses another user's entity exactly like a missing one", async () => {
      actAs(bob.userId);
      const missingId = `${PREFIX}_missing_${randomUUID().slice(0, 8)}`;
      const missing = await rejection(
        (server as any).restoreEntity({ entity_id: missingId, entity_type: "test" })
      );
      const foreign = await rejection(
        (server as any).restoreEntity({ entity_id: aliceDeletedEntity, entity_type: "test" })
      );
      expect(normalize(foreign.message, aliceDeletedEntity)).toBe(
        normalize(missing.message, missingId)
      );
      expect((foreign as any).code).toBe((missing as any).code);

      const { data: bobRows } = await db
        .from("observations")
        .select("id")
        .eq("entity_id", aliceDeletedEntity)
        .eq("user_id", bob.userId);
      expect(bobRows ?? []).toEqual([]);
      expect(await isEntityDeleted(aliceDeletedEntity, alice.userId)).toBe(true);
    });

    it("the owner restores their own deleted entity", async () => {
      actAs(alice.userId);
      const result = JSON.parse(
        (
          await (server as any).restoreEntity({
            entity_id: aliceDeletedEntity,
            entity_type: "test",
          })
        ).content[0].text
      );
      expect(result.success).toBe(true);
      expect(await isEntityDeleted(aliceDeletedEntity, alice.userId)).toBe(false);
    });
  });

  describe("MCP store relationship reporting", () => {
    const parse = (r: any) => JSON.parse(r.content[0].text);
    const noteType = `${PREFIX}_note`;
    // store validates relationship endpoint ids as entity ids (ent_ + 24 hex).
    const entId = () => `ent_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const aliceEnt = entId();
    const bobEnt = entId();

    beforeAll(async () => {
      await db.from("entities").insert([
        { id: aliceEnt, user_id: alice.userId, entity_type: "test", canonical_name: "alice ent" },
        { id: bobEnt, user_id: bob.userId, entity_type: "test", canonical_name: "bob ent" },
      ]);
    });

    afterAll(async () => {
      await db
        .from("relationship_observations")
        .delete()
        .in("target_entity_id", [aliceEnt, bobEnt]);
      await db.from("relationship_snapshots").delete().in("target_entity_id", [aliceEnt, bobEnt]);
      await db.from("entities").delete().in("id", [aliceEnt, bobEnt]);
      const { data: rows } = await db
        .from("observations")
        .select("entity_id, interpretation_id")
        .eq("user_id", bob.userId)
        .eq("entity_type", noteType);
      const entityIds = Array.from(new Set((rows ?? []).map((r: any) => r.entity_id)));
      const interpretationIds = Array.from(
        new Set((rows ?? []).map((r: any) => r.interpretation_id).filter(Boolean))
      );
      if (entityIds.length > 0) {
        await db.from("relationship_observations").delete().in("source_entity_id", entityIds);
        await db.from("relationship_snapshots").delete().in("source_entity_id", entityIds);
        await db.from("timeline_events").delete().in("entity_id", entityIds);
        await db.from("observations").delete().in("entity_id", entityIds);
        await db.from("entity_snapshots").delete().in("entity_id", entityIds);
        await db.from("entities").delete().in("id", entityIds);
      }
      if (interpretationIds.length > 0) {
        await db.from("interpretations").delete().in("id", interpretationIds);
      }
    });

    it("reports created and refused relationships, with the same refusal for another user's entity and a missing one", async () => {
      actAs(bob.userId);
      const missingId = entId();
      const response = parse(
        await (server as any).store({
          idempotency_key: `${PREFIX}_store_${randomUUID()}`,
          entities: [{ entity_type: noteType, title: `note ${randomUUID()}` }],
          relationships: [
            { relationship_type: "REFERS_TO", source_index: 0, target_entity_id: bobEnt },
            { relationship_type: "REFERS_TO", source_index: 0, target_entity_id: aliceEnt },
            { relationship_type: "REFERS_TO", source_index: 0, target_entity_id: missingId },
          ],
        })
      );
      const noteId = response.entities[0].entity_id;

      expect(response.relationships_created).toEqual([
        {
          relationship_type: "REFERS_TO",
          source_entity_id: noteId,
          target_entity_id: bobEnt,
        },
      ]);
      const refused = response.relationships_refused;
      expect(refused.map((r: any) => r.relationship_index)).toEqual([1, 2]);
      const [foreign, missing] = refused;
      expect(foreign.code).toBe("RELATIONSHIP_ENDPOINT_NOT_FOUND");
      expect(foreign.reason).toMatch(/not found or not accessible/);
      const { relationship_index: _fi, target_entity_id: _ft, ...foreignRest } = foreign;
      const { relationship_index: _mi, target_entity_id: _mt, ...missingRest } = missing;
      expect(foreignRest).toEqual(missingRest);
      expect(JSON.stringify(response)).not.toContain("alice-only-value");
    });

    it("interpretation store with a refused relationship still stores the entity and the other relationships", async () => {
      actAs(bob.userId);
      const response = parse(
        await (server as any).store({
          idempotency_key: `${PREFIX}_interp_${randomUUID()}`,
          entities: [{ entity_type: noteType, title: `interpreted ${randomUUID()}` }],
          interpretation: { source_id: bob.sourceId },
          relationships: [
            { relationship_type: "REFERS_TO", source_index: 0, target_entity_id: aliceEnt },
            { relationship_type: "REFERS_TO", source_index: 0, target_entity_id: bobEnt },
          ],
        })
      );
      expect(response.interpretation_id).toBeTruthy();
      expect(response.entities).toHaveLength(1);
      const noteId = response.entities[0].entity_id;

      expect(response.relationships_created).toEqual([
        {
          relationship_type: "REFERS_TO",
          source_entity_id: noteId,
          target_entity_id: bobEnt,
        },
      ]);
      expect(response.relationships_refused).toHaveLength(1);
      expect(response.relationships_refused[0]).toMatchObject({
        relationship_index: 0,
        code: "RELATIONSHIP_ENDPOINT_NOT_FOUND",
      });

      const { data: written } = await db
        .from("relationship_observations")
        .select("target_entity_id")
        .eq("source_entity_id", noteId)
        .eq("user_id", bob.userId);
      expect((written ?? []).map((r: any) => r.target_entity_id)).toEqual([bobEnt]);
    });
  });

  describe("MCP retrieve_file_url signs the matched source", () => {
    it("ignores a caller-chosen first path segment and signs the stored location", async () => {
      actAs(bob.userId);
      const result = JSON.parse(
        (
          await (server as any).retrieveFileUrl({
            file_path: `${PREFIX}_other_bucket/${bob.storageUrl}`,
          })
        ).content[0].text
      );
      const path = await import("node:path");
      expect(result.signed_url).toBe(
        `file://${path.resolve(config.rawStorageDir, bob.storageUrl)}`
      );
      expect(result.signed_url).not.toContain(`${PREFIX}_other_bucket`);
    });
  });

  describe("HTTP", () => {
    let devUser: Fixture;

    beforeAll(async () => {
      // The test server authenticates unauthenticated local requests as the
      // local dev user, so routes without a user_id parameter act as that user.
      devUser = await seed("dev", LOCAL_DEV_USER_ID);
    });
    afterAll(async () => {
      await cleanup(devUser);
    });

    async function post(path: string, body: Record<string, unknown>) {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
    }
    async function get(path: string, query: Record<string, string>) {
      const qs = new URLSearchParams(query).toString();
      const res = await fetch(`${BASE_URL}${path}?${qs}`, {
        headers: { Accept: "application/json" },
      });
      return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
    }

    describe("/get_file_url", () => {
      it("signs the caller's own storage path", async () => {
        const { status, json } = await get("/get_file_url", { file_path: devUser.storageUrl });
        expect(status).toBe(200);
        expect(typeof json.url).toBe("string");
      });

      it("answers another user's storage path exactly like a nonexistent one", async () => {
        const missing = await get("/get_file_url", {
          file_path: `${randomUUID()}/${PREFIX}_nothing`,
        });
        const foreign = await get("/get_file_url", { file_path: alice.storageUrl });
        expect(foreign.status).toBe(404);
        expect(foreign.status).toBe(missing.status);
        expect(withoutTimestamp(foreign.json)).toEqual(withoutTimestamp(missing.json));
      });
    });

    describe("/create_relationship", () => {
      it("links two of the caller's own entities", async () => {
        const { status, json } = await post("/create_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: bob.otherEntityId,
          user_id: bob.userId,
        });
        expect(status).toBe(200);
        expect(json.target_entity_id).toBe(bob.otherEntityId);
      });

      it("refuses another user's target exactly like a missing one", async () => {
        const missingId = `${PREFIX}_missing_${randomUUID().slice(0, 8)}`;
        const missing = await post("/create_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: missingId,
          user_id: bob.userId,
        });
        const foreign = await post("/create_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: alice.entityId,
          user_id: bob.userId,
        });
        expect(foreign.status).toBe(404);
        expect(foreign.status).toBe(missing.status);
        expect(normalize(JSON.stringify(withoutTimestamp(foreign.json)), alice.entityId)).toBe(
          normalize(JSON.stringify(withoutTimestamp(missing.json)), missingId)
        );
      });
    });

    describe("/restore_relationship and /restore_entity", () => {
      it("answers another user's relationship exactly like a missing one", async () => {
        const deletedKey = `REFERS_TO:${alice.otherEntityId}:${alice.entityId}`;
        await relationshipsService.createRelationship({
          relationship_type: "REFERS_TO",
          source_entity_id: alice.otherEntityId,
          target_entity_id: alice.entityId,
          user_id: alice.userId,
        });
        extraRelationshipKeys.push(deletedKey);
        await softDeleteRelationship(
          deletedKey,
          "REFERS_TO",
          alice.otherEntityId,
          alice.entityId,
          alice.userId
        );

        const missing = await post("/restore_relationship", {
          relationship_type: "PART_OF",
          source_entity_id: bob.entityId,
          target_entity_id: bob.otherEntityId,
          user_id: bob.userId,
        });
        const foreign = await post("/restore_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: alice.otherEntityId,
          target_entity_id: alice.entityId,
          user_id: bob.userId,
        });
        const foreignTarget = await post("/restore_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: bob.entityId,
          target_entity_id: alice.entityId,
          user_id: bob.userId,
        });
        expect(missing.status).toBe(404);
        for (const other of [foreign, foreignTarget]) {
          expect(other.status).toBe(missing.status);
          expect(withoutTimestamp(other.json)).toEqual(withoutTimestamp(missing.json));
        }
        const { data: bobRows } = await db
          .from("relationship_observations")
          .select("id")
          .in("relationship_key", [deletedKey, `REFERS_TO:${bob.entityId}:${alice.entityId}`])
          .eq("user_id", bob.userId);
        expect(bobRows ?? []).toEqual([]);
      });

      it("answers another user's entity exactly like a missing one", async () => {
        const entityId = `${PREFIX}_ent4_alice_${randomUUID().slice(0, 8)}`;
        await db.from("entities").insert({
          id: entityId,
          user_id: alice.userId,
          entity_type: "test",
          canonical_name: "alice http restorable",
        });
        try {
          await softDeleteEntity(entityId, "test", alice.userId);
          const missingId = `${PREFIX}_missing_${randomUUID().slice(0, 8)}`;
          const missing = await post("/restore_entity", {
            entity_id: missingId,
            entity_type: "test",
            user_id: bob.userId,
          });
          const foreign = await post("/restore_entity", {
            entity_id: entityId,
            entity_type: "test",
            user_id: bob.userId,
          });
          expect(foreign.status).toBe(404);
          expect(foreign.status).toBe(missing.status);
          expect(withoutTimestamp(foreign.json)).toEqual(withoutTimestamp(missing.json));
          expect(await isEntityDeleted(entityId, alice.userId)).toBe(true);
        } finally {
          await db.from("observations").delete().eq("entity_id", entityId);
          await db.from("entity_snapshots").delete().eq("entity_id", entityId);
          await db.from("entities").delete().eq("id", entityId);
        }
      });
    });

    describe("/get_file_url signs the matched source", () => {
      it("ignores a caller-chosen first path segment", async () => {
        const { status, json } = await get("/get_file_url", {
          file_path: `${PREFIX}_other_bucket/${devUser.storageUrl}`,
        });
        expect(status).toBe(200);
        expect(json.url).not.toContain(`${PREFIX}_other_bucket`);
        expect(String(json.url).endsWith(`/${devUser.storageUrl}`)).toBe(true);
      });
    });

    describe("/health_check_snapshots", () => {
      let aliceStale: string;
      let devStale: string;

      beforeAll(async () => {
        // A stale snapshot (observation_count 0 while observations exist) for
        // alice and one for the local dev user.
        aliceStale = alice.otherEntityId;
        devStale = devUser.otherEntityId;
        for (const [entityId, userId] of [
          [aliceStale, alice.userId],
          [devStale, LOCAL_DEV_USER_ID],
        ]) {
          await db.from("observations").insert({
            id: randomUUID(),
            entity_id: entityId,
            entity_type: "test",
            schema_version: "1.0",
            observed_at: new Date().toISOString(),
            source_priority: 0,
            fields: { marker: "stale" },
            user_id: userId,
          });
          // Writing the observation materializes a snapshot; zero its count
          // afterwards so the snapshot reads as stale.
          const { data: existing } = await db
            .from("entity_snapshots")
            .select("entity_id")
            .eq("entity_id", entityId);
          if ((existing ?? []).length > 0) {
            await db
              .from("entity_snapshots")
              .update({ observation_count: 0 })
              .eq("entity_id", entityId);
          } else {
            await db.from("entity_snapshots").insert({
              entity_id: entityId,
              user_id: userId,
              entity_type: "test",
              schema_version: "1.0",
              snapshot: JSON.stringify({}),
              provenance: JSON.stringify({}),
              observation_count: 0,
            });
          }
        }
      });

      it("reports only the caller's stale snapshots", async () => {
        const { status, json } = await post("/health_check_snapshots", { auto_fix: false });
        expect(status).toBe(200);
        const ids = (json.stale_snapshots ?? []).map((s: any) => s.entity_id);
        expect(ids).toContain(devStale);
        expect(ids).not.toContain(aliceStale);
      });
    });
  });
});
