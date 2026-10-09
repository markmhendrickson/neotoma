/** Complete native SQLite inspection. No schema setup, repair, or target selection. */
import { createHash } from "node:crypto";
import type { DbConnection } from "../repositories/db/driver.js";

interface SchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}
export interface LifecycleTableInventory {
  name: string;
  columns: Record<string, unknown>[];
  foreign_keys: Record<string, unknown>[];
  indexes: Record<string, unknown>[];
  rows: number;
  sha256: string;
}
export interface LifecycleDatabaseInventory {
  version: "entity_lifecycle_inventory_v1";
  schema: SchemaRow[];
  schema_sha256: string;
  tables: LifecycleTableInventory[];
  sha256: string;
}
function identifier(value: string): string {
  if (!value || value.includes("\0")) throw new Error("LIFECYCLE_INVENTORY_INVALID");
  return `"${value.replaceAll('"', '""')}"`;
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
/** Length framing keeps empty strings, null, types and arbitrary binary contents distinct. */
function frame(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 0xffffffff) throw new Error("LIFECYCLE_INVENTORY_INVALID");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}
/** Type-aware projected row preservation, retaining native byte/type equality. */
export async function inspectLifecycleTable(
  tx: DbConnection,
  table: string,
  columns: readonly string[],
  ids?: ReadonlySet<string>
): Promise<{ rows: number; sha256: string }> {
  const name = identifier(table);
  if (!columns.length || (ids && !columns.includes("id")))
    throw new Error("LIFECYCLE_INVENTORY_INVALID");
  // Encode in SQLite: JS must not round 64-bit INTEGERs or decode arbitrary TEXT/BLOB bytes.
  // SQLite REAL's alternate-form-2 rendering preserves the stored double's significant digits.
  const terms = columns.flatMap((column, index) => {
    const columnName = identifier(column);
    return [
      `typeof(${columnName}) AS t${index}`,
      `CASE typeof(${columnName}) WHEN 'null' THEN '' WHEN 'real' THEN printf('%!.26g',${columnName}) WHEN 'integer' THEN CAST(${columnName} AS TEXT) ELSE hex(CAST(${columnName} AS BLOB)) END AS v${index}`,
    ];
  });
  const order = columns.flatMap((_, index) => [
    `t${index} COLLATE BINARY`,
    `v${index} COLLATE BINARY`,
  ]);
  const hash = createHash("sha256");
  hash.update(frame(JSON.stringify(columns)));
  let rows = 0;
  let scanned = 0;
  for (;;) {
    const batch = (await tx
      .prepare(
        `SELECT ${terms.join(",")} FROM ${name} ORDER BY ${order.join(",")} LIMIT 250 OFFSET ?`
      )
      .all(scanned)) as Record<string, unknown>[];
    if (!batch.length) break;
    for (const row of batch) {
      scanned++;
      if (ids && !ids.has(row[`v${columns.indexOf("id")}`] as string)) continue;
      for (let index = 0; index < columns.length; index++) {
        const type = row[`t${index}`];
        const value = row[`v${index}`];
        if (
          !["null", "text", "blob", "integer", "real"].includes(type as string) ||
          typeof value !== "string"
        )
          throw new Error("LIFECYCLE_INVENTORY_INVALID");
        hash.update(frame(type as string));
        hash.update(frame(value));
      }
      rows++;
      if (!Number.isSafeInteger(rows)) throw new Error("LIFECYCLE_INVENTORY_INVALID");
    }
  }
  const count = (await tx.prepare(`SELECT CAST(COUNT(*) AS TEXT) AS n FROM ${name}`).get()) as {
    n: string;
  };
  if (count.n !== String(scanned)) throw new Error("LIFECYCLE_INVENTORY_INVALID");
  return { rows, sha256: hash.digest("hex") };
}

/** Caller owns the same read/native transaction for the complete scan. */
export async function inspectLifecycleDatabase(
  tx: DbConnection
): Promise<LifecycleDatabaseInventory> {
  const integrity = (await tx.prepare("PRAGMA integrity_check").all()) as Record<string, unknown>[];
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok")
    throw new Error("LIFECYCLE_INVENTORY_INVALID");
  const foreignKeyErrors = await tx.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyErrors.length) throw new Error("LIFECYCLE_INVENTORY_INVALID");
  const schema = (await tx
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY"
    )
    .all()) as SchemaRow[];
  const tables: LifecycleTableInventory[] = [];
  for (const object of schema.filter((row) => row.type === "table")) {
    const name = identifier(object.name);
    const columns = (await tx.prepare(`PRAGMA table_xinfo(${name})`).all()) as Record<
      string,
      unknown
    >[];
    if (!columns.length || columns.some((column) => typeof column.name !== "string"))
      throw new Error("LIFECYCLE_INVENTORY_INVALID");
    const foreign_keys = (await tx.prepare(`PRAGMA foreign_key_list(${name})`).all()) as Record<
      string,
      unknown
    >[];
    const indexes = (await tx.prepare(`PRAGMA index_list(${name})`).all()) as Record<
      string,
      unknown
    >[];
    const content = await inspectLifecycleTable(
      tx,
      object.name,
      columns.map((column) => column.name as string)
    );
    tables.push({
      name: object.name,
      columns,
      foreign_keys,
      indexes,
      ...content,
    });
  }
  const result = {
    version: "entity_lifecycle_inventory_v1" as const,
    schema,
    schema_sha256: digest(schema),
    tables,
  };
  return { ...result, sha256: digest(result) };
}
