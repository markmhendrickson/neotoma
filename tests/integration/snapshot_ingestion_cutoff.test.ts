/**
 * Tests for retrieve_entity_snapshot at_ingested cutoff (#1757, #1819)
 *
 * Verifies that the `at_ingested` parameter (ingestion-time cutoff) correctly
 * excludes observations that have a past `observed_at` but arrived after the
 * cutoff, preventing look-ahead leaks from backfilled or late-arriving data.
 *
 * The distinction:
 *   - `at`          filters on `observed_at` (event time):    "what had happened by T"
 *   - `at_ingested` filters on `created_at`  (ingestion time): "what did we know by T"
 *
 * #1819: the at/at_ingested cutoffs were ONLY applied on the MCP (server.ts) path;
 * the offline/HTTP path (actions.ts › POST /get_entity_snapshot) silently ignored
 * them and always returned the materialized snapshot. The shared helper
 * `computeEntitySnapshotAtTime` fixes both paths — the suites below cover both.
 */

import { createServer } from "node:http";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { app } from "../../src/actions.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { computeEntitySnapshotAtTime } from "../../src/services/entity_snapshot_at_time.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callMCPAction(server: NeotomaServer, actionName: string, params: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
  const methodName = actionName.replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase());
  return (server as any)[methodName](params);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("retrieve_entity_snapshot — at_ingested ingestion-time cutoff (#1757)", () => {
  const tracker = new TestIdTracker();
  const testUserId = "00000000-0000-0000-0000-000000000000";

  afterAll(async () => {
    await tracker.cleanup();
  });

  it("at_ingested excludes late-arriving backfilled observation that at includes", async () => {
    // We set up an entity with two observations:
    //
    //   obs_early:    observed_at = T-3 days, created_at = T-3 days  (genuinely historical)
    //   obs_backfill: observed_at = T-2 days, created_at = NOW        (late arrival / backfill)
    //
    // Query window: at = T-1 day, at_ingested = T-1 day
    //
    //   - `at` alone should return BOTH (both observed_at ≤ T-1) and the reducer
    //     picks obs_backfill (observed_at T-2 > T-3) → status="done" deterministically.
    //   - `at_ingested` alone should return ONLY obs_early (obs_backfill.created_at > T-1)
    //     → status="pending".
    //   - Both together should return ONLY obs_early (most conservative).
    //
    // This differentiates the observations on `observed_at` so the reducer's primary
    // sort key (observed_at DESC) breaks the tie deterministically — never relying on
    // id ASC over random UUIDs.

    const entityId = `ent_test_1757_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    tracker.trackEntity(entityId);

    // Create a source row (required FK for observations)
    const { data: source, error: sourceError } = await db
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: `hash_1757_${randomUUID()}`,
        storage_url: "file:///test/snapshot_ingestion_cutoff.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();

    expect(sourceError).toBeNull();
    expect(source).toBeDefined();
    tracker.trackSource(source!.id);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // obs_early: observed_at = T-3, created_at = T-3 (genuinely historical)
    const { error: err1 } = await db.from("observations").insert({
      entity_id: entityId,
      entity_type: "task",
      schema_version: "1.0",
      source_id: source!.id,
      user_id: testUserId,
      observed_at: threeDaysAgo,
      created_at: threeDaysAgo,
      fields: { title: "Early Observation", status: "pending" },
    });
    expect(err1).toBeNull();

    // obs_backfill: observed_at = T-2 (looks more recent) but created_at = NOW (late arrival).
    // This simulates a backfill that was ingested today but describes a past event.
    // Because observed_at T-2 > T-3, the reducer will deterministically prefer this
    // observation's fields when both are included — so the look-ahead leak is
    // demonstrated without any UUID tie-breaking coin-flip.
    const { error: err2 } = await db.from("observations").insert({
      entity_id: entityId,
      entity_type: "task",
      schema_version: "1.0",
      source_id: source!.id,
      user_id: testUserId,
      observed_at: twoDaysAgo,
      created_at: now,
      fields: { title: "Backfilled Observation", status: "done" },
    });
    expect(err2).toBeNull();

    // Set up the server
    const server = new NeotomaServer();
    (server as any).authenticatedUserId = testUserId;

    // -----------------------------------------------------------------------
    // Case 1: `at` alone (event-time only) — should include BOTH observations
    // since both have observed_at ≤ oneDayAgo. The reducer sorts by observed_at
    // DESC, so obs_backfill (T-2) wins over obs_early (T-3) → status="done".
    // This is deterministic because observed_at values differ.
    // -----------------------------------------------------------------------
    const resultAt = await callMCPAction(server, "retrieve_entity_snapshot", {
      entity_id: entityId,
      at: oneDayAgo,
      format: "json",
    });

    const dataAt = JSON.parse(resultAt.content[0].text);
    // Both observations pass the at filter; the snapshot should be non-empty
    expect(dataAt.observation_count).toBe(2);
    // The backfilled obs wins (observed_at T-2 > T-3) → status=done
    expect(dataAt.snapshot?.status).toBe("done");

    // -----------------------------------------------------------------------
    // Case 2: `at_ingested` alone (ingestion-time only) — should EXCLUDE the
    // backfill (created_at = now > oneDayAgo) and include only obs_early.
    // The snapshot should reflect obs_early's fields (status=pending).
    // -----------------------------------------------------------------------
    const resultAtIngested = await callMCPAction(server, "retrieve_entity_snapshot", {
      entity_id: entityId,
      at_ingested: oneDayAgo,
      format: "json",
    });

    const dataAtIngested = JSON.parse(resultAtIngested.content[0].text);
    expect(dataAtIngested.observation_count).toBe(1);
    expect(dataAtIngested.snapshot?.status).toBe("pending");

    // -----------------------------------------------------------------------
    // Case 3: Both `at` and `at_ingested` — AND semantics, same conservative
    // result as at_ingested alone here (backfill fails created_at check).
    // -----------------------------------------------------------------------
    const resultBoth = await callMCPAction(server, "retrieve_entity_snapshot", {
      entity_id: entityId,
      at: oneDayAgo,
      at_ingested: oneDayAgo,
      format: "json",
    });

    const dataBoth = JSON.parse(resultBoth.content[0].text);
    expect(dataBoth.observation_count).toBe(1);
    expect(dataBoth.snapshot?.status).toBe("pending");
  });

  it("at_ingested with no matching observations returns empty snapshot", async () => {
    const entityId = `ent_test_1757_empty_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    tracker.trackEntity(entityId);

    const { data: source, error: sourceError } = await db
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: `hash_1757_empty_${randomUUID()}`,
        storage_url: "file:///test/snapshot_ingestion_empty.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();

    expect(sourceError).toBeNull();
    tracker.trackSource(source!.id);

    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Insert an observation ingested NOW
    const { error: err } = await db.from("observations").insert({
      entity_id: entityId,
      entity_type: "task",
      schema_version: "1.0",
      source_id: source!.id,
      user_id: testUserId,
      observed_at: now,
      created_at: now,
      fields: { title: "Recent Observation" },
    });
    expect(err).toBeNull();

    const server = new NeotomaServer();
    (server as any).authenticatedUserId = testUserId;

    // at_ingested = one hour ago → the observation (created now) is excluded
    const result = await callMCPAction(server, "retrieve_entity_snapshot", {
      entity_id: entityId,
      at_ingested: oneHourAgo,
      format: "json",
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.observation_count).toBe(0);
    expect(data.snapshot).toEqual({});
  });

  it("at_ingested with invalid timestamp returns validation error", async () => {
    const server = new NeotomaServer();
    (server as any).authenticatedUserId = testUserId;

    // We need an existing entity; create a minimal one
    const entityId = `ent_test_1757_invalid_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    tracker.trackEntity(entityId);

    const { data: source, error: sourceError } = await db
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: `hash_1757_invalid_${randomUUID()}`,
        storage_url: "file:///test/snapshot_ingestion_invalid.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();

    expect(sourceError).toBeNull();
    tracker.trackSource(source!.id);

    await db.from("observations").insert({
      entity_id: entityId,
      entity_type: "task",
      schema_version: "1.0",
      source_id: source!.id,
      user_id: testUserId,
      observed_at: new Date().toISOString(),
      fields: { title: "Validation Test" },
    });

    let caughtError: unknown;
    try {
      await callMCPAction(server, "retrieve_entity_snapshot", {
        entity_id: entityId,
        at_ingested: "not-a-valid-timestamp",
        format: "json",
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect((caughtError as Error).message).toMatch(/at_ingested/i);
  });
});

// ---------------------------------------------------------------------------
// #1819 — offline/HTTP path (actions.ts) must honour at/at_ingested
// ---------------------------------------------------------------------------
// These tests exercise the shared `computeEntitySnapshotAtTime` helper and the
// actions.ts HTTP handler directly so the offline transport cannot silently
// regress to reading only the materialized entity_snapshots table.
// ---------------------------------------------------------------------------

describe("retrieve_entity_snapshot — offline/HTTP path honours at_ingested (#1819)", () => {
  const tracker = new TestIdTracker();
  // The offline path uses LOCAL_DEV_USER_ID when called from localhost without
  // a Bearer token. The direct-helper tests pass this userId explicitly.
  const testUserId = LOCAL_DEV_USER_ID;

  // HTTP server for the actions.ts handler tests
  let httpServer: ReturnType<typeof createServer>;
  const httpPort = 18267; // avoid collision with other test suites
  const httpBase = `http://127.0.0.1:${httpPort}`;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(httpPort, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
  });

  afterAll(async () => {
    await tracker.cleanup();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Insert a source row and return its id. */
  async function insertSource(tag: string): Promise<string> {
    const { data: source, error } = await db
      .from("sources")
      .insert({
        user_id: testUserId,
        content_hash: `hash_1819_${tag}_${randomUUID()}`,
        storage_url: `file:///test/1819_${tag}.txt`,
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();
    if (error || !source) throw new Error(`insertSource failed: ${error?.message}`);
    tracker.trackSource(source.id);
    return source.id;
  }

  /** Insert an observation row with explicit created_at (simulates backfill). */
  async function insertObservation(opts: {
    entityId: string;
    sourceId: string;
    observedAt: string;
    createdAt: string;
    fields: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await db.from("observations").insert({
      entity_id: opts.entityId,
      entity_type: "task",
      schema_version: "1.0",
      source_id: opts.sourceId,
      user_id: testUserId,
      observed_at: opts.observedAt,
      created_at: opts.createdAt,
      fields: opts.fields,
    });
    if (error) throw new Error(`insertObservation failed: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Test 1: computeEntitySnapshotAtTime — the shared helper
  // -------------------------------------------------------------------------

  it("computeEntitySnapshotAtTime: at_ingested excludes backfilled observation", async () => {
    const entityId = `ent_test_1819_helper_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    tracker.trackEntity(entityId);
    const sourceId = await insertSource("helper");

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // obs_early: genuinely historical
    await insertObservation({
      entityId,
      sourceId,
      observedAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      fields: { title: "Early", status: "pending" },
    });

    // obs_backfill: describes the past (observed_at T-2) but ingested NOW
    await insertObservation({
      entityId,
      sourceId,
      observedAt: twoDaysAgo,
      createdAt: now,
      fields: { title: "Backfill", status: "done" },
    });

    // --- no cutoff: both observations → reducer picks backfill (observed_at T-2 > T-3)
    const noCutoff = await computeEntitySnapshotAtTime(entityId, testUserId);
    expect(noCutoff).not.toBeNull();
    expect(noCutoff!.observation_count).toBe(2);
    expect(noCutoff!.snapshot.status).toBe("done");

    // --- at_ingested = oneDayAgo: backfill (created_at = now) is EXCLUDED
    const cutoff = await computeEntitySnapshotAtTime(entityId, testUserId, undefined, oneDayAgo);
    expect(cutoff).not.toBeNull();
    expect(cutoff!.observation_count).toBe(1);
    expect(cutoff!.snapshot.status).toBe("pending");

    // --- at_ingested before any ingestion: empty snapshot
    const tooEarly = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const empty = await computeEntitySnapshotAtTime(entityId, testUserId, undefined, tooEarly);
    expect(empty).not.toBeNull();
    expect(empty!.observation_count).toBe(0);
    expect(empty!.snapshot).toEqual({});
  });

  it("computeEntitySnapshotAtTime: at (event-time) excludes future-observed observations", async () => {
    const entityId = `ent_test_1819_at_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    tracker.trackEntity(entityId);
    const sourceId = await insertSource("at");

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const tomorrow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();

    await insertObservation({
      entityId,
      sourceId,
      observedAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      fields: { title: "Old", status: "pending" },
    });
    // future-dated observation
    await insertObservation({
      entityId,
      sourceId,
      observedAt: tomorrow,
      createdAt: threeDaysAgo,
      fields: { title: "Future", status: "done" },
    });

    // at = yesterday: future obs excluded → status remains "pending"
    const result = await computeEntitySnapshotAtTime(entityId, testUserId, yesterday);
    expect(result).not.toBeNull();
    expect(result!.observation_count).toBe(1);
    expect(result!.snapshot.status).toBe("pending");
  });

  it("computeEntitySnapshotAtTime: returns null for unknown entity", async () => {
    const result = await computeEntitySnapshotAtTime(
      "ent_does_not_exist_1819",
      testUserId,
      undefined,
      new Date().toISOString()
    );
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 2: HTTP handler (actions.ts POST /get_entity_snapshot)
  // -------------------------------------------------------------------------

  it("HTTP /get_entity_snapshot: at_ingested cutoff is honoured (offline path)", async () => {
    const entityId = `ent_test_1819_http_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    tracker.trackEntity(entityId);
    const sourceId = await insertSource("http");

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await insertObservation({
      entityId,
      sourceId,
      observedAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      fields: { title: "Early HTTP", status: "pending" },
    });
    await insertObservation({
      entityId,
      sourceId,
      observedAt: twoDaysAgo,
      createdAt: now,
      fields: { title: "Backfill HTTP", status: "done" },
    });

    // POST without cutoff — returns the materialized snapshot (or empty if not yet
    // computed). We don't assert specific values here as the entity_snapshots table
    // may not be populated yet; the key assertion is that at_ingested is applied.

    // POST with at_ingested = oneDayAgo should EXCLUDE the backfill (created_at = now)
    // and return observation_count=1 with status="pending"
    const resp = await fetch(`${httpBase}/get_entity_snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, at_ingested: oneDayAgo }),
    });

    expect(resp.ok).toBe(true);
    const data = await resp.json() as Record<string, unknown>;

    // The response must reflect only the early observation
    expect(data.observation_count).toBe(1);
    expect((data.snapshot as Record<string, unknown>).status).toBe("pending");
  });

  it("HTTP /get_entity_snapshot: invalid at_ingested returns 500 with message", async () => {
    const entityId = `ent_test_1819_http_invalid_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    tracker.trackEntity(entityId);
    const sourceId = await insertSource("http-invalid");

    await insertObservation({
      entityId,
      sourceId,
      observedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      fields: { title: "Validation", status: "pending" },
    });

    const resp = await fetch(`${httpBase}/get_entity_snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, at_ingested: "not-a-valid-iso-timestamp" }),
    });

    // The handler wraps errors from computeEntitySnapshotAtTime as 500
    expect(resp.status).toBe(500);
    const body = await resp.json() as Record<string, unknown>;
    expect((body.message as string | undefined)?.toLowerCase()).toMatch(/at_ingested/i);
  });
});
