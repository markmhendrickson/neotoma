import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";

vi.mock("../../src/services/entity_semantic_search.js", () => ({
  semanticSearchEntities: vi.fn(async () => ({ entityIds: [], total: 0 })),
}));

import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";

const serviceRoleClient = getServiceRoleClient();

describe("Lexical retrieval fallback", () => {
  const testUserId = "lexical-fallback-test-user";
  const testEntityIds: string[] = [];

  async function cleanupEntities() {
    if (testEntityIds.length === 0) return;
    await db.from("entity_snapshots").delete().in("entity_id", testEntityIds);
    await db.from("entities").delete().in("id", testEntityIds);
    testEntityIds.length = 0;
  }

  async function createEntityWithSnapshot(params: {
    id: string;
    entityType: string;
    canonicalName: string;
    snapshot: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    await serviceRoleClient.from("entities").insert({
      id: params.id,
      user_id: testUserId,
      entity_type: params.entityType,
      canonical_name: params.canonicalName,
    });
    testEntityIds.push(params.id);

    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: params.id,
      user_id: testUserId,
      entity_type: params.entityType,
      schema_version: "1.0",
      canonical_name: params.canonicalName,
      snapshot: params.snapshot,
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });
  }

  beforeEach(async () => {
    await cleanupEntities();
  });

  afterEach(async () => {
    await cleanupEntities();
  });

  it("matches snapshot title when canonical_name does not include search text", async () => {
    const entityId = `ent_lex_title_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_123",
      snapshot: {
        title: "MCP Integrations Assessment for Ateles and Neotoma",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "mcp integrations",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("matches reversed token order for the same report title", async () => {
    const entityId = `ent_lex_reversed_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_456",
      snapshot: {
        title: "MCP Integrations Assessment",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "integrations mcp",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("matches punctuation and hyphen variants", async () => {
    const entityId = `ent_lex_punct_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "post_draft",
      canonicalName: "draft_789",
      snapshot: {
        title: "Neotoma Developer Preview: Truth-Layer Update",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "post_draft",
      search: "neotoma-developer preview truth layer",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("finds matches beyond the first unfiltered page", async () => {
    const runId = Date.now();
    const bulkEntities = Array.from({ length: 220 }, (_, index) => ({
      id: `ent_lex_pagination_${runId}_${String(index).padStart(3, "0")}`,
      user_id: testUserId,
      entity_type: "research_report",
      canonical_name: `doc_${String(index).padStart(3, "0")}`,
    }));

    await serviceRoleClient.from("entities").insert(bulkEntities);
    for (const entity of bulkEntities) {
      testEntityIds.push(entity.id);
    }

    const targetIndex = 150;
    const targetEntityId = bulkEntities[targetIndex].id;
    const now = new Date().toISOString();
    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: targetEntityId,
      user_id: testUserId,
      entity_type: "research_report",
      schema_version: "1.0",
      canonical_name: bulkEntities[targetIndex].canonical_name,
      snapshot: { title: "Newsletter Recipients Report" },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "newsletter recipients",
      limit: 100,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === targetEntityId)).toBe(true);
  });

  it("matches plan titles that end with a registered entity type name", async () => {
    const entityId = `ent_lex_plan_strategy_title_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "plan",
      canonicalName: "plan:Schema Packs Strategy",
      snapshot: {
        title: "Schema Packs Strategy",
        status: "pending",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "Schema Packs Strategy",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("#1496 bridges 'bank account' concept to financial_account via partial fallback", async () => {
    // financial_account whose only identity-bearing text is the institution
    // field. The query "bank account Ibercaja Wise" names a concept (bank
    // account), not the literal entity_type, and the strict all-token gate
    // cannot match because "bank"/"account" are absent from the row's text.
    const entityId = `ent_fa_ibercaja_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "financial_account",
      canonicalName: "ibercaja regular (spain domestic)",
      snapshot: {
        institution: "Ibercaja",
        account_name: "Ibercaja Regular",
        provider: "Wise",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "bank account Ibercaja Wise",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("#1551 recovers a descriptive multi-term query via partial-token overlap", async () => {
    // Long descriptive query whose terms only partially overlap the stored
    // title. The strict every-token gate drops it; the partial fallback should
    // recover it because a majority of meaningful tokens overlap.
    const entityId = `ent_inspector_build_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "plan",
      canonicalName: "plan:unified server build inspector",
      snapshot: {
        title: "Unified server build: serve site, inspector sandbox",
        body: "Build the unified server and inspector sandbox for agentic evaluation.",
      },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search:
        "unified server build serve site inspector sandbox agentic try now evaluate experience",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("#1551 partial fallback matches a subset query against a stored title", async () => {
    const entityId = `ent_build_server_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_build_server",
      snapshot: { title: "Build Server architecture and deployment notes" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "build serve deployment notes architecture",
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
  });

  it("partial fallback does not match an entity sharing only a single stop-ish token", async () => {
    // Precision guard: a row that overlaps only one meaningful token must not
    // be surfaced by the partial fallback (min overlap is 2 / 50%).
    const targetId = `ent_partial_target_${Date.now()}`;
    const decoyId = `ent_partial_decoy_${Date.now()}`;
    await createEntityWithSnapshot({
      id: targetId,
      entityType: "research_report",
      canonicalName: "doc_partial_target",
      snapshot: { title: "Quarterly revenue forecast spreadsheet" },
    });
    await createEntityWithSnapshot({
      id: decoyId,
      entityType: "research_report",
      canonicalName: "doc_partial_decoy",
      snapshot: { title: "Unrelated revenue document" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "quarterly forecast spreadsheet planning",
      limit: 25,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(ids).toContain(targetId);
    expect(ids).not.toContain(decoyId);
  });

  it("partial fallback boundary: 3-of-6 meaningful tokens passes, 2-of-6 fails", async () => {
    // Six meaningful query tokens => required overlap = ceil(6 * 0.5) = 3.
    // The target overlaps exactly 3 tokens (boundary pass); the decoy overlaps
    // exactly 2 (boundary fail). Tokens chosen to avoid PARTIAL_MATCH_STOP_TOKENS.
    const passId = `ent_overlap_pass_${Date.now()}`;
    const failId = `ent_overlap_fail_${Date.now()}`;
    await createEntityWithSnapshot({
      id: passId,
      entityType: "research_report",
      canonicalName: "doc_overlap_pass",
      // Contains alpha, beta, gamma => 3 of 6.
      snapshot: { title: "alpha beta gamma unrelated heading" },
    });
    await createEntityWithSnapshot({
      id: failId,
      entityType: "research_report",
      canonicalName: "doc_overlap_fail",
      // Contains only alpha, beta => 2 of 6.
      snapshot: { title: "alpha beta unrelated heading" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "alpha beta gamma delta epsilon zeta",
      limit: 25,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(ids).toContain(passId);
    expect(ids).not.toContain(failId);
  });

  it("partial fallback boundary: 2-token minimum requires both tokens to match", async () => {
    // Two meaningful query tokens => required overlap = max(2, ceil(2 * 0.5)) = 2,
    // i.e. BOTH must match. A row overlapping only one token must not surface.
    const bothId = `ent_two_token_both_${Date.now()}`;
    const oneId = `ent_two_token_one_${Date.now()}`;
    await createEntityWithSnapshot({
      id: bothId,
      entityType: "research_report",
      canonicalName: "doc_two_token_both",
      snapshot: { title: "kappa lambda combined report" },
    });
    await createEntityWithSnapshot({
      id: oneId,
      entityType: "research_report",
      canonicalName: "doc_two_token_one",
      snapshot: { title: "kappa only report" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "kappa lambda",
      limit: 25,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(ids).toContain(bothId);
    expect(ids).not.toContain(oneId);
  });

  it("partial fallback: an all-stop-token query returns empty without throwing", async () => {
    // Every token is a stop token, so there are zero meaningful tokens and the
    // partial fallback must short-circuit (no overlap pass, no exception).
    const entityId = `ent_all_stop_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_all_stop",
      snapshot: { title: "the report for now" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      search: "the to of for with now",
      limit: 25,
      offset: 0,
    });

    // No meaningful tokens => no strict and no partial matches; the call must
    // resolve cleanly rather than throw.
    expect(result.entities.map((entity) => entity.entity_id)).not.toContain(entityId);
  });

  it("surfaces applied_search_strategies including concept_bridge for the #1496 path", async () => {
    const entityId = `ent_fa_strategy_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "financial_account",
      canonicalName: "account_xyz_002",
      snapshot: { institution: "Revolut", account_name: "Revolut Main", provider: "Revolut" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "bank account Revolut Main",
      limit: 25,
      offset: 0,
    });

    expect(result.entities.some((entity) => entity.entity_id === entityId)).toBe(true);
    expect(result.applied_search_strategies).toBeDefined();
    expect(result.applied_search_strategies).toEqual(
      expect.arrayContaining(["partial_overlap", "concept_bridge"])
    );
  });

  it("omits applied_search_strategies for non-search listings", async () => {
    const entityId = `ent_list_no_strategy_${Date.now()}`;
    await createEntityWithSnapshot({
      id: entityId,
      entityType: "research_report",
      canonicalName: "doc_list_no_strategy",
      snapshot: { title: "Plain listing entry" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      entityType: "research_report",
      limit: 25,
      offset: 0,
    });

    expect(result.applied_search_strategies).toBeUndefined();
  });

  it("ranks cross-type lexical matches deterministically without entity_type filter", async () => {
    const runId = Date.now();
    const canonicalFirstId = `ent_lex_rank_canonical_${runId}`;
    const snapshotFirstId = `ent_lex_rank_snapshot_${runId}`;

    await createEntityWithSnapshot({
      id: canonicalFirstId,
      entityType: "note",
      canonicalName: "icp target audience neotoma ideal customer profile",
      snapshot: { title: "Planning note" },
    });
    await createEntityWithSnapshot({
      id: snapshotFirstId,
      entityType: "research_report",
      canonicalName: "doc_rank_001",
      snapshot: { title: "ICP target audience Neotoma ideal customer profile analysis" },
    });

    const result = await queryEntitiesWithCount({
      userId: testUserId,
      search: "ICP target audience Neotoma ideal customer profile",
      limit: 10,
      offset: 0,
    });

    const ids = result.entities.map((entity) => entity.entity_id);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(ids).toContain(canonicalFirstId);
    expect(ids).toContain(snapshotFirstId);
    expect(ids.indexOf(canonicalFirstId)).toBeLessThan(ids.indexOf(snapshotFirstId));
  });
});

// Ranking-equivalence guard for the per-snapshot clean-once change: the
// expected ranked ids below were captured from main before the haystack was
// built once per entity. Any drift in scoring, matching or tie-breaking shows
// up as a changed literal.
describe("Lexical retrieval ranking baseline", () => {
  const baselineUserId = "lexical-ranking-baseline-user";

  type Seed = {
    id: string;
    entityType: string;
    canonicalName: string;
    snapshot: Record<string, unknown>;
  };

  const SEEDS: Seed[] = [
    { id: "ent_lrb_01", entityType: "task", canonicalName: "Quarterly budget review", snapshot: { title: "Quarterly budget review", status: "open", tags: ["finance", "q3"] } },
    { id: "ent_lrb_02", entityType: "task", canonicalName: "budget_draft_02", snapshot: { title: "Draft budget for quarterly offsite", status: "open" } },
    { id: "ent_lrb_03", entityType: "task", canonicalName: "Review vendor contracts", snapshot: { title: "Review vendor contracts", notes: "Budget impact: medium" } },
    { id: "ent_lrb_04", entityType: "task", canonicalName: "", snapshot: { title: "Quarterly budget reconciliation", owner: "team-alpha" } },
    { id: "ent_lrb_05", entityType: "task", canonicalName: "Archive old tickets", snapshot: { title: "Archive old tickets" } },
    { id: "ent_lrb_06", entityType: "task", canonicalName: "Budget", snapshot: { title: "Budget" } },
    { id: "ent_lrb_07", entityType: "note", canonicalName: "Quarterly budget review notes", snapshot: { body: "Notes from the quarterly budget review meeting." } },
    { id: "ent_lrb_08", entityType: "note", canonicalName: "note_08", snapshot: { body: "Garden layout: tomatoes, basil & peppers." } },
    { id: "ent_lrb_09", entityType: "note", canonicalName: "Truth-Layer design notes", snapshot: { body: "Design notes for the truth_layer; see appendix (v2)." } },
    { id: "ent_lrb_10", entityType: "note", canonicalName: "note_10", snapshot: { body: "Truth layer: design review follow-ups" } },
    { id: "ent_lrb_11", entityType: "note", canonicalName: "Release checklist", snapshot: { body: "Release checklist for v1.2: build, test, publish." } },
    { id: "ent_lrb_12", entityType: "note", canonicalName: "note_12", snapshot: {} },
    { id: "ent_lrb_13", entityType: "research_report", canonicalName: "doc_13", snapshot: { title: "Ideal customer profile analysis", summary: "Target audience research" } },
    { id: "ent_lrb_14", entityType: "research_report", canonicalName: "Ideal customer profile", snapshot: { title: "Profile" } },
    { id: "ent_lrb_15", entityType: "research_report", canonicalName: "doc_15", snapshot: { title: "Customer interviews", summary: "Ideal profile emerges from interviews" } },
    { id: "ent_lrb_16", entityType: "research_report", canonicalName: "doc_16", snapshot: { title: "Market sizing", summary: "TAM / SAM / SOM" } },
    { id: "ent_lrb_17", entityType: "research_report", canonicalName: "doc_17", snapshot: { title: "Competitive landscape", summary: "Customer churn drivers" } },
    { id: "ent_lrb_18", entityType: "contact", canonicalName: "Alex Example", snapshot: { first_name: "Alex", last_name: "Example", company: "Example Widgets" } },
    { id: "ent_lrb_19", entityType: "contact", canonicalName: "Sam Sample", snapshot: { first_name: "Sam", last_name: "Sample", company: "Sample Widgets Co" } },
    { id: "ent_lrb_20", entityType: "contact", canonicalName: "Widget Buyer", snapshot: { first_name: "Jo", last_name: "Buyer", role: "procurement" } },
    { id: "ent_lrb_21", entityType: "contact", canonicalName: "contact_21", snapshot: { first_name: "Riley", last_name: "Placeholder", company: "Widgets & Gadgets" } },
    { id: "ent_lrb_22", entityType: "contact", canonicalName: "Example Widgets", snapshot: { note: "duplicate company card" } },
    { id: "ent_lrb_23", entityType: "transaction", canonicalName: "txn_23", snapshot: { merchant: "Example Widgets", amount: 42.5, currency: "EUR" } },
    { id: "ent_lrb_24", entityType: "transaction", canonicalName: "txn_24", snapshot: { merchant: "Coffee Shop", amount: 3.2, currency: "EUR" } },
    { id: "ent_lrb_25", entityType: "transaction", canonicalName: "txn_25", snapshot: { merchant: "Widget Supply", amount: 120, currency: "USD", memo: "budget line 7" } },
    { id: "ent_lrb_26", entityType: "transaction", canonicalName: "Quarterly budget transfer", snapshot: { amount: 5000, currency: "EUR" } },
    { id: "ent_lrb_27", entityType: "event", canonicalName: "Budget kickoff", snapshot: { title: "Budget kickoff", date: "2026-01-05" } },
    { id: "ent_lrb_28", entityType: "event", canonicalName: "event_28", snapshot: { title: "Quarterly review", location: "Room 4" } },
    { id: "ent_lrb_29", entityType: "event", canonicalName: "event_29", snapshot: { title: "Release party", notes: "After v1.2 release" } },
    { id: "ent_lrb_30", entityType: "event", canonicalName: "Truth layer workshop", snapshot: { title: "Workshop", agenda: ["design", "review"] } },
  ];

  async function cleanupSeeds() {
    await db.from("entity_snapshots").delete().eq("user_id", baselineUserId);
    await db.from("entities").delete().eq("user_id", baselineUserId);
  }

  beforeEach(async () => {
    await cleanupSeeds();
    const now = "2026-01-01T00:00:00.000Z";
    for (const seed of SEEDS) {
      await serviceRoleClient.from("entities").insert({
        id: seed.id,
        user_id: baselineUserId,
        entity_type: seed.entityType,
        canonical_name: seed.canonicalName,
      });
      await serviceRoleClient.from("entity_snapshots").upsert({
        entity_id: seed.id,
        user_id: baselineUserId,
        entity_type: seed.entityType,
        schema_version: "1.0",
        canonical_name: seed.canonicalName,
        snapshot: seed.snapshot,
        provenance: {},
        observation_count: 1,
        last_observation_at: now,
        computed_at: now,
      });
    }
  });

  afterEach(async () => {
    await cleanupSeeds();
  });

  async function rankedIds(search: string, entityType?: string): Promise<string[]> {
    const result = await queryEntitiesWithCount({
      userId: baselineUserId,
      entityType,
      search,
      limit: 100,
      offset: 0,
    });
    return result.entities.map((entity) => entity.entity_id);
  }

  it("ranked ids identical to baseline fixture", async () => {
    const actual = {
      typedBudget: await rankedIds("quarterly budget", "task"),
      untypedBudget: await rankedIds("quarterly budget"),
      truthLayer: await rankedIds("truth-layer design"),
      widgets: await rankedIds("Example Widgets"),
      partialProfile: await rankedIds("ideal customer profile interviews churn"),
    };
    expect(actual).toEqual({
      typedBudget: ["ent_lrb_01", "ent_lrb_04", "ent_lrb_02"],
      untypedBudget: ["ent_lrb_01", "ent_lrb_07", "ent_lrb_26", "ent_lrb_04", "ent_lrb_02"],
      truthLayer: ["ent_lrb_09", "ent_lrb_10", "ent_lrb_30"],
      widgets: ["ent_lrb_22", "ent_lrb_18", "ent_lrb_23"],
      partialProfile: ["ent_lrb_14", "ent_lrb_15", "ent_lrb_13"],
    });
  });
});
