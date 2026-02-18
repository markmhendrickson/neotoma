#!/usr/bin/env node
/**
 * Backfill entity embeddings for semantic search.
 * Processes all entity_snapshots, generates embeddings via OpenAI, and stores them.
 * Requires OPENAI_API_KEY. Works with both Supabase and local SQLite backends.
 *
 * Usage: npx tsx scripts/backfill_entity_embeddings.ts [--limit N] [--dry-run]
 */

import "dotenv/config";
import { config } from "../src/config.js";
import { supabase } from "../src/db.js";
import {
  prepareEntitySnapshotWithEmbedding,
  upsertEntitySnapshotWithEmbedding,
} from "../src/services/entity_snapshot_embedding.js";

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const dryRun = process.argv.includes("--dry-run");

  if (!config.openaiApiKey) {
    console.error("OPENAI_API_KEY is not set. Cannot generate embeddings.");
    process.exit(1);
  }

  console.log(`Backend: ${config.storageBackend}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "write"}`);
  if (limit) console.log(`Limit: ${limit}`);

  // Fetch entity_snapshots (optionally limited)
  const query = supabase
    .from("entity_snapshots")
    .select("entity_id, entity_type, schema_version, snapshot, computed_at, observation_count, last_observation_at, provenance, user_id");

  const { data: snapshots, error } = limit
    ? await query.limit(limit)
    : await query;

  if (error) {
    console.error("Failed to fetch entity_snapshots:", error);
    process.exit(1);
  }

  if (!snapshots || snapshots.length === 0) {
    console.log("No entity snapshots to process.");
    return;
  }

  console.log(`Processing ${snapshots.length} entity snapshots...`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const row = snapshots[i] as {
      entity_id: string;
      entity_type: string;
      schema_version: string;
      snapshot: Record<string, unknown>;
      computed_at: string;
      observation_count: number;
      last_observation_at: string;
      provenance: Record<string, unknown>;
      user_id: string;
    };

    try {
      const withEmbedding = await prepareEntitySnapshotWithEmbedding(row);
      if (!withEmbedding.embedding) {
        console.warn(`  [${i + 1}/${snapshots.length}] ${row.entity_id}: no embedding generated`);
        fail++;
        continue;
      }
      if (!dryRun) {
        await upsertEntitySnapshotWithEmbedding(withEmbedding);
      }
      ok++;
      if ((i + 1) % 50 === 0) {
        console.log(`  Processed ${i + 1}/${snapshots.length}...`);
      }
    } catch (err) {
      console.warn(`  [${i + 1}/${snapshots.length}] ${row.entity_id}:`, err);
      fail++;
    }
  }

  console.log(`Done. OK: ${ok}, Failed: ${fail}${dryRun ? " (dry-run, no writes)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
