#!/usr/bin/env tsx
/**
 * Backfill stale `entities.canonical_name` values.
 *
 * Before the re-derive fix, `entities.canonical_name` was written once at
 * entity creation and never refreshed when a later observation changed the
 * field it derives from. Entities corrected before the fix landed still carry
 * their original name — e.g. a contact created as "🦄 Rani Sweis" and later
 * corrected to "Rani Sweis" still displays the emoji, because canonical_name
 * is what entity lists and search render.
 *
 * This re-derives canonical_name from each entity's CURRENT snapshot, using
 * the same guarded helper the write path now uses: it skips collisions, skips
 * entities whose snapshot lacks name signal, and preserves the prior name in
 * `aliases` so lookups by the old identifier keep working.
 *
 * It derives from the stored snapshot — it does NOT re-run any text cleanup.
 * If a name was cleaned thoughtfully (preserving "James O'Brien" or
 * "Vincent Kok (VK) 郭进强, MCT, ACLP"), that cleaned value is what lands.
 *
 * SCOPE — why this is deliberately narrow:
 * Re-deriving with full schema precedence is NOT safe as a bulk operation. The
 * `contact` schema declares canonical_name_fields ["email", "phone",
 * "external_id", "contact_id", "name"], so an unconstrained re-derive renames
 * contacts to their EMAIL, and the generic heuristic can fall through to
 * `organization` or `title`. A dry run over local data proposed
 * "Manual Contact" -> "ManualOrg" and "Sample Contact" -> "sample@example.com".
 *
 * So by default this only rewrites an entity when the newly derived name comes
 * from the SAME field the current name came from — i.e. it repairs a stale
 * value rather than re-picking which field supplies identity. Pass
 * --allow-field-change to opt into the unconstrained behavior (rarely correct;
 * always --dry-run first).
 *
 * Usage:
 *   NEOTOMA_ENV=production npx tsx scripts/backfill_canonical_names.ts --dry-run
 *   NEOTOMA_ENV=production npx tsx scripts/backfill_canonical_names.ts
 *   NEOTOMA_ENV=production npx tsx scripts/backfill_canonical_names.ts --entity-type contact
 */

import { db } from "../src/db.js";
import { maybeRederiveCanonicalName } from "../src/services/snapshot_computation.js";
import { schemaRegistry, type SchemaDefinition } from "../src/services/schema_registry.js";

const DEFAULT_USER = "00000000-0000-0000-0000-000000000000";

const dryRun = process.argv.includes("--dry-run");
const allowFieldChange = process.argv.includes("--allow-field-change");
const typeArgIdx = process.argv.indexOf("--entity-type");
const onlyType = typeArgIdx !== -1 ? process.argv[typeArgIdx + 1] : null;

/**
 * Which snapshot field currently supplies this entity's canonical_name?
 * Compared case-insensitively and whitespace-normalized, since the stored name
 * passes through formatCanonicalNameForStorage.
 */
export function sourceFieldOf(
  canonicalName: string,
  snapshot: Record<string, unknown>
): string | null {
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(canonicalName);
  if (!target) return null;
  for (const [k, v] of Object.entries(snapshot)) {
    if (typeof v !== "string") continue;
    if (norm(v) === target) return k;
  }
  return null;
}

/**
 * Fields whose value is a legitimate display name. A backfill may only move a
 * canonical_name to a value drawn from one of these — never to an email,
 * organization, title, or other non-name field, however the schema's
 * canonical_name_fields precedence happens to rank them.
 */
export const NAME_FIELDS = ["name", "full_name", "display_name", "canonical_name"];

/**
 * True when rewriting `before` -> `after` would change WHICH field supplies the
 * name (e.g. name -> email / organization), as opposed to refreshing a stale
 * value of the same field.
 *
 * The rule is deliberately strict: the new value MUST equal one of the
 * entity's name-ish fields. A derived value that matches `email`,
 * `organization`, or `title` — or matches no snapshot field at all — is
 * treated as a field change and skipped. Being wrong here renames real people
 * to their employer, so the default is to do nothing.
 */
export function changesSourceField(
  before: string,
  after: string,
  snapshot: Record<string, unknown>
): boolean {
  const afterField = sourceFieldOf(after, snapshot);
  if (afterField === null) return true; // can't attribute it — don't touch
  return !NAME_FIELDS.includes(afterField);
}

const userArgIdx = process.argv.indexOf("--user-id");
const userId = userArgIdx !== -1 ? process.argv[userArgIdx + 1] : DEFAULT_USER;

const BATCH = 500;

async function main() {
  const schemaCache = new Map<string, SchemaDefinition | null>();
  async function loadSchema(entityType: string): Promise<SchemaDefinition | null> {
    if (schemaCache.has(entityType)) return schemaCache.get(entityType) ?? null;
    let schema: SchemaDefinition | null = null;
    try {
      const entry = await schemaRegistry.loadActiveSchema(entityType, userId);
      schema = entry?.schema_definition ?? null;
    } catch {
      schema = null;
    }
    schemaCache.set(entityType, schema);
    return schema;
  }

  let offset = 0;
  let scanned = 0;
  let changed = 0;
  let unchanged = 0;
  let failed = 0;
  let skippedFieldChange = 0;
  const examples: Array<{ entity_id: string; before: string; after: string }> = [];
  const skippedExamples: Array<{ entity_id: string; before: string; would_become: string }> = [];

  for (;;) {
    let q = db
      .from("entities")
      .select("id, entity_type, canonical_name")
      .range(offset, offset + BATCH - 1);
    if (onlyType) q = q.eq("entity_type", onlyType);

    const { data, error } = await q;
    if (error) throw new Error(`Failed to page entities: ${error.message}`);
    const rows = (data ?? []) as Array<{
      id: string;
      entity_type: string;
      canonical_name: string | null;
    }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      try {
        const { data: snapRow } = await db
          .from("entity_snapshots")
          .select("snapshot")
          .eq("entity_id", row.id)
          .maybeSingle();
        const snapshot =
          ((snapRow as { snapshot?: Record<string, unknown> } | null)?.snapshot as Record<
            string,
            unknown
          >) || {};
        if (Object.keys(snapshot).length === 0) {
          unchanged++;
          continue;
        }

        const before = String(row.canonical_name ?? "");

        if (dryRun) {
          // Derive without writing, so --dry-run reports the same set the real
          // run would change (minus collision outcomes, which need the write).
          const { deriveCanonicalNameFromFieldsWithTrace, CanonicalNameUnresolvedError } =
            await import("../src/services/entity_resolution.js");
          try {
            const schema = await loadSchema(row.entity_type);
            const derived = deriveCanonicalNameFromFieldsWithTrace(
              row.entity_type,
              snapshot,
              schema
            );
            if (
              derived.canonicalName &&
              derived.canonicalName !== before &&
              (allowFieldChange || !changesSourceField(before, derived.canonicalName, snapshot))
            ) {
              changed++;
              if (examples.length < 20) {
                examples.push({ entity_id: row.id, before, after: derived.canonicalName });
              }
            } else if (
              derived.canonicalName &&
              derived.canonicalName !== before &&
              changesSourceField(before, derived.canonicalName, snapshot)
            ) {
              skippedFieldChange++;
              if (skippedExamples.length < 10) {
                skippedExamples.push({
                  entity_id: row.id,
                  before,
                  would_become: derived.canonicalName,
                });
              }
            } else {
              unchanged++;
            }
          } catch (err) {
            if (err instanceof CanonicalNameUnresolvedError) unchanged++;
            else throw err;
          }
          continue;
        }

        // Pre-check the same guard the dry run applies, so a real run never
        // performs a rewrite the dry run said it would skip.
        if (!allowFieldChange) {
          const { deriveCanonicalNameFromFieldsWithTrace, CanonicalNameUnresolvedError } =
            await import("../src/services/entity_resolution.js");
          try {
            const derived = deriveCanonicalNameFromFieldsWithTrace(
              row.entity_type,
              snapshot,
              await loadSchema(row.entity_type)
            );
            if (
              derived.canonicalName &&
              derived.canonicalName !== before &&
              changesSourceField(before, derived.canonicalName, snapshot)
            ) {
              skippedFieldChange++;
              if (skippedExamples.length < 10) {
                skippedExamples.push({
                  entity_id: row.id,
                  before,
                  would_become: derived.canonicalName,
                });
              }
              continue;
            }
          } catch (err) {
            if (!(err instanceof CanonicalNameUnresolvedError)) throw err;
            unchanged++;
            continue;
          }
        }

        await maybeRederiveCanonicalName({
          entityId: row.id,
          entityType: row.entity_type,
          userId,
          snapshot,
          schema: await loadSchema(row.entity_type),
        });

        const { data: after } = await db
          .from("entities")
          .select("canonical_name")
          .eq("id", row.id)
          .maybeSingle();
        const afterName = String(
          (after as { canonical_name?: string } | null)?.canonical_name ?? ""
        );
        if (afterName !== before) {
          changed++;
          if (examples.length < 20) {
            examples.push({ entity_id: row.id, before, after: afterName });
          }
        } else {
          unchanged++;
        }
      } catch (err) {
        failed++;
        console.error(
          `[backfill] ${row.id} (${row.entity_type}) failed: ` +
            (err instanceof Error ? err.message : String(err))
        );
      }
    }

    offset += rows.length;
    if (rows.length < BATCH) break;
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "commit",
        entity_type: onlyType ?? "(all)",
        allow_field_change: allowFieldChange,
        scanned,
        changed,
        unchanged,
        skipped_field_change: skippedFieldChange,
        failed,
        examples,
        skipped_examples: skippedExamples,
      },
      null,
      2
    )
  );
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
