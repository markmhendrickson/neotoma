/**
 * Integration regression test: retrieve_graph_neighborhood `node_type: "source"` branch.
 *
 * Guards against the singular-table regression (GH #389 / #394): the handler's
 * source branch and the entity-branch `include_sources` sub-path must query the
 * canonical `sources` table (plural). The prior `db.from("source")` (singular)
 * silently returned no rows for every user, so the response omitted `source`
 * even when a matching row existed.
 *
 * This exercises the real Express handler over HTTP (not a direct DB re-query),
 * which is what the pre-existing `node_type: source` test in
 * mcp_graph_variations.test.ts failed to do — letting the bug hide.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_PORT = 18121;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

describe("retrieve_graph_neighborhood source branch (#389/#394)", () => {
  let httpServer: ReturnType<typeof createServer>;
  let sourceId: string;
  const entityId = makeEntityId(`gns-entity-${Date.now()}`);
  const contentHash = `gns_${Date.now()}`;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    // Seed a source row.
    const { data: source, error: sourceError } = await db
      .from("sources")
      .insert({
        user_id: TEST_USER_ID,
        content_hash: contentHash,
        storage_url: "file:///test/gns-source.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();
    expect(sourceError).toBeNull();
    expect(source).toBeDefined();
    sourceId = source!.id;

    // Seed an entity and an observation linking it to the source so the
    // entity-branch include_sources sub-path has something to resolve.
    await db.from("entities").insert({
      id: entityId,
      user_id: TEST_USER_ID,
      entity_type: "note",
      canonical_name: "gns-entity",
    });

    await db.from("observations").insert({
      id: createHash("sha256").update(`${entityId}:${sourceId}:obs`).digest("hex"),
      entity_id: entityId,
      source_id: sourceId,
      user_id: TEST_USER_ID,
      entity_type: "note",
      schema_version: "1.0",
      source_priority: 1,
      observed_at: new Date().toISOString(),
      fields: { canonical_name: "gns-entity" },
    });
  });

  afterAll(async () => {
    await db.from("observations").delete().eq("source_id", sourceId);
    await db.from("entities").delete().eq("id", entityId);
    await db.from("sources").delete().eq("id", sourceId);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function callNeighborhood(params: Record<string, unknown>) {
    const resp = await fetch(`${API_BASE}/retrieve_graph_neighborhood`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: TEST_USER_ID, ...params }),
    });
    return resp.json() as Promise<Record<string, unknown>>;
  }

  it("node_type: source returns the source row (not silently empty)", async () => {
    const body = await callNeighborhood({
      node_id: sourceId,
      node_type: "source",
      include_observations: true,
    });

    expect(body.source).toBeDefined();
    expect((body.source as { id: string }).id).toBe(sourceId);
    expect(Array.isArray(body.observations)).toBe(true);
    expect((body.observations as unknown[]).length).toBeGreaterThan(0);
  });

  it("node_type: entity with include_sources resolves the linked source", async () => {
    const body = await callNeighborhood({
      node_id: entityId,
      node_type: "entity",
      include_observations: true,
      include_sources: true,
    });

    expect(Array.isArray(body.sources)).toBe(true);
    expect((body.sources as Array<{ id: string }>).some((s) => s.id === sourceId)).toBe(true);
  });
});
