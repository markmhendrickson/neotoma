/**
 * Agent grants on the entity lifecycle and schema-governance entry points:
 * delete, restore, merge and split of entities, schema registration and
 * incremental update, and bundle activation, on REST and MCP.
 *
 * Each REST case drives the real Express app over HTTP against the local test
 * database; each MCP case drives the real NeotomaServer tool method. Agent
 * admission is injected by mocking the AAuth signature verifier and the grant
 * lookup (the pattern in store_capability_parity_observations_interpretations
 * .test.ts), so the request still runs the real middleware chain, identity
 * threading, route and service. Every assertion is on the EFFECT: a refused
 * request changes nothing; a grant that names the op succeeds.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const GRANT_HEADER = "x-test-mutation-cap-grant";
const THUMBPRINT_PREFIX = "tp-mutation-cap-";

const GRANTS = vi.hoisted(
  (): Record<string, Array<{ op: string; entity_types: string[] }>> => ({
    // Read-only grant: the case the gap report reproduced.
    "retrieve-only": [{ op: "retrieve", entity_types: ["*"] }],
    // Wide store and correct: neither implies the new ops.
    "store-correct-star": [
      { op: "store", entity_types: ["*"] },
      { op: "correct", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // `delete` scoped to one type: the stored type decides, not the request.
    "delete-task-only": [
      { op: "delete", entity_types: ["task"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // Names every op the cases below need.
    "ops-all": [
      { op: "delete", entity_types: ["*"] },
      { op: "restore", entity_types: ["*"] },
      { op: "merge", entity_types: ["*"] },
      { op: "split", entity_types: ["*"] },
      { op: "register_schema", entity_types: ["*"] },
      { op: "store", entity_types: ["*"] },
      { op: "correct", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // register_schema for one named type only (not "*": no bundle changes).
    "schema-one-type": [{ op: "register_schema", entity_types: ["capcov_named_type"] }],
    // Everything on task only: the stored type of an extended entity decides.
    "task-only-all": [
      { op: "store", entity_types: ["task"] },
      { op: "correct", entity_types: ["task"] },
      { op: "delete", entity_types: ["task"] },
      { op: "restore", entity_types: ["task"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // store on every type, nothing else.
    "store-star-only": [
      { op: "store", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // One op scoped to contact: the other endpoint's stored type decides.
    "merge-contact-only": [{ op: "merge", entity_types: ["contact"] }],
    "split-contact-only": [{ op: "split", entity_types: ["contact"] }],
    "restore-task-only": [{ op: "restore", entity_types: ["task"] }],
    // delete on "*": does not reach a protected type for a named-only op.
    "delete-star": [
      { op: "delete", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    "delete-grant-named": [{ op: "delete", entity_types: ["agent_grant"] }],
    // store everywhere, delete on task only, or on task and contact.
    "store-star-delete-task": [
      { op: "store", entity_types: ["*"] },
      { op: "delete", entity_types: ["task"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    "store-star-delete-task-contact": [
      { op: "store", entity_types: ["*"] },
      { op: "delete", entity_types: ["task", "contact"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // store everywhere, delete only on the fallback type.
    "store-star-delete-generic": [
      { op: "store", entity_types: ["*"] },
      { op: "delete", entity_types: ["generic"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
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
          sub: "mutator@swarm.test",
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
      // A key pinned to a grant the operator has revoked: the deny ceiling.
      if (key === "revoked") return { admitted: false, reason: "grant_revoked" };
      const capabilities = GRANTS[key];
      if (!capabilities) return { admitted: false, reason: "no_match" };
      return {
        admitted: true,
        reason: "admitted",
        user_id: owner,
        grant_id: `ent_test_mutation_cap_${key}`,
        agent_label: `mutation capability ${key}`,
        capabilities,
      };
    },
  };
});

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { AgentCapabilityError } from "../../src/services/agent_capabilities.js";
import type { AgentCapabilityEntry } from "../../src/services/agent_capabilities.js";
import type { AgentIdentity } from "../../src/crypto/agent_identity.js";
import { isEntityDeleted, softDeleteEntity } from "../../src/services/deletion.js";
import { createGrant } from "../../src/services/agent_grants.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import {
  isBundleEnabled,
  resetBundleRegistryForTesting,
  resetBundleStateCacheForTesting,
} from "../../src/services/bundles/index.js";

const USER_ID = LOCAL_DEV_USER_ID;
// The only bundles this checkout ships are the always-active defaults, so the
// cases use `core`: `install` is a no-op success for an allowed caller, and a
// refused caller must be stopped before the registry is consulted at all.
const BUNDLE = "core";

const createdEntityIds: string[] = [];
const createdSchemaTypes: string[] = [];

function runAsGrant<T>(grant: string, fn: () => Promise<T>): Promise<T> {
  const agentIdentity: AgentIdentity = {
    sub: "mutator@swarm.test",
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
        grant_id: `ent_test_mutation_cap_${grant}`,
        agent_label: `mutation capability ${grant}`,
        capabilities: GRANTS[grant] as AgentCapabilityEntry[],
      },
    },
    fn
  );
}

type ToolResult = { content: Array<{ text: string }> };

describe("agent grants on entity lifecycle and schema governance entry points", () => {
  let httpServer: Server;
  let baseUrl: string;
  let mcp: NeotomaServer;
  let bundleDir: string;

  async function post(path: string, body: Record<string, unknown>, grant?: string) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(grant ? { [GRANT_HEADER]: grant } : {}),
      },
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

  function expectDenied(error: unknown, op: string): void {
    expect(error).toBeInstanceOf(AgentCapabilityError);
    expect((error as AgentCapabilityError).code).toBe("capability_denied");
    expect((error as AgentCapabilityError).op).toBe(op);
  }

  function marker(label: string): string {
    return `capcov-${label}-${randomBytes(5).toString("hex")}`;
  }

  /** Stores one contact as the owner (no agent identity) and returns its id. */
  async function seedContact(label: string): Promise<string> {
    const res = await post("/store", {
      idempotency_key: `capcov-seed-${randomUUID()}`,
      entities: [{ entity_type: "contact", name: marker(label) }],
    });
    expect(res.status).toBe(200);
    const id = (res.body.entities as Array<{ entity_id: string }>)[0].entity_id;
    createdEntityIds.push(id);
    return id;
  }

  /** Stores one task as the owner and returns its id. */
  async function seedTask(label: string): Promise<string> {
    const res = await post("/store", {
      idempotency_key: `capcov-seed-task-${randomUUID()}`,
      entities: [{ entity_type: "task", title: marker(label) }],
    });
    expect(res.status).toBe(200);
    const id = (res.body.entities as Array<{ entity_id: string }>)[0].entity_id;
    createdEntityIds.push(id);
    return id;
  }

  async function seedDeletedContact(label: string): Promise<string> {
    const id = await seedContact(label);
    expect((await softDeleteEntity(id, "contact", USER_ID)).success).toBe(true);
    return id;
  }

  /** A contact with one extra observation carrying `move: "yes"` (split fixture). */
  async function seedSplittable(label: string): Promise<string> {
    const id = await seedContact(label);
    const { error } = await db.from("observations").insert({
      id: randomUUID(),
      entity_id: id,
      user_id: USER_ID,
      entity_type: "contact",
      schema_version: "1.0",
      fields: { move: "yes" },
      source_priority: 20,
      observed_at: new Date().toISOString(),
    });
    if (error) throw new Error(`seed observation: ${error.message}`);
    return id;
  }

  async function mergedInto(id: string): Promise<string | null> {
    const { data } = await db
      .from("entities")
      .select("merged_to_entity_id")
      .eq("id", id)
      .maybeSingle();
    return ((data as { merged_to_entity_id?: string | null } | null)?.merged_to_entity_id ??
      null) as string | null;
  }

  async function observationCount(id: string): Promise<number> {
    const { data } = await db.from("observations").select("id").eq("entity_id", id);
    return (data as unknown[] | null)?.length ?? 0;
  }

  async function entitiesNamed(name: string): Promise<number> {
    const { data } = await db.from("entities").select("id, canonical_name").eq("user_id", USER_ID);
    return ((data ?? []) as Array<{ canonical_name: string }>).filter(
      (r) => (r.canonical_name ?? "").toLowerCase() === name.toLowerCase()
    ).length;
  }

  async function schemaRows(entityType: string): Promise<Array<Record<string, unknown>>> {
    const { data } = await db.from("schema_registry").select("*").eq("entity_type", entityType);
    return (data ?? []) as Array<Record<string, unknown>>;
  }

  function schemaType(label: string): string {
    const t = `capcov_${label}_${randomBytes(4).toString("hex")}`;
    createdSchemaTypes.push(t);
    return t;
  }

  function registerBody(entityType: string): Record<string, unknown> {
    return {
      entity_type: entityType,
      schema_version: "1.0",
      activate: true,
      schema_definition: {
        canonical_name_fields: ["title"],
        fields: { title: { type: "string" } },
      },
      reducer_config: { merge_policies: { title: { strategy: "last_write" } } },
    };
  }

  async function activeFieldNames(entityType: string): Promise<string[]> {
    const rows = (await schemaRows(entityType)).filter((r) => r.active === true || r.active === 1);
    const names = new Set<string>();
    for (const row of rows) {
      const def =
        typeof row.schema_definition === "string"
          ? (JSON.parse(row.schema_definition) as Record<string, unknown>)
          : (row.schema_definition as Record<string, unknown>);
      for (const k of Object.keys((def?.fields as Record<string, unknown>) ?? {})) names.add(k);
    }
    return [...names];
  }

  beforeAll(async () => {
    bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "capcov-bundles-"));
    process.env.NEOTOMA_BUNDLE_STATE_PATH = path.join(bundleDir, "bundle_state.json");
    resetBundleStateCacheForTesting();
    resetBundleRegistryForTesting();

    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    baseUrl = `http://127.0.0.1:${address.port}`;
    mcp = new NeotomaServer();
    (mcp as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    for (const id of createdEntityIds) {
      for (const t of ["raw_fragments", "timeline_events", "entity_snapshots", "observations"]) {
        await db.from(t).delete().eq("entity_id", id);
      }
      await db.from("entities").delete().eq("id", id);
    }
    for (const t of createdSchemaTypes) {
      await db.from("schema_registry").delete().eq("entity_type", t);
    }
    delete process.env.NEOTOMA_BUNDLE_STATE_PATH;
    resetBundleStateCacheForTesting();
    resetBundleRegistryForTesting();
    fs.rmSync(bundleDir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ delete
  describe("delete_entity", () => {
    it("REST refuses a retrieve-only grant with 403 and the entity stays live", async () => {
      const id = await seedContact("del-rest-ro");
      const res = await post(
        "/delete_entity",
        { entity_id: id, entity_type: "contact" },
        "retrieve-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST refuses store and correct on every type: neither implies delete", async () => {
      const id = await seedContact("del-rest-sc");
      const res = await post(
        "/delete_entity",
        { entity_id: id, entity_type: "contact" },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST judges the stored type, not the type the request names", async () => {
      const id = await seedContact("del-rest-spoof");
      const res = await post(
        "/delete_entity",
        { entity_id: id, entity_type: "task" },
        "delete-task-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST deletes for a grant that names delete", async () => {
      const id = await seedContact("del-rest-ok");
      const res = await post(
        "/delete_entity",
        { entity_id: id, entity_type: "contact" },
        "ops-all"
      );
      expect(res.status).toBe(200);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("MCP refuses a retrieve-only grant and the entity stays live", async () => {
      const id = await seedContact("del-mcp-ro");
      const error = await capture(() =>
        tool("deleteEntity", { entity_id: id, entity_type: "contact" }, "retrieve-only")
      );
      expectDenied(error, "delete");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("MCP judges the stored type, not the type the request names", async () => {
      const id = await seedContact("del-mcp-spoof");
      const error = await capture(() =>
        tool("deleteEntity", { entity_id: id, entity_type: "task" }, "delete-task-only")
      );
      expectDenied(error, "delete");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("MCP deletes for a grant that names delete", async () => {
      const id = await seedContact("del-mcp-ok");
      await tool("deleteEntity", { entity_id: id, entity_type: "contact" }, "ops-all");
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("an owner session (no agent identity) still deletes", async () => {
      const id = await seedContact("del-owner");
      const res = await post("/delete_entity", { entity_id: id, entity_type: "contact" });
      expect(res.status).toBe(200);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });
  });

  // ------------------------------------------- the reserved _deleted field
  describe("writing the reserved _deleted field is a delete or restore", () => {
    async function contactName(id: string): Promise<string> {
      const { data } = await db
        .from("entities")
        .select("canonical_name")
        .eq("id", id)
        .maybeSingle();
      return (data as { canonical_name: string }).canonical_name;
    }

    it("REST /store refuses _deleted: true from a grant with store but no delete", async () => {
      const id = await seedContact("rsv-store");
      const res = await post(
        "/store",
        {
          idempotency_key: `capcov-rsv-${randomUUID()}`,
          entities: [
            { entity_type: "contact", target_id: id, name: await contactName(id), _deleted: true },
          ],
          source_priority: 5000,
        },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("MCP store refuses _deleted: true from a grant with store but no delete", async () => {
      const id = await seedContact("rsv-store-mcp");
      const name = await contactName(id);
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-rsv-mcp-${randomUUID()}`,
            entities: [{ entity_type: "contact", target_id: id, name, _deleted: true }],
            source_priority: 5000,
          },
          "store-correct-star"
        )
      );
      expectDenied(error, "delete");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST /correct refuses field _deleted from a grant with correct but no delete", async () => {
      const id = await seedContact("rsv-correct");
      const res = await post(
        "/correct",
        {
          entity_id: id,
          entity_type: "contact",
          field: "_deleted",
          value: true,
          idempotency_key: `capcov-rsv-c-${randomUUID()}`,
        },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("MCP correct refuses field _deleted from a grant with correct but no delete", async () => {
      const id = await seedContact("rsv-correct-mcp");
      const error = await capture(() =>
        tool(
          "correct",
          {
            entity_id: id,
            entity_type: "contact",
            field: "_deleted",
            value: true,
            idempotency_key: `capcov-rsv-cm-${randomUUID()}`,
          },
          "store-correct-star"
        )
      );
      expectDenied(error, "delete");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST /observations/create refuses _deleted: true from a grant with store but no delete", async () => {
      const id = await seedContact("rsv-obs");
      const res = await post(
        "/observations/create",
        {
          entity_type: "contact",
          entity_identifier: await contactName(id),
          fields: { name: await contactName(id), _deleted: true },
          source_priority: 5000,
          user_id: USER_ID,
        },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST /correct with field _deleted succeeds for a grant that names delete", async () => {
      const id = await seedContact("rsv-correct-ok");
      const res = await post(
        "/correct",
        {
          entity_id: id,
          entity_type: "contact",
          field: "_deleted",
          value: true,
          idempotency_key: `capcov-rsv-ok-${randomUUID()}`,
        },
        "ops-all"
      );
      expect(res.status).toBe(200);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("REST /store judges the stored type of the entity a target_id extends", async () => {
      const contact = await seedContact("rsv-spoof");
      const res = await post(
        "/store",
        {
          idempotency_key: `capcov-rsv-spoof-${randomUUID()}`,
          entities: [
            { entity_type: "task", target_id: contact, title: marker("t"), _deleted: true },
          ],
          source_priority: 5000,
        },
        "task-only-all"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(contact, USER_ID)).toBe(false);
    });

    it("REST /store refuses extending an entity whose stored type the grant does not cover", async () => {
      const contact = await seedContact("ext-spoof");
      const before = await observationCount(contact);
      const res = await post(
        "/store",
        {
          idempotency_key: `capcov-ext-spoof-${randomUUID()}`,
          entities: [{ entity_type: "task", target_id: contact, title: marker("t") }],
        },
        "task-only-all"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await observationCount(contact)).toBe(before);
    });

    it("MCP store judges an entity with no type as the type the write uses", async () => {
      const contact = await seedContact("rsv-notype");
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-rsv-notype-${randomUUID()}`,
            entities: [{ target_id: contact, title: "x", _deleted: true }],
            source_priority: 5000,
          },
          "store-star-only"
        )
      );
      expectDenied(error, "delete");
      expect(await isEntityDeleted(contact, USER_ID)).toBe(false);
    });

    it("REST /store needs delete on the stored type of the entity it extends", async () => {
      const contact = await seedContact("rsv-ext-del");
      const res = await post(
        "/store",
        {
          idempotency_key: `capcov-rsv-ext-${randomUUID()}`,
          entities: [
            { entity_type: "task", target_id: contact, title: marker("t"), _deleted: true },
          ],
          source_priority: 5000,
        },
        "store-star-delete-task"
      );
      expect(res.status).toBe(403);
      expect((res.body.details as { op?: string; entity_type?: string }).op).toBe("delete");
      expect((res.body.details as { entity_type?: string }).entity_type).toBe("contact");
      expect(await isEntityDeleted(contact, USER_ID)).toBe(false);
    });

    it("MCP store needs delete on the stored type of the entity it extends", async () => {
      const contact = await seedContact("rsv-ext-del-mcp");
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-rsv-ext-mcp-${randomUUID()}`,
            entities: [
              { entity_type: "task", entity_id: contact, title: marker("t"), _deleted: true },
            ],
            source_priority: 5000,
          },
          "store-star-delete-task"
        )
      );
      expectDenied(error, "delete");
      expect((error as AgentCapabilityError).entityType).toBe("contact");
      expect(await isEntityDeleted(contact, USER_ID)).toBe(false);
    });

    it("REST /store passes the check when delete covers the extended entity's stored type", async () => {
      const contact = await seedContact("rsv-ext-ok");
      const res = await post(
        "/store",
        {
          idempotency_key: `capcov-rsv-ext-ok-${randomUUID()}`,
          entities: [
            { entity_type: "task", target_id: contact, title: marker("t"), _deleted: true },
          ],
          source_priority: 5000,
        },
        "store-star-delete-task-contact"
      );
      expect(res.status).toBe(200);
      expect(await isEntityDeleted(contact, USER_ID)).toBe(true);
    });

    it("MCP store judges a blank entity_type by the type the write falls back to", async () => {
      const kind = `capcov_cust_${randomBytes(3).toString("hex")}`;
      const name = marker("blank-type");
      const seeded = await post("/store", {
        idempotency_key: `capcov-seed-cust-${randomUUID()}`,
        entities: [{ entity_type: kind, name }],
      });
      expect(seeded.status).toBe(200);
      const id = (seeded.body.entities as Array<{ entity_id: string }>)[0].entity_id;
      createdEntityIds.push(id);
      createdSchemaTypes.push(kind);
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-blank-type-${randomUUID()}`,
            // No target_id: the entity resolves to the existing one by name.
            entities: [{ entity_type: "", type: kind, name, _deleted: true }],
            source_priority: 5000,
          },
          "store-star-delete-generic"
        )
      );
      expectDenied(error, "delete");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("MCP store judges the stored type of the entity a target_id extends", async () => {
      const contact = await seedContact("rsv-spoof-mcp");
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-rsv-spoof-mcp-${randomUUID()}`,
            entities: [
              { entity_type: "task", target_id: contact, title: marker("t"), _deleted: true },
            ],
            source_priority: 5000,
          },
          "task-only-all"
        )
      );
      expectDenied(error, "store");
      expect(await isEntityDeleted(contact, USER_ID)).toBe(false);
    });

    it("REST /store refuses _deleted nested under fields", async () => {
      const id = await seedContact("rsv-nested");
      const res = await post(
        "/store",
        {
          idempotency_key: `capcov-rsv-nested-${randomUUID()}`,
          entities: [
            {
              entity_type: "contact",
              target_id: id,
              name: await contactName(id),
              fields: { _deleted: true },
            },
          ],
          source_priority: 5000,
        },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST /correct refuses _deleted: false (a restore) without restore", async () => {
      const id = await seedDeletedContact("rsv-restore");
      const res = await post(
        "/correct",
        {
          entity_id: id,
          entity_type: "contact",
          field: "_deleted",
          value: false,
          idempotency_key: `capcov-rsv-r-${randomUUID()}`,
        },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect((res.body.details as { op?: string }).op).toBe("restore");
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("REST batch_correct refuses _deleted without delete", async () => {
      const id = await seedContact("rsv-batch");
      const res = await post(
        `/entities/${encodeURIComponent(id)}/batch_correct`,
        {
          changes: [{ field: "_deleted", value: true }],
          idempotency_prefix: `capcov-rsv-batch-${randomUUID()}`,
        },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    // Regression guard: the transaction route accepts only schema-declared
    // fields, so it refuses the marker before the grant check is reached.
    it("REST /corrections/transaction never applies _deleted", async () => {
      const id = await seedContact("rsv-txn");
      const row = (await (await fetch(`${baseUrl}/entities/${id}`)).json()) as Record<
        string,
        unknown
      >;
      const res = await post(
        "/corrections/transaction",
        {
          idempotency_key: `capcov-rsv-txn-${randomUUID()}`,
          entities: [
            {
              entity_id: id,
              entity_type: "contact",
              expected_observation_count: row.observation_count,
              expected_snapshot: row.snapshot,
              changes: [{ field: "_deleted", value: true }],
            },
          ],
        },
        "store-correct-star"
      );
      expect([400, 403]).toContain(res.status);
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });
  });

  // ------------------------------------------- stored types on every endpoint
  describe("the stored type of every entity a call touches decides", () => {
    it("merge refuses when the grant covers only one of the two stored types", async () => {
      const contact = await seedContact("mrg-scope");
      const task = await seedTask("mrg-scope");
      const res = await post(
        "/entities/merge",
        { from_entity_id: contact, to_entity_id: task, merge_reason: "capcov" },
        "merge-contact-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await mergedInto(contact)).toBeNull();
      const back = await post(
        "/entities/merge",
        { from_entity_id: task, to_entity_id: contact, merge_reason: "capcov" },
        "merge-contact-only"
      );
      expect(back.status).toBe(403);
      expect(await mergedInto(task)).toBeNull();
    });

    it("merge succeeds when the grant covers both stored types", async () => {
      const a = await seedContact("mrg-scope-ok-a");
      const b = await seedContact("mrg-scope-ok-b");
      const res = await post(
        "/entities/merge",
        { from_entity_id: a, to_entity_id: b, merge_reason: "capcov" },
        "merge-contact-only"
      );
      expect(res.status).toBe(200);
      expect(await mergedInto(a)).toBe(b);
    });

    it("split refuses a new entity type the grant does not cover", async () => {
      const source = await seedSplittable("spl-scope");
      const before = await observationCount(source);
      const res = await post(
        "/entities/split",
        {
          source_entity_id: source,
          predicate: { observation_field_equals: { field: "move", value: "yes" } },
          new_entity: { entity_type: "task", canonical_name: marker("spl-scope-new") },
          idempotency_key: `capcov-split-${randomUUID()}`,
        },
        "split-contact-only"
      );
      expect(res.status).toBe(403);
      expect(await observationCount(source)).toBe(before);
    });

    it("split refuses an existing target whose stored type the grant does not cover", async () => {
      const source = await seedSplittable("spl-target");
      const task = await seedTask("spl-target");
      const before = await observationCount(source);
      const res = await post(
        "/entities/split",
        {
          source_entity_id: source,
          predicate: { observation_field_equals: { field: "move", value: "yes" } },
          new_entity: {
            entity_type: "contact",
            canonical_name: marker("x"),
            target_entity_id: task,
          },
          idempotency_key: `capcov-split-${randomUUID()}`,
        },
        "split-contact-only"
      );
      expect(res.status).toBe(403);
      expect(await observationCount(source)).toBe(before);
    });

    it("split succeeds for a grant scoped to the types involved", async () => {
      const source = await seedSplittable("spl-scope-ok");
      const res = await post(
        "/entities/split",
        {
          source_entity_id: source,
          predicate: { observation_field_equals: { field: "move", value: "yes" } },
          new_entity: { entity_type: "contact", canonical_name: marker("spl-ok-new") },
          idempotency_key: `capcov-split-${randomUUID()}`,
        },
        "split-contact-only"
      );
      expect(res.status).toBe(200);
      createdEntityIds.push(res.body.new_entity_id as string);
    });

    it("restore judges the stored type, not the type the request names", async () => {
      const id = await seedDeletedContact("res-spoof");
      const res = await post(
        "/restore_entity",
        { entity_id: id, entity_type: "task" },
        "restore-task-only"
      );
      expect(res.status).toBe(403);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("an empty entity type on schema routes is refused", async () => {
      const res = await post(
        "/register_schema",
        { ...registerBody("x"), entity_type: "" },
        "retrieve-only"
      );
      expect(res.status).toBe(400);
      expect(await schemaRows("")).toHaveLength(0);
    });
  });

  // ------------------------------------------------- protected types, signers
  describe("store paths check the grant before their first write", () => {
    async function rowCount(table: string, column?: string, value?: string): Promise<number> {
      let query = db.from(table).select("id").eq("user_id", USER_ID);
      if (column !== undefined) query = query.eq(column, value);
      const { data, error } = await query;
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data as unknown[] | null)?.length ?? 0;
    }

    function blankObservation(label: string): Record<string, unknown> {
      return {
        entity_type: "",
        entity_identifier: marker(label),
        fields: { title: marker(label) },
        user_id: USER_ID,
      };
    }

    it("REST /observations/create judges a blank entity_type as * (retrieve-only grant)", async () => {
      const entitiesBefore = await rowCount("entities", "entity_type", "");
      const observationsBefore = await rowCount("observations", "entity_type", "");
      const res = await post(
        "/observations/create",
        blankObservation("obs-blank"),
        "retrieve-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await rowCount("entities", "entity_type", "")).toBe(entitiesBefore);
      expect(await rowCount("observations", "entity_type", "")).toBe(observationsBefore);
    });

    it("REST /observations/create judges a blank entity_type as * (grant scoped to task)", async () => {
      const observationsBefore = await rowCount("observations", "entity_type", "");
      const res = await post(
        "/observations/create",
        blankObservation("obs-blank-task"),
        "task-only-all"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await rowCount("observations", "entity_type", "")).toBe(observationsBefore);
    });

    it("REST /observations/create refuses a blank entity_type from a revoked grant", async () => {
      const observationsBefore = await rowCount("observations", "entity_type", "");
      const res = await post(
        "/observations/create",
        blankObservation("obs-blank-revoked"),
        "revoked"
      );
      expect(res.status).toBe(403);
      expect(await rowCount("observations", "entity_type", "")).toBe(observationsBefore);
    });

    it("REST /store judges a blank entity_type as * and writes no source row", async () => {
      const sourcesBefore = await rowCount("sources");
      const res = await post(
        "/store",
        {
          idempotency_key: `capcov-store-blank-${randomUUID()}`,
          entities: [{ entity_type: "", title: marker("store-blank") }],
        },
        "task-only-all"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await rowCount("sources")).toBe(sourcesBefore);
    });

    it("MCP store refuses a type the grant does not cover before any source or schema row", async () => {
      const kind = `capcov_unknown_${randomBytes(4).toString("hex")}`;
      createdSchemaTypes.push(kind);
      const sourcesBefore = await rowCount("sources");
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-mcp-unknown-${randomUUID()}`,
            entities: [{ entity_type: kind, name: marker("unknown") }],
          },
          "task-only-all"
        )
      );
      expectDenied(error, "store");
      expect(await rowCount("sources")).toBe(sourcesBefore);
      expect(await schemaRows(kind)).toHaveLength(0);
    });

    it("MCP store refuses a mixed batch before writing the covered entity", async () => {
      const title = marker("mixed-task");
      const sourcesBefore = await rowCount("sources");
      const tasksBefore = await rowCount("entities", "entity_type", "task");
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-mcp-mixed-${randomUUID()}`,
            entities: [
              { entity_type: "task", title },
              { entity_type: "contact", name: marker("mixed-contact") },
            ],
          },
          "task-only-all"
        )
      );
      expectDenied(error, "store");
      expect(await rowCount("sources")).toBe(sourcesBefore);
      expect(await rowCount("entities", "entity_type", "task")).toBe(tasksBefore);
    });

    it("MCP store refuses a retrieve-only grant without persisting the payload", async () => {
      const sourcesBefore = await rowCount("sources");
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capcov-mcp-retrieve-${randomUUID()}`,
            entities: [{ entity_type: "task", title: marker("retrieve-only") }],
          },
          "retrieve-only"
        )
      );
      expectDenied(error, "store");
      expect(await rowCount("sources")).toBe(sourcesBefore);
    });

    it("MCP store still writes a batch the grant covers", async () => {
      const title = marker("covered-task");
      const result = (await tool(
        "store",
        {
          idempotency_key: `capcov-mcp-covered-${randomUUID()}`,
          entities: [{ entity_type: "task", title }],
        },
        "task-only-all"
      )) as ToolResult;
      const parsed = JSON.parse(result.content[0].text) as {
        entities?: Array<{ entity_id: string }>;
      };
      const id = parsed.entities?.[0]?.entity_id;
      expect(typeof id).toBe("string");
      createdEntityIds.push(id as string);
      expect(await observationCount(id as string)).toBeGreaterThan(0);
    });
  });

  describe("protected types and signer kinds", () => {
    async function seedGrantEntity(): Promise<string> {
      const grant = await createGrant(USER_ID, {
        label: marker("capcov-grant"),
        match_sub: `${marker("sub")}@capcov.test`,
        capabilities: [{ op: "retrieve", entity_types: ["*"] }],
      });
      createdEntityIds.push(grant.grant_id);
      return grant.grant_id;
    }

    it("delete on * does not reach agent_grant; naming it does", async () => {
      const id = await seedGrantEntity();
      const res = await post(
        "/delete_entity",
        { entity_id: id, entity_type: "agent_grant" },
        "delete-star"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
      const named = await post(
        "/delete_entity",
        { entity_id: id, entity_type: "agent_grant" },
        "delete-grant-named"
      );
      expect(named.status).toBe(200);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("a signature whose grant was revoked is refused", async () => {
      const id = await seedContact("revoked");
      const res = await post(
        "/delete_entity",
        { entity_id: id, entity_type: "contact" },
        "revoked"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("a signer no grant recognises follows NEOTOMA_AGENT_DEFAULT_DENY", async () => {
      const prior = process.env.NEOTOMA_AGENT_DEFAULT_DENY;
      try {
        process.env.NEOTOMA_AGENT_DEFAULT_DENY = "true";
        const refused = await seedContact("unrecognised-deny");
        const res = await post(
          "/delete_entity",
          { entity_id: refused, entity_type: "contact" },
          "nobody-knows-this-key"
        );
        expect(res.status).toBe(403);
        expect(await isEntityDeleted(refused, USER_ID)).toBe(false);

        delete process.env.NEOTOMA_AGENT_DEFAULT_DENY;
        const allowed = await seedContact("unrecognised-allow");
        const ok = await post(
          "/delete_entity",
          { entity_id: allowed, entity_type: "contact" },
          "nobody-knows-this-key"
        );
        expect(ok.status).toBe(200);
        expect(await isEntityDeleted(allowed, USER_ID)).toBe(true);
      } finally {
        if (prior === undefined) delete process.env.NEOTOMA_AGENT_DEFAULT_DENY;
        else process.env.NEOTOMA_AGENT_DEFAULT_DENY = prior;
      }
    });
  });

  // ----------------------------------------------------------------- restore
  describe("restore_entity", () => {
    async function seedDeleted(label: string): Promise<string> {
      const id = await seedContact(label);
      const deleted = await softDeleteEntity(id, "contact", USER_ID);
      expect(deleted.success).toBe(true);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
      return id;
    }

    it("REST refuses a retrieve-only grant with 403 and the entity stays deleted", async () => {
      const id = await seedDeleted("res-rest-ro");
      const res = await post(
        "/restore_entity",
        { entity_id: id, entity_type: "contact" },
        "retrieve-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("REST refuses store and correct on every type: neither implies restore", async () => {
      const id = await seedDeleted("res-rest-sc");
      const res = await post(
        "/restore_entity",
        { entity_id: id, entity_type: "contact" },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("REST restores for a grant that names restore", async () => {
      const id = await seedDeleted("res-rest-ok");
      const res = await post(
        "/restore_entity",
        { entity_id: id, entity_type: "contact" },
        "ops-all"
      );
      expect(res.status).toBe(200);
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("MCP refuses a retrieve-only grant and the entity stays deleted", async () => {
      const id = await seedDeleted("res-mcp-ro");
      const error = await capture(() =>
        tool("restoreEntity", { entity_id: id, entity_type: "contact" }, "retrieve-only")
      );
      expectDenied(error, "restore");
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });

    it("MCP restores for a grant that names restore", async () => {
      const id = await seedDeleted("res-mcp-ok");
      await tool("restoreEntity", { entity_id: id, entity_type: "contact" }, "ops-all");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });
  });

  // ------------------------------------------------------------------- merge
  describe("merge", () => {
    it("REST /entities/merge refuses a retrieve-only grant with 403 and nothing merges", async () => {
      const from = await seedContact("mrg-rest-ro-a");
      const to = await seedContact("mrg-rest-ro-b");
      const before = await observationCount(to);
      const res = await post(
        "/entities/merge",
        { from_entity_id: from, to_entity_id: to, merge_reason: "capcov" },
        "retrieve-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await mergedInto(from)).toBeNull();
      expect(await observationCount(to)).toBe(before);
    });

    it("REST /entities/merge refuses store and correct on every type", async () => {
      const from = await seedContact("mrg-rest-sc-a");
      const to = await seedContact("mrg-rest-sc-b");
      const res = await post(
        "/entities/merge",
        { from_entity_id: from, to_entity_id: to, merge_reason: "capcov" },
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(await mergedInto(from)).toBeNull();
    });

    it("REST /entities/merge merges for a grant that names merge", async () => {
      const from = await seedContact("mrg-rest-ok-a");
      const to = await seedContact("mrg-rest-ok-b");
      const res = await post(
        "/entities/merge",
        { from_entity_id: from, to_entity_id: to, merge_reason: "capcov" },
        "ops-all"
      );
      expect(res.status).toBe(200);
      expect(await mergedInto(from)).toBe(to);
    });

    it("MCP merge_entities refuses a retrieve-only grant and nothing merges", async () => {
      const from = await seedContact("mrg-mcp-ro-a");
      const to = await seedContact("mrg-mcp-ro-b");
      const error = await capture(() =>
        tool(
          "mergeEntities",
          { from_entity_id: from, to_entity_id: to, merge_reason: "capcov" },
          "retrieve-only"
        )
      );
      expectDenied(error, "merge");
      expect(await mergedInto(from)).toBeNull();
    });

    it("MCP merge_entities merges for a grant that names merge", async () => {
      const from = await seedContact("mrg-mcp-ok-a");
      const to = await seedContact("mrg-mcp-ok-b");
      await tool(
        "mergeEntities",
        { from_entity_id: from, to_entity_id: to, merge_reason: "capcov" },
        "ops-all"
      );
      expect(await mergedInto(from)).toBe(to);
    });
  });

  // ------------------------------------------------------------------- split
  describe("split", () => {
    function splitBody(source: string, name: string): Record<string, unknown> {
      return {
        source_entity_id: source,
        predicate: { observation_field_equals: { field: "move", value: "yes" } },
        new_entity: { entity_type: "contact", canonical_name: name },
        idempotency_key: `capcov-split-${randomUUID()}`,
        reason: "capcov",
      };
    }

    it("REST /entities/split refuses a retrieve-only grant with 403 and nothing moves", async () => {
      const source = await seedSplittable("spl-rest-ro");
      const before = await observationCount(source);
      const name = marker("spl-rest-ro-new");
      const res = await post("/entities/split", splitBody(source, name), "retrieve-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await observationCount(source)).toBe(before);
      expect(await entitiesNamed(name)).toBe(0);
    });

    it("REST /entities/split refuses store and correct on every type", async () => {
      const source = await seedSplittable("spl-rest-sc");
      const before = await observationCount(source);
      const res = await post(
        "/entities/split",
        splitBody(source, marker("spl-rest-sc-new")),
        "store-correct-star"
      );
      expect(res.status).toBe(403);
      expect(await observationCount(source)).toBe(before);
    });

    it("REST /entities/split splits for a grant that names split", async () => {
      const source = await seedSplittable("spl-rest-ok");
      const before = await observationCount(source);
      const res = await post(
        "/entities/split",
        splitBody(source, marker("spl-rest-ok-new")),
        "ops-all"
      );
      expect(res.status).toBe(200);
      const newId = res.body.new_entity_id as string;
      createdEntityIds.push(newId);
      expect(res.body.observations_moved).toBe(1);
      expect(await observationCount(source)).toBe(before - 1);
    });

    it("MCP split_entity refuses a retrieve-only grant and nothing moves", async () => {
      const source = await seedSplittable("spl-mcp-ro");
      const before = await observationCount(source);
      const name = marker("spl-mcp-ro-new");
      const error = await capture(() =>
        tool("splitEntity", splitBody(source, name), "retrieve-only")
      );
      expectDenied(error, "split");
      expect(await observationCount(source)).toBe(before);
      expect(await entitiesNamed(name)).toBe(0);
    });

    it("MCP split_entity splits for a grant that names split", async () => {
      const source = await seedSplittable("spl-mcp-ok");
      const before = await observationCount(source);
      const result = await tool(
        "splitEntity",
        splitBody(source, marker("spl-mcp-ok-new")),
        "ops-all"
      );
      const body = JSON.parse(result.content[0].text) as { new_entity_id: string };
      createdEntityIds.push(body.new_entity_id);
      expect(await observationCount(source)).toBe(before - 1);
    });
  });

  // ---------------------------------------------------------- register_schema
  describe("register_schema", () => {
    it("REST refuses a retrieve-only grant with 403 and no schema row is written", async () => {
      const t = schemaType("reg_rest_ro");
      const res = await post("/register_schema", registerBody(t), "retrieve-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await schemaRows(t)).toHaveLength(0);
    });

    it("REST refuses store and correct on every type: neither implies register_schema", async () => {
      const t = schemaType("reg_rest_sc");
      const res = await post("/register_schema", registerBody(t), "store-correct-star");
      expect(res.status).toBe(403);
      expect(await schemaRows(t)).toHaveLength(0);
    });

    it("REST registers for a grant that names register_schema", async () => {
      const t = schemaType("reg_rest_ok");
      const res = await post("/register_schema", registerBody(t), "ops-all");
      expect(res.status).toBe(200);
      expect((await schemaRows(t)).length).toBeGreaterThan(0);
    });

    it("MCP refuses a retrieve-only grant and no schema row is written", async () => {
      const t = schemaType("reg_mcp_ro");
      const error = await capture(() => tool("registerSchema", registerBody(t), "retrieve-only"));
      expectDenied(error, "register_schema");
      expect(await schemaRows(t)).toHaveLength(0);
    });

    it("MCP registers for a grant that names register_schema", async () => {
      const t = schemaType("reg_mcp_ok");
      await tool("registerSchema", registerBody(t), "ops-all");
      expect((await schemaRows(t)).length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------- update_schema_incremental
  describe("update_schema_incremental", () => {
    async function seedSchema(label: string): Promise<string> {
      const t = schemaType(label);
      const res = await post("/register_schema", registerBody(t));
      expect(res.status).toBe(200);
      return t;
    }

    function addFieldBody(t: string, field: string): Record<string, unknown> {
      return {
        entity_type: t,
        fields_to_add: [{ field_name: field, field_type: "string" }],
      };
    }

    it("REST refuses a retrieve-only grant with 403 and the schema is unchanged", async () => {
      const t = await seedSchema("inc_rest_ro");
      const res = await post(
        "/update_schema_incremental",
        addFieldBody(t, "added_field"),
        "retrieve-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await activeFieldNames(t)).not.toContain("added_field");
    });

    it("REST updates for a grant that names register_schema", async () => {
      const t = await seedSchema("inc_rest_ok");
      const res = await post(
        "/update_schema_incremental",
        addFieldBody(t, "added_field"),
        "ops-all"
      );
      expect(res.status).toBe(200);
      expect(await activeFieldNames(t)).toContain("added_field");
    });

    it("MCP refuses a retrieve-only grant and the schema is unchanged", async () => {
      const t = await seedSchema("inc_mcp_ro");
      const error = await capture(() =>
        tool("updateSchemaIncremental", addFieldBody(t, "added_field"), "retrieve-only")
      );
      expectDenied(error, "register_schema");
      expect(await activeFieldNames(t)).not.toContain("added_field");
    });

    it("MCP updates for a grant that names register_schema", async () => {
      const t = await seedSchema("inc_mcp_ok");
      await tool("updateSchemaIncremental", addFieldBody(t, "added_field"), "ops-all");
      expect(await activeFieldNames(t)).toContain("added_field");
    });
  });

  // ---------------------------------------------------------- manage_bundles
  describe("manage_bundles", () => {
    for (const action of ["install", "enable", "disable"] as const) {
      it(`refuses ${action} for a retrieve-only grant before the registry is touched`, async () => {
        const error = await capture(() =>
          tool("handleManageBundles", { action, bundle: BUNDLE }, "retrieve-only")
        );
        expectDenied(error, "register_schema");
        resetBundleStateCacheForTesting();
        expect(isBundleEnabled(BUNDLE)).toBe(true);
      });
    }

    it("refuses install for register_schema scoped to one type (bundles need *)", async () => {
      const error = await capture(() =>
        tool("handleManageBundles", { action: "install", bundle: BUNDLE }, "schema-one-type")
      );
      expectDenied(error, "register_schema");
    });

    it("installs for a grant with register_schema on *", async () => {
      const installed = await tool(
        "handleManageBundles",
        { action: "install", bundle: BUNDLE },
        "ops-all"
      );
      expect(installed.content[0].text).toContain('"ok":true');
      expect(isBundleEnabled(BUNDLE)).toBe(true);
    });

    it("list stays open to a retrieve-only grant", async () => {
      const listed = await tool("handleManageBundles", { action: "list" }, "retrieve-only");
      expect(JSON.parse(listed.content[0].text).ok).toBe(true);
    });
  });
});
