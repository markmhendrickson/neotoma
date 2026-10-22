import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

const USER_ID = "00000000-0000-0000-0000-000000000000";
const suffix = String(process.hrtime.bigint());
const hub = `ent_mcp_limit_hub_${suffix}`;
const spokes = Array.from({ length: 52 }, (_, i) => `ent_mcp_limit_${i}_${suffix}`);
const entityIds = [hub, ...spokes];
const relationshipKeys = spokes.map((id) => `related_to:${hub}:${id}`);

type RelatedResult = {
  entities: unknown[];
  relationships: unknown[];
  truncated: boolean;
  limit?: number;
  matched_entity_count?: number;
  truncation_hint?: string;
};

describe("MCP retrieve_related_entities hub cap (#2432)", () => {
  let server: {
    authenticatedUserId: string;
    retrieveRelatedEntities: (args: unknown) => Promise<{ content: Array<{ text: string }> }>;
  };

  beforeAll(async () => {
    server = new NeotomaServer() as unknown as typeof server;
    server.authenticatedUserId = USER_ID;
    const entities = await db.from("entities").insert(
      entityIds.map((id) => ({
        id,
        entity_type: "thing",
        canonical_name: id,
        user_id: USER_ID,
      }))
    );
    expect(entities.error).toBeNull();
    const relationships = await db.from("relationship_snapshots").insert(
      spokes.map((id) => ({
        relationship_key: `related_to:${hub}:${id}`,
        relationship_type: "related_to",
        source_entity_id: hub,
        target_entity_id: id,
        schema_version: "1.0",
        snapshot: {},
        user_id: USER_ID,
      }))
    );
    expect(relationships.error).toBeNull();
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", relationshipKeys);
    await db.from("entities").delete().in("id", entityIds);
  });

  async function related(limit?: number): Promise<RelatedResult> {
    const raw = await server.retrieveRelatedEntities({
      entity_id: hub,
      direction: "outbound",
      ...(limit === undefined ? {} : { limit }),
    });
    return JSON.parse(raw.content[0].text) as RelatedResult;
  }

  it("uses the restrictive default and reports the incomplete result", async () => {
    const result = await related();
    expect(result.relationships).toHaveLength(50);
    expect(result.entities).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(50);
    expect(result.matched_entity_count).toBe(50);
    expect(result.truncation_hint).toContain("limit");
  });

  it("returns the full hub when the caller raises the limit", async () => {
    const result = await related(52);
    expect(result.relationships).toHaveLength(52);
    expect(result.entities).toHaveLength(52);
    expect(result.truncated).toBe(false);
  });

  it("withholds an oversized serialized tool result at the MCP egress", () => {
    const buildTextResponse = (
      server as unknown as {
        buildTextResponse: (value: unknown) => { content: Array<{ text: string }> };
      }
    ).buildTextResponse.bind(server);
    const raw = buildTextResponse({ payload: "é".repeat(33_000) });
    const result = JSON.parse(raw.content[0].text) as {
      error: {
        error_code: string;
        details: { original_size_bytes: number; limit_bytes: number };
      };
      payload?: string;
    };
    expect(result.error.error_code).toBe("RESPONSE_TOO_LARGE");
    expect(result.error.details.original_size_bytes).toBeGreaterThan(65_536);
    expect(result.error.details.limit_bytes).toBe(65_536);
    expect(result.payload).toBeUndefined();
  });
});
