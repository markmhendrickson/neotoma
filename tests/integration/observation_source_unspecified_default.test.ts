/**
 * Effect tests for #2241: an omitted `observation_source` is stored as
 * `unspecified` (not `llm_summary`) and the store response says so.
 *
 * Before #2241, a store request that omitted `observation_source` was
 * recorded as `llm_summary`, so silence became a positive claim that a
 * language model produced the value. These tests drive each public store
 * surface the way a caller would, then read the stored observation back
 * through that same surface's own read path and assert the persisted value:
 *
 *   - REST: `POST /store` → `POST /list_observations`
 *   - MCP:  `store` tool  → `list_observations` tool (tool dispatch, not a
 *           private method, so the MCP argument parsing is exercised)
 *   - Conditional store (`expected_entity_absent`) on REST and MCP, which
 *     runs through its own write function.
 *
 * The CLI surface is covered in tests/cli/cli_store_observation_source.test.ts
 * (it shells out to the built CLI against the shared test API server).
 *
 * Every mutating call carries an `idempotency_key`. Every read-back uses the
 * same authenticated user as the write, and the MCP block also asserts the
 * written entity is not readable as a different user.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { app } from "../../src/actions.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const RUN = `obs2241-${Date.now()}`;
const ENTITY_TYPE = "test_obs_source_2241_note";
// Conditional stores need a registered schema with a declared identity.
const COND_TYPE = "test_obs_source_2241_cond";
const REST_USER_ID = LOCAL_DEV_USER_ID;
const MCP_USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();

const API_PORT = 18341;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

type StoreWarning = {
  code: string;
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

type StoreBody = {
  entities?: Array<{ entity_id: string; entity_type: string }>;
  store_warnings?: StoreWarning[];
  error?: unknown;
};

type ObservationRow = { entity_id: string; observation_source: string | null };

function omittedWarnings(body: StoreBody): StoreWarning[] {
  return (body.store_warnings ?? []).filter((w) => w.code === "OBSERVATION_SOURCE_OMITTED");
}

// ─── REST helpers ────────────────────────────────────────────────────────────

async function restStore(payload: Record<string, unknown>): Promise<StoreBody> {
  const res = await fetch(`${API_BASE}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as StoreBody;
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
}

async function restObservations(entityId: string): Promise<ObservationRow[]> {
  const res = await fetch(`${API_BASE}/list_observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { observations: ObservationRow[] };
  return body.observations;
}

// ─── MCP helpers ─────────────────────────────────────────────────────────────

async function mcpCall(
  server: NeotomaServer,
  tool: string,
  args: Record<string, unknown>,
  userId: string
): Promise<Record<string, unknown>> {
  const result = await server.executeToolForCli(tool, args, userId);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

async function mcpStore(
  server: NeotomaServer,
  args: Record<string, unknown>,
  userId = MCP_USER_ID
): Promise<StoreBody> {
  return (await mcpCall(server, "store", { user_id: userId, ...args }, userId)) as StoreBody;
}

async function mcpObservations(
  server: NeotomaServer,
  entityId: string,
  userId = MCP_USER_ID
): Promise<ObservationRow[]> {
  const body = await mcpCall(server, "list_observations", { entity_id: entityId }, userId);
  return body.observations as ObservationRow[];
}

function entity(label: string): Record<string, unknown> {
  return { entity_type: ENTITY_TYPE, canonical_name: `${RUN} ${label}`, title: label };
}

function conditionalEntity(label: string): Record<string, unknown> {
  return { entity_type: COND_TYPE, code: `${RUN}-${label}`, title: label };
}

async function registerConditionalSchema(userId: string): Promise<void> {
  if (await schemaRegistry.loadActiveSchema(COND_TYPE, userId)) return;
  await schemaRegistry.register({
    entity_type: COND_TYPE,
    schema_version: "1.0",
    schema_definition: {
      fields: {
        code: { type: "string", required: false },
        title: { type: "string", required: false },
      },
      canonical_name_fields: ["code"],
    },
    reducer_config: {
      merge_policies: {
        code: { strategy: "last_write" },
        title: { strategy: "last_write" },
      },
    },
    user_id: userId,
    user_specific: true,
    activate: true,
  });
}

describe("observation_source omission is recorded as unspecified (#2241)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    server = new NeotomaServer();
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    await registerConditionalSchema(REST_USER_ID);
    await registerConditionalSchema(MCP_USER_ID);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    for (const userId of [REST_USER_ID, MCP_USER_ID, OTHER_USER_ID]) {
      await cleanupEntityType(ENTITY_TYPE, userId);
      await cleanupEntityType(COND_TYPE, userId);
    }
    await cleanupTestSchema(COND_TYPE, REST_USER_ID);
    await cleanupTestSchema(COND_TYPE, MCP_USER_ID);
  });

  // ─── REST ──────────────────────────────────────────────────────────────────

  describe("REST POST /store", () => {
    it("omitted → stored as unspecified, with one OBSERVATION_SOURCE_OMITTED warning", async () => {
      const body = await restStore({
        idempotency_key: `${RUN}-rest-omitted`,
        entities: [entity("rest omitted")],
      });
      expect(body.error).toBeUndefined();
      const entityId = body.entities![0].entity_id;

      const warnings = omittedWarnings(body);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        observation_index: 0,
        entity_type: ENTITY_TYPE,
        entity_id: entityId,
      });
      expect(warnings[0].message).toContain("observation_source");
      expect(warnings[0].message).toContain('"unspecified"');

      const observations = await restObservations(entityId);
      expect(observations.length).toBeGreaterThan(0);
      for (const obs of observations) expect(obs.observation_source).toBe("unspecified");
    });

    it.each(["llm_summary", "import"])(
      "explicit %s → persisted exactly as sent, no omission warning",
      async (kind) => {
        const body = await restStore({
          idempotency_key: `${RUN}-rest-explicit-${kind}`,
          observation_source: kind,
          entities: [entity(`rest explicit ${kind}`)],
        });
        expect(omittedWarnings(body)).toHaveLength(0);
        const observations = await restObservations(body.entities![0].entity_id);
        expect(observations.map((o) => o.observation_source)).toEqual([kind]);
      }
    );

    it("explicit unspecified → persisted as unspecified with NO omission warning", async () => {
      // An explicit `unspecified` and an omitted field persist identically;
      // only the warning tells them apart, so it must not fire here.
      const body = await restStore({
        idempotency_key: `${RUN}-rest-explicit-unspecified`,
        observation_source: "unspecified",
        entities: [entity("rest explicit unspecified")],
      });
      expect(omittedWarnings(body)).toHaveLength(0);
      const observations = await restObservations(body.entities![0].entity_id);
      expect(observations.map((o) => o.observation_source)).toEqual(["unspecified"]);
    });

    it("multi-entity batch, field omitted once → every observation unspecified, ONE warning", async () => {
      const body = await restStore({
        idempotency_key: `${RUN}-rest-batch`,
        entities: [entity("rest batch a"), entity("rest batch b"), entity("rest batch c")],
      });
      expect(body.entities).toHaveLength(3);
      const warnings = omittedWarnings(body);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].observation_index).toBe(0);
      expect(warnings[0].entity_id).toBe(body.entities![0].entity_id);
      for (const e of body.entities!) {
        const observations = await restObservations(e.entity_id);
        expect(observations.map((o) => o.observation_source)).toEqual(["unspecified"]);
      }
    });

    it("conditional store (expected_entity_absent) omitted → unspecified + warning", async () => {
      const body = await restStore({
        idempotency_key: `${RUN}-rest-conditional`,
        expected_entity_absent: true,
        entities: [conditionalEntity("rest-conditional")],
      });
      const entityId = body.entities![0].entity_id;
      const warnings = omittedWarnings(body);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].entity_id).toBe(entityId);
      const observations = await restObservations(entityId);
      expect(observations.map((o) => o.observation_source)).toEqual(["unspecified"]);
    });
  });

  // ─── MCP ───────────────────────────────────────────────────────────────────

  describe("MCP store tool", () => {
    it("omitted → stored as unspecified, with one OBSERVATION_SOURCE_OMITTED warning", async () => {
      const body = await mcpStore(server, {
        idempotency_key: `${RUN}-mcp-omitted`,
        entities: [entity("mcp omitted")],
      });
      expect(body.error).toBeUndefined();
      const entityId = body.entities![0].entity_id;

      const warnings = omittedWarnings(body);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        observation_index: 0,
        entity_type: ENTITY_TYPE,
        entity_id: entityId,
      });

      const observations = await mcpObservations(server, entityId);
      expect(observations.length).toBeGreaterThan(0);
      for (const obs of observations) expect(obs.observation_source).toBe("unspecified");

      // Tenant isolation: the same entity is invisible to a different user.
      expect(await mcpObservations(server, entityId, OTHER_USER_ID)).toEqual([]);
    });

    it.each(["llm_summary", "sensor"])(
      "explicit %s → persisted exactly as sent, no omission warning",
      async (kind) => {
        const body = await mcpStore(server, {
          idempotency_key: `${RUN}-mcp-explicit-${kind}`,
          observation_source: kind,
          entities: [entity(`mcp explicit ${kind}`)],
        });
        expect(omittedWarnings(body)).toHaveLength(0);
        const observations = await mcpObservations(server, body.entities![0].entity_id);
        expect(observations.map((o) => o.observation_source)).toEqual([kind]);
      }
    );

    it("explicit unspecified → persisted as unspecified with NO omission warning", async () => {
      const body = await mcpStore(server, {
        idempotency_key: `${RUN}-mcp-explicit-unspecified`,
        observation_source: "unspecified",
        entities: [entity("mcp explicit unspecified")],
      });
      expect(omittedWarnings(body)).toHaveLength(0);
      const observations = await mcpObservations(server, body.entities![0].entity_id);
      expect(observations.map((o) => o.observation_source)).toEqual(["unspecified"]);
    });

    it("multi-entity batch, field omitted once → every observation unspecified, ONE warning", async () => {
      const body = await mcpStore(server, {
        idempotency_key: `${RUN}-mcp-batch`,
        entities: [entity("mcp batch a"), entity("mcp batch b")],
      });
      expect(body.entities).toHaveLength(2);
      expect(omittedWarnings(body)).toHaveLength(1);
      for (const e of body.entities!) {
        const observations = await mcpObservations(server, e.entity_id);
        expect(observations.map((o) => o.observation_source)).toEqual(["unspecified"]);
      }
    });

    it("conditional store (expected_entity_absent) omitted → unspecified + warning", async () => {
      const body = await mcpStore(server, {
        idempotency_key: `${RUN}-mcp-conditional`,
        expected_entity_absent: true,
        entities: [conditionalEntity("mcp-conditional")],
      });
      const entityId = body.entities![0].entity_id;
      expect(omittedWarnings(body)).toHaveLength(1);
      const observations = await mcpObservations(server, entityId);
      expect(observations.map((o) => o.observation_source)).toEqual(["unspecified"]);
    });

    it("rejects an observation_source outside the enum", async () => {
      await expect(
        mcpStore(server, {
          idempotency_key: `${RUN}-mcp-invalid`,
          observation_source: "robot",
          entities: [entity("mcp invalid")],
        })
      ).rejects.toThrow();
    });
  });
});
