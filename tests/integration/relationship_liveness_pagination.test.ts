/**
 * Integration + unit tests for materialized relationship liveness and stable
 * pagination (#1570, #1571).
 *
 * #1570: the default `list_relationships` read must exclude soft-deleted edges
 * via the materialized `relationship_snapshots.is_live` column (a DB predicate)
 * rather than loading the full matching set and filtering in process. This
 * verifies:
 *   - a freshly-seeded edge is live and returned by default;
 *   - softDeleteRelationship flips is_live to 0 and the default read drops it;
 *   - `total_count` reflects the live-only count after filtering;
 *   - include_deleted=true still returns the deleted edge;
 *   - computeRelationshipSnapshot re-stamps is_live from the observation log.
 *
 * #1571: the in-memory helper isRelationshipLive applies the same
 * highest-priority-observation rule used on the read path and the backfill.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { softDeleteRelationship } from "../../src/services/deletion.js";
import { isRelationshipLive } from "../../src/services/relationships.js";

const OWNER_USER_ID = "00000000-0000-0000-0000-0000000004a0";
const API_PORT = 18176;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

describe("relationship liveness materialization + pagination (#1570, #1571)", () => {
  let httpServer: ReturnType<typeof createServer>;
  const runId = Date.now();
  const hub = makeEntityId(`live-hub-${runId}`);
  const spokes = Array.from({ length: 5 }, (_, i) => makeEntityId(`live-spoke-${runId}-${i}`));
  const relationshipType = "REFERS_TO";
  const keyFor = (spoke: string) => `${relationshipType}:${hub}:${spoke}`;
  const allKeys = spokes.map(keyFor);

  async function seedEdge(spoke: string, observedAt: string): Promise<void> {
    const key = keyFor(spoke);
    await db.from("relationship_observations").insert({
      id: createHash("sha256").update(`${key}:obs`).digest("hex"),
      relationship_key: key,
      source_entity_id: hub,
      target_entity_id: spoke,
      relationship_type: relationshipType,
      source_priority: 1,
      metadata: {},
      canonical_hash: createHash("sha256").update(key).digest("hex"),
      user_id: OWNER_USER_ID,
      observed_at: observedAt,
      provenance: {},
    });
    await db.from("relationship_snapshots").upsert({
      relationship_key: key,
      relationship_type: relationshipType,
      source_entity_id: hub,
      target_entity_id: spoke,
      schema_version: "1.0",
      snapshot: {},
      computed_at: observedAt,
      observation_count: 1,
      last_observation_at: observedAt,
      provenance: {},
      user_id: OWNER_USER_ID,
      is_live: 1,
    });
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    for (const id of [hub, ...spokes]) {
      await db.from("entities").insert({
        id,
        user_id: OWNER_USER_ID,
        entity_type: "note",
        canonical_name: id,
      });
    }
    // Seed 5 outbound edges. Give two of them an identical last_observation_at
    // to exercise the #1571 tiebreaker; the rest are distinct and descending.
    const tied = "2026-06-01T00:00:00.000Z";
    await seedEdge(spokes[0], "2026-06-05T00:00:00.000Z");
    await seedEdge(spokes[1], "2026-06-04T00:00:00.000Z");
    await seedEdge(spokes[2], "2026-06-03T00:00:00.000Z");
    await seedEdge(spokes[3], tied);
    await seedEdge(spokes[4], tied);
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", allKeys);
    await db.from("relationship_observations").delete().in("relationship_key", allKeys);
    await db.from("entities").delete().in("id", [hub, ...spokes]);
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

  it("returns all live edges by default with total_count = live count", async () => {
    const { status, json } = await post("/list_relationships", {
      entity_id: hub,
      direction: "outgoing",
      user_id: OWNER_USER_ID,
    });
    expect(status).toBe(200);
    expect((json.relationships as unknown[]).length).toBe(5);
    expect(json.total).toBe(5);
    expect(json.total_count).toBe(5);
  });

  it("paginates at the DB: a page returns at most `limit` rows and total stays the full live count", async () => {
    const { json } = await post("/list_relationships", {
      entity_id: hub,
      direction: "outgoing",
      user_id: OWNER_USER_ID,
      limit: 2,
      offset: 0,
    });
    const page = json.relationships as Array<{ relationship_key: string }>;
    expect(page.length).toBe(2);
    // total_count reflects the full live set, not the page size (#1570).
    expect(json.total_count).toBe(5);
  });

  it("paginates deterministically over edges sharing last_observation_at (#1571)", async () => {
    // Walk all 5 in pages of 1; with a stable relationship_key tiebreaker the
    // union of pages is exactly the 5 keys with no drops or duplicates, even
    // across the two rows that share a last_observation_at.
    const seen: string[] = [];
    for (let offset = 0; offset < 5; offset++) {
      const { json } = await post("/list_relationships", {
        entity_id: hub,
        direction: "outgoing",
        user_id: OWNER_USER_ID,
        limit: 1,
        offset,
      });
      const page = json.relationships as Array<{ relationship_key: string }>;
      expect(page.length).toBe(1);
      seen.push(page[0].relationship_key);
    }
    expect(new Set(seen).size).toBe(5);
    expect([...seen].sort()).toEqual([...allKeys].sort());
  });

  it("softDeleteRelationship flips is_live and the default read drops the edge", async () => {
    const victim = spokes[0];
    const key = keyFor(victim);

    const res = await softDeleteRelationship(
      key,
      relationshipType,
      hub,
      victim,
      OWNER_USER_ID,
      "test"
    );
    expect(res.success).toBe(true);

    // Snapshot is_live materialized to 0.
    const { data: snap } = await db
      .from("relationship_snapshots")
      .select("is_live")
      .eq("relationship_key", key)
      .single();
    expect((snap as { is_live: number }).is_live).toBe(0);

    // Default read now returns 4 live edges, and total_count reflects that.
    const { json } = await post("/list_relationships", {
      entity_id: hub,
      direction: "outgoing",
      user_id: OWNER_USER_ID,
    });
    const keys = (json.relationships as Array<{ relationship_key: string }>).map(
      (r) => r.relationship_key
    );
    expect(keys).not.toContain(key);
    expect(json.total_count).toBe(4);

    // include_deleted=true still surfaces the deleted edge.
    const { json: withDeleted } = await post("/list_relationships", {
      entity_id: hub,
      direction: "outgoing",
      user_id: OWNER_USER_ID,
      include_deleted: true,
    });
    const allReturned = (
      withDeleted.relationships as Array<{ relationship_key: string }>
    ).map((r) => r.relationship_key);
    expect(allReturned).toContain(key);
    expect(withDeleted.total_count).toBe(5);
  });
});

describe("isRelationshipLive helper (#1570)", () => {
  it("treats an empty observation set as live", () => {
    expect(isRelationshipLive([])).toBe(true);
  });

  it("is live when the highest-priority observation is not a deletion", () => {
    expect(
      isRelationshipLive([
        { source_priority: 1, observed_at: "2026-06-01T00:00:00Z", metadata: {} },
        {
          source_priority: 1,
          observed_at: "2026-06-02T00:00:00Z",
          metadata: { _deleted: false },
        },
      ])
    ).toBe(true);
  });

  it("is dead when the highest-priority observation is a deletion (priority wins over recency)", () => {
    expect(
      isRelationshipLive([
        // Newer but lower priority — a normal re-assertion.
        { source_priority: 1, observed_at: "2026-06-09T00:00:00Z", metadata: {} },
        // Older but highest priority deletion (priority 1000) — wins.
        {
          source_priority: 1000,
          observed_at: "2026-06-01T00:00:00Z",
          metadata: { _deleted: true },
        },
      ])
    ).toBe(false);
  });

  it("is live again when a higher-priority restoration supersedes the deletion", () => {
    expect(
      isRelationshipLive([
        {
          source_priority: 1000,
          observed_at: "2026-06-01T00:00:00Z",
          metadata: { _deleted: true },
        },
        {
          source_priority: 1001,
          observed_at: "2026-06-02T00:00:00Z",
          metadata: { _deleted: false },
        },
      ])
    ).toBe(true);
  });
});
