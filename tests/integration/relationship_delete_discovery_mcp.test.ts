/**
 * Integration test: relationship-type discovery guard over the MCP surface (#277).
 *
 * The HTTP /delete_relationship handler verifies a live edge exists before
 * recording a deletion observation and otherwise returns a 404 carrying a
 * discovery hint. This test asserts the MCP delete_relationship handler
 * (NeotomaServer.deleteRelationship) enforces the SAME guard so the two
 * surfaces are consistent:
 *
 *   1. delete_relationship with a wrong/non-existent (relationship_type,
 *      source, target) does NOT silently succeed — it raises a not-found MCP
 *      error whose structured data points back at list_relationships.
 *   2. delete_relationship with the live type succeeds and writes a deletion
 *      observation.
 *   3. Re-deleting the now-removed edge raises the same discovery error.
 *
 * Before this guard, the MCP path called softDeleteRelationship directly and
 * returned success:true for any triple, masking a wrong-type guess.
 */

import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const OWNER_USER_ID = "00000000-0000-0000-0000-0000000002b0";

function makeEntityId(tag: string): string {
  const hex = createHash("sha256").update(tag).digest("hex").slice(0, 24);
  return `ent_${hex}`;
}

function callMcp(server: NeotomaServer, action: string, params: unknown): Promise<unknown> {
  return (server as unknown as Record<string, (p: unknown) => Promise<unknown>>)[action](params);
}

describe("MCP delete_relationship discovery guard (#277)", () => {
  let server: NeotomaServer;

  const runId = Date.now();
  const sourceId = makeEntityId(`mcp-disc-source-${runId}`);
  const targetId = makeEntityId(`mcp-disc-target-${runId}`);
  const relationshipType = "REFERS_TO";
  const relationshipKey = `${relationshipType}:${sourceId}:${targetId}`;
  const createdKeys = [relationshipKey];

  async function seedRelationship(userId: string): Promise<void> {
    await db.from("relationship_observations").insert({
      id: createHash("sha256").update(`${relationshipKey}:${userId}:obs`).digest("hex"),
      relationship_key: relationshipKey,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      relationship_type: relationshipType,
      source_priority: 1,
      metadata: {},
      canonical_hash: createHash("sha256").update(`${relationshipKey}:${userId}`).digest("hex"),
      user_id: userId,
      observed_at: new Date().toISOString(),
      provenance: {},
    });

    await db.from("relationship_snapshots").upsert({
      relationship_key: relationshipKey,
      relationship_type: relationshipType,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      schema_version: "1.0",
      snapshot: {},
      computed_at: new Date().toISOString(),
      observation_count: 1,
      last_observation_at: new Date().toISOString(),
      provenance: {},
      user_id: userId,
    });
  }

  beforeAll(async () => {
    server = new NeotomaServer();
    // Set authenticated user directly — avoids needing a real MCP initialize handshake.
    (server as unknown as { authenticatedUserId: string }).authenticatedUserId = OWNER_USER_ID;

    for (const [id, name] of [
      [sourceId, "mcp-disc-source"],
      [targetId, "mcp-disc-target"],
    ] as const) {
      await db.from("entities").insert({
        id,
        user_id: OWNER_USER_ID,
        entity_type: "note",
        canonical_name: name,
      });
    }

    await seedRelationship(OWNER_USER_ID);
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", createdKeys);
    await db.from("relationship_observations").delete().in("relationship_key", createdKeys);
    await db.from("entities").delete().in("id", [sourceId, targetId]);
  });

  it("does not silently succeed on a wrong relationship_type — raises a discovery error", async () => {
    let thrown: unknown;
    try {
      await callMcp(server, "deleteRelationship", {
        // Caller guesses a type that does not exist between these entities.
        relationship_type: "PART_OF",
        source_entity_id: sourceId,
        target_entity_id: targetId,
        user_id: OWNER_USER_ID,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(McpError);
    const mcpErr = thrown as McpError;
    expect(mcpErr.message).toContain("No live relationship");
    // The structured data carries the same discovery hint as the HTTP 404.
    const data = (mcpErr as unknown as { data?: Record<string, unknown> }).data;
    expect(data).toBeDefined();
    expect(data?.code).toBe("RESOURCE_NOT_FOUND");
    expect(typeof data?.hint).toBe("string");
    expect(data?.hint as string).toContain("list_relationships");

    // Crucially: no deletion observation was written for the bogus triple.
    const bogusKey = `PART_OF:${sourceId}:${targetId}`;
    const { data: bogusObs } = await db
      .from("relationship_observations")
      .select("id")
      .eq("relationship_key", bogusKey)
      .eq("user_id", OWNER_USER_ID);
    expect(bogusObs ?? []).toHaveLength(0);
  });

  it("deletes the relationship when the live type is supplied", async () => {
    const result = (await callMcp(server, "deleteRelationship", {
      relationship_type: relationshipType,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      user_id: OWNER_USER_ID,
    })) as { content: Array<{ type: string; text: string }> };

    const payload = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(typeof payload.observation_id).toBe("string");
  });

  it("raises the discovery error when re-deleting the now-removed edge", async () => {
    let thrown: unknown;
    try {
      await callMcp(server, "deleteRelationship", {
        relationship_type: relationshipType,
        source_entity_id: sourceId,
        target_entity_id: targetId,
        user_id: OWNER_USER_ID,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(McpError);
    const data = (thrown as unknown as { data?: Record<string, unknown> }).data;
    expect(data?.code).toBe("RESOURCE_NOT_FOUND");
    expect(data?.hint as string).toContain("list_relationships");
  });
});
