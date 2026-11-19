/**
 * Effect test for a FAILED standing-rule lookup at MCP `initialize` (#2187).
 *
 * The lookup is forced to fail by mocking `getActiveStandingRulesResult` to
 * return what the real function returns when its query throws. Everything else
 * is the real server: the real `initialize` request handler builds the
 * response, and the assertions read the two surfaces a client receives in that
 * one response, the `instructions` prose and `serverInfo._neotoma`.
 *
 * What must hold:
 * - the prose says the rules are UNKNOWN, never that there are none;
 * - that warning sits ahead of the base instructions block, where truncation
 *   cannot reach it;
 * - `serverInfo._neotoma.standing_rules_unavailable` agrees in the same response;
 * - no rule body is invented to fill the gap.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";

vi.mock("../../src/services/standing_rules.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/standing_rules.js")>();
  return {
    ...actual,
    getActiveStandingRulesResult: vi.fn(async () => ({
      rules: [],
      lookup_failed: true,
      error: "synthetic lookup failure",
    })),
  };
});

import { NeotomaServer } from "../../src/server.js";
import { getActiveStandingRulesResult } from "../../src/services/standing_rules.js";

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

describe("standing-rule lookup failure at MCP initialize", () => {
  let server: NeotomaServer;
  let result: InitializeResult;

  beforeAll(async () => {
    process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
    server = new NeotomaServer();
    result = await callInitialize(server);
  });

  afterAll(() => {
    delete process.env.NEOTOMA_CONNECTION_ID;
  });

  it("actually forced the lookup to fail", () => {
    expect(vi.mocked(getActiveStandingRulesResult)).toHaveBeenCalled();
  });

  it("says the rules are unknown, not that there are none", () => {
    const text = result.instructions ?? "";
    expect(text).toMatch(/standing rules could not be read for this session/);
    expect(text).toMatch(/Treat them as unknown/);
    // The success renderer's count line would assert a known rule set.
    expect(text).not.toMatch(/standing rules? in force/);
    expect(text).not.toMatch(/This instance has \d+ standing rule/);
  });

  it("places the warning ahead of the base block", () => {
    const text = result.instructions ?? "";
    const warningAt = text.indexOf("[STANDING RULES]");
    const baseAt = baseBlockStart(text);
    expect(warningAt).toBe(0);
    expect(baseAt, "base instructions block not found").toBeGreaterThan(0);
    expect(warningAt).toBeLessThan(baseAt);
  });

  it("agrees with serverInfo._neotoma in the same response", () => {
    const meta = result.serverInfo._neotoma;
    expect(meta?.standing_rules_unavailable).toBe(true);
    expect(meta?.standing_rules_note).toMatch(/could not be read/);
    expect(meta?.standing_rules).toEqual([]);
  });

  it("does not fabricate a rule body", () => {
    const text = result.instructions ?? "";
    const section = text.slice(0, baseBlockStart(text));
    // Rule entries render as `### <title> (entity_id: ...)`; a failed lookup has none.
    expect(section).not.toMatch(/^### /m);
    expect(section).not.toMatch(/entity_id:/);
  });
});
