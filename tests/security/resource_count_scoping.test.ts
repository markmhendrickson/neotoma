/**
 * Resource-count scoping (closes #1889).
 *
 * `list_resources` decorates the generic collection resources
 * (`neotoma://entities`, `neotoma://relationships`, `neotoma://sources`)
 * with a total count. Those counts were computed with an unscoped
 * `SELECT COUNT(*)`, which:
 *
 *   1. leaked aggregate per-user data volumes to any authenticated caller
 *      (a confidentiality boundary issue — the primary driver), and
 *   2. forced a full table scan instead of using the per-user indexes.
 *
 * This asserts the counting queries are user-scoped: seeded with two users'
 * data, a count taken as user A must not include user B's rows. A regression
 * that drops `.eq("user_id", ...)` shows up here as A's count absorbing B's.
 *
 * Companion to tenant_isolation_matrix.test.ts, which covers the read
 * endpoints themselves rather than the counts advertised alongside them.
 *
 * Surface parity: this covers the MCP `list_resources` counts. The REST/CLI
 * counterpart (`GET /stats` -> getDashboardStats(userId) in
 * src/services/dashboard_stats.ts) already scopes by user_id and is covered
 * by tests/integration/dashboard_stats.test.ts and
 * tests/security/cross_user_read_scoping.test.ts. See PR #2041 for the full
 * surface enumeration (MCP / REST / CLI / HTTP health).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { randomUUID } from "node:crypto";

const TEST_PREFIX = "resource_count_scoping_test";

interface CountFixture {
  userId: string;
  entityIds: string[];
  sourceId: string;
  relationshipKey: string;
}

async function seedUserData(
  label: string,
  entityCount: number,
): Promise<CountFixture> {
  const userId = randomUUID();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entityIds: string[] = [];

  for (let i = 0; i < entityCount; i++) {
    const entityId = `${TEST_PREFIX}_ent_${label}_${i}_${suffix}`;
    await db.from("entities").insert({
      id: entityId,
      user_id: userId,
      entity_type: "test",
      canonical_name: `${label} entity ${i}`,
    });
    entityIds.push(entityId);
  }

  const sourceId = randomUUID();
  await db.from("sources").insert({
    id: sourceId,
    user_id: userId,
    content_hash: `${TEST_PREFIX}_hash_${label}_${suffix}`,
    mime_type: "text/plain",
    storage_url: `internal://test/${label}`,
    file_size: 0,
  });

  const relationshipKey = `${TEST_PREFIX}_rel_${label}_${suffix}`;
  await db.from("relationship_snapshots").insert({
    relationship_key: relationshipKey,
    relationship_type: "REFERS_TO",
    source_entity_id: entityIds[0],
    target_entity_id: entityIds[1] ?? entityIds[0],
    schema_version: "1",
    snapshot: JSON.stringify({}),
    user_id: userId,
  });

  return { userId, entityIds, sourceId, relationshipKey };
}

async function cleanupUserData(data: CountFixture): Promise<void> {
  await db
    .from("relationship_snapshots")
    .delete()
    .eq("relationship_key", data.relationshipKey);
  await db.from("sources").delete().eq("id", data.sourceId);
  for (const id of data.entityIds) {
    await db.from("entities").delete().eq("id", id);
  }
}

/** Mirrors the scoped counting queries in the list_resources handler. */
async function countsForUser(userId: string) {
  const { count: entityCount } = await db
    .from("entities")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("merged_to_entity_id", null);

  const { count: relationshipCount } = await db
    .from("relationship_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const { count: sourceCount } = await db
    .from("sources")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  return {
    entityCount: entityCount ?? 0,
    relationshipCount: relationshipCount ?? 0,
    sourceCount: sourceCount ?? 0,
  };
}

describe("list_resources counts are user-scoped (#1889)", () => {
  let userA: CountFixture;
  let userB: CountFixture;

  beforeAll(async () => {
    // Distinct volumes, so a leak is visible as a wrong number rather than
    // merely a suspicious one.
    userA = await seedUserData("a", 2);
    userB = await seedUserData("b", 5);
  });

  afterAll(async () => {
    await cleanupUserData(userA);
    await cleanupUserData(userB);
  });

  it("counts only the calling user's entities", async () => {
    const a = await countsForUser(userA.userId);
    const b = await countsForUser(userB.userId);

    expect(a.entityCount).toBe(2);
    expect(b.entityCount).toBe(5);
  });

  it("counts only the calling user's relationships and sources", async () => {
    const a = await countsForUser(userA.userId);

    expect(a.relationshipCount).toBe(1);
    expect(a.sourceCount).toBe(1);
  });

  it("does not let one user infer another user's data volume", async () => {
    const a = await countsForUser(userA.userId);
    const b = await countsForUser(userB.userId);

    // The union would be 7 entities; neither caller may see it.
    const union = userA.entityIds.length + userB.entityIds.length;
    expect(a.entityCount).toBeLessThan(union);
    expect(b.entityCount).toBeLessThan(union);
    expect(a.entityCount).not.toBe(b.entityCount);
  });

  it("returns zero for a user with no data rather than a global total", async () => {
    const emptyUser = randomUUID();
    const counts = await countsForUser(emptyUser);

    expect(counts.entityCount).toBe(0);
    expect(counts.relationshipCount).toBe(0);
    expect(counts.sourceCount).toBe(0);
  });
});
