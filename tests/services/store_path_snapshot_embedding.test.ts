/**
 * Regression tests for issue #1965: the primary store path never generated
 * embeddings, so semantic search silently degraded to lexical.
 *
 * `recomputeSnapshot` is the single snapshot writer behind the `store`,
 * `correct`, and `split_entity` paths. It used to do a raw
 * `db.from("entity_snapshots").upsert(...)`, which never populated the
 * `embedding` column — while every *repair* path (health check, schema-lag
 * repair, schema_registry migration, interpretation) went through the
 * embedding-aware helpers.
 *
 * These tests drive `recomputeSnapshot` against a mocked db + mocked embedding
 * provider and assert:
 *   (a) with a provider configured, the snapshot row is written WITH an
 *       embedding derived from the entity's searchable text;
 *   (b) with NO provider configured, the store still succeeds and the row is
 *       written with a null embedding — never throwing, never blocking, and
 *       without paying for the canonical_name lookup that only exists to feed
 *       the embedding.
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
const ENTITY_ID = "ent_1965_store_path";

/**
 * Shared capture buffers. `vi.mock` factories are hoisted above const
 * initialization, so they must reach these through `vi.hoisted` rather than
 * closing over module-level bindings.
 */
const captured = vi.hoisted(() => ({
  /** Rows captured from `entity_snapshots` upserts. */
  upsertedSnapshotRows: [] as Array<Record<string, unknown>>,
  /** Tables touched with a select, so we can assert the no-provider fast path. */
  selectedTables: [] as string[],
  entityId: "ent_1965_store_path",
  userId: "00000000-0000-0000-0000-000000000000",
}));

const upsertedSnapshotRows = captured.upsertedSnapshotRows;
const selectedTables = captured.selectedTables;

vi.mock("../../src/db.js", () => {
  const ENTITY_ID = captured.entityId;
  const USER_ID = captured.userId;
  const { upsertedSnapshotRows, selectedTables } = captured;
  const observationRow = {
    id: "obs_1965_1",
    entity_id: ENTITY_ID,
    entity_type: "contact",
    user_id: USER_ID,
    source_id: "src_1965",
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
    // `observations` is awaited directly after .select().eq().eq()
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

// Keep the reducer deterministic: recomputeSnapshot's job here is the WRITE,
// not the merge semantics (covered by the reducer's own tests).
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
      provenance: { name: "obs_1965_1" },
      user_id: captured.userId,
    }),
  },
}));

// Timeline + schema lookups are orthogonal to the embedding fix.
vi.mock("../../src/services/timeline_events.js", () => ({
  upsertTimelineEventsForEntitySnapshot: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/schema_registry.js", () => ({
  schemaRegistry: { loadActiveSchema: vi.fn().mockResolvedValue(null) },
}));

// The embedding provider under our control.
const spies = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  hasEmbeddingProvider: vi.fn(),
}));
const generateEmbedding = spies.generateEmbedding;
const hasEmbeddingProvider = spies.hasEmbeddingProvider;
vi.mock("../../src/embeddings.js", () => ({
  generateEmbedding: (text: string) => spies.generateEmbedding(text),
  hasEmbeddingProvider: () => spies.hasEmbeddingProvider(),
  getEntitySearchableText: (
    entityType: string,
    canonicalName: string,
    snapshot: Record<string, unknown>
  ) => `${entityType} ${canonicalName} ${JSON.stringify(snapshot)}`,
}));

// Force the non-local branch so `embedding` is actually included in the payload
// (the local/SQLite backend has no embedding column and stores vectors
// out-of-band via sqlite-vec).
vi.mock("../../src/config.js", () => ({
  config: { storageBackend: "postgres", openaiApiKey: "test-key" },
}));

import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

describe("store path generates entity embeddings (issue #1965)", () => {
  beforeEach(() => {
    upsertedSnapshotRows.length = 0;
    selectedTables.length = 0;
    generateEmbedding.mockReset();
    hasEmbeddingProvider.mockReset();
  });

  it("writes an embedding when a provider is configured", async () => {
    hasEmbeddingProvider.mockReturnValue(true);
    generateEmbedding.mockResolvedValue(makeEmbedding(7));

    const result = await recomputeSnapshot(ENTITY_ID, USER_ID);

    expect(result).not.toBeNull();
    expect(upsertedSnapshotRows).toHaveLength(1);

    const row = upsertedSnapshotRows[0];
    expect(row.entity_id).toBe(ENTITY_ID);
    // The regression: this used to be absent entirely.
    expect(Array.isArray(row.embedding)).toBe(true);
    expect((row.embedding as number[]).length).toBe(EMBEDDING_DIM);
    expect(row.embedding).toEqual(makeEmbedding(7));

    // The embedded text is the structured output: type + canonical_name + snapshot.
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    const embeddedText = generateEmbedding.mock.calls[0][0] as string;
    expect(embeddedText).toContain("contact");
    expect(embeddedText).toContain("Ada Lovelace");
    expect(embeddedText).toContain("ada@example.com");
  });

  it("still stores successfully when no provider is configured", async () => {
    hasEmbeddingProvider.mockReturnValue(false);

    const result = await recomputeSnapshot(ENTITY_ID, USER_ID);

    // Storing must succeed with the embedding simply absent.
    expect(result).not.toBeNull();
    expect(upsertedSnapshotRows).toHaveLength(1);

    const row = upsertedSnapshotRows[0];
    expect(row.entity_id).toBe(ENTITY_ID);
    expect(row.snapshot).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
    expect(row.embedding).toBeNull();

    // No provider means no provider call at all.
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("does not pay for the canonical_name lookup when no provider is configured", async () => {
    hasEmbeddingProvider.mockReturnValue(false);
    await recomputeSnapshot(ENTITY_ID, USER_ID);
    const noProviderEntitySelects = selectedTables.filter((t) => t === "entities").length;

    upsertedSnapshotRows.length = 0;
    selectedTables.length = 0;

    hasEmbeddingProvider.mockReturnValue(true);
    generateEmbedding.mockResolvedValue(makeEmbedding(3));
    await recomputeSnapshot(ENTITY_ID, USER_ID);
    const providerEntitySelects = selectedTables.filter((t) => t === "entities").length;

    // The provider path does at least one extra `entities` read (canonical_name
    // for the searchable text); the no-provider path must short-circuit before it.
    expect(noProviderEntitySelects).toBeLessThan(providerEntitySelects);
  });

  it("does not fail the store when the embedding provider throws", async () => {
    hasEmbeddingProvider.mockReturnValue(true);
    generateEmbedding.mockRejectedValue(new Error("provider outage"));

    // A provider outage must degrade to a snapshot without an embedding,
    // never propagate out of the store path.
    const result = await recomputeSnapshot(ENTITY_ID, USER_ID);

    expect(result).not.toBeNull();
    expect(upsertedSnapshotRows).toHaveLength(1);
    expect(upsertedSnapshotRows[0].embedding).toBeNull();
  });
});
