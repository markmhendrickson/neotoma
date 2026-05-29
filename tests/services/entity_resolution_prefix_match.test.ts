/**
 * Unit tests for the single-token prefix-match pass in the entity resolver.
 *
 * Scenario: a contact stored with only a first name (e.g. "Simon") must surface
 * an existing same-type multi-token entity ("Simon Bergeron") as a duplicate
 * candidate instead of silently minting an unrelated new entity. The new
 * entity is still created (no auto-merge); the existing one is surfaced on the
 * trace via `duplicateCandidates`.
 *
 * The resolver reads the `entities` table, so `db` is mocked with a small
 * in-memory table. The mock implements the chain shapes the resolver uses:
 *   - exact match:  from("entities").select("*").eq("id", id).maybeSingle()
 *   - insert:       from("entities").insert(row).select().single()
 *   - prefix scan:  from("entities").select(cols).eq("entity_type", t)[.eq("user_id", u)]
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface EntityRow {
  id: string;
  entity_type: string;
  canonical_name: string;
  user_id: string | null;
  merged_to_entity_id?: string | null;
  [k: string]: unknown;
}

const table: EntityRow[] = [];

vi.mock("../../src/db.js", () => {
  // Minimal chainable query builder over the in-memory `table`. Each builder
  // collects `.eq()` filters and resolves them lazily on terminal calls
  // (maybeSingle / single / await). This mirrors the supabase-style API the
  // resolver consumes without pulling in a real client.
  function builder(initialFilters: Array<[string, unknown]> = []) {
    const filters: Array<[string, unknown]> = [...initialFilters];

    function matches(): EntityRow[] {
      return table.filter((row) => filters.every(([k, v]) => (row as Record<string, unknown>)[k] === v));
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return chain;
      },
      maybeSingle: () => {
        const rows = matches();
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single: () => {
        const rows = matches();
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      // Awaiting the builder directly returns all matching rows (used by the
      // prefix scan, which does not call a terminal accessor).
      then: (resolve: (v: { data: EntityRow[]; error: null }) => unknown) =>
        resolve({ data: matches(), error: null }),
    };
    return chain;
  }

  const dbMock = {
    from: vi.fn((tableName: string) => {
      if (tableName !== "entities") {
        return {
          select: () => builder(),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        };
      }
      return {
        select: () => builder(),
        insert: (row: EntityRow) => {
          table.push({ ...row });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: row, error: null }),
            }),
          };
        },
      };
    }),
  };
  return { db: dbMock };
});

const TEST_USER = "00000000-0000-0000-0000-000000000000";

async function loadResolver() {
  return import("../../src/services/entity_resolution.js");
}

function seed(rows: Array<Omit<EntityRow, "user_id"> & { user_id?: string | null }>): void {
  for (const r of rows) {
    table.push({ user_id: TEST_USER, ...r });
  }
}

describe("entity resolver: single-token prefix-match pass", () => {
  beforeEach(() => {
    table.length = 0;
  });

  it("surfaces an existing two-token entity when a single-token name prefixes it", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    const bergeronId = generateEntityId("contact", "Simon Bergeron");
    seed([{ id: bergeronId, entity_type: "contact", canonical_name: "Simon Bergeron" }]);

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });

    // A NEW entity is minted (no auto-merge) ...
    expect(result.trace.action).toBe("created");
    expect(result.entityId).not.toBe(bergeronId);
    // ... and the existing multi-token entity is surfaced as a candidate.
    expect(result.trace.duplicateCandidates).toBeDefined();
    expect(result.trace.duplicateCandidates).toHaveLength(1);
    expect(result.trace.duplicateCandidates?.[0]).toMatchObject({
      code: "PREFIX_DUPLICATE_CANDIDATE",
      entityType: "contact",
      candidateEntityId: bergeronId,
      candidateCanonicalName: "Simon Bergeron",
    });
  });

  it("does not surface candidates for a multi-token input (gate is single-token only)", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    const bergeronId = generateEntityId("contact", "Simon Bergeron");
    seed([{ id: bergeronId, entity_type: "contact", canonical_name: "Simon Bergeron" }]);

    // Multi-token input that shares the first token but is itself two tokens.
    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon Tremblay" },
      userId: TEST_USER,
      schema: null,
    });

    expect(result.trace.action).toBe("created");
    expect(result.trace.duplicateCandidates).toBeUndefined();
  });

  it("surfaces every match (capped) when many entities share the first token — no forced single match", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    const ids = [
      generateEntityId("contact", "Simon Bergeron"),
      generateEntityId("contact", "Simon Tremblay"),
      generateEntityId("contact", "Simon Gagnon"),
    ];
    seed([
      { id: ids[0], entity_type: "contact", canonical_name: "Simon Bergeron" },
      { id: ids[1], entity_type: "contact", canonical_name: "Simon Tremblay" },
      { id: ids[2], entity_type: "contact", canonical_name: "Simon Gagnon" },
    ]);

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });

    expect(result.trace.action).toBe("created");
    expect(result.trace.duplicateCandidates).toHaveLength(3);
    // All three first-token matches surfaced; none elevated to a forced merge.
    const surfaced = (result.trace.duplicateCandidates ?? []).map((c) => c.candidateEntityId).sort();
    expect(surfaced).toEqual([...ids].sort());
  });

  it("does not treat a different first token as a prefix (false-positive guard)", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    const id = generateEntityId("contact", "Simone Bergeron");
    seed([{ id, entity_type: "contact", canonical_name: "Simone Bergeron" }]);

    // "Simon" is a substring of "Simone" but NOT the first token of the
    // existing entity's token sequence — must not surface.
    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });

    expect(result.trace.duplicateCandidates).toBeUndefined();
  });

  it("does not surface a single-token existing entity (exact-match territory, not a prefix)", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    // Existing single-token entity with a different name sharing nothing.
    const id = generateEntityId("contact", "Bergeron");
    seed([{ id, entity_type: "contact", canonical_name: "Bergeron" }]);

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });

    expect(result.trace.duplicateCandidates).toBeUndefined();
  });

  it("is deterministic: same inputs produce the same candidate set and ordering", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    const seedRows = () => {
      table.length = 0;
      seed([
        { id: generateEntityId("contact", "Simon Tremblay"), entity_type: "contact", canonical_name: "Simon Tremblay" },
        { id: generateEntityId("contact", "Simon Bergeron"), entity_type: "contact", canonical_name: "Simon Bergeron" },
      ]);
    };

    seedRows();
    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });
    seedRows();
    const b = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });

    const idsA = (a.trace.duplicateCandidates ?? []).map((c) => c.candidateEntityId);
    const idsB = (b.trace.duplicateCandidates ?? []).map((c) => c.candidateEntityId);
    expect(idsA).toEqual(idsB);
    // Ordering is by entity_id ascending and stable.
    expect(idsA).toEqual([...idsA].sort());
  });

  it("ignores merged-away entities when surfacing candidates", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    const liveId = generateEntityId("contact", "Simon Bergeron");
    const mergedId = generateEntityId("contact", "Simon Tremblay");
    seed([
      { id: liveId, entity_type: "contact", canonical_name: "Simon Bergeron" },
      {
        id: mergedId,
        entity_type: "contact",
        canonical_name: "Simon Tremblay",
        merged_to_entity_id: liveId,
      },
    ]);

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });

    expect(result.trace.duplicateCandidates).toHaveLength(1);
    expect(result.trace.duplicateCandidates?.[0].candidateEntityId).toBe(liveId);
  });

  it("does not surface candidates from a different entity_type", async () => {
    const { resolveEntityWithTrace, generateEntityId } = await loadResolver();

    const orgId = generateEntityId("organization", "Simon Group");
    seed([{ id: orgId, entity_type: "organization", canonical_name: "Simon Group" }]);

    const result = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name: "Simon" },
      userId: TEST_USER,
      schema: null,
    });

    expect(result.trace.duplicateCandidates).toBeUndefined();
  });
});
