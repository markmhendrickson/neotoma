import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { config } from "../../src/config.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import { getDb } from "../../src/repositories/db/connection.js";
import {
  storeLocalEntityEmbedding,
  searchLocalEntityEmbeddings,
} from "../../src/services/local_entity_embedding.js";
import { semanticSearchEntities } from "../../src/services/entity_semantic_search.js";
import type { EntityReadTrace } from "../../src/shared/entity_read_contract.js";

vi.mock("../../src/embeddings.js", () => ({
  generateEmbedding: async () => Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)),
}));

it("native global KNN bound is visible even when closer foreign rows hide the known own positive", async () => {
  if (!process.env.NEOTOMA_DATA_DIR?.endsWith("/.vitest")) throw Error("Owned test store required");
  const owner = randomUUID(),
    foreign = randomUUID(),
    prefix = "ent_semantic_contract_" + randomUUID(),
    own = prefix + "_own";
  const before = config.openaiApiKey;
  config.openaiApiKey = "synthetic-not-a-credential";
  const vector = (distance: number) =>
    Array.from({ length: 1536 }, (_, i) => (i === 0 ? distance : 0));
  const driver = await getDb();
  if (!(driver instanceof AsyncSqliteDatabase)) throw Error("Owned SQLite driver required");
  const raw = driver.rawDb();
  // The runtime wrapper lacks extension loading. This fixture supplies only
  // that capability to the SAME owned native connection: SQL, KNN results,
  // row counts and filtering still execute unchanged. No runtime repair claim.
  const native = (raw as unknown as { db: { loadExtension: (path: string) => void } }).db;
  Object.defineProperty(raw, "loadExtension", {
    value: native.loadExtension.bind(native),
    configurable: true,
  });
  try {
    await storeLocalEntityEmbedding({
      entity_id: own,
      user_id: owner,
      entity_type: "synthetic_contract",
      embedding: vector(2),
    });
    const positive: EntityReadTrace = { reasons: new Set() };
    const first = await searchLocalEntityEmbeddings({
      queryEmbedding: vector(1),
      userId: owner,
      entityType: "synthetic_contract",
      includeMerged: false,
      limit: 1,
      offset: 0,
      readTrace: positive,
    });
    expect(first.entityIds).toEqual([own]);
    for (let i = 0; i < 501; i++)
      await storeLocalEntityEmbedding({
        entity_id: prefix + "_foreign_" + i,
        user_id: foreign,
        entity_type: "synthetic_contract",
        embedding: vector(1),
      });
    const trace: EntityReadTrace = { reasons: new Set() };
    const bounded = await semanticSearchEntities({
      searchText: "synthetic",
      userId: owner,
      entityType: "synthetic_contract",
      includeMerged: false,
      limit: 1,
      offset: 0,
      readTrace: trace,
    });
    expect(bounded.entityIds).toEqual([]);
    expect(trace.candidate_capped).toBe(true);
    expect(trace.reasons.has("semantic_global_candidate_cap")).toBe(true);
    expect(
      (await driver
        .prepare("SELECT COUNT(*) AS c FROM entity_embedding_rows WHERE entity_id = ?")
        .get(own)) as { c: number }
    ).toEqual({ c: 1 });
  } finally {
    const rows = await driver
      .prepare("SELECT rowid FROM entity_embedding_rows WHERE entity_id LIKE ?")
      .all(prefix + "%");
    for (const row of rows as { rowid: number }[])
      await driver.prepare("DELETE FROM entity_embeddings_vec WHERE rowid = ?").run(row.rowid);
    await driver
      .prepare("DELETE FROM entity_embedding_rows WHERE entity_id LIKE ?")
      .run(prefix + "%");
    config.openaiApiKey = before;
    delete (raw as unknown as { loadExtension?: unknown }).loadExtension;
  }
});
