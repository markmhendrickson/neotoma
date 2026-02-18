#!/usr/bin/env npx tsx
/**
 * Debug vec0 KNN: check table row counts and run MATCH with OpenAI query embedding.
 * Run: NEOTOMA_SQLITE_PATH=./data/neotoma.prod.db npx tsx scripts/debug_vec_knn.ts
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { createRequire } from "node:module";
import { generateEmbedding } from "../src/embeddings.js";

const createRequireFromMeta = createRequire(import.meta.url);
const sqliteVec = createRequireFromMeta("sqlite-vec") as { load: (d: Database.Database) => void };

const dbPath = process.env.NEOTOMA_SQLITE_PATH || "./.vitest/neotoma.db";
const db = new Database(dbPath);
sqliteVec.load(db);

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS entity_embeddings_vec USING vec0(
    embedding float[1536]
  )
`);

const rowsCount = (db.prepare("SELECT COUNT(*) as c FROM entity_embedding_rows").get() as { c: number }).c;
console.log("entity_embedding_rows count:", rowsCount);

// Test 1: MATCH with embedding from DB (self-query)
const vecSample = db.prepare("SELECT rowid, embedding FROM entity_embeddings_vec LIMIT 1").get() as { rowid: number; embedding: Buffer } | undefined;
if (vecSample?.embedding) {
  const m1 = db.prepare("SELECT rowid, distance FROM entity_embeddings_vec WHERE embedding MATCH ? AND k = 5").all(vecSample.embedding);
  console.log("MATCH with DB embedding (Buffer):", (m1 as any[]).length, "rows");
}

// Test 2: MATCH with Float32Array (same bytes as Buffer)
if (vecSample?.embedding) {
  const buf = vecSample.embedding as Buffer;
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const m2 = db.prepare("SELECT rowid, distance FROM entity_embeddings_vec WHERE embedding MATCH ? AND k = 5").all(f32);
  console.log("MATCH with Float32Array:", (m2 as any[]).length, "rows");
}

// Test 3: MATCH with OpenAI + full query (JOIN + user_id filter)
const userId = "00000000-0000-0000-0000-000000000000";
const queryEmbedding = await generateEmbedding("task project");
if (queryEmbedding) {
  const f32 = new Float32Array(queryEmbedding);
  const blob = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
  const oversample = 500;

  const fullQuery = `
    SELECT r.entity_id, v.distance
    FROM entity_embeddings_vec v
    INNER JOIN entity_embedding_rows r ON r.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
      AND r.user_id = ?
      AND (? IS NULL OR r.entity_type = ?)
      AND (r.merged = 1 OR ? = 1)
    ORDER BY v.distance
  `;
  const fullResult = db.prepare(fullQuery).all(blob, oversample, userId, null, null, 1);
  console.log("Full query (JOIN + user_id filter) result:", (fullResult as any[]).length, "rows");
} else {
  console.log("Skipping (no OPENAI_API_KEY or embed failed)");
}

db.close();
