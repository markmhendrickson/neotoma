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
    "retrieve-task-contact-page": [
      { op: "retrieve", entity_types: ["task", "contact", "rendered_page"] },
    ],
  })
);

// Ids whose merge-hop lookup is made to fail, as a transient `entities` read
// error would: the resolver then stops at the id as if it had no merge link.
const FAILING_HOP_IDS = vi.hoisted(() => new Set<string>());

vi.mock("../../src/services/attachment_resolution.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/attachment_resolution.js")>();
  return {
    ...original,
    resolveAttachmentTarget: async (entityId: string, userId: string | null) =>
      FAILING_HOP_IDS.has(entityId)
        ? { resolvedEntityId: entityId, path: [entityId], truncated: false }
        : original.resolveAttachmentTarget(entityId, userId),
  };
});

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
import { mergeEntities } from "../../src/services/entity_merge.js";
import { MAX_ATTACHMENT_RESOLUTION_DEPTH } from "../../src/services/attachment_resolution.js";
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

  function resource(uri: string, grant?: string): Promise<{ contents: Array<{ text: string }> }> {
    const handlers = (
      mcp as unknown as {
        mcpServer: {
          server: {
            _requestHandlers: Map<
              string,
              (request: { params: { uri: string } }) => Promise<{ contents: Array<{ text: string }> }>
            >;
          };
        };
      }
    ).mcpServer.server._requestHandlers;
    const handler = handlers.get("resources/read");
    if (!handler) throw new Error("resources/read handler not registered");
    const call = () => handler({ params: { uri } });
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

      it("MCP resource reads check types and narrow an untyped collection", async () => {
        const allowed = JSON.parse((await resource(`neotoma://entity/${taskId}`, G)).contents[0].text);
        expect(allowed.entity_type).toBe("task");
        expectDenied(await capture(() => resource(`neotoma://entity/${contactId}`, G)), "contact");
        expectDenied(await capture(() => resource("neotoma://entities/contact", G)), "contact");
        const page = JSON.parse((await resource("neotoma://entities?limit=500", G)).contents[0].text);
        expect(page.narrowed_by_capability).toBe(true);
        expect(page.entities.some((e: { entity_type: string }) => e.entity_type === "task")).toBe(true);
        expect(page.entities.every((e: { entity_type: string }) => e.entity_type === "task")).toBe(true);
        const typed = JSON.parse((await resource("neotoma://entities/task?limit=500", G)).contents[0].text);
        expect(page.total).toBe(typed.total);
        expectDenied(await capture(() => resource("neotoma://sources", G)), "*");
        expectDenied(await capture(() => resource(`neotoma://entity/${taskId}`, "no-retrieve")));
        const originalParser = (mcp as any).parseResourceUri;
        (mcp as any).parseResourceUri = () => ({ type: "future_resource_kind" });
        try {
          expectDenied(await capture(() => resource("neotoma://future", G)), "*");
        } finally {
          (mcp as any).parseResourceUri = originalParser;
        }
        const star = JSON.parse((await resource(`neotoma://entity/${contactId}`, "retrieve-star")).contents[0].text);
        expect(star.entity_type).toBe("contact");
        const plain = JSON.parse((await resource(`neotoma://entity/${contactId}`)).contents[0].text);
        expect(plain.entity_type).toBe("contact");
      });

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
        const page = { limit: 500, include_snapshots: false };
        const owner = await post("/entities/query", { entity_type: "task", ...page });
        expect(owner.status).toBe(200);
        const res = await post("/entities/query", page, G);
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBe(true);
        const rows = res.body.entities as Array<{ entity_id: string; entity_type: string }>;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.entity_type === "task")).toBe(true);
        expect(rows.some((r) => r.entity_id === taskId)).toBe(true);
        expect(rows.some((r) => r.entity_id === contactId)).toBe(false);
        expect(res.body.total).toBe(owner.body.total);
        expect(rows.length).toBe(Math.min(res.body.total as number, 500));
      });

      it("REST narrows an untyped observations query to the allowed type", async () => {
        const res = await post("/observations/query", { limit: 500, offset: 0 }, G);
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBe(true);
        const rows = res.body.observations as Array<{ entity_type: string }>;
        expect(rows.every((r) => r.entity_type === "task")).toBe(true);
        expect(rows.length).toBe(Math.min(res.body.total as number, 500));
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
        const res = await tool("retrieveEntities", { limit: 500, include_snapshots: false }, G);
        const body = JSON.parse(res.content[0].text) as Record<string, unknown>;
        expect(body.narrowed_by_capability).toBe(true);
        const rows = body.entities as Array<{ entity_type: string }>;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.entity_type === "task")).toBe(true);
        expect(rows.length).toBe(Math.min(body.total as number, 500));
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

    describe("an id merged into an entity of another type", () => {
      // A task merged into a contact, and a task merged into a rendered_page:
      // the source rows keep entity_type "task", but the readers follow
      // merged_to_entity_id and answer with the surviving entity.
      let mergedIntoContact: string;
      let mergedIntoPage: string;
      const AT = "2999-01-01T00:00:00.000Z";

      beforeAll(async () => {
        const tag = randomBytes(5).toString("hex");
        mergedIntoContact = await seed({ entity_type: "task", title: `retrcap-m1-${tag}` });
        const contactTarget = await seed({ entity_type: "contact", name: `retrcap-mt-${tag}` });
        mergedIntoPage = await seed({ entity_type: "task", title: `retrcap-m2-${tag}` });
        const pageTarget = await seed({
          entity_type: "rendered_page",
          title: `retrcap-page-${tag}`,
          html_body: "<p>synthetic page</p>",
        });
        await mergeEntities({
          fromEntityId: mergedIntoContact,
          toEntityId: contactTarget,
          userId: USER_ID,
          mergedBy: "retrieve-capability-test",
        });
        await mergeEntities({
          fromEntityId: mergedIntoPage,
          toEntityId: pageTarget,
          userId: USER_ID,
          mergedBy: "retrieve-capability-test",
        });
      });

      it("REST refuses under a grant that covers only the requested row's type", async () => {
        const G = "retrieve-task";
        const id = mergedIntoContact;
        expectRest403(await get(`/entities/${id}`, G), "contact");
        expectRest403(await get(`/entities/${id}/markdown`, G), "contact");
        expectRest403(await get(`/entities/${mergedIntoPage}/html`, G), "rendered_page");
        expectRest403(await post("/get_entity_snapshot", { entity_id: id, at: AT }, G), "contact");
        expectRest403(
          await post("/get_entity_snapshot", { entity_id: id, at_ingested: AT }, G),
          "contact"
        );
        expectRest403(
          await post(
            "/get_entity_snapshot",
            { entity_id: id, include_cleared_fields: true, format: "json" },
            G
          ),
          "contact"
        );
      });

      it("MCP retrieve_entity_snapshot refuses with and without at / at_ingested", async () => {
        const G = "retrieve-task";
        const id = mergedIntoContact;
        for (const extra of [{}, { at: AT }, { at_ingested: AT }]) {
          expectDenied(
            await capture(() => tool("retrieveEntitySnapshot", { entity_id: id, ...extra }, G)),
            "contact"
          );
        }
      });

      it("a grant covering both types reads through the merge", async () => {
        const G = "retrieve-task-contact-page";
        const id = mergedIntoContact;
        expect((await get(`/entities/${id}`, G)).status).toBe(200);
        expect((await get(`/entities/${id}/markdown`, G)).status).toBe(200);
        expect((await get(`/entities/${mergedIntoPage}/html`, G)).status).toBe(200);
        expect((await post("/get_entity_snapshot", { entity_id: id, at: AT }, G)).status).toBe(200);
        expect(
          (await post("/get_entity_snapshot", { entity_id: id, at_ingested: AT }, G)).status
        ).toBe(200);
        for (const extra of [{}, { at: AT }, { at_ingested: AT }]) {
          await tool("retrieveEntitySnapshot", { entity_id: id, ...extra }, G);
        }
      });

      it("a caller without a grant reads through the merge", async () => {
        expect((await get(`/entities/${mergedIntoContact}`)).status).toBe(200);
        expect((await get(`/entities/${mergedIntoPage}/html`)).status).toBe(200);
        await tool("retrieveEntitySnapshot", { entity_id: mergedIntoContact, at: AT });
      });

      it("with the setting off the one-type grant reads through the merge as before", async () => {
        delete process.env[SETTING];
        const G = "retrieve-task";
        expect((await get(`/entities/${mergedIntoContact}`, G)).status).toBe(200);
        expect((await get(`/entities/${mergedIntoPage}/html`, G)).status).toBe(200);
        expect(
          (await post("/get_entity_snapshot", { entity_id: mergedIntoContact, at: AT }, G)).status
        ).toBe(200);
        await tool("retrieveEntitySnapshot", { entity_id: mergedIntoContact, at: AT }, G);
      });
    });

    describe("merge chains the resolver could not follow", () => {
      async function link(fromId: string, toId: string | null): Promise<void> {
        const { error } = await db
          .from("entities")
          .update({ merged_to_entity_id: toId })
          .eq("id", fromId)
          .eq("user_id", USER_ID);
        expect(error).toBeNull();
      }

      it("a failed hop lookup refuses a typed grant and allows a * grant", async () => {
        const tag = randomBytes(5).toString("hex");
        const from = await seed({ entity_type: "task", title: `retrcap-hop-${tag}` });
        const to = await seed({ entity_type: "contact", name: `retrcap-hop-to-${tag}` });
        await link(from, to);
        FAILING_HOP_IDS.add(from);
        try {
          expectRest403(await get(`/entities/${from}`, "retrieve-task"));
          expectRest403(await get(`/entities/${from}/markdown`, "retrieve-task"));
          expectDenied(
            await capture(() =>
              tool("retrieveEntitySnapshot", { entity_id: from }, "retrieve-task")
            )
          );
          expect((await get(`/entities/${from}`, "retrieve-star")).status).toBe(200);
          await tool("retrieveEntitySnapshot", { entity_id: from }, "retrieve-star");
        } finally {
          FAILING_HOP_IDS.delete(from);
          await link(from, null);
        }
      });

      it("a cycle refuses a typed grant even when every type is listed; * reads", async () => {
        const tag = randomBytes(5).toString("hex");
        const a = await seed({ entity_type: "task", title: `retrcap-cyc-a-${tag}` });
        const b = await seed({ entity_type: "task", title: `retrcap-cyc-b-${tag}` });
        await link(a, b);
        await link(b, a);
        try {
          expectRest403(await get(`/entities/${a}`, "retrieve-task"));
          expectRest403(await get(`/entities/${a}/observations`, "retrieve-task"));
          expectDenied(
            await capture(() => tool("listObservations", { entity_id: a }, "retrieve-task"))
          );
          // The observations read does not follow merge links, so it is the one
          // read that terminates on a cycle; it shows the check lets * through.
          expect((await get(`/entities/${a}/observations`, "retrieve-star")).status).toBe(200);
          await tool("listObservations", { entity_id: a }, "retrieve-star");
        } finally {
          await link(a, null);
          await link(b, null);
        }
      });

      it("an over-deep chain refuses a typed grant even when every type is listed; * reads", async () => {
        const tag = randomBytes(5).toString("hex");
        const ids: string[] = [];
        for (let i = 0; i <= MAX_ATTACHMENT_RESOLUTION_DEPTH + 1; i++) {
          ids.push(await seed({ entity_type: "task", title: `retrcap-deep-${tag}-${i}` }));
        }
        for (let i = 0; i < ids.length - 1; i++) await link(ids[i], ids[i + 1]);
        try {
          expectRest403(await get(`/entities/${ids[0]}`, "retrieve-task"));
          expectDenied(
            await capture(() =>
              tool("retrieveEntitySnapshot", { entity_id: ids[0] }, "retrieve-task")
            )
          );
          expect((await get(`/entities/${ids[0]}`, "retrieve-star")).status).toBe(200);
          await tool("retrieveEntitySnapshot", { entity_id: ids[0] }, "retrieve-star");
        } finally {
          for (const id of ids) await link(id, null);
        }
      });
    });

    it("a typed identifier lookup naming an allowed type with another type's raw id is refused", async () => {
      const G = "retrieve-task";
      expectRest403(
        await post(
          "/retrieve_entity_by_identifier",
          { identifier: contactId, entity_type: "task" },
          G
        ),
        "contact"
      );
      expectRest403(
        await post(
          "/retrieve_entity_by_identifier",
          { identifier: contactId, entity_type: "task", include_observations: true },
          G
        ),
        "contact"
      );
      expectDenied(
        await capture(() =>
          tool("retrieveEntityByIdentifier", { identifier: contactId, entity_type: "task" }, G)
        ),
        "contact"
      );
      const own = await post(
        "/retrieve_entity_by_identifier",
        { identifier: taskId, entity_type: "task" },
        G
      );
      expect(own.status).toBe(200);
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
        expect((await post("/get_entity_snapshot", { entity_id: contactId }, G)).status).toBe(200);
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

  describe("round 2: related entities, graph neighbourhood, type counts and the gate", () => {
    let hubId: string;
    let peerTaskId: string;

    function parse(result: ToolResult): Record<string, unknown> {
      return JSON.parse(result.content[0].text) as Record<string, unknown>;
    }
    const endpoints = (rels: unknown): string[] =>
      (rels as Array<{ source_entity_id: string; target_entity_id: string }>).flatMap((r) => [
        r.source_entity_id,
        r.target_entity_id,
      ]);
    const relatedBody = () => ({ entity_id: hubId, max_hops: 1, include_entities: true });
    const graphBody = () => ({
      node_id: hubId,
      node_type: "entity",
      include_relationships: true,
      include_entities: true,
      limit: 100,
    });

    beforeAll(async () => {
      const tag = randomBytes(5).toString("hex");
      hubId = await seed({ entity_type: "task", title: `retrcap-hub-${tag}` });
      peerTaskId = await seed({ entity_type: "task", title: `retrcap-peer-${tag}` });
      for (const target of [peerTaskId, contactId]) {
        const res = await post("/create_relationship", {
          relationship_type: "REFERS_TO",
          source_entity_id: hubId,
          target_entity_id: target,
        });
        expect(res.status).toBe(200);
      }
    });

    afterAll(async () => {
      for (const t of ["relationship_snapshots", "relationship_observations"]) {
        await db.from(t).delete().eq("source_entity_id", hubId);
      }
    });

    describe("setting on", () => {
      beforeEach(() => {
        process.env[SETTING] = "1";
      });
      afterEach(() => {
        delete process.env[SETTING];
      });

      it("REST retrieve_related_entities narrows a one-type grant to the allowed type", async () => {
        const res = await post("/retrieve_related_entities", relatedBody(), "retrieve-task");
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBe(true);
        const ids = endpoints(res.body.relationships);
        expect(ids).toContain(peerTaskId);
        expect(ids).not.toContain(contactId);
        const rows = res.body.entities as Array<{ entity_type?: string; id?: string }>;
        expect(rows.every((e) => (e.entity_type ?? "task") === "task")).toBe(true);
      });

      it("REST retrieve_related_entities refuses a root of another type", async () => {
        const body = { entity_id: contactId, max_hops: 1 };
        expectRest403(await post("/retrieve_related_entities", body, "retrieve-task"), "contact");
      });

      it("REST retrieve_graph_neighborhood narrows with a total that matches the rows", async () => {
        const res = await post("/retrieve_graph_neighborhood", graphBody(), "retrieve-task");
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBe(true);
        const rels = res.body.relationships as unknown[];
        expect(endpoints(rels)).toContain(peerTaskId);
        expect(endpoints(rels)).not.toContain(contactId);
        expect(res.body.total_count).toBe(rels.length);
        const refused = await post(
          "/retrieve_graph_neighborhood",
          { ...graphBody(), node_id: contactId },
          "retrieve-task"
        );
        expectRest403(refused, "contact");
      });

      it("MCP related entities and graph neighbourhood narrow and refuse the same way", async () => {
        const related = parse(
          await tool("retrieveRelatedEntities", relatedBody(), "retrieve-task")
        );
        expect(related.narrowed_by_capability).toBe(true);
        expect(endpoints(related.relationships)).not.toContain(contactId);
        expect(endpoints(related.relationships)).toContain(peerTaskId);
        const graph = parse(await tool("retrieveGraphNeighborhood", graphBody(), "retrieve-task"));
        expect(graph.narrowed_by_capability).toBe(true);
        expect(endpoints(graph.relationships)).not.toContain(contactId);
        expectDenied(
          await capture(() =>
            tool("retrieveRelatedEntities", { entity_id: contactId }, "retrieve-task")
          ),
          "contact"
        );
        expectDenied(
          await capture(() =>
            tool(
              "retrieveGraphNeighborhood",
              { ...graphBody(), node_id: contactId },
              "retrieve-task"
            )
          ),
          "contact"
        );
      });

      it("MCP get_entity_type_counts returns only allowed types with a consistent total", async () => {
        const counts = parse(await tool("getEntityTypeCounts", {}, "retrieve-task"));
        expect(counts.narrowed_by_capability).toBe(true);
        const byType = counts.entities_by_type as Record<string, number>;
        expect(Object.keys(byType)).toEqual(["task"]);
        expect(counts.total_entities).toBe(byType.task);
      });

      it("a grant with no retrieve entry is refused on both surfaces", async () => {
        expectRest403(await post("/retrieve_related_entities", relatedBody(), "no-retrieve"));
        expectRest403(await post("/retrieve_graph_neighborhood", graphBody(), "no-retrieve"));
        for (const [name, args] of [
          ["retrieveRelatedEntities", relatedBody()],
          ["retrieveGraphNeighborhood", graphBody()],
          ["getEntityTypeCounts", {}],
        ] as const) {
          expectDenied(await capture(() => tool(name, args, "no-retrieve")));
        }
      });

      it("a * grant reads every type without narrowing", async () => {
        const res = await post("/retrieve_related_entities", relatedBody(), "retrieve-star");
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBeUndefined();
        expect(endpoints(res.body.relationships)).toContain(contactId);
        const graph = await post("/retrieve_graph_neighborhood", graphBody(), "retrieve-star");
        expect(graph.body.narrowed_by_capability).toBeUndefined();
        expect(endpoints(graph.body.relationships)).toContain(contactId);
        const counts = parse(await tool("getEntityTypeCounts", {}, "retrieve-star"));
        expect(counts.narrowed_by_capability).toBeUndefined();
        expect(Object.keys(counts.entities_by_type as object)).toContain("contact");
      });

      it("a caller without a grant is unaffected", async () => {
        const res = await post("/retrieve_related_entities", relatedBody());
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBeUndefined();
        expect(endpoints(res.body.relationships)).toContain(contactId);
        const counts = parse(await tool("getEntityTypeCounts", {}));
        expect(counts.narrowed_by_capability).toBeUndefined();
      });

      describe("default-deny gate on routes with no per-type check", () => {
        // Contract-mapped reads and the registered aliases that openapi.yaml
        // does not declare; every one must refuse a one-type grant.
        const routes: Array<["GET" | "POST", string, Record<string, unknown>?]> = [
          ["GET", "/relationships"],
          ["GET", "/sources"],
          ["GET", "/record_activity"],
          ["POST", "/api/issues/status", { entity_id: "ent_synthetic" }],
          ["GET", "/sources/src_synthetic/content"],
          ["GET", "/turns"],
          ["GET", "/turns/turn_synthetic"],
          ["GET", "/agents"],
          ["GET", "/agents/agent_synthetic"],
          ["GET", "/agents/agent_synthetic/records"],
          ["GET", "/submit/task/ent_synthetic"],
          ["GET", "/bundles"],
          ["GET", "/no_such_read_route"],
        ];

        for (const [method, path, body] of routes) {
          it(`${method} ${path}: one-type grant refused; * grant and no grant pass the gate`, async () => {
            const call = (grant?: string) => request(method, path, body, grant);
            expectRest403(await call("retrieve-task"));
            expectRest403(await call("no-retrieve"));
            const star = await call("retrieve-star");
            expect(star.body.error_code).not.toBe("capability_denied");
            const bearer = await call();
            expect(bearer.body.error_code).not.toBe("capability_denied");
          });
        }

        it("exempt routes stay readable for a one-type grant", async () => {
          expect((await get("/health", "retrieve-task")).status).toBe(200);
        });
      });
    });

    describe("setting off", () => {
      it("a one-type grant reads related entities, graph and counts as before", async () => {
        const other = JSON.parse(
          (await resource(`neotoma://entity/${contactId}`, "retrieve-task")).contents[0].text
        );
        expect(other.entity_type).toBe("contact");
        const res = await post("/retrieve_related_entities", relatedBody(), "retrieve-task");
        expect(res.status).toBe(200);
        expect(res.body.narrowed_by_capability).toBeUndefined();
        expect(endpoints(res.body.relationships)).toContain(contactId);
        const graph = await post("/retrieve_graph_neighborhood", graphBody(), "retrieve-task");
        expect(endpoints(graph.body.relationships)).toContain(contactId);
        const counts = parse(await tool("getEntityTypeCounts", {}, "retrieve-task"));
        expect(counts.narrowed_by_capability).toBeUndefined();
        for (const path of ["/turns", "/agents", "/no_such_read_route"]) {
          const r = await get(path, "retrieve-task");
          expect(r.body.error_code).not.toBe("capability_denied");
        }
      });
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
