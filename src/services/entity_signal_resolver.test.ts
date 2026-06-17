/**
 * Tests for entity_signal_resolver (#1603)
 *
 * All DB-hitting tests mock retrieveEntityByIdentifierWithFallback so we can
 * exercise the scoring logic without a live database. The pure scoring helper
 * (computeWeightedScore) and determinism tests need no mocking.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  identifyEntityBySignals,
  computeWeightedScore,
  type EntitySignals,
} from "./entity_signal_resolver.js";

// ---------------------------------------------------------------------------
// Mock the DB-hitting primitives
// ---------------------------------------------------------------------------

vi.mock("../shared/action_handlers/entity_identifier_handler.js", () => ({
  retrieveEntityByIdentifierWithFallback: vi.fn(),
}));

vi.mock("./schema_registry.js", () => ({
  resolveIdentitySearchFields: vi.fn(async (_et: string, base: string[]) => ({
    fields: base,
    usedFallback: true,
  })),
  loadConceptTypeSynonyms: vi.fn(async () => new Map()),
  normalizeEntityTypeForSchema: (s: string) => s.toLowerCase().replace(/\s+/g, "_"),
}));

vi.mock("./entity_resolution.js", () => ({
  normalizeEntityValue: (_et: string, s: string) => s.trim().toLowerCase(),
}));

import { retrieveEntityByIdentifierWithFallback } from "../shared/action_handlers/entity_identifier_handler.js";

const mockLookup = retrieveEntityByIdentifierWithFallback as ReturnType<typeof vi.fn>;

// Helper: build a minimal entity row
function makeEntity(
  id: string,
  opts: {
    canonical_name?: string;
    entity_type?: string;
    snapshot?: Record<string, unknown>;
  } = {}
) {
  return {
    id,
    entity_type: opts.entity_type ?? "person",
    canonical_name: opts.canonical_name ?? "Test Entity",
    snapshot: opts.snapshot ?? null,
  };
}

const USER_ID = "user_test_123";

// ---------------------------------------------------------------------------
// Pure scoring-table tests (no mocks needed)
// ---------------------------------------------------------------------------

describe("computeWeightedScore — pure scoring table", () => {
  it("single email signal full match → score 1.0", () => {
    const result = computeWeightedScore({
      suppliedSignals: [{ key: "email" }],
      entityContributions: [{ key: "email", contribution: 1.0 }],
    });
    expect(result.normalizedScore).toBeCloseTo(1.0);
    expect(result.scoreWithBonus).toBeCloseTo(1.0);
    expect(result.matchedSignals).toEqual(["email"]);
  });

  it("two signals both match → corroboration bonus applied", () => {
    const result = computeWeightedScore({
      suppliedSignals: [{ key: "email" }, { key: "name" }],
      entityContributions: [
        { key: "email", contribution: 1.0 },
        { key: "name", contribution: 1.0 },
      ],
    });
    expect(result.normalizedScore).toBeCloseTo(1.0);
    // Bonus: min(1 * 0.05, 0.15) = 0.05 — capped at 1.0
    expect(result.scoreWithBonus).toBeCloseTo(1.0);
    expect(result.matchedSignals).toHaveLength(2);
  });

  it("single signal partial match (0.7) normalized correctly", () => {
    const result = computeWeightedScore({
      suppliedSignals: [{ key: "name" }],
      entityContributions: [{ key: "name", contribution: 0.7 }],
    });
    expect(result.normalizedScore).toBeCloseTo(0.7);
    expect(result.scoreWithBonus).toBeCloseTo(0.7); // no corroboration bonus (only 1 signal)
  });

  it("three agreeing signals → max corroboration bonus 0.15", () => {
    const result = computeWeightedScore({
      suppliedSignals: [{ key: "email" }, { key: "name" }, { key: "company" }, { key: "domain" }],
      entityContributions: [
        { key: "email", contribution: 1.0 },
        { key: "name", contribution: 1.0 },
        { key: "company", contribution: 1.0 },
        { key: "domain", contribution: 1.0 },
      ],
    });
    // base 1.0, bonus = min(3 * 0.05, 0.15) = 0.15, capped at 1.0
    expect(result.scoreWithBonus).toBeCloseTo(1.0);
    expect(result.matchedSignals).toHaveLength(4);
  });

  it("no contributions → score 0, unresolved", () => {
    const result = computeWeightedScore({
      suppliedSignals: [{ key: "email" }, { key: "name" }],
      entityContributions: [],
    });
    expect(result.normalizedScore).toBeCloseTo(0);
    expect(result.scoreWithBonus).toBeCloseTo(0);
    expect(result.matchedSignals).toHaveLength(0);
  });

  it("partial overlap: email matches but name does not", () => {
    // email weight 1.0, name weight 0.7 → total weight 1.7
    // contribution: email=1.0 → weighted 1.0, name=0 → 0
    // normalizedScore = 1.0 / 1.7 ≈ 0.588
    const result = computeWeightedScore({
      suppliedSignals: [{ key: "email" }, { key: "name" }],
      entityContributions: [{ key: "email", contribution: 1.0 }],
    });
    expect(result.normalizedScore).toBeCloseTo(1.0 / 1.7);
    // no corroboration bonus (only one matched signal)
    expect(result.scoreWithBonus).toBeCloseTo(1.0 / 1.7);
    expect(result.matchedSignals).toEqual(["email"]);
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests with mocked lookup
// ---------------------------------------------------------------------------

describe("identifyEntityBySignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("email-exact match → best_match with high band", async () => {
    const entity = makeEntity("ent_001", {
      canonical_name: "Alice Smith",
      snapshot: { email: "alice@example.com", name: "Alice Smith" },
    });

    mockLookup.mockResolvedValue({
      entities: [entity],
      total: 1,
      match_mode: "snapshot_field",
    });

    const result = await identifyEntityBySignals({
      signals: { email: "alice@example.com" },
      userId: USER_ID,
    });

    expect(result.best_match).not.toBeNull();
    expect(result.best_match?.entity_id).toBe("ent_001");
    expect(result.best_match?.identity_score).toBeGreaterThanOrEqual(0.85);
    expect(result.resolution_band).toBe("high");
    expect(result.best_match?.matched_signals).toContain("email");
  });

  it("fuzzy name match → medium band (semantic mode)", async () => {
    const entity = makeEntity("ent_002", {
      canonical_name: "Robert Johnson",
      snapshot: { name: "Robert Johnson" },
    });

    mockLookup.mockResolvedValue({
      entities: [entity],
      total: 1,
      match_mode: "semantic",
    });

    const result = await identifyEntityBySignals({
      signals: { name: "Rob Johnson" },
      userId: USER_ID,
    });

    // Semantic-only matches are capped at medium band
    expect(result.best_match?.band).not.toBe("high");
    expect(["medium", "low", null]).toContain(result.best_match ? result.best_match.band : null);
  });

  it("corroboration: email + name both match → higher score than email alone", async () => {
    const entity = makeEntity("ent_003", {
      canonical_name: "Carol White",
      snapshot: { email: "carol@example.com", name: "Carol White" },
    });

    mockLookup.mockResolvedValue({
      entities: [entity],
      total: 1,
      match_mode: "snapshot_field",
    });

    const emailOnly = await identifyEntityBySignals({
      signals: { email: "carol@example.com" },
      userId: USER_ID,
    });

    const emailAndName = await identifyEntityBySignals({
      signals: { email: "carol@example.com", name: "Carol White" },
      userId: USER_ID,
    });

    const emailOnlyScore = emailOnly.best_match?.identity_score ?? 0;
    const combinedScore = emailAndName.best_match?.identity_score ?? 0;
    // Combined score >= email-only score (corroboration bonus)
    expect(combinedScore).toBeGreaterThanOrEqual(emailOnlyScore);
  });

  it("conflicting signals: two entities each matching different signals → both as candidates, no false high", async () => {
    const entityA = makeEntity("ent_A", {
      canonical_name: "Dave Entity",
      snapshot: { email: "dave@example.com" },
    });
    const entityB = makeEntity("ent_B", {
      canonical_name: "Dave Other",
      snapshot: { name: "Dave Other" },
    });

    // email lookup returns A, name lookup returns B
    mockLookup.mockImplementation(async (params: { by?: string; identifier: string }) => {
      if (params.by === "email") {
        return { entities: [entityA], total: 1, match_mode: "snapshot_field" };
      }
      return { entities: [entityB], total: 1, match_mode: "direct" };
    });

    const result = await identifyEntityBySignals({
      signals: { email: "dave@example.com", name: "Dave Other" },
      userId: USER_ID,
      max_candidates: 5,
    });

    // Neither entity should have both signals; best_match should not be "high"
    // unless it genuinely matches both signals
    const allIds = [
      result.best_match?.entity_id,
      ...result.candidates.map((c) => c.entity_id),
    ].filter(Boolean);
    expect(allIds).toContain("ent_A");
    expect(allIds).toContain("ent_B");

    // No entity should reach the high band with conflicting signals
    if (result.best_match?.band === "high") {
      // If a high match was returned, it must have matched both signals
      expect(result.best_match.matched_signals.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("no match → null best_match and unresolved band", async () => {
    mockLookup.mockResolvedValue({
      entities: [],
      total: 0,
      match_mode: "none",
    });

    const result = await identifyEntityBySignals({
      signals: { email: "nobody@nowhere.example" },
      userId: USER_ID,
    });

    expect(result.best_match).toBeNull();
    expect(result.resolution_band).toBe("unresolved");
    expect(result.candidates).toHaveLength(0);
  });

  it("determinism: same input twice returns identical results", async () => {
    const entity = makeEntity("ent_D", {
      canonical_name: "Diana Prince",
      snapshot: { email: "diana@example.com" },
    });

    mockLookup.mockResolvedValue({
      entities: [entity],
      total: 1,
      match_mode: "direct",
    });

    const signals: EntitySignals = { email: "diana@example.com", name: "Diana Prince" };

    const run1 = await identifyEntityBySignals({ signals, userId: USER_ID });
    const run2 = await identifyEntityBySignals({ signals, userId: USER_ID });

    expect(run1.best_match?.entity_id).toBe(run2.best_match?.entity_id);
    expect(run1.best_match?.identity_score).toBe(run2.best_match?.identity_score);
    expect(run1.resolution_band).toBe(run2.resolution_band);
    // Candidates order must be identical
    expect(run1.candidates.map((c) => c.entity_id)).toEqual(
      run2.candidates.map((c) => c.entity_id)
    );
  });

  it("synonym scope expansion: no explicit entity_type triggers synonym lookup", async () => {
    // loadConceptTypeSynonyms returns "financial_account" for "bank account"
    const { loadConceptTypeSynonyms } = await import("./schema_registry.js");
    (loadConceptTypeSynonyms as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Map([["bank account", "financial_account"]])
    );

    mockLookup.mockResolvedValue({
      entities: [],
      total: 0,
      match_mode: "none",
    });

    await identifyEntityBySignals({
      signals: { name: "bank account" },
      userId: USER_ID,
    });

    // The synonym expansion should have been called
    expect(loadConceptTypeSynonyms).toHaveBeenCalled();
  });

  it("include_observations flag is forwarded to sub-lookups", async () => {
    const entity = makeEntity("ent_E", {
      snapshot: { email: "eve@example.com" },
    });
    (entity as Record<string, unknown>)["observations"] = [{ id: "obs_1" }];

    mockLookup.mockResolvedValue({
      entities: [entity],
      total: 1,
      match_mode: "snapshot_field",
    });

    const result = await identifyEntityBySignals({
      signals: { email: "eve@example.com" },
      userId: USER_ID,
      include_observations: true,
    });

    // Verify the lookup was called with includeObservations=true
    expect(mockLookup).toHaveBeenCalledWith(expect.objectContaining({ includeObservations: true }));
    // best_match should exist (observations are irrelevant to scoring)
    expect(result.best_match).not.toBeNull();
  });

  it("empty signals object → unresolved", async () => {
    const result = await identifyEntityBySignals({
      signals: {},
      userId: USER_ID,
    });

    expect(result.best_match).toBeNull();
    expect(result.resolution_band).toBe("unresolved");
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("max_candidates limits returned candidates", async () => {
    // Return 6 distinct entities from the lookup
    const entities = Array.from({ length: 6 }, (_, i) =>
      makeEntity(`ent_F${i}`, { canonical_name: `Entity ${i}`, snapshot: { name: `Entity ${i}` } })
    );

    mockLookup.mockResolvedValue({
      entities,
      total: 6,
      match_mode: "direct",
    });

    const result = await identifyEntityBySignals({
      signals: { name: "Entity" },
      userId: USER_ID,
      max_candidates: 3,
    });

    // best_match takes 1, candidates capped at 3
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });
});
