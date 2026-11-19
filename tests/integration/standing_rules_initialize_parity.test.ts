/**
 * Same-response parity between the two standing-rule surfaces of one MCP
 * `initialize` response (#2187): every rule in `serverInfo._neotoma.standing_rules`
 * must appear in the `instructions` prose, and the prose's rule count must match
 * the structured list. Covered for several enabled rules and for an empty set.
 *
 * The rule lookup is mocked so the rule set is exact; the response is built by
 * the real `initialize` request handler.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { StandingRule } from "../../src/services/standing_rules.js";

const state: { rules: StandingRule[] } = { rules: [] };

vi.mock("../../src/services/standing_rules.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/standing_rules.js")>();
  return {
    ...actual,
    getActiveStandingRulesResult: vi.fn(async () => ({ rules: state.rules, lookup_failed: false })),
  };
});

import { NeotomaServer } from "../../src/server.js";

type InitializeResult = {
  instructions?: string;
  serverInfo: {
    _neotoma?: {
      standing_rules?: Array<{ entity_id: string; title: string; rule_text: string }>;
      standing_rules_unavailable?: boolean;
      standing_rules_note?: string;
    };
  };
};

async function callInitialize(server: NeotomaServer): Promise<InitializeResult> {
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
      clientInfo: { name: "standing-rules-lookup-failure-test", version: "1.0.0" },
    },
  });
  return (await handler(parsed, { requestId: `test-${randomUUID()}` })) as InitializeResult;
}

/** Start of the base instructions block, full or compact. */
function baseBlockStart(instructions: string): number {
  const candidates = ["[TURN LIFECYCLE]", "[COMPACT MODE"]
    .map((m) => instructions.indexOf(m))
    .filter((i) => i >= 0);
  return candidates.length > 0 ? Math.min(...candidates) : -1;
}

const SEVERAL: StandingRule[] = [
  {
    entity_id: "ent_parity_a",
    title: "Parity rule A",
    rule_text: "Body of parity rule A.",
    scope: "global",
    priority: 30,
  },
  {
    entity_id: "ent_parity_b",
    title: "Parity rule B",
    rule_text: "Body of parity rule B.",
    priority: 20,
  },
  {
    entity_id: "ent_parity_c",
    title: "Parity rule C",
    rule_text: "Body of parity rule C.",
    scope: "billing",
    priority: 10,
  },
  {
    entity_id: "ent_parity_d",
    title: "Parity rule D",
    rule_text: "Body of parity rule D.",
    priority: 5,
  },
];

describe("standing rules: same-response parity between serverInfo and instructions", () => {
  let server: NeotomaServer;

  beforeAll(() => {
    process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
    server = new NeotomaServer();
  });

  afterAll(() => {
    delete process.env.NEOTOMA_CONNECTION_ID;
  });

  it("several enabled rules: every structured rule is in the prose and the counts agree", async () => {
    state.rules = SEVERAL;
    const result = await callInitialize(server);
    const structured = result.serverInfo._neotoma?.standing_rules ?? [];
    const prose = result.instructions ?? "";

    expect(structured.map((r) => r.entity_id)).toEqual(SEVERAL.map((r) => r.entity_id));
    for (const rule of structured) {
      expect(prose, `rule ${rule.entity_id} missing from prose`).toContain(
        `### ${rule.title} (entity_id: ${rule.entity_id})`
      );
      expect(prose, `body of ${rule.entity_id} missing from prose`).toContain(rule.rule_text);
    }

    const count = prose.match(/This instance has (\d+) standing rules? in force/);
    expect(count, "prose carries no rule count").not.toBeNull();
    expect(Number(count![1])).toBe(structured.length);
    expect(prose.match(/^### .*\(entity_id: /gm)?.length).toBe(structured.length);

    // Prose order follows the structured (priority) order.
    const positions = structured.map((r) => prose.indexOf(`(entity_id: ${r.entity_id})`));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(result.serverInfo._neotoma?.standing_rules_unavailable).toBeUndefined();
  });

  it("empty enabled set: no structured rules and no rules in the prose", async () => {
    state.rules = [];
    const result = await callInitialize(server);
    const structured = result.serverInfo._neotoma?.standing_rules ?? [];
    const prose = result.instructions ?? "";

    expect(structured).toEqual([]);
    // The base block documents the `[STANDING RULES]` header by name, so check
    // only what precedes it: that is where the rules section would be placed.
    const baseAt = baseBlockStart(prose);
    expect(baseAt, "base instructions block not found").toBeGreaterThanOrEqual(0);
    const lead = prose.slice(0, baseAt);
    expect(lead).not.toContain("[STANDING RULES]");
    expect(lead).not.toMatch(/standing rules? in force/);
    expect(prose).not.toMatch(/^### .*\(entity_id: /m);
    expect(result.serverInfo._neotoma?.standing_rules_unavailable).toBeUndefined();
  });
});
