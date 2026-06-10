/**
 * Regression tests for the lightweight (include_snapshots=false) projection on
 * the local SQLite backend (issues #1627 and #1625).
 *
 * The lightweight projection used to select `snapshot->>status`. That PostgREST
 * JSON-operator syntax is only translated by the SQLite adapter inside filter
 * clauses (normalizeColumnName), NOT inside the raw SELECT list, so SQLite
 * resolved `status` as a literal column and threw:
 *
 *   Failed to query snapshots: no such column: status
 *
 * This failed for EVERY entity type (#1627), and reading any type whose snapshot
 * lacks a `status` field — e.g. `activity_log` (#1625) — hit the same error.
 *
 * Unlike `tests/integration/entity_queries.test.ts` (excluded from the default
 * lane and only run against Postgres with RUN_REMOTE_TESTS=1), this suite runs
 * on the default local SQLite lane so the adapter-specific bug is actually
 * exercised.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, getServiceRoleClient } from "../../src/db.js";
import { queryEntities } from "../../src/services/entity_queries.js";

const serviceRoleClient = getServiceRoleClient();

describe("queryEntities lightweight projection on SQLite (#1627, #1625)", () => {
  const testUserId = "status-column-regression-user";
  const testEntityIds: string[] = [];

  async function cleanupEntities() {
    if (testEntityIds.length === 0) return;
    await db.from("entity_snapshots").delete().in("entity_id", testEntityIds);
    await db.from("entities").delete().in("id", testEntityIds);
    testEntityIds.length = 0;
  }

  async function createEntityWithSnapshot(
    id: string,
    entityType: string,
    canonicalName: string,
    snapshot: Record<string, unknown>
  ) {
    const now = new Date().toISOString();
    await serviceRoleClient.from("entities").insert({
      id,
      user_id: testUserId,
      entity_type: entityType,
      canonical_name: canonicalName,
    });
    testEntityIds.push(id);
    await serviceRoleClient.from("entity_snapshots").upsert({
      entity_id: id,
      user_id: testUserId,
      entity_type: entityType,
      schema_version: "1.0",
      canonical_name: canonicalName,
      snapshot,
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

  it("returns rows (no error) for a type WITH a status field and carries status", async () => {
    await createEntityWithSnapshot(
      "ent_status_txn",
      "transaction",
      "Coffee purchase",
      { amount: 4.5, status: "cleared" }
    );

    const results = await queryEntities({
      userId: testUserId,
      entityType: "transaction",
      includeSnapshots: false,
      limit: 100,
      offset: 0,
    });

    const found = results.find((e) => e.entity_id === "ent_status_txn");
    expect(found).toBeDefined();
    // The lightweight row must still carry status derived from the snapshot.
    expect(found!.snapshot).toEqual({ status: "cleared" });
  });

  it("returns rows (no error) for a type WITHOUT a status field (#1625)", async () => {
    await createEntityWithSnapshot(
      "ent_no_status_log",
      "activity_log",
      "User signed in",
      { action: "login", actor: "system" }
    );

    // The core regression: this used to throw
    //   "Failed to query snapshots: no such column: status"
    const results = await queryEntities({
      userId: testUserId,
      entityType: "activity_log",
      includeSnapshots: false,
      limit: 100,
      offset: 0,
    });

    const found = results.find((e) => e.entity_id === "ent_no_status_log");
    expect(found).toBeDefined();
    // No status field on the snapshot → empty lightweight snapshot, not an error.
    expect(found!.snapshot).toEqual({});
  });

  it("returns mixed types in one lightweight scan without throwing", async () => {
    await createEntityWithSnapshot("ent_mix_txn", "transaction", "Refund", {
      amount: 12,
      status: "pending",
    });
    await createEntityWithSnapshot("ent_mix_log", "activity_log", "Logout event", {
      action: "logout",
    });

    const results = await queryEntities({
      userId: testUserId,
      includeSnapshots: false,
      limit: 100,
      offset: 0,
    });

    const txn = results.find((e) => e.entity_id === "ent_mix_txn");
    const log = results.find((e) => e.entity_id === "ent_mix_log");
    expect(txn).toBeDefined();
    expect(log).toBeDefined();
    expect(txn!.snapshot).toEqual({ status: "pending" });
    expect(log!.snapshot).toEqual({});
  });
});
