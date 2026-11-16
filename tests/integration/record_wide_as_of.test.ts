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
import { execCliJson } from "../helpers/cross_layer_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const DAY = 24 * 60 * 60 * 1000;
const cutoffMs = Date.now() - 10 * DAY;
const OLD = new Date(cutoffMs - 5 * DAY).toISOString();
const T = new Date(cutoffMs).toISOString();
const NEW = new Date(cutoffMs + 4 * DAY).toISOString();

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const id = (name: string) => `ent_asof2700_${name}_${suffix}`;
const A = id("a");
const B = id("b");
const C = id("c");
const D = id("d");
const F = id("f");
const G = id("g");

const key = (type: string, s: string, t: string) => `${type}:${s}:${t}`;
const K_AB = key("REFERS_TO", A, B);
const K_AD = key("REFERS_TO", A, D);
const K_AC = key("REFERS_TO", A, C);
const K_AF = key("REFERS_TO", A, F);
const K_AG = key("REFERS_TO", A, G);

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
  const relationshipKeys = [K_AB, K_AD, K_AC, K_AF, K_AG];
  let httpServer: ReturnType<typeof createServer>;
  let mcp: NeotomaServer;

  async function insertEntity(entityId: string, name: string, firstSeen: string) {
    const { error: eErr } = await db.from("entities").insert({
      id: entityId,
      entity_type: "task",
      canonical_name: name,
      user_id: USER_ID,
      created_at: firstSeen,
    });
    if (eErr) throw new Error(`entity insert failed: ${eErr.message}`);
    tracker.trackEntity(entityId);

    const { data: source, error: sErr } = await db
      .from("sources")
      .insert({
        user_id: USER_ID,
        content_hash: `hash_asof2700_${randomUUID()}`,
        storage_url: "file:///test/record_wide_as_of.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();
    if (sErr || !source) throw new Error(`source insert failed: ${sErr?.message}`);
    tracker.trackSource(source.id);

    const { error: oErr } = await db.from("observations").insert({
      entity_id: entityId,
      entity_type: "task",
      schema_version: "1.0",
      source_id: source.id,
      user_id: USER_ID,
      observed_at: firstSeen,
      created_at: firstSeen,
      fields: { title: name, status: "open" },
    });
    if (oErr) throw new Error(`observation insert failed: ${oErr.message}`);
  }

  async function insertEdgeObservation(opts: {
    relationshipKey: string;
    source: string;
    target: string;
    observedAt: string;
    createdAt: string;
    metadata: Record<string, unknown>;
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
      user_id: USER_ID,
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
    expect(keysOf(live.relationships)).toEqual([K_AB, K_AC, K_AF, K_AG].sort());
    expect(live.as_of).toBeUndefined();
  });

  // --------------------------------------------------------------------- MCP

  it("MCP list_relationships at_ingested: later writes are excluded across the edge set", async () => {
    const res = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      at_ingested: T,
    });
    // A -> C (new), A -> G (backfilled after T) are absent; A -> D is still live as of T.
    expect(keysOf(res.relationships)).toEqual([K_AB, K_AD, K_AF].sort());
    expect(res.total).toBe(3);
    expect(res.as_of).toEqual({ at: null, at_ingested: T });
    const ab = res.relationships.find((r: any) => r.relationship_key === K_AB);
    expect(ab.snapshot.note).toBe("first"); // the later metadata write is not visible
    expect(ab.is_live).toBe(1);
  });

  it("MCP list_relationships: `at` and `at_ingested` are different clocks", async () => {
    const byAt = await callMcp(mcp, "list_relationships", { source_entity_id: A, at: T });
    // A -> G was observed at OLD, so `at` includes it even though it arrived later.
    expect(keysOf(byAt.relationships)).toEqual([K_AB, K_AD, K_AF, K_AG].sort());

    const both = await callMcp(mcp, "list_relationships", {
      source_entity_id: A,
      at: T,
      at_ingested: T,
    });
    expect(keysOf(both.relationships)).toEqual([K_AB, K_AD, K_AF].sort());
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
    expect(keysOf(json.relationships)).toEqual([K_AB, K_AD, K_AF].sort());
    expect(json.total_count).toBe(3);
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
    expect(paged.json.total).toBe(3);
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
    expect(keysOf(out.relationships as any[])).toEqual([K_AB, K_AD, K_AF].sort());
    expect(out.as_of).toEqual({ at: null, at_ingested: T });
  });

  it("CLI entities related --at-ingested matches REST", async () => {
    const out = await execCliJson(
      `entities related "${A}" --direction outbound --at-ingested "${T}"`
    );
    expect(idsOf(out.entities as any[])).toEqual([B, D].sort());
    expect(keysOf(out.relationships as any[])).toEqual([K_AB, K_AD].sort());
  });
});
