/**
 * Deep `offset` pages of queryEntities must not page the scan by SQL OFFSET.
 *
 * The default (entity_id order) path scans `entities` in fixed-size chunks and
 * skips `offset` visible rows. It used to advance each chunk with
 * `OFFSET <rows already scanned>`, and SQLite re-walks every skipped row for
 * each OFFSET, so one deep page cost O(offset^2) row visits. It now continues
 * each chunk from the last id seen (a primary-key seek), so every scan statement
 * starts at OFFSET 0.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { queryEntities } from "../../src/services/entity_queries.js";

const userId = `deep-offset-${randomUUID()}`;
const entityType = `deep_offset_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const TOTAL = 900; // > 4 scan chunks of 200 (the minimum chunk size)
const ids: string[] = [];

async function entityScanOffsets(run: () => Promise<unknown>): Promise<number[]> {
  const database = await getDb();
  const original = database.prepare.bind(database);
  const offsets: number[] = [];
  const spy = vi.spyOn(database, "prepare").mockImplementation(((sql: string) => {
    if (/FROM entities\b/.test(sql)) {
      const m = /OFFSET (\d+)/.exec(sql);
      offsets.push(m ? Number(m[1]) : 0);
    }
    return original(sql);
  }) as typeof database.prepare);
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return offsets;
}

describe("queryEntities deep offset", () => {
  beforeAll(async () => {
    const now = new Date().toISOString();
    const entities: Record<string, unknown>[] = [];
    const snapshots: Record<string, unknown>[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const id = `ent_deepoffset_${String(i).padStart(5, "0")}_${randomUUID().slice(0, 8)}`;
      ids.push(id);
      entities.push({
        id,
        entity_type: entityType,
        canonical_name: `name ${i}`,
        user_id: userId,
        created_at: now,
        updated_at: now,
      });
      snapshots.push({
        entity_id: id,
        entity_type: entityType,
        schema_version: "1.0",
        snapshot: { title: `t${i}` },
        computed_at: now,
        observation_count: 1,
        last_observation_at: now,
        provenance: {},
        user_id: userId,
      });
    }
    ids.sort();
    for (let i = 0; i < TOTAL; i += 300) {
      expect((await db.from("entities").insert(entities.slice(i, i + 300))).error).toBeNull();
      expect(
        (await db.from("entity_snapshots").insert(snapshots.slice(i, i + 300))).error
      ).toBeNull();
    }
  });

  afterAll(async () => {
    await db.from("entity_snapshots").delete().eq("user_id", userId);
    await db.from("entities").delete().eq("user_id", userId);
  });

  it("returns the right page for an ascending deep offset without SQL OFFSET paging", async () => {
    let page: { entity_id: string }[] = [];
    const offsets = await entityScanOffsets(async () => {
      page = (await queryEntities({
        userId,
        entityType,
        limit: 10,
        offset: 850,
      })) as { entity_id: string }[];
    });
    expect(page.map((e) => e.entity_id)).toEqual(ids.slice(850, 860));
    expect(offsets.length).toBeGreaterThan(1); // the scan really was multi-chunk
    expect(Math.max(...offsets)).toBe(0);
  });

  it("returns the right page for a descending deep offset without SQL OFFSET paging", async () => {
    let page: { entity_id: string }[] = [];
    const offsets = await entityScanOffsets(async () => {
      page = (await queryEntities({
        userId,
        entityType,
        limit: 10,
        offset: 850,
        sortOrder: "desc",
      })) as { entity_id: string }[];
    });
    const desc = [...ids].reverse();
    expect(page.map((e) => e.entity_id)).toEqual(desc.slice(850, 860));
    expect(Math.max(...offsets)).toBe(0);
  });

  it("still returns correct pages when sorting by canonical_name (OFFSET retained)", async () => {
    const page = (await queryEntities({
      userId,
      entityType,
      limit: 5,
      offset: 650,
      sortBy: "canonical_name",
    })) as { canonical_name: string }[];
    const expected = Array.from({ length: TOTAL }, (_, i) => `name ${i}`)
      .sort()
      .slice(650, 655);
    expect(page.map((e) => e.canonical_name)).toEqual(expected);
  });
});
