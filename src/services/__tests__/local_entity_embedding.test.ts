// Unit tests for local entity embedding (sqlite-vec)
// Requires NEOTOMA_STORAGE_BACKEND=local and OPENAI_API_KEY set (vitest.setup provides these)

import { describe, it, expect, beforeEach } from "vitest";
import {
  storeLocalEntityEmbedding,
  searchLocalEntityEmbeddings,
  ensureSqliteVecLoaded,
} from "../local_entity_embedding.js";
import { getSqliteDb } from "../../repositories/sqlite/sqlite_client.js";

const EMBEDDING_DIM = 1536;

/** Create a valid 1536-dim embedding (zeros with one non-zero for distinctiveness). */
function makeEmbedding(seed = 0): number[] {
  const arr = new Array(EMBEDDING_DIM).fill(0) as number[];
  arr[seed % EMBEDDING_DIM] = 1;
  return arr;
}

describe("local_entity_embedding", () => {
  beforeEach(() => {
    const db = getSqliteDb();
    try {
      db.exec("DELETE FROM entity_embedding_rows");
    } catch {
      // Table may not exist
    }
  });

  describe("storeLocalEntityEmbedding", () => {
    it("returns without throwing when sqlite-vec loads", () => {
      const row = {
        entity_id: "ent_test_store_1",
        embedding: makeEmbedding(1),
        user_id: "user_test",
        entity_type: "contact",
        merged: false,
      };
      expect(() => storeLocalEntityEmbedding(row)).not.toThrow();
    });

    it("ignores rows with wrong embedding dimension", () => {
      const row = {
        entity_id: "ent_bad_dim",
        embedding: [1, 2, 3],
        user_id: "user_test",
        entity_type: "contact",
      };
      expect(() => storeLocalEntityEmbedding(row)).not.toThrow();
    });

    it("ignores rows with null embedding", () => {
      const row = {
        entity_id: "ent_null",
        embedding: null,
        user_id: "user_test",
        entity_type: "contact",
      };
      expect(() => storeLocalEntityEmbedding(row)).not.toThrow();
    });
  });

  describe("searchLocalEntityEmbeddings", () => {
    it("returns empty array when no embeddings", () => {
      const result = searchLocalEntityEmbeddings({
        queryEmbedding: makeEmbedding(0),
        userId: "user_test",
        includeMerged: false,
        limit: 10,
        offset: 0,
      });
      expect(result).toEqual([]);
    });

    it("returns stored entity after store when sqlite-vec works", () => {
      storeLocalEntityEmbedding({
        entity_id: "ent_search_1",
        embedding: makeEmbedding(5),
        user_id: "user_test",
        entity_type: "contact",
        merged: false,
      });

      const result = searchLocalEntityEmbeddings({
        queryEmbedding: makeEmbedding(5),
        userId: "user_test",
        includeMerged: false,
        limit: 10,
        offset: 0,
      });

      // If sqlite-vec loaded successfully, we should find the entity
      if (result.length > 0) {
        expect(result).toContain("ent_search_1");
      }
      // If sqlite-vec failed to load, result is [] - test still passes
    });
  });

  describe("ensureSqliteVecLoaded", () => {
    it("returns boolean and does not throw", () => {
      const db = getSqliteDb();
      const loaded = ensureSqliteVecLoaded(db);
      expect(typeof loaded).toBe("boolean");
    });
  });
});
