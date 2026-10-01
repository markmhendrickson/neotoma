/**
 * Relationship-write capability: every entrance, every surface (neotoma#2524,
 * PR #2525 review blockers 2 and 3).
 *
 * The first cut of the relationship_types scoping gated REST `/store` only.
 * Its siblings kept writing any edge an entity-type grant admitted:
 *
 *   - MCP `store` (`storeStructuredInternal`) — a second, independent store
 *     implementation whose relationship loop ran unconditionally.
 *   - REST and MCP `create_relationship` / `create_relationships`.
 *   - REST and MCP `delete_relationship` / `restore_relationship` (changing
 *     whether an edge is live is an edge write).
 *
 * Each case below drives the real surface — the Express app over HTTP, the
 * NeotomaServer tool methods for MCP — as an AAuth-admitted agent whose grant
 * admits only `REFERS_TO` between `checkpoint_brief` and `task`, and asserts
 * the EFFECT: an out-of-scope edge is refused and does not exist afterwards;
 * the in-scope checkpoint edge still lands on every surface.
 *
 * HTTP admission is injected by mocking the AAuth signature verifier and the
 * grant lookup (the pattern in mcp_connection_identity_gate_decision.test.ts),
 * so the request runs the real middleware chain, identity threading, route,
 * and service. MCP admission is injected with `runWithRequestContext`, the
 * pattern in aauth_mcp_capability_parity.test.ts.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const ADMIT_HEADER = "x-test-rel-cap-admit";
const PROBE_ADMIT_HEADER = "x-test-rel-cap-probe-admit";
const TEST_THUMBPRINT = "tp-rel-write-capability-surfaces";
const TEST_PROBE_THUMBPRINT = "tp-rel-write-capability-probe";
const RUN_REST_SURFACE = process.env.NEOTOMA_TEST_SKIP_REST_SURFACE !== "1";

vi.mock("../../src/middleware/aauth_verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/middleware/aauth_verify.js")>();
  return {
    ...original,
    aauthVerify: () => (req: Request, _res: Response, next: NextFunction) => {
      if (req.headers[ADMIT_HEADER] === "1" || req.headers[PROBE_ADMIT_HEADER] === "1") {
        const probe = req.headers[PROBE_ADMIT_HEADER] === "1";
        (req as Request & { aauth?: unknown }).aauth = {
          verified: true,
          publicKey: '{"kty":"EC"}',
          thumbprint: probe ? TEST_PROBE_THUMBPRINT : TEST_THUMBPRINT,
          algorithm: "ES256",
          sub: "dispatcher@swarm.test",
          iss: "https://swarm.test",
        };
      }
      next();
    },
  };
});

vi.mock("../../src/services/aauth_admission.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/aauth_admission.js")>();
  const { LOCAL_DEV_USER_ID: owner } = await import("../../src/services/local_auth.js");
  return {
    ...original,
    admitFromAAuthContext: async (ctx: { verified?: boolean; thumbprint?: string } | null) =>
      ctx?.verified
        ? {
            admitted: true,
            reason: "admitted",
            user_id: owner,
            grant_id: "ent_test_rel_cap_grant",
            agent_label: "relationship capability surfaces grant",
            capabilities:
              ctx.thumbprint === TEST_PROBE_THUMBPRINT
                ? PROBE_CAPABILITIES
                : CHECKPOINT_CAPABILITIES,
          }
        : { admitted: false, reason: "not_signed" },
  };
});

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { AgentCapabilityError } from "../../src/services/agent_capabilities.js";
import type { AgentCapabilityEntry } from "../../src/services/agent_capabilities.js";
import type { AgentIdentity } from "../../src/crypto/agent_identity.js";
import { softDeleteRelationship } from "../../src/services/deletion.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import type { AAuthAdmissionContext } from "../../src/services/protected_entity_types.js";
import { relationshipTypeRegistry } from "../../src/services/relationship_types/registry.js";
import { RelationshipsService } from "../../src/services/relationships.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

/**
 * The checkpoint grant from the review: store both types, and create only
 * `REFERS_TO` edges between them. `LEASE` is out of scope.
 */
const CHECKPOINT_CAPABILITIES: AgentCapabilityEntry[] = [
  { op: "store", entity_types: ["checkpoint_brief", "task"] },
  { op: "retrieve", entity_types: ["*"] },
  {
    op: "create_relationship",
    entity_types: ["checkpoint_brief", "task"],
    relationship_types: ["REFERS_TO"],
  },
];

const PROBE_TYPE = "rel_cap_autolink_probe";
const PROBE_CAPABILITIES: AgentCapabilityEntry[] = [
  { op: "store", entity_types: [PROBE_TYPE, "task"] },
  { op: "retrieve", entity_types: ["*"] },
  {
    op: "create_relationship",
    entity_types: [PROBE_TYPE, "task"],
    relationship_types: ["REFERS_TO"],
  },
];

const USER_ID = LOCAL_DEV_USER_ID;
const OUT_OF_SCOPE = "LEASE";
const IN_SCOPE = "REFERS_TO";

function entityId(): string {
  return `ent_${randomBytes(12).toString("hex")}`;
}

const createdEntityIds: string[] = [];

async function seedEntity(entityType: string): Promise<string> {
  const id = entityId();
  const { error } = await db.from("entities").insert({
    id,
    user_id: USER_ID,
    entity_type: entityType,
    canonical_name: `${entityType}-${id}`,
  });
  if (error) throw new Error(`seed ${entityType}: ${error.message}`);
  createdEntityIds.push(id);
  return id;
}

const createdSourceIds: string[] = [];

async function seedSource(): Promise<string> {
  const id = randomUUID();
  const { error } = await db.from("sources").insert({
    id,
    content_hash: `rel_cap_surfaces_${id}`,
    mime_type: "application/json",
    storage_url: `internal://test/${id}`,
    file_size: 0,
    user_id: USER_ID,
  });
  if (error) throw new Error(`seed source: ${error.message}`);
  createdSourceIds.push(id);
  return id;
}

async function edgeExists(type: string, source: string, target: string): Promise<boolean> {
  const key = `${type}:${source}:${target}`;
  const { data: observations } = await db
    .from("relationship_observations")
    .select("id")
    .eq("relationship_key", key)
    .eq("user_id", USER_ID);
  const { data: snapshots } = await db
    .from("relationship_snapshots")
    .select("relationship_key")
    .eq("relationship_key", key)
    .eq("user_id", USER_ID);
  return (observations?.length ?? 0) > 0 || (snapshots?.length ?? 0) > 0;
}

async function edgeIsLive(type: string, source: string, target: string): Promise<boolean> {
  const key = `${type}:${source}:${target}`;
  const { data } = await db
    .from("relationship_snapshots")
    .select("is_live")
    .eq("relationship_key", key)
    .eq("user_id", USER_ID)
    .maybeSingle();
  return data?.is_live === 1;
}

async function edgesOfTypeTo(type: string, target: string): Promise<number> {
  const { data } = await db
    .from("relationship_observations")
    .select("id")
    .eq("relationship_type", type)
    .eq("target_entity_id", target)
    .eq("user_id", USER_ID);
  return data?.length ?? 0;
}

function runAdmitted<T>(fn: () => Promise<T>): Promise<T> {
  return runWithAdmission(
    {
      admitted: true,
      reason: "admitted",
      user_id: USER_ID,
      grant_id: "ent_test_rel_cap_grant",
      agent_label: "relationship capability surfaces grant",
      capabilities: CHECKPOINT_CAPABILITIES,
    },
    fn
  );
}

function runWithAdmission<T>(
  aauthAdmission: AAuthAdmissionContext,
  fn: () => Promise<T>
): Promise<T> {
  const agentIdentity: AgentIdentity = {
    sub: "dispatcher@swarm.test",
    iss: "https://swarm.test",
    thumbprint: TEST_THUMBPRINT,
    algorithm: "ES256",
    publicKey: '{"kty":"EC"}',
    tier: "software",
  };
  return runWithRequestContext({ agentIdentity, attributionDecision: null, aauthAdmission }, fn);
}

type ToolResult = { content: Array<{ text: string }> };
function tool(server: NeotomaServer, name: string) {
  return (args: Record<string, unknown>): Promise<ToolResult> =>
    (server as unknown as Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>)[
      name
    ].call(server, args);
}

async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("relationship-write capability: every entrance, every surface", () => {
  let httpServer: Server | undefined;
  let baseUrl: string;
  let mcp: NeotomaServer;
  let checkpointId: string;
  let taskId: string;
  let issueId: string;

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", [ADMIT_HEADER]: "1" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  }

  async function postAsProbe(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", [PROBE_ADMIT_HEADER]: "1" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  }

  beforeAll(async () => {
    // The out-of-scope type must be REGISTERED, so the only thing that can
    // refuse it is the capability gate, not the closed vocabulary.
    if (!(await relationshipTypeRegistry.get(OUT_OF_SCOPE, USER_ID))) {
      await relationshipTypeRegistry.register({
        relationship_type: OUT_OF_SCOPE,
        user_id: USER_ID,
      });
    }

    if (RUN_REST_SURFACE) {
      httpServer = createServer(app);
      await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", () => resolve()));
      const address = httpServer.address();
      if (!address || typeof address === "string") throw new Error("expected TCP address");
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    mcp = new NeotomaServer();
    (mcp as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
  });

  afterAll(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
    if (createdEntityIds.length > 0) {
      await db.from("relationship_observations").delete().in("source_entity_id", createdEntityIds);
      await db.from("relationship_observations").delete().in("target_entity_id", createdEntityIds);
      await db.from("relationship_snapshots").delete().in("source_entity_id", createdEntityIds);
      await db.from("relationship_snapshots").delete().in("target_entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
    }
    if (createdSourceIds.length > 0) {
      await db.from("sources").delete().in("id", createdSourceIds);
    }
  });

  beforeEach(async () => {
    checkpointId = await seedEntity("checkpoint_brief");
    taskId = await seedEntity("task");
    issueId = await seedEntity("issue");
  });

  // ---------------------------------------------------------------- MCP store
  describe("MCP store (blocker 3)", () => {
    it("refuses an out-of-scope LEASE edge and writes neither the edge nor the entity", async () => {
      const marker = `rel-cap-mcp-store-lease-${randomUUID()}`;
      const error = await capture(() =>
        runAdmitted(() =>
          tool(
            mcp,
            "store"
          )({
            user_id: USER_ID,
            idempotency_key: marker,
            entities: [{ entity_type: "checkpoint_brief", title: marker }],
            relationships: [
              { relationship_type: OUT_OF_SCOPE, source_index: 0, target_entity_id: taskId },
            ],
          })
        )
      );
      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await edgesOfTypeTo(OUT_OF_SCOPE, taskId)).toBe(0);
      const { data: written } = await db
        .from("entities")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("canonical_name", marker);
      expect(written ?? []).toHaveLength(0);
    });

    it("refuses an out-of-scope LEASE edge between two existing entities", async () => {
      const error = await capture(() =>
        runAdmitted(() =>
          tool(
            mcp,
            "store"
          )({
            user_id: USER_ID,
            idempotency_key: `rel-cap-mcp-store-lease-ids-${randomUUID()}`,
            entities: [{ entity_type: "task", title: "carrier" }],
            relationships: [
              {
                relationship_type: OUT_OF_SCOPE,
                source_entity_id: checkpointId,
                target_entity_id: taskId,
              },
            ],
          })
        )
      );
      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
    });

    it("still admits the in-scope checkpoint_brief REFERS_TO task edge", async () => {
      const marker = `rel-cap-mcp-store-refers-${randomUUID()}`;
      const result = await runAdmitted(() =>
        tool(
          mcp,
          "store"
        )({
          user_id: USER_ID,
          idempotency_key: marker,
          entities: [{ entity_type: "checkpoint_brief", title: marker }],
          relationships: [
            { relationship_type: IN_SCOPE, source_index: 0, target_entity_id: taskId },
          ],
        })
      );
      const body = JSON.parse(result.content[0].text) as {
        entities?: Array<{ entity_id: string }>;
      };
      const storedId = body.entities?.[0]?.entity_id;
      expect(storedId).toBeTruthy();
      createdEntityIds.push(storedId!);
      expect(await edgeExists(IN_SCOPE, storedId!, taskId)).toBe(true);
    });
  });

  // ----------------------------------------------- MCP standalone relationship tools
  describe("MCP relationship lifecycle tools (blocker 2)", () => {
    it("create_relationship refuses LEASE and the edge does not exist", async () => {
      const error = await capture(() =>
        runAdmitted(() =>
          tool(
            mcp,
            "createRelationship"
          )({
            relationship_type: OUT_OF_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: taskId,
          })
        )
      );
      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
    });

    it("create_relationship refuses REFERS_TO to an endpoint type outside the grant", async () => {
      const error = await capture(() =>
        runAdmitted(() =>
          tool(
            mcp,
            "createRelationship"
          )({
            relationship_type: IN_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: issueId,
          })
        )
      );
      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await edgeExists(IN_SCOPE, checkpointId, issueId)).toBe(false);
    });

    it("create_relationships refuses the LEASE item and writes no edge", async () => {
      const result = await runAdmitted(() =>
        tool(
          mcp,
          "createRelationships"
        )({
          relationships: [
            {
              relationship_type: OUT_OF_SCOPE,
              source_entity_id: checkpointId,
              target_entity_id: taskId,
            },
          ],
        })
      );
      const body = JSON.parse(result.content[0].text) as {
        created_count: number;
        error_count: number;
        errors: Array<{ error: string }>;
      };
      expect(body.created_count).toBe(0);
      expect(body.error_count).toBe(1);
      expect(body.errors[0].error).toMatch(/create_relationship/);
      expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
    });

    it("create_relationship and create_relationships admit the in-scope REFERS_TO edge", async () => {
      await runAdmitted(() =>
        tool(
          mcp,
          "createRelationship"
        )({
          relationship_type: IN_SCOPE,
          source_entity_id: checkpointId,
          target_entity_id: taskId,
        })
      );
      expect(await edgeExists(IN_SCOPE, checkpointId, taskId)).toBe(true);

      const secondTask = await seedEntity("task");
      const result = await runAdmitted(() =>
        tool(
          mcp,
          "createRelationships"
        )({
          relationships: [
            {
              relationship_type: IN_SCOPE,
              source_entity_id: checkpointId,
              target_entity_id: secondTask,
            },
          ],
        })
      );
      const body = JSON.parse(result.content[0].text) as { created_count: number };
      expect(body.created_count).toBe(1);
      expect(await edgeExists(IN_SCOPE, checkpointId, secondTask)).toBe(true);
    });

    it("delete_relationship refuses tombstoning an out-of-scope LEASE edge", async () => {
      const service = new RelationshipsService();
      await service.createRelationship({
        relationship_type: OUT_OF_SCOPE as never,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
        user_id: USER_ID,
      });

      const error = await capture(() =>
        runAdmitted(() =>
          tool(
            mcp,
            "deleteRelationship"
          )({
            relationship_type: OUT_OF_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: taskId,
          })
        )
      );
      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await edgeIsLive(OUT_OF_SCOPE, checkpointId, taskId)).toBe(true);
    });

    it("delete_relationship still tombstones an in-scope REFERS_TO edge", async () => {
      const service = new RelationshipsService();
      await service.createRelationship({
        relationship_type: IN_SCOPE as never,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
        user_id: USER_ID,
      });

      await runAdmitted(() =>
        tool(
          mcp,
          "deleteRelationship"
        )({
          relationship_type: IN_SCOPE,
          source_entity_id: checkpointId,
          target_entity_id: taskId,
        })
      );
      expect(await edgeIsLive(IN_SCOPE, checkpointId, taskId)).toBe(false);
    });

    it("restore_relationship refuses reviving an out-of-scope LEASE edge", async () => {
      // Owner (no agent context) writes and soft-deletes the LEASE edge.
      const service = new RelationshipsService();
      await service.createRelationship({
        relationship_type: OUT_OF_SCOPE as never,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
        user_id: USER_ID,
      });
      const key = `${OUT_OF_SCOPE}:${checkpointId}:${taskId}`;
      await softDeleteRelationship(key, OUT_OF_SCOPE, checkpointId, taskId, USER_ID);

      const error = await capture(() =>
        runAdmitted(() =>
          tool(
            mcp,
            "restoreRelationship"
          )({
            relationship_type: OUT_OF_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: taskId,
          })
        )
      );
      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      const { data: restorations } = await db
        .from("relationship_observations")
        .select("id")
        .eq("relationship_key", key)
        .eq("user_id", USER_ID)
        .eq("source_priority", 1001);
      expect(restorations ?? []).toHaveLength(0);
    });
  });

  // ------------------------------------------------ MCP create_interpretation
  describe("MCP create_interpretation", () => {
    it("refuses the LEASE edge (reported refused) and admits REFERS_TO", async () => {
      const sourceId = await seedSource();
      const result = await runAdmitted(() =>
        tool(
          mcp,
          "createInterpretation"
        )({
          source_id: sourceId,
          entities: [{ entity_type: "task", title: `interp-mcp-${randomUUID()}` }],
          relationships: [
            {
              relationship_type: OUT_OF_SCOPE,
              source_entity_id: checkpointId,
              target_entity_id: taskId,
            },
            {
              relationship_type: IN_SCOPE,
              source_entity_id: checkpointId,
              target_entity_id: taskId,
            },
          ],
        })
      );
      const body = JSON.parse(result.content[0].text) as {
        relationships_refused?: Array<{ relationship_type: string }>;
      };
      expect(body.relationships_refused?.map((r) => r.relationship_type)).toEqual([OUT_OF_SCOPE]);
      expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
      expect(await edgeExists(IN_SCOPE, checkpointId, taskId)).toBe(true);
    });
  });

  // ------------------------------------------------------------------- REST
  describe.skipIf(!RUN_REST_SURFACE)("REST (blockers 2 and 3 on the HTTP surface)", () => {
    it("POST /store refuses a LEASE edge with 403 and writes no edge", async () => {
      const res = await post("/store", {
        idempotency_key: `rel-cap-rest-store-lease-${randomUUID()}`,
        entities: [{ entity_type: "checkpoint_brief", title: "rest lease" }],
        relationships: [
          { relationship_type: OUT_OF_SCOPE, source_index: 0, target_entity_id: taskId },
        ],
      });
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await edgesOfTypeTo(OUT_OF_SCOPE, taskId)).toBe(0);
    });

    it("POST /store admits the in-scope REFERS_TO edge", async () => {
      const res = await post("/store", {
        idempotency_key: `rel-cap-rest-store-refers-${randomUUID()}`,
        entities: [{ entity_type: "checkpoint_brief", title: "rest refers" }],
        relationships: [{ relationship_type: IN_SCOPE, source_index: 0, target_entity_id: taskId }],
      });
      expect(res.status).toBe(200);
      const storedId = (res.body.entities as Array<{ entity_id: string }>)[0].entity_id;
      createdEntityIds.push(storedId);
      expect(await edgeExists(IN_SCOPE, storedId, taskId)).toBe(true);
    });

    it("POST /create_relationship refuses LEASE with 403 and the edge does not exist", async () => {
      const res = await post("/create_relationship", {
        relationship_type: OUT_OF_SCOPE,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
      });
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
    });

    it("POST /create_relationships refuses the LEASE item and writes no edge", async () => {
      const res = await post("/create_relationships", {
        relationships: [
          {
            relationship_type: OUT_OF_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: taskId,
          },
        ],
      });
      expect(res.body.created_count).toBe(0);
      expect(res.body.error_count).toBe(1);
      expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
    });

    it("POST /create_relationship and /create_relationships admit the in-scope REFERS_TO edge", async () => {
      const single = await post("/create_relationship", {
        relationship_type: IN_SCOPE,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
      });
      expect(single.status).toBe(200);
      expect(await edgeExists(IN_SCOPE, checkpointId, taskId)).toBe(true);

      const secondTask = await seedEntity("task");
      const batch = await post("/create_relationships", {
        relationships: [
          {
            relationship_type: IN_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: secondTask,
          },
        ],
      });
      expect(batch.status).toBe(200);
      expect(batch.body.created_count).toBe(1);
      expect(await edgeExists(IN_SCOPE, checkpointId, secondTask)).toBe(true);
    });

    it("POST /delete_relationship refuses tombstoning a LEASE edge with 403", async () => {
      const service = new RelationshipsService();
      await service.createRelationship({
        relationship_type: OUT_OF_SCOPE as never,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
        user_id: USER_ID,
      });

      const res = await post("/delete_relationship", {
        relationship_type: OUT_OF_SCOPE,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
      });
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await edgeIsLive(OUT_OF_SCOPE, checkpointId, taskId)).toBe(true);
    });

    it("POST /delete_relationship still tombstones an in-scope REFERS_TO edge", async () => {
      const service = new RelationshipsService();
      await service.createRelationship({
        relationship_type: IN_SCOPE as never,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
        user_id: USER_ID,
      });

      const res = await post("/delete_relationship", {
        relationship_type: IN_SCOPE,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
      });
      expect(res.status).toBe(200);
      expect(await edgeIsLive(IN_SCOPE, checkpointId, taskId)).toBe(false);
    });

    it("POST /restore_relationship refuses reviving a LEASE edge with 403", async () => {
      const service = new RelationshipsService();
      await service.createRelationship({
        relationship_type: OUT_OF_SCOPE as never,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
        user_id: USER_ID,
      });
      const key = `${OUT_OF_SCOPE}:${checkpointId}:${taskId}`;
      await softDeleteRelationship(key, OUT_OF_SCOPE, checkpointId, taskId, USER_ID);

      const res = await post("/restore_relationship", {
        relationship_type: OUT_OF_SCOPE,
        source_entity_id: checkpointId,
        target_entity_id: taskId,
      });
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
    });

    it("POST /interpretations/create refuses the LEASE edge (reported refused) and admits REFERS_TO", async () => {
      const sourceId = await seedSource();
      const res = await post("/interpretations/create", {
        source_id: sourceId,
        entities: [{ entity_type: "task", title: `interp-rest-${randomUUID()}` }],
        relationships: [
          {
            relationship_type: OUT_OF_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: taskId,
          },
          {
            relationship_type: IN_SCOPE,
            source_entity_id: checkpointId,
            target_entity_id: taskId,
          },
        ],
      });
      expect(res.status).toBe(200);
      const refused = (res.body.relationships_refused ?? []) as Array<{
        relationship_type: string;
      }>;
      expect(refused.map((r) => r.relationship_type)).toEqual([OUT_OF_SCOPE]);
      expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
      expect(await edgeExists(IN_SCOPE, checkpointId, taskId)).toBe(true);
    });
  });
  // --------------------------------------------- deny ceiling is not a guest
  describe("a signer whose grant is revoked or suspended", () => {
    it.each(["grant_revoked", "grant_suspended"] as const)(
      "is refused on MCP create_relationship (%s) and the edge does not exist",
      async (reason) => {
        const error = await capture(() =>
          runWithAdmission({ admitted: false, reason }, () =>
            tool(
              mcp,
              "createRelationship"
            )({
              relationship_type: OUT_OF_SCOPE,
              source_entity_id: checkpointId,
              target_entity_id: taskId,
            })
          )
        );
        expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
          AgentCapabilityError
        );
        expect(await edgeExists(OUT_OF_SCOPE, checkpointId, taskId)).toBe(false);
      }
    );

    it("is refused on MCP create_relationships and no edge is written", async () => {
      const result = await runWithAdmission({ admitted: false, reason: "grant_revoked" }, () =>
        tool(
          mcp,
          "createRelationships"
        )({
          relationships: [
            {
              relationship_type: IN_SCOPE,
              source_entity_id: checkpointId,
              target_entity_id: taskId,
            },
          ],
        })
      );
      const body = JSON.parse(result.content[0].text) as { created_count?: number };
      expect(body.created_count ?? 0).toBe(0);
      expect(await edgeExists(IN_SCOPE, checkpointId, taskId)).toBe(false);
    });
  });

  // ------------------------------------- schema-chosen edge types are gated
  describe("edges whose type a registered schema chooses", () => {
    beforeAll(async () => {
      if (!(await schemaRegistry.loadActiveSchema(PROBE_TYPE, USER_ID))) {
        await schemaRegistry.register({
          entity_type: PROBE_TYPE,
          schema_version: "1.0",
          schema_definition: {
            fields: {
              title: { type: "string", required: false },
              lease_task: { type: "string", required: false },
              ref_task: { type: "string", required: false },
            },
            canonical_name_fields: ["title"],
            reference_fields: [
              { field: "lease_task", target_entity_type: "task", relationship_type: OUT_OF_SCOPE },
              { field: "ref_task", target_entity_type: "task", relationship_type: IN_SCOPE },
            ],
          },
          reducer_config: { merge_policies: {} },
          user_id: USER_ID,
          user_specific: true,
          activate: true,
        });
      }
    });

    const probeAdmission: AAuthAdmissionContext = {
      admitted: true,
      reason: "admitted",
      user_id: USER_ID,
      grant_id: "ent_test_rel_cap_probe_grant",
      agent_label: "relationship capability probe grant",
      capabilities: PROBE_CAPABILITIES,
    };

    const entityIdOf = (result: ToolResult): string => {
      const body = JSON.parse(result.content[0].text) as {
        entities?: Array<{ entity_id?: string }>;
      };
      const id = body.entities?.[0]?.entity_id;
      if (!id) throw new Error(`store returned no entity id: ${result.content[0].text}`);
      createdEntityIds.push(id);
      return id;
    };

    async function canonicalNameOf(id: string): Promise<string> {
      const { data } = await db
        .from("entity_snapshots")
        .select("canonical_name")
        .eq("entity_id", id)
        .single();
      const canonicalName = (data as { canonical_name?: string } | null)?.canonical_name;
      if (!canonicalName) throw new Error(`entity ${id} has no canonical_name`);
      return canonicalName;
    }

    async function seedOwnerAutoLink(field: "lease_task" | "ref_task"): Promise<{
      probeId: string;
      probeTitle: string;
      targetId: string;
    }> {
      const targetId = entityIdOf(
        await tool(
          mcp,
          "store"
        )({
          user_id: USER_ID,
          idempotency_key: `rel-cap-autolink-retract-target-${randomUUID()}`,
          entities: [{ entity_type: "task", title: `retraction target ${randomUUID()}` }],
        })
      );
      const targetName = await canonicalNameOf(targetId);
      const probeTitle = `retraction probe ${randomUUID()}`;
      const probeId = entityIdOf(
        await tool(
          mcp,
          "store"
        )({
          user_id: USER_ID,
          idempotency_key: `rel-cap-autolink-retract-probe-${randomUUID()}`,
          entities: [{ entity_type: PROBE_TYPE, title: probeTitle, [field]: targetName }],
        })
      );
      const relationshipType = field === "lease_task" ? OUT_OF_SCOPE : IN_SCOPE;
      expect(await edgeIsLive(relationshipType, probeId, targetId)).toBe(true);
      return { probeId, probeTitle, targetId };
    }

    function warningCodes(body: Record<string, unknown>): string[] {
      return ((body.store_warnings ?? []) as Array<{ code?: string }>)
        .map((warning) => warning.code)
        .filter((code): code is string => typeof code === "string");
    }

    it("MCP store refuses an out-of-grant schema auto-link retraction and leaves the edge live", async () => {
      const seeded = await seedOwnerAutoLink("lease_task");
      const result = await runWithAdmission(probeAdmission, () =>
        tool(
          mcp,
          "store"
        )({
          user_id: USER_ID,
          idempotency_key: `rel-cap-autolink-retract-mcp-denied-${randomUUID()}`,
          entities: [
            {
              entity_type: PROBE_TYPE,
              title: seeded.probeTitle,
              lease_task: `unresolved-${randomUUID()}`,
            },
          ],
        })
      );
      const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

      expect(warningCodes(body)).toContain("AUTO_LINK_RETRACTION_FAILED");
      expect(await edgeIsLive(OUT_OF_SCOPE, seeded.probeId, seeded.targetId)).toBe(true);
    });

    it("MCP store permits an in-grant schema auto-link retraction", async () => {
      const seeded = await seedOwnerAutoLink("ref_task");
      const result = await runWithAdmission(probeAdmission, () =>
        tool(
          mcp,
          "store"
        )({
          user_id: USER_ID,
          idempotency_key: `rel-cap-autolink-retract-mcp-allowed-${randomUUID()}`,
          entities: [
            {
              entity_type: PROBE_TYPE,
              title: seeded.probeTitle,
              ref_task: `unresolved-${randomUUID()}`,
            },
          ],
        })
      );
      const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

      expect(warningCodes(body)).toContain("AUTO_LINK_EDGE_RETRACTED");
      expect(await edgeIsLive(IN_SCOPE, seeded.probeId, seeded.targetId)).toBe(false);
    });

    describe.skipIf(!RUN_REST_SURFACE)("REST store schema auto-link retraction", () => {
      it("refuses an out-of-grant retraction and leaves the edge live", async () => {
        const seeded = await seedOwnerAutoLink("lease_task");
        const res = await postAsProbe("/store", {
          idempotency_key: `rel-cap-autolink-retract-rest-denied-${randomUUID()}`,
          entities: [
            {
              entity_type: PROBE_TYPE,
              title: seeded.probeTitle,
              lease_task: `unresolved-${randomUUID()}`,
            },
          ],
        });

        expect(res.status).toBe(200);
        expect(warningCodes(res.body)).toContain("AUTO_LINK_RETRACTION_FAILED");
        expect(await edgeIsLive(OUT_OF_SCOPE, seeded.probeId, seeded.targetId)).toBe(true);
      });

      it("permits an in-grant retraction", async () => {
        const seeded = await seedOwnerAutoLink("ref_task");
        const res = await postAsProbe("/store", {
          idempotency_key: `rel-cap-autolink-retract-rest-allowed-${randomUUID()}`,
          entities: [
            {
              entity_type: PROBE_TYPE,
              title: seeded.probeTitle,
              ref_task: `unresolved-${randomUUID()}`,
            },
          ],
        });

        expect(res.status).toBe(200);
        expect(warningCodes(res.body)).toContain("AUTO_LINK_EDGE_RETRACTED");
        expect(await edgeIsLive(IN_SCOPE, seeded.probeId, seeded.targetId)).toBe(false);
      });
    });

    it("refuses the out-of-grant auto-link, keeps the in-grant one, and the store succeeds", async () => {
      const storeAs = (args: Record<string, unknown>) =>
        runWithAdmission(probeAdmission, () => tool(mcp, "store")(args));

      const targetTaskId = entityIdOf(
        await storeAs({
          user_id: USER_ID,
          idempotency_key: `rel-cap-autolink-target-${randomUUID()}`,
          entities: [{ entity_type: "task", title: `autolink target ${randomUUID()}` }],
        })
      );
      const { data: targetSnapshot } = await db
        .from("entity_snapshots")
        .select("canonical_name")
        .eq("entity_id", targetTaskId)
        .single();
      const targetName = (targetSnapshot as { canonical_name?: string } | null)?.canonical_name;
      expect(targetName, "target task has a canonical_name").toBeTruthy();

      const probeId = entityIdOf(
        await storeAs({
          user_id: USER_ID,
          idempotency_key: `rel-cap-autolink-probe-${randomUUID()}`,
          entities: [
            {
              entity_type: PROBE_TYPE,
              title: `probe ${randomUUID()}`,
              lease_task: targetName,
              ref_task: targetName,
            },
          ],
        })
      );

      expect(await edgeExists(OUT_OF_SCOPE, probeId, targetTaskId)).toBe(false);
      expect(await edgeExists(IN_SCOPE, probeId, targetTaskId)).toBe(true);
    });
  });
});
