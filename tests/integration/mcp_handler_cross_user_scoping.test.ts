/**
 * MCP handler cross-user scoping (PR #1795 — the actual attack surface).
 *
 * Companion to tests/security/cross_user_read_scoping.test.ts (which tests the
 * exported data-layer functions). This file drives the MCP tool handlers
 * directly — the surface a connected agent actually reaches — and asserts that a
 * caller authenticated as user A cannot read user B's data through:
 *   retrieve_entity_snapshot, list_timeline_events, get_relationship_snapshot,
 *   health_check_snapshots, list_entity_types.
 *
 * Harness mirrors tests/integration/mcp_get_entity_type_counts.test.ts:
 * construct a server, set `authenticatedUserId`, call the (private) handler via
 * a cast. Data is seeded directly via `db` (deterministic, two fresh user_ids).
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const PFX = "mcp_xuser_test";

describe("MCP handler cross-user scoping", () => {
  let server: NeotomaServer;
  const userA = randomUUID();
  const userB = randomUUID();

  const aEntityId = `${PFX}_a_${randomUUID().slice(0, 8)}`;
  const bEntityId = `${PFX}_b_${randomUUID().slice(0, 8)}`;
  const bEntityId2 = `${PFX}_b2_${randomUUID().slice(0, 8)}`;
  const bStaleEntityId = `${PFX}_bstale_${randomUUID().slice(0, 8)}`;
  const bStaleObsId = randomUUID();
  const bTimelineId = `${PFX}_tl_${randomUUID()}`;
  const bRelKey = `REFERS_TO:${bEntityId}:${bEntityId2}`;
  const bPrivateType = `${PFX}_type_${randomUUID().slice(0, 8)}`;

  const asUser = (u: string) => {
    (server as any).authenticatedUserId = u;
  };

  async function seedEntityWithSnapshot(entityId: string, userId: string): Promise<void> {
    await db.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "test",
      canonical_name: entityId,
    });
    await db.from("entity_snapshots").insert({
      entity_id: entityId,
      entity_type: "test",
      schema_version: "1.0",
      canonical_name: entityId,
      snapshot: JSON.stringify({ canonical_name: entityId }),
      observation_count: 1,
      user_id: userId,
      computed_at: new Date().toISOString(),
    });
  }

  beforeAll(async () => {
    server = new NeotomaServer();

    await seedEntityWithSnapshot(aEntityId, userA);
    await seedEntityWithSnapshot(bEntityId, userB);
    await seedEntityWithSnapshot(bEntityId2, userB);

    await db.from("timeline_events").insert({
      id: bTimelineId,
      event_type: `${PFX}_event`,
      event_timestamp: new Date().toISOString(),
      user_id: userB,
    });

    await db.from("relationship_snapshots").insert({
      relationship_key: bRelKey,
      relationship_type: "REFERS_TO",
      source_entity_id: bEntityId,
      target_entity_id: bEntityId2,
      schema_version: "1",
      snapshot: JSON.stringify({}),
      user_id: userB,
    });

    // "Stale" snapshot for the health check: observation_count=0 but an
    // observation exists, so health_check_snapshots flags it — for its owner only.
    await db.from("entity_snapshots").insert({
      entity_id: bStaleEntityId,
      entity_type: "test",
      schema_version: "1.0",
      canonical_name: bStaleEntityId,
      snapshot: JSON.stringify({}),
      observation_count: 0,
      user_id: userB,
      computed_at: new Date().toISOString(),
    });
    await db.from("observations").insert({
      id: bStaleObsId,
      entity_id: bStaleEntityId,
      entity_type: "test",
      schema_version: "1.0",
      observed_at: new Date().toISOString(),
      source_priority: 0,
      fields: { marker: `${PFX}_stale` },
      user_id: userB,
    });
    // Force the exact drift the health check looks for — snapshot reports zero
    // observations while an observation row exists — in case inserting the
    // observation (re)computed the snapshot's observation_count.
    await db
      .from("entity_snapshots")
      .update({ observation_count: 0 })
      .eq("entity_id", bStaleEntityId);

    await db.from("schema_registry").insert({
      id: randomUUID(),
      entity_type: bPrivateType,
      schema_version: "1.0.0",
      schema_definition: JSON.stringify({
        entity_type: bPrivateType,
        schema_version: "1.0.0",
        fields: {},
      }),
      reducer_config: JSON.stringify({}),
      active: 1,
      scope: "user",
      user_id: userB,
      created_at: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    for (const id of [aEntityId, bEntityId, bEntityId2, bStaleEntityId]) {
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
    await db.from("timeline_events").delete().eq("id", bTimelineId);
    await db.from("relationship_snapshots").delete().eq("relationship_key", bRelKey);
    await db.from("schema_registry").delete().eq("entity_type", bPrivateType);
  });

  it("retrieve_entity_snapshot: A cannot read B's entity by id; A reads its own", async () => {
    asUser(userA);
    await expect(
      (server as any).retrieveEntitySnapshot({ entity_id: bEntityId })
    ).rejects.toThrow();

    const own = await (server as any).retrieveEntitySnapshot({
      entity_id: aEntityId,
      format: "json",
    });
    expect(own.content[0].text).toContain(aEntityId);
  });

  it("list_timeline_events: A does not see B's events; B does", async () => {
    asUser(userA);
    const a = JSON.parse((await (server as any).listTimelineEvents({})).content[0].text);
    expect((a.events ?? []).map((e: any) => e.id)).not.toContain(bTimelineId);

    asUser(userB);
    const b = JSON.parse((await (server as any).listTimelineEvents({})).content[0].text);
    expect((b.events ?? []).map((e: any) => e.id)).toContain(bTimelineId);
  });

  it("get_relationship_snapshot: A cannot read B's relationship; B can", async () => {
    const args = {
      relationship_type: "REFERS_TO",
      source_entity_id: bEntityId,
      target_entity_id: bEntityId2,
    };
    asUser(userA);
    await expect((server as any).getRelationshipSnapshot(args)).rejects.toThrow();

    asUser(userB);
    const b = JSON.parse((await (server as any).getRelationshipSnapshot(args)).content[0].text);
    expect(b.snapshot?.relationship_key).toBe(bRelKey);
  });

  it("health_check_snapshots: A does not see B's stale snapshot; B does", async () => {
    asUser(userA);
    const a = JSON.parse((await (server as any).healthCheckSnapshots({})).content[0].text);
    expect((a.stale_snapshots ?? []).map((s: any) => s.entity_id)).not.toContain(bStaleEntityId);

    asUser(userB);
    const b = JSON.parse((await (server as any).healthCheckSnapshots({})).content[0].text);
    expect((b.stale_snapshots ?? []).map((s: any) => s.entity_id)).toContain(bStaleEntityId);
  });

  it("list_entity_types: A does not see B's private type; B does", async () => {
    asUser(userA);
    const a = JSON.parse((await (server as any).listEntityTypes({})).content[0].text);
    expect((a.entity_types ?? []).map((t: any) => t.entity_type)).not.toContain(bPrivateType);

    asUser(userB);
    const b = JSON.parse((await (server as any).listEntityTypes({})).content[0].text);
    expect((b.entity_types ?? []).map((t: any) => t.entity_type)).toContain(bPrivateType);
  });
});
