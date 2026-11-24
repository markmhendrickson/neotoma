/**
 * The skipped standing-rule count reaches the instruction TEXT on every
 * entrance that serves instructions, not only `serverInfo._neotoma`, which
 * ordinary MCP clients drop (#2187).
 *
 * Entrances covered here: MCP `initialize`, authenticated stateless
 * `server/discover`, and GET /mcp-interaction-instructions. The CLI
 * `instructions print` path is covered in
 * tests/integration/standing_rules_cli_skipped_count.test.ts.
 *
 * Each entrance is driven with some rules skipped and with every stored rule
 * skipped (rules empty, count above zero), and with nothing skipped (no line).
 * The rule lookup is mocked so the count is exact; every response is built by
 * the real handlers on the real app.
 */

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { StandingRulesLookupResult } from "../../src/services/standing_rules.js";
import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const state: { result: StandingRulesLookupResult } = {
  result: { rules: [], lookup_failed: false },
};

vi.mock("../../src/services/standing_rules.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/standing_rules.js")>();
  return {
    ...actual,
    getActiveStandingRulesResult: vi.fn(async () => state.result),
  };
});

const USER_A = "aaaaaaaa-0c0c-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      if (connectionId !== "conn-skipped-a") {
        const error = new Error("Connection not found") as Error & { code?: string };
        error.code = "OAUTH_CONNECTION_NOT_FOUND";
        throw error;
      }
      return { accessToken: "test-access-skipped-a", userId: USER_A };
    }),
  };
});

const RULE = {
  entity_id: "ent_skipped_entrances_rule",
  title: "Synthetic applied rule",
  rule_text: "Body of the synthetic applied rule.",
  priority: 5,
};

const SYNTHETIC_BEARER = "synthetic-skipped-count-bearer-token";
const SKIPPED_LINE = (n: number) =>
  `${n} stored standing rule${n === 1 ? "" : "s"} could not be applied because ` +
  `${n === 1 ? "it has" : "they have"} no rule text.`;
/**
 * The rendered skipped-rule line, with its count. Matching the bare phrase
 * "could not be applied" is not enough: the base instructions mention it too.
 */
const SKIPPED_LINE_PATTERN = /\d+ stored standing rules? could not be applied/;

const CASES: Array<{ name: string; result: StandingRulesLookupResult; count: number }> = [
  {
    name: "some rules skipped",
    result: { rules: [RULE], lookup_failed: false, skipped_missing_text: 2 },
    count: 2,
  },
  {
    name: "every stored rule skipped",
    result: { rules: [], lookup_failed: false, skipped_missing_text: 1 },
    count: 1,
  },
];

/** The rules block alone, from its opening tag to its closing marker. */
function rulesBlock(instructions: string): string {
  expect(instructions.startsWith("[STANDING RULES]\n")).toBe(true);
  const end = instructions.indexOf("\n[END STANDING RULES]");
  expect(end).toBeGreaterThan(0);
  return instructions.slice(0, end);
}

function expectSkippedLine(instructions: string, count: number, hasRule: boolean) {
  const block = rulesBlock(instructions);
  expect(block).toContain(SKIPPED_LINE(count));
  // Count only: the line names no rule and no id.
  const line = block.split("\n").find((l) => SKIPPED_LINE_PATTERN.test(l));
  expect(line).toBeDefined();
  expect(line).not.toContain("ent_");
  expect(line).not.toContain("Synthetic");
  if (hasRule) expect(block).toContain("> Body of the synthetic applied rule.");
  else expect(block).not.toContain("> Body of the synthetic applied rule.");
}

async function initializeResult(): Promise<{
  instructions?: string;
  serverInfo: { _neotoma?: { standing_rules_skipped?: number } };
}> {
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
      clientInfo: { name: "standing-rules-skipped-entrances-test", version: "1.0.0" },
    },
  });
  return (await handler(parsed, { requestId: `test-${randomUUID()}` })) as Awaited<
    ReturnType<typeof initializeResult>
  >;
}

describe("skipped standing rules on initialize and REST", { timeout: 60_000 }, () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;

  beforeEach(async () => {
    state.result = { rules: [], lookup_failed: false };
    env = prepareMcpTestEnv("neotoma-rules-skipped-rest-");
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

  async function restText(): Promise<string> {
    const response = await fetch(`${app.baseUrl}/mcp-interaction-instructions`, {
      headers: { Authorization: `Bearer ${SYNTHETIC_BEARER}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-neotoma-instructions-composition")).toBe("user");
    return response.text();
  }

  for (const c of CASES) {
    it(`initialize states the count in the text and mirrors it in serverInfo (${c.name})`, async () => {
      state.result = c.result;
      const result = await initializeResult();
      expectSkippedLine(result.instructions ?? "", c.count, c.result.rules.length > 0);
      expect(result.serverInfo._neotoma?.standing_rules_skipped).toBe(c.count);
    });

    it(`REST states the count and matches initialize exactly (${c.name})`, async () => {
      state.result = c.result;
      const served = await restText();
      expectSkippedLine(served, c.count, c.result.rules.length > 0);
      expect(served).toBe((await initializeResult()).instructions);
    });
  }

  it("no line and no serverInfo field when nothing was skipped", async () => {
    state.result = { rules: [RULE], lookup_failed: false };
    const result = await initializeResult();
    expect(result.instructions).not.toMatch(SKIPPED_LINE_PATTERN);
    expect("standing_rules_skipped" in (result.serverInfo._neotoma ?? {})).toBe(false);
    expect(await restText()).not.toMatch(SKIPPED_LINE_PATTERN);
  });
});

describe("skipped standing rules on authenticated server/discover", { timeout: 60_000 }, () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;

  beforeEach(async () => {
    state.result = { rules: [], lookup_failed: false };
    env = prepareMcpTestEnv("neotoma-rules-skipped-discover-");
    app = await bootMcpApp();
  }, 120_000);

  afterEach(async () => {
    await app.close();
    vi.resetModules();
    env.restore();
  });

  async function discoverInstructions(): Promise<string> {
    const reply = await modernPost(
      app.baseUrl,
      { id: "discover-skipped", method: "server/discover" },
      { connectionId: "conn-skipped-a" }
    );
    expect(reply.status, reply.text).toBe(200);
    return String(reply.body?.result?.instructions ?? "");
  }

  for (const c of CASES) {
    it(`discover states the count in the text (${c.name})`, async () => {
      state.result = c.result;
      const instructions = await discoverInstructions();
      expectSkippedLine(instructions, c.count, c.result.rules.length > 0);
      // Parity with initialize: the same rules block on both entrances.
      const init = (await initializeResult()).instructions ?? "";
      expect(rulesBlock(instructions)).toBe(rulesBlock(init));
    });
  }

  it("discover carries no line when nothing was skipped", async () => {
    state.result = { rules: [RULE], lookup_failed: false };
    expect(await discoverInstructions()).not.toMatch(SKIPPED_LINE_PATTERN);
  });
});
