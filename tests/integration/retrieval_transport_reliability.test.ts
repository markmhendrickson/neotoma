import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const API_BASE = "http://127.0.0.1:18084";

function callMCPAction(server: NeotomaServer, actionName: string, params: any): Promise<any> {
  const methodName = actionName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return (server as any)[methodName](params);
}

describe("retrieval transport reliability", () => {
  let server: NeotomaServer;
  const createdEntityIds: string[] = [];
  const createdRelationshipKeys: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as any).authenticatedUserId = TEST_USER_ID;
  });

  afterEach(async () => {
    if (createdRelationshipKeys.length > 0) {
      await db
        .from("relationship_snapshots")
        .delete()
        .in("relationship_key", createdRelationshipKeys);
      createdRelationshipKeys.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
  });

  it("returns equivalent identifier results for MCP and REST", async () => {
    const entityId = `ent_transport_${Date.now()}`;
    createdEntityIds.push(entityId);
    await db.from("entities").insert({
      id: entityId,
      user_id: TEST_USER_ID,
      entity_type: "contact",
      canonical_name: "transport-parity@example.com",
      aliases: ["transport parity", "transport-user"],
    });

    const mcpRaw = await callMCPAction(server, "retrieve_entity_by_identifier", {
      identifier: "transport-parity@example.com",
      entity_type: "contact",
    });
    const mcpData = JSON.parse(mcpRaw.content[0].text) as {
      entities: Array<{ id?: string; entity_id?: string }>;
    };

    const restResponse = await fetch(`${API_BASE}/retrieve_entity_by_identifier`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: "transport-parity@example.com",
        entity_type: "contact",
      }),
    });
    const restData = (await restResponse.json()) as {
      entities: Array<{ id?: string; entity_id?: string }>;
    };

    const mcpIds = (mcpData.entities || []).map((e) => e.id ?? e.entity_id).filter(Boolean).sort();
    const restIds = (restData.entities || []).map((e) => e.id ?? e.entity_id).filter(Boolean).sort();

    expect(restResponse.ok).toBe(true);
    expect(mcpIds).toEqual(restIds);
  });

  it("does not leak other-user relationships in REST related-entities endpoint", async () => {
    const sourceEntityId = `ent_rel_src_${Date.now()}`;
    const targetEntityId = `ent_rel_tgt_${Date.now()}`;
    const relationshipKey = `REFERS_TO:${sourceEntityId}:${targetEntityId}`;
    createdEntityIds.push(sourceEntityId, targetEntityId);
    createdRelationshipKeys.push(relationshipKey);

    await db.from("entities").insert([
      {
        id: sourceEntityId,
        user_id: "other-user-rel",
        entity_type: "contact",
        canonical_name: "other source",
      },
      {
        id: targetEntityId,
        user_id: "other-user-rel",
        entity_type: "contact",
        canonical_name: "other target",
      },
    ]);

    await db.from("relationship_snapshots").insert({
      relationship_key: relationshipKey,
      relationship_type: "REFERS_TO",
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      schema_version: "1.0",
      snapshot: {},
      computed_at: new Date().toISOString(),
      observation_count: 1,
      last_observation_at: new Date().toISOString(),
      provenance: {},
      user_id: "other-user-rel",
    });

    const response = await fetch(`${API_BASE}/retrieve_related_entities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity_id: sourceEntityId,
        direction: "both",
        include_entities: true,
      }),
    });
    const data = (await response.json()) as { relationships?: unknown[]; entities?: unknown[] };

    expect(response.ok).toBe(true);
    expect(Array.isArray(data.relationships)).toBe(true);
    expect(Array.isArray(data.entities)).toBe(true);
    expect(data.relationships?.length ?? 0).toBe(0);
    expect(data.entities?.length ?? 0).toBe(0);
  });
});
