/**
 * The lexical prefilter never drops a true match (#2659).
 *
 * Search normalizes text before matching: lowercase, `-`/`_` become spaces,
 * every other non-word character is deleted WITHOUT leaving a gap, and
 * non-ASCII letters are deleted rather than folded. So "Next.js" matches
 * "nextjs", "Café" matches "caf", and a query token can match across
 * characters that are not adjacent in the stored JSON. The prefilter index has
 * to agree with that on every input, or it hides results.
 *
 * Property, checked over generated data and generated queries:
 *
 *   candidates(prefilter) ⊇ { entities the JavaScript match accepts }
 *
 * for the strict every-token match and for the partial-overlap fallback, with
 * the index current, with entities changed after indexing (dirty), and end to
 * end: `queryEntitiesWithCount` returns identical ids, totals, strategies and
 * modes with the index on and off. The generator is a seeded PRNG, so a
 * failure reproduces; the seed is printed with any counterexample.
 *
 * Also pinned here: maintainer bookkeeping (triggers on every source table,
 * deleted entities leave the index), the untyped candidate cap applied and
 * reported identically on the index path (#2597), and the encryption-mode
 * purge of an index built during a plaintext period.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const isolated = vi.hoisted(() => {
  const previous = process.env.NEOTOMA_SQLITE_PATH;
  const path =
    `${process.env.NEOTOMA_DATA_DIR ?? "."}/search-index-superset-` +
    `${process.pid}-${Date.now()}.db`;
  process.env.NEOTOMA_SQLITE_PATH = path;
  return { path, previous };
});

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import { rmSync } from "node:fs";
import { config } from "../../src/config.js";
import { db } from "../../src/db.js";
import { clearDbCache, getDb } from "../../src/repositories/db/connection.js";
import { clearCachedDataKey } from "../../src/repositories/sqlite/local_db_adapter.js";
import { ensureSchema } from "../../src/repositories/sqlite/sqlite_client.js";
import {
  MIN_INDEXED_TOKEN_LENGTH,
  prefilterStrictCandidates,
  prefilterWeightedCandidates,
  runEntitySearchIndexMaintenance,
} from "../../src/services/entity_search_index.js";
import {
  buildEntityLexicalSearchText,
  entitySearchPrefilterStats,
  loadRawFragmentTextByEntityId,
  matchesSearchTokens,
  normalizeSearchText,
  queryEntitiesWithCount,
} from "../../src/shared/action_handlers/entity_handlers.js";

const SEED = Number(process.env.SEARCH_PROPERTY_SEED ?? 2659);
const run = `${SEED}_${Date.now().toString(36)}`;
const userId = `prefilter-prop-${run}`;
const otherUser = `prefilter-prop-other-${run}`;
const TYPES = [`proptype_alpha_${run}`, `proptype_beta_${run}`];
const ENTITY_COUNT = 240;

/** mulberry32: small, seeded, reproducible. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(SEED);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const int = (n: number) => Math.floor(rand() * n);

// Words chosen to exercise every normalization edge: punctuation that joins
// ("next.js", "a.b.c", "o'neil"), separators ("e-mail", "foo_bar"), letters
// that lowercase to ASCII ("İ" -> "i̇", Kelvin sign -> "k"), letters that are
// dropped ("é", "ü", "ß", ligature, CJK, emoji), combining marks, NBSP and
// other Unicode whitespace, digits, and plain words that recur often enough
// to produce real matches.
const VOCAB = [
  "next.js",
  "nextjs",
  "Next.JS",
  "Café",
  "caf",
  "cafe",
  "Zürich",
  "zrich",
  "e-mail",
  "email",
  "foo_bar",
  "foobar",
  "İstanbul",
  "Kelvin",
  "kelvin",
  "a.b.c",
  "abc",
  "o'neil",
  "oneil",
  "straße",
  "strae",
  "ﬁnance",
  "nance",
  "naïve",
  "nave",
  "éclair",
  "eclair",
  "東京tokyo",
  "tokyo",
  "🙂smile",
  "smile",
  "x1",
  "x12",
  "abc123",
  "123",
  "ledger",
  "ledgers",
  "falcon",
  "osprey",
  "kite",
  "heron",
  "quokka",
  "walrus",
  "the",
  "an",
  "status",
  "done",
  "open",
] as const;
const SEPARATORS = [" ", " ", " ", "  ", "-", "_", ".", ",", " ", "\t", "\n", "/", ": ", ""];

function phrase(words: number): string {
  let out = "";
  for (let i = 0; i < words; i++) out += (i ? pick(SEPARATORS) : "") + pick(VOCAB);
  return out;
}

function snapshotValue(depth = 0): unknown {
  const roll = rand();
  if (roll < 0.45 || depth > 1) return phrase(1 + int(4));
  if (roll < 0.6) return int(10_000) / (rand() < 0.5 ? 1 : 10);
  if (roll < 0.68) return rand() < 0.5;
  if (roll < 0.74) return null;
  if (roll < 0.87) return [phrase(1 + int(2)), snapshotValue(depth + 1)];
  return { [phrase(1)]: snapshotValue(depth + 1) };
}

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = 1 + int(4);
  for (let i = 0; i < keys; i++)
    out[pick(VOCAB) + (rand() < 0.3 ? `_${int(9)}` : "")] = snapshotValue();
  return out;
}

function fragmentValue(): unknown {
  const roll = rand();
  if (roll < 0.6) return phrase(1 + int(3));
  if (roll < 0.75) return int(1000);
  if (roll < 0.85) return { nested: phrase(1) };
  return null;
}

type Seeded = { id: string; type: string };
const seeded: Seeded[] = [];
let fragmentSeq = 0;

async function insertFragment(entityId: string, type: string, owner = userId): Promise<void> {
  fragmentSeq += 1;
  const { error } = await db.from("raw_fragments").insert({
    id: `frag_${run}_${fragmentSeq}`,
    entity_id: entityId,
    entity_type: type,
    user_id: owner,
    fragment_key: pick(VOCAB) + (rand() < 0.5 ? "_key" : ""),
    fragment_value: fragmentValue(),
  });
  expect(error).toBeNull();
}

async function seedEntity(index: number, owner = userId): Promise<void> {
  const id = `ent_prop_${run}_${String(index).padStart(4, "0")}_${owner === userId ? "a" : "b"}`;
  const type = pick(TYPES);
  const { error } = await db.from("entities").insert({
    id,
    user_id: owner,
    entity_type: type,
    canonical_name: phrase(1 + int(3)),
    merged_to_entity_id: null,
  });
  expect(error).toBeNull();
  if (rand() < 0.85) {
    const now = new Date().toISOString();
    const snap = await db.from("entity_snapshots").upsert({
      entity_id: id,
      user_id: owner,
      entity_type: type,
      schema_version: "1.0",
      snapshot: snapshot(),
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });
    expect(snap.error).toBeNull();
  }
  const fragments = rand() < 0.5 ? int(3) : 0;
  for (let i = 0; i < fragments; i++) await insertFragment(id, type, owner);
  if (owner === userId) seeded.push({ id, type });
}

/** Ground truth: every entity's lexical text, read exactly as search reads it. */
async function exactTexts(): Promise<Map<string, { text: string; type: string }>> {
  const { data: entities } = await db
    .from("entities")
    .select("id, canonical_name, entity_type")
    .eq("user_id", userId);
  const rows = (entities ?? []) as Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
  }>;
  const ids = rows.map((row) => row.id);
  const { data: snaps } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .in("entity_id", ids);
  const snapshotById = new Map(
    ((snaps ?? []) as Array<{ entity_id: string; snapshot: unknown }>).map((row) => [
      row.entity_id,
      row.snapshot,
    ])
  );
  const fragments = await loadRawFragmentTextByEntityId(ids);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        type: row.entity_type,
        text: buildEntityLexicalSearchText(
          row.canonical_name,
          snapshotById.get(row.id),
          fragments.get(row.id)
        ),
      },
    ])
  );
}

/** Raw query strings: fragments of stored-looking text plus noise, unnormalized. */
function query(): string {
  const roll = rand();
  if (roll < 0.5) return phrase(1 + int(3));
  if (roll < 0.7) {
    // A slice of a vocab word, keeping punctuation/diacritics in the query.
    const word = pick(VOCAB);
    const start = int(Math.max(1, word.length - 1));
    return word.slice(start, start + 2 + int(6));
  }
  if (roll < 0.85) return `${pick(VOCAB)}${pick([".", "-", "'", "é", "", "_", "!"])}${pick(VOCAB)}`;
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 1 + int(3) }, () =>
    Array.from({ length: 2 + int(5) }, () => pick([...letters])).join("")
  ).join(" ");
}

const QUERY_COUNT = 400;
let queries: string[] = [];

async function assertStrictSuperset(label: string): Promise<{ hits: number; narrowed: number }> {
  const connection = await getDb();
  const texts = await exactTexts();
  let hits = 0;
  let narrowed = 0;
  for (const raw of queries) {
    const tokens = normalizeSearchText(raw).split(" ").filter(Boolean);
    const indexable = [...new Set(tokens.filter((t) => t.length >= MIN_INDEXED_TOKEN_LENGTH))];
    if (indexable.length === 0) continue;
    const exact = [...texts.entries()]
      .filter(([, entity]) => matchesSearchTokens(entity.text, tokens))
      .map(([id]) => id);
    const candidates = new Set(
      (
        await prefilterStrictCandidates(
          connection,
          { userId, types: null, includeMerged: true },
          indexable
        )
      ).map((row) => row.id)
    );
    const missing = exact.filter((id) => !candidates.has(id));
    if (missing.length > 0) {
      throw new Error(
        `[${label}] seed=${SEED} query=${JSON.stringify(raw)} tokens=${JSON.stringify(tokens)} ` +
          `dropped ${missing.length} true match(es): ${missing
            .slice(0, 3)
            .map((id) => JSON.stringify(texts.get(id)?.text))
            .join(" | ")}`
      );
    }
    hits += exact.length;
    if (candidates.size < texts.size) narrowed += 1;
  }
  return { hits, narrowed };
}

async function assertPartialSuperset(label: string): Promise<number> {
  const connection = await getDb();
  const texts = await exactTexts();
  let qualifying = 0;
  for (let q = 0; q < 150; q++) {
    // Descriptive multi-token queries, as the partial fallback sees them.
    const tokens = normalizeSearchText(
      Array.from({ length: 2 + int(4) }, () => pick(VOCAB)).join(" ")
    )
      .split(" ")
      .filter((t) => t.length > 1);
    if (tokens.length < 2) continue;
    const weights = new Map<string, number>();
    let unindexed = 0;
    for (const token of tokens) {
      if (token.length >= MIN_INDEXED_TOKEN_LENGTH)
        weights.set(token, (weights.get(token) ?? 0) + 1);
      else unindexed += 1;
    }
    // The fallback accepts overlap >= required, or required - 1 when a
    // concept->type hint credits the row; check against the weaker bar.
    const required = Math.max(2, Math.ceil(tokens.length * 0.5));
    const minOverlap = required - 1;
    const minWeight = minOverlap - unindexed;
    if (minWeight <= 0 || weights.size === 0) continue;
    const accepted = [...texts.entries()]
      .filter(([, entity]) => tokens.filter((t) => entity.text.includes(t)).length >= minOverlap)
      .map(([id]) => id);
    const candidates = new Set(
      (
        await prefilterWeightedCandidates(
          connection,
          { userId, types: null, includeMerged: true },
          weights,
          minWeight
        )
      ).map((row) => row.id)
    );
    const missing = accepted.filter((id) => !candidates.has(id));
    if (missing.length > 0) {
      throw new Error(
        `[${label}] seed=${SEED} partial tokens=${JSON.stringify(tokens)} dropped ${missing.length}`
      );
    }
    qualifying += accepted.length;
  }
  return qualifying;
}

async function searchBothWays(raw: string, entityType?: string) {
  const params = { userId, search: raw, limit: 7, offset: 0, entityType, includeSnapshots: false };
  const strip = (r: Awaited<ReturnType<typeof queryEntitiesWithCount>>) => ({
    ids: r.entities.map((e) => e.entity_id),
    total: r.total,
    strategies: r.applied_search_strategies,
    mode: r.search_mode,
    state: r.read_contract.coverage.state,
    reasons: r.read_contract.coverage.reasons,
  });
  const indexed = strip(await queryEntitiesWithCount(params));
  process.env.NEOTOMA_ENTITY_SEARCH_INDEX = "off";
  try {
    const scanned = strip(await queryEntitiesWithCount(params));
    return { indexed, scanned };
  } finally {
    delete process.env.NEOTOMA_ENTITY_SEARCH_INDEX;
  }
}

async function assertEndToEndEqual(label: string, count: number): Promise<number> {
  let nonEmpty = 0;
  for (let i = 0; i < count; i++) {
    const raw = queries[i % queries.length]!;
    const entityType = rand() < 0.4 ? pick(TYPES) : undefined;
    const { indexed, scanned } = await searchBothWays(raw, entityType);
    if (JSON.stringify(indexed) !== JSON.stringify(scanned)) {
      throw new Error(
        `[${label}] seed=${SEED} query=${JSON.stringify(raw)} type=${entityType ?? "-"}: ` +
          `index ${JSON.stringify(indexed)} != scan ${JSON.stringify(scanned)}`
      );
    }
    if (indexed.total > 0) nonEmpty += 1;
  }
  return nonEmpty;
}

async function drain() {
  const result = await runEntitySearchIndexMaintenance({ batchSize: 37 });
  expect(result.inactive).toBeNull();
  expect(result.backfillComplete).toBe(true);
  return result;
}

describe("lexical prefilter index (#2659)", () => {
  beforeAll(async () => {
    for (let i = 0; i < ENTITY_COUNT; i++) await seedEntity(i);
    for (let i = 0; i < 20; i++) await seedEntity(i, otherUser);
    queries = Array.from({ length: QUERY_COUNT }, query);
  }, 300_000);

  afterAll(async () => {
    clearDbCache();
    if (isolated.previous === undefined) delete process.env.NEOTOMA_SQLITE_PATH;
    else process.env.NEOTOMA_SQLITE_PATH = isolated.previous;
    for (const suffix of ["", "-wal", "-shm"]) rmSync(isolated.path + suffix, { force: true });
  });

  it("strict candidates are a superset of the exact matches, with every entity dirty", async () => {
    // Nothing drained yet: every entity is a candidate through the dirty set.
    const { hits } = await assertStrictSuperset("all dirty");
    expect(hits).toBeGreaterThan(50);
  }, 300_000);

  it("strict candidates are a superset of the exact matches, with the index current", async () => {
    await drain();
    const connection = await getDb();
    const dirty = (await connection
      .prepare("SELECT COUNT(*) AS n FROM entity_search_dirty")
      .get()) as { n: number };
    expect(Number(dirty.n)).toBe(0);
    const { hits, narrowed } = await assertStrictSuperset("current");
    // Non-zero instrument: real matches exist, and the index actually narrows.
    expect(hits).toBeGreaterThan(50);
    expect(narrowed).toBeGreaterThan(QUERY_COUNT / 4);
  }, 300_000);

  it("partial-overlap candidates are a superset of the rows the fallback can accept", async () => {
    await drain();
    expect(await assertPartialSuperset("partial current")).toBeGreaterThan(20);
  }, 300_000);

  it("search returns identical results with the index on and off", async () => {
    await drain();
    const before = { ...entitySearchPrefilterStats };
    const nonEmpty = await assertEndToEndEqual("e2e current", 200);
    expect(nonEmpty).toBeGreaterThan(40);
    expect(entitySearchPrefilterStats.strict - before.strict).toBeGreaterThan(100);
  }, 300_000);

  it("stays a superset after writes the maintainer has not seen yet", async () => {
    await drain();
    // Change every source of the text, through every kind of write.
    for (let i = 0; i < 60; i++) {
      const target = pick(seeded);
      const roll = rand();
      if (roll < 0.25) {
        const { error } = await db
          .from("entities")
          .update({ canonical_name: phrase(1 + int(3)) })
          .eq("id", target.id);
        expect(error).toBeNull();
      } else if (roll < 0.55) {
        const now = new Date().toISOString();
        const { error } = await db.from("entity_snapshots").upsert({
          entity_id: target.id,
          user_id: userId,
          entity_type: target.type,
          schema_version: "1.0",
          snapshot: snapshot(),
          provenance: {},
          observation_count: 2,
          last_observation_at: now,
          computed_at: now,
        });
        expect(error).toBeNull();
      } else if (roll < 0.8) {
        await insertFragment(target.id, target.type);
      } else if (roll < 0.9) {
        const { error } = await db.from("raw_fragments").delete().eq("entity_id", target.id);
        expect(error).toBeNull();
      } else {
        const { error } = await db.from("entity_snapshots").delete().eq("entity_id", target.id);
        expect(error).toBeNull();
      }
    }
    const connection = await getDb();
    const dirty = (await connection
      .prepare("SELECT COUNT(*) AS n FROM entity_search_dirty")
      .get()) as { n: number };
    expect(Number(dirty.n)).toBeGreaterThan(20);
    await assertStrictSuperset("after writes, before maintenance");
    await assertPartialSuperset("after writes, before maintenance");
    await assertEndToEndEqual("e2e after writes", 120);
    await drain();
    await assertStrictSuperset("after writes, after maintenance");
    await assertEndToEndEqual("e2e after maintenance", 120);
  }, 600_000);

  it("drops deleted entities from the index", async () => {
    await drain();
    const victim = seeded.pop()!;
    await db.from("raw_fragments").delete().eq("entity_id", victim.id);
    await db.from("entity_snapshots").delete().eq("entity_id", victim.id);
    expect((await db.from("entities").delete().eq("id", victim.id)).error).toBeNull();
    const result = await drain();
    expect(result.removed).toBe(1);
    const connection = await getDb();
    const doc = await connection
      .prepare("SELECT 1 AS present FROM entity_search_docs WHERE entity_id = ?")
      .get(victim.id);
    expect(doc).toBeUndefined();
  });

  it("keeps the index across re-opens and rebuilds nothing when the format is unchanged", async () => {
    await drain();
    const connection = await getDb();
    const before = (await connection
      .prepare("SELECT COUNT(*) AS n FROM entity_search_docs")
      .get()) as { n: number };
    await ensureSchema(connection);
    await ensureSchema(connection);
    const after = (await connection
      .prepare("SELECT COUNT(*) AS n FROM entity_search_docs")
      .get()) as { n: number };
    expect(Number(after.n)).toBe(Number(before.n));
    expect(Number(after.n)).toBeGreaterThan(ENTITY_COUNT / 2);
    const state = (await connection
      .prepare("SELECT value FROM entity_search_state WHERE key = 'backfill_complete'")
      .get()) as { value: string };
    expect(state.value).toBe("1");
  });

  it("applies and reports the untyped candidate cap identically on the index path (#2597)", async () => {
    await drain();
    const capUser = `prefilter-cap-${run}`;
    const capType = `proptype_cap_${run}`;
    const needle = `capneedle${run.replace(/[^a-z0-9]/gi, "")}`.toLowerCase();
    const ids = Array.from(
      { length: 5001 },
      (_, i) => `ent_cap_${run}_${String(i).padStart(5, "0")}`
    );
    for (let at = 0; at < ids.length; at += 250) {
      const { error } = await db.from("entities").insert(
        ids.slice(at, at + 250).map((id, j) => ({
          id,
          user_id: capUser,
          entity_type: capType,
          canonical_name: at + j === 5000 || at + j === 10 ? `${needle} row` : "filler row",
        }))
      );
      expect(error).toBeNull();
    }
    await drain();
    const params = { userId: capUser, search: needle, limit: 10 };
    const indexed = await queryEntitiesWithCount(params);
    process.env.NEOTOMA_ENTITY_SEARCH_INDEX = "off";
    const scanned = await queryEntitiesWithCount(params).finally(() => {
      delete process.env.NEOTOMA_ENTITY_SEARCH_INDEX;
    });
    for (const result of [indexed, scanned]) {
      // Row 5000 lies past the cap; row 10 is inside it.
      expect(result.entities.map((e) => e.entity_id)).toEqual([ids[10]]);
      expect(result.read_contract.coverage.state).toBe("truncated");
      expect(result.read_contract.coverage.reasons).toContain("candidate_cap");
      expect(result.read_contract.diagnostics).toContainEqual({
        code: "lexical_candidate_cap",
        reason: "untyped_search_examined_first_5000_entities_by_entity_id",
      });
    }
    // A typed search has no cap and finds both.
    const typed = await queryEntitiesWithCount({ ...params, entityType: capType });
    expect(typed.entities.map((e) => e.entity_id).sort()).toEqual([ids[10], ids[5000]]);
    expect(typed.read_contract.coverage.reasons).not.toContain("candidate_cap");
    await db.from("entities").delete().eq("user_id", capUser);
  }, 300_000);

  it("never indexes with encryption at rest on, and purges what a plaintext period left", async () => {
    await drain();
    const connection = await getDb();
    const docs = async () =>
      Number(
        (
          (await connection.prepare("SELECT COUNT(*) AS n FROM entity_search_docs").get()) as {
            n: number;
          }
        ).n
      );
    expect(await docs()).toBeGreaterThan(0);
    config.encryption.enabled = true;
    config.encryption.mnemonic =
      "test test test test test test test test test test test test " +
      "test test test test test test test test test test test junk";
    clearCachedDataKey();
    try {
      await seedEntity(9000); // a write while encrypted: dirty, never indexed
      const result = await runEntitySearchIndexMaintenance();
      expect(result.inactive).toBe("encryption_at_rest");
      expect(result.purged).toBe(true);
      expect(await docs()).toBe(0);
      expect(
        Number(
          (
            (await connection.prepare("SELECT COUNT(*) AS n FROM entity_search_fts").get()) as {
              n: number;
            }
          ).n
        )
      ).toBe(0);
      // Search ignores the index while encrypted.
      const before = entitySearchPrefilterStats.strict;
      await queryEntitiesWithCount({ userId, search: "ledger", limit: 3 });
      expect(entitySearchPrefilterStats.strict).toBe(before);
    } finally {
      config.encryption.enabled = false;
      config.encryption.mnemonic = "";
      clearCachedDataKey();
    }
    // Back to plaintext: the backfill restarts from scratch and covers the
    // entity written while encrypted.
    await drain();
    expect(await docs()).toBeGreaterThan(ENTITY_COUNT / 2);
    await assertStrictSuperset("after encryption round trip");
  }, 300_000);
});
