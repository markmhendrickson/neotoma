/**
 * Capability parity across write entry points: `POST /observations/create`,
 * `POST /interpretations/create` and MCP `create_interpretation` must apply the
 * same per-type `store` capability scope as `POST /store` and MCP `store`.
 *
 * Each REST case drives the real Express app over HTTP against the local test
 * database; each MCP case drives the real NeotomaServer tool method. Agent
 * admission is injected by mocking the AAuth signature verifier and the grant
 * lookup (the pattern in batch_correct_capability_parity.test.ts and
 * relationship_write_capability_surfaces.test.ts), so the request still runs
 * the real middleware chain, identity threading, route and service. Every
 * assertion is on the EFFECT: a refused request creates no entity, no
 * observation and no interpretation run.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const GRANT_HEADER = "x-test-store-cap-parity-grant";
const THUMBPRINT_PREFIX = "tp-store-cap-parity-";

/** Grants by name, shared by the HTTP admission mock and the MCP context. */
const GRANTS = vi.hoisted(
  (): Record<string, Array<{ op: string; entity_types: string[] }>> => ({
    // Can store a different type only.
    "other-type": [
      { op: "store", entity_types: ["task"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // Holds no `store` capability at all.
    "no-store": [
      { op: "retrieve", entity_types: ["*"] },
      { op: "correct", entity_types: ["contact", "task"] },
    ],
    // Holds `store` for the types the in-scope cases write.
    "in-scope": [
      { op: "store", entity_types: ["contact", "task"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // Holds `store` for an alias spelling that resolves to a type it does not hold.
    "alias-declared": [
      { op: "store", entity_types: ["task", "individual"] },
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
          sub: "writer@swarm.test",
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
        grant_id: `ent_test_store_cap_parity_${key}`,
        agent_label: `store capability parity ${key}`,
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
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { runWithRequestContext } from "../../src/services/request_context.js";

const USER_ID = LOCAL_DEV_USER_ID;

const createdSourceIds: string[] = [];

async function seedSource(): Promise<string> {
  const id = randomUUID();
  const { error } = await db.from("sources").insert({
    id,
    content_hash: `store_cap_parity_${id}`,
    mime_type: "application/json",
    storage_url: `internal://test/${id}`,
    file_size: 0,
    user_id: USER_ID,
  });
  if (error) throw new Error(`seed source: ${error.message}`);
  createdSourceIds.push(id);
  return id;
}

/** Entities of `entityType` whose canonical name carries `marker`. */
async function entitiesNamed(entityType: string, marker: string): Promise<string[]> {
  const { data, error } = await db
    .from("entities")
    .select("id, canonical_name")
    .eq("entity_type", entityType)
    .eq("user_id", USER_ID);
  if (error) throw new Error(`list entities: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; canonical_name: string }>)
    .filter((row) => row.canonical_name.toLowerCase().includes(marker.toLowerCase()))
    .map((row) => row.id);
}

/** Number of entities of `entityType` the owner has. */
async function entityCount(entityType: string): Promise<number> {
  const { data, error } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", entityType)
    .eq("user_id", USER_ID);
  if (error) throw new Error(`count entities: ${error.message}`);
  return (data as unknown[] | null)?.length ?? 0;
}

async function observationCountFor(entityIds: string[]): Promise<number> {
  if (entityIds.length === 0) return 0;
  const { data, error } = await db
    .from("observations")
    .select("id")
    .in("entity_id", entityIds)
    .eq("user_id", USER_ID);
  if (error) throw new Error(`count observations: ${error.message}`);
  return (data as unknown[] | null)?.length ?? 0;
}

async function interpretationCount(sourceId: string): Promise<number> {
  const { data, error } = await db
    .from("interpretations")
    .select("id")
    .eq("source_id", sourceId)
    .eq("user_id", USER_ID);
  if (error) throw new Error(`count interpretations: ${error.message}`);
  return (data as unknown[] | null)?.length ?? 0;
}

function runAsGrant<T>(grant: string, fn: () => Promise<T>): Promise<T> {
  const agentIdentity: AgentIdentity = {
    sub: "writer@swarm.test",
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
        grant_id: `ent_test_store_cap_parity_${grant}`,
        agent_label: `store capability parity ${grant}`,
        capabilities: GRANTS[grant] as AgentCapabilityEntry[],
      },
    },
    fn
  );
}

type ToolResult = { content: Array<{ text: string }> };

describe("store capability scope applies to observations/create and interpretations", () => {
  let httpServer: Server;
  let baseUrl: string;
  let mcp: NeotomaServer;

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

  function createObservation(marker: string, grant?: string) {
    return post(
      "/observations/create",
      {
        entity_type: "contact",
        entity_identifier: marker,
        fields: { name: marker },
        user_id: USER_ID,
      },
      grant
    );
  }

  function createInterpretation(
    sourceId: string,
    entities: Array<Record<string, unknown>>,
    grant?: string
  ) {
    return post("/interpretations/create", { source_id: sourceId, entities }, grant);
  }

  async function mcpCreateInterpretation(
    sourceId: string,
    entities: Array<Record<string, unknown>>,
    grant?: string
  ): Promise<ToolResult> {
    const call = () =>
      (
        mcp as unknown as Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>
      ).createInterpretation.call(mcp, { source_id: sourceId, entities });
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

  function marker(label: string): string {
    return `cap-parity-${label}-${randomBytes(6).toString("hex")}`;
  }

  beforeAll(async () => {
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
    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("interpretations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
  });

  // ------------------------------------------------- POST /observations/create
  describe("POST /observations/create", () => {
    it("refuses an admitted agent whose grant scopes store to a different type, and writes nothing", async () => {
      const name = marker("obs-other");
      const before = await entityCount("contact");

      const res = await createObservation(name, "other-type");

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await entityCount("contact")).toBe(before);
    });

    it("refuses an admitted agent whose grant holds no store capability, and writes nothing", async () => {
      const name = marker("obs-nostore");
      const before = await entityCount("contact");

      const res = await createObservation(name, "no-store");

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await entityCount("contact")).toBe(before);
    });

    it("answers the same way /store does for the same grant and type", async () => {
      const name = marker("obs-parity");

      const stored = await post(
        "/store",
        {
          idempotency_key: `store-cap-parity-${randomUUID()}`,
          entities: [{ entity_type: "contact", name }],
        },
        "other-type"
      );
      const observed = await createObservation(name, "other-type");

      expect(stored.status).toBe(403);
      expect(observed.status).toBe(stored.status);
      expect(observed.body.error_code).toBe(stored.body.error_code);
    });

    it("writes the observation for an admitted agent whose grant covers store on the type", async () => {
      const name = marker("obs-allowed");

      const before = await entityCount("contact");

      const res = await createObservation(name, "in-scope");

      expect(res.status).toBe(200);
      expect(await entityCount("contact")).toBe(before + 1);
      expect(await observationCountFor([res.body.entity_id as string])).toBeGreaterThan(0);
    });

    it("is unchanged for an operator request that carries no agent identity", async () => {
      const name = marker("obs-operator");

      const before = await entityCount("contact");

      const res = await createObservation(name);

      expect(res.status).toBe(200);
      expect(await entityCount("contact")).toBe(before + 1);
      expect(await observationCountFor([res.body.entity_id as string])).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------- POST /interpretations/create
  describe("POST /interpretations/create", () => {
    it("refuses an admitted agent whose grant scopes store to a different type, and writes nothing", async () => {
      const sourceId = await seedSource();
      const name = marker("interp-other");
      const before = await entityCount("contact");

      const res = await createInterpretation(
        sourceId,
        [{ entity_type: "contact", name }],
        "other-type"
      );

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entityCount("contact")).toBe(before);
    });

    it("refuses an admitted agent whose grant holds no store capability, and writes nothing", async () => {
      const sourceId = await seedSource();
      const name = marker("interp-nostore");

      const res = await createInterpretation(
        sourceId,
        [{ entity_type: "task", title: name }],
        "no-store"
      );

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entitiesNamed("task", name)).toEqual([]);
    });

    it("refuses the whole request when only one of several entities is out of scope", async () => {
      const sourceId = await seedSource();
      const allowed = marker("interp-mixed-ok");
      const denied = marker("interp-mixed-no");
      const contactsBefore = await entityCount("contact");

      const res = await createInterpretation(
        sourceId,
        [
          { entity_type: "task", title: allowed },
          { entity_type: "contact", name: denied },
        ],
        "other-type"
      );

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entitiesNamed("task", allowed)).toEqual([]);
      expect(await entityCount("contact")).toBe(contactsBefore);
    });

    it("judges the type an entity resolves to, not only the spelling the caller declared", async () => {
      const sourceId = await seedSource();
      const name = marker("interp-alias");
      const before = await entityCount("person");

      // "individual" is an alias of `person`; the grant covers the alias
      // spelling but not the type the entity would be written under.
      const res = await createInterpretation(
        sourceId,
        [{ entity_type: "individual", name }],
        "alias-declared"
      );

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entityCount("person")).toBe(before);
    });

    it("reads the type from the `type` key as the interpretation does", async () => {
      const sourceId = await seedSource();
      const name = marker("interp-typekey");

      const res = await createInterpretation(sourceId, [{ type: "contact", name }], "other-type");

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await interpretationCount(sourceId)).toBe(0);
    });

    it("writes the interpretation for an admitted agent whose grant covers store on the type", async () => {
      const sourceId = await seedSource();
      const name = marker("interp-allowed");

      const res = await createInterpretation(
        sourceId,
        [{ entity_type: "task", title: name }],
        "in-scope"
      );

      expect(res.status).toBe(200);
      expect(await interpretationCount(sourceId)).toBe(1);
      expect(await entitiesNamed("task", name)).toHaveLength(1);
    });

    it("is unchanged for an operator request that carries no agent identity", async () => {
      const sourceId = await seedSource();
      const name = marker("interp-operator");

      const res = await createInterpretation(sourceId, [{ entity_type: "task", title: name }]);

      expect(res.status).toBe(200);
      expect(await interpretationCount(sourceId)).toBe(1);
      expect(await entitiesNamed("task", name)).toHaveLength(1);
    });
  });

  // --------------------------------------------------- MCP create_interpretation
  describe("MCP create_interpretation", () => {
    it("refuses an admitted agent whose grant scopes store to a different type, and writes nothing", async () => {
      const sourceId = await seedSource();
      const name = marker("mcp-other");
      const before = await entityCount("contact");

      const error = await capture(() =>
        mcpCreateInterpretation(sourceId, [{ entity_type: "contact", name }], "other-type")
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entityCount("contact")).toBe(before);
    });

    it("refuses an admitted agent whose grant holds no store capability, and writes nothing", async () => {
      const sourceId = await seedSource();
      const name = marker("mcp-nostore");

      const error = await capture(() =>
        mcpCreateInterpretation(sourceId, [{ entity_type: "task", title: name }], "no-store")
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entitiesNamed("task", name)).toEqual([]);
    });

    it("judges the type an entity resolves to, not only the spelling the caller declared", async () => {
      const sourceId = await seedSource();
      const name = marker("mcp-alias");
      const before = await entityCount("person");

      const error = await capture(() =>
        mcpCreateInterpretation(sourceId, [{ entity_type: "individual", name }], "alias-declared")
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entityCount("person")).toBe(before);
    });

    it("writes the interpretation for an admitted agent whose grant covers store on the type", async () => {
      const sourceId = await seedSource();
      const name = marker("mcp-allowed");

      const result = await mcpCreateInterpretation(
        sourceId,
        [{ entity_type: "task", title: name }],
        "in-scope"
      );

      expect(JSON.parse(result.content[0].text).success).toBe(true);
      expect(await interpretationCount(sourceId)).toBe(1);
      expect(await entitiesNamed("task", name)).toHaveLength(1);
    });

    it("is unchanged for a caller that carries no agent identity", async () => {
      const sourceId = await seedSource();
      const name = marker("mcp-operator");

      const result = await mcpCreateInterpretation(sourceId, [
        { entity_type: "task", title: name },
      ]);

      expect(JSON.parse(result.content[0].text).success).toBe(true);
      expect(await interpretationCount(sourceId)).toBe(1);
      expect(await entitiesNamed("task", name)).toHaveLength(1);
    });
  });

  // ------------------------------------------ MCP store with an interpretation
  // The interpretation leg of MCP `store` writes through runInterpretation and
  // returns before the per-entity capability check of the direct-store loop, so
  // it must apply the same scope itself, before anything is written.
  describe("MCP store with an interpretation", () => {
    async function mcpStoreInterpreted(
      entities: Array<Record<string, unknown>>,
      grant?: string
    ): Promise<ToolResult> {
      const call = () =>
        (
          mcp as unknown as Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>
        ).store.call(mcp, {
          user_id: USER_ID,
          idempotency_key: `store-cap-parity-interp-${randomUUID()}`,
          commit: true,
          entities,
          interpretation: { source_ref: "structured" },
        });
      return grant ? runAsGrant(grant, call) : call();
    }

    it("refuses an admitted agent whose grant scopes store to a different type, and writes nothing", async () => {
      const name = marker("mcp-store-interp-other");
      const before = await entityCount("contact");

      const error = await capture(() =>
        mcpStoreInterpreted([{ entity_type: "contact", name }], "other-type")
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await entityCount("contact")).toBe(before);
    });

    it("refuses a peer_config from an agent scoped to another type, and writes nothing", async () => {
      const name = marker("mcp-store-interp-peer");
      const before = await entityCount("peer_config");

      const error = await capture(() =>
        mcpStoreInterpreted(
          [
            {
              entity_type: "peer_config",
              peer_id: name,
              peer_name: name,
              peer_url: "https://peer.example",
              direction: "bidirectional",
              entity_types: ["task"],
              accept_governance_entity_types: ["standing_rule"],
            },
          ],
          "other-type"
        )
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await entityCount("peer_config")).toBe(before);
    });

    it("judges the type an entity resolves to, not only the spelling the caller declared", async () => {
      const name = marker("mcp-store-interp-alias");
      const before = await entityCount("person");

      const error = await capture(() =>
        mcpStoreInterpreted([{ entity_type: "individual", name }], "alias-declared")
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await entityCount("person")).toBe(before);
    });

    it("writes for an admitted agent whose grant covers store on the type", async () => {
      const name = marker("mcp-store-interp-allowed");

      await mcpStoreInterpreted([{ entity_type: "task", title: name }], "in-scope");

      expect(await entitiesNamed("task", name)).toHaveLength(1);
    });

    it("is unchanged for a caller that carries no agent identity", async () => {
      const name = marker("mcp-store-interp-operator");

      await mcpStoreInterpreted([{ entity_type: "task", title: name }]);

      expect(await entitiesNamed("task", name)).toHaveLength(1);
    });
  });

  // ------------------------------------------- protected types, unadmitted agent
  // The interpretation paths write observations directly, so the protected-type
  // guard in assertCurrentAgentMayStoreEntityTypes is their only protection for
  // a signed agent that holds no grant (no capability scope applies to it).
  describe("protected types from a signed agent that was not admitted", () => {
    const UNADMITTED = "unadmitted"; // not a key of GRANTS, so admission answers no_match

    function grantEntity(name: string): Record<string, unknown> {
      return {
        entity_type: "agent_grant",
        label: name,
        match_thumbprint: `tp-${name}`,
        status: "active",
        capabilities: [{ op: "store", entity_types: ["*"] }],
      };
    }

    function runUnadmitted<T>(fn: () => Promise<T>): Promise<T> {
      const agentIdentity: AgentIdentity = {
        sub: "writer@swarm.test",
        iss: "https://swarm.test",
        thumbprint: `${THUMBPRINT_PREFIX}${UNADMITTED}`,
        algorithm: "ES256",
        publicKey: '{"kty":"EC"}',
        tier: "software",
      };
      return runWithRequestContext(
        {
          agentIdentity,
          attributionDecision: null,
          aauthAdmission: { admitted: false, reason: "no_match" },
        },
        fn
      );
    }

    async function grantsCarrying(name: string): Promise<number> {
      const { data, error } = await db
        .from("observations")
        .select("id, fields")
        .eq("entity_type", "agent_grant")
        .eq("user_id", USER_ID);
      if (error) throw new Error(`list grant observations: ${error.message}`);
      return ((data ?? []) as Array<{ fields?: unknown }>).filter((row) =>
        JSON.stringify(row.fields ?? {}).includes(name)
      ).length;
    }

    it("POST /interpretations/create refuses an agent_grant with 403 and writes nothing", async () => {
      const sourceId = await seedSource();
      const name = marker("interp-unadmitted-grant");
      const before = await entityCount("agent_grant");

      const res = await createInterpretation(sourceId, [grantEntity(name)], UNADMITTED);

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entityCount("agent_grant")).toBe(before);
      expect(await grantsCarrying(name)).toBe(0);
    });

    it("MCP create_interpretation refuses an agent_grant and writes nothing", async () => {
      const sourceId = await seedSource();
      const name = marker("mcp-unadmitted-grant");
      const before = await entityCount("agent_grant");

      const error = await capture(() =>
        runUnadmitted(() =>
          (
            mcp as unknown as Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>
          ).createInterpretation.call(mcp, { source_id: sourceId, entities: [grantEntity(name)] })
        )
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await interpretationCount(sourceId)).toBe(0);
      expect(await entityCount("agent_grant")).toBe(before);
      expect(await grantsCarrying(name)).toBe(0);
    });

    it("MCP store with an interpretation refuses an agent_grant and writes nothing", async () => {
      const name = marker("mcp-store-unadmitted-grant");
      const before = await entityCount("agent_grant");

      const error = await capture(() =>
        runUnadmitted(() =>
          (
            mcp as unknown as Record<string, (a: Record<string, unknown>) => Promise<ToolResult>>
          ).store.call(mcp, {
            user_id: USER_ID,
            idempotency_key: `store-cap-parity-unadmitted-${randomUUID()}`,
            commit: true,
            entities: [grantEntity(name)],
            interpretation: { source_ref: "structured" },
          })
        )
      );

      expect(error, String((error as Error | undefined)?.message)).toBeInstanceOf(
        AgentCapabilityError
      );
      expect(await entityCount("agent_grant")).toBe(before);
      expect(await grantsCarrying(name)).toBe(0);
    });
  });
});
