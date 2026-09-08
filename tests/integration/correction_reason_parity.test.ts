/**
 * Cross-surface effect tests for `correct({ reason })` (PR #2332 / PM blocker).
 *
 * Policy: cross_surface_contract_parity_tested_all_surfaces
 * (ent_2ad0677fe23c0c1878ae43e8). Zod + createCorrection coverage alone is not
 * enough — MCP, HTTP, and CLI must each persist and surface the same reason.
 *
 * Pattern: tests/integration/correct_http_mcp_parity.test.ts
 */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const execFileAsync = promisify(execFile);
const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_correct_reason_parity";
const API_PORT = 18243;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const REASON = "operator confirmed spelling against the signed invoice";
const CLI_PATH = "node";
const CLI_ARGS_PREFIX = ["dist/cli/index.js"];

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

function callCorrect(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      correct: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).correct(params);
}

function callProvenance(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      retrieveFieldProvenance: (
        p: Record<string, unknown>
      ) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).retrieveFieldProvenance(params);
}

describe("correct() reason — MCP / HTTP / CLI surface parity (#2332)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;
  let entityId: string;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    if (!(await schemaRegistry.loadActiveSchema(TYPE))) {
      await schemaRegistry.register({
        entity_type: TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            label: { type: "string", required: false },
            status: { type: "string", required: false },
          },
          canonical_name_fields: ["label"],
        },
        reducer_config: {
          merge_policies: {
            label: { strategy: "last_write" },
            status: { strategy: "last_write" },
          },
        },
        activate: true,
      });
    }

    const stored = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `seed-reason-parity-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: TYPE, label: "Reason parity target", status: "open" }],
    });
    const body = JSON.parse(stored.content[0].text) as { entities: Array<{ entity_id: string }> };
    entityId = body.entities[0].entity_id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupEntityType(TYPE, USER_ID);
    await cleanupTestSchema(TYPE, null);
  });

  it("MCP correct → retrieveFieldProvenance surfaces source_observation.reason", async () => {
    await callCorrect(server, {
      entity_id: entityId,
      entity_type: TYPE,
      field: "label",
      value: "MCP corrected label",
      idempotency_key: `mcp-reason-${Date.now()}`,
      reason: REASON,
      user_id: USER_ID,
    });

    const raw = await callProvenance(server, {
      entity_id: entityId,
      field: "label",
    });
    const provenance = JSON.parse(raw.content[0].text) as {
      source: unknown;
      source_observation?: { reason?: string | null };
    };

    expect(provenance.source).toBeNull();
    expect(provenance.source_observation?.reason).toBe(REASON);
  });

  it("HTTP POST /correct → /get_field_provenance and /list_observations return reason", async () => {
    const reasonHttp = `${REASON} via HTTP`;
    const correctRes = await fetch(`${API_BASE}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        entity_type: TYPE,
        field: "status",
        value: "closed",
        idempotency_key: `http-reason-${Date.now()}`,
        reason: reasonHttp,
        user_id: USER_ID,
      }),
    });
    expect(correctRes.status).toBe(200);

    const provRes = await fetch(`${API_BASE}/get_field_provenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        field: "status",
        user_id: USER_ID,
      }),
    });
    expect(provRes.status).toBe(200);
    const provBody = (await provRes.json()) as {
      observations: Array<{ reason?: string | null }>;
    };
    const reasons = (provBody.observations ?? []).map((o) => o.reason);
    expect(reasons).toContain(reasonHttp);

    const listRes = await fetch(`${API_BASE}/list_observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        user_id: USER_ID,
      }),
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      observations: Array<{ reason?: string | null }>;
    };
    expect((listBody.observations ?? []).some((o) => o.reason === reasonHttp)).toBe(true);
  });

  it("CLI corrections create --reason persists the reason onto the observation row", async () => {
    const reasonCli = `${REASON} via CLI`;
    const idem = `cli-reason-${Date.now()}`;
    // Hit this suite's in-process HTTP server (same DB as MCP/HTTP cases above),
    // not ambient NEOTOMA_BASE_URL (often production).
    await execFileAsync(
      CLI_PATH,
      [
        ...CLI_ARGS_PREFIX,
        "--base-url",
        API_BASE,
        "corrections",
        "create",
        "--entity-id",
        entityId,
        "--entity-type",
        TYPE,
        "--field-name",
        "label",
        "--corrected-value",
        "CLI corrected label",
        "--reason",
        reasonCli,
        "--idempotency-key",
        idem,
        "--user-id",
        USER_ID,
        "--json",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NEOTOMA_BASE_URL: API_BASE },
      }
    );

    const { data: rows, error } = await db
      .from("observations")
      .select("reason, fields")
      .eq("entity_id", entityId)
      .eq("user_id", USER_ID)
      .eq("idempotency_key", idem);

    expect(error).toBeNull();
    expect(rows?.length).toBeGreaterThan(0);
    expect(rows?.[0]?.reason).toBe(reasonCli);
  });
});
