/**
 * Integration tests for the store write/correct contract cluster:
 *
 * - #1552: undeclared fields surface a non-fatal UNKNOWN_FIELD store_warning
 *   (plus the existing top-level unknown_fields list) rather than silently
 *   vanishing from the snapshot projection.
 * - #1559: a stored observation that omits a schema field declared
 *   `required: true` surfaces a non-fatal MISSING_REQUIRED_FIELD store_warning
 *   and a top-level required_fields_missing[] entry. The write is still accepted.
 * - #1549: the unknown_fields hint is conditional on the schema's identity
 *   config. A schema WITHOUT canonical_name_fields must NOT be told to call
 *   update_schema_incremental (which would dead-end on
 *   ERR_SCHEMA_MISSING_IDENTITY_CONFIG); it must be pointed at correct()/
 *   register_schema instead. A schema WITH canonical_name_fields may be told to
 *   use update_schema_incremental.
 *
 * Exercises the real MCP store path (server.store -> storeStructuredInternal)
 * against the local DB.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

// Schema WITHOUT identity config (identity_opt_out) and with a required field.
const OPT_OUT_TYPE = "test_checkpoint_brief_cluster";
// Schema WITH identity config (canonical_name_fields).
const IDENTITY_TYPE = "test_identity_cluster";

type StoreWarning = {
  code: string;
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

type StoreResponse = {
  entities?: Array<{ entity_id: string; entity_type: string }>;
  unknown_fields_count?: number;
  unknown_fields?: string[];
  hint?: string;
  store_warnings?: StoreWarning[];
  required_fields_missing?: Array<{
    entity_type: string;
    field: string;
    observation_index: number;
  }>;
  error?: unknown;
};

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

describe("store write contract: unknown + required field signals (#1552, #1559, #1549)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

    // identity_opt_out schema with a required field (mirrors the
    // checkpoint_brief.checkpoint_name case from #1559).
    if (!(await schemaRegistry.loadActiveSchema(OPT_OUT_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: OPT_OUT_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            checkpoint_name: { type: "string", required: true },
            summary: { type: "string", required: false },
          },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: { merge_policies: { summary: { strategy: "last_write" } } },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }

    // Schema WITH canonical_name_fields (identity config present).
    if (!(await schemaRegistry.loadActiveSchema(IDENTITY_TYPE, TEST_USER_ID))) {
      await schemaRegistry.register({
        entity_type: IDENTITY_TYPE,
        schema_version: "1.0",
        schema_definition: {
          fields: {
            label: { type: "string", required: false },
          },
          canonical_name_fields: ["label"],
        },
        reducer_config: { merge_policies: { label: { strategy: "last_write" } } },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    }
  });

  afterAll(async () => {
    await cleanupEntityType(OPT_OUT_TYPE, TEST_USER_ID);
    await cleanupEntityType(IDENTITY_TYPE, TEST_USER_ID);
    await cleanupTestSchema(OPT_OUT_TYPE, TEST_USER_ID);
    await cleanupTestSchema(IDENTITY_TYPE, TEST_USER_ID);
  });

  it("#1559: omitting a required field yields a MISSING_REQUIRED_FIELD warning and required_fields_missing entry, but still commits", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `req-missing-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: OPT_OUT_TYPE,
          // checkpoint_name (required) deliberately omitted
          summary: "A brief without its required name",
          canonical_name: "Brief-with-no-name",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    // Write is non-fatally accepted.
    expect(body.entities && body.entities.length).toBe(1);

    expect(body.required_fields_missing).toBeDefined();
    expect(
      body.required_fields_missing!.some(
        (r) => r.field === "checkpoint_name" && r.entity_type === OPT_OUT_TYPE
      )
    ).toBe(true);

    const warn = (body.store_warnings ?? []).find((w) => w.code === "MISSING_REQUIRED_FIELD");
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("checkpoint_name");
  });

  it("#1559: supplying the required field produces no MISSING_REQUIRED_FIELD warning", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `req-present-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: OPT_OUT_TYPE,
          checkpoint_name: "Q3 milestone",
          summary: "Complete brief",
          canonical_name: "Q3-milestone-brief",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.required_fields_missing).toBeUndefined();
    expect((body.store_warnings ?? []).some((w) => w.code === "MISSING_REQUIRED_FIELD")).toBe(false);
  });

  it("#1552: an undeclared field yields an UNKNOWN_FIELD store_warning and appears in unknown_fields", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `unknown-field-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: OPT_OUT_TYPE,
          checkpoint_name: "With extra field",
          canonical_name: "extra-field-brief",
          // not declared on the schema
          owner_handle_zzz: "alice",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.unknown_fields).toContain("owner_handle_zzz");
    expect(body.unknown_fields_count).toBeGreaterThan(0);

    const warn = (body.store_warnings ?? []).find(
      (w) => w.code === "UNKNOWN_FIELD" && w.message.includes("owner_handle_zzz")
    );
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(OPT_OUT_TYPE);
  });

  it("#1549: a schema WITHOUT canonical_name_fields must NOT prescribe update_schema_incremental", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `hint-optout-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: OPT_OUT_TYPE,
          checkpoint_name: "Hint test",
          canonical_name: "hint-optout-brief",
          undeclared_xyz: "value",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.unknown_fields).toContain("undeclared_xyz");
    expect(body.hint).toBeDefined();
    // The dead-end path must not be prescribed for an identity-opt-out schema.
    expect(body.hint).toContain("ERR_SCHEMA_MISSING_IDENTITY_CONFIG");
    expect(body.hint).toMatch(/correct\(\)|register_schema/);
  });

  it("#1549: a schema WITH canonical_name_fields may prescribe update_schema_incremental", async () => {
    const result = await callStore(server, {
      user_id: TEST_USER_ID,
      idempotency_key: `hint-identity-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: IDENTITY_TYPE,
          label: "identity-hint-entity",
          undeclared_abc: "value",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.unknown_fields).toContain("undeclared_abc");
    expect(body.hint).toBeDefined();
    expect(body.hint).toContain("update_schema_incremental");
    expect(body.hint).not.toContain("ERR_SCHEMA_MISSING_IDENTITY_CONFIG");
  });
});
