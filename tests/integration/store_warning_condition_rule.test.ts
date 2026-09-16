/**
 * Integration tests: a schema-declared `store_warnings` rule must never be able
 * to block a write (#2067, #2165, #2170).
 *
 * The unit suite (`tests/unit/store_warning_rule.test.ts`) covers the evaluator
 * in isolation. This suite covers the property at the layers callers actually
 * hit: HTTP `POST /store` and MCP `executeTool("store")`. That distinction is
 * the whole defect — the throw originated in an advisory code path but surfaced
 * to callers as HTTP 500 `DB_QUERY_FAILED` / MCP `-32603`, which read as a
 * database fault and sent three separate investigations looking at reducer and
 * identity config rather than at a warning rule (issues #2067, #2165, #2170).
 *
 * The rules registered here reproduce the shape found on the live `skill`
 * (v2.6.0), `agent_definition` (v1.8.0), and `operator_profile` (v1.2.0)
 * schemas, which declare `condition: { missing_all_of: [...] }` where the
 * evaluator previously assumed a flat `fields: string[]`.
 *
 * Cross-surface parity (ent_2ad0677fe23c0c1878ae43e8): the CONDITION_TYPE /
 * UNKNOWN_TYPE matrix is driven on both HTTP and MCP with the same payloads.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

/**
 * Invoke the server's real `initialize` handler, the same way
 * `tests/integration/instance_skills_initialize_effect.test.ts` does, so this
 * asserts the surface an MCP client actually reads rather than a private method.
 */
async function callInitialize(server: InstanceType<typeof NeotomaServer>): Promise<{
  instructions?: string;
  serverInfo: {
    _neotoma?: { available_skills?: string[]; skills_unavailable?: boolean };
  };
}> {
  const inner = (
    server as unknown as {
      mcpServer: {
        server: {
          _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;
        };
      };
    }
  ).mcpServer.server;
  const handler = inner._requestHandlers.get("initialize");
  if (!handler) throw new Error("initialize handler not registered");
  const parsed = InitializeRequestSchema.parse({
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "store-warning-e2e-test", version: "1.0.0" },
    },
  });
  return (await handler(parsed, { requestId: `test-${randomUUID()}` })) as Awaited<
    ReturnType<typeof callInitialize>
  >;
}

const TEST_USER_ID = LOCAL_DEV_USER_ID;

/** Mirrors the live `skill` rule shape: declarative, evaluable. */
const CONDITION_TYPE = "test_store_warning_condition_type";
/** A rule whose condition key the evaluator does not implement. */
const UNKNOWN_TYPE = "test_store_warning_unknown_condition_type";

const API_PORT = 18263;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

type StoreWarning = {
  code: string;
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

type StoreResponse = {
  success?: boolean;
  entities?: Array<{ entity_id: string; entity_type: string }>;
  store_warnings?: StoreWarning[];
  error_code?: string;
  message?: string;
};

async function httpStore(body: Record<string, unknown>): Promise<{
  status: number;
  json: StoreResponse;
}> {
  const res = await fetch(`${API_BASE}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as StoreResponse };
}

/**
 * Drive MCP `store` through the real CallToolRequestSchema dispatch
 * (`executeTool`) — same path `/mcp` tools/call uses (see
 * tests/helpers/store_reference_parity.ts).
 */
async function mcpStore(
  server: InstanceType<typeof NeotomaServer>,
  args: Record<string, unknown>
): Promise<{ rawText: string; json: StoreResponse; threw: unknown | null }> {
  const dispatch = server as unknown as {
    executeTool: (
      name: string,
      args: unknown
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    authenticatedUserId?: string;
  };
  dispatch.authenticatedUserId = TEST_USER_ID;
  try {
    const result = await dispatch.executeTool("store", {
      user_id: TEST_USER_ID,
      ...args,
    });
    const rawText = result.content[0]?.text ?? "";
    return { rawText, json: JSON.parse(rawText) as StoreResponse, threw: null };
  } catch (err) {
    return { rawText: "", json: {}, threw: err };
  }
}

/** Assert the MCP path did not surface the pre-fix TypeError / -32603 failure. */
function expectMcpStoreSucceeded(result: {
  rawText: string;
  json: StoreResponse;
  threw: unknown | null;
}): void {
  expect(result.threw, `MCP store threw: ${String(result.threw)}`).toBeNull();
  expect(result.rawText).not.toMatch(/TypeError|Cannot read properties of undefined/);
  expect(result.json.error_code).not.toBe("DB_QUERY_FAILED");
  expect(result.rawText).not.toContain("-32603");
  expect(result.json.error_code).toBeUndefined();
  // MCP store envelope reports entities (no top-level `success` boolean).
  expect(result.json.entities?.length).toBeGreaterThan(0);
}

let seq = 0;
const key = (label: string) => `store-warning-cond-${label}-${Date.now()}-${seq++}`;

describe("store_warnings: declarative `condition` rules do not block writes (#2165)", () => {
  let httpServer: ReturnType<typeof createServer>;
  let mcpServer: InstanceType<typeof NeotomaServer>;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    mcpServer = new NeotomaServer();

    // A rule shaped exactly like the one on the live `skill` schema.
    if (!(await schemaRegistry.loadActiveSchema(CONDITION_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: CONDITION_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            name: { type: "string", required: false },
            content: { type: "string", required: false },
          },
          canonical_name_fields: ["name"],
          store_warnings: [
            {
              code: "MISSING_CONTENT_FIELD",
              message: "test type has no content body.",
              condition: { missing_all_of: ["content"] },
            },
          ],
        } as never,
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      } as never);
    }

    // A rule whose condition the evaluator cannot interpret.
    if (!(await schemaRegistry.loadActiveSchema(UNKNOWN_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: UNKNOWN_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            name: { type: "string", required: false },
            content: { type: "string", required: false },
          },
          canonical_name_fields: ["name"],
          store_warnings: [
            {
              code: "SOME_FUTURE_RULE",
              message: "declares a condition this server does not implement.",
              condition: { present_any_of: ["content"] },
            },
          ],
        } as never,
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      } as never);
    }
  }, 60000);

  afterAll(async () => {
    await cleanupEntityType(CONDITION_TYPE, TEST_USER_ID);
    await cleanupEntityType(UNKNOWN_TYPE, TEST_USER_ID);
    await cleanupTestSchema(CONDITION_TYPE, TEST_USER_ID);
    await cleanupTestSchema(UNKNOWN_TYPE, TEST_USER_ID);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }, 60000);

  it("stores an entity whose schema declares a `condition` rule (was HTTP 500)", async () => {
    // The regression proper: before the fix this returned 500 DB_QUERY_FAILED
    // "Cannot read properties of undefined (reading 'some')".
    const { status, json } = await httpStore({
      idempotency_key: key("satisfied"),
      entities: [{ entity_type: CONDITION_TYPE, name: "cond-satisfied", content: "# a real body" }],
    });
    expect(json.error_code).toBeUndefined();
    expect(status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("also succeeds on a dry run, which is where it was first caught", async () => {
    const { status, json } = await httpStore({
      commit: false,
      idempotency_key: key("dryrun"),
      entities: [{ entity_type: CONDITION_TYPE, name: "cond-dry", content: "# body" }],
    });
    expect(json.error_code).toBeUndefined();
    expect(status).toBe(200);
  });

  it("suppresses the warning when the named field carries a value", async () => {
    const { json } = await httpStore({
      idempotency_key: key("suppressed"),
      entities: [{ entity_type: CONDITION_TYPE, name: "cond-suppressed", content: "# body" }],
    });
    const codes = (json.store_warnings ?? []).map((w) => w.code);
    expect(codes).not.toContain("MISSING_CONTENT_FIELD");
  });

  it("emits the declared warning when the named field is absent", async () => {
    const { status, json } = await httpStore({
      idempotency_key: key("fired"),
      entities: [{ entity_type: CONDITION_TYPE, name: "cond-fired" }],
    });
    expect(status).toBe(200);
    const warning = (json.store_warnings ?? []).find((w) => w.code === "MISSING_CONTENT_FIELD");
    expect(warning).toBeDefined();
    expect(warning?.entity_type).toBe(CONDITION_TYPE);
    expect(warning?.message).toBe("test type has no content body.");
  });

  it("accepts the write and reports an unevaluable rule rather than 500ing", async () => {
    const { status, json } = await httpStore({
      idempotency_key: key("unknown"),
      entities: [{ entity_type: UNKNOWN_TYPE, name: "unknown-cond", content: "# body" }],
    });
    expect(json.error_code).toBeUndefined();
    expect(status).toBe(200);
    expect(json.success).toBe(true);

    const warning = (json.store_warnings ?? []).find(
      (w) => w.code === "STORE_WARNING_RULE_NOT_EVALUATED"
    );
    expect(warning).toBeDefined();
    // The diagnostic must name the rule and the key it could not read, so a
    // schema author can find the inert rule without reading server source.
    expect(warning?.message).toContain("SOME_FUTURE_RULE");
    expect(warning?.message).toContain("present_any_of");
  });

  // ─── MCP path (cross-surface parity with HTTP cases above) ─────────────────

  it("MCP: stores an entity whose schema declares a `condition` rule (was -32603)", async () => {
    const result = await mcpStore(mcpServer, {
      idempotency_key: key("mcp-satisfied"),
      entities: [{ entity_type: CONDITION_TYPE, name: "mcp-cond-satisfied", content: "# a real body" }],
    });
    expectMcpStoreSucceeded(result);
    const codes = (result.json.store_warnings ?? []).map((w) => w.code);
    expect(codes).not.toContain("MISSING_CONTENT_FIELD");
  });

  it("MCP: emits the declared warning when the named field is absent (write still succeeds)", async () => {
    const result = await mcpStore(mcpServer, {
      idempotency_key: key("mcp-fired"),
      entities: [{ entity_type: CONDITION_TYPE, name: "mcp-cond-fired" }],
    });
    expectMcpStoreSucceeded(result);
    const warning = (result.json.store_warnings ?? []).find((w) => w.code === "MISSING_CONTENT_FIELD");
    expect(warning).toBeDefined();
    expect(warning?.entity_type).toBe(CONDITION_TYPE);
    expect(warning?.message).toBe("test type has no content body.");
  });

  it("MCP: fail-open STORE_WARNING_RULE_NOT_EVALUATED for unknown condition key", async () => {
    const result = await mcpStore(mcpServer, {
      idempotency_key: key("mcp-unknown"),
      entities: [{ entity_type: UNKNOWN_TYPE, name: "mcp-unknown-cond", content: "# body" }],
    });
    expectMcpStoreSucceeded(result);
    const warning = (result.json.store_warnings ?? []).find(
      (w) => w.code === "STORE_WARNING_RULE_NOT_EVALUATED"
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toContain("SOME_FUTURE_RULE");
    expect(warning?.message).toContain("present_any_of");
  });
});

/**
 * End-to-end: the originating goal (#2165 write + #2046 injection).
 *
 * The two halves of "skills are writable on an instance and injected into a
 * harness via MCP" have separate test coverage, and both were green while the
 * goal itself was unreachable — the write half failed for `entity_type:
 * "skill"` specifically, so nothing ever reached the injection half. This
 * drives the whole chain in one test: register a `skill` schema carrying the
 * production `condition` rule, store a skill through MCP `executeTool("store")`,
 * then read it back off MCP `initialize`.
 */
describe("end-to-end: a skill written through MCP store reaches MCP initialize", () => {
  let server: InstanceType<typeof NeotomaServer>;
  const E2E_SKILL = "e2e-store-to-initialize-skill";
  const E2E_DESCRIPTION = "Written through MCP store, read back off MCP initialize.";

  beforeAll(async () => {
    process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";

    // Re-register `skill` carrying the rule shape found live on the operator's
    // instance (v2.6.0). This is what made every skill write a 500 / -32603.
    await schemaRegistry.register({
      entity_type: "skill",
      schema_version: "2.6.0-test",
      schema_definition: {
        fields: {
          name: { type: "string", required: false },
          description: { type: "string", required: false },
          content: { type: "string", required: false },
          enabled: { type: "boolean", required: false },
        },
        canonical_name_fields: ["name"],
        content_field: "content",
        store_warnings: [
          {
            code: "MISSING_CONTENT_FIELD",
            message: "skill has no content body.",
            condition: { missing_all_of: ["content"] },
          },
        ],
      } as never,
      reducer_config: { merge_policies: {} },
      user_id: TEST_USER_ID,
      user_specific: true,
      activate: true,
    } as never);

    server = new NeotomaServer();
  }, 60000);

  afterAll(async () => {
    delete process.env.NEOTOMA_CONNECTION_ID;
    await cleanupEntityType("skill", TEST_USER_ID);
    await cleanupTestSchema("skill", TEST_USER_ID);
  }, 60000);

  it("stores the skill via MCP and surfaces it at initialize", async () => {
    const storeResult = await mcpStore(server, {
      idempotency_key: key("e2e-mcp"),
      entities: [
        {
          entity_type: "skill",
          name: E2E_SKILL,
          description: E2E_DESCRIPTION,
          content: "# e2e skill\nFull body.",
          enabled: true,
        },
      ],
    });

    // Half one: the write. This is the step that returned DB_QUERY_FAILED / -32603.
    expectMcpStoreSucceeded(storeResult);

    // Half two: the injection. Reads the same surface an MCP client reads.
    const result = await callInitialize(server);
    const instructions = result.instructions ?? "";

    expect(
      instructions.split("\n").some((l) => l === "[INSTANCE SKILLS]"),
      `no [INSTANCE SKILLS] section; tail: ${instructions.slice(-600)}`
    ).toBe(true);
    expect(instructions.includes(E2E_SKILL)).toBe(true);
    expect(instructions.includes(E2E_DESCRIPTION)).toBe(true);
    expect(result.serverInfo._neotoma?.available_skills).toContain(E2E_SKILL);

    // lookup_failed must report unknown, not an empty skill set.
    expect(result.serverInfo._neotoma?.skills_unavailable).toBeUndefined();
  });
});
