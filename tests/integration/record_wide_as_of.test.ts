/**
 * Record-wide as-of reads for relationships and related entities (#2700).
 *
 * `at` / `at_ingested` already cut a single entity snapshot at a write-clock
 * time. These tests prove the same cutoff applies across the record on the
 * relationship reads: an edge, an edge's metadata update, an edge deletion and
 * an entity written after T are all excluded from an "as recorded by T" answer,
 * and the answer is the same through MCP, REST and the CLI.
 *
 * Synthetic data only. Timeline (all write clocks):
 *
 *   OLD  = T - 5 days   the record as first written
 *   T    = the cutoff
 *   NEW  = T + 4 days   later writes
 *
 *   Entities   A, B, D, G  first observed at OLD;  C, F first observed at NEW
 *   A -> B     edge written at OLD, metadata updated at NEW
 *   A -> D     edge written at OLD, deleted at NEW
 *   A -> C     edge written at NEW (C is new as well)
 *   A -> F     edge written at OLD, but F itself first appears at NEW
 *   A -> G     edge observed at OLD but only ingested at NEW (backfill)
 *
 * One rule for both reads: an edge is visible as of T only if the edge and both
 * of its endpoints are. So A -> F is absent from list_relationships AND from
 * retrieve_related_entities at T.
 *
 * A second graph, anchored at P, covers the entity-lifecycle cases (deleted
 * before / after T, merged-away ids, an anchor that appears after T, hop 2, an
 * edge restored after T, inbound edges) and a second user whose rows must stay
 * hidden.
 */

import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { relationshipsService } from "../../src/services/relationships.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { execCliFail, execCliJson, execCliRaw } from "../helpers/cross_layer_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const DAY = 24 * 60 * 60 * 1000;
const cutoffMs = Date.now() - 10 * DAY;
const OLD = new Date(cutoffMs - 5 * DAY).toISOString();
const T = new Date(cutoffMs).toISOString();
const NEW = new Date(cutoffMs + 4 * DAY).toISOString();
const BEFORE_T = new Date(cutoffMs - 2 * DAY).toISOString();
const T_PLUS_1 = new Date(cutoffMs + 1 * DAY).toISOString();
const T_PLUS_2 = new Date(cutoffMs + 2 * DAY).toISOString();
const T_PLUS_3 = new Date(cutoffMs + 3 * DAY).toISOString();
const LATER = new Date(cutoffMs + 5 * DAY).toISOString();

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const id = (name: string) => `ent_asof2700_${name}_${suffix}`;
const A = id("a");
const B = id("b");
const C = id("c");
const D = id("d");
const F = id("f");
const G = id("g");
// Second graph (anchored at P).
const P = id("p"); // anchor
const H = id("h"); // deleted after T
const J = id("j"); // deleted before T
const Q = id("q"); // hop 1
const Q2 = id("q2"); // hop 2, exists as of T
const Q3 = id("q3"); // hop 2, first appears after T
const M = id("m"); // merged-away id, survivor S exists as of T
const S = id("s");
const M2 = id("m2"); // merged-away id, survivor S2 first appears after T
const S2 = id("s2");
const RE = id("re"); // edge deleted at T+1d, restored at T+3d
const X = id("x"); // inbound: X -> P
const W = id("w"); // anchor that first appears after T (W -> B is an old edge)
const Y2 = id("y2"); // owned by another user
const OTHER_USER = `00000000-0000-4000-8000-${suffix.padEnd(12, "0").slice(0, 12)}`;

const key = (type: string, s: string, t: string) => `${type}:${s}:${t}`;
const K_AB = key("REFERS_TO", A, B);
const K_AD = key("REFERS_TO", A, D);
const K_AC = key("REFERS_TO", A, C);
const K_AF = key("REFERS_TO", A, F);
const K_AG = key("REFERS_TO", A, G);
const K_PH = key("REFERS_TO", P, H);
const K_PJ = key("REFERS_TO", P, J);
const K_PQ = key("REFERS_TO", P, Q);
const K_QQ2 = key("REFERS_TO", Q, Q2);
const K_QQ3 = key("REFERS_TO", Q, Q3);
const K_PM = key("REFERS_TO", P, M);
const K_PM2 = key("REFERS_TO", P, M2);
const K_PRE = key("REFERS_TO", P, RE);
const K_XP = key("REFERS_TO", X, P);
const K_WB = key("REFERS_TO", W, B);
const K_AY2 = key("REFERS_TO", A, Y2); // user 1's edge to another user's entity
const K_OTHER = `${K_AB}:other_user`; // another user's edge between user 1's own A and B

const httpPort = 18700 + Math.floor(Math.random() * 200);
const httpBase = `http://127.0.0.1:${httpPort}`;

function callMcp(server: NeotomaServer, name: string, args: unknown): Promise<any> {
  const method = name.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
  return (server as any)[method](args).then((r: any) => JSON.parse(r.content[0].text));
}

async function postRest(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const resp = await fetch(`${httpBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: resp.status, json: await resp.json() };
}

const keysOf = (rels: Array<{ relationship_key: string }>) =>
  rels.map((r) => r.relationship_key).sort();
const idsOf = (ents: Array<{ id: string }>) => ents.map((e) => e.id).sort();

describe("record-wide as-of reads (#2700)", () => {
  const tracker = new TestIdTracker();
  const relationshipKeys = [
    K_AB,
    K_AD,
    K_AC,
    K_AF,
    K_AG,
    K_PH,
    K_PJ,
    K_PQ,
    K_QQ2,
    K_QQ3,
    K_PM,
    K_PM2,
    K_PRE,
    K_XP,
    K_WB,
    K_AY2,
    K_OTHER,
  ];
  let httpServer: ReturnType<typeof createServer>;
  let mcp: NeotomaServer;

  async function makeSource(userId: string): Promise<string> {
    const { data: source, error: sErr } = await db
      .from("sources")
      .insert({
        user_id: userId,
        content_hash: `hash_asof2700_${randomUUID()}`,
        storage_url: "file:///test/record_wide_as_of.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();
    if (sErr || !source) throw new Error(`source insert failed: ${sErr?.message}`);
    tracker.trackSource(source.id);
    return source.id as string;
  }

  async function insertEntityObservation(
    entityId: string,
    fields: Record<string, unknown>,
    at: string,
    userId = USER_ID
  ) {
    const { error: oErr } = await db.from("observations").insert({
      entity_id: entityId,
      entity_type: "task",
      schema_version: "1.0",
      source_id: await makeSource(userId),
      user_id: userId,
      observed_at: at,
      created_at: at,
      fields,
    });
    if (oErr) throw new Error(`observation insert failed: ${oErr.message}`);
  }

  async function insertEntity(
    entityId: string,
    name: string,
    firstSeen: string,
    extra: { userId?: string; mergedTo?: string; observe?: boolean } = {}
  ) {
    const userId = extra.userId ?? USER_ID;
    const { error: eErr } = await db.from("entities").insert({
      id: entityId,
      entity_type: "task",
      canonical_name: name,
      user_id: userId,
      created_at: firstSeen,
      ...(extra.mergedTo ? { merged_to_entity_id: extra.mergedTo } : {}),
    });
    if (eErr) throw new Error(`entity insert failed: ${eErr.message}`);
    tracker.trackEntity(entityId);
    if (extra.observe === false) return;
    await insertEntityObservation(entityId, { title: name, status: "open" }, firstSeen, userId);
  }

  async function insertEdgeObservation(opts: {
    relationshipKey: string;
    source: string;
    target: string;
    observedAt: string;
    createdAt: string;
    metadata: Record<string, unknown>;
    userId?: string;
  }) {
    const { error } = await db.from("relationship_observations").insert({
      id: randomUUID(),
      relationship_key: opts.relationshipKey,
      relationship_type: "REFERS_TO",
      source_entity_id: opts.source,
      target_entity_id: opts.target,
      source_priority: 1,
      metadata: opts.metadata,
      canonical_hash: createHash("sha256").update(randomUUID()).digest("hex"),
      user_id: opts.userId ?? USER_ID,
      observed_at: opts.observedAt,
      created_at: opts.createdAt,
      provenance: {},
    });
    if (error) throw new Error(`relationship observation insert failed: ${error.message}`);
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(httpPort, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    mcp = new NeotomaServer();
    (mcp as any).authenticatedUserId = USER_ID;

    await insertEntity(A, "Record A", OLD);
    await insertEntity(B, "Record B", OLD);
    await insertEntity(D, "Record D", OLD);
    await insertEntity(G, "Record G", OLD);
    await insertEntity(C, "Record C", NEW);
    await insertEntity(F, "Record F", NEW);

    // A -> B: written at OLD, metadata replaced at NEW.
    await insertEdgeObservation({
      relationshipKey: K_AB,
      source: A,
      target: B,
      observedAt: OLD,
      createdAt: OLD,
      metadata: { note: "first" },
    });
    await insertEdgeObservation({
      relationshipKey: K_AB,
      source: A,
      target: B,
      observedAt: NEW,
      createdAt: NEW,
      metadata: { note: "second" },
    });
    // A -> D: written at OLD, deleted at NEW.
    await insertEdgeObservation({
      relationshipKey: K_AD,
      source: A,
      target: D,
      observedAt: OLD,
      createdAt: OLD,
      metadata: {},
    });
    await insertEdgeObservation({
      relationshipKey: K_AD,
      source: A,
      target: D,
      observedAt: NEW,
      createdAt: NEW,
      metadata: { _deleted: true },
    });
    // A -> C: written entirely after T.
    await insertEdgeObservation({
      relationshipKey: K_AC,
      source: A,
      target: C,
      observedAt: NEW,
      createdAt: NEW,
      metadata: {},
    });
    // A -> F: edge predates T, endpoint F does not.
    await insertEdgeObservation({
      relationshipKey: K_AF,
      source: A,
      target: F,
      observedAt: OLD,
      createdAt: OLD,
      metadata: {},
    });
    // A -> G: observed at OLD, ingested at NEW (backfill).
    await insertEdgeObservation({
      relationshipKey: K_AG,
      source: A,
      target: G,
      observedAt: OLD,
      createdAt: NEW,
      metadata: {},
    });

    // ---- Second graph, anchored at P --------------------------------------
    await insertEntity(P, "Record P", OLD);
    await insertEntity(H, "Record H", OLD);
    await insertEntityObservation(H, { _deleted: true }, NEW); // deleted after T
    await insertEntity(J, "Record J", OLD);
    await insertEntityObservation(J, { _deleted: true }, BEFORE_T); // deleted before T
    await insertEntity(Q, "Record Q", OLD);
    await insertEntity(Q2, "Record Q2", OLD);
    await insertEntity(Q3, "Record Q3", NEW);
    await insertEntity(S, "Record S", OLD);
    await insertEntity(M, "Record M", OLD, { mergedTo: S, observe: false });
    await insertEntity(S2, "Record S2", NEW);
    await insertEntity(M2, "Record M2", OLD, { mergedTo: S2, observe: false });
    await insertEntity(RE, "Record RE", OLD);
    await insertEntity(X, "Record X", OLD);
    await insertEntity(W, "Record W", NEW); // anchor first appears after T
    // Another user's entity and edge. Neither may ever show up for USER_ID.
    await insertEntity(Y2, "Other user's record", OLD, { userId: OTHER_USER });

    const old = (k: string, s: string, t: string) =>
      insertEdgeObservation({
        relationshipKey: k,
        source: s,
        target: t,
        observedAt: OLD,
        createdAt: OLD,
        metadata: {},
      });
    for (const [k, s2, t] of [
      [K_PH, P, H],
      [K_PJ, P, J],
      [K_PQ, P, Q],
      [K_QQ2, Q, Q2],
      [K_QQ3, Q, Q3],
      [K_PM, P, M],
      [K_PM2, P, M2],
      [K_PRE, P, RE],
      [K_XP, X, P],
      [K_WB, W, B],
      [K_AY2, A, Y2], // user 1's edge to an entity user 1 does not own
    ] as const) {
      await old(k, s2, t);
    }
    // P -> RE: deleted at T+1d, restored at T+3d.
    await insertEdgeObservation({
      relationshipKey: K_PRE,
      source: P,
      target: RE,
      observedAt: T_PLUS_1,
      createdAt: T_PLUS_1,
      metadata: { _deleted: true },
    });
    await insertEdgeObservation({
      relationshipKey: K_PRE,
      source: P,
      target: RE,
      observedAt: T_PLUS_3,
      createdAt: T_PLUS_3,
      metadata: {},
    });
    // Another user's edge between the same two entities. Both endpoints exist for
    // user 1, so only the owner scoping of the edge read keeps it out.
    await insertEdgeObservation({
      relationshipKey: K_OTHER,
      source: A,
      target: B,
      observedAt: OLD,
      createdAt: OLD,
      metadata: {},
      userId: OTHER_USER,
    });

    // Materialize the current ("now") snapshot rows, as a real write would.
    for (const [type, s, t] of [
      ["REFERS_TO", A, B],
      ["REFERS_TO", A, D],
      ["REFERS_TO", A, C],
      ["REFERS_TO", A, F],
      ["REFERS_TO", A, G],
    ] as const) {
      await relationshipsService.computeRelationshipSnapshot(type, s, t, USER_ID);
    }
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", relationshipKeys);
    await db.from("relationship_observations").delete().in("relationship_key", relationshipKeys);
    await tracker.cleanup();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // ---------------------------------------------------------------- baseline

  it("baseline: without a cutoff the read reflects the current record", async () => {
    const live = await callMcp(mcp, "list_relationships", { source_entity_id: A });
    // A -> D is deleted now, so it is not listed.
    // A -> Y2 is live too: the current read does not look at endpoint ownership.
    expect(keysOf(live.relationships)).toEqual([K_AB, K_AC, K_AF, K_AG, K_AY2].sort());
    expect(live.as_of).toBeUndefined();
  });

  // --------------------------------------------------------------------- MCP

  it("MCP list_relationships at_ingested: later writes are excluded across the edge set", async () => {
    const res = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      at_ingested: T,
    });
    // A -> C (new), A -> G (backfilled after T) are absent; A -> D is still live as
    // of T. A -> F is absent too: the edge is old but F did not exist as of T.
    expect(keysOf(res.relationships)).toEqual([K_AB, K_AD].sort());
    expect(res.total).toBe(2);
    expect(res.as_of).toEqual({ at: null, at_ingested: T });
    const ab = res.relationships.find((r: any) => r.relationship_key === K_AB);
    expect(ab.snapshot.note).toBe("first"); // the later metadata write is not visible
    expect(ab.is_live).toBe(1);
  });

  it("MCP list_relationships: `at` and `at_ingested` are different clocks", async () => {
    const byAt = await callMcp(mcp, "list_relationships", { source_entity_id: A, at: T });
    // A -> G was observed at OLD, so `at` includes it even though it arrived later.
    // A -> F stays out: F was first observed after T.
    expect(keysOf(byAt.relationships)).toEqual([K_AB, K_AD, K_AG].sort());

    const both = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      at: T,
      at_ingested: T,
    });
    expect(keysOf(both.relationships)).toEqual([K_AB, K_AD].sort());
  });

  it("MCP list_relationships: a cutoff before anything was written answers empty", async () => {
    const res = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      at_ingested: new Date(cutoffMs - 30 * DAY).toISOString(),
    });
    expect(res.relationships).toEqual([]);
    expect(res.total).toBe(0);
  });

  it("MCP list_relationships: entity_id anchor tags direction as of T", async () => {
    const res = await callMcp(mcp, "list_relationships", { entity_id: B, at_ingested: T });
    expect(keysOf(res.relationships)).toEqual([K_AB]);
    expect(res.relationships[0].direction).toBe("inbound");
  });

  it("MCP retrieve_related_entities: an entity and edge written after T are excluded", async () => {
    const res = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at_ingested: T,
    });
    // C: edge and entity are new. F: edge predates T but the entity does not exist
    // as of T. G: edge was ingested after T.
    expect(idsOf(res.entities)).toEqual([B, D].sort());
    expect(keysOf(res.relationships)).toEqual([K_AB, K_AD].sort());
    expect(res.as_of).toEqual({ at: null, at_ingested: T });
    const b = res.entities.find((e: any) => e.id === B);
    expect(b.snapshot.snapshot.title).toBe("Record B");
    expect(b.snapshot.observation_count).toBe(1);

    const now = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
    });
    expect(idsOf(now.entities)).toEqual(expect.arrayContaining([B, C, F, G]));
    expect(now.as_of).toBeUndefined();
  });

  it("MCP rejects an invalid cutoff timestamp", async () => {
    await expect(
      callMcp(mcp, "list_relationships", { source_entity_id: A, at_ingested: "not-a-date" })
    ).rejects.toThrow(/at_ingested/);
  });

  // -------------------------------------------------------------------- REST

  it("REST /list_relationships matches MCP under the same cutoff", async () => {
    const { status, json } = await postRest("/list_relationships", {
      source_entity_id: A,
      at_ingested: T,
    });
    expect(status).toBe(200);
    expect(keysOf(json.relationships)).toEqual([K_AB, K_AD].sort());
    expect(json.total_count).toBe(2);
    expect(json.as_of).toEqual({ at: null, at_ingested: T });
    expect(json.relationships.find((r: any) => r.relationship_key === K_AB).snapshot.note).toBe(
      "first"
    );

    const paged = await postRest("/list_relationships", {
      source_entity_id: A,
      at_ingested: T,
      limit: 1,
      offset: 1,
    });
    expect(paged.json.relationships).toHaveLength(1);
    expect(paged.json.total).toBe(2);
  });

  it("REST /retrieve_related_entities matches MCP under the same cutoff", async () => {
    const { status, json } = await postRest("/retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at_ingested: T,
    });
    expect(status).toBe(200);
    expect(idsOf(json.entities)).toEqual([B, D].sort());
    expect(keysOf(json.relationships)).toEqual([K_AB, K_AD].sort());
    expect(json.as_of).toEqual({ at: null, at_ingested: T });
  });

  it("REST rejects an invalid cutoff timestamp with a validation error", async () => {
    const { status } = await postRest("/list_relationships", {
      source_entity_id: A,
      at: "yesterday-ish",
    });
    expect(status).toBe(400);
  });

  // --------------------------------------------------------------------- CLI

  it("CLI relationships list --at-ingested matches REST", async () => {
    const out = await execCliJson(
      `relationships list --source-entity-id "${A}" --at-ingested "${T}"`
    );
    expect(keysOf(out.relationships as any[])).toEqual([K_AB, K_AD].sort());
    expect(out.as_of).toEqual({ at: null, at_ingested: T });
  });

  it("CLI entities related --at-ingested matches REST", async () => {
    const out = await execCliJson(
      `entities related "${A}" --direction outbound --at-ingested "${T}"`
    );
    expect(idsOf(out.entities as any[])).toEqual([B, D].sort());
    expect(keysOf(out.relationships as any[])).toEqual([K_AB, K_AD].sort());
  });

  // ------------------------------------------------- one rule for both reads

  it("list_relationships and retrieve_related_entities agree on the edge set at a cutoff", async () => {
    // The cutoff separates an old edge (A -> F) from its new endpoint F.
    const list = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      at_ingested: T,
    });
    const related = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at_ingested: T,
    });
    expect(keysOf(list.relationships)).toEqual(keysOf(related.relationships));
    expect(keysOf(list.relationships)).not.toContain(K_AF);
    // Same on the observed clock.
    const listAt = await callMcp(mcp, "list_relationships", { source_entity_id: A, at: T });
    const relatedAt = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at: T,
    });
    expect(keysOf(listAt.relationships)).toEqual(keysOf(relatedAt.relationships));
    expect(keysOf(listAt.relationships)).not.toContain(K_AF);
  });

  // ----------------------------------------------- `at` on the related read

  it("retrieve_related_entities `at` (observed clock) keeps a backfilled edge, drops a later entity", async () => {
    const res = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at: T,
    });
    // G: edge observed at OLD (ingested later) is visible on the observed clock.
    // F: first observed after T, so absent. C: new edge and entity.
    expect(idsOf(res.entities)).toEqual([B, D, G].sort());
    expect(keysOf(res.relationships)).toEqual([K_AB, K_AD, K_AG].sort());
    expect(res.as_of).toEqual({ at: T, at_ingested: null });

    const rest = await postRest("/retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at: T,
    });
    expect(idsOf(rest.json.entities)).toEqual([B, D, G].sort());
    expect(rest.json.as_of).toEqual({ at: T, at_ingested: null });

    const cli = await execCliJson(`entities related "${A}" --direction outbound --at "${T}"`);
    expect(idsOf(cli.entities as any[])).toEqual([B, D, G].sort());
  });

  // ------------------------------------------------------------------ hops

  it("max_hops above 1 stops at an endpoint that does not exist as of T", async () => {
    const hop1 = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: P,
      direction: "outbound",
      at_ingested: T,
      max_hops: 1,
    });
    expect(idsOf(hop1.entities)).toEqual([H, M, Q, RE].sort());

    const hop2 = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: P,
      direction: "outbound",
      at_ingested: T,
      max_hops: 2,
    });
    // Q2 exists as of T and is reached at hop 2; Q3 is a hop-2 endpoint that first
    // appears after T, so neither it nor the Q -> Q3 edge is returned.
    expect(idsOf(hop2.entities)).toEqual([H, M, Q, Q2, RE].sort());
    expect(keysOf(hop2.relationships)).toContain(K_QQ2);
    expect(keysOf(hop2.relationships)).not.toContain(K_QQ3);
    expect(hop2.hops_traversed).toBe(2);
  });

  // ------------------------------------------------------ entity lifecycle

  it("an entity deleted after T is present as of T; deleted at or before T it is absent", async () => {
    const atT = await callMcp(mcp, "list_relationships", {
      source_entity_id: P,
      at_ingested: T,
    });
    expect(keysOf(atT.relationships)).toContain(K_PH); // H deleted at T+4d
    expect(keysOf(atT.relationships)).not.toContain(K_PJ); // J deleted at T-2d

    // After H's deletion the same edge is gone: the endpoint no longer exists.
    const later = await callMcp(mcp, "list_relationships", {
      source_entity_id: P,
      at_ingested: LATER,
    });
    expect(keysOf(later.relationships)).not.toContain(K_PH);
    expect(keysOf(later.relationships)).not.toContain(K_PJ);
  });

  it("a merged-away id answers with the surviving entity's history", async () => {
    const atT = await callMcp(mcp, "list_relationships", {
      source_entity_id: P,
      at_ingested: T,
    });
    // M's survivor S exists as of T; M2's survivor S2 first appears after T.
    expect(keysOf(atT.relationships)).toContain(K_PM);
    expect(keysOf(atT.relationships)).not.toContain(K_PM2);

    const later = await callMcp(mcp, "list_relationships", {
      source_entity_id: P,
      at_ingested: LATER,
    });
    expect(keysOf(later.relationships)).toContain(K_PM2);
  });

  it("an anchor entity that first appears after T has no edges as of T", async () => {
    // W -> B is an old edge, but W itself was first written after T.
    const list = await callMcp(mcp, "list_relationships", {
      source_entity_id: W,
      at_ingested: T,
    });
    expect(list.relationships).toEqual([]);
    const related = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: W,
      direction: "outbound",
      at_ingested: T,
    });
    expect(related.entities).toEqual([]);
    expect(related.relationships).toEqual([]);
    // Once W exists, the edge is there.
    const later = await callMcp(mcp, "list_relationships", {
      source_entity_id: W,
      at_ingested: LATER,
    });
    expect(keysOf(later.relationships)).toEqual([K_WB]);
  });

  // -------------------------------------------- include_deleted and restores

  it("include_deleted with a cutoff lists edges that are deleted as of T, not edges to absent entities", async () => {
    // A -> D is deleted at T+4d. As of T+5d it is deleted; as of T it is live.
    const hidden = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      target_entity_id: D,
      at_ingested: LATER,
    });
    expect(hidden.relationships).toEqual([]);

    const shown = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      target_entity_id: D,
      at_ingested: LATER,
      include_deleted: true,
    });
    expect(keysOf(shown.relationships)).toEqual([K_AD]);
    expect(shown.relationships[0].is_live).toBe(0);

    const live = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      target_entity_id: D,
      at_ingested: T,
      include_deleted: true,
    });
    expect(live.relationships[0].is_live).toBe(1);

    // include_deleted never admits an edge whose endpoint does not exist as of T.
    const absent = await callMcp(mcp, "list_relationships", {
      source_entity_id: P,
      target_entity_id: J,
      at_ingested: T,
      include_deleted: true,
    });
    expect(absent.relationships).toEqual([]);
  });

  it("an edge restored after T is still deleted as of a cutoff between the delete and the restore", async () => {
    const readAt = (at: string, includeDeleted = false) =>
      callMcp(mcp, "list_relationships", {
        source_entity_id: P,
        target_entity_id: RE,
        at_ingested: at,
        ...(includeDeleted ? { include_deleted: true } : {}),
      });
    expect(keysOf((await readAt(T)).relationships)).toEqual([K_PRE]); // before the delete
    expect((await readAt(T_PLUS_2)).relationships).toEqual([]); // deleted, not yet restored
    const audit = await readAt(T_PLUS_2, true);
    expect(audit.relationships[0].is_live).toBe(0);
    expect(keysOf((await readAt(LATER)).relationships)).toEqual([K_PRE]); // restored
    // The traversal follows the same liveness.
    const related = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: P,
      direction: "outbound",
      at_ingested: T_PLUS_2,
    });
    expect(idsOf(related.entities)).not.toContain(RE);
  });

  it("as-of related reads exclude soft-deleted edges; the live related read does not", async () => {
    // Pins today's difference so it is visible when the live read changes. A -> D
    // is soft-deleted at T+4d: as of T+5d it is deleted, and the as-of read drops it.
    const asOf = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at_ingested: LATER,
    });
    expect(keysOf(asOf.relationships)).not.toContain(K_AD);
    expect(idsOf(asOf.entities)).not.toContain(D);

    const live = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
    });
    expect(keysOf(live.relationships)).toContain(K_AD);
    expect(idsOf(live.entities)).toContain(D);
    // list_relationships excludes it on both paths.
    const liveList = await callMcp(mcp, "list_relationships", { source_entity_id: A });
    expect(keysOf(liveList.relationships)).not.toContain(K_AD);
  });

  // ------------------------------------------------------------- direction

  it("direction `both` returns outbound and inbound edges as of T", async () => {
    const res = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: P,
      direction: "both",
      at_ingested: T,
    });
    expect(idsOf(res.entities)).toEqual([H, M, Q, RE, X].sort());
    expect(keysOf(res.relationships)).toContain(K_XP);

    const inbound = await callMcp(mcp, "list_relationships", {
      entity_id: P,
      direction: "inbound",
      at_ingested: T,
    });
    expect(keysOf(inbound.relationships)).toEqual([K_XP]);
    expect(inbound.relationships[0].direction).toBe("inbound");
  });

  // ------------------------------------------------------------ pagination

  it("MCP pagination under a cutoff pages the as-of set", async () => {
    // As of T, P has four outbound edges: H, Q, M, RE.
    const first = await callMcp(mcp, "list_relationships", {
      source_entity_id: P,
      at_ingested: T,
      limit: 3,
      offset: 0,
    });
    const second = await callMcp(mcp, "list_relationships", {
      source_entity_id: P,
      at_ingested: T,
      limit: 3,
      offset: 3,
    });
    expect(first.total).toBe(4);
    expect(second.total).toBe(4);
    expect(first.relationships).toHaveLength(3);
    expect(second.relationships).toHaveLength(1);
    expect(keysOf([...first.relationships, ...second.relationships])).toEqual(
      [K_PH, K_PQ, K_PM, K_PRE].sort()
    );
    expect(first.limit).toBe(3);
    expect(second.offset).toBe(3);
  });

  // ------------------------------------------------------------ second user

  it("another user's entities and edges stay hidden under a cutoff", async () => {
    // A -> Y2 points at an entity user 1 does not own; the other user also holds
    // an edge between A and B. Neither appears in user 1's as-of reads.
    for (const read of [
      callMcp(mcp, "list_relationships", { source_entity_id: A, at: LATER }),
      callMcp(mcp, "list_relationships", { entity_id: A, direction: "outbound", at: LATER }),
      callMcp(mcp, "list_relationships", { target_entity_id: Y2, at: LATER }),
    ]) {
      const res = await read;
      const keys = keysOf(res.relationships);
      expect(keys).not.toContain(K_AY2);
      expect(keys).not.toContain(K_OTHER);
    }
    const related = await callMcp(mcp, "retrieve_related_entities", {
      entity_id: A,
      direction: "outbound",
      at: LATER,
    });
    expect(idsOf(related.entities)).not.toContain(Y2);
    expect(keysOf(related.relationships)).not.toContain(K_AY2);
    expect(keysOf(related.relationships)).not.toContain(K_OTHER);

    // The other user's own entity does not exist for user 1 at any cutoff.
    const rest = await postRest("/list_relationships", { target_entity_id: Y2, at: LATER });
    expect(rest.json.relationships).toEqual([]);
  });

  // ------------------------------------------------------- CLI flag handling

  it("CLI as-of list without a source, target or type filter says which flags it needs", async () => {
    const { code, stderr } = await execCliFail(`relationships list --at "${T}"`);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/--source-entity-id/);
    expect(stderr).toMatch(/--relationship-type/);
  });

  it("CLI invalid timestamp surfaces the server's reason naming the flag and format", async () => {
    const list = await execCliFail(
      `relationships list --relationship-type REFERS_TO --at "notadate"`
    );
    expect(list.stderr).toMatch(/'at'/);
    expect(list.stderr).toMatch(/ISO 8601/);
    expect(list.stderr).not.toMatch(/Failed to list relationships/);

    const related = await execCliFail(`entities related "${A}" --at-ingested "notadate"`);
    expect(related.stderr).toMatch(/'at_ingested'/);
    expect(related.stderr).toMatch(/ISO 8601/);
    expect(related.stderr).not.toMatch(/Failed to get related entities/);
  });

  it("CLI empty cutoff is an error, never a silent current read", async () => {
    const list = await execCliFail(`relationships list --source-entity-id "${A}" --at ""`);
    expect(list.stderr).toMatch(/--at/);
    expect(list.stderr).toMatch(/ISO 8601/);
    const related = await execCliFail(`entities related "${A}" --at-ingested ""`);
    expect(related.stderr).toMatch(/--at-ingested/);
  });

  it("CLI help states the filter requirement, write-time meaning and what --at-ingested adds", async () => {
    const help = await execCliRaw(`relationships list --help`);
    expect(help).toMatch(/--source-entity-id/);
    expect(help).toMatch(/Requires/);
    expect(help).toMatch(/write-time/);
    expect(help).toMatch(/backfills/);
  });
});
