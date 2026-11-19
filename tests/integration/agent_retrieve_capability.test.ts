/**
 * The `retrieve` capability of an admitted agent grant on entity reads
 * (round 1: entity query, entity detail and its sub-reads, snapshot,
 * observations, field provenance, identifier lookup), REST and MCP.
 *
 * Opt-in: enforced only when NEOTOMA_ENFORCE_AGENT_RETRIEVE=1. Agent
 * admission is injected by mocking the AAuth signature verifier and the grant
 * lookup (the pattern in entity_mutation_capability_coverage.test.ts), so each
 * REST request runs the real middleware chain, route and service, and each MCP
 * case runs the real NeotomaServer tool method inside a request context.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const GRANT_HEADER = "x-test-retrieve-cap-grant";
const THUMBPRINT_PREFIX = "tp-retrieve-cap-";
const SETTING = "NEOTOMA_ENFORCE_AGENT_RETRIEVE";

const GRANTS = vi.hoisted(
  (): Record<string, Array<{ op: string; entity_types: string[] }>> => ({
    "retrieve-task": [
      { op: "store", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["task"] },
    ],
    "no-retrieve": [{ op: "store", entity_types: ["*"] }],
    "retrieve-star": [{ op: "retrieve", entity_types: ["*"] }],
    "retrieve-empty": [{ op: "retrieve", entity_types: [] }],
  })
);

vi.mock("../../src/middleware/aauth_verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/middleware/aauth_verify.js")>();
  return {
    ...original,
    aauthVerify: () => (req: Request, _res: Response, next: NextFunction) => {
      const grant = req.headers[GRANT_HEADER];
      if (typeof grant === "string") {
        (req as Request & { aauth?: unknown }).aauth = {
          verified: true,
          publicKey: '{"kty":"EC"}',
          thumbprint: `${THUMBPRINT_PREFIX}${grant}`,
          algorithm: "ES256",
          sub: "reader@swarm.test",
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
    admitFromAAuthContext: async (ctx: { verified?: boolean; thumbprint?: string } | null) => {
      if (!ctx?.verified) return { admitted: false, reason: "not_signed" };
      const key = (ctx.thumbprint ?? "").slice(THUMBPRINT_PREFIX.length);
      const capabilities = GRANTS[key];
      if (!capabilities) return { admitted: false, reason: "no_match" };
      return {
        admitted: true,
        reason: "admitted",
        user_id: owner,
        grant_id: `ent_test_retrieve_cap_${key}`,
        agent_label: `retrieve capability ${key}`,
        capabilities,
      };
    },
  };
});

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import {
  AgentCapabilityError,
  enforceAgentRetrieveScope,
  type AgentCapabilityContext,
  type AgentCapabilityEntry,
} from "../../src/services/agent_capabilities.js";
import type { AgentIdentity } from "../../src/crypto/agent_identity.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { runWithRequestContext } from "../../src/services/request_context.js";

const USER_ID = LOCAL_DEV_USER_ID;
const createdEntityIds: string[] = [];

type ToolResult = { content: Array<{ text: string }> };

function runAsGrant<T>(grant: string, fn: () => Promise<T>): Promise<T> {
  const agentIdentity: AgentIdentity = {
    sub: "reader@swarm.test",
    iss: "https://swarm.test",
    thumbprint: `${THUMBPRINT_PREFIX}${grant}`,
    algorithm: "ES256",
    publicKey: '{"kty":"EC"}',
    tier: "software",
  };
  return runWithRequestContext(
    {
      agentIdentity,
      attributionDecision: null,
      aauthAdmission: {
        admitted: true,
        reason: "admitted",
        user_id: USER_ID,
        grant_id: `ent_test_retrieve_cap_${grant}`,
        agent_label: `retrieve capability ${grant}`,
        capabilities: GRANTS[grant] as AgentCapabilityEntry[],
      },
    },
    fn
  );
}

describe("agent grant retrieve capability on entity reads", () => {
  let httpServer: Server;
  let baseUrl: string;
  let mcp: NeotomaServer;
  let taskId: string;
  let contactId: string;
  let previousSetting: string | undefined;

  async function request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    grant?: string
  ) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(grant ? { [GRANT_HEADER]: grant } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
  const get = (path: string, grant?: string) => request("GET", path, undefined, grant);
  const post = (path: string, body: Record<string, unknown>, grant?: string) =>
    request("POST", path, body, grant);

  function tool(name: string, args: Record<string, unknown>, grant?: string): Promise<ToolResult> {
    const call = () =>
      (mcp as unknown as Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>)[
        name
      ].call(mcp, args);
    return grant ? runAsGrant(grant, call) : call();
  }

  async function capture(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      await fn();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  function expectDenied(error: unknown, entityType?: string): void {
    expect(error).toBeInstanceOf(AgentCapabilityError);
    expect((error as AgentCapabilityError).op).toBe("retrieve");
    if (entityType) expect((error as AgentCapabilityError).entityType).toBe(entityType);
  }

  function expectRest403(res: { status: number; body: Record<string, unknown> }, type?: string) {
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("capability_denied");
    const details = res.body.details as Record<string, unknown>;
    expect(details.op).toBe("retrieve");
    if (type) expect(details.entity_type).toBe(type);
  }

  async function seed(entity: Record<string, unknown>): Promise<string> {
    const res = await post("/store", {
      idempotency_key: `retrcap-seed-${randomUUID()}`,
      entities: [entity],
    });
    expect(res.status).toBe(200);
    const id = (res.body.entities as Array<{ entity_id: string }>)[0].entity_id;
    createdEntityIds.push(id);
    return id;
  }

  beforeAll(async () => {
    previousSetting = process.env[SETTING];
    delete process.env[SETTING];
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    baseUrl = `http://127.0.0.1:${address.port}`;
    mcp = new NeotomaServer();
    (mcp as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
    const tag = randomBytes(5).toString("hex");
    taskId = await seed({ entity_type: "task", title: `retrcap-task-${tag}` });
    contactId = await seed({ entity_type: "contact", name: `retrcap-contact-${tag}` });
  });

  afterAll(async () => {
    if (previousSetting === undefined) delete process.env[SETTING];
    else process.env[SETTING] = previousSetting;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    for (const id of createdEntityIds) {
      for (const t of ["raw_fragments", "timeline_events", "entity_snapshots", "observations"]) {
        await db.from(t).delete().eq("entity_id", id);
      }
      await db.from("entities").delete().eq("id", id);
    }
  });

  describe("setting on", () => {
    beforeEach(() => {
      process.env[SETTING] = "1";
    });
    afterEach(() => {
      delete process.env[SETTING];
    });

    describe("grant with retrieve for task only", () => {
      const G = "retrieve-task";

      it("REST reads of the allowed type succeed on every per-entity entry point", async () => {
        expect((await get(`/entities/${taskId}`, G)).status).toBe(200);
        expect((await get(`/entities/${taskId}/markdown`, G)).status).toBe(200);
        expect((await get(`/entities/${taskId}/observations`, G)).status).toBe(200);
        expect((await post("/get_entity_snapshot", { entity_id: taskId }, G)).status).toBe(200);
        expect((await post("/list_observations", { entity_id: taskId }, G)).status).toBe(200);
        const byId = await post("/retrieve_entity_by_identifier", { identifier: taskId }, G);
        expect(byId.status).toBe(200);
        expect((byId.body.entities as unknown[]).length).toBe(1);
        const typed = await post("/entities/query", { entity_type: "task" }, G);
        expect(typed.status).toBe(200);
        expect(typed.body.narrowed_by_capability).toBeUndefined();
      });

      it("REST refuses another type with 403 on every per-entity entry point", async () => {
        expectRest403(await get(`/entities/${contactId}`, G), "contact");
        expectRest403(await get(`/entities/${contactId}/markdown`, G), "contact");
        expectRest403(await get(`/entities/${contactId}/observations`, G), "contact");
        expectRest403(await post("/get_entity_snapshot", { entity_id: contactId }, G), "contact");
        expectRest403(await post("/list_observations", { entity_id: contactId }, G), "contact");
        expectRest403(
          await post("/get_field_provenance", { entity_id: contactId, field: "name" }, G),
          "contact"
        );
        expectRest403(
          await post("/retrieve_entity_by_identifier", { identifier: contactId }, G),
          "contact"
        );
        expectRest403(
          await post(
            "/retrieve_entity_by_identifier",
            { identifier: "anything", entity_type: "contact" },
            G
          ),
          "contact"
        );
        expectRest403(await get(`/observations?entity_id=${contactId}`, G), "contact");
        expectRest403(
          await post("/observations/query", { entity_type: "contact", limit: 5, offset: 0 }, G),
          "contact"
        );
      });

      it("REST refuses a typed query when any requested type is outside the grant", async () => {
        expectRest403(await post("/entities/query", { entity_type: "contact" }, G), "contact");
        expectRest403(
          await post("/entities/query", { entity_types: ["task", "contact"] }, G),
          "contact"
        );
        expectRest403(await get("/entities?entity_type=contact", G), "contact");
      });

      it("REST narrows an untyped query to the allowed type with a consistent total", async () => {
        const owner = await post("/entities/query", { entity_type: "task", limit: 1000 });
        expect(owner.status).toBe(200);
        const res = await post("/entities/query", { limit: 1000 }, G);
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBe(true);
        const rows = res.body.entities as Array<{ entity_id: string; entity_type: string }>;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.entity_type === "task")).toBe(true);
        expect(rows.some((r) => r.entity_id === taskId)).toBe(true);
        expect(rows.some((r) => r.entity_id === contactId)).toBe(false);
        expect(res.body.total).toBe(owner.body.total);
        expect(res.body.total).toBe(rows.length);
      });

      it("REST narrows an untyped observations query to the allowed type", async () => {
        const res = await post("/observations/query", { limit: 1000, offset: 0 }, G);
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBe(true);
        const rows = res.body.observations as Array<{ entity_type: string }>;
        expect(rows.every((r) => r.entity_type === "task")).toBe(true);
        expect(res.body.total).toBe(rows.length);
      });

      it("MCP reads of the allowed type succeed", async () => {
        await tool("retrieveEntitySnapshot", { entity_id: taskId }, G);
        await tool("listObservations", { entity_id: taskId }, G);
        const byId = await tool("retrieveEntityByIdentifier", { identifier: taskId }, G);
        expect(JSON.parse(byId.content[0].text).entities.length).toBe(1);
        const typed = await tool("retrieveEntities", { entity_type: "task" }, G);
        expect(JSON.parse(typed.content[0].text).narrowed_by_capability).toBeUndefined();
      });

      it("MCP refuses another type on every per-entity tool", async () => {
        expectDenied(
          await capture(() => tool("retrieveEntitySnapshot", { entity_id: contactId }, G)),
          "contact"
        );
        expectDenied(
          await capture(() => tool("listObservations", { entity_id: contactId }, G)),
          "contact"
        );
        expectDenied(
          await capture(() =>
            tool("retrieveFieldProvenance", { entity_id: contactId, field: "name" }, G)
          ),
          "contact"
        );
        expectDenied(
          await capture(() => tool("retrieveEntityByIdentifier", { identifier: contactId }, G)),
          "contact"
        );
        expectDenied(
          await capture(() => tool("retrieveEntities", { entity_type: "contact" }, G)),
          "contact"
        );
      });

      it("MCP narrows an untyped retrieve_entities with a consistent total", async () => {
        const res = await tool("retrieveEntities", { limit: 1000 }, G);
        const body = JSON.parse(res.content[0].text) as Record<string, unknown>;
        expect(body.narrowed_by_capability).toBe(true);
        const rows = body.entities as Array<{ entity_type: string }>;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.entity_type === "task")).toBe(true);
        expect(body.total).toBe(rows.length);
      });
    });

    describe("grant with no retrieve entry fails closed", () => {
      const G = "no-retrieve";
      it("REST refuses every read", async () => {
        expectRest403(await get(`/entities/${taskId}`, G));
        expectRest403(await post("/entities/query", {}, G));
        expectRest403(await post("/entities/query", { entity_type: "task" }, G));
        expectRest403(await post("/get_entity_snapshot", { entity_id: taskId }, G));
        expectRest403(await post("/observations/query", { limit: 5, offset: 0 }, G));
      });
      it("MCP refuses every read", async () => {
        expectDenied(await capture(() => tool("retrieveEntities", {}, G)));
        expectDenied(await capture(() => tool("retrieveEntitySnapshot", { entity_id: taskId }, G)));
      });
    });

    it("a retrieve entry naming no types refuses rather than widening", async () => {
      expectRest403(await post("/entities/query", {}, "retrieve-empty"));
      expectDenied(await capture(() => tool("retrieveEntities", {}, "retrieve-empty")));
    });

    describe("grant with retrieve on *", () => {
      const G = "retrieve-star";
      it("REST and MCP read every type without narrowing", async () => {
        expect((await get(`/entities/${contactId}`, G)).status).toBe(200);
        const q = await post("/entities/query", {}, G);
        expect(q.status).toBe(200);
        expect(q.body.narrowed_by_capability).toBeUndefined();
        await tool("retrieveEntitySnapshot", { entity_id: contactId }, G);
        const m = await tool("retrieveEntities", {}, G);
        expect(JSON.parse(m.content[0].text).narrowed_by_capability).toBeUndefined();
      });
    });

    it("a caller without a grant is not limited", async () => {
      expect((await get(`/entities/${contactId}`)).status).toBe(200);
      const q = await post("/entities/query", {});
      expect(q.status).toBe(200);
      expect(q.body.narrowed_by_capability).toBeUndefined();
      await tool("retrieveEntitySnapshot", { entity_id: contactId });
    });
  });

  describe("setting off (default)", () => {
    it("the same grants read other types exactly as before", async () => {
      expect(process.env[SETTING]).toBeUndefined();
      for (const G of ["retrieve-task", "no-retrieve"]) {
        expect((await get(`/entities/${contactId}`, G)).status).toBe(200);
        expect((await post("/get_entity_snapshot", { entity_id: contactId }, G)).status).toBe(
          200
        );
        const q = await post("/entities/query", { entity_type: "contact" }, G);
        expect(q.status).toBe(200);
        const all = await post("/entities/query", {}, G);
        expect(all.status).toBe(200);
        expect(all.body.narrowed_by_capability).toBeUndefined();
        await tool("retrieveEntitySnapshot", { entity_id: contactId }, G);
        const m = await tool("retrieveEntities", {}, G);
        expect(JSON.parse(m.content[0].text).narrowed_by_capability).toBeUndefined();
      }
    });

    it("values other than 1 leave the check off", async () => {
      for (const value of ["true", "yes", "0", ""]) {
        process.env[SETTING] = value;
        expect((await get(`/entities/${contactId}`, "retrieve-task")).status).toBe(200);
      }
      delete process.env[SETTING];
    });
  });

  describe("enforceAgentRetrieveScope (shared helper)", () => {
    const ctx = (caps: AgentCapabilityEntry[] | null, admitted = true): AgentCapabilityContext => ({
      tier: "software",
      capabilities: caps,
      agentLabel: "unit",
      admitted,
    });
    afterEach(() => {
      delete process.env[SETTING];
    });

    it("returns null when off, for no context, and for a non-admitted caller", () => {
      expect(enforceAgentRetrieveScope(ctx([]), ["task"])).toBeNull();
      process.env[SETTING] = "1";
      expect(enforceAgentRetrieveScope(null, ["task"])).toBeNull();
      expect(enforceAgentRetrieveScope(ctx(null, false), ["task"])).toBeNull();
    });

    it("returns the sorted allowed set, all for *, and refuses outside types", () => {
      process.env[SETTING] = "1";
      const caps = [
        { op: "retrieve", entity_types: ["task", "note"] },
        { op: "retrieve", entity_types: ["task"] },
      ] as AgentCapabilityEntry[];
      expect(enforceAgentRetrieveScope(ctx(caps), [])).toEqual({
        kind: "types",
        types: ["note", "task"],
      });
      expect(
        enforceAgentRetrieveScope(ctx([{ op: "retrieve", entity_types: ["*"] }]), ["x"])
      ).toEqual({ kind: "all" });
      expectDenied(
        (() => {
          try {
            enforceAgentRetrieveScope(ctx(caps), ["task", "contact"]);
          } catch (e) {
            return e;
          }
        })(),
        "contact"
      );
    });
  });
});
