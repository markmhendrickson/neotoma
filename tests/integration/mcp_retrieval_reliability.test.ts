import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function callMCPAction(server: NeotomaServer, actionName: string, params: any): Promise<any> {
  const methodName = actionName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return (server as any)[methodName](params);
}

describe("MCP retrieval reliability", () => {
  let server: NeotomaServer;
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as any).authenticatedUserId = TEST_USER_ID;
  });

  afterEach(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
  });

  it("does not return identifier matches from other users", async () => {
    const entityId = `ent_mcp_other_${Date.now()}`;
    createdEntityIds.push(entityId);
    await db.from("entities").insert({
      id: entityId,
      user_id: "other-user-mcp",
      entity_type: "contact",
      canonical_name: "mcp-isolation@example.com",
    });

    const result = await callMCPAction(server, "retrieve_entity_by_identifier", {
      identifier: "mcp-isolation@example.com",
      entity_type: "contact",
    });
    const data = JSON.parse(result.content[0].text) as { entities: unknown[]; total: number };

    expect(Array.isArray(data.entities)).toBe(true);
    expect(data.entities.length).toBe(0);
    expect(data.total).toBe(0);
  });

  it("returns total independent of page size in list_observations", async () => {
    const entityId = `ent_mcp_obs_${Date.now()}`;
    createdEntityIds.push(entityId);
    const sourceId = `src_mcp_obs_${Date.now()}`;
    createdSourceIds.push(sourceId);

    await db.from("sources").insert({
      id: sourceId,
      user_id: TEST_USER_ID,
      content_hash: `mcp_obs_${Date.now()}`,
      storage_url: "file:///tmp/mcp_obs.txt",
      mime_type: "text/plain",
      file_size: 0,
    });

    await db.from("observations").insert([
      {
        id: `obs_mcp_1_${Date.now()}`,
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: sourceId,
        observed_at: new Date(Date.now() - 1000).toISOString(),
        specificity_score: 0.8,
        source_priority: 100,
        fields: { title: "Obs One" },
        user_id: TEST_USER_ID,
      },
      {
        id: `obs_mcp_2_${Date.now()}`,
        entity_id: entityId,
        entity_type: "note",
        schema_version: "1.0",
        source_id: sourceId,
        observed_at: new Date().toISOString(),
        specificity_score: 0.9,
        source_priority: 100,
        fields: { title: "Obs Two" },
        user_id: TEST_USER_ID,
      },
    ]);

    const result = await callMCPAction(server, "list_observations", {
      entity_id: entityId,
      limit: 1,
      offset: 0,
    });
    const data = JSON.parse(result.content[0].text) as {
      observations: unknown[];
      total: number;
    };

    expect(data.observations.length).toBe(1);
    expect(data.total).toBeGreaterThanOrEqual(2);
  });
});
