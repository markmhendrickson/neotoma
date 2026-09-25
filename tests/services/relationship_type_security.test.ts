import { NeotomaServer } from "../../src/server.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import { describe, it, expect, afterAll, afterEach, beforeEach, vi } from "vitest";
import { db } from "../../src/db.js";
import { RelationshipsService } from "../../src/services/relationships.js";
import {
  relationshipTypeRegistry,
  RELATIONSHIP_TYPE_REGISTRY_TABLE,
  getActiveRelationshipTypeNames,
  invalidateRelationshipTypeCache,
} from "../../src/services/relationship_types/registry.js";
import { enforceRelationshipTypeCapability } from "../../src/services/agent_capabilities.js";

const user = "00000000-0000-0000-0000-0000000a2502";
const service = new RelationshipsService();
// Relationship endpoints must be entities the caller owns; seed the ids the
// cases below link.
const ENDPOINT_IDS = [
  "ent_g25_cycle_a",
  "ent_g25_cycle_b",
  "ent_g25_depth_source",
  "ent_g25_depth_0",
  "ent_g25_read_a",
  "ent_g25_read_b",
  "ent_g25_stale_source",
  "ent_g25_stale_target",
  "ent_g25_corrupt_a",
  "ent_g25_corrupt_b",
];
beforeEach(async () => {
  await db.from("relationship_type_registry").delete().eq("user_id", user);
  await db.from("relationship_snapshots").delete().eq("user_id", user);
  await db.from("relationship_observations").delete().eq("user_id", user);
  await db.from("entities").delete().in("id", ENDPOINT_IDS);
  await db.from("entities").insert(
    ENDPOINT_IDS.map((id) => ({
      id,
      user_id: user,
      entity_type: "g25_test_node",
      canonical_name: id,
    }))
  );
});
afterAll(async () => {
  await db.from("entities").delete().in("id", ENDPOINT_IDS);
});
afterEach(() => {
  vi.restoreAllMocks();
  invalidateRelationshipTypeCache();
});

describe("relationship registry security regression", () => {
  it.each(["/create_relationship", "/store"])(
    "preserves structured refusal over HTTP %s",
    async (route) => {
      const port = process.env.NEOTOMA_SESSION_DEV_PORT || process.env.NEOTOMA_HTTP_PORT;
      const edge = {
        relationship_type: "G25_HTTP_UNKNOWN",
        source_entity_id: "ent_111111111111111111111111",
        target_entity_id: "ent_222222222222222222222222",
      };
      const body =
        route === "/store"
          ? {
              entities: [{ entity_type: "task", title: "g25-http-refusal", status: "open" }],
              relationships: [edge],
              idempotency_key: `g25-http-${process.pid}`,
            }
          : edge;
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error_code).toBe("unregistered_relationship_type");
      expect(data.details.hint).toMatch(/list_relationship_types/);
    }
  );
  it("MCP registration refuses absent admission and admits an explicit scoped grant", async () => {
    const server = new NeotomaServer();
    (server as any).authenticatedUserId = user;
    const write = () =>
      (server as any).registerRelationshipType({ relationship_type: "g25_granted" });
    await expect(write()).rejects.toMatchObject({ code: "capability_denied" });
    expect(await relationshipTypeRegistry.get("g25_granted", user)).toBeNull();
    await runWithRequestContext(
      {
        agentIdentity: { tier: "software", sub: "g25-test" } as any,
        aauthAdmission: {
          admitted: true,
          user_id: user,
          grant_id: "ent_g25_test_grant",
          agent_label: "g25-test",
          reason: "admitted",
          capabilities: [
            {
              op: "register_relationship_type",
              entity_types: [],
              relationship_types: ["g25_granted"],
            },
          ],
        },
      },
      write
    );
    expect(await relationshipTypeRegistry.get("g25_granted", user)).toMatchObject({
      scope: "user",
      created_by: user,
    });
  });
  it.each([null, { tier: "anonymous", admitted: false, capabilities: null, agentLabel: "test" }])(
    "refuses registration without an explicit grant: %j",
    (ctx) => {
      expect(() => enforceRelationshipTypeCapability("LEASE", "global", ctx as any)).toThrow(
        /not permitted/i
      );
    }
  );
  it("requires explicit global permission even for a wildcard type grant", () => {
    const ctx = {
      tier: "software",
      admitted: true,
      capabilities: [
        { op: "register_relationship_type", entity_types: [], relationship_types: ["*"] },
      ],
      agentLabel: "test",
    } as const;
    expect(() => enforceRelationshipTypeCapability("LEASE", "global", ctx as any)).toThrow();
    expect(() => enforceRelationshipTypeCapability("LEASE", "user", ctx as any)).not.toThrow();
  });
  it.each([false, undefined])("refuses weakening seeded acyclicity with %j", async (acyclic) => {
    await expect(
      relationshipTypeRegistry.register({ relationship_type: "PART_OF", user_id: user, acyclic })
    ).rejects.toThrow(/acyclic/i);
  });
  it("refuses cycles at the shared write sink before creating a source", async () => {
    const a = "ent_g25_cycle_a",
      b = "ent_g25_cycle_b";
    await service.createRelationship({
      relationship_type: "PART_OF",
      source_entity_id: a,
      target_entity_id: b,
      user_id: user,
    });
    await expect(
      service.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: b,
        target_entity_id: a,
        user_id: user,
      })
    ).rejects.toThrow(/cycle/i);
  });
  it("fails closed when traversal cannot finish within the work bound", async () => {
    vi.spyOn(service, "getRelationshipsByType").mockResolvedValue(
      Array.from({ length: 1001 }, (_, i) => ({
        source_entity_id: `ent_g25_depth_${i}`,
        target_entity_id: `ent_g25_depth_${i + 1}`,
      })) as any
    );
    await expect(
      service.createRelationship({
        relationship_type: "DEPENDS_ON",
        source_entity_id: "ent_g25_depth_source",
        target_entity_id: "ent_g25_depth_0",
        user_id: user,
      })
    ).rejects.toThrow(/limit|bound/i);
  });
  it("refuses a graph read failure instead of assuming an empty graph", async () => {
    vi.spyOn(service, "getRelationshipsByType").mockRejectedValue(new Error("graph unavailable"));
    await expect(
      service.createRelationship({
        relationship_type: "DEPENDS_ON",
        source_entity_id: "ent_g25_read_a",
        target_entity_id: "ent_g25_read_b",
        user_id: user,
      })
    ).rejects.toThrow(/graph unavailable/);
  });
  it("refuses a relationship write when the registry cannot refresh an expired cache", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const activeTypeNames = vi
      .spyOn(relationshipTypeRegistry, "activeTypeNames")
      .mockResolvedValueOnce(new Set(["G25_STALE_TYPE"]))
      .mockRejectedValueOnce(new Error("registry unavailable"));

    invalidateRelationshipTypeCache();
    await expect(getActiveRelationshipTypeNames(user)).resolves.toContain("G25_STALE_TYPE");

    now.mockReturnValue(6_001);
    await expect(
      service.createRelationship({
        relationship_type: "G25_STALE_TYPE",
        source_entity_id: "ent_g25_stale_source",
        target_entity_id: "ent_g25_stale_target",
        user_id: user,
      })
    ).rejects.toThrow(/registry unavailable/);
    expect(activeTypeNames).toHaveBeenCalledTimes(2);
  });
  it("fails closed on an unreadable definition instead of skipping the cycle check", async () => {
    // A definition that cannot be parsed as JSON must not be read as "no
    // definition, therefore not acyclic, therefore skip the DFS". The field
    // carries the safety meaning here (`acyclic`), so an unreadable value
    // must take the RESTRICTIVE branch (treated as acyclic => cycle-checked),
    // not the permissive one. Insert the corrupt row directly, bypassing
    // `register()`'s JSON.stringify, since that is the only way a malformed
    // `definition` column reaches this path in practice (a hand-edited row,
    // a partial write, a future migration).
    const relationshipType = "G25_CORRUPT_DEFINITION";
    await db.from(RELATIONSHIP_TYPE_REGISTRY_TABLE).insert({
      id: `reltype_${relationshipType}_user_${user}_corrupt`,
      relationship_type: relationshipType,
      registry_version: "corrupt",
      definition: "{not valid json",
      state: "active",
      created_at: new Date().toISOString(),
      created_by: user,
      user_id: user,
      scope: "user",
      metadata: "{}",
    });
    invalidateRelationshipTypeCache();

    const a = "ent_g25_corrupt_a",
      b = "ent_g25_corrupt_b";
    await service.createRelationship({
      relationship_type: relationshipType,
      source_entity_id: a,
      target_entity_id: b,
      user_id: user,
    });
    await expect(
      service.createRelationship({
        relationship_type: relationshipType,
        source_entity_id: b,
        target_entity_id: a,
        user_id: user,
      })
    ).rejects.toThrow(/cycle/i);
  });
});
