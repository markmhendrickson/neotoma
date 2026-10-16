/**
 * The entity-search characterization suite (#2659), run against a CURRENT
 * lexical prefilter index.
 *
 * `entity_search_semantics.test.ts` is imported unchanged and every one of its
 * tests runs here a second time. Before each test the index maintainer brings
 * the index fully up to date, so search acquires its candidates from the FTS
 * index rather than from the dirty set or the full scan. The run uses its own
 * database file (with the built-in schemas seeded, as the server does at boot),
 * so no other test file's writes or index state can leak in.
 *
 * Passing here and in the plain file is the claim the prefilter makes: results
 * are identical whether the index is used or not. `afterAll` proves the index
 * path was actually taken, so this cannot pass by silently falling back.
 */
import { afterAll, beforeAll, beforeEach, expect, vi } from "vitest";

const isolated = vi.hoisted(() => {
  const previous = process.env.NEOTOMA_SQLITE_PATH;
  const path =
    `${process.env.NEOTOMA_DATA_DIR ?? "."}/search-index-semantics-` +
    `${process.pid}-${Date.now()}.db`;
  process.env.NEOTOMA_SQLITE_PATH = path;
  return { path, previous };
});

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import { rmSync } from "node:fs";
import { clearDbCache, getDb } from "../../src/repositories/db/connection.js";
import { runEntitySearchIndexMaintenance } from "../../src/services/entity_search_index.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { seedSchemaRegistryIfEmpty } from "../../src/services/schema_registry_bootstrap.js";
import { entitySearchPrefilterStats } from "../../src/shared/action_handlers/entity_handlers.js";
import "./entity_search_semantics.test.js";

beforeAll(async () => {
  // A fresh database file has an empty schema registry; the server seeds the
  // built-in schemas at boot, and the suite's type-filter tests rely on them.
  const summary = await seedSchemaRegistryIfEmpty();
  expect(summary.failed).toEqual([]);
  // `plan` is not a built-in schema (the plan mirror registers it), but the
  // suite's "type name in the query" tests use it, and the shared test
  // database already carries it. Register a minimal global one here.
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
  expect(result.inactive).toBeNull();
  expect(result.backfillComplete).toBe(true);
  const connection = await getDb();
  const dirty = (await connection
    .prepare("SELECT COUNT(*) AS n FROM entity_search_dirty")
    .get()) as { n: number };
  expect(Number(dirty.n)).toBe(0);
});

afterAll(async () => {
  try {
    // The index answered most of the suite's searches. The exceptions are
    // queries with no token of three or more characters ("plan", which is a
    // type filter), which keep the full scan by design.
    expect(entitySearchPrefilterStats.strict).toBeGreaterThanOrEqual(25);
  } finally {
    clearDbCache();
    if (isolated.previous === undefined) delete process.env.NEOTOMA_SQLITE_PATH;
    else process.env.NEOTOMA_SQLITE_PATH = isolated.previous;
    for (const suffix of ["", "-wal", "-shm"]) rmSync(isolated.path + suffix, { force: true });
  }
});
