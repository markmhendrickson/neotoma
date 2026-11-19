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
import { softDeleteEntity } from "../../src/services/deletion.js";
import { encodeCursor } from "../../src/services/entity_cursor.js";

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

/**
 * Mixed live/deleted fixture. 700 entities in id order; the scan chunk is 200 rows
 * for these small limits, so:
 *   - rows 199 and 200 are deleted, straddling the first chunk boundary;
 *   - rows 400..599 are deleted, which is one whole chunk when scanning from row 0
 *     (and after a cursor at row 399 or 600, in either direction).
 * Deleted rows are removed with softDeleteEntity, so liveness is resolved by the
 * real read path.
 */
describe("queryEntities keyset scan over live and deleted rows", () => {
  const N = 700;
  const mixedUser = `deep-offset-mixed-${randomUUID()}`;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const typeA = `deep_mixed_a_${suffix}`;
  const typeB = `deep_mixed_b_${suffix}`;
  const OLD = "2020-01-01T00:00:00.000Z";
  const NEW = "2026-01-01T00:00:00.000Z";
  const SINCE = "2025-01-01T00:00:00.000Z";
  type Row = {
    idx: number;
    id: string;
    type: string;
    createdOld: boolean;
    updatedOld: boolean;
    deleted: boolean;
  };
  const rows: Row[] = [];

  const isDeleted = (i: number) => i === 199 || i === 200 || (i >= 400 && i <= 599);

  beforeAll(async () => {
    const entities: Record<string, unknown>[] = [];
    const snapshots: Record<string, unknown>[] = [];
    const observations: Record<string, unknown>[] = [];
    for (let i = 0; i < N; i++) {
      const row: Row = {
        idx: i,
        id: `ent_deepmixed_${String(i).padStart(5, "0")}_${randomUUID().slice(0, 8)}`,
        type: i % 2 === 0 ? typeA : typeB,
        createdOld: i < 300,
        updatedOld: i < 350,
        deleted: isDeleted(i),
      };
      rows.push(row);
      entities.push({
        id: row.id,
        entity_type: row.type,
        canonical_name: `mixed ${i}`,
        user_id: mixedUser,
        created_at: row.createdOld ? OLD : NEW,
        updated_at: row.updatedOld ? OLD : NEW,
      });
      observations.push({
        id: `obs_${row.id}`,
        entity_id: row.id,
        entity_type: row.type,
        observed_at: NEW,
        source_priority: 100,
        fields: JSON.stringify({ title: row.id }),
        user_id: mixedUser,
      });
      snapshots.push({
        entity_id: row.id,
        entity_type: row.type,
        schema_version: "1.0",
        snapshot: { title: row.id },
        computed_at: NEW,
        observation_count: 1,
        last_observation_at: NEW,
        provenance: {},
        user_id: mixedUser,
      });
    }
    // Ids embed the zero-padded index, so row order is id order.
    for (let i = 0; i < entities.length; i += 300) {
      expect((await db.from("entities").insert(entities.slice(i, i + 300))).error).toBeNull();
    }
    for (let i = 0; i < snapshots.length; i += 300) {
      expect(
        (await db.from("entity_snapshots").insert(snapshots.slice(i, i + 300))).error
      ).toBeNull();
    }
    for (let i = 0; i < observations.length; i += 300) {
      expect(
        (await db.from("observations").insert(observations.slice(i, i + 300))).error
      ).toBeNull();
    }
    // Delete through the real delete path so liveness is whatever the app resolves.
    for (const row of rows.filter((r) => r.deleted)) {
      const res = await softDeleteEntity(row.id, row.type, mixedUser, "deep-offset fixture");
      expect(res.success, res.error).toBe(true);
    }
  });

  afterAll(async () => {
    await db.from("observations").delete().eq("user_id", mixedUser);
    await db.from("entity_snapshots").delete().eq("user_id", mixedUser);
    await db.from("entities").delete().eq("user_id", mixedUser);
  });

  const visible = (pred: (r: Row) => boolean, desc: boolean): string[] => {
    const out = rows.filter((r) => !r.deleted && pred(r)).map((r) => r.id);
    return desc ? out.reverse() : out;
  };
  const ids = (page: unknown): string[] =>
    (page as { entity_id: string }[]).map((e) => e.entity_id);

  type Variant = {
    name: string;
    pred: (r: Row) => boolean;
    opts: () => Record<string, unknown>;
    /** False when sortOrder is ignored (fallback sort scans id ascending). */
    honoursOrder: boolean;
  };
  const picked = (r: Row) => r.idx % 3 !== 0;
  const variants: Variant[] = [
    {
      name: "type union",
      pred: () => true,
      opts: () => ({ entityType: typeA, entityTypes: [typeB] }),
      honoursOrder: true,
    },
    {
      name: "single type",
      pred: (r) => r.type === typeA,
      opts: () => ({ entityType: typeA }),
      honoursOrder: true,
    },
    {
      name: "entityIds",
      pred: picked,
      opts: () => ({
        entityTypes: [typeA, typeB],
        entityIds: rows.filter(picked).map((r) => r.id),
      }),
      honoursOrder: true,
    },
    {
      name: "updatedSince",
      pred: (r) => !r.updatedOld,
      opts: () => ({ entityTypes: [typeA, typeB], updatedSince: SINCE }),
      honoursOrder: true,
    },
    {
      name: "createdSince",
      pred: (r) => !r.createdOld,
      opts: () => ({ entityTypes: [typeA, typeB], createdSince: SINCE }),
      honoursOrder: true,
    },
    {
      // Pins current behaviour: only canonical_name and entity_id honour sortOrder;
      // any other sortBy scans id ascending even when sortOrder is "desc".
      name: "created_at fallback sort",
      pred: () => true,
      opts: () => ({ entityTypes: [typeA, typeB], sortBy: "created_at" }),
      honoursOrder: false,
    },
  ];

  const OFFSETS = [0, 190, 198, 199, 250, 297, 400, 497, 498, 600];
  const LIMIT = 5;

  for (const v of variants) {
    for (const direction of ["asc", "desc"] as const) {
      it(`${v.name}, ${direction}: exact visible-offset slices across the chunk boundary and to exhaustion`, async () => {
        const desc = direction === "desc" && v.honoursOrder;
        const expected = visible(v.pred, desc);
        expect(expected.length).toBeGreaterThan(100);
        const seenOffsets: number[] = [];
        for (const offset of OFFSETS) {
          let page: string[] = [];
          const scan = await entityScanOffsets(async () => {
            page = ids(
              await queryEntities({
                userId: mixedUser,
                includeSnapshots: false,
                limit: LIMIT,
                offset,
                sortOrder: direction,
                ...v.opts(),
              })
            );
          });
          seenOffsets.push(...scan);
          expect(page, `offset ${offset}`).toEqual(expected.slice(offset, offset + LIMIT));
        }
        expect(Math.max(...seenOffsets)).toBe(0);
        const past = await queryEntities({
          userId: mixedUser,
          includeSnapshots: false,
          limit: LIMIT,
          offset: expected.length,
          sortOrder: direction,
          ...v.opts(),
        });
        expect(past).toEqual([]);
      });
    }
  }

  it("offset pages concatenate to the full visible list with no repeats, both directions", async () => {
    for (const direction of ["asc", "desc"] as const) {
      const expected = visible(() => true, direction === "desc");
      const walked: string[] = [];
      for (let offset = 0; offset < expected.length + 50; offset += 37) {
        walked.push(
          ...ids(
            await queryEntities({
              userId: mixedUser,
              entityTypes: [typeA, typeB],
              includeSnapshots: false,
              limit: 37,
              offset,
              sortOrder: direction,
            })
          )
        );
      }
      expect(walked).toEqual(expected);
    }
  });

  it("a cursor before an all-deleted chunk skips it, and exhausts, in both directions", async () => {
    const cases: Array<{ dir: "asc" | "desc"; cursorIdx: number }> = [
      { dir: "asc", cursorIdx: 399 }, // next 200 scanned rows (400..599) are all deleted
      { dir: "desc", cursorIdx: 600 }, // next 200 scanned rows (599..400) are all deleted
      { dir: "asc", cursorIdx: 150 }, // first chunk crosses the 199/200 deleted pair
      { dir: "desc", cursorIdx: 250 },
    ];
    const tokenFor = (dir: "asc" | "desc", id: string) =>
      encodeCursor({ v: 1, sort_by: "entity_id", sort_order: dir, entity_id: id });
    for (const { dir, cursorIdx } of cases) {
      const pivot = rows[cursorIdx].id;
      const afterCursor = visible(() => true, dir === "desc").filter((id) =>
        dir === "asc" ? id > pivot : id < pivot
      );
      const walked: string[] = [];
      let next: string | undefined = tokenFor(dir, pivot);
      let firstPage: string[] | undefined;
      for (let guard = 0; guard < 100 && next; guard++) {
        const got = ids(
          await queryEntities({
            userId: mixedUser,
            entityTypes: [typeA, typeB],
            includeSnapshots: false,
            limit: guard === 0 ? 5 : 50,
            sortOrder: dir,
            cursor: next,
          })
        );
        if (guard === 0) firstPage = got;
        if (got.length === 0) break;
        walked.push(...got);
        next = tokenFor(dir, got[got.length - 1]);
      }
      expect(firstPage, `${dir} cursor@${cursorIdx} first page`).toEqual(afterCursor.slice(0, 5));
      expect(walked, `${dir} cursor@${cursorIdx} walk`).toEqual(afterCursor);
      expect(new Set(walked).size).toBe(walked.length);
    }
  });

  it("the fixture has an all-deleted chunk and a boundary pair", () => {
    expect(rows.filter((r) => r.deleted).length).toBe(202);
    expect(rows.slice(400, 600).every((r) => r.deleted)).toBe(true);
    expect(rows[199].deleted && rows[200].deleted).toBe(true);
  });
});
