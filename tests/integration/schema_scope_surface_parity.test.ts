/**
 * #2356 across the SURFACES, not just the service layer.
 *
 * `schema_scope_resolution_parity.test.ts` proves the resolver agrees with
 * itself. It calls `schemaRegistry` methods directly, so it cannot catch a
 * surface that fails to thread `user_id` into that resolver — and the qa lens
 * demonstrated the gap concretely: reverting the one-line `GET /schemas` fix in
 * this PR broke no test anywhere.
 *
 * This file closes that. It boots the real Express app and the real
 * NeotomaServer and drives all three surfaces that expose schema versions:
 *
 *   HTTP  GET /schemas                 (list)
 *   MCP   list_entity_types            (list)
 *   MCP   describe_entity_type         (per-type)
 *
 * against a type that carries BOTH an active global row and an active
 * user-scoped row at different versions — the dual-active state #2356 is about.
 * Every surface must report the version the write path resolves for that
 * principal, which is the user-scoped one.
 *
 * The seeded versions are deliberately 1.3.0 global / 1.18.0 user: a lexical
 * compare ranks "1.18.0" BELOW "1.3.0", so a surface that sorts versions as
 * strings picks the wrong row and this test fails.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = `surface_parity_${Date.now()}`;
const API_PORT = 18263;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

/** Global row: older by semver, NEWER by a lexical string compare. */
const GLOBAL_VERSION = "1.3.0";
/** User-scoped row: what the write path resolves for USER_ID, so what every surface must report. */
const USER_VERSION = "1.18.0";
/** Present only on the user row, so a wrong-row answer is visible in the fields too. */
const USER_ONLY_FIELD = "scoped_marker";

function fields(names: string[]) {
  return Object.fromEntries(names.map((n) => [n, { type: "string", required: false }]));
}

async function seedRow(version: string, fieldNames: string[], scope: "global" | "user") {
  const { error } = await db.from("schema_registry").insert({
    entity_type: TYPE,
    schema_version: version,
    schema_definition: {
      fields: fields(fieldNames),
      identity_opt_out: "heuristic_canonical_name",
    },
    reducer_config: {
      merge_policies: Object.fromEntries(
        fieldNames.map((n) => [n, { strategy: "last_write" }])
      ),
    },
    active: true,
    scope,
    user_id: scope === "user" ? USER_ID : null,
  });
  if (error) throw new Error(`seed ${scope} failed: ${error.message}`);
}

function callTool(server: NeotomaServer, tool: string, params: Record<string, unknown>) {
  return (
    server as unknown as Record<string, (p: Record<string, unknown>) => Promise<{
      content: Array<{ text: string }>;
    }>>
  )[tool](params);
}

describe("schema scope parity across surfaces (#2356)", () => {
  let server: NeotomaServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;

    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    // Global first, then the user override — the order that made the old
    // arrival-order dedupe land on the WRONG row.
    await seedRow(GLOBAL_VERSION, ["shared"], "global");
    await seedRow(USER_VERSION, ["shared", USER_ONLY_FIELD], "user");
  });

  afterAll(async () => {
    await db.from("schema_registry").delete().eq("entity_type", TYPE);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("HTTP GET /schemas reports the principal's resolved version", async () => {
    const res = await fetch(`${API_BASE}/schemas?user_id=${USER_ID}&keyword=${TYPE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schemas?: Array<{ entity_type: string; schema_version: string }> };
    const row = (body.schemas ?? []).find((t) => t.entity_type === TYPE);
    // This is the assertion the reverted one-line fix would break: without
    // `userId` threaded into listEntityTypes, this route answers 1.3.0.
    expect(row?.schema_version).toBe(USER_VERSION);
  });

  it("MCP list_entity_types agrees with the HTTP list", async () => {
    const out = await callTool(server, "listEntityTypes", { user_id: USER_ID, keyword: TYPE });
    const body = JSON.parse(out.content[0].text) as {
      entity_types?: Array<{ entity_type: string; schema_version: string }>;
    };
    const row = (body.entity_types ?? []).find((t) => t.entity_type === TYPE);
    expect(row?.schema_version).toBe(USER_VERSION);
  });

  it("MCP describe_entity_type agrees with both lists", async () => {
    const out = await callTool(server, "describeEntityType", { entity_type: TYPE, user_id: USER_ID });
    const body = JSON.parse(out.content[0].text) as {
      schema_version?: string;
      field_names?: string[];
    };
    expect(body.schema_version).toBe(USER_VERSION);
    // Belt and braces: the fields must come from the same row as the version.
    // A surface could report the right version off one row and fields off another.
    expect(body.field_names).toContain(USER_ONLY_FIELD);
  });

  it("all three surfaces return the SAME version as each other", async () => {
    const httpRes = await fetch(`${API_BASE}/schemas?user_id=${USER_ID}&keyword=${TYPE}`);
    const httpBody = (await httpRes.json()) as {
      schemas?: Array<{ entity_type: string; schema_version: string }>;
    };
    const httpVersion = (httpBody.schemas ?? []).find((t) => t.entity_type === TYPE)?.schema_version;

    const listOut = await callTool(server, "listEntityTypes", { user_id: USER_ID, keyword: TYPE });
    const listBody = JSON.parse(listOut.content[0].text) as {
      entity_types?: Array<{ entity_type: string; schema_version: string }>;
    };
    const listVersion = (listBody.entity_types ?? []).find((t) => t.entity_type === TYPE)?.schema_version;

    const descOut = await callTool(server, "describeEntityType", { entity_type: TYPE, user_id: USER_ID });
    const descVersion = (JSON.parse(descOut.content[0].text) as { schema_version?: string }).schema_version;

    // The bug, stated as an assertion: these three disagreed.
    expect(new Set([httpVersion, listVersion, descVersion]).size).toBe(1);
  });

  it("a principal with no scoped row sees global, not another principal's override", async () => {
    // Guards against over-correcting: the fix must not make every caller see
    // the user row. Drive this at the service layer, because the MCP tool
    // refuses a user_id that does not match the authenticated principal —
    // which is the correct guard and is asserted separately below.
    const other = randomUUID();
    const resolved = await schemaRegistry.loadActiveSchema(TYPE, other);
    expect(resolved?.schema_version).toBe(GLOBAL_VERSION);
  });

  it("MCP refuses a user_id that is not the authenticated principal", async () => {
    // Discovered while writing the test above: describe_entity_type throws
    // rather than honouring a foreign user_id. Worth pinning — it is the guard
    // the sibling HTTP route `GET /schemas/:entity_type` is missing
    // (tracked privately), and a regression here would widen that gap to MCP.
    const other = randomUUID();
    await expect(
      callTool(server, "describeEntityType", { entity_type: TYPE, user_id: other })
    ).rejects.toThrow(/does not match authenticated user/);
  });
});
