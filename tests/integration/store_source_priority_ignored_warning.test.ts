/**
 * Integration tests for the SOURCE_PRIORITY_IGNORED store warning (#1755).
 *
 * `source_priority` only affects entity field values when the field's merge
 * policy actively honours it (`highest_priority` or `most_specific` with
 * `tie_breaker: "source_priority"`). Auto-discovered schemas default every
 * field to `last_write`, which silently ignores the value.  Setting a
 * non-default `source_priority` on such a type is a no-op footgun.
 *
 * This suite asserts:
 *  1. MCP `store` path — auto-discovered (no schema) entity type with
 *     `source_priority > 100` → `SOURCE_PRIORITY_IGNORED` warning with
 *     correct `code`, `observation_index`, `entity_type`, and `entity_id`.
 *  2. MCP `store` path — same entity type with default `source_priority`
 *     (100) → no warning.
 *  3. MCP `store` path — entity type with a registered `highest_priority`
 *     schema → no warning even with non-default priority.
 *  4. HTTP `POST /store` path — non-default priority + all-`last_write`
 *     schema → `SOURCE_PRIORITY_IGNORED` warning in the response body.
 *  5. HTTP `POST /store` path — default priority (100) + all-`last_write`
 *     schema → no warning.
 *
 * And for the mirror-image SOURCE_PRIORITY_ESCALATION warning (#1838):
 *  6. MCP/HTTP `store` — DEFAULT priority (100) write into a registered
 *     `highest_priority` field → `SOURCE_PRIORITY_ESCALATION` warning (the
 *     unprioritized write would silently outrank an explicit lower priority).
 *  7. MCP `store` — NON-default priority into the same field → no escalation
 *     warning (the caller ranked intentionally).
 */

import { createServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { app } from "../../src/actions.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

// Use LOCAL_DEV_USER_ID for the HTTP path (the nil-UUID is resolved by the
// local-dev auth bypass) and mirror it for the MCP path so both paths write
// to the same DB partition.
const TEST_USER_ID = LOCAL_DEV_USER_ID;

// Auto-discovered type — no schema registered; every field is effectively
// `last_write`, so source_priority is always ignored.
const AUTO_TYPE = "test_sp_ignored_auto_type";

// Registered schema type with all-`last_write` policies — also triggers the
// warning.
const LAST_WRITE_TYPE = "test_sp_ignored_last_write_type";

// Registered schema type with a `highest_priority` field — source_priority IS
// honoured; no warning expected.
const PRIORITY_TYPE = "test_sp_honoured_priority_type";

const API_PORT = 18247;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

type StoreWarning = {
  code: string;
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

type StoreResponse = {
  entities?: Array<{ entity_id: string; entity_type: string }>;
  store_warnings?: StoreWarning[];
  error?: unknown;
};

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

describe("store_warnings: SOURCE_PRIORITY_IGNORED (#1755)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

    // Spin up the Express HTTP server for the HTTP-path tests.
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    // Register the all-`last_write` schema (only if not already present).
    if (!(await schemaRegistry.loadActiveSchema(LAST_WRITE_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: LAST_WRITE_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            label: { type: "string", required: false },
            value: { type: "string", required: false },
          },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: {
          merge_policies: {
            label: { strategy: "last_write" },
            value: { strategy: "last_write" },
          },
        },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }

    // Register the `highest_priority` schema (priority IS honoured here).
    if (!(await schemaRegistry.loadActiveSchema(PRIORITY_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: PRIORITY_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            score: { type: "number", required: false },
          },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: {
          merge_policies: {
            score: { strategy: "highest_priority" },
          },
        },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupEntityType(AUTO_TYPE, TEST_USER_ID);
    await cleanupEntityType(LAST_WRITE_TYPE, TEST_USER_ID);
    await cleanupEntityType(PRIORITY_TYPE, TEST_USER_ID);
    await cleanupTestSchema(LAST_WRITE_TYPE, TEST_USER_ID);
    await cleanupTestSchema(PRIORITY_TYPE, TEST_USER_ID);
  });

  // ─── MCP path ───────────────────────────────────────────────────────────────

  it("MCP: non-default source_priority + auto-discovered type → SOURCE_PRIORITY_IGNORED warning", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `sp-ignored-auto-${Date.now()}`,
      commit: true,
      source_priority: 200,
      entities: [
        {
          entity_type: AUTO_TYPE,
          canonical_name: "auto-sp-test",
          label: "test entity",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.entities && body.entities.length).toBe(1);

    const entityId = body.entities![0].entity_id;
    const warn = (body.store_warnings ?? []).find((w) => w.code === "SOURCE_PRIORITY_IGNORED");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(AUTO_TYPE);
    expect(warn!.entity_id).toBe(entityId);
    expect(warn!.observation_index).toBe(0);
    expect(warn!.message).toContain("source_priority");
    expect(warn!.message).toContain("200");
    // #1822: message must name the written field and its effective strategy.
    expect(warn!.message).toContain("'label'");
    expect(warn!.message).toContain("last_write");
  });

  it("MCP: default source_priority (100) + auto-discovered type → no warning", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `sp-default-auto-${Date.now()}`,
      commit: true,
      // source_priority omitted → defaults to 100
      entities: [
        {
          entity_type: AUTO_TYPE,
          canonical_name: "auto-sp-default",
          label: "no warning expected",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    const hasWarning = (body.store_warnings ?? []).some(
      (w) => w.code === "SOURCE_PRIORITY_IGNORED"
    );
    expect(hasWarning).toBe(false);
  });

  it("MCP: non-default source_priority + registered highest_priority schema → no warning", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `sp-honoured-${Date.now()}`,
      commit: true,
      source_priority: 999,
      entities: [
        {
          entity_type: PRIORITY_TYPE,
          canonical_name: "priority-sp-test",
          score: 42,
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    const hasWarning = (body.store_warnings ?? []).some(
      (w) => w.code === "SOURCE_PRIORITY_IGNORED"
    );
    expect(hasWarning).toBe(false);
  });

  // ─── SOURCE_PRIORITY_ESCALATION (#1838) ──────────────────────────────────────

  it("MCP: default source_priority (100) + registered highest_priority schema → SOURCE_PRIORITY_ESCALATION warning", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `sp-escalation-${Date.now()}`,
      commit: true,
      // source_priority omitted → defaults to 100; `score` uses highest_priority.
      entities: [
        {
          entity_type: PRIORITY_TYPE,
          canonical_name: "priority-escalation-test",
          score: 7,
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.entities && body.entities.length).toBe(1);

    const entityId = body.entities![0].entity_id;
    const warn = (body.store_warnings ?? []).find((w) => w.code === "SOURCE_PRIORITY_ESCALATION");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(PRIORITY_TYPE);
    expect(warn!.entity_id).toBe(entityId);
    expect(warn!.observation_index).toBe(0);
    expect(warn!.message).toContain("100");
    expect(warn!.message).toContain("'score'");
    expect(warn!.message.toLowerCase()).toContain("outrank");
    // No IGNORED warning — the field DOES honour priority.
    const ignored = (body.store_warnings ?? []).some((w) => w.code === "SOURCE_PRIORITY_IGNORED");
    expect(ignored).toBe(false);
  });

  it("MCP: non-default source_priority + highest_priority schema → no SOURCE_PRIORITY_ESCALATION warning", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `sp-no-escalation-${Date.now()}`,
      commit: true,
      source_priority: 999,
      entities: [
        {
          entity_type: PRIORITY_TYPE,
          canonical_name: "priority-no-escalation-test",
          score: 11,
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    const hasEscalation = (body.store_warnings ?? []).some(
      (w) => w.code === "SOURCE_PRIORITY_ESCALATION"
    );
    expect(hasEscalation).toBe(false);
  });

  it("HTTP: default source_priority (100) + highest_priority schema → SOURCE_PRIORITY_ESCALATION warning", async () => {
    const res = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `http-sp-escalation-${Date.now()}`,
        commit: true,
        // source_priority omitted → defaults to 100.
        entities: [
          {
            entity_type: PRIORITY_TYPE,
            canonical_name: "http-priority-escalation-test",
            score: 13,
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.entities && body.entities.length).toBe(1);

    const warn = (body.store_warnings ?? []).find((w) => w.code === "SOURCE_PRIORITY_ESCALATION");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(PRIORITY_TYPE);
    expect(warn!.observation_index).toBe(0);
    expect(warn!.message).toContain("'score'");
    expect(warn!.message.toLowerCase()).toContain("outrank");
  });

  it("MCP: non-default source_priority + all-last_write registered schema → SOURCE_PRIORITY_IGNORED warning", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `sp-lw-${Date.now()}`,
      commit: true,
      source_priority: 50,
      entities: [
        {
          entity_type: LAST_WRITE_TYPE,
          canonical_name: "lw-sp-test",
          label: "last-write entity",
          value: "ignored",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.entities && body.entities.length).toBe(1);

    const warn = (body.store_warnings ?? []).find((w) => w.code === "SOURCE_PRIORITY_IGNORED");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(LAST_WRITE_TYPE);
    expect(warn!.observation_index).toBe(0);
    // #1822: message must name the written fields and their effective strategy.
    expect(warn!.message).toContain("'label'");
    expect(warn!.message).toContain("last_write");
  });

  // ─── HTTP /store path ────────────────────────────────────────────────────────

  it("HTTP: non-default source_priority + all-last_write schema → SOURCE_PRIORITY_IGNORED warning", async () => {
    const res = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `http-sp-lw-${Date.now()}`,
        commit: true,
        source_priority: 300,
        entities: [
          {
            entity_type: LAST_WRITE_TYPE,
            canonical_name: "http-lw-sp-test",
            label: "http last-write entity",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.entities && body.entities.length).toBe(1);

    const entityId = body.entities![0].entity_id;
    const warn = (body.store_warnings ?? []).find((w) => w.code === "SOURCE_PRIORITY_IGNORED");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(LAST_WRITE_TYPE);
    expect(warn!.entity_id).toBe(entityId);
    expect(warn!.observation_index).toBe(0);
    expect(warn!.message).toContain("source_priority");
    // #1822: message must name the written field and its effective strategy.
    expect(warn!.message).toContain("'label'");
    expect(warn!.message).toContain("last_write");
  });

  it("HTTP: default source_priority (100) + all-last_write schema → no warning", async () => {
    const res = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: `http-sp-default-${Date.now()}`,
        commit: true,
        // source_priority omitted → server defaults to 100
        entities: [
          {
            entity_type: LAST_WRITE_TYPE,
            canonical_name: "http-lw-default",
            label: "no warning expected",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as StoreResponse;
    expect(body.error).toBeUndefined();
    const hasWarning = (body.store_warnings ?? []).some(
      (w) => w.code === "SOURCE_PRIORITY_IGNORED"
    );
    expect(hasWarning).toBe(false);
  });
});
