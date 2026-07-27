/**
 * Integration test: `knows` edge type + the `find_paths` / `shortest_path`
 * warm-path primitives (#1969).
 *
 * Covers:
 *  (a) `knows` is a first-class relationship type — it validates through
 *      create_relationship, appears in list_relationships, and is traversed by
 *      retrieve_related_entities like any other type.
 *  (b) `find_paths(target_company)` returns the contacts reaching a company
 *      AND the full path (entity/edge chain) to each, which is the value over
 *      query_contacts_at_company.
 *  (c) `find_paths(target_fund)` traverses invested_in/funded_by correctly
 *      when those edges are explicitly created (nothing populates them on real
 *      data yet — see the `notes` field on the response).
 *  (d) traversal bounds are ENFORCED, not advisory: depth, path count, and the
 *      hop ceiling all clamp, and `stats.truncated` reports when they fire.
 *  (e) cycle safety: a cyclic graph terminates rather than looping.
 *  (f) `shortest_path` between two known entities.
 *
 * Fixtures are built by creating entities and explicit relationships directly
 * (rather than via the schema auto-link hook) so the graph shape under test is
 * exact and does not depend on DB-backed schema seeding.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { relationshipsService } from "../../src/services/relationships.js";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";
import { getOpenApiInputSchemaOrThrow } from "../../src/shared/openapi_schema.js";
import { findPaths, findShortestPath, MAX_HOPS_CEILING } from "../../src/services/path_finding.js";
import { RelationshipTypeSchema } from "../../src/shared/action_schemas.js";

const TEST_USER_ID = "00000000-0000-0000-0000-0000000009a1";

/** Entity ids created by this suite, cleaned up in afterAll. */
const createdEntityIds: string[] = [];

async function makeEntity(id: string, entityType: string, canonicalName: string): Promise<string> {
  await db.from("entities").insert({
    id,
    entity_type: entityType,
    canonical_name: canonicalName,
    user_id: TEST_USER_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  createdEntityIds.push(id);
  return id;
}

async function makeEdge(type: string, sourceId: string, targetId: string): Promise<void> {
  await relationshipsService.createRelationship({
    relationship_type: type as never,
    source_entity_id: sourceId,
    target_entity_id: targetId,
    user_id: TEST_USER_ID,
  });
}

// ---------------------------------------------------------------------------
// Fixture graph
//
//   ana --knows--> bruno --works_at--> acme        (2 hops to acme)
//   carla --works_at--> acme                       (1 hop to acme)
//   dora --knows--> ana                            (3 hops to acme)
//   eli --works_at--> orbit  (unconnected to acme)
//
//   ana --knows--> bruno --member_of--> vega_fund  (fund target)
//   ana --invested_in--> vega_fund
//
//   cycle: cy1 --knows--> cy2 --knows--> cy3 --knows--> cy1, cy3 --works_at--> loopco
// ---------------------------------------------------------------------------
const E = {
  ana: "ent_test1969_ana",
  bruno: "ent_test1969_bruno",
  carla: "ent_test1969_carla",
  dora: "ent_test1969_dora",
  eli: "ent_test1969_eli",
  acme: "ent_test1969_acme",
  orbit: "ent_test1969_orbit",
  vega: "ent_test1969_vega",
  cy1: "ent_test1969_cy1",
  cy2: "ent_test1969_cy2",
  cy3: "ent_test1969_cy3",
  loopco: "ent_test1969_loopco",
};

describe("#1969 knows edge type + find_paths / shortest_path", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

    await makeEntity(E.ana, "contact", "Ana Pathfinder");
    await makeEntity(E.bruno, "contact", "Bruno Bridge");
    await makeEntity(E.carla, "contact", "Carla Direct");
    await makeEntity(E.dora, "contact", "Dora Distant");
    await makeEntity(E.eli, "contact", "Eli Elsewhere");
    await makeEntity(E.acme, "company", "Acme Pathtarget");
    await makeEntity(E.orbit, "company", "Orbit Unrelated");
    await makeEntity(E.vega, "company", "Vega Pathfund");
    await makeEntity(E.cy1, "contact", "Cycle One");
    await makeEntity(E.cy2, "contact", "Cycle Two");
    await makeEntity(E.cy3, "contact", "Cycle Three");
    await makeEntity(E.loopco, "company", "Loopco Cyclictarget");

    await makeEdge("knows", E.ana, E.bruno);
    await makeEdge("works_at", E.bruno, E.acme);
    await makeEdge("works_at", E.carla, E.acme);
    await makeEdge("knows", E.dora, E.ana);
    await makeEdge("works_at", E.eli, E.orbit);

    await makeEdge("member_of", E.bruno, E.vega);
    await makeEdge("invested_in", E.ana, E.vega);

    await makeEdge("knows", E.cy1, E.cy2);
    await makeEdge("knows", E.cy2, E.cy3);
    await makeEdge("knows", E.cy3, E.cy1);
    await makeEdge("works_at", E.cy3, E.loopco);
  });

  afterAll(async () => {
    for (const id of createdEntityIds) {
      await db.from("relationship_observations").delete().eq("source_entity_id", id);
      await db.from("relationship_observations").delete().eq("target_entity_id", id);
      await db.from("relationship_snapshots").delete().eq("source_entity_id", id);
      await db.from("relationship_snapshots").delete().eq("target_entity_id", id);
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("timeline_events").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  // -------------------------------------------------------------------------
  // (a) KNOWS as a first-class relationship type
  // -------------------------------------------------------------------------
  describe("(a) knows edge type", () => {
    it("is accepted by the closed relationship type enum", () => {
      expect(RelationshipTypeSchema.safeParse("knows").success).toBe(true);
      // Guard the directionality choice: only lowercase `knows` is the type.
      expect(RelationshipTypeSchema.safeParse("KNOWS").success).toBe(false);
    });

    it("is exposed in the MCP relationship type enum for create/get tools", () => {
      const schema = getOpenApiInputSchemaOrThrow("create_relationship") as {
        properties?: Record<string, { enum?: string[] }>;
      };
      expect(schema.properties?.relationship_type?.enum).toContain("knows");
    });

    it("creates and lists a knows edge like any other type", async () => {
      const outgoing = await relationshipsService.getRelationshipsForEntity(
        E.ana,
        "outgoing",
        false,
        TEST_USER_ID
      );
      const knows = outgoing.filter((r) => r.relationship_type === "knows");
      expect(knows).toHaveLength(1);
      expect(knows[0].target_entity_id).toBe(E.bruno);
    });

    it("is ASSERTED-BY directional: the reverse edge is NOT auto-created", async () => {
      // ana knows bruno was created; bruno knows ana must not exist unless
      // independently observed. This is the documented semantic (#1969).
      const brunoOutgoing = await relationshipsService.getRelationshipsForEntity(
        E.bruno,
        "outgoing",
        false,
        TEST_USER_ID
      );
      const brunoKnowsAna = brunoOutgoing.filter(
        (r) => r.relationship_type === "knows" && r.target_entity_id === E.ana
      );
      expect(brunoKnowsAna).toHaveLength(0);

      // But the edge IS visible from bruno's incoming side.
      const brunoIncoming = await relationshipsService.getRelationshipsForEntity(
        E.bruno,
        "incoming",
        false,
        TEST_USER_ID
      );
      expect(
        brunoIncoming.some((r) => r.relationship_type === "knows" && r.source_entity_id === E.ana)
      ).toBe(true);
    });

    it("is traversed by retrieve_related_entities like other types", async () => {
      const result = await (server as any).retrieveRelatedEntities({
        entity_id: E.ana,
        relationship_types: ["knows"],
        direction: "outbound",
        max_hops: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      const ids = parsed.entities.map((e: { id: string }) => e.id);
      expect(ids).toContain(E.bruno);
    });
  });

  // -------------------------------------------------------------------------
  // (b) find_paths for a company target
  // -------------------------------------------------------------------------
  describe("(b) find_paths(target_company)", () => {
    it("returns both the direct employee and the multi-hop knows path, with full chains", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 3,
      });

      expect(result.target).not.toBeNull();
      expect(result.target!.entity_id).toBe(E.acme);

      const origins = result.paths.map((p) => p.nodes[0].entity_id).sort();
      // carla (1 hop), bruno (1 hop), ana (2 hops), dora (3 hops), and vega
      // (2 hops). Vega is reached because traversal is UNDIRECTED: bruno
      // member_of vega is walked against its stored direction, giving
      // vega -> bruno -> acme. That is intended for a warm-path query — "who
      // or what connects to Acme" includes the fund Bruno belongs to — and
      // each edge records `traversed` so the stored orientation is not lost.
      expect(origins).toEqual([E.ana, E.bruno, E.carla, E.dora, E.vega].sort());

      // Every path must END at the target — this is the origin-first contract.
      for (const path of result.paths) {
        expect(path.nodes[path.nodes.length - 1].entity_id).toBe(E.acme);
        expect(path.edges).toHaveLength(path.nodes.length - 1);
        expect(path.hops).toBe(path.edges.length);
      }

      // Shortest-first ordering.
      const hops = result.paths.map((p) => p.hops);
      expect([...hops]).toEqual([...hops].sort((a, b) => a - b));
    });

    it("returns the PATH chain, not just endpoints — ana reaches acme VIA bruno", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 3,
      });

      const anaPath = result.paths.find((p) => p.nodes[0].entity_id === E.ana);
      expect(anaPath).toBeDefined();
      expect(anaPath!.nodes.map((n) => n.entity_id)).toEqual([E.ana, E.bruno, E.acme]);
      expect(anaPath!.edges.map((e) => e.relationship_type)).toEqual(["knows", "works_at"]);
      expect(anaPath!.hops).toBe(2);

      // Nodes are hydrated with names, so the chain is human-readable.
      expect(anaPath!.nodes[0].canonical_name).toBe("Ana Pathfinder");
      expect(anaPath!.nodes[1].canonical_name).toBe("Bruno Bridge");
    });

    it("records the stored orientation of each traversed edge", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 3,
      });
      const anaPath = result.paths.find((p) => p.nodes[0].entity_id === E.ana)!;
      for (const edge of anaPath.edges) {
        expect(["outbound", "inbound"]).toContain(edge.traversed);
      }
      // The works_at edge is stored bruno -> acme, and the path walks it in
      // that stored direction from bruno to acme.
      const worksAt = anaPath.edges.find((e) => e.relationship_type === "works_at")!;
      expect(worksAt.source_entity_id).toBe(E.bruno);
      expect(worksAt.target_entity_id).toBe(E.acme);
    });

    it("traverses edges against their stored direction and labels them inbound", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 3,
      });
      // vega -> bruno walks `bruno member_of vega` backwards.
      const vegaPath = result.paths.find((p) => p.nodes[0].entity_id === E.vega);
      expect(vegaPath).toBeDefined();
      expect(vegaPath!.nodes.map((n) => n.entity_id)).toEqual([E.vega, E.bruno, E.acme]);
      const memberEdge = vegaPath!.edges.find((e) => e.relationship_type === "member_of")!;
      expect(memberEdge.traversed).toBe("inbound");
      // The stored orientation is preserved verbatim, not rewritten.
      expect(memberEdge.source_entity_id).toBe(E.bruno);
      expect(memberEdge.target_entity_id).toBe(E.vega);
    });

    it("excludes entities with no route to the target", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 5,
      });
      const reached = result.paths.flatMap((p) => p.nodes.map((n) => n.entity_id));
      expect(reached).not.toContain(E.eli);
      expect(reached).not.toContain(E.orbit);
    });

    it("returns target: null and no paths for an unresolvable name (read-only, creates nothing)", async () => {
      const before = await db
        .from("entities")
        .select("id")
        .eq("entity_type", "company")
        .eq("user_id", TEST_USER_ID);

      const result = await findPaths({
        targetName: "Nonexistent Pathtarget ZZZ999",
        targetKind: "company",
        userId: TEST_USER_ID,
      });
      expect(result.target).toBeNull();
      expect(result.paths).toEqual([]);
      expect(result.total_paths).toBe(0);

      const after = await db
        .from("entities")
        .select("id")
        .eq("entity_type", "company")
        .eq("user_id", TEST_USER_ID);
      expect((after.data ?? []).length).toBe((before.data ?? []).length);
    });

    it("throws rather than scanning across tenants when userId is empty", async () => {
      await expect(
        findPaths({ targetName: "Acme Pathtarget", targetKind: "company", userId: "" })
      ).rejects.toThrow(/requires a non-empty userId/);
    });
  });

  // -------------------------------------------------------------------------
  // (c) find_paths for a fund target
  // -------------------------------------------------------------------------
  describe("(c) find_paths(target_fund)", () => {
    it("traverses invested_in / member_of edges to reach a fund", async () => {
      const result = await findPaths({
        targetName: "Vega Pathfund",
        targetKind: "fund",
        userId: TEST_USER_ID,
        maxHops: 3,
      });

      expect(result.target).not.toBeNull();
      expect(result.target!.entity_id).toBe(E.vega);

      const origins = result.paths.map((p) => p.nodes[0].entity_id);
      // ana --invested_in--> vega (1 hop), bruno --member_of--> vega (1 hop)
      expect(origins).toContain(E.ana);
      expect(origins).toContain(E.bruno);

      const anaPath = result.paths.find((p) => p.nodes[0].entity_id === E.ana)!;
      expect(anaPath.nodes[anaPath.nodes.length - 1].entity_id).toBe(E.vega);
    });

    it("carries a note that no writer populates invested_in/funded_by yet", async () => {
      const result = await findPaths({
        targetName: "Vega Pathfund",
        targetKind: "fund",
        userId: TEST_USER_ID,
      });
      expect(result.notes).toBeDefined();
      expect(result.notes!.join(" ")).toMatch(/invested_in/);
    });
  });

  // -------------------------------------------------------------------------
  // (d) Traversal bounds are enforced (#1945)
  // -------------------------------------------------------------------------
  describe("(d) traversal bounds", () => {
    it("max_hops=1 finds only directly-linked origins and reports depth truncation", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 1,
      });
      const origins = result.paths.map((p) => p.nodes[0].entity_id).sort();
      expect(origins).toEqual([E.bruno, E.carla].sort());
      for (const p of result.paths) expect(p.hops).toBe(1);

      // More was reachable beyond the bound, so this must be reported.
      expect(result.stats.truncated).toBe(true);
      expect(result.stats.truncation_reasons).toContain("max_hops");
    });

    it("max_hops=2 reaches ana but not dora", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 2,
      });
      const origins = result.paths.map((p) => p.nodes[0].entity_id);
      expect(origins).toContain(E.ana);
      expect(origins).not.toContain(E.dora);
    });

    it("clamps max_hops to the ceiling rather than honouring an over-large request", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 999,
      });
      expect(result.bounds.max_hops).toBe(MAX_HOPS_CEILING);
    });

    it("max_paths bounds the result size and reports the true pre-truncation total", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 3,
        maxPaths: 1,
      });
      expect(result.paths).toHaveLength(1);
      expect(result.total_paths).toBeGreaterThan(1);
      expect(result.stats.truncated).toBe(true);
      expect(result.stats.truncation_reasons).toContain("max_paths");
    });

    it("bounds are echoed on the response so callers can see what was applied", async () => {
      const result = await findPaths({
        targetName: "Acme Pathtarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 2,
        maxPaths: 5,
      });
      expect(result.bounds.max_hops).toBe(2);
      expect(result.bounds.max_paths).toBe(5);
      expect(result.bounds.max_nodes_expanded).toBeGreaterThan(0);
      expect(result.bounds.max_frontier_size).toBeGreaterThan(0);
      expect(result.stats.nodes_expanded).toBeLessThanOrEqual(result.bounds.max_nodes_expanded);
    });

    it("the request schema rejects an over-ceiling max_hops at the edge", async () => {
      const { FindPathsRequestSchema } = await import("../../src/shared/action_schemas.js");
      expect(FindPathsRequestSchema.safeParse({ target_name: "x", max_hops: 99 }).success).toBe(
        false
      );
      expect(FindPathsRequestSchema.safeParse({ target_name: "x", max_hops: 3 }).success).toBe(
        true
      );
    });
  });

  // -------------------------------------------------------------------------
  // (e) Cycle safety
  // -------------------------------------------------------------------------
  describe("(e) cycle safety", () => {
    it("terminates on a cyclic knows graph and visits each node once", async () => {
      const result = await findPaths({
        targetName: "Loopco Cyclictarget",
        targetKind: "company",
        userId: TEST_USER_ID,
        maxHops: 5,
      });

      expect(result.target!.entity_id).toBe(E.loopco);

      // cy1, cy2, cy3 all reach loopco; each appears as an origin exactly once
      // because the visited set expands each node a single time.
      const origins = result.paths.map((p) => p.nodes[0].entity_id);
      expect(new Set(origins).size).toBe(origins.length);
      expect(origins).toContain(E.cy3);

      // No path may repeat a node (which is what a cycle would produce).
      for (const path of result.paths) {
        const ids = path.nodes.map((n) => n.entity_id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it("shortest_path terminates on the cycle instead of looping", async () => {
      const result = await findShortestPath({
        fromEntityId: E.cy1,
        toEntityId: E.loopco,
        userId: TEST_USER_ID,
        maxHops: 5,
      });
      expect(result.found).toBe(true);
      const ids = result.path!.nodes.map((n) => n.entity_id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // -------------------------------------------------------------------------
  // (f) shortest_path
  // -------------------------------------------------------------------------
  describe("(f) shortest_path", () => {
    it("finds the shortest chain between two contacts", async () => {
      const result = await findShortestPath({
        fromEntityId: E.dora,
        toEntityId: E.acme,
        userId: TEST_USER_ID,
        maxHops: 5,
      });
      expect(result.found).toBe(true);
      expect(result.path!.nodes.map((n) => n.entity_id)).toEqual([E.dora, E.ana, E.bruno, E.acme]);
      expect(result.path!.hops).toBe(3);
    });

    it("returns a zero-hop path for identical endpoints", async () => {
      const result = await findShortestPath({
        fromEntityId: E.ana,
        toEntityId: E.ana,
        userId: TEST_USER_ID,
      });
      expect(result.found).toBe(true);
      expect(result.path!.hops).toBe(0);
      expect(result.path!.nodes).toHaveLength(1);
    });

    it("returns found:false (not an error) when unreachable", async () => {
      const result = await findShortestPath({
        fromEntityId: E.eli,
        toEntityId: E.acme,
        userId: TEST_USER_ID,
        maxHops: 5,
      });
      expect(result.found).toBe(false);
      expect(result.path).toBeNull();
    });

    it("respects max_hops: dora->acme (3 hops) is not found within 2", async () => {
      const result = await findShortestPath({
        fromEntityId: E.dora,
        toEntityId: E.acme,
        userId: TEST_USER_ID,
        maxHops: 2,
      });
      expect(result.found).toBe(false);
      // Truncation flags that this is a bound, not proven unreachability.
      expect(result.stats.truncated).toBe(true);
    });

    it("restricts traversal to the requested relationship types", async () => {
      // Only knows edges: dora reaches bruno but cannot reach acme (works_at).
      const result = await findShortestPath({
        fromEntityId: E.dora,
        toEntityId: E.acme,
        userId: TEST_USER_ID,
        maxHops: 5,
        relationshipTypes: ["knows"],
      });
      expect(result.found).toBe(false);
    });

    it("throws rather than scanning across tenants when userId is empty", async () => {
      await expect(
        findShortestPath({ fromEntityId: E.ana, toEntityId: E.acme, userId: "" })
      ).rejects.toThrow(/requires a non-empty userId/);
    });
  });

  // -------------------------------------------------------------------------
  // MCP tool registration + dispatch
  // -------------------------------------------------------------------------
  describe("MCP tool surface", () => {
    it("registers find_paths and shortest_path with OpenAPI-backed schemas", () => {
      expect(NEOTOMA_TOOL_NAMES).toContain("find_paths");
      expect(NEOTOMA_TOOL_NAMES).toContain("shortest_path");

      const fp = getOpenApiInputSchemaOrThrow("find_paths") as {
        required?: string[];
        properties?: Record<string, unknown>;
      };
      expect(fp.required).toContain("target_name");
      expect(fp.properties).toHaveProperty("target_kind");
      expect(fp.properties).toHaveProperty("max_hops");
      expect(fp.properties).toHaveProperty("max_paths");

      const sp = getOpenApiInputSchemaOrThrow("shortest_path") as {
        required?: string[];
      };
      expect(sp.required).toContain("from_entity_id");
      expect(sp.required).toContain("to_entity_id");
    });

    it("dispatches find_paths through the tool handler end-to-end", async () => {
      const result = await (server as any).findPathsTool({
        target_name: "Acme Pathtarget",
        max_hops: 3,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeUndefined();
      expect(parsed.target.entity_id).toBe(E.acme);
      const origins = parsed.paths.map(
        (p: { nodes: Array<{ entity_id: string }> }) => p.nodes[0].entity_id
      );
      expect(origins).toContain(E.ana);
    });

    it("dispatches shortest_path through the tool handler end-to-end", async () => {
      const result = await (server as any).shortestPathTool({
        from_entity_id: E.dora,
        to_entity_id: E.acme,
        max_hops: 5,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.found).toBe(true);
      expect(parsed.path.hops).toBe(3);
    });

    it("rejects a find_paths call with no target_name", async () => {
      await expect((server as any).findPathsTool({})).rejects.toThrow();
    });

    it("rejects a shortest_path call missing an endpoint", async () => {
      await expect((server as any).shortestPathTool({ from_entity_id: E.ana })).rejects.toThrow();
    });
  });
});
