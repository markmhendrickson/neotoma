/**
 * OFFLINE/local-transport parity gate.
 *
 * An external evaluator's regressions clustered in the offline/HTTP transport —
 * the path historically exercised less than MCP (#1842 issue-submit auth, #1840
 * dedup snapshot, #1819 at_ingested cutoff). This curated suite runs the SAME
 * behavioral assertions through BOTH the MCP dispatch surface and the
 * offline/local HTTP (Express) surface, failing CI if a behavior passes on one
 * transport and not the other. It is the teeth behind the `contract_parity` CI
 * lane: a behavior that broke on the offline path before now has a cross-surface
 * assertion locking the fix on both.
 *
 * Each cell asserts the EFFECT (observation count, reduced snapshot, warning
 * emission, auth outcome) — never mere input acceptance — per task_policy
 * fixed_means_behavior_verified_not_contract_accepted (ent_db0b7855d47012084477fb00)
 * and cross_surface_contract_parity_tested_all_surfaces (ent_2ad0677fe23c0c1878ae43e8).
 * New infra; ties to task ent_5850561116.
 *
 * The five curated behaviors (and the issues they lock in):
 *   1. at_ingested ingestion-time snapshot cutoff           (#1819) — MCP + offline
 *   2. at event-time snapshot cutoff                        (#1819) — MCP + offline
 *   3. dedup store: identical re-store keeps obs count = 1  (#1840) — MCP + offline
 *      (MCP additionally returns deduplicated:true + populated snapshot_after)
 *   4. NULL_CLEARED_FIELD warning under highest_priority    (#1839) — offline (by design)
 *   5. issue-submit local-loopback auth fallback            (#1842) — offline (by design)
 *
 * Behaviors 1–3 are true cross-transport parity cells (identical effect on both).
 * Behaviors 4–5 are single-transport BY DESIGN; each documents in the matrix WHY
 * the other transport does not expose the behavior (see transport_parity_matrix.ts).
 */

import type { Server } from "node:http";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { routeAllowsLocalIssueWriteFallback } from "../../src/actions.js";
import {
  PARITY_USER_ID,
  TRANSPORT_PARITY_MATRIX,
  assertIdenticalEffect,
  callHttp,
  callMcp,
  insertObservation,
  insertSource,
  makeMcpServer,
  observationCount,
  reduceSnapshot,
  snapshotAtCutoff,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

describe("OFFLINE/local-transport parity gate (curated MCP↔offline behaviors)", () => {
  let mcpServer: NeotomaServer;
  let offline: { server: Server; base: string };

  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];
  const createdSchemaTypes: string[] = [];

  beforeAll(async () => {
    mcpServer = makeMcpServer();
    offline = await startOfflineServer();
  });

  afterAll(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
    }
    for (const t of createdSchemaTypes) {
      await db.from("schema_registry").delete().eq("entity_type", t).eq("user_id", PARITY_USER_ID);
    }
    await stopServer(offline.server);
  });

  // Sanity: the matrix is the single source of truth for which behaviors this
  // gate covers. If a cell is added/removed, this assertion documents the count.
  it("matrix declares the five curated transport-parity behaviors", () => {
    expect(TRANSPORT_PARITY_MATRIX.map((s) => s.id)).toEqual([
      "snapshot_at_ingested_cutoff",
      "snapshot_at_event_time_cutoff",
      "store_dedup_observation_count",
      "null_cleared_field_warning",
      "issue_submit_local_auth_fallback",
    ]);
  });

  // -------------------------------------------------------------------------
  // Cell 1 (#1819) — at_ingested ingestion-time cutoff: MCP ↔ offline parity.
  // -------------------------------------------------------------------------
  it("at_ingested cutoff excludes a late backfill — IDENTICAL effect on MCP and offline (#1819)", async () => {
    const entityId = `ent_parity_ingested_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    createdEntityIds.push(entityId);
    const sourceId = await insertSource("ingested");
    createdSourceIds.push(sourceId);

    const threeDaysAgo = new Date(Date.now() - 3 * 864e5).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString();
    const oneDayAgo = new Date(Date.now() - 1 * 864e5).toISOString();
    const now = new Date().toISOString();

    // obs_early: genuinely historical. obs_backfill: past event-time but ingested now.
    await insertObservation({
      entityId,
      sourceId,
      observedAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      fields: { title: "Early", status: "pending" },
    });
    await insertObservation({
      entityId,
      sourceId,
      observedAt: twoDaysAgo,
      createdAt: now,
      fields: { title: "Backfill", status: "done" },
    });

    // at_ingested = oneDayAgo: the backfill (created_at = now) must be excluded on
    // BOTH transports → observation_count=1, status="pending".
    const mcp = await snapshotAtCutoff("mcp", mcpServer, offline.base, {
      entityId,
      atIngested: oneDayAgo,
    });
    const off = await snapshotAtCutoff("offline", mcpServer, offline.base, {
      entityId,
      atIngested: oneDayAgo,
    });

    expect(mcp.observationCount).toBe(1);
    expect(mcp.status).toBe("pending");
    assertIdenticalEffect("at_ingested cutoff", mcp, off);
  });

  // -------------------------------------------------------------------------
  // Cell 2 (#1819) — at event-time cutoff: MCP ↔ offline parity.
  // -------------------------------------------------------------------------
  it("at event-time cutoff excludes a future observation — IDENTICAL effect on MCP and offline (#1819)", async () => {
    const entityId = `ent_parity_at_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    createdEntityIds.push(entityId);
    const sourceId = await insertSource("at");
    createdSourceIds.push(sourceId);

    const threeDaysAgo = new Date(Date.now() - 3 * 864e5).toISOString();
    const yesterday = new Date(Date.now() - 1 * 864e5).toISOString();
    const tomorrow = new Date(Date.now() + 1 * 864e5).toISOString();

    await insertObservation({
      entityId,
      sourceId,
      observedAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      fields: { title: "Old", status: "pending" },
    });
    await insertObservation({
      entityId,
      sourceId,
      observedAt: tomorrow,
      createdAt: threeDaysAgo,
      fields: { title: "Future", status: "done" },
    });

    // at = yesterday: the future-observed obs must be excluded on BOTH transports
    // → observation_count=1, status="pending".
    const mcp = await snapshotAtCutoff("mcp", mcpServer, offline.base, { entityId, at: yesterday });
    const off = await snapshotAtCutoff("offline", mcpServer, offline.base, {
      entityId,
      at: yesterday,
    });

    expect(mcp.observationCount).toBe(1);
    expect(mcp.status).toBe("pending");
    assertIdenticalEffect("at event-time cutoff", mcp, off);
  });

  // -------------------------------------------------------------------------
  // Cell 3 (#1840) — dedup: identical re-store keeps observation count at 1 and
  // leaves the reduced snapshot populated on BOTH transports. MCP additionally
  // returns the #1840 response enrichment (deduplicated:true + snapshot_after).
  // -------------------------------------------------------------------------
  it("identical re-store deduplicates — obs count stays 1 + snapshot intact on MCP and offline (#1840)", async () => {
    const baseType = `parity_dedup_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

    // One schema, reused for both transports (distinct canonical_name per surface
    // so the two surfaces target distinct entities — we compare the EFFECT shape,
    // not a shared row).
    await schemaRegistry.register({
      entity_type: baseType,
      schema_version: "1.0",
      schema_definition: {
        fields: { value: { type: "number", required: false }, label: { type: "string", required: true } },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: { value: { strategy: "last_write" }, label: { strategy: "last_write" } },
      },
      user_id: PARITY_USER_ID,
      user_specific: true,
      activate: true,
    });
    createdSchemaTypes.push(baseType);

    // ---- MCP transport ----
    const mcpKey = `parity-dedup-mcp-${randomUUID()}`;
    const mcpEntity = { entity_type: baseType, canonical_name: `mcp-${Date.now()}`, label: "t", value: 42 };
    const mcpStoreArgs = {
      user_id: PARITY_USER_ID,
      idempotency_key: mcpKey,
      entities: [mcpEntity],
      source_priority: 5,
      observation_source: "sensor",
    };
    const mcpOne = await callMcp(mcpServer, "store", mcpStoreArgs);
    const mcpEntryOne = (mcpOne.entities as Array<Record<string, unknown>>)[0]!;
    const mcpEntityId = mcpEntryOne.entity_id as string;
    createdEntityIds.push(mcpEntityId);
    if (mcpOne.source_id) createdSourceIds.push(mcpOne.source_id as string);
    expect(mcpEntryOne.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });

    const mcpTwo = await callMcp(mcpServer, "store", mcpStoreArgs);
    const mcpEntryTwo = (mcpTwo.entities as Array<Record<string, unknown>>)[0]!;
    if (mcpTwo.source_id) createdSourceIds.push(mcpTwo.source_id as string);

    // ---- Offline/HTTP transport ----
    const offKey = `parity-dedup-off-${randomUUID()}`;
    const offEntity = { entity_type: baseType, canonical_name: `off-${Date.now()}`, label: "t", value: 42 };
    const offBody = {
      idempotency_key: offKey,
      commit: true,
      source_priority: 5,
      observation_source: "sensor",
      entities: [offEntity],
    };
    const offOne = await callHttp(offline.base, "/store", offBody);
    expect(offOne.status).toBe(200);
    const offEntryOne = (offOne.json.entities as Array<Record<string, unknown>>)[0]!;
    const offEntityId = offEntryOne.entity_id as string;
    createdEntityIds.push(offEntityId);
    if (offOne.json.source_id) createdSourceIds.push(offOne.json.source_id as string);
    expect(offEntryOne.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });

    const offTwo = await callHttp(offline.base, "/store", offBody);
    expect(offTwo.status).toBe(200);

    // ---- PARITY INVARIANT (the data-integrity effect), identical on both ----
    // 1. The re-store created NO new observation: count stays 1 on each surface.
    const mcpObs = await observationCount(mcpEntityId);
    const offObs = await observationCount(offEntityId);
    expect(mcpObs).toBe(1);
    assertIdenticalEffect("dedup observation count", mcpObs, offObs);

    // 2. The reduced snapshot stays populated (NOT lost) on each surface.
    const mcpSnap = await reduceSnapshot(mcpEntityId);
    const offSnap = await reduceSnapshot(offEntityId);
    expect(mcpSnap).toMatchObject({ value: 42, label: "t" });
    assertIdenticalEffect("dedup reduced snapshot", mcpSnap, offSnap);

    // ---- Response enrichment from the #1840 fix — HARD PARITY (#1860) ----
    // Both transports MUST carry the deduplicated marker AND the populated
    // entity_snapshot_after on the idempotency replay. This was an MCP-only
    // divergence until #1860 (PR #1878) mirrored the #1840 fix into the
    // offline/HTTP path (src/actions.ts); this cell now asserts identical
    // effect on both surfaces rather than documenting the gap.
    const offEntryTwo = (offTwo.json.entities as Array<Record<string, unknown>>)[0]!;
    expect(mcpEntryTwo.deduplicated).toBe(true);
    expect(offEntryTwo.deduplicated).toBe(true);
    assertIdenticalEffect(
      "dedup deduplicated marker",
      mcpEntryTwo.deduplicated,
      offEntryTwo.deduplicated
    );
    expect(mcpEntryTwo.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });
    expect(offEntryTwo.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });
    assertIdenticalEffect(
      "dedup entity_snapshot_after",
      mcpEntryTwo.entity_snapshot_after,
      offEntryTwo.entity_snapshot_after
    );
  });

  // -------------------------------------------------------------------------
  // Cell 4 (#1839) — NULL_CLEARED_FIELD warning: offline path by design.
  // -------------------------------------------------------------------------
  it("NULL_CLEARED_FIELD warning fires on the offline /store path under highest_priority (#1839)", async () => {
    const nullType = `parity_null_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await schemaRegistry.register({
      entity_type: nullType,
      schema_version: "1.0",
      schema_definition: {
        fields: { label: { type: "string", required: false }, value: { type: "number", required: false } },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: { merge_policies: { value: { strategy: "highest_priority" } } },
      user_id: PARITY_USER_ID,
      user_specific: true,
      activate: true,
    });
    createdSchemaTypes.push(nullType);

    const canonical = `parity-null-${Date.now()}`;

    // Good value at source_priority 10 → reduced into the snapshot, no warning.
    const good = await callHttp(offline.base, "/store", {
      idempotency_key: `parity-null-good-${randomUUID()}`,
      commit: true,
      source_priority: 10,
      observation_source: "sensor",
      entities: [{ entity_type: nullType, canonical_name: canonical, label: "t", value: 0.18 }],
    });
    expect(good.status).toBe(200);
    const goodEntities = good.json.entities as Array<Record<string, unknown>>;
    const entityId = goodEntities[0]!.entity_id as string;
    createdEntityIds.push(entityId);
    expect((await reduceSnapshot(entityId)).value).toBe(0.18);
    const goodWarnings = (good.json.store_warnings as Array<{ code: string }> | undefined) ?? [];
    expect(goodWarnings.some((w) => w.code === "NULL_CLEARED_FIELD")).toBe(false);

    // null at a HIGHER priority → wins selection, clears the field, AND warns.
    const cleared = await callHttp(offline.base, "/store", {
      idempotency_key: `parity-null-clear-${randomUUID()}`,
      commit: true,
      source_priority: 20,
      observation_source: "sensor",
      entities: [{ entity_type: nullType, canonical_name: canonical, label: "t", value: null }],
    });
    expect(cleared.status).toBe(200);

    // Semantics unchanged: the field is cleared from the reduced snapshot.
    const reduced = await reduceSnapshot(entityId);
    expect(reduced.value === undefined || reduced.value === null).toBe(true);

    // The warning fires with the correct shape.
    const warnings =
      (cleared.json.store_warnings as Array<{
        code: string;
        message: string;
        entity_type: string;
        entity_id: string;
      }> | undefined) ?? [];
    const warn = warnings.find((w) => w.code === "NULL_CLEARED_FIELD");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(nullType);
    expect(warn!.entity_id).toBe(entityId);
    expect(warn!.message).toContain('"value"');
    expect(warn!.message).toContain("highest_priority");
  });

  // -------------------------------------------------------------------------
  // Cell 5 (#1842) — issue-submit local-loopback auth: offline path by design.
  // Local no-Bearer must be ALLOWED; remote (untrusted X-Forwarded-For) no-Bearer
  // must still be REJECTED with AUTH_REQUIRED.
  // -------------------------------------------------------------------------
  it("issue-submit: local no-bearer allowed, remote no-bearer still rejected (#1842)", async () => {
    // The fallback is scoped to exactly the issue-write routes.
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/issues/submit" })).toBe(true);
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/store" })).toBe(false);

    // Local request, NO Authorization header → must clear the auth gate.
    const local = await callHttp(offline.base, "/issues/submit", {
      title: `parity local issue ${Date.now()}`,
      body: "Created locally with no Bearer token — must not require auth.",
      visibility: "private",
      reporter_git_sha: "0".repeat(40),
      reporter_app_version: "0.0.0-test",
    });
    // The LOCAL auth gate must clear: no 401, and the write is accepted + stored
    // locally (entity_id present). Assert this via structured fields, NOT a raw
    // body string-match: the response can carry a `remote_submission_error` whose
    // text legitimately mentions AUTH_REQUIRED when the remote MIRROR to a hosted
    // Neotoma has no agent_grant (the default in CI). That remote-mirror failure
    // is orthogonal to the local-loopback auth gate this cell verifies — the local
    // submit still succeeds and stores with sync_pending for later retry.
    expect(local.status).not.toBe(401);
    const localJson = local.json as {
      entity_id?: string;
      code?: string;
      error?: string;
    };
    expect(localJson.entity_id).toBeTruthy();
    expect(localJson.code).not.toBe("AUTH_REQUIRED");
    expect(localJson.error ?? "").not.toMatch(/AUTH_REQUIRED/);

    // Remote request (untrusted X-Forwarded-For), NO Bearer → must be rejected.
    const remote = await callHttp(
      offline.base,
      "/issues/submit",
      {
        title: `parity remote issue ${Date.now()}`,
        body: "Remote caller with no Bearer must still get AUTH_REQUIRED.",
        visibility: "private",
      },
      { "X-Forwarded-For": "203.0.113.7" }
    );
    expect(remote.status).toBe(401);
    expect(remote.text).toMatch(/AUTH_REQUIRED/);
  });
});
