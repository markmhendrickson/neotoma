/**
 * The bounded `[SESSION INDEX]` leads the composed MCP instructions on every
 * entrance, so a client that truncates `instructions` still sees every
 * standing-rule title and every instance skill name.
 *
 * Fixture: six standing rules totalling about 24KB of rule text and twelve
 * instance skills. Rule and skill lookups are mocked so the sets are exact;
 * every response is built by the real handlers on the real app.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { StandingRule } from "../../src/services/standing_rules.js";
import type { InstanceSkill } from "../../src/services/skills/instance_skills.js";
import {
  INSTRUCTIONS_INDEX_END_MARKER,
  INSTRUCTIONS_INDEX_MAX_BYTES,
  INSTRUCTIONS_INDEX_START_MARKER,
} from "../../src/services/instructions_index.js";
import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

const SIX_RULES: StandingRule[] = Array.from({ length: 6 }, (_, i) => ({
  entity_id: `ent_synthetic_index_rule_${i + 1}`,
  title: `Synthetic index rule ${i + 1}`,
  rule_text: `Synthetic rule ${i + 1} body. `.repeat(160),
  priority: 60 - i,
}));

const TWELVE_SKILLS: InstanceSkill[] = Array.from({ length: 12 }, (_, i) => ({
  entity_id: `ent_synthetic_index_skill_${i + 1}`,
  name: `synthetic_index_skill_${String(i + 1).padStart(2, "0")}`,
  description: `Synthetic skill ${i + 1} description.`,
}));

const state: { rules: StandingRule[]; skills: InstanceSkill[] } = { rules: [], skills: [] };

vi.mock("../../src/services/standing_rules.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/standing_rules.js")>();
  return {
    ...actual,
    getActiveStandingRulesResult: vi.fn(async () => ({
      rules: state.rules,
      lookup_failed: false,
    })),
  };
});

vi.mock("../../src/services/skills/instance_skills.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/services/skills/instance_skills.js")>();
  return {
    ...actual,
    getInstanceSkillsResult: vi.fn(async () => ({ skills: state.skills, lookup_failed: false })),
  };
});

const USER_A = "aaaaaaaa-0c0c-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("../../src/services/mcp_oauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/mcp_oauth.js")>();
  return {
    ...actual,
    getAccessTokenForConnection: vi.fn(async (connectionId: string) => {
      if (connectionId !== "conn-index-a") {
        const error = new Error("Connection not found") as Error & { code?: string };
        error.code = "OAUTH_CONNECTION_NOT_FOUND";
        throw error;
      }
      return { accessToken: "test-access-index-a", userId: USER_A };
    }),
  };
});

const SYNTHETIC_BEARER = "synthetic-index-bearer-token";

/** First `n` UTF-8 bytes of `s`, as a client capping at `n` bytes would keep. */
function firstBytes(s: string, n: number): string {
  return Buffer.from(s, "utf8").subarray(0, n).toString("utf8");
}

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
      clientInfo: { name: "session-index-test", version: "1.0.0" },
    },
  });
  const result = (await handler(parsed, { requestId: `test-${randomUUID()}` })) as {
    instructions?: string;
  };
  return result.instructions ?? "";
}

describe("session index at the start of the composed instructions", { timeout: 60_000 }, () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;

  beforeEach(async () => {
    state.rules = SIX_RULES;
    state.skills = TWELVE_SKILLS;
    env = prepareMcpTestEnv("neotoma-session-index-");
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

  it("the fixture rule text is about 24KB", () => {
    const total = SIX_RULES.reduce((n, r) => n + Buffer.byteLength(r.rule_text, "utf8"), 0);
    expect(total).toBeGreaterThan(20_000);
  });

  it("(a) the first budget bytes name every rule title and every skill name", async () => {
    const head = firstBytes(await initializeInstructions(), INSTRUCTIONS_INDEX_MAX_BYTES);
    for (const rule of SIX_RULES) expect(head, rule.title).toContain(rule.title);
    for (const skill of TWELVE_SKILLS) expect(head, skill.name).toContain(skill.name);
  });

  it("(b) the index comes before the rules, the skills catalog and the base block", async () => {
    const text = await initializeInstructions();
    expect(text.startsWith(`${INSTRUCTIONS_INDEX_START_MARKER}\n`)).toBe(true);
    const indexEnd = text.indexOf(INSTRUCTIONS_INDEX_END_MARKER);
    expect(indexEnd).toBeGreaterThan(0);
    expect(indexEnd).toBeLessThan(text.indexOf("[STANDING RULES]\n"));
    expect(text.indexOf("[STANDING RULES]\n")).toBeLessThan(text.indexOf("\n[INSTANCE SKILLS]\n"));
    expect(text.indexOf("\n[INSTANCE SKILLS]\n")).toBeLessThan(text.indexOf("[TURN LIFECYCLE]"));
  });

  it("(c) truncating at the budget leaves a well-formed index ending with its end marker", async () => {
    const head = firstBytes(await initializeInstructions(), INSTRUCTIONS_INDEX_MAX_BYTES);
    const index = head.slice(0, head.indexOf(INSTRUCTIONS_INDEX_END_MARKER));
    expect(head).toContain(`\n${INSTRUCTIONS_INDEX_END_MARKER}`);
    expect(index.startsWith(`${INSTRUCTIONS_INDEX_START_MARKER}\n`)).toBe(true);
    // One line per rule, each naming its entity id.
    for (const rule of SIX_RULES) expect(index).toContain(`(${rule.entity_id})`);
    expect(index).not.toMatch(/not listed here/);
  });

  it("(d) initialize, discover and the authenticated REST endpoint return the same text", async () => {
    const fromInitialize = await initializeInstructions();
    const discover = await modernPost(
      app.baseUrl,
      { id: "discover-index", method: "server/discover" },
      { connectionId: "conn-index-a" }
    );
    expect(discover.status, discover.text).toBe(200);
    const fromDiscover = String(discover.body?.result?.instructions ?? "");
    const rest = await fetch(`${app.baseUrl}/mcp-interaction-instructions`, {
      headers: { Authorization: `Bearer ${SYNTHETIC_BEARER}` },
    });
    expect(rest.headers.get("x-neotoma-instructions-composition")).toBe("user");
    const fromRest = await rest.text();

    const prefix = firstBytes(fromInitialize, INSTRUCTIONS_INDEX_MAX_BYTES);
    expect(fromDiscover.startsWith(prefix)).toBe(true);
    expect(fromRest.startsWith(prefix)).toBe(true);
    expect(fromRest).toBe(fromInitialize);
  });

  it("(d) every entrance composes through the one shared composer", () => {
    // The CLI prints the REST text verbatim when authenticated (pinned by
    // standing_rules_cli_instructions_print), and its global path, like the
    // REST global path and unauthenticated discover, must use the composer.
    for (const file of ["src/server.ts", "src/actions.ts", "src/cli/index.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("composeInstructions(");
      expect(src, file).not.toMatch(/\bprependClientInstructionsSection\(/);
      expect(src, file).not.toMatch(/\bcomposeClientInstructions\(/);
    }
  });

  it("with no rules and no skills there is no index", async () => {
    state.rules = [];
    state.skills = [];
    const text = await initializeInstructions();
    // The base block mentions the marker in prose, so check for the rendered
    // header line rather than the bare substring.
    expect(text.startsWith(INSTRUCTIONS_INDEX_START_MARKER)).toBe(false);
    expect(text.split("\n")).not.toContain(INSTRUCTIONS_INDEX_START_MARKER);
  });
});
