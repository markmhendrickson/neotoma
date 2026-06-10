/**
 * Unit tests for entity_queries status projection and filter (#1586).
 *
 * Regression tests verifying:
 * 1. The lightweight list projection (includeSnapshots=false) includes `status`
 *    in each returned entity's snapshot field.
 * 2. snapshotFilters with a `status` eq filter is wired through (server-side)
 *    and returns only matching rows — no silent-zero.
 * 3. A status filter that matches nothing returns an empty array (not an error).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { db } from "../../src/db.js";

vi.mock("../../src/db.js", () => ({
  db: {
    from: vi.fn(),
  },
}));

// Chain builder for fluent PostgREST-style query mocks.
// Each terminal resolution is triggered by awaiting (via .then).
function buildQuery(resolvedData: unknown[], resolvedError: unknown = null): any {
  const q: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolvedData[0] ?? null, error: resolvedError }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: resolvedData, error: resolvedError }).then(resolve),
  };
  return q;
}

describe("entity_queries — status projection (#1586)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes status in snapshot when entity has a status value (lightweight path)", async () => {
    const { queryEntities } = await import("../../src/services/entity_queries.js");

    const entityRow = {
      id: "ent_abc123",
      entity_type: "client",
      canonical_name: "Alice",
      user_id: "user_1",
      merged_to_entity_id: null,
      merged_at: null,
      created_at: "2025-01-01T00:00:00Z",
    };

    const snapshotRow = {
      entity_id: "ent_abc123",
      schema_version: "1.0",
      observation_count: 1,
      last_observation_at: "2025-01-01T00:00:00Z",
      computed_at: "2025-01-01T00:00:00Z",
      // PostgREST returns the extracted text value under the key "status"
      status: "active",
    };

    // deletionObservations (getDeletedEntityIds) — observations query
    const deletionQuery = buildQuery([]);
    // entities chunk scan
    const entityQuery = buildQuery([entityRow]);
    // entity_snapshots lightweight select
    const snapshotQuery = buildQuery([snapshotRow]);

    vi.mocked(db.from)
      .mockReturnValueOnce(entityQuery) // entities (scan chunk)
      .mockReturnValueOnce(deletionQuery) // observations (deletion check)
      .mockReturnValueOnce(snapshotQuery); // entity_snapshots (lightweight)

    const results = await queryEntities({
      userId: "user_1",
      entityType: "client",
      includeSnapshots: false,
      limit: 10,
      offset: 0,
    });

    expect(results).toHaveLength(1);
    expect(results[0].entity_id).toBe("ent_abc123");
    // The core regression: status must appear in snapshot even without includeSnapshots
    expect(results[0].snapshot).toEqual({ status: "active" });
  });

  it("returns empty snapshot (not undefined) when entity has no status value", async () => {
    const { queryEntities } = await import("../../src/services/entity_queries.js");

    const entityRow = {
      id: "ent_def456",
      entity_type: "client",
      canonical_name: "Bob",
      user_id: "user_1",
      merged_to_entity_id: null,
      merged_at: null,
      created_at: "2025-01-01T00:00:00Z",
    };

    const snapshotRow = {
      entity_id: "ent_def456",
      schema_version: "1.0",
      observation_count: 1,
      last_observation_at: "2025-01-01T00:00:00Z",
      computed_at: "2025-01-01T00:00:00Z",
      status: null, // no status
    };

    const deletionQuery = buildQuery([]);
    const entityQuery = buildQuery([entityRow]);
    const snapshotQuery = buildQuery([snapshotRow]);

    vi.mocked(db.from)
      .mockReturnValueOnce(entityQuery)
      .mockReturnValueOnce(deletionQuery)
      .mockReturnValueOnce(snapshotQuery);

    const results = await queryEntities({
      userId: "user_1",
      entityType: "client",
      includeSnapshots: false,
      limit: 10,
      offset: 0,
    });

    expect(results).toHaveLength(1);
    // When status is null, snapshot should be empty (not crash, not undefined)
    expect(results[0].snapshot).toEqual({});
  });

  it("mixed-status list: each row includes its own status value", async () => {
    const { queryEntities } = await import("../../src/services/entity_queries.js");

    const entityActive = {
      id: "ent_active",
      entity_type: "client",
      canonical_name: "Active Client",
      user_id: "user_1",
      merged_to_entity_id: null,
      merged_at: null,
      created_at: "2025-01-01T00:00:00Z",
    };
    const entityInactive = {
      id: "ent_inactive",
      entity_type: "client",
      canonical_name: "Inactive Client",
      user_id: "user_1",
      merged_to_entity_id: null,
      merged_at: null,
      created_at: "2025-01-02T00:00:00Z",
    };

    const snapshotActive = {
      entity_id: "ent_active",
      schema_version: "1.0",
      observation_count: 1,
      last_observation_at: "2025-01-01T00:00:00Z",
      computed_at: "2025-01-01T00:00:00Z",
      status: "active",
    };
    const snapshotInactive = {
      entity_id: "ent_inactive",
      schema_version: "1.0",
      observation_count: 1,
      last_observation_at: "2025-01-02T00:00:00Z",
      computed_at: "2025-01-02T00:00:00Z",
      status: "inactive",
    };

    const deletionQuery = buildQuery([]);
    const entityQuery = buildQuery([entityActive, entityInactive]);
    const snapshotQuery = buildQuery([snapshotActive, snapshotInactive]);

    vi.mocked(db.from)
      .mockReturnValueOnce(entityQuery)
      .mockReturnValueOnce(deletionQuery)
      .mockReturnValueOnce(snapshotQuery);

    const results = await queryEntities({
      userId: "user_1",
      entityType: "client",
      includeSnapshots: false,
      limit: 10,
      offset: 0,
    });

    expect(results).toHaveLength(2);

    const active = results.find((r) => r.entity_id === "ent_active");
    const inactive = results.find((r) => r.entity_id === "ent_inactive");

    // Each row must carry its own status — not the same value or empty
    expect(active?.snapshot.status).toBe("active");
    expect(inactive?.snapshot.status).toBe("inactive");
  });

  it("snapshotFilters status eq filter uses snapshot->>status column expression", async () => {
    // This test verifies the query builder is called with the right filter expression
    // by inspecting the mock calls — the snapshot-driven scan path is used when
    // snapshotFilters are provided.
    const { queryEntities } = await import("../../src/services/entity_queries.js");

    // The shouldUseSnapshotDrivenScan path fires when snapshotFilters is present.
    // It queries entity_snapshots first (for entity_ids), then entities, then snapshots.
    const snapshotScanRow = { entity_id: "ent_active" };
    const entityById = {
      id: "ent_active",
      entity_type: "client",
      canonical_name: "Active Client",
      user_id: "user_1",
      merged_to_entity_id: null,
      merged_at: null,
      created_at: "2025-01-01T00:00:00Z",
    };
    const snapshotRow = {
      entity_id: "ent_active",
      schema_version: "1.0",
      observation_count: 1,
      last_observation_at: "2025-01-01T00:00:00Z",
      computed_at: "2025-01-01T00:00:00Z",
      status: "active",
    };

    // snapshot-driven scan: entity_snapshots for id candidates
    const snapshotScanQuery = buildQuery([snapshotScanRow]);
    // entities lookup by id (fetchEntitiesByIds)
    const entityLookupQuery = buildQuery([entityById]);
    // deletion check (getDeletedEntityIds)
    const deletionQuery = buildQuery([]);
    // entity_snapshots lightweight fetch (after scan)
    const snapshotFetchQuery = buildQuery([snapshotRow]);

    // db.from is called in this order for the snapshot-driven scan path:
    //   1. db.from("entities") at line 195 — query builder only, not awaited in snapshot path
    //   2. db.from("entity_snapshots") at line 278 — the actual scan (awaited)
    //   3. db.from("entities") inside fetchEntitiesByIds (awaited)
    //   4. db.from("observations") inside getDeletedEntityIds (awaited)
    //   5. db.from("entity_snapshots") at line 451 — lightweight snapshot fetch (awaited)
    const unusedEntityQuery = buildQuery([]);
    vi.mocked(db.from)
      .mockReturnValueOnce(unusedEntityQuery) // entities (line 195, built but not awaited)
      .mockReturnValueOnce(snapshotScanQuery) // entity_snapshots scan (snapshot-driven path)
      .mockReturnValueOnce(entityLookupQuery) // entities by ids (fetchEntitiesByIds)
      .mockReturnValueOnce(deletionQuery) // observations (deletion check)
      .mockReturnValueOnce(snapshotFetchQuery); // entity_snapshots lightweight

    const results = await queryEntities({
      userId: "user_1",
      entityType: "client",
      includeSnapshots: false,
      snapshotFilters: { status: { op: "eq", value: "active" } },
      limit: 10,
      offset: 0,
    });

    // The eq filter for status must have been applied on the scan query
    // (other eq calls for user_id, entity_type also happen on this same mock)
    const eqCalls = snapshotScanQuery.eq.mock.calls as [string, unknown][];
    const statusEqCall = eqCalls.find(([col]) => col === "snapshot->>status");
    expect(statusEqCall).toBeDefined();
    expect(statusEqCall![1]).toBe("active");

    // Non-empty result — the core silent-zero regression
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snapshot.status).toBe("active");
  });

  it("status filter that matches nothing returns empty array (not an error)", async () => {
    const { queryEntities } = await import("../../src/services/entity_queries.js");

    // snapshot-driven scan: no matching entity_ids
    const snapshotScanQuery = buildQuery([]);

    // db.from("entities") at line 195 (built but not awaited in snapshot path),
    // then db.from("entity_snapshots") at line 278 (the scan, returns empty)
    vi.mocked(db.from)
      .mockReturnValueOnce(buildQuery([])) // entities (line 195, unused)
      .mockReturnValueOnce(snapshotScanQuery); // entity_snapshots scan returns empty

    const results = await queryEntities({
      userId: "user_1",
      entityType: "client",
      includeSnapshots: false,
      snapshotFilters: { status: { op: "eq", value: "nonexistent_status" } },
      limit: 10,
      offset: 0,
    });

    expect(results).toEqual([]);
  });
});
