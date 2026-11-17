/**
 * Backend-independent cases for `entity_snapshots.search_text`. Registered by
 * tests/integration/entity_search_text_column.test.ts (sqlite backend) and
 * tests/integration/entity_search_text_column_libsql.test.ts (libsql worker).
 *
 * Invariant under test: every row's search_text is NULL ("search builds the
 * text the old way") or exactly the text search would build right now.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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
  });
}
