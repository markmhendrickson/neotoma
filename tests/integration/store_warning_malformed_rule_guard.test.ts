/**
 * Regression test for the store_warnings malformed-rule guard (skill store 500).
 *
 * Bug: the store path evaluated each `store_warnings` rule with
 * `rule.fields.some(...)`. A rule stored in a legacy/malformed shape — no
 * `fields` array (e.g. a `condition`-shaped entry like
 * `{ code, message, condition: { missing_all_of: ["content"] } }`) — caused
 * `undefined.some` to throw, 500-ing the entire store call. This was observed
 * on the `skill` entity type, whose DB-stored schema carried a
 * `condition`-shaped store_warnings entry, making store() of ANY skill
 * entity fail.
 *
 * Fix: skip any rule whose `fields` is not a non-empty array (src/actions.ts,
 * src/server.ts).
 *
 * This suite drives both real store call sites — storeStructuredForApi (API
 * path) and NeotomaServer.store (MCP path) — against a schema seeded with the
 * real condition-shaped malformed rule, mirroring the pattern in
 * tests/integration/idempotency_collision.test.ts. It asserts the reported
 * effect: store() of an entity under the malformed schema resolves instead of
 * throwing "Cannot read properties of undefined (reading 'some')".
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { storeStructuredForApi } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const ENTITY_TYPE = "store_warning_malformed_rule_guard_test_skill";

// Faithful reproduction of the legacy, malformed `condition`-shaped
// store_warnings entry observed on the `skill` entity type's DB-stored
// schema: no `fields` array, a `condition` key instead. Cast through
// `unknown` because the TS type requires `fields`; the bug is precisely
// that malformed rows bypassing that type can already exist in the DB.
const MALFORMED_STORE_WARNINGS_RULE = {
  code: "MISSING_CONTENT_FIELD",
  message: "skill has no content body.",
  condition: { missing_all_of: ["content"] },
} as unknown as { code: string; fields: string[]; message: string };

describe("store_warnings malformed-rule guard (issue: skill store 500)", () => {
  beforeAll(async () => {
    if (!(await schemaRegistry.loadActiveSchema(ENTITY_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: ENTITY_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            name: { type: "string", required: false },
            content: { type: "string", required: false },
          },
          identity_opt_out: "heuristic_canonical_name",
          store_warnings: [MALFORMED_STORE_WARNINGS_RULE],
        },
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }
  });

  afterAll(async () => {
    await cleanupEntityType(ENTITY_TYPE, TEST_USER_ID);
    await cleanupTestSchema(ENTITY_TYPE, TEST_USER_ID);
  });

  it("API path (storeStructuredForApi) resolves without throwing on the malformed rule", async () => {
    const result = await storeStructuredForApi({
      userId: TEST_USER_ID,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          name: `api-store-${randomUUID()}`,
        },
      ],
      sourcePriority: 100,
      idempotencyKey: `malformed-rule-guard-api-${randomUUID()}`,
    });

    expect(result.entities.length).toBeGreaterThan(0);
  });

  it("MCP path (NeotomaServer.store) resolves without throwing on the malformed rule", async () => {
    const server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

    const storeMethod = (
      server as unknown as {
        store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store.bind(server);

    const result = await storeMethod({
      user_id: TEST_USER_ID,
      idempotency_key: `malformed-rule-guard-mcp-${randomUUID()}`,
      entities: [
        {
          entity_type: ENTITY_TYPE,
          name: `mcp-store-${randomUUID()}`,
        },
      ],
    });

    expect(result.content.length).toBeGreaterThan(0);
  });
});
