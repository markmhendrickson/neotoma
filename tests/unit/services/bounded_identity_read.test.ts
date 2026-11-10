import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import type { DbConnection } from "../../../src/repositories/db/driver.js";
import { openLibsqlDatabase } from "../../../src/repositories/libsql/libsql_driver.js";
import { AsyncSqliteDatabase } from "../../../src/repositories/sqlite/sqlite_driver.js";
import { WorkerFileDatabase } from "../../../src/repositories/worker/worker_file_database.js";
import { readBoundedIdentityInView } from "../../../src/services/bounded_identity_read.js";

const owner = "fixture-owner";
const type = "cs_ticket";
const wanted = "manual-case";
const now = "2026-01-01T00:00:00.000Z";
const schema = {
  fields: { ticket_uid: { type: "string" }, comments: { type: "string" } },
  canonical_name_fields: ["ticket_uid"],
};

async function readSqlite<T>(path: string, read: (connection: DbConnection) => Promise<T>) {
  const client = new AsyncSqliteDatabase(path, { existing: true, readOnly: true });
  try {
    return await client.transaction(read);
  } finally {
    await client.close();
  }
}

async function prepare(db: DbConnection) {
  await db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE entities(id TEXT PRIMARY KEY, user_id TEXT, entity_type TEXT, merged_to_entity_id TEXT);
    CREATE TABLE observations(id TEXT PRIMARY KEY, entity_id TEXT, entity_type TEXT, user_id TEXT,
      schema_version TEXT, fields TEXT, observed_at TEXT, created_at TEXT, source_priority INTEGER);
    CREATE TABLE entity_snapshots(entity_id TEXT PRIMARY KEY, user_id TEXT, entity_type TEXT,
      schema_version TEXT, snapshot TEXT, provenance TEXT, observation_count INTEGER, last_observation_at TEXT);
    CREATE TABLE schema_registry(id TEXT PRIMARY KEY, entity_type TEXT, scope TEXT, user_id TEXT,
      active INTEGER, schema_version TEXT, schema_definition TEXT, reducer_config TEXT, metadata TEXT);
  `);
  await db
    .prepare(
      "INSERT INTO schema_registry VALUES ('schema', ?, 'global', NULL, 1, '1.0', ?, ?, '{}')"
    )
    .run(type, JSON.stringify(schema), JSON.stringify({ merge_policies: {} }));
}

function body(value: string, marker = false) {
  return {
    ticket_uid: value,
    comments: marker ? "legitimate comment containing __probe" : "normal",
  };
}

async function seed(
  db: DbConnection,
  id: string,
  value = wanted,
  options: { marker?: boolean; archived?: boolean; rowOwner?: string; rowType?: string } = {}
) {
  const rowOwner = options.rowOwner ?? owner;
  const rowType = options.rowType ?? type;
  const snapshot = body(value, options.marker);
  const fields = { ...snapshot, ...(options.archived && { _deleted: true }) };
  const obs = id + "-obs";
  await db.prepare("INSERT INTO entities VALUES (?, ?, ?, NULL)").run(id, rowOwner, rowType);
  await db
    .prepare(
      `INSERT INTO observations (id,entity_id,entity_type,user_id,schema_version,fields,observed_at,created_at,source_priority)
       VALUES (?, ?, ?, ?, '1.0', ?, ?, ?, 1)`
    )
    .run(obs, id, rowType, rowOwner, JSON.stringify(fields), now, now);
  if (!options.archived) {
    const provenance = { ticket_uid: obs, comments: obs };
    await db
      .prepare("INSERT INTO entity_snapshots VALUES (?, ?, ?, '1.0', ?, ?, 1, ?)")
      .run(id, rowOwner, rowType, JSON.stringify(snapshot), JSON.stringify(provenance), now);
  }
}

describe("bounded identity read", () => {
  it("rejects an invalid field before reading an unbound database", async () => {
    const unavailable = {} as DbConnection;
    await expect(
      readBoundedIdentityInView(unavailable, owner, type, "invalid.field", wanted)
    ).resolves.toEqual({ state: "unproved" });
  });

  for (const backend of ["sqlite", "libsql"] as const) {
    it(`proves only the exact visible owner/type population (${backend})`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "native-identity-"));
      const path = join(dir, "fixture.db");
      const writer =
        backend === "sqlite"
          ? new AsyncSqliteDatabase(path)
          : openLibsqlDatabase(pathToFileURL(path).href);
      const inView = <T>(fn: (connection: DbConnection) => Promise<T>) =>
        writer instanceof WorkerFileDatabase ? writer.withPinnedReadView(fn) : readSqlite(path, fn);
      const read = (connection: DbConnection) =>
        readBoundedIdentityInView(connection, owner, type, "ticket_uid", wanted);
      const acquire = () => inView(read);
      try {
        await prepare(writer);
        await writer.transaction(async (tx) => {
          await seed(tx, "foreign", wanted, { rowOwner: "different-owner" });
          await seed(tx, "other-type", wanted, { rowType: "different_type" });
          await seed(tx, "archived", wanted, { archived: true });
          await seed(tx, "other-uid", "different-case");
        });
        expect(await acquire()).toEqual({ state: "absent" });
        await writer.transaction((tx) => seed(tx, "first"));
        expect(await acquire()).toEqual({
          state: "singleton",
          entity: {
            entity_id: "first",
            entity_type: type,
            snapshot: body(wanted),
            provenance: { ticket_uid: "first-obs", comments: "first-obs" },
          },
        });

        await writer.transaction((tx) => seed(tx, "ahead", wanted, { marker: true }));
        expect(await acquire()).toEqual({ state: "ambiguous" });
        await writer
          .prepare("UPDATE entities SET merged_to_entity_id='first' WHERE id=?")
          .run("ahead");

        await writer.transaction((tx) => seed(tx, "second", wanted, { marker: true }));
        expect(await acquire()).toEqual({ state: "ambiguous" });

        const raced = await inView((connection) => {
          const wrapped: DbConnection = {
            exec: connection.exec.bind(connection),
            prepare(sql) {
              const query = connection.prepare(sql);
              return {
                get: query.get.bind(query),
                run: query.run.bind(query),
                async all(...args) {
                  const result = await query.all(...args);
                  if (sql.includes("AS field")) {
                    await writer.transaction((tx) => seed(tx, "third"));
                    await writer
                      .prepare("UPDATE entities SET merged_to_entity_id='third' WHERE id=?")
                      .run("second");
                    await writer
                      .prepare("UPDATE entities SET merged_to_entity_id='third' WHERE id=?")
                      .run("first");
                  }
                  return result;
                },
              };
            },
          };
          return read(wrapped);
        });
        expect(raced).toEqual({ state: "ambiguous" });
        expect(await acquire()).toMatchObject({
          state: "singleton",
          entity: { entity_id: "third", provenance: { ticket_uid: "third-obs" } },
        });
        await writer
          .prepare("UPDATE entity_snapshots SET snapshot=? WHERE entity_id='third'")
          .run(JSON.stringify(body("incorrect-materialized-key")));
        expect(await acquire()).toEqual({ state: "unproved" });
        await writer
          .prepare("UPDATE entity_snapshots SET snapshot=? WHERE entity_id='third'")
          .run(JSON.stringify(body(wanted)));
        await writer.transaction(async (tx) => {
          for (let index = 0; index < 17; index++) await seed(tx, `cap-${index}`);
        });
        expect(await acquire()).toEqual({ state: "unproved" });
      } finally {
        await writer.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
