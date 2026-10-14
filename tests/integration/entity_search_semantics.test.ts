/**
 * Characterization tests for entity `search` semantics (#2659).
 *
 * Search must stay observably identical while its cost is reduced, so these
 * tests pin what a search matches today: which fields are searched, how text is
 * normalized, how matches are ranked, how `limit`/`offset` page the ranked list,
 * how typed and untyped searches differ, and how owner scoping applies.
 *
 * Several pinned behaviours are surprising on purpose (diacritics are dropped,
 * not folded; punctuation is removed without leaving a gap, so "Next.js"
 * matches "nextjs"). They are pinned because a SQL prefilter that compared a
 * token against the raw stored text would silently change them. Do not "fix" one
 * of them here without a decision to change search behaviour.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";

const serviceRoleClient = getServiceRoleClient();
const run = randomUUID().replaceAll("-", "").slice(0, 10);
const userA = `search-sem-a-${run}`;
const userB = `search-sem-b-${run}`;
const idPrefix = `ent_ss${run}_`;
const createdEntityIds: string[] = [];

type Seed = {
  id: string;
  type?: string;
  canonical: string;
  snapshot?: Record<string, unknown> | null;
  user?: string;
  mergedTo?: string;
  aliases?: string[];
  snapshotCanonical?: string;
  fragments?: Array<{ key: string; value: string }>;
};

async function seed(entity: Seed): Promise<string> {
  const id = idPrefix + entity.id;
  const type = entity.type ?? "research_report";
  const user = entity.user ?? userA;
  const inserted = await serviceRoleClient.from("entities").insert({
    id,
    user_id: user,
    entity_type: type,
    canonical_name: entity.canonical,
    merged_to_entity_id: entity.mergedTo ?? null,
    ...(entity.aliases ? { aliases: entity.aliases } : {}),
  });
  expect(inserted.error).toBeNull();
  createdEntityIds.push(id);
  if (entity.snapshot !== null) {
    const now = new Date().toISOString();
    const snap = await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: id,
      user_id: user,
      entity_type: type,
      schema_version: "1.0",
      canonical_name: entity.snapshotCanonical ?? entity.canonical,
      snapshot: entity.snapshot ?? {},
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });
    expect(snap.error).toBeNull();
  }
  for (const [i, fragment] of (entity.fragments ?? []).entries()) {
    const frag = await serviceRoleClient.from("raw_fragments").insert({
      id: `${id}_frag${i}`,
      entity_id: id,
      entity_type: type,
      user_id: user,
      fragment_key: fragment.key,
      fragment_value: fragment.value,
    });
    expect(frag.error).toBeNull();
  }
  return id;
}

async function search(
  text: string,
  options: Partial<Parameters<typeof queryEntitiesWithCount>[0]> = {}
) {
  const result = await queryEntitiesWithCount({
    userId: userA,
    search: text,
    limit: 100,
    offset: 0,
    ...options,
  });
  return {
    ids: result.entities.map((entity) => entity.entity_id.replace(idPrefix, "")),
    total: result.total,
    strategies: result.applied_search_strategies,
    mode: result.search_mode,
  };
}

describe("entity search semantics (#2659)", () => {
  beforeAll(async () => {
    // Fields searched.
    await seed({ id: "f_canon", canonical: "Zebra-Crossing Ledger", snapshot: {} });
    await seed({ id: "f_snapvalue", canonical: "doc_1", snapshot: { title: "Walrus Expedition" } });
    await seed({ id: "f_snapkey", canonical: "doc_2", snapshot: { zorbfield: "x" } });
    await seed({
      id: "f_fragment",
      canonical: "doc_3",
      snapshot: {},
      fragments: [{ key: "frag_key_quux", value: "fragval-wombat" }],
    });
    await seed({ id: "f_nosnapshot", canonical: "Orphan Canonical Only", snapshot: null });
    await seed({
      id: "f_alias",
      canonical: "doc_4",
      snapshot: {},
      aliases: ["aliasonlyterm"],
      snapshotCanonical: "snapcanonicalonly",
    });

    // Normalization.
    await seed({ id: "n_case", canonical: "doc_5", snapshot: { title: "MiXeD CaSe Heron" } });
    await seed({ id: "n_sep", canonical: "ledger_alpha-notes", snapshot: {} });
    await seed({ id: "n_nextjs", canonical: "doc_6", snapshot: { site: "Next.js Framework" } });
    await seed({ id: "n_email", canonical: "doc_7", snapshot: { contact: "john@example.com" } });
    await seed({ id: "n_diacritic", canonical: "doc_8", snapshot: { city: "Café Zürich" } });
    await seed({ id: "n_substring", canonical: "doc_9", snapshot: { note: "the internet" } });
    await seed({ id: "n_order", canonical: "doc_10", snapshot: { title: "falcon osprey kite" } });

    // Ranking: A has the phrase in canonical_name, B only in the snapshot.
    await seed({ id: "r_a", canonical: "gamma report", snapshot: {} });
    await seed({ id: "r_b", canonical: "report", snapshot: { t: "gamma report" } });
    // Ties break on canonical_name, then on id.
    await seed({ id: "r_tie_b", canonical: "tie beta", snapshot: {} });
    await seed({ id: "r_tie_a2", canonical: "tie alpha", snapshot: {} });
    await seed({ id: "r_tie_a1", canonical: "tie alpha", snapshot: {} });

    // Pagination: five rows that all match "pagexyz".
    for (let i = 0; i < 5; i++) {
      await seed({ id: `p_${i}`, canonical: `pagexyz item ${i}`, snapshot: {} });
    }

    // Partial-overlap fallback.
    await seed({ id: "o_hit", canonical: "doc_11", snapshot: { title: "mango papaya guava" } });

    // Typed vs untyped.
    await seed({ id: "t_plan_hit", type: "plan", canonical: "plan:quokka rollout", snapshot: {} });
    await seed({ id: "t_plan_miss", type: "plan", canonical: "plan:other rollout", snapshot: {} });
    await seed({
      id: "t_report_hit",
      type: "research_report",
      canonical: "doc_12",
      snapshot: { title: "plan quokka" },
    });
    await seed({
      id: "t_post_hit",
      type: "post_draft",
      canonical: "doc_13",
      snapshot: { title: "quokka note" },
    });

    // Owner scoping, merged and bookkeeping rows.
    await seed({ id: "s_mine", canonical: "scopeprobe mine", snapshot: {} });
    await seed({ id: "s_other", canonical: "scopeprobe theirs", snapshot: {}, user: userB });
    await seed({
      id: "s_merged",
      canonical: "scopeprobe merged",
      snapshot: {},
      mergedTo: idPrefix + "s_mine",
    });
    await seed({
      id: "s_chat",
      type: "conversation_message",
      canonical: "scopeprobe chat",
      snapshot: {},
    });
  }, 60000);

  afterAll(async () => {
    if (createdEntityIds.length === 0) return;
    await db.from("raw_fragments").delete().in("entity_id", createdEntityIds);
    await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
    await db.from("entities").delete().in("id", createdEntityIds);
  });

  describe("which fields are searched", () => {
    it("matches entities.canonical_name", async () => {
      expect((await search("zebra crossing")).ids).toEqual(["f_canon"]);
    });

    it("matches snapshot values", async () => {
      expect((await search("walrus expedition")).ids).toEqual(["f_snapvalue"]);
    });

    it("matches snapshot field NAMES, because the whole serialized snapshot is searched", async () => {
      expect((await search("zorbfield")).ids).toEqual(["f_snapkey"]);
    });

    it("matches raw_fragments keys and values", async () => {
      expect((await search("wombat")).ids).toEqual(["f_fragment"]);
      expect((await search("quux")).ids).toEqual(["f_fragment"]);
    });

    it("matches an entity that has no snapshot row via its canonical_name", async () => {
      expect((await search("orphan canonical")).ids).toEqual(["f_nosnapshot"]);
    });

    it("does not search entities.aliases or entity_snapshots.canonical_name", async () => {
      expect((await search("aliasonlyterm")).ids).toEqual([]);
      expect((await search("snapcanonicalonly")).ids).toEqual([]);
    });
  });

  describe("how text is normalized", () => {
    it("is case-insensitive in both directions", async () => {
      expect((await search("MIXED case HERON")).ids).toEqual(["n_case"]);
    });

    it("treats hyphens and underscores as word separators", async () => {
      expect((await search("ledger alpha notes")).ids).toEqual(["n_sep"]);
      expect((await search("ledger-alpha_notes")).ids).toEqual(["n_sep"]);
    });

    it("removes other punctuation without leaving a gap", async () => {
      // "Next.js" is stored as "nextjs"; so is the query "next.js".
      expect((await search("nextjs")).ids).toEqual(["n_nextjs"]);
      expect((await search("next.js")).ids).toEqual(["n_nextjs"]);
      // Punctuation is also dropped from the query, so an email matches whole
      // and as the joined run.
      expect((await search("john@example.com")).ids).toEqual(["n_email"]);
      expect((await search("johnexamplecom")).ids).toEqual(["n_email"]);
    });

    it("drops non-ASCII letters instead of folding them", async () => {
      // "Café Zürich" normalizes to "caf zrich".
      expect((await search("caf")).ids).toContain("n_diacritic");
      expect((await search("zrich")).ids).toContain("n_diacritic");
      expect((await search("café")).ids).toContain("n_diacritic");
      expect((await search("cafe")).ids).not.toContain("n_diacritic");
      expect((await search("zurich")).ids).not.toContain("n_diacritic");
    });

    it("matches tokens as substrings, not whole words", async () => {
      expect((await search("net")).ids).toContain("n_substring");
    });

    it("requires every token but ignores their order", async () => {
      expect((await search("kite falcon")).ids).toEqual(["n_order"]);
      expect((await search("falcon kite osprey")).ids).toEqual(["n_order"]);
      expect((await search("falcon sparrow")).ids).toEqual([]);
    });
  });

  describe("ranking and strategies", () => {
    it("ranks a canonical_name phrase hit above a snapshot-only hit", async () => {
      const result = await search("gamma report");
      expect(result.ids).toEqual(["r_a", "r_b"]);
      expect(result.strategies).toEqual(["strict"]);
    });

    it("breaks score ties by canonical_name, then by entity id", async () => {
      const result = await search("tie");
      expect(result.ids).toEqual(["r_tie_a1", "r_tie_a2", "r_tie_b"]);
    });

    it("falls back to partial overlap only when no row matches every token", async () => {
      // Strict needs all of mango, papaya, kiwi; the row has two of three
      // (required overlap is 2 of 3 meaningful tokens).
      const partial = await search("mango papaya kiwi");
      expect(partial.ids).toEqual(["o_hit"]);
      expect(partial.strategies).toEqual(["partial_overlap"]);

      const strict = await search("mango papaya");
      expect(strict.ids).toEqual(["o_hit"]);
      expect(strict.strategies).toEqual(["strict"]);
    });

    it("reports no strategies and total 0 when nothing matches", async () => {
      const result = await search("zzzznomatchzzzz");
      expect(result.ids).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.strategies).toEqual([]);
    });

    it("returns nothing for a whitespace-or-punctuation-only query", async () => {
      expect((await search("  ...  ")).ids).toEqual([]);
    });
  });

  describe("limit and offset", () => {
    it("pages the ranked list and reports the same total on every page", async () => {
      const all = await search("pagexyz");
      expect(all.total).toBe(5);
      expect(all.ids).toHaveLength(5);

      const collected: string[] = [];
      for (const offset of [0, 2, 4]) {
        const page = await search("pagexyz", { limit: 2, offset });
        expect(page.total).toBe(5);
        collected.push(...page.ids);
      }
      expect(collected).toEqual(all.ids);
    });

    it("limit 1 returns the best-ranked row", async () => {
      const all = await search("pagexyz");
      const first = await search("pagexyz", { limit: 1 });
      expect(first.ids).toEqual([all.ids[0]]);
      expect(first.total).toBe(5);
    });

    it("an offset past the end returns no rows and keeps the total", async () => {
      const page = await search("pagexyz", { limit: 3, offset: 50 });
      expect(page.ids).toEqual([]);
      expect(page.total).toBe(5);
    });
  });

  describe("typed and untyped search", () => {
    it("an explicit entity_type restricts the search to that type", async () => {
      expect((await search("quokka", { entityType: "plan" })).ids).toEqual(["t_plan_hit"]);
      expect((await search("quokka", { entityType: "post_draft" })).ids).toEqual(["t_post_hit"]);
    });

    it("entity_types are OR-combined", async () => {
      const result = await search("quokka", { entityTypes: ["plan", "post_draft"] });
      expect([...result.ids].sort()).toEqual(["t_plan_hit", "t_post_hit"]);
    });

    it("an untyped search spans every type", async () => {
      const result = await search("quokka");
      expect([...result.ids].sort()).toEqual(["t_plan_hit", "t_post_hit", "t_report_hit"]);
      expect(result.mode).toBe("lexical_fallback");
    });

    it("a type name in the query filters by type instead of matching text", async () => {
      const result = await search("plan quokka");
      expect(result.ids).toEqual(["t_plan_hit"]);
      expect(result.mode).toBe("lexical_typed");
    });

    it("a query that is only a type name matches nothing", async () => {
      const result = await search("plan");
      expect(result.ids).toEqual([]);
      expect(result.mode).toBe("lexical_typed");
    });
  });

  describe("owner, merged and bookkeeping scoping", () => {
    it("only returns the caller's entities", async () => {
      expect((await search("scopeprobe mine")).ids).toEqual(["s_mine"]);
      expect((await search("scopeprobe theirs")).ids).toEqual([]);
      const other = await queryEntitiesWithCount({
        userId: userB,
        search: "scopeprobe",
        limit: 100,
      });
      expect(other.entities.map((e) => e.entity_id.replace(idPrefix, ""))).toEqual(["s_other"]);
    });

    it("excludes merged entities unless include_merged is set", async () => {
      expect((await search("scopeprobe merged")).ids).toEqual([]);
      const included = await search("scopeprobe merged", { includeMerged: true });
      expect(included.ids).toEqual(["s_merged"]);
    });

    it("counts only visible rows in total", async () => {
      const result = await search("scopeprobe");
      expect(result.total).toBe(result.ids.length);
      expect(result.ids).not.toContain("s_other");
      expect(result.ids).not.toContain("s_merged");
    });

    it("excludes chat bookkeeping only when exclude_bookkeeping is set, unless the type is explicit", async () => {
      expect((await search("scopeprobe chat")).ids).toEqual(["s_chat"]);
      expect((await search("scopeprobe chat", { excludeBookkeeping: true })).ids).toEqual([]);
      expect(
        (
          await search("scopeprobe chat", {
            excludeBookkeeping: true,
            entityType: "conversation_message",
          })
        ).ids
      ).toEqual(["s_chat"]);
    });
  });
});
