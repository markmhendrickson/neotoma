#!/usr/bin/env node
/**
 * Backfill contact -> company `works_at` links for EXISTING contacts.
 *
 * GATED / NOT RUN AS PART OF THIS CHANGE. The contact -> company auto-link
 * (schema_definitions.ts `contact.reference_fields`, `resolve_target: true`)
 * only fires going forward, at store time, for NEW observations. Contacts
 * that already had an `organization` field stored before this schema change
 * shipped will NOT retroactively get a `works_at` edge — the reference-field
 * auto-link hook only runs from the store pipeline (`actions.ts` /
 * `server.ts`), not as a standalone reconciliation pass. This script is that
 * reconciliation pass, run manually and explicitly by an operator.
 *
 * What it does:
 *   1. Scans `entity_snapshots` for `entity_type = "contact"` rows whose
 *      snapshot has a non-empty `organization` field.
 *   2. For each, resolves (get-or-create, fuzzy-aware) a `company` entity via
 *      `resolveCompanyEntity` — the exact same resolver the live store path
 *      uses, so backfilled links use identical normalization/fuzzy-matching
 *      rules as new writes.
 *   3. Skips contacts that already have a live `works_at` edge to ANY
 *      company (idempotent — safe to re-run; does not create a second edge
 *      or move an edge to a different company entity if the fuzzy pass
 *      would now resolve differently).
 *   4. Creates the `works_at` relationship via `relationshipsService`
 *      (same primitive the live auto-link hook uses).
 *
 * Usage:
 *   npx tsx scripts/backfill_contact_company_links.ts --dry-run [--user-id=<uuid>] [--limit=N]
 *   npx tsx scripts/backfill_contact_company_links.ts --user-id=<uuid>   # writes
 *
 * Defaults to --dry-run-equivalent SAFETY: the script REFUSES to write
 * unless --user-id is explicitly supplied (no accidental cross-tenant
 * backfill) AND --dry-run is absent. Always run with --dry-run first and
 * review the printed plan before writing.
 */

import "dotenv/config";
import { db } from "../src/db.js";
import { resolveCompanyEntity } from "../src/services/company_resolution.js";
import { relationshipsService } from "../src/services/relationships.js";

interface ContactSnapshotRow {
  entity_id: string;
  user_id: string;
  canonical_name: string | null;
  snapshot: Record<string, unknown> | null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const userIdArg = process.argv.find((a) => a.startsWith("--user-id="));
  const userId = userIdArg ? userIdArg.split("=")[1] : undefined;
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  if (!dryRun && !userId) {
    console.error(
      "Refusing to write: pass --user-id=<uuid> to scope the backfill to one tenant, " +
        "or --dry-run to preview across all tenants without writing."
    );
    process.exit(1);
  }

  console.log(`Mode: ${dryRun ? "dry-run (no writes)" : `WRITE (user_id=${userId})`}`);
  if (limit) console.log(`Limit: ${limit}`);

  let query = db
    .from("entity_snapshots")
    .select("entity_id, user_id, canonical_name, snapshot")
    .eq("entity_type", "contact");
  if (userId) {
    query = query.eq("user_id", userId);
  }
  const { data, error } = limit ? await query.limit(limit) : await query;

  if (error) {
    console.error("Failed to fetch contact snapshots:", error);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log("No contact snapshots found.");
    return;
  }

  const withOrg = (data as ContactSnapshotRow[]).filter((row) => {
    const org = row.snapshot?.organization;
    return typeof org === "string" && org.trim().length > 0;
  });

  console.log(
    `Found ${data.length} contacts, ${withOrg.length} with a non-empty organization field.`
  );

  let linked = 0;
  let alreadyLinked = 0;
  let failed = 0;

  for (let i = 0; i < withOrg.length; i++) {
    const row = withOrg[i];
    const organization = String(row.snapshot!.organization).trim();

    try {
      const existing = await relationshipsService.getRelationshipsForEntity(
        row.entity_id,
        "outgoing",
        false,
        row.user_id
      );
      const hasWorksAt = existing.some((r) => r.relationship_type === "works_at");
      if (hasWorksAt) {
        alreadyLinked++;
        continue;
      }

      if (dryRun) {
        console.log(
          `  [DRY RUN] would link ${row.entity_id} (${row.canonical_name ?? "?"}) ` +
            `-> company("${organization}")`
        );
        linked++;
        continue;
      }

      const company = await resolveCompanyEntity({
        organizationName: organization,
        userId: row.user_id,
      });
      await relationshipsService.createRelationship({
        relationship_type: "works_at",
        source_entity_id: row.entity_id,
        target_entity_id: company.entityId,
        metadata: {
          auto_linked: true,
          auto_link_field: "organization",
          auto_link_entity_type: "contact",
          backfilled: true,
        },
        user_id: row.user_id,
      });
      console.log(
        `  [${i + 1}/${withOrg.length}] linked ${row.entity_id} -> ${company.entityId} ` +
          `(${company.basis}${company.fuzzyScore ? `, score ${company.fuzzyScore.toFixed(3)}` : ""})`
      );
      linked++;
    } catch (err) {
      console.warn(`  [${i + 1}/${withOrg.length}] ${row.entity_id}: FAILED — ${err}`);
      failed++;
    }
  }

  console.log(
    `Done. Linked: ${linked}, already linked (skipped): ${alreadyLinked}, failed: ${failed}` +
      `${dryRun ? " (dry-run, no writes)" : ""}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
