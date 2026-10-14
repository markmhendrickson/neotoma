/**
 * raw_fragments loading for entity search (#2659).
 *
 * `raw_fragments` has no index on `entity_id`, so every `entity_id IN (...)`
 * statement scans the whole table. Search used to issue one such statement per
 * 500 candidates, so a typed search over a large entity type cost
 * (candidates / 500) full scans. These tests pin that the candidates' fragments
 * are now read with a single statement, that the text it produces is identical
 * to the chunked loader's, and that search survives the single-scan statement
 * failing.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import {
  loadRawFragmentTextByEntityId,
  loadRawFragmentTextChunked,
  queryEntitiesWithCount,
} from "../../src/shared/action_handlers/entity_handlers.js";

const serviceRoleClient = getServiceRoleClient();
const run = randomUUID().replaceAll("-", "").slice(0, 10);
const userId = `frag-scan-${run}`;
const entityType = `fragscan_${run}`;
const ENTITY_COUNT = 1100; // more than two 500-id chunks
const entityIds = Array.from({ length: ENTITY_COUNT }, (_, i) => `ent_fs${run}_${i}`);

function rawFragmentStatements(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((call) => String(call[0]))
    .filter((sql) => /FROM\s+raw_fragments/i.test(sql));
}

describe("raw_fragments loading for entity search (#2659)", () => {
  beforeAll(async () => {
    const now = new Date().toISOString();
    for (let start = 0; start < ENTITY_COUNT; start += 250) {
      const slice = entityIds.slice(start, start + 250);
      expect(
        (
          await serviceRoleClient.from("entities").insert(
            slice.map((id, j) => ({
              id,
              user_id: userId,
              entity_type: entityType,
              canonical_name: `Fragment scan row ${start + j}`,
            }))
          )
        ).error
      ).toBeNull();
      expect(
        (
          await serviceRoleClient.from("entity_snapshots").insert(
            slice.map((entity_id) => ({
              entity_id,
              user_id: userId,
              entity_type: entityType,
              schema_version: "1.0",
              snapshot: {},
              provenance: {},
              observation_count: 1,
              last_observation_at: now,
              computed_at: now,
            }))
          )
        ).error
      ).toBeNull();
    }
    const fragments: Array<Record<string, unknown>> = [];
    const add = (i: number, n: number, key: string, value: unknown) =>
      fragments.push({
        id: `frag_${run}_${i}_${n}`,
        entity_id: entityIds[i],
        entity_type: entityType,
        user_id: userId,
        fragment_key: key,
        fragment_value: value,
      });
    // Several fragments for one entity (order of concatenation matters), one in
    // each 500-id chunk, an object value, a null value and an empty piece.
    add(3, 0, "first_key", "first value");
    add(3, 1, "second_key", "second value");
    add(3, 2, "third_key", null);
    add(600, 0, "chunk_two_key", "needle" + run);
    add(1050, 0, "obj_key", { nested: "structured" });
    add(7, 0, "numeric_key", 42);
    for (let at = 0; at < fragments.length; at += 100) {
      expect(
        (await serviceRoleClient.from("raw_fragments").insert(fragments.slice(at, at + 100))).error
      ).toBeNull();
    }
    // A fragment with no entity link must be ignored by both loaders.
    expect(
      (
        await serviceRoleClient.from("raw_fragments").insert({
          id: `frag_${run}_orphan`,
          entity_id: null,
          entity_type: entityType,
          user_id: userId,
          fragment_key: "orphan_key",
          fragment_value: "orphan",
        })
      ).error
    ).toBeNull();
  }, 120000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.from("raw_fragments").delete().eq("user_id", userId);
    await db.from("entity_snapshots").delete().eq("user_id", userId);
    await db.from("entities").delete().eq("user_id", userId);
  });

  it("produces exactly the text the chunked loader produced for every entity", async () => {
    const single = await loadRawFragmentTextByEntityId(entityIds);
    const chunked = await loadRawFragmentTextChunked(entityIds);
    // Per-entity text is compared whole, so the order fragments are joined in is
    // pinned. Map insertion order is not: lookups are always by entity id.
    const sorted = (map: Map<string, string>) =>
      [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    expect(sorted(single)).toEqual(sorted(chunked));
    // Guard against both being empty: the instrument must be non-zero.
    expect(single.size).toBe(4);
    expect(single.get(entityIds[3]!)).toBe(
      "first_key first value second_key second value third_key"
    );
    expect(single.get(entityIds[600]!)).toBe(`chunk_two_key needle${run}`);
    expect(single.get(entityIds[7]!)).toBe("numeric_key 42");
  });

  it("reads every candidate's fragments with one statement, however many candidates", async () => {
    const connection = await getDb();
    const spy = vi.spyOn(connection, "prepare");
    const result = await queryEntitiesWithCount({
      userId,
      entityType,
      search: `needle${run}`,
      limit: 1,
    });
    expect(result.entities.map((e) => e.entity_id)).toEqual([entityIds[600]]);
    expect(rawFragmentStatements(spy)).toHaveLength(1);
  });

  it("falls back to the chunked loader when the single-scan statement fails", async () => {
    const connection = await getDb();
    const original = connection.prepare.bind(connection);
    const spy = vi.spyOn(connection, "prepare").mockImplementation((sql: string) => {
      if (/json_each/i.test(sql)) throw new Error("no such function: json_each");
      return original(sql);
    });
    const result = await queryEntitiesWithCount({
      userId,
      entityType,
      search: `needle${run}`,
      limit: 1,
    });
    expect(result.entities.map((e) => e.entity_id)).toEqual([entityIds[600]]);
    expect(result.total).toBe(1);
    expect(spy).toHaveBeenCalled();
  });
});
