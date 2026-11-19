/**
 * Standing rules on the instruction entrances other than the legacy MCP
 * `initialize` handshake: the 2026-07-28 stateless `server/discover` RPC and
 * GET /mcp-interaction-instructions.
 *
 * - `server/discover`: an authenticated request leads its instructions with the
 *   caller's rules block; a discover result built without an authenticated
 *   request carries no rule body and one fixed line naming where the rules are
 *   served; an authenticated request whose user cannot be resolved, or whose
 *   rule lookup fails, says the rules are unknown (never "none").
 * - REST: an authenticated caller gets exactly the text a session `initialize`
 *   returns for the same user and rules; an unauthenticated caller gets the
 *   text it got before (no rules block, no composition header).
 *
 * The rule lookup is mocked so the rule set (two rules, none, failed) is
 * exact; every response is built by the real handlers on the real app.
 */

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { StandingRule } from "../../src/services/standing_rules.js";
import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const state: { rules: StandingRule[]; failed: boolean } = { rules: [], failed: false };

vi.mock("../../src/services/standing_rules.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/standing_rules.js")>();
  return {
    ...actual,
    getActiveStandingRulesResult: vi.fn(async () =>
      state.failed
        ? { rules: [], lookup_failed: true, error: "synthetic read failure" }
        : { rules: state.rules, lookup_failed: false }
    ),
  };
});

const USER_A = "aaaaaaaa-0b0b-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      if (connectionId !== "conn-rules-a") {
        const error = new Error("Connection not found") as Error & { code?: string };
        error.code = "OAUTH_CONNECTION_NOT_FOUND";
        throw error;
      }
      return { accessToken: "test-access-rules-a", userId: USER_A };
    }),
  };
});

const TWO_RULES: StandingRule[] = [
  {
    entity_id: "ent_round_b_rule_one",
    title: "Synthetic rule one",
    rule_text: "Body of synthetic rule one.",
    scope: "global",
    priority: 20,
  },
  {
    entity_id: "ent_round_b_rule_two",
    title: "Synthetic rule two",
    rule_text: "Body of synthetic rule two.",
    priority: 10,
  },
];

const SYNTHETIC_BEARER = "synthetic-round-b-bearer-token";
const UNKNOWN_MARK = "could not be read for this session";
const AFTER_AUTH_MARK = "Standing rules are served only after authentication";

async function discoverInstructions(baseUrl: string): Promise<string> {
  const reply = await modernPost(
    baseUrl,
    { id: "discover-rules", method: "server/discover" },
    { connectionId: "conn-rules-a" }
  );
  expect(reply.status, reply.text).toBe(200);
  return String(reply.body?.result?.instructions ?? "");
}

describe("standing rules on server/discover", { timeout: 60_000 }, () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;

  beforeEach(async () => {
    state.rules = [];
    state.failed = false;
    env = prepareMcpTestEnv("neotoma-rules-discover-");
    app = await bootMcpApp();
  }, 120_000);

  afterEach(async () => {
    await app.close();
    vi.resetModules();
    env.restore();
  });

  it("authenticated discover leads with both enabled rules in full", async () => {
    state.rules = TWO_RULES;
    const instructions = await discoverInstructions(app.baseUrl);
    expect(instructions.startsWith("[STANDING RULES]\n")).toBe(true);
    expect(instructions).toContain("> Body of synthetic rule one.");
    expect(instructions).toContain("> Body of synthetic rule two.");
    expect(instructions).toContain("2 standing rules in force");
    expect(instructions.indexOf("[END STANDING RULES]")).toBeLessThan(
      instructions.indexOf("[TURN LIFECYCLE]") >= 0
        ? instructions.indexOf("[TURN LIFECYCLE]")
        : Number.MAX_SAFE_INTEGER
    );
    expect(instructions).not.toContain(AFTER_AUTH_MARK);
  });

  it("authenticated discover with no rules carries no rules block", async () => {
    state.rules = [];
    const instructions = await discoverInstructions(app.baseUrl);
    expect(instructions.startsWith("[STANDING RULES]")).toBe(false);
    expect(instructions).not.toContain(AFTER_AUTH_MARK);
  });

  it("a failed rule lookup on discover says unknown, with no rule body", async () => {
    state.rules = TWO_RULES;
    state.failed = true;
    const instructions = await discoverInstructions(app.baseUrl);
    expect(instructions.startsWith("[STANDING RULES]\n")).toBe(true);
    expect(instructions).toContain(UNKNOWN_MARK);
    expect(instructions).not.toContain("Body of synthetic rule");
    expect(instructions).not.toMatch(/\d+ standing rules? in force/);
  });

  it("discover built without an authenticated request carries the fixed line and no rule body", async () => {
    state.rules = TWO_RULES;
    const { NeotomaServer } = await import("../../src/server.js");
    const result = await new NeotomaServer().buildDiscoverResult();
    const instructions = String(result.instructions);
    const firstLine = instructions.split("\n")[0];
    expect(firstLine).toContain(AFTER_AUTH_MARK);
    expect(firstLine).toContain("GET /mcp-interaction-instructions");
    expect(firstLine).toContain("server/discover");
    expect(instructions).not.toContain("Body of synthetic rule");
    expect(instructions).not.toContain("[END STANDING RULES]");
  });

  it("an authenticated discover whose user cannot be resolved says unknown, never none", async () => {
    state.rules = TWO_RULES;
    const { NeotomaServer } = await import("../../src/server.js");
    const server = new NeotomaServer();
    // Authenticated request, identity not resolvable: no user id, no connection.
    (server as unknown as { statelessRequestAuthenticated: boolean }).statelessRequestAuthenticated =
      true;
    const result = await server.buildDiscoverResult();
    const instructions = String(result.instructions);
    expect(instructions.startsWith("[STANDING RULES]\n")).toBe(true);
    expect(instructions).toContain(UNKNOWN_MARK);
    expect(instructions).not.toContain("Body of synthetic rule");
  });
});

type InitializeResult = { instructions?: string };

async function initializeInstructions(): Promise<string> {
  const { NeotomaServer } = await import("../../src/server.js");
  const server = new NeotomaServer();
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
      clientInfo: { name: "standing-rules-round-b-test", version: "1.0.0" },
    },
  });
  const result = (await handler(parsed, {
    requestId: `test-${randomUUID()}`,
  })) as InitializeResult;
  return result.instructions ?? "";
}

describe("standing rules on GET /mcp-interaction-instructions", { timeout: 60_000 }, () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;

  beforeEach(async () => {
    state.rules = [];
    state.failed = false;
    env = prepareMcpTestEnv("neotoma-rules-rest-");
    // Restored by env.restore() (NEOTOMA_BEARER_TOKEN is in the helper's list).
    process.env.NEOTOMA_BEARER_TOKEN = SYNTHETIC_BEARER;
    process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
    app = await bootMcpApp();
  }, 120_000);

  afterEach(async () => {
    await app.close();
    vi.resetModules();
    delete process.env.NEOTOMA_CONNECTION_ID;
    env.restore();
  });

  async function rest(withBearer: boolean) {
    const response = await fetch(`${app.baseUrl}/mcp-interaction-instructions`, {
      headers: withBearer ? { Authorization: `Bearer ${SYNTHETIC_BEARER}` } : {},
    });
    return {
      status: response.status,
      composition: response.headers.get("x-neotoma-instructions-composition"),
      text: await response.text(),
    };
  }

  it("authenticated text is identical to the initialize instructions for the same user and two rules", async () => {
    state.rules = TWO_RULES;
    const served = await rest(true);
    expect(served.status).toBe(200);
    expect(served.composition).toBe("user");
    expect(served.text.startsWith("[STANDING RULES]\n")).toBe(true);
    expect(served.text).toContain("> Body of synthetic rule one.");
    expect(served.text).toContain("> Body of synthetic rule two.");
    expect(served.text).toBe(await initializeInstructions());
  });

  it("authenticated text with no rules is identical to initialize and has no rules block", async () => {
    state.rules = [];
    const served = await rest(true);
    expect(served.composition).toBe("user");
    expect(served.text.startsWith("[STANDING RULES]")).toBe(false);
    expect(served.text).toBe(await initializeInstructions());
  });

  it("a failed rule lookup on REST says unknown, with no rule body", async () => {
    state.rules = TWO_RULES;
    state.failed = true;
    const served = await rest(true);
    expect(served.composition).toBe("user");
    expect(served.text.startsWith("[STANDING RULES]\n")).toBe(true);
    expect(served.text).toContain(UNKNOWN_MARK);
    expect(served.text).not.toContain("Body of synthetic rule");
    expect(served.text).toBe(await initializeInstructions());
  });

  it("unauthenticated text is unchanged: no rules, no composition header", async () => {
    state.rules = TWO_RULES;
    const served = await rest(false);
    expect(served.status).toBe(200);
    expect(served.composition).toBeNull();
    expect(served.text.startsWith("[STANDING RULES]")).toBe(false);
    expect(served.text).not.toContain("Body of synthetic rule");
  });

  it("a refused Bearer token is served as unauthenticated, not as an error", async () => {
    state.rules = TWO_RULES;
    const response = await fetch(`${app.baseUrl}/mcp-interaction-instructions`, {
      headers: { Authorization: "Bearer not-the-configured-token" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-neotoma-instructions-composition")).toBeNull();
    const text = await response.text();
    expect(text).not.toContain("Body of synthetic rule");
    expect(text).toBe((await rest(false)).text);
  });
});
