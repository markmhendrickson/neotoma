/**
 * Effect-level regression for #2131: a stored `standing_rule` must actually
 * reach an agent through MCP `initialize` on the local (libSQL/SQLite)
 * backend.
 *
 * Why this exists as a separate test from `tests/unit/standing_rules.test.ts`:
 * the unit tests mock `src/db.js`, so they verify the service's branching but
 * cannot catch a query the real driver rejects. That is exactly how #2131
 * survived — the lookup used the PostgREST embed hint
 * `entity_snapshots!inner(snapshot)`, which libSQL forwards into SQL and
 * fails with `unrecognized token: "!"`. Every mocked test still passed while
 * every real session on a libSQL instance received zero standing rules.
 *
 * So this test deliberately uses NO database mock. It seeds a real row,
 * drives the real `initialize` request handler, and asserts on the
 * reporter-visible surface an agent actually reads:
 * `serverInfo._neotoma.standing_rules`.
 *
 * Per task_policy `fixed_means_behavior_verified_not_contract_accepted`
 * (ent_db0b7855d47012084477fb00): a driver-contract check is not evidence of
 * the effect. This asserts the effect.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupTestEntity, cleanupEntitySnapshot } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;

/** Rule text is asserted verbatim, so keep it distinctive. */
const RULE_TEXT =
  "SCOPE TEST RULE — this text must survive the round trip to serverInfo._neotoma.";
const RULE_TITLE = "Effect Test Rule";

const entityId = `ent_test_sr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/**
 * Invoke the server's real `initialize` handler.
 *
 * `test-connection-bypass` is the repo's existing test-auth path (server.ts):
 * under NODE_ENV=test/VITEST it pins `authenticatedUserId` to
 * LOCAL_DEV_USER_ID and then calls the same
 * `buildAuthenticatedInitializeResponse()` a real authenticated session uses.
 * That keeps this an effect test rather than a call to a private method.
 */
async function callInitialize(server: NeotomaServer): Promise<{
  serverInfo: {
    _neotoma?: {
      standing_rules?: Array<{ entity_id: string; title: string; rule_text: string }>;
      standing_rules_unavailable?: boolean;
      standing_rules_note?: string;
    };
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

  const request = {
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "standing-rules-effect-test", version: "1.0.0" },
    },
  };

  // Parse through the real schema so the handler receives what the SDK
  // would hand it.
  const parsed = InitializeRequestSchema.parse(request);

  return (await handler(parsed, {
    requestId: `test-${randomUUID()}`,
    // No requestInfo => stdio transport, which routes to the connection-id path.
  })) as Awaited<ReturnType<typeof callInitialize>>;
}

/** Seed a `standing_rule` the way the reduction layer stores one. */
async function seedStandingRule(): Promise<void> {
  const snapshot = {
    title: RULE_TITLE,
    rule_text: RULE_TEXT,
    enabled: true,
    priority: 100,
  };

  await db.from("entities").insert({
    id: entityId,
    user_id: USER_ID,
    entity_type: "standing_rule",
    canonical_name: RULE_TITLE,
    merged_to_entity_id: null,
  });

  await db.from("entity_snapshots").insert({
    entity_id: entityId,
    user_id: USER_ID,
    entity_type: "standing_rule",
    schema_version: "1.0.0",
    canonical_name: RULE_TITLE,
    snapshot,
    observation_count: 1,
    last_observation_at: new Date().toISOString(),
    provenance: {},
    computed_at: new Date().toISOString(),
  });
}

describe("standing rules reach the agent through MCP initialize (#2131)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
    await seedStandingRule();
    server = new NeotomaServer();
  });

  afterAll(async () => {
    delete process.env.NEOTOMA_CONNECTION_ID;
    await cleanupEntitySnapshot(entityId);
    await cleanupTestEntity(entityId);
  });

  it("delivers a stored enabled rule in serverInfo._neotoma.standing_rules", async () => {
    const result = await callInitialize(server);

    const rules = result.serverInfo._neotoma?.standing_rules;
    expect(rules, "initialize returned no standing_rules array").toBeDefined();

    const seeded = rules?.find((r) => r.entity_id === entityId);

    // The #2131 failure mode is precisely an empty array here, so say so.
    expect(
      seeded,
      `seeded rule ${entityId} did not reach initialize; got ${JSON.stringify(rules)}`
    ).toBeDefined();

    expect(seeded?.rule_text).toBe(RULE_TEXT);
    expect(seeded?.title).toBe(RULE_TITLE);
  });

  it("does not flag rules as unavailable when the lookup succeeds", async () => {
    const result = await callInitialize(server);

    // A successful lookup must not carry the failure markers — otherwise an
    // agent would treat a working policy as unknown.
    expect(result.serverInfo._neotoma?.standing_rules_unavailable).toBeUndefined();
    expect(result.serverInfo._neotoma?.standing_rules_note).toBeUndefined();
  });
});
