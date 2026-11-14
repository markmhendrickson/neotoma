/**
 * In-memory schema lookup cache (src/repositories/db/schema_registry_cache.ts).
 *
 * Covers: a repeat lookup does not touch schema_registry; every write path
 * (register, incremental update, activate, deactivate, metadata update, a
 * write inside an open transaction, a rolled-back write, a raw SQL write that
 * bypasses the adapter) is visible to the next lookup; one user's
 * user-scoped schema never answers another user's lookup; returned rows are
 * copies; a database without the change counter is never served from cache;
 * and the resolve index exists and is the one SQLite chooses.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db.js";
import { getDb } from "../../src/repositories/db/connection.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import {
  resetSchemaRegistryCacheForTests,
  schemaRegistryCacheStatsForTests,
} from "../../src/repositories/db/schema_registry_cache.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";

const TYPE = "schema_registry_cache_test_entity";
const USER_A = "00000000-0000-4000-8000-00000000c0a1";
const USER_B = "00000000-0000-4000-8000-00000000c0b2";

const registry = new SchemaRegistryService();

// An icon up front stops register() from generating one in the background,
// which would write schema_registry again mid-test.
const metadata = {
  icon: { icon_type: "lucide" as const, icon_name: "box", generated_at: "2026-01-01T00:00:00Z" },
};

function definition(...fields: string[]) {
  return {
    fields: Object.fromEntries(fields.map((f) => [f, { type: "string" as const }])),
    identity_opt_out: "heuristic_canonical_name" as const,
  };
}

function reducer(...fields: string[]) {
  return {
    merge_policies: Object.fromEntries(fields.map((f) => [f, { strategy: "last_write" as const }])),
  };
}

async function registerGlobal(version: string, ...fields: string[]) {
  return registry.register({
    entity_type: TYPE,
    schema_version: version,
    schema_definition: definition(...fields),
    reducer_config: reducer(...fields),
    activate: true,
    metadata,
  });
}

async function registerUser(userId: string, version: string, ...fields: string[]) {
  return registry.register({
    entity_type: TYPE,
    schema_version: version,
    schema_definition: definition(...fields),
    reducer_config: reducer(...fields),
    user_id: userId,
    user_specific: true,
    activate: true,
    metadata,
  });
}

function fieldNames(entry: { schema_definition: { fields: Record<string, unknown> } } | null) {
  return entry ? Object.keys(entry.schema_definition.fields).sort() : null;
}

/**
 * Count statements on the shared handle: `n` touch schema_registry itself,
 * `counterReads` read the cache's change counter.
 */
async function countRegistryStatements<T>(
  fn: () => Promise<T>
): Promise<{ result: T; n: number; counterReads: number }> {
  const database = await getDb();
  const spy = vi.spyOn(database, "prepare");
  try {
    const result = await fn();
    const sqls = spy.mock.calls.map(([sql]) => String(sql));
    const n = sqls.filter((sql) => /\bschema_registry\b/.test(sql)).length;
    const counterReads = sqls.filter((sql) =>
      /\bschema_registry_change_counter\b/.test(sql)
    ).length;
    return { result, n, counterReads };
  } finally {
    spy.mockRestore();
  }
}

async function cleanup() {
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

describe("schema lookup cache", () => {
  beforeEach(async () => {
    await cleanup();
    // A long interval, so only explicit invalidation can make a write visible
    // (the change counter is checked once, when the cache first fills).
    resetSchemaRegistryCacheForTests({ checkIntervalMs: 60_000 });
  });

  afterEach(async () => {
    resetSchemaRegistryCacheForTests();
    await cleanup();
  });

  it("serves a repeat lookup without touching schema_registry", async () => {
    await registerGlobal("1.0", "title");
    const first = await countRegistryStatements(() => registry.loadActiveSchema(TYPE, USER_A));
    expect(fieldNames(first.result)).toEqual(["title"]);
    expect(first.n).toBe(2); // user-scoped miss, then global

    const second = await countRegistryStatements(() => registry.loadActiveSchema(TYPE, USER_A));
    expect(fieldNames(second.result)).toEqual(["title"]);
    expect(second.n).toBe(0);
    expect(schemaRegistryCacheStatsForTests().hits).toBe(2);
  });

  it("caches an absent schema too, and a register makes it visible", async () => {
    expect(await registry.loadActiveSchema(TYPE, USER_A)).toBeNull();
    const again = await countRegistryStatements(() => registry.loadActiveSchema(TYPE, USER_A));
    expect(again.result).toBeNull();
    expect(again.n).toBe(0);

    await registerGlobal("1.0", "title");
    expect(fieldNames(await registry.loadActiveSchema(TYPE, USER_A))).toEqual(["title"]);
  });

  it("sees a new version after register with activate", async () => {
    await registerGlobal("1.0", "title");
    await registry.loadGlobalSchema(TYPE);
    await registerGlobal("2.0", "title", "status");
    const after = await registry.loadGlobalSchema(TYPE);
    expect(after?.schema_version).toBe("2.0");
    expect(fieldNames(after)).toEqual(["status", "title"]);
  });

  it("sees an incremental update", async () => {
    await registerGlobal("1.0", "title");
    await registry.loadActiveSchema(TYPE, USER_A);
    await registry.updateSchemaIncremental({
      entity_type: TYPE,
      fields_to_add: [{ field_name: "priority", field_type: "string" }],
      schema_version: "1.1",
      activate: true,
    });
    const after = await registry.loadActiveSchema(TYPE, USER_A);
    expect(after?.schema_version).toBe("1.1");
    expect(fieldNames(after)).toEqual(["priority", "title"]);
  });

  it("sees activate and deactivate", async () => {
    await registerGlobal("1.0", "title");
    await registry.register({
      entity_type: TYPE,
      schema_version: "2.0",
      schema_definition: definition("title", "status"),
      reducer_config: reducer("title", "status"),
      activate: false,
      metadata,
    });
    expect((await registry.loadGlobalSchema(TYPE))?.schema_version).toBe("1.0");

    await registry.activate(TYPE, "2.0");
    expect((await registry.loadGlobalSchema(TYPE))?.schema_version).toBe("2.0");

    await registry.deactivate(TYPE, "2.0");
    expect(await registry.loadGlobalSchema(TYPE)).toBeNull();
  });

  it("sees a metadata update", async () => {
    await registerGlobal("1.0", "title");
    await registry.loadGlobalSchema(TYPE);
    await registry.updateMetadata(TYPE, { guest_access_policy: "closed" });
    expect((await registry.loadGlobalSchema(TYPE))?.metadata?.guest_access_policy).toBe("closed");
  });

  it("refreshes listActiveSchemas after a write", async () => {
    await registerGlobal("1.0", "title");
    const before = (await registry.listActiveSchemas(USER_A)).find((s) => s.entity_type === TYPE);
    expect(before?.schema_version).toBe("1.0");
    await registerGlobal("2.0", "title", "status");
    const after = (await registry.listActiveSchemas(USER_A)).find((s) => s.entity_type === TYPE);
    expect(after?.schema_version).toBe("2.0");
  });

  it("keeps each user's user-scoped schema to that user", async () => {
    await registerGlobal("1.0", "title");
    // Warm B first, so a leak would have to come from A's later write.
    expect(fieldNames(await registry.loadActiveSchema(TYPE, USER_B))).toEqual(["title"]);
    await registerUser(USER_A, "1.0-a", "title", "secret_a");

    expect(fieldNames(await registry.loadActiveSchema(TYPE, USER_A))).toEqual([
      "secret_a",
      "title",
    ]);
    // A's write cleared the cache; warm B (and the global row) again.
    expect(fieldNames(await registry.loadActiveSchema(TYPE, USER_B))).toEqual(["title"]);
    // Now both are warm. Repeat lookups are hits, and still per user.
    const a = await countRegistryStatements(() => registry.loadActiveSchema(TYPE, USER_A));
    const b = await countRegistryStatements(() => registry.loadActiveSchema(TYPE, USER_B));
    const anonymous = await countRegistryStatements(() => registry.loadActiveSchema(TYPE));
    expect(fieldNames(a.result)).toEqual(["secret_a", "title"]);
    expect(fieldNames(b.result)).toEqual(["title"]);
    expect(fieldNames(anonymous.result)).toEqual(["title"]);
    expect(a.n + b.n + anonymous.n).toBe(0);

    const listB = await registry.listActiveSchemas(USER_B);
    expect(listB.filter((s) => s.entity_type === TYPE).map((s) => s.scope)).toEqual(["global"]);
    const listGlobal = await registry.listActiveSchemas();
    expect(listGlobal.some((s) => s.user_id === USER_A)).toBe(false);
  });

  it("returns copies, so a caller's mutation does not reach the next caller", async () => {
    await registerGlobal("1.0", "title");
    const first = await registry.loadGlobalSchema(TYPE);
    (first!.schema_definition.fields as Record<string, unknown>).injected = { type: "string" };
    first!.metadata = { guest_access_policy: "open" };
    const second = await registry.loadGlobalSchema(TYPE);
    expect(fieldNames(second)).toEqual(["title"]);
    expect(second?.metadata?.guest_access_policy).toBeUndefined();
  });

  it("does not serve a pre-commit value once a write inside a transaction commits", async () => {
    const row = await registerGlobal("1.0", "title");
    await registry.loadGlobalSchema(TYPE);

    let releaseTx!: () => void;
    const holdTx = new Promise<void>((resolve) => (releaseTx = resolve));
    let written!: () => void;
    const wrote = new Promise<void>((resolve) => (written = resolve));
    const database = await getDb();
    const tx = database.transaction(async () => {
      const { error } = await db
        .from("schema_registry")
        .update({ metadata: { ...metadata, guest_access_policy: "closed" } })
        .eq("id", row.id);
      expect(error).toBeNull();
      written();
      await holdTx;
    });
    await wrote;

    // While the write is uncommitted, lookups go to the database and store
    // nothing. (The lookup itself waits for the gate on single-writer
    // backends, so it is not awaited until the transaction is released.)
    const bypassesBefore = schemaRegistryCacheStatsForTests().bypasses;
    const during = registry.loadGlobalSchema(TYPE);
    releaseTx();
    await tx;
    await during;
    expect(schemaRegistryCacheStatsForTests().bypasses).toBeGreaterThan(bypassesBefore);

    expect((await registry.loadGlobalSchema(TYPE))?.metadata?.guest_access_policy).toBe("closed");
    // And the cache works again once the transaction has settled.
    const repeat = await countRegistryStatements(() => registry.loadGlobalSchema(TYPE));
    expect(repeat.n).toBe(0);
  });

  it("keeps the committed value when a write inside a transaction rolls back", async () => {
    const row = await registerGlobal("1.0", "title");
    await registry.loadGlobalSchema(TYPE);
    const database = await getDb();
    await expect(
      database.transaction(async () => {
        await db
          .from("schema_registry")
          .update({ metadata: { ...metadata, guest_access_policy: "closed" } })
          .eq("id", row.id);
        // A lookup inside the transaction sees its own uncommitted row. It must
        // not be remembered, or it would outlive the rollback.
        const inside = await registry.loadGlobalSchema(TYPE);
        expect(inside?.metadata?.guest_access_policy).toBe("closed");
        throw new Error("roll back");
      })
    ).rejects.toThrow("roll back");

    expect((await registry.loadGlobalSchema(TYPE))?.metadata?.guest_access_policy).toBeUndefined();
    const repeat = await countRegistryStatements(() => registry.loadGlobalSchema(TYPE));
    expect(repeat.n).toBe(0);
  });

  it("notices a raw SQL write that bypasses the adapter at the next counter check", async () => {
    const row = await registerGlobal("1.0", "title");
    await registry.loadGlobalSchema(TYPE);
    const database = await getDb();
    await database
      .prepare("UPDATE schema_registry SET metadata = ? WHERE id = ?")
      .run(JSON.stringify({ ...metadata, guest_access_policy: "closed" }), row.id);

    // Within the check interval the cache still answers (this is the bounded
    // staleness for writes from outside the adapter, such as another process).
    expect((await registry.loadGlobalSchema(TYPE))?.metadata?.guest_access_policy).toBeUndefined();

    // Once the interval has passed, the counter has moved and the entry is dropped.
    resetSchemaRegistryCacheForTests({ checkIntervalMs: 0 });
    await registry.loadGlobalSchema(TYPE); // fills under the new counter value
    const changedRow = await registry.loadGlobalSchema(TYPE);
    expect(changedRow?.metadata?.guest_access_policy).toBe("closed");
  });

  it("drops entries when the change counter moves between checks", async () => {
    resetSchemaRegistryCacheForTests({ checkIntervalMs: 0 });
    const row = await registerGlobal("1.0", "title");
    await registry.loadGlobalSchema(TYPE);
    const warm = await countRegistryStatements(() => registry.loadGlobalSchema(TYPE));
    expect(warm.n).toBe(0);
    expect(warm.counterReads).toBe(1);

    const database = await getDb();
    await database
      .prepare("UPDATE schema_registry SET metadata = ? WHERE id = ?")
      .run(JSON.stringify({ ...metadata, guest_access_policy: "closed" }), row.id);
    expect((await registry.loadGlobalSchema(TYPE))?.metadata?.guest_access_policy).toBe("closed");
  });

  it("never serves from cache when the change counter is unavailable", async () => {
    await registerGlobal("1.0", "title");
    const database = await getDb();
    const saved = (await database
      .prepare("SELECT version FROM schema_registry_change_counter WHERE id = 1")
      .get()) as { version: number };
    await database.prepare("DELETE FROM schema_registry_change_counter").run();
    try {
      resetSchemaRegistryCacheForTests({ checkIntervalMs: 60_000 });
      await registry.loadGlobalSchema(TYPE);
      const repeat = await countRegistryStatements(() => registry.loadGlobalSchema(TYPE));
      expect(repeat.n).toBe(1);
      expect(schemaRegistryCacheStatsForTests().hits).toBe(0);
    } finally {
      await database
        .prepare(
          "INSERT OR REPLACE INTO schema_registry_change_counter (id, version) VALUES (1, ?)"
        )
        .run(saved.version + 1);
    }
  });

  it("can be turned off", async () => {
    await registerGlobal("1.0", "title");
    vi.stubEnv("NEOTOMA_SCHEMA_REGISTRY_CACHE", "off");
    try {
      await registry.loadGlobalSchema(TYPE);
      const repeat = await countRegistryStatements(() => registry.loadGlobalSchema(TYPE));
      expect(repeat.n).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("schema_registry boot DDL (fresh database)", () => {
  // A fresh file, so this checks what ensureSchema creates rather than what an
  // earlier run left in the shared test database.
  let dir: string;
  let fresh: AsyncSqliteDatabase;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "schema-registry-ddl-"));
    fresh = new AsyncSqliteDatabase(join(dir, "fresh.db"));
    await ensureSchema(fresh);
  });

  afterAll(async () => {
    await fresh.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the resolve index, and SQLite chooses it for every active-schema lookup", async () => {
    const indexes = (await fresh
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'schema_registry'"
      )
      .all()) as Array<{ name: string; sql: string }>;
    const resolve = indexes.find((i) => i.name === "idx_schema_registry_resolve");
    expect(resolve?.sql).toMatch(/\(\s*entity_type\s*,\s*scope\s*,\s*active\s*,\s*user_id\s*\)/);

    // The statements the query adapter builds for loadUserSpecificSchema and
    // loadGlobalSchema, and the in-transaction resolver's two statements.
    const statements = [
      "SELECT * FROM schema_registry WHERE entity_type = ? AND user_id = ? AND scope = ? AND active = ?",
      "SELECT * FROM schema_registry WHERE entity_type = ? AND scope = ? AND active = ?",
      "SELECT * FROM schema_registry WHERE entity_type = ? AND scope = 'user' AND user_id = ? AND active = 1",
      "SELECT * FROM schema_registry WHERE entity_type = ? AND scope = 'global' AND active = 1",
    ];
    for (const sql of statements) {
      const placeholders = (sql.match(/\?/g) ?? []).length;
      const params = ["x", "user", "global", 1].slice(0, placeholders);
      const plan = (await fresh.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params)) as Array<{
        detail: string;
      }>;
      const detail = plan.map((p) => p.detail).join(" | ");
      expect(detail, sql).toContain("USING INDEX idx_schema_registry_resolve");
    }
  });

  it("bumps the change counter on insert, update and delete", async () => {
    const version = async () =>
      (
        (await fresh
          .prepare("SELECT version FROM schema_registry_change_counter WHERE id = 1")
          .get()) as { version: number }
      ).version;
    const v0 = await version();
    await fresh
      .prepare(
        "INSERT INTO schema_registry (id, entity_type, schema_version, schema_definition, reducer_config, active, scope) VALUES ('ddl-1', 'ddl_test', '1.0', '{}', '{}', 1, 'global')"
      )
      .run();
    const v1 = await version();
    await fresh.prepare("UPDATE schema_registry SET active = 0 WHERE id = 'ddl-1'").run();
    const v2 = await version();
    await fresh.prepare("DELETE FROM schema_registry WHERE id = 'ddl-1'").run();
    const v3 = await version();
    expect([v1 - v0, v2 - v1, v3 - v2]).toEqual([1, 1, 1]);

    // Re-running the boot DDL keeps the counter and does not duplicate triggers.
    await ensureSchema(fresh);
    expect(await version()).toBe(v3);
    const triggers = (await fresh
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'schema_registry'"
      )
      .all()) as Array<{ name: string }>;
    expect(triggers.map((t) => t.name).sort()).toEqual([
      "schema_registry_change_after_delete",
      "schema_registry_change_after_insert",
      "schema_registry_change_after_update",
    ]);
  });
});
