/**
 * Backend-independent cases for `entity_snapshots.search_text`. Registered by
 * tests/integration/entity_search_text_column.test.ts (sqlite backend) and
 * tests/integration/entity_search_text_column_libsql.test.ts (libsql worker).
 *
 * Invariant under test: every row's search_text is NULL ("search builds the
 * text the old way") or exactly the text search would build right now.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { config } from "../../src/config.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { createCorrection } from "../../src/services/correction.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import { splitEntity } from "../../src/services/entity_split.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";
import {
  buildEntityLexicalSearchText,
  loadRawFragmentTextByEntityId,
} from "../../src/shared/entity_search_text.js";

// Per-run type names: the sqlite suite reuses one database across runs.
const RUN = randomUUID().replace(/-/g, "").slice(0, 8);
const NOTE = `synthetic_search_text_${RUN}_note`;
const TASK = `synthetic_search_text_${RUN}_task`;

type Row = { entity_id: string; search_text: string | null };

async function searchTextRows(userId: string): Promise<Row[]> {
  const conn = await getDb();
  return (await conn
    .prepare("SELECT entity_id, search_text FROM entity_snapshots WHERE user_id = ?")
    .all(userId)) as Row[];
}

/** The text lexical search would build for this entity now. */
async function freshText(entityId: string): Promise<string> {
  const entity = await db.from("entities").select("canonical_name").eq("id", entityId).single();
  const snapshot = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .single();
  const fragments = await loadRawFragmentTextByEntityId([entityId]);
  return buildEntityLexicalSearchText(
    (entity.data as { canonical_name: string }).canonical_name,
    (snapshot.data as { snapshot: unknown }).snapshot,
    fragments.get(entityId)
  );
}

async function expectNullOrFresh(userId: string): Promise<Row[]> {
  const rows = await searchTextRows(userId);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    if (row.search_text !== null) expect(row.search_text).toBe(await freshText(row.entity_id));
  }
  return rows;
}

async function storeOne(
  userId: string,
  entityType: string,
  fields: Record<string, unknown>
): Promise<string> {
  const result = await storeStructuredForApi({
    userId,
    entities: [{ entity_type: entityType, ...fields }],
    sourcePriority: 100,
    idempotencyKey: "search-text-" + randomUUID(),
  });
  expect(result.success).toBe(true);
  return (result.entities as Array<{ entity_id: string }>)[0].entity_id;
}

async function searchTextOf(entityId: string): Promise<string | null> {
  const conn = await getDb();
  const row = (await conn
    .prepare("SELECT search_text FROM entity_snapshots WHERE entity_id = ?")
    .get(entityId)) as { search_text: string | null } | undefined;
  return row ? row.search_text : null;
}

/**
 * Run `action` with the shared connection's `prepare` wrapped by `intercept`.
 * `intercept` sees each SQL string and the original `prepare`, so it can run a
 * concurrent write before a statement, or throw, on that same connection.
 */
async function withPrepareIntercept<T>(
  intercept: (sql: string, original: DbDatabase["prepare"]) => void,
  action: () => Promise<T>
): Promise<T> {
  const conn = (await getDb()) as DbDatabase & { prepare: DbDatabase["prepare"] };
  const original = conn.prepare.bind(conn);
  const hadOwn = Object.prototype.hasOwnProperty.call(conn, "prepare");
  const previous = conn.prepare;
  conn.prepare = ((sql: string) => {
    intercept(sql, original);
    return original(sql);
  }) as DbDatabase["prepare"];
  try {
    return await action();
  } finally {
    if (hadOwn) conn.prepare = previous;
    else delete (conn as { prepare?: unknown }).prepare;
  }
}

const GUARDED_UPDATE = "UPDATE entity_snapshots SET search_text = ?";
const FILL_HEAD_SELECT = "SELECT s.snapshot AS snapshot, e.canonical_name AS canonical_name";

export function registerEntitySearchTextCases(
  backend: "sqlite" | "libsql",
  openFresh: (file: string) => Promise<DbDatabase>
): void {
  describe(`entity_snapshots.search_text (${backend})`, () => {
    it("runs on the intended backend", () => {
      expect(config.dbBackend).toBe(backend);
    });

    it("store fills the column with the text search would build", async () => {
      const userId = randomUUID();
      const id = await storeOne(userId, NOTE, {
        title: "Synthetic Amber-Marker note",
        contact_email: "synthetic@example.test",
      });
      const rows = await expectNullOrFresh(userId);
      expect(rows.find((r) => r.entity_id === id)?.search_text).toBe(await freshText(id));
      // Internal cache: never surfaced through query-builder reads.
      const viaBuilder = await db.from("entity_snapshots").select("*").eq("entity_id", id).single();
      expect(viaBuilder.data).not.toHaveProperty("search_text");
    });

    it("correct, merge and split keep every row NULL or fresh", async () => {
      const userId = randomUUID();
      const type = TASK;
      const a = await storeOne(userId, type, { title: "Synthetic cobalt task", move: "no" });
      const b = await storeOne(userId, type, { title: "Synthetic saffron task", move: "yes" });
      await expectNullOrFresh(userId);

      await createCorrection({
        entity_id: a,
        entity_type: type,
        user_id: userId,
        schema_version: "1.0",
        field: "title",
        value: "Synthetic corrected cobalt task",
        idempotency_key: "search-text-correct-" + randomUUID(),
      });
      await expectNullOrFresh(userId);

      await mergeEntities({ fromEntityId: b, toEntityId: a, userId, mergedBy: "synthetic" });
      await expectNullOrFresh(userId);

      await splitEntity({
        sourceEntityId: a,
        userId,
        predicate: { observation_field_equals: { field: "move", value: "yes" } },
        newEntity: { entity_type: type, canonical_name: "Synthetic split saffron" },
        idempotencyKey: randomUUID(),
        splitBy: "synthetic",
      });
      await expectNullOrFresh(userId);
    });

    it("writing a raw fragment sets the column to NULL", async () => {
      const userId = randomUUID();
      const id = await storeOne(userId, NOTE, {
        title: "Synthetic fragment target",
      });
      expect(await searchTextOf(id)).not.toBeNull();
      const conn = await getDb();
      await conn
        .prepare(
          "INSERT INTO raw_fragments (id, entity_id, entity_type, fragment_key, fragment_value, user_id) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(randomUUID(), id, NOTE, "late_key", '"late value"', userId);
      expect(await searchTextOf(id)).toBeNull();
    });

    it("a direct snapshot or canonical_name update sets the column to NULL", async () => {
      const userId = randomUUID();
      const id = await storeOne(userId, NOTE, {
        title: "Synthetic direct update",
      });
      const conn = await getDb();
      expect(await searchTextOf(id)).not.toBeNull();
      await conn
        .prepare("UPDATE entity_snapshots SET snapshot = ? WHERE entity_id = ?")
        .run('{"title":"Synthetic rewritten"}', id);
      expect(await searchTextOf(id)).toBeNull();

      const id2 = await storeOne(userId, NOTE, {
        title: "Synthetic renamed entity",
      });
      expect(await searchTextOf(id2)).not.toBeNull();
      await conn
        .prepare("UPDATE entities SET canonical_name = ? WHERE id = ?")
        .run("synthetic other name", id2);
      expect(await searchTextOf(id2)).toBeNull();
    });

    it("a database created before the column existed upgrades when opened", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "neotoma-search-text-upgrade-"));
      const file = path.join(dir, "old.db");
      try {
        const old = await openFresh(file);
        await old
          .prepare(
            "CREATE TABLE entity_snapshots (entity_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, schema_version TEXT NOT NULL, canonical_name TEXT, snapshot TEXT, computed_at TEXT, observation_count INTEGER, last_observation_at TEXT, provenance TEXT, user_id TEXT)"
          )
          .run();
        await old
          .prepare(
            "INSERT INTO entity_snapshots (entity_id, entity_type, schema_version, snapshot, user_id) VALUES ('ent_old', 'synthetic_old', '1.0', '{}', 'u')"
          )
          .run();
        await old.close();

        const upgraded = await openFresh(file);
        try {
          await ensureSchema(upgraded);
          await ensureSchema(upgraded); // idempotent
          const columns = (await upgraded
            .prepare("PRAGMA table_info(entity_snapshots)")
            .all()) as Array<{ name: string }>;
          expect(columns.map((c) => c.name)).toContain("search_text");
          const row = (await upgraded
            .prepare("SELECT search_text FROM entity_snapshots WHERE entity_id = 'ent_old'")
            .get()) as { search_text: string | null };
          expect(row.search_text).toBeNull();
          const triggers = (await upgraded
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'entity_search_text_%'"
            )
            .all()) as Array<{ name: string }>;
          expect(triggers.length).toBe(6);
        } finally {
          await upgraded.close();
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    it("a raw fragment written between the fill's read and its guarded UPDATE leaves the column NULL", async () => {
      const userId = randomUUID();
      const id = await storeOne(userId, NOTE, { title: "Synthetic race fragment base" });
      expect(await searchTextOf(id)).not.toBeNull();
      let fired = 0;
      const pendingWrites: Array<Promise<unknown>> = [];
      const second = await withPrepareIntercept(
        (sql, original) => {
          if (!sql.startsWith(GUARDED_UPDATE)) return;
          fired++;
          // Concurrent writer, queued on the same connection ahead of every
          // guarded UPDATE, so no fill in this store sees its own inputs unchanged.
          pendingWrites.push(
            original(
              "INSERT INTO raw_fragments (id, entity_id, entity_type, fragment_key, fragment_value, user_id) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(randomUUID(), id, NOTE, "race_key_" + fired, '"race value"', userId)
          );
        },
        () => storeOne(userId, NOTE, { title: "Synthetic race fragment base", extra: "x" })
      );
      await Promise.all(pendingWrites);
      expect(second).toBe(id);
      expect(fired).toBeGreaterThan(0);
      expect(await searchTextOf(id)).toBeNull();
      // Control: the same store without a concurrent writer fills the column.
      await storeOne(userId, NOTE, { title: "Synthetic race fragment base", extra: "z" });
      expect(await searchTextOf(id)).toBe(await freshText(id));
    });

    it("a rename between the fill's read and its guarded UPDATE leaves the column NULL", async () => {
      const userId = randomUUID();
      const id = await storeOne(userId, NOTE, { title: "Synthetic race rename base" });
      expect(await searchTextOf(id)).not.toBeNull();
      let fired = 0;
      const pendingWrites: Array<Promise<unknown>> = [];
      await withPrepareIntercept(
        (sql, original) => {
          if (!sql.startsWith(GUARDED_UPDATE)) return;
          fired++;
          pendingWrites.push(
            original("UPDATE entities SET canonical_name = ? WHERE id = ?").run(
              "synthetic raced name " + fired,
              id
            )
          );
        },
        () => storeOne(userId, NOTE, { title: "Synthetic race rename base", extra: "y" })
      );
      await Promise.all(pendingWrites);
      expect(fired).toBeGreaterThan(0);
      expect(await searchTextOf(id)).toBeNull();
    });

    it("with column encryption on, a snapshot write leaves the column NULL", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "neotoma-search-text-key-"));
      const keyFile = path.join(dir, "synthetic.key");
      writeFileSync(keyFile, "cd".repeat(32), { mode: 0o600 });
      const saved = { ...config.encryption };
      config.encryption.enabled = true;
      config.encryption.keyFilePath = keyFile;
      try {
        const userId = randomUUID();
        const id = await storeOne(userId, NOTE, { title: "Synthetic encrypted note" });
        expect(await searchTextOf(id)).toBeNull();
      } finally {
        Object.assign(config.encryption, saved);
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("a failing fill leaves the column NULL and the snapshot write still succeeds", async () => {
      const userId = randomUUID();
      let failed = 0;
      const id = await withPrepareIntercept(
        (sql) => {
          if (sql.startsWith(FILL_HEAD_SELECT)) {
            failed++;
            throw new Error("synthetic fill failure");
          }
        },
        () => storeOne(userId, NOTE, { title: "Synthetic failing fill" })
      );
      expect(failed).toBeGreaterThan(0);
      expect(await searchTextOf(id)).toBeNull();
      const snapshot = await db
        .from("entity_snapshots")
        .select("snapshot")
        .eq("entity_id", id)
        .single();
      expect(JSON.stringify((snapshot.data as { snapshot: unknown }).snapshot)).toContain(
        "Synthetic failing fill"
      );
    });
  });
}
