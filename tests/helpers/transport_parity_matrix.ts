/**
 * Shared transport-parity matrix: drive the SAME behavioral assertion through
 * BOTH the MCP tool-dispatch surface and the offline/local HTTP (Express) surface,
 * and assert an IDENTICAL effect on each.
 *
 * Motivation. An external evaluator's regressions clustered in the offline/HTTP
 * transport — the path the suite historically exercised less than MCP:
 *   - #1819  at/at_ingested snapshot cutoffs were applied only on the MCP path;
 *            the offline/HTTP `POST /get_entity_snapshot` silently ignored them.
 *   - #1840  the dedup (idempotency-replay) store response lost its populated
 *            `entity_snapshot_after` / `deduplicated` marker.
 *   - #1842  issue-submit's local-loopback auth fallback was an HTTP-surface gap.
 *
 * This helper mirrors the structure of tests/helpers/store_reference_parity.ts
 * (a surface × shape matrix), but instead of one feature across surfaces it
 * encodes a CURATED set of behaviors that actually broke, each driven through
 * both transports where the behavior is defined on both. Each cell asserts the
 * EFFECT (observation count, reduced snapshot, warning emission, auth outcome),
 * not merely that the input was accepted — per task_policy
 * fixed_means_behavior_verified_not_contract_accepted (ent_db0b7855d47012084477fb00)
 * and cross_surface_contract_parity_tested_all_surfaces (ent_2ad0677fe23c0c1878ae43e8).
 *
 * Transports:
 *   - "mcp"     → NeotomaServer dispatch (the same path `/mcp` tools/call routes
 *                 a tool into). No real auth token is needed; the test injects the
 *                 authenticated user id.
 *   - "offline" → the offline/local path IS the HTTP/Express path: a real
 *                 `createServer(app)` over loopback, called with `POST /...`.
 *                 Loopback with no Bearer resolves to LOCAL_DEV_USER_ID, exactly
 *                 the offline-developer path the evaluator's bugs lived in.
 *
 * Where a behavior is genuinely single-transport by design (see NOTE comments in
 * the scenario table), the cell documents WHY rather than forcing a parity claim
 * the architecture does not make — forcing it would either be vacuous or red on a
 * green main.
 */

import { createServer } from "node:http";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { observationReducer } from "../../src/reducers/observation_reducer.js";

export type Transport = "mcp" | "offline";

/** Both transports resolve to the same local user, so a row written through one
 *  is visible to the other — the precondition for a meaningful parity claim. */
export const PARITY_USER_ID = LOCAL_DEV_USER_ID;

// ---------------------------------------------------------------------------
// Boot helpers
// ---------------------------------------------------------------------------

/** An MCP dispatch surface whose authenticated user is the shared local user. */
export function makeMcpServer(): NeotomaServer {
  const server = new NeotomaServer();
  (server as unknown as { authenticatedUserId: string }).authenticatedUserId = PARITY_USER_ID;
  return server;
}

/** A real Express server bound on an ephemeral loopback port (offline path). */
export async function startOfflineServer(): Promise<{ server: Server; base: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("offline test server did not bind to a TCP port");
  }
  return { server, base: `http://127.0.0.1:${address.port}` };
}

export async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// Low-level drivers — one per (action × transport)
// ---------------------------------------------------------------------------

/** MCP dispatch for snake_cased action methods on NeotomaServer (callMcp). */
export async function callMcp(
  server: NeotomaServer,
  actionName: string,
  params: unknown
): Promise<Record<string, unknown>> {
  const methodName = actionName.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const result = (await (
    server as unknown as Record<
      string,
      (p: unknown) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>
    >
  )[methodName](params)) as { content: Array<{ type: string; text: string }> };
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

/** Offline/HTTP POST against the Express app (callHttp). */
export async function callHttp(
  base: string,
  routePath: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const resp = await fetch(`${base}${routePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* non-JSON body (e.g. plain error) — leave json empty, keep text */
  }
  return { status: resp.status, json, text };
}

// ---------------------------------------------------------------------------
// Effect inspectors (the EFFECT, read straight from the store)
// ---------------------------------------------------------------------------

/** Count observations for an entity under the shared user. */
export async function observationCount(entityId: string): Promise<number> {
  const { count } = await db
    .from("observations")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .eq("user_id", PARITY_USER_ID);
  return count ?? 0;
}

/**
 * Recompute an entity's snapshot directly from its persisted observations via
 * the reducer. Embedding-free, so the assertion does not depend on a valid
 * OPENAI_API_KEY (the materialized `entity_snapshots` row is gated on a
 * successful embedding upsert, unavailable in key-less CI). Same approach the
 * #1839 suite uses.
 */
export async function reduceSnapshot(entityId: string): Promise<Record<string, unknown>> {
  const { data: obs } = await db
    .from("observations")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", PARITY_USER_ID)
    .order("observed_at", { ascending: false });
  const mapped = (obs ?? []).map((o: Record<string, unknown>) => ({
    id: o.id,
    entity_id: o.entity_id,
    entity_type: o.entity_type,
    schema_version: o.schema_version,
    source_id: o.source_id || "",
    observed_at: o.observed_at,
    specificity_score: o.specificity_score,
    source_priority: o.source_priority,
    observation_source: o.observation_source ?? undefined,
    fields: o.fields,
    created_at: o.created_at,
    user_id: o.user_id,
  }));
  const snap = await observationReducer.computeSnapshot(entityId, mapped as never);
  return (snap?.snapshot as Record<string, unknown> | undefined) ?? {};
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

export async function insertSource(tag: string): Promise<string> {
  const { data: source, error } = await db
    .from("sources")
    .insert({
      user_id: PARITY_USER_ID,
      content_hash: `hash_parity_${tag}_${randomUUID()}`,
      storage_url: `file:///test/transport_parity_${tag}.txt`,
      mime_type: "text/plain",
      file_size: 0,
    })
    .select()
    .single();
  if (error || !source) throw new Error(`insertSource failed: ${error?.message}`);
  return source.id as string;
}

export async function insertObservation(opts: {
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
    user_id: PARITY_USER_ID,
    observed_at: opts.observedAt,
    created_at: opts.createdAt,
    fields: opts.fields,
  });
  if (error) throw new Error(`insertObservation failed: ${error.message}`);
}

/** Resolve the snapshot for an entity at a cutoff through one transport. */
export async function snapshotAtCutoff(
  transport: Transport,
  mcpServer: NeotomaServer,
  offlineBase: string,
  args: { entityId: string; at?: string; atIngested?: string }
): Promise<{ observationCount: number; status: unknown }> {
  if (transport === "mcp") {
    const data = await callMcp(mcpServer, "retrieve_entity_snapshot", {
      entity_id: args.entityId,
      ...(args.at ? { at: args.at } : {}),
      ...(args.atIngested ? { at_ingested: args.atIngested } : {}),
      format: "json",
    });
    const snapshot = (data.snapshot as Record<string, unknown> | undefined) ?? {};
    return { observationCount: data.observation_count as number, status: snapshot.status };
  }
  const { json } = await callHttp(offlineBase, "/get_entity_snapshot", {
    entity_id: args.entityId,
    ...(args.at ? { at: args.at } : {}),
    ...(args.atIngested ? { at_ingested: args.atIngested } : {}),
  });
  const snapshot = (json.snapshot as Record<string, unknown> | undefined) ?? {};
  return { observationCount: json.observation_count as number, status: snapshot.status };
}

// ---------------------------------------------------------------------------
// assertIdenticalEffect
// ---------------------------------------------------------------------------

/**
 * Assert that a behavior produced the byte-for-byte same effect on both
 * transports. Used by the cross-transport cells: run the same setup against
 * each transport and assert the inspected effect is equal (not just "each works
 * in isolation").
 */
export function assertIdenticalEffect<T>(label: string, mcp: T, offline: T): void {
  expect(
    offline,
    `${label}: offline/HTTP effect must equal the MCP effect (transport parity)`
  ).toEqual(mcp);
}

// ---------------------------------------------------------------------------
// Scenario table
// ---------------------------------------------------------------------------

/**
 * A scenario is one curated behavior. `transports` lists the surfaces the
 * behavior is defined on. For dual-transport behaviors the test loops both and
 * calls assertIdenticalEffect; single-transport behaviors document WHY (`note`)
 * and assert the effect on their one surface — the architecture does not expose
 * the behavior on the other transport, so a parity claim there would be vacuous.
 */
export interface TransportParityScenario {
  id: string;
  issue: string;
  label: string;
  transports: Transport[];
  note?: string;
}

export const TRANSPORT_PARITY_MATRIX: TransportParityScenario[] = [
  {
    id: "snapshot_at_ingested_cutoff",
    issue: "#1819",
    label: "at_ingested ingestion-time cutoff excludes a late-arriving backfill",
    transports: ["mcp", "offline"],
  },
  {
    id: "snapshot_at_event_time_cutoff",
    issue: "#1819",
    label: "at event-time cutoff excludes a future-observed observation",
    transports: ["mcp", "offline"],
  },
  {
    id: "store_dedup_observation_count",
    issue: "#1840",
    label:
      "identical re-store deduplicates (observation count stays 1; reduced snapshot stays populated)",
    transports: ["mcp", "offline"],
    note:
      "Parity invariant asserted on BOTH transports: an identical re-store creates no new " +
      "observation (count stays 1) and the reduced snapshot stays populated. The RESPONSE-ENVELOPE " +
      "enrichment from the #1840 fix (deduplicated:true + populated entity_snapshot_after on the " +
      "replayed entry) is now asserted on BOTH surfaces as a HARD parity assertion — the offline/HTTP " +
      "idempotency-replay path was fixed in #1860 (PR #1878) to mirror the MCP path, so the previously " +
      "MCP-only envelope detail is no longer a documented divergence.",
  },
  {
    id: "null_cleared_field_warning",
    issue: "#1839",
    label: "NULL_CLEARED_FIELD warning fires when a null wins under highest_priority",
    transports: ["offline"],
    note:
      "Single-transport BY DESIGN. The offline/HTTP /store path persists a typed-field null as an " +
      "observation, so the reducer can detect a null clearing a prior non-null and emit the warning. " +
      "The MCP store path strips a typed-field null to raw_fragments (documented in " +
      "store_null_cleared_field_warning.test.ts), so there is no observation-level null to warn on. " +
      "Asserting the warning on MCP would be vacuous, so this cell exercises the offline path only.",
  },
  {
    id: "issue_submit_local_auth_fallback",
    issue: "#1842",
    label:
      "issue-submit: local no-bearer allowed, remote no-bearer opens an issue but cannot append",
    transports: ["offline"],
    note:
      "Single-transport BY DESIGN. The local-loopback auth fallback is an HTTP transport-layer " +
      "concern (Express middleware decides whether a no-Bearer request resolves to the local user " +
      "based on request locality). The MCP submit_issue handler receives an ALREADY-resolved userId " +
      "and performs no such gating, so the remote-vs-local distinction does not exist on the MCP " +
      "surface. This cell asserts both sides of the gate on the offline path. " +
      "AMENDED by #1953: 'remote no-bearer still rejected' no longer holds for POST /issues/submit " +
      "itself — a third party's agent must be able to OPEN an issue with no prior identity, since " +
      "the guest access token is minted BY the submit rather than required for it. The boundary is " +
      "now drawn at add_message: an unidentified caller may open a thread but not write into an " +
      "existing one (by then they hold the token their submit returned). Gated by the `issue` " +
      "access policy — NEOTOMA_ACCESS_POLICY_ISSUE=closed restores the pre-#1953 posture.",
  },
];
