/** Ordinary ingestion never authenticates lifecycle storage metadata. */
import type { DbConnection } from "../repositories/db/driver.js";
export const ENTITY_LIFECYCLE_COLUMNS = [
  "entity_lifecycle_kind",
  "entity_lifecycle_sequence",
  "entity_lifecycle_target_id",
] as const;
export class EntityLifecycleIngressError extends Error {
  readonly code = "ERR_ENTITY_LIFECYCLE_AUTHORITY_INPUT";
  constructor() {
    super("Lifecycle authority metadata is not an ordinary ingestion input");
  }
}
export function assertOrdinaryLifecyclePayload(
  table: string,
  rows: readonly Record<string, unknown>[]
): void {
  if (table === "entity_lifecycle_cutovers" || table === "entity_lifecycle_legacy_membership")
    throw new EntityLifecycleIngressError();
  if (table !== "observations") return;
  for (const row of rows)
    for (const column of ENTITY_LIFECYCLE_COLUMNS) {
      if (row[column] !== null && row[column] !== undefined)
        throw new EntityLifecycleIngressError();
    }
}
/** A raw REPLACE cannot erase a privileged row by omitting its typed columns. */
export async function assertOrdinaryLifecycleUpsert(
  tx: DbConnection,
  rows: readonly Record<string, unknown>[]
): Promise<void> {
  const columns = (await tx.prepare("PRAGMA table_info(observations)").all()) as { name: string }[];
  if (!columns.some((c) => c.name === "entity_lifecycle_kind")) return;
  for (const row of rows)
    if (typeof row.id === "string") {
      const existing = await tx
        .prepare(
          "SELECT id FROM observations WHERE id=? AND (entity_lifecycle_kind IS NOT NULL OR entity_lifecycle_sequence IS NOT NULL OR entity_lifecycle_target_id IS NOT NULL)"
        )
        .get(row.id);
      if (existing) throw new EntityLifecycleIngressError();
    }
}
/** Inspect the input before target writes, including unsupported metadata tables. */
export async function assertOrdinaryLifecycleImport(tx: DbConnection): Promise<void> {
  const tables = (await tx.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) as {
    name: string;
  }[];
  for (const table of ["entity_lifecycle_cutovers", "entity_lifecycle_legacy_membership"]) {
    if (
      tables.some((t) => t.name === table) &&
      (await tx.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())
    )
      throw new EntityLifecycleIngressError();
  }
  if (!tables.some((t) => t.name === "observations")) return;
  const columns = (await tx.prepare("PRAGMA table_info(observations)").all()) as { name: string }[];
  const found = ENTITY_LIFECYCLE_COLUMNS.filter((c) => columns.some((r) => r.name === c));
  if (
    found.length &&
    (await tx
      .prepare(
        `SELECT 1 FROM observations WHERE ${found.map((c) => `${c} IS NOT NULL`).join(" OR ")} LIMIT 1`
      )
      .get())
  )
    throw new EntityLifecycleIngressError();
}
