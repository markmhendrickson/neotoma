#!/usr/bin/env tsx
/**
 * Read-only diagnostics for timeline_events vs entity graph (uses configured DB from env).
 *
 * Usage:
 *   npx tsx scripts/check_timeline_health.ts
 *   npx tsx scripts/check_timeline_health.ts --user-id <uuid>
 *
 * Explains common empty-timeline cases: no rows, API source filter, snapshots without deriveable date fields.
 */
import { db } from "../src/db.js";
import { deriveTimelineEventsFromSnapshot } from "../src/services/timeline_events.js";

function parseArgs(): { userId?: string } {
  const args = process.argv.slice(2);
  let userId: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user-id" && args[i + 1]) {
      userId = args[i + 1];
      i++;
    }
  }
  return { userId };
}

async function main() {
  const { userId } = parseArgs();

  const { count: timelineTotal, error: teErr } = await db
    .from("timeline_events")
    .select("*", { count: "exact", head: true });
  if (teErr) throw teErr;

  const { count: snapshotTotal, error: esErr } = await db
    .from("entity_snapshots")
    .select("*", { count: "exact", head: true });
  if (esErr) throw esErr;

  const { count: obsTotal, error: obsErr } = await db
    .from("observations")
    .select("*", { count: "exact", head: true });
  if (obsErr) throw obsErr;

  console.log("Global counts:");
  console.log(`  timeline_events:   ${timelineTotal ?? 0}`);
  console.log(`  entity_snapshots: ${snapshotTotal ?? 0}`);
  console.log(`  observations:     ${obsTotal ?? 0}`);
  console.log("");

  const { data: samples, error: sampleErr } = await db
    .from("entity_snapshots")
    .select("entity_id, entity_type, snapshot")
    .limit(50);
  if (sampleErr) throw sampleErr;

  let withDeriveable = 0;
  for (const row of samples || []) {
    const snap = (row.snapshot as Record<string, unknown>) || {};
    const rows = deriveTimelineEventsFromSnapshot(
      String(row.entity_type),
      String(row.entity_id),
      "diag-source",
      "diag-user",
      snap
    );
    if (rows.length > 0) withDeriveable += 1;
  }
  console.log(
    `Sample of ${(samples || []).length} entity_snapshots: ${withDeriveable} would produce ≥1 timeline row (known date fields in merged snapshot).`
  );
  console.log("");

  if (userId) {
    const { data: userSources, error: srcErr } = await db
      .from("sources")
      .select("id")
      .eq("user_id", userId);
    if (srcErr) throw srcErr;
    const ids = (userSources || []).map((s: { id: string }) => s.id);
    console.log(`User ${userId}: ${ids.length} source(s).`);
    if (ids.length === 0) {
      console.log(
        "  GET /timeline (authenticated) returns empty when this user has no sources — even if timeline_events rows exist for other users."
      );
    } else {
      let userTimeline = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { count, error } = await db
          .from("timeline_events")
          .select("*", { count: "exact", head: true })
          .in("source_id", chunk);
        if (error) throw error;
        userTimeline += count ?? 0;
      }
      console.log(`  timeline_events with source_id in user's sources: ${userTimeline}`);
    }
  } else {
    console.log("Pass --user-id <uuid> to see source count and timeline rows visible to GET /timeline for that user.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
