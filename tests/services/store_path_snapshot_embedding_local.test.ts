/**
 * Regression tests for issue #1965 — SQLite/local backend branch.
 *
 * Companion to `store_path_snapshot_embedding.test.ts`, which forces
 * `storageBackend: "postgres"` so the `embedding` lands in the upsert payload.
 * That leaves the branch that actually runs in production untested: the local
 * SQLite backend has no `embedding` column, so vectors are stored out-of-band
 * in sqlite-vec via `storeLocalEntityEmbedding`.
 *
 * The mocked `config` is module-level and cannot be re-mocked per test, so the
 * local branch needs its own file.
 *
 * Asserts, on the local backend:
 *   (a) an embedding generated on the store path is handed to sqlite-vec;
 *   (b) the `embedding` key is NOT written into the entity_snapshots payload
 *       (the column does not exist there — including it would break the write);
 *   (c) with no provider configured, nothing is handed to sqlite-vec and the
 *       store still succeeds.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const EMBEDDING_DIM = 1536;

/** A deterministic, valid-dimension embedding. */
function makeEmbedding(seed = 1): number[] {
  const arr = new Array(EMBEDDING_DIM).fill(0) as number[];
  arr[seed % EMBEDDING_DIM] = 1;
  return arr;
}

const USER_ID = "00000000-0000-0000-0000-000000000000";
const ENTITY_ID = "ent_1965_store_path_local";

const captured = vi.hoisted(() => ({
  upsertedSnapshotRows: [] as Array<Record<string, unknown>>,
  selectedTables: [] as string[],
  entityId: "ent_1965_store_path_local",
  userId: "00000000-0000-0000-0000-000000000000",
}));

const upsertedSnapshotRows = captured.upsertedSnapshotRows;

vi.mock("../../src/db.js", () => {
  const ENTITY_ID = captured.entityId;
  const USER_ID = captured.userId;
  const { upsertedSnapshotRows, selectedTables } = captured;
  const observationRow = {
    id: "obs_1965_local_1",
    entity_id: ENTITY_ID,
    entity_type: "contact",
    user_id: USER_ID,
    source_id: "src_1965_local",
    observed_at: "2026-07-22T00:00:00.000Z",
    source_priority: 1,
    fields: { name: "Ada Lovelace", email: "ada@example.com" },
  };
  function table(name: string): any {
    const chain: any = {
      select: () => {
        selectedTables.push(name);
        return chain;
      },
      eq: () => chain,
      not: () => chain,
      limit: async () => ({ data: [], error: null }),
      order: () => chain,
      maybeSingle: async () => {
        if (name === "entities") {
          return {
            data: {
              id: ENTITY_ID,
              canonical_name: "Ada Lovelace",
              aliases: [],
              user_id: USER_ID,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (name === "entities") {
          return { data: { canonical_name: "Ada Lovelace" }, error: null };
        }
        return { data: null, error: null };
      },
      update: () => chain,
      delete: () => chain,
      upsert: async (payload: Record<string, unknown>) => {
        if (name === "entity_snapshots") upsertedSnapshotRows.push(payload);
        return { data: null, error: null };
      },
      then: undefined,
    };
    if (name === "observations") {
      chain.eq = () => {
        const obsChain: any = {
          eq: () => obsChain,
          order: () => obsChain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: [observationRow], error: null }),
        };
        return obsChain;
      };
    }
    return chain;
  }
  return { db: { from: (name: string) => table(name) } };
});

vi.mock("../../src/reducers/observation_reducer.js", () => ({
  observationReducer: {
    computeSnapshot: vi.fn().mockResolvedValue({
      entity_id: captured.entityId,
      entity_type: "contact",
      schema_version: "1.0",
      snapshot: { name: "Ada Lovelace", email: "ada@example.com" },
      computed_at: "2026-07-22T00:00:00.000Z",
      observation_count: 1,
      last_observation_at: "2026-07-22T00:00:00.000Z",
      provenance: { name: "obs_1965_local_1" },
      user_id: captured.userId,
    }),
  },
}));

vi.mock("../../src/services/timeline_events.js", () => ({
  upsertTimelineEventsForEntitySnapshot: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/schema_registry.js", () => ({
  schemaRegistry: { loadActiveSchema: vi.fn().mockResolvedValue(null) },
}));

const spies = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  hasEmbeddingProvider: vi.fn(),
  storeLocalEntityEmbedding: vi.fn(),
}));
const generateEmbedding = spies.generateEmbedding;
const hasEmbeddingProvider = spies.hasEmbeddingProvider;
const storeLocalEntityEmbedding = spies.storeLocalEntityEmbedding;

vi.mock("../../src/embeddings.js", () => ({
  generateEmbedding: (text: string) => spies.generateEmbedding(text),
  hasEmbeddingProvider: () => spies.hasEmbeddingProvider(),
  getEntitySearchableText: (
    entityType: string,
    canonicalName: string,
    snapshot: Record<string, unknown>
  ) => `${entityType} ${canonicalName} ${JSON.stringify(snapshot)}`,
}));

// The sqlite-vec sink: on the local backend this is where vectors actually go.
vi.mock("../../src/services/local_entity_embedding.js", () => ({
  storeLocalEntityEmbedding: (row: unknown) => spies.storeLocalEntityEmbedding(row),
}));

// The branch under test: the backend Bottega8 and every default install run.
vi.mock("../../src/config.js", () => ({
  config: { storageBackend: "local", openaiApiKey: "test-key" },
}));

import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

describe("store path embeddings on the local/SQLite backend (issue #1965)", () => {
  beforeEach(() => {
    upsertedSnapshotRows.length = 0;
    generateEmbedding.mockReset();
    hasEmbeddingProvider.mockReset();
    storeLocalEntityEmbedding.mockReset();
  });

  it("routes the embedding to sqlite-vec and keeps it out of the snapshot payload", async () => {
    hasEmbeddingProvider.mockReturnValue(true);
    generateEmbedding.mockResolvedValue(makeEmbedding(11));

    const result = await recomputeSnapshot(ENTITY_ID, USER_ID);

    expect(result).not.toBeNull();
    expect(upsertedSnapshotRows).toHaveLength(1);

    // The regression this file exists for: on SQLite the vector must reach
    // sqlite-vec, not be silently dropped.
    expect(storeLocalEntityEmbedding).toHaveBeenCalledTimes(1);
    const stored = storeLocalEntityEmbedding.mock.calls[0][0] as Record<string, unknown>;
    expect(stored.entity_id).toBe(ENTITY_ID);
    expect(stored.user_id).toBe(USER_ID);
    expect(stored.entity_type).toBe("contact");
    expect(stored.embedding).toEqual(makeEmbedding(11));

    // entity_snapshots has no `embedding` column on SQLite; including the key
    // would break the write.
    expect("embedding" in upsertedSnapshotRows[0]).toBe(false);
  });

  it("stores nothing in sqlite-vec when no provider is configured, and still succeeds", async () => {
    hasEmbeddingProvider.mockReturnValue(false);

    const result = await recomputeSnapshot(ENTITY_ID, USER_ID);

    expect(result).not.toBeNull();
    expect(upsertedSnapshotRows).toHaveLength(1);
    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(storeLocalEntityEmbedding).not.toHaveBeenCalled();
    expect("embedding" in upsertedSnapshotRows[0]).toBe(false);
  });

  it("does not fail the store when the provider throws", async () => {
    hasEmbeddingProvider.mockReturnValue(true);
    generateEmbedding.mockRejectedValue(new Error("provider unavailable"));

    const result = await recomputeSnapshot(ENTITY_ID, USER_ID);

    expect(result).not.toBeNull();
    expect(upsertedSnapshotRows).toHaveLength(1);
    expect(storeLocalEntityEmbedding).not.toHaveBeenCalled();
  });
});
