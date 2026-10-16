/**
 * The entity-search characterization suite (#2659) with ENCRYPTION AT REST on.
 *
 * With `NEOTOMA_ENCRYPTION_ENABLED=true` the lexical prefilter index must never
 * hold plaintext: it is not written, not read, and anything an earlier
 * plaintext period left in it is purged. Search falls back to the full scan,
 * which decrypts snapshots and fragments in process as before.
 *
 * `entity_search_semantics.test.ts` is imported unchanged; every test runs
 * again here on its own database file with encryption on, the maintainer
 * running before each test. `afterAll` checks the instrument (snapshots really
 * are ciphertext at rest) and the claim (the index tables are empty and search
 * never used them).
 */
import { afterAll, beforeAll, beforeEach, expect, vi } from "vitest";

const isolated = vi.hoisted(() => {
  const keys = ["NEOTOMA_SQLITE_PATH", "NEOTOMA_ENCRYPTION_ENABLED", "NEOTOMA_MNEMONIC"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const path =
    `${process.env.NEOTOMA_DATA_DIR ?? "."}/search-index-encrypted-` +
    `${process.pid}-${Date.now()}.db`;
  process.env.NEOTOMA_SQLITE_PATH = path;
  process.env.NEOTOMA_ENCRYPTION_ENABLED = "true";
  // Public BIP-39 test vector, the same one the durable event log tests use.
  process.env.NEOTOMA_MNEMONIC =
    "test test test test test test test test test test test test " +
    "test test test test test test test test test test test junk";
  return { path, previous, keys };
});

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import { rmSync } from "node:fs";
import { isEncryptedColumn } from "../../src/crypto/column_encryption.js";
import { clearDbCache, getDb } from "../../src/repositories/db/connection.js";
import { clearCachedDataKey } from "../../src/repositories/sqlite/local_db_adapter.js";
import { runEntitySearchIndexMaintenance } from "../../src/services/entity_search_index.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { seedSchemaRegistryIfEmpty } from "../../src/services/schema_registry_bootstrap.js";
import { entitySearchPrefilterStats } from "../../src/shared/action_handlers/entity_handlers.js";
import "./entity_search_semantics.test.js";

let ciphertextSnapshotsSeen = 0;

async function count(sql: string): Promise<number> {
  const connection = await getDb();
  const row = (await connection.prepare(sql).get()) as { n: number };
  return Number(row.n);
}

beforeAll(async () => {
  const summary = await seedSchemaRegistryIfEmpty();
  expect(summary.failed).toEqual([]);
  if (!(await schemaRegistry.loadGlobalSchema("plan"))) {
    await schemaRegistry.register({
      entity_type: "plan",
      schema_version: "1.0",
      schema_definition: {
        fields: { title: { type: "string" } },
        canonical_name_fields: ["title"],
      },
      reducer_config: { merge_policies: { title: { strategy: "last_write" } } },
      user_specific: false,
      activate: true,
    });
  }
}, 120000);

beforeEach(async () => {
  const result = await runEntitySearchIndexMaintenance();
  expect(result.inactive).toBe("encryption_at_rest");
  expect(result.backfillComplete).toBe(false);
  // The suite's data is in place by now: check it is ciphertext at rest, so the
  // empty index below is evidence about encryption mode, not an empty database.
  if (ciphertextSnapshotsSeen === 0) {
    const connection = await getDb();
    const rows = (await connection
      .prepare("SELECT snapshot FROM entity_snapshots WHERE snapshot IS NOT NULL")
      .all()) as Array<{ snapshot: string }>;
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) expect(isEncryptedColumn(row.snapshot)).toBe(true);
    ciphertextSnapshotsSeen = rows.length;
  }
  expect(await count("SELECT COUNT(*) AS n FROM entity_search_docs")).toBe(0);
  expect(await count("SELECT COUNT(*) AS n FROM entity_search_fts")).toBe(0);
  expect(await count("SELECT COUNT(*) AS n FROM entity_search_dirty")).toBe(0);
});

afterAll(async () => {
  try {
    expect(ciphertextSnapshotsSeen).toBeGreaterThan(10);
    expect(entitySearchPrefilterStats.strict).toBe(0);
    expect(entitySearchPrefilterStats.partial).toBe(0);
    expect(entitySearchPrefilterStats.fullScan).toBeGreaterThanOrEqual(25);
  } finally {
    clearDbCache();
    for (const key of isolated.keys) {
      const value = isolated.previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearCachedDataKey();
    for (const suffix of ["", "-wal", "-shm"]) rmSync(isolated.path + suffix, { force: true });
  }
});
