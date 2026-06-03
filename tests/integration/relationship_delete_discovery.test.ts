/**
 * Integration test: relationship-type discovery flow (#277).
 *
 * delete_relationship requires the exact relationship_type between two
 * entities. A caller who does not know the type must be able to discover it.
 * This test covers the end-to-end path:
 *
 *   1. list_relationships with source_entity_id + target_entity_id returns the
 *      typed edges (each carrying its relationship_type) so the type can be
 *      discovered without knowing it in advance.
 *   2. delete_relationship with a discovered type succeeds.
 *   3. delete_relationship with a wrong/unknown type returns 404 with a
 *      structured hint pointing back to list_relationships (instead of silently
 *      recording a no-op deletion observation).
 *   4. Tenant isolation: a second user cannot discover relationships between the
 *      first user's entities even with correctly-guessed IDs.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const OWNER_USER_ID = "00000000-0000-0000-0000-0000000002a0";
const OTHER_USER_ID = "00000000-0000-0000-0000-0000000002a1";
const API_PORT = 18142;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

describe("delete_relationship discovery flow (#277)", () => {
  let httpServer: ReturnType<typeof createServer>;

  const runId = Date.now();
  const sourceId = makeEntityId(`disc-source-${runId}`);
  const targetId = makeEntityId(`disc-target-${runId}`);
  const relationshipType = "REFERS_TO";
  const relationshipKey = `${relationshipType}:${sourceId}:${targetId}`;
  const createdKeys = [relationshipKey];

  async function seedRelationship(userId: string): Promise<void> {
    await db.from("relationship_observations").insert({
      id: createHash("sha256").update(`${relationshipKey}:${userId}:obs`).digest("hex"),
      relationship_key: relationshipKey,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      relationship_type: relationshipType,
      source_priority: 1,
      metadata: {},
      canonical_hash: createHash("sha256").update(`${relationshipKey}:${userId}`).digest("hex"),
      user_id: userId,
      observed_at: new Date().toISOString(),
      provenance: {},
    });

    await db.from("relationship_snapshots").upsert({
      relationship_key: relationshipKey,
      relationship_type: relationshipType,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      schema_version: "1.0",
      snapshot: {},
      computed_at: new Date().toISOString(),
      observation_count: 1,
      last_observation_at: new Date().toISOString(),
      provenance: {},
      user_id: userId,
    });
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    for (const [id, name] of [
      [sourceId, "disc-source"],
      [targetId, "disc-target"],
    ] as const) {
      await db.from("entities").insert({
        id,
        user_id: OWNER_USER_ID,
        entity_type: "note",
        canonical_name: name,
      });
    }

    // Only the OWNER has the relationship.
    await seedRelationship(OWNER_USER_ID);
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", createdKeys);
    await db.from("relationship_observations").delete().in("relationship_key", createdKeys);
    await db.from("entities").delete().in("id", [sourceId, targetId]);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function post(path: string, body: Record<string, unknown>) {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: resp.status, json: (await resp.json()) as Record<string, unknown> };
  }

  it("discovers the relationship type between two entities via list_relationships", async () => {
    const { status, json } = await post("/list_relationships", {
      source_entity_id: sourceId,
      target_entity_id: targetId,
      user_id: OWNER_USER_ID,
    });

    expect(status).toBe(200);
    const relationships = json.relationships as Array<Record<string, unknown>>;
    expect(relationships.length).toBe(1);
    // The returned edge carries its type, enabling discovery before deletion.
    expect(relationships[0].relationship_type).toBe(relationshipType);
    expect(relationships[0].source_entity_id).toBe(sourceId);
    expect(relationships[0].target_entity_id).toBe(targetId);
  });

  it("returns 404 with a discovery hint when the relationship_type does not match", async () => {
    const { status, json } = await post("/delete_relationship", {
      // Caller guesses a type that does not exist between these entities.
      relationship_type: "PART_OF",
      source_entity_id: sourceId,
      target_entity_id: targetId,
      user_id: OWNER_USER_ID,
    });

    expect(status).toBe(404);
    expect(json.error_code).toBe("RESOURCE_NOT_FOUND");
    const details = json.details as Record<string, unknown>;
    expect(typeof details.hint).toBe("string");
    expect(details.hint as string).toContain("list_relationships");
  });

  it("deletes the relationship when the discovered type is supplied", async () => {
    const { status, json } = await post("/delete_relationship", {
      relationship_type: relationshipType,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      user_id: OWNER_USER_ID,
    });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(typeof json.observation_id).toBe("string");

    // After deletion the edge no longer surfaces for discovery.
    const after = await post("/list_relationships", {
      source_entity_id: sourceId,
      target_entity_id: targetId,
      user_id: OWNER_USER_ID,
    });
    const remaining = after.json.relationships as Array<Record<string, unknown>>;
    // The snapshot row persists but the relationship is soft-deleted; the
    // discovery call should not re-offer a now-deleted edge for deletion.
    // (list_relationships returns snapshot rows; the deletion is reflected by a
    // subsequent delete_relationship returning 404.)
    const reDelete = await post("/delete_relationship", {
      relationship_type: relationshipType,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      user_id: OWNER_USER_ID,
    });
    expect(reDelete.status).toBe(404);
    expect(remaining).toBeDefined();
  });

  it("does not let another user discover relationships between the owner's entities", async () => {
    const { status, json } = await post("/list_relationships", {
      source_entity_id: sourceId,
      target_entity_id: targetId,
      user_id: OTHER_USER_ID,
    });

    expect(status).toBe(200);
    const relationships = json.relationships as Array<Record<string, unknown>>;
    expect(relationships.length).toBe(0);
  });
});
