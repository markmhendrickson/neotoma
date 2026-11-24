/**
 * `serverInfo._neotoma.standing_rules_skipped` on MCP `initialize`: present
 * with the count when standing_rule rows were dropped for lacking rule_text,
 * absent otherwise. The rule lookup is mocked so the result is exact; the
 * response is built by the real `initialize` request handler.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { StandingRulesLookupResult } from "../../src/services/standing_rules.js";

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

import { NeotomaServer } from "../../src/server.js";

type InitializeResult = {
  serverInfo: {
    _neotoma?: {
      standing_rules?: Array<{ entity_id: string }>;
      standing_rules_skipped?: number;
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
      clientInfo: { name: "standing-rules-skipped-count-test", version: "1.0.0" },
    },
  });
  return (await handler(parsed, { requestId: `test-${randomUUID()}` })) as InitializeResult;
}

const RULE = {
  entity_id: "ent_skipcount_a",
  title: "Synthetic rule",
  rule_text: "Body of the synthetic rule.",
  priority: 1,
};

describe("standing rules: skipped-row count on initialize", () => {
  let server: NeotomaServer;

  beforeAll(() => {
    process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
    server = new NeotomaServer();
  });

  afterAll(() => {
    delete process.env.NEOTOMA_CONNECTION_ID;
  });

  it("exposes the count when rows were skipped", async () => {
    state.result = { rules: [RULE], lookup_failed: false, skipped_missing_text: 3 };
    const result = await callInitialize(server);
    expect(result.serverInfo._neotoma?.standing_rules_skipped).toBe(3);
    expect(result.serverInfo._neotoma?.standing_rules?.map((r) => r.entity_id)).toEqual([
      RULE.entity_id,
    ]);
  });

  it("omits the field when nothing was skipped", async () => {
    state.result = { rules: [RULE], lookup_failed: false };
    const result = await callInitialize(server);
    expect(result.serverInfo._neotoma).toBeDefined();
    expect("standing_rules_skipped" in (result.serverInfo._neotoma ?? {})).toBe(false);
    expect(result.serverInfo._neotoma?.standing_rules?.map((r) => r.entity_id)).toEqual([
      RULE.entity_id,
    ]);
  });
});
