#!/usr/bin/env tsx
/**
 * Recompute each entity snapshot via recomputeSnapshot() so timeline_events are upserted
 * (same path as post-recompute timeline derivation).
 *
 * Uses the DB from env (set NEOTOMA_ENV=production for prod SQLite).
 *
 * Usage:
 *   NEOTOMA_ENV=production npx tsx scripts/backfill_timeline_via_recompute.ts
 *   NEOTOMA_ENV=production npx tsx scripts/backfill_timeline_via_recompute.ts --dry-run
 */
import { db } from "../src/db.js";
import { recomputeSnapshot } from "../src/services/snapshot_computation.js";

const DEFAULT_USER = "00000000-0000-0000-0000-000000000000";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const { data: rows, error } = await db
    .from("entity_snapshots")
    .select("entity_id, user_id");

  if (error) throw new Error(error.message);

  const list = (rows || []) as Array<{ entity_id: string; user_id: string | null }>;
  console.log(`entity_snapshots rows: ${list.length}`);
  if (dryRun) {
    console.log("Dry run — no recomputes performed.");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of list) {
    const userId = row.user_id?.trim() || DEFAULT_USER;
    try {
      const out = await recomputeSnapshot(row.entity_id, userId);
      if (out) ok += 1;
      else skipped += 1;
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${row.entity_id} user=${userId}:`, e instanceof Error ? e.message : e);
    }
  }

  const { count: te } = await db
    .from("timeline_events")
    .select("*", { count: "exact", head: true });
  console.log(JSON.stringify({ recomputed: ok, skipped_no_observations: skipped, failed, timeline_events_total: te ?? 0 }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
