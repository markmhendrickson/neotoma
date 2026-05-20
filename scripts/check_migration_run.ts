import { db } from "../src/db.js";

const RUN_ID = process.argv[2];
if (!RUN_ID) {
  console.error("Usage: tsx scripts/check_migration_run.ts <run_id>");
  process.exit(1);
}

async function main() {
  // Use ilike on the raw fields JSON column to find sentinel — avoids any
  // JSON-path operator quoting differences between SQLite and PostgREST.
  const { data: all, error: allErr } = await db
    .from("observations")
    .select("id, entity_type, observed_at, fields")
    .ilike("fields", `%${RUN_ID}%`);

  if (allErr) {
    console.error("Query error:", allErr);
    process.exit(1);
  }

  // Re-filter in JS to exact match (ilike may over-match substring run IDs).
  const migrated = (all ?? []).filter((o: any) => {
    try {
      const fields = typeof o.fields === "string" ? JSON.parse(o.fields) : o.fields;
      return fields?._migration_run_id === RUN_ID;
    } catch { return false; }
  });

  console.log(`Migrated observations for run_id=${RUN_ID}: ${migrated.length}`);

  const samples = migrated.slice(0, 6);

  const byType: Record<string, number> = {};
  for (const s of samples ?? []) {
    byType[s.entity_type] = (byType[s.entity_type] ?? 0) + 1;
    const fieldKeys = Object.keys(s.fields ?? {}).filter((k) => k !== "_migration_run_id");
    console.log(`  [${s.entity_type}] ${s.id}`);
    console.log(`    observed_at: ${s.observed_at}`);
    console.log(`    fields: ${fieldKeys.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
