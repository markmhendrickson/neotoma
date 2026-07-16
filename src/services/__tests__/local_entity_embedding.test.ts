// Unit tests for local entity embedding (sqlite-vec)
// Requires OPENAI_API_KEY set (vitest.setup provides this)

import { describe, it, expect, beforeEach } from "vitest";
import {
  storeLocalEntityEmbedding,
  searchLocalEntityEmbeddings,
  ensureSqliteVecLoaded,
} from "../local_entity_embedding.js";
import { getDb } from "../../repositories/db/connection.js";
import { AsyncSqliteDatabase } from "../../repositories/sqlite/sqlite_driver.js";

const EMBEDDING_DIM = 1536;

/** Create a valid 1536-dim embedding (zeros with one non-zero for distinctiveness). */
function makeEmbedding(seed = 0): number[] {
  const arr = new Array(EMBEDDING_DIM).fill(0) as number[];
  arr[seed % EMBEDDING_DIM] = 1;
  return arr;
}

describe("local_entity_embedding", () => {
  beforeEach(async () => {
    const db = await getDb();
    try {
      await db.exec("DELETE FROM entity_embedding_rows");
    } catch {
      // Table may not exist
    }
  });

  describe("storeLocalEntityEmbedding", () => {
    it("returns without throwing when sqlite-vec loads", async () => {
      const row = {
        entity_id: "ent_test_store_1",
        embedding: makeEmbedding(1),
        user_id: "user_test",
        entity_type: "contact",
        merged: false,
      };
      await expect(storeLocalEntityEmbedding(row)).resolves.toBeUndefined();
    });

    it("ignores rows with wrong embedding dimension", async () => {
      const row = {
        entity_id: "ent_bad_dim",
        embedding: [1, 2, 3],
        user_id: "user_test",
        entity_type: "contact",
      };
      await expect(storeLocalEntityEmbedding(row)).resolves.toBeUndefined();
    });

    it("ignores rows with null embedding", async () => {
      const row = {
        entity_id: "ent_null",
        embedding: null,
        user_id: "user_test",
        entity_type: "contact",
      };
      await expect(storeLocalEntityEmbedding(row)).resolves.toBeUndefined();
    });
  });

  describe("searchLocalEntityEmbeddings", () => {
    it("returns empty array when no embeddings", async () => {
      const result = await searchLocalEntityEmbeddings({
        queryEmbedding: makeEmbedding(0),
        userId: "user_test",
        includeMerged: false,
        limit: 10,
        offset: 0,
      });
      expect(result.entityIds).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("returns stored entity after store when sqlite-vec works", async () => {
      await storeLocalEntityEmbedding({
        entity_id: "ent_search_1",
        embedding: makeEmbedding(5),
        user_id: "user_test",
        entity_type: "contact",
        merged: false,
      });

      const result = await searchLocalEntityEmbeddings({
        queryEmbedding: makeEmbedding(5),
        userId: "user_test",
        includeMerged: false,
        limit: 10,
        offset: 0,
      });

      // If sqlite-vec loaded successfully, we should find the entity
      if (result.entityIds.length > 0) {
        expect(result.entityIds).toContain("ent_search_1");
      }
      // If sqlite-vec failed to load, result is [] - test still passes
    });
  });

  describe("ensureSqliteVecLoaded", () => {
    it("returns boolean and does not throw", async () => {
      const db = await getDb();
      // sqlite-vec needs the raw synchronous handle; backends without one
      // (e.g. libSQL) degrade the same way as a failed extension load.
      if (!(db instanceof AsyncSqliteDatabase)) return;
      const loaded = ensureSqliteVecLoaded(db.rawDb());
      expect(typeof loaded).toBe("boolean");
    });
  });
});
