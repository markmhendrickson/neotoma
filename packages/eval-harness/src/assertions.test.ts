/**
 * Unit coverage for eval-harness relationship endpoint-type filtering (#2418).
 * Run: npx vitest run packages/eval-harness/src/assertions.test.ts
 * (not in default vitest include; scenarios are the CI gate).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { filterRelationshipsByEndpointTypes, type AssertionContext } from "./assertions.js";
import { createHostToolRegistry } from "./host_tools.js";

function makeCtx(): AssertionContext {
  return {
    baseUrl: "http://localhost:9",
    stats: null,
    hostToolRegistry: createHostToolRegistry([]),
    effectiveProfile: "full",
    scenarioId: "build_landing_page_eight_stage_happy_path",
  };
}

describe("filterRelationshipsByEndpointTypes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters by source_entity_type / target_entity_type on the relationship row", async () => {
    const rels = [
      {
        relationship_type: "PART_OF",
        source_entity_id: "ent_a",
        target_entity_id: "ent_plan",
        source_entity_type: "target_persona",
        target_entity_type: "plan",
      },
      {
        relationship_type: "PART_OF",
        source_entity_id: "ent_msg",
        target_entity_id: "ent_conv",
        source_entity_type: "conversation_message",
        target_entity_type: "conversation",
      },
    ];
    const filtered = await filterRelationshipsByEndpointTypes(
      makeCtx(),
      rels,
      "target_persona",
      "plan"
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].source_entity_id).toBe("ent_a");
  });

  it("resolves missing endpoint types via entity fetch fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        if (String(url).includes("/entities/query") && init?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              entities: [
                { entity_id: "ent_cta", entity_type: "cta" },
                { entity_id: "ent_persona", entity_type: "target_persona" },
              ],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      })
    );
    const rels = [
      {
        relationship_type: "REFERS_TO",
        source_entity_id: "ent_cta",
        target_entity_id: "ent_persona",
      },
    ];
    const filtered = await filterRelationshipsByEndpointTypes(
      makeCtx(),
      rels,
      "cta",
      "target_persona"
    );
    expect(filtered).toHaveLength(1);
  });

  it("returns all relationships when no endpoint types are requested", async () => {
    const rels = [{ source_entity_id: "a", target_entity_id: "b" }];
    const filtered = await filterRelationshipsByEndpointTypes(makeCtx(), rels);
    expect(filtered).toEqual(rels);
  });
});
