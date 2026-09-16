/**
 * Regression tests for issue #2454:
 *
 * `describe_entity_type` and `update_schema_incremental` could disagree about
 * whether a schema exists for a given entity_type. `describe_entity_type`
 * resolves the active schema with `loadActiveSchema(entity_type, userId)` —
 * unconditionally passing `userId`, so it tries the user-scoped row first and
 * falls back to global. `update_schema_incremental`'s existence guard instead
 * calls `loadActiveSchema(entity_type, parsed.user_specific ? userId : undefined)`
 * — it only tries the user-scoped row when the CALLER explicitly set
 * `user_specific: true` on the request. A caller who omits `user_specific`
 * (the common case — `user_specific` defaults to `false`) against a schema
 * that is active only in user scope gets `ERR_NO_SCHEMA_FOR_ENTITY_TYPE`, even
 * though `describe_entity_type` — and every entity write — resolves the same
 * type's schema successfully.
 *
 * The write-scope RESOLUTION mechanism itself (making the guard/update read
 * and write the same scope by default) is issue #2374/#2378, fixed in PR
 * #2446 (not duplicated here). This test instead covers the second half of
 * #2454: when the guard's scope-limited lookup comes up empty but a schema
 * for the entity_type is active in a DIFFERENT scope, the error must:
 *   1. name which lookup failed and in which scope, and
 *   2. NOT recommend `register_schema` — registering a second schema for a
 *      type that already has one is how the dual-active-row condition in
 *      #2374/#2378 arises, after which the next incremental call merges onto
 *      stale state and drops fields.
 *
 * This is distinct from the existing cold-start case (no schema anywhere —
 * `update_schema_incremental_cold_start.test.ts`), where `register_schema` is
 * still the correct and un-changed recommendation.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-0000002454a1";
const OTHER_USER_ID = "00000000-0000-0000-0000-0000002454a2";

// An entity_type whose ONLY active schema lives in user scope for TEST_USER_ID.
const USER_SCOPED_ONLY_TYPE = "issue_2454_user_scoped_only_type";
// An entity_type whose ONLY active schema lives in global scope.
const GLOBAL_SCOPED_ONLY_TYPE = "issue_2454_global_scoped_only_type";

async function cleanupTestData(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", USER_SCOPED_ONLY_TYPE);
  await db.from("schema_registry").delete().eq("entity_type", GLOBAL_SCOPED_ONLY_TYPE);
  await db.from("raw_fragments").delete().eq("entity_type", USER_SCOPED_ONLY_TYPE);
  await db.from("raw_fragments").delete().eq("entity_type", GLOBAL_SCOPED_ONLY_TYPE);
}

describe("update_schema_incremental / describe_entity_type schema-lookup parity (issue #2454)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    await cleanupTestData();
    server = new NeotomaServer();

    // Seed a schema active ONLY in user scope, for TEST_USER_ID.
    const { error: userInsertError } = await db.from("schema_registry").insert({
      entity_type: USER_SCOPED_ONLY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        identity_opt_out: "heuristic_canonical_name",
        fields: {
          name: { type: "string" },
        },
      },
      reducer_config: {
        merge_policies: {
          name: { strategy: "last_write", tie_breaker: "observed_at" },
        },
      },
      active: true,
      scope: "user",
      user_id: TEST_USER_ID,
    });
    expect(userInsertError).toBeFalsy();

    // Seed a second, unrelated entity_type active ONLY in global scope, so the
    // "genuinely no schema anywhere" behavior can be told apart from this one.
    const { error: globalInsertError } = await db.from("schema_registry").insert({
      entity_type: GLOBAL_SCOPED_ONLY_TYPE,
      schema_version: "1.0",
      schema_definition: {
        identity_opt_out: "heuristic_canonical_name",
        fields: {
          title: { type: "string" },
        },
      },
      reducer_config: {
        merge_policies: {
          title: { strategy: "last_write", tie_breaker: "observed_at" },
        },
      },
      active: true,
      scope: "global",
      user_id: null,
    });
    expect(globalInsertError).toBeFalsy();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("describe_entity_type resolves the user-scoped schema for its owning user", async () => {
    const result = await server.executeToolForCli(
      "describe_entity_type",
      { entity_type: USER_SCOPED_ONLY_TYPE, user_id: TEST_USER_ID },
      TEST_USER_ID
    );
    const body = JSON.parse(result.content[0].text) as {
      entity_type?: string;
      field_names?: string[];
    };
    expect(body.entity_type).toBe(USER_SCOPED_ONLY_TYPE);
    expect(body.field_names).toContain("name");
  });

  it("update_schema_incremental without user_specific reports a scope mismatch, not a missing schema, for a type that is active only in user scope", async () => {
    const result = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: USER_SCOPED_ONLY_TYPE,
        fields_to_add: [{ field_name: "status", field_type: "string" }],
        // Deliberately omitted: user_specific. This is the common calling
        // pattern (a caller extending a type it already knows exists,
        // per describe_entity_type, without restating scope).
        user_id: TEST_USER_ID,
      },
      TEST_USER_ID
    );

    const body = JSON.parse(result.content[0].text) as {
      error?: {
        error_code?: string;
        message?: string;
        hint?: string;
        details?: { entity_type?: string; guard_scope?: string; found_scope?: string };
      };
    };

    expect(body.error).toBeDefined();

    // Must NOT be reported as "no schema anywhere" — a schema for this type
    // is active (in user scope), which is exactly what makes the old hint
    // dangerous: recommending register_schema here would create a second
    // active row for a type that already has one and already has live data.
    expect(body.error?.error_code).not.toBe("ERR_NO_SCHEMA_FOR_ENTITY_TYPE");
    expect(body.error?.error_code).toBe("ERR_SCHEMA_SCOPE_MISMATCH");

    // Names which lookup failed and in which scope.
    expect(body.error?.details?.entity_type).toBe(USER_SCOPED_ONLY_TYPE);
    expect(body.error?.details?.guard_scope).toBe("global");
    expect(body.error?.details?.found_scope).toBe("user");
    expect(body.error?.message).toContain("global");
    expect(body.error?.message).toContain("user");

    // Must NOT recommend register_schema.
    expect(typeof body.error?.hint).toBe("string");
    expect(body.error?.hint).not.toContain("register_schema");

    // Must give an actionable, scope-correct path forward.
    expect(body.error?.hint).toContain("user_specific");
  });

  it("update_schema_incremental WITH user_specific: true resolves the same user-scoped schema describe_entity_type saw, and extends it", async () => {
    const result = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: USER_SCOPED_ONLY_TYPE,
        fields_to_add: [{ field_name: "status", field_type: "string" }],
        user_specific: true,
        user_id: TEST_USER_ID,
      },
      TEST_USER_ID
    );

    const body = JSON.parse(result.content[0].text) as {
      success?: boolean;
      error?: unknown;
      fields_added?: string[];
    };

    expect(body.error).toBeUndefined();
    expect(body.success).toBe(true);
    expect(body.fields_added).toContain("status");

    // Confirm the field is now visible via describe_entity_type — the two
    // tools agree, closing the loop the issue reported as a contradiction.
    const describeResult = await server.executeToolForCli(
      "describe_entity_type",
      { entity_type: USER_SCOPED_ONLY_TYPE, user_id: TEST_USER_ID },
      TEST_USER_ID
    );
    const describeBody = JSON.parse(describeResult.content[0].text) as {
      field_names?: string[];
    };
    expect(describeBody.field_names).toContain("status");
    expect(describeBody.field_names).toContain("name");
  });

  it("a caller with NO relationship to the user-scoped schema (different user, no schema of their own) still gets the genuine no-schema response with the register_schema hint intact", async () => {
    // OTHER_USER_ID has no user-scoped schema for this type, and no global
    // schema exists either — this must remain the ordinary cold-start path,
    // completely unaffected by the scope-mismatch branch above.
    const result = await server.executeToolForCli(
      "update_schema_incremental",
      {
        entity_type: "issue_2454_truly_unregistered_type",
        fields_to_add: [{ field_name: "x", field_type: "string" }],
        user_id: OTHER_USER_ID,
      },
      OTHER_USER_ID
    );

    const body = JSON.parse(result.content[0].text) as {
      error?: { error_code?: string; hint?: string };
    };
    expect(body.error?.error_code).toBe("ERR_NO_SCHEMA_FOR_ENTITY_TYPE");
    expect(body.error?.hint).toContain("register_schema");
  });
});
