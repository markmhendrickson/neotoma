/**
 * Regression tests for the update_schema_incremental defect cluster:
 * neotoma#2374, #2378, #2379, #2197.
 *
 * Root-cause note (see PR description for the full analysis): #2374 and
 * #2378 share one mechanism inside `updateSchemaIncremental` — the write
 * scope disagreeing with the read scope — and are fixed by one change.
 * #2379 (migration reporting) and #2197 (force unreachable from MCP) are
 * genuinely independent defects in different code paths, fixed separately.
 * Each `describe` block below is scoped to one issue and asserts the actual
 * persisted/reported effect, not just a 200/success envelope.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000002374";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000002375";

function parseResponse(result: { content: Array<{ type: string; text: string }> }) {
  const text = result.content.find((c) => c.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}

type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
};

async function activeRows(entityType: string): Promise<
  Array<{
    id: string;
    schema_version: string;
    scope: string | null;
    user_id: string | null;
    active: boolean;
  }>
> {
  const { data } = await db
    .from("schema_registry")
    .select("id, schema_version, scope, user_id, active")
    .eq("entity_type", entityType)
    .eq("active", true);
  return (data ?? []) as Array<{
    id: string;
    schema_version: string;
    scope: string | null;
    user_id: string | null;
    active: boolean;
  }>;
}

async function cleanupType(entityType: string): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", entityType);
}

describe("update_schema_incremental defect cluster", () => {
  let server: TestServer;

  beforeAll(() => {
    server = new NeotomaServer() as TestServer;
  });

  // ------------------------------------------------------------------
  // #2374 + #2378: write scope must resolve to the same row the read
  // resolved, unless the caller explicitly overrides it. #2378's "fields
  // vanish across calls" symptom is this same bug: each call re-reads
  // whichever scope's row is stale and merges onto it.
  // ------------------------------------------------------------------
  describe("#2374 / #2378: write scope agrees with read scope; no field loss across calls", () => {
    const ENTITY_TYPE = `issue_2374_2378_${Date.now()}`;

    beforeAll(async () => {
      await cleanupType(ENTITY_TYPE);
      // Seed a USER-scoped active row (mirrors the production shape: a
      // per-tenant override exists and is the row `loadActiveSchema` will
      // resolve for this user).
      await schemaRegistry.register({
        entity_type: ENTITY_TYPE,
        schema_version: "1.0.0",
        schema_definition: {
          fields: { name: { type: "string", required: true } },
          canonical_name_fields: ["name"],
        },
        reducer_config: { merge_policies: {} },
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
      });
    });

    afterAll(async () => {
      await cleanupType(ENTITY_TYPE);
    });

    it("a call that omits user_specific writes to the SAME row the read resolved, not a new global row", async () => {
      server.authenticatedUserId = TEST_USER_ID;

      // Before the fix: this reads the user row (name only), computes a
      // merged field set, but writes it as a NEW GLOBAL row (user_specific
      // defaults to false) — leaving both scopes active. Reproduce the bug
      // shape first as a sanity check, then assert the fixed outcome.
      const result = await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: ENTITY_TYPE,
          fields_to_add: [{ field_name: "lead_next_step", field_type: "string" }],
          // user_specific deliberately OMITTED — this is the common case
          // that manufactured the split.
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID
      );
      const body = parseResponse(result);
      expect(body.success).toBe(true);

      // EFFECT assertion, not contract assertion: exactly one active row
      // for this entity_type, and it is user-scoped to TEST_USER_ID — the
      // scope the read resolved. A second, global row must NOT have been
      // manufactured.
      const rows = await activeRows(ENTITY_TYPE);
      expect(rows).toHaveLength(1);
      expect(rows[0].scope).toBe("user");
      expect(rows[0].user_id).toBe(TEST_USER_ID);

      // The response must say which scope was actually written, so a
      // caller never has to guess.
      expect(body.scope).toBe("user");
      expect(body.user_id).toBe(TEST_USER_ID);

      // The new field must be on THAT row — not stranded on an
      // undiscoverable global row.
      const { data: rowData } = await db
        .from("schema_registry")
        .select("schema_definition")
        .eq("id", rows[0].id)
        .single();
      expect(
        (rowData?.schema_definition as { fields?: Record<string, unknown> })?.fields
      ).toHaveProperty("lead_next_step");
    });

    it("#2378: a SECOND incremental call adding a different field does not drop the first call's field", async () => {
      server.authenticatedUserId = TEST_USER_ID;

      // Second call, again omitting user_specific — the exact sequence
      // from #2378's repro (add field A, then add field B, expect BOTH
      // present afterward).
      const result = await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: ENTITY_TYPE,
          fields_to_add: [{ field_name: "lead_band", field_type: "string" }],
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID
      );
      const body = parseResponse(result);
      expect(body.success).toBe(true);

      // Still exactly one active row (no split), still user-scoped.
      const rows = await activeRows(ENTITY_TYPE);
      expect(rows).toHaveLength(1);
      expect(rows[0].scope).toBe("user");

      // THE #2378 ASSERTION: both fields from both calls must be present
      // in the union, not just the field named in this most recent call.
      const { data: rowData } = await db
        .from("schema_registry")
        .select("schema_definition")
        .eq("id", rows[0].id)
        .single();
      const fields = (rowData?.schema_definition as { fields?: Record<string, unknown> })?.fields;
      expect(fields).toHaveProperty("name"); // original baseline field
      expect(fields).toHaveProperty("lead_next_step"); // added by call 1
      expect(fields).toHaveProperty("lead_band"); // added by call 2 — must coexist, not replace
    });

    it("an explicit user_specific: false extends the GLOBAL row, coexisting with the user override and never copying its fields", async () => {
      server.authenticatedUserId = TEST_USER_ID;

      // A global row exists alongside the user override, with a field the
      // override does not carry. An explicit `user_specific: false` means
      // "target global": the new global version must be built from THIS row.
      // Built from the caller's resolved (user) row instead, it would drop
      // `global_baseline_field` from the active global schema and publish the
      // override's private fields (`lead_band`) to every user.
      await schemaRegistry.register({
        entity_type: ENTITY_TYPE,
        schema_version: "1.0.0",
        schema_definition: {
          fields: {
            name: { type: "string", required: true },
            global_baseline_field: { type: "string" },
          },
          canonical_name_fields: ["name"],
        },
        reducer_config: { merge_policies: {} },
        activate: true,
      });

      const result = await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: ENTITY_TYPE,
          fields_to_add: [{ field_name: "global_only_field", field_type: "string" }],
          user_specific: false, // EXPLICIT override — must be honored, not silently coerced to the resolved scope.
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID
      );
      const body = parseResponse(result);
      expect(body.success).toBe(true);
      expect(body.scope).toBe("global");

      // Two active rows legitimately coexist: the pre-existing user override
      // (untouched) and the new global version. This is the capability
      // #2374's acceptance criteria requires to remain reachable.
      const rows = await activeRows(ENTITY_TYPE);
      expect(rows).toHaveLength(2);
      const scopes = rows.map((r) => r.scope).sort();
      expect(scopes).toEqual(["global", "user"]);

      const globalRow = rows.find((r) => r.scope === "global")!;
      expect(globalRow.schema_version).not.toBe("1.0.0");
      const { data: globalData } = await db
        .from("schema_registry")
        .select("schema_definition")
        .eq("id", globalRow.id)
        .single();
      const globalFields = (globalData?.schema_definition as { fields?: Record<string, unknown> })
        ?.fields;
      expect(globalFields).toHaveProperty("global_only_field");
      expect(globalFields).toHaveProperty("global_baseline_field");
      expect(globalFields).not.toHaveProperty("lead_band");
      expect(globalFields).not.toHaveProperty("lead_next_step");

      // The user override is unchanged by a global-targeted call.
      const userRow = rows.find((r) => r.scope === "user")!;
      const { data: userData } = await db
        .from("schema_registry")
        .select("schema_definition")
        .eq("id", userRow.id)
        .single();
      const userFields = (userData?.schema_definition as { fields?: Record<string, unknown> })
        ?.fields;
      expect(userFields).toHaveProperty("lead_band");
      expect(userFields).not.toHaveProperty("global_only_field");
    });
  });

  // ------------------------------------------------------------------
  // #2389-class idempotency: re-running the same activation must not
  // duplicate active rows or reactivate a sibling scope's row.
  // ------------------------------------------------------------------
  describe("activate() idempotency (#2389 class, exercised via updateSchemaIncremental)", () => {
    const ENTITY_TYPE = `issue_2389_idem_${Date.now()}`;

    beforeAll(async () => {
      await cleanupType(ENTITY_TYPE);
    });

    afterAll(async () => {
      await cleanupType(ENTITY_TYPE);
    });

    it("re-running the same incremental update twice does not create duplicate active rows", async () => {
      server.authenticatedUserId = TEST_USER_ID;

      await schemaRegistry.register({
        entity_type: ENTITY_TYPE,
        schema_version: "1.0.0",
        schema_definition: {
          fields: { name: { type: "string", required: true } },
          canonical_name_fields: ["name"],
        },
        reducer_config: { merge_policies: {} },
        activate: true,
      });

      const call = () =>
        server.executeToolForCli(
          "update_schema_incremental",
          {
            entity_type: ENTITY_TYPE,
            fields_to_add: [{ field_name: "extra", field_type: "string" }],
            user_id: TEST_USER_ID,
          },
          TEST_USER_ID
        );

      const first = parseResponse(await call());
      expect(first.success).toBe(true);
      const rowsAfterFirst = await activeRows(ENTITY_TYPE);
      expect(rowsAfterFirst).toHaveLength(1);

      // "extra" now already exists, so calling again with the SAME field
      // is the idempotency case: the merge is a no-op (field already
      // present) but activate() must still leave exactly one active row.
      const second = parseResponse(await call());
      expect(second.success).toBe(true);
      const rowsAfterSecond = await activeRows(ENTITY_TYPE);
      expect(rowsAfterSecond).toHaveLength(1);
    });

    it("activate() targets by row id and cannot reactivate a sibling scope's row sharing the same version string", async () => {
      // Construct the exact #2389 precondition directly: a global row and a
      // user row that happen to share a schema_version string (version
      // counters are per-scope, so collisions are routine, not exotic).
      const type = `${ENTITY_TYPE}_collision`;
      await cleanupType(type);

      const globalRow = await schemaRegistry.register({
        entity_type: type,
        schema_version: "2.0.0",
        schema_definition: { fields: { a: { type: "string" } }, canonical_name_fields: ["a"] },
        reducer_config: { merge_policies: {} },
        activate: true,
      });
      const userRow = await schemaRegistry.register({
        entity_type: type,
        schema_version: "2.0.0", // SAME version string, different scope — the collision.
        schema_definition: { fields: { b: { type: "string" } }, canonical_name_fields: ["b"] },
        reducer_config: { merge_policies: {} },
        user_id: OTHER_USER_ID,
        user_specific: true,
        activate: true,
      });

      // Both should be active right now (independent scopes).
      let rows = await activeRows(type);
      expect(rows).toHaveLength(2);

      // Deactivate BOTH rows directly (simulates the user row having been
      // legitimately turned off — an operator disabling their override, or
      // its own lifecycle deactivating it), then activate ONLY the global
      // row via the service. Before the fix, the final UPDATE in activate()
      // matched every row sharing (entity_type, schema_version) with no
      // scope predicate at all, so it would reactivate the user row too —
      // even though nothing asked for that and the user row's own
      // deactivation was never touched by this call. Deactivating both first
      // makes that distinguishable from "it was already active": if the bug
      // is present, userActive flips from false to true as a side effect of
      // a call that named only the global row.
      await db
        .from("schema_registry")
        .update({ active: false })
        .in("id", [globalRow.id, userRow.id]);
      let preRows = await activeRows(type);
      expect(preRows).toHaveLength(0); // sanity: both genuinely off before the call

      await schemaRegistry.activate(type, "2.0.0"); // global call — no userId

      rows = await activeRows(type);
      const globalActive = rows.find((r) => r.id === globalRow.id);
      const userActive = rows.find((r) => r.id === userRow.id);
      expect(globalActive?.active).toBe(true);
      // THE #2389 ASSERTION: a global-scoped activate() call must not
      // reactivate the user row as a side effect merely because it shares
      // the same version string. It was deactivated above and must stay
      // deactivated — activate() named only the global row.
      expect(userActive).toBeUndefined();
      // Exactly one row overall should now be active — the global one.
      expect(rows.filter((r) => r.active)).toHaveLength(1);

      await cleanupType(type);
    });
  });

  // ------------------------------------------------------------------
  // #2379: migrated_existing must reflect whether anything actually
  // promoted, not the request flag.
  // ------------------------------------------------------------------
  describe("#2379: migrated_existing reflects the actual migration effect", () => {
    const ENTITY_TYPE = `issue_2379_${Date.now()}`;

    beforeAll(async () => {
      await cleanupType(ENTITY_TYPE);
      await db.from("raw_fragments").delete().eq("entity_type", ENTITY_TYPE);
      await schemaRegistry.register({
        entity_type: ENTITY_TYPE,
        schema_version: "1.0.0",
        schema_definition: {
          fields: { name: { type: "string", required: true } },
          canonical_name_fields: ["name"],
        },
        reducer_config: { merge_policies: {} },
        activate: true,
      });
    });

    afterAll(async () => {
      await cleanupType(ENTITY_TYPE);
      await db.from("raw_fragments").delete().eq("entity_type", ENTITY_TYPE);
    });

    it("reports migrated_existing: false (not true) when migration promotes nothing", async () => {
      server.authenticatedUserId = TEST_USER_ID;

      // Seed a raw_fragments row with NO entity_id and a source_id that
      // resolves to zero observations — the exact "ambiguous/unresolvable
      // ownership" shape from #2379's production repro (legacy fragments
      // that predate the field's declaration).
      const orphanSourceId = `orphan-source-${Date.now()}`;
      await db.from("raw_fragments").insert({
        entity_type: ENTITY_TYPE,
        fragment_key: "evidence_grade",
        fragment_value: "A",
        source_id: orphanSourceId,
        interpretation_id: null,
        entity_id: null,
        user_id: TEST_USER_ID,
      });

      const result = await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: ENTITY_TYPE,
          fields_to_add: [{ field_name: "evidence_grade", field_type: "string" }],
          migrate_existing: true,
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID
      );
      const body = parseResponse(result);
      expect(body.success).toBe(true);

      // THE #2379 ASSERTION: migrated_existing must be FALSE here — nothing
      // promoted, because the fragment's ownership could not be resolved.
      // Before the fix this was unconditionally `true` (echoing the request
      // flag), which is exactly the false-positive the issue reports.
      expect(body.migrated_existing).toBe(false);
      expect(body.migration_result).toBeDefined();
      expect(body.migration_result.migrated_count).toBe(0);
      expect(
        body.migration_result.skipped.some(
          (s: { reason: string }) => s.reason === "no_entity_resolution"
        )
      ).toBe(true);
    });

    it("reports migrated_existing: true when migration actually promotes a fragment", async () => {
      server.authenticatedUserId = TEST_USER_ID;

      // Store a real entity through the store path so the fragment gets a
      // proper entity_id (the case the pre-existing happy-path test also
      // covers) — then confirm THIS test file's assertions agree with it.
      const storeResult = await (
        server as unknown as {
          store: (a: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).store({
        idempotency_key: `issue-2379-promote-${Date.now()}`,
        entities: [
          {
            entity_type: ENTITY_TYPE,
            name: `2379 promote test ${Date.now()}`,
            undeclared_note: "should promote",
          },
        ],
      });
      const stored = parseResponse(storeResult);
      const entityId = stored.entities[0].entity_id;

      const result = await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: ENTITY_TYPE,
          fields_to_add: [{ field_name: "undeclared_note", field_type: "string" }],
          migrate_existing: true,
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID
      );
      const body = parseResponse(result);
      expect(body.success).toBe(true);
      expect(body.migrated_existing).toBe(true);
      expect(body.migration_result.migrated_count).toBeGreaterThan(0);

      const { data: obs } = await db
        .from("observations")
        .select("fields")
        .eq("entity_id", entityId);
      const promoted = (obs ?? []).some((o: { fields?: unknown }) => {
        const f = typeof o.fields === "string" ? JSON.parse(o.fields) : o.fields;
        return (
          typeof f === "object" && f !== null && "undeclared_note" in (f as Record<string, unknown>)
        );
      });
      expect(promoted).toBe(true);
    });

    it("the service-level result carries the same migrated_existing truthfulness the MCP handler reports (#2379; the real REST route is covered in the HTTP block below)", async () => {
      const restType = `${ENTITY_TYPE}_rest`;
      await cleanupType(restType);
      await db.from("raw_fragments").delete().eq("entity_type", restType);
      await schemaRegistry.register({
        entity_type: restType,
        schema_version: "1.0.0",
        schema_definition: {
          fields: { name: { type: "string", required: true } },
          canonical_name_fields: ["name"],
        },
        reducer_config: { merge_policies: {} },
        activate: true,
      });

      const orphanSourceId = `orphan-source-rest-${Date.now()}`;
      await db.from("raw_fragments").insert({
        entity_type: restType,
        fragment_key: "evidence_grade",
        fragment_value: "A",
        source_id: orphanSourceId,
        interpretation_id: null,
        entity_id: null,
        user_id: TEST_USER_ID,
      });

      // Drive the SAME scenario through updateSchemaIncremental directly
      // (the function the REST route in actions.ts calls), since these
      // integration tests exercise the server in-process rather than over
      // HTTP. The REST handler's response construction was changed in
      // lockstep with the MCP handler in this PR — this asserts the
      // service-level truth both surfaces now read from.
      const updated = await schemaRegistry.updateSchemaIncremental({
        entity_type: restType,
        fields_to_add: [{ field_name: "evidence_grade", field_type: "string" }],
        migrate_existing: true,
        migrate_user_id: TEST_USER_ID,
        user_id: undefined,
      });
      expect(updated.migration_result).toBeDefined();
      expect(updated.migration_result?.migrated_count).toBe(0);
      expect(
        updated.migration_result?.skipped.some((s) => s.reason === "no_entity_resolution")
      ).toBe(true);

      await cleanupType(restType);
      await db.from("raw_fragments").delete().eq("entity_type", restType);
    });
  });

  // ------------------------------------------------------------------
  // #2197: force must be reachable from MCP for both update_schema_incremental
  // and register_schema.
  // ------------------------------------------------------------------
  describe("#2197: force is reachable from MCP and actually bypasses the naming guard", () => {
    const originalEnv = process.env.NODE_ENV;

    beforeAll(() => {
      // The plural/forbidden-pattern guard only THROWS in production; in
      // dev it only warns. Force production mode for this describe block so
      // the guard's rejection (and force's override of it) is observable via
      // success/failure rather than only a log line.
      process.env.NODE_ENV = "production";
    });

    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
    });

    // Must END in a plural-looking pattern for checkPluralEntityType to flag
    // it (it inspects the string's suffix) — so the uniqueness timestamp goes
    // in the middle, not as a trailing suffix that would mask the plural
    // ending the guard is meant to catch.
    const PLURAL_TYPE = `issue_2197_${Date.now()}_probes`;

    afterAll(async () => {
      await cleanupType(PLURAL_TYPE);
    });

    it("register_schema rejects a plural-looking type without force, and force actually bypasses it", async () => {
      server.authenticatedUserId = TEST_USER_ID;

      // register_schema's plural-guard rejection is thrown (McpError), not
      // returned as a structured error envelope — assert the throw, then
      // assert the effect (no row landed).
      await expect(
        server.executeToolForCli(
          "register_schema",
          {
            entity_type: PLURAL_TYPE,
            schema_definition: {
              fields: { name: { type: "string", required: true } },
              canonical_name_fields: ["name"],
            },
            reducer_config: { merge_policies: {} },
          },
          TEST_USER_ID
        )
      ).rejects.toThrow(/appears to be plural/);
      const rowsAfterReject = await activeRows(PLURAL_TYPE);
      expect(rowsAfterReject).toHaveLength(0);

      // THE #2197 ASSERTION: force: true, passed through the SAME MCP
      // surface (tool inputSchema + Zod parse + handler), must actually
      // reach the guard and let the write through. Before the fix, force
      // was stripped by the tool's inputSchema before the handler ever ran.
      const forced = await server.executeToolForCli(
        "register_schema",
        {
          entity_type: PLURAL_TYPE,
          schema_definition: {
            fields: { name: { type: "string", required: true } },
            canonical_name_fields: ["name"],
          },
          reducer_config: { merge_policies: {} },
          activate: true,
          force: true,
        },
        TEST_USER_ID
      );
      const forcedBody = parseResponse(forced);
      expect(forcedBody.success).toBe(true);

      const rowsAfterForce = await activeRows(PLURAL_TYPE);
      expect(rowsAfterForce).toHaveLength(1);
    });

    it("update_schema_incremental's force also reaches the guard end to end", async () => {
      server.authenticatedUserId = TEST_USER_ID;
      // PLURAL_TYPE now exists (registered with force in the previous test)
      // — update_schema_incremental re-validates the name on every call, so
      // omitting force here must still be rejected even though the type
      // already exists, and passing force must still succeed.
      //
      // Like register_schema, the guard's rejection here is thrown (McpError)
      // rather than returned as a structured envelope — assert the throw.
      await expect(
        server.executeToolForCli(
          "update_schema_incremental",
          {
            entity_type: PLURAL_TYPE,
            fields_to_add: [{ field_name: "extra_field", field_type: "string" }],
            user_id: TEST_USER_ID,
          },
          TEST_USER_ID
        )
      ).rejects.toThrow(/appears to be plural/);
      const rowsAfterReject = await activeRows(PLURAL_TYPE);
      expect((rowsAfterReject[0]?.schema_version ?? "").length).toBeGreaterThan(0); // still on the original version — no field added
      const { data: rowData } = await db
        .from("schema_registry")
        .select("schema_definition")
        .eq("id", rowsAfterReject[0].id)
        .single();
      expect(
        (rowData?.schema_definition as { fields?: Record<string, unknown> })?.fields
      ).not.toHaveProperty("extra_field");

      const forced = await server.executeToolForCli(
        "update_schema_incremental",
        {
          entity_type: PLURAL_TYPE,
          fields_to_add: [{ field_name: "extra_field", field_type: "string" }],
          force: true,
          user_id: TEST_USER_ID,
        },
        TEST_USER_ID
      );
      const forcedBody = parseResponse(forced);
      expect(forcedBody.success).toBe(true);

      const rowsAfterForce = await activeRows(PLURAL_TYPE);
      const { data: rowDataAfter } = await db
        .from("schema_registry")
        .select("schema_definition")
        .eq("id", rowsAfterForce[0].id)
        .single();
      expect(
        (rowDataAfter?.schema_definition as { fields?: Record<string, unknown> })?.fields
      ).toHaveProperty("extra_field");
    });
  });
  // ------------------------------------------------------------------
  // REST over real HTTP. The MCP-path tests above never reach the Express
  // handlers in actions.ts, so these drive them directly.
  // ------------------------------------------------------------------
  describe("REST routes over HTTP", () => {
    const API_PORT = 18246;
    const API_BASE = `http://127.0.0.1:${API_PORT}`;
    let httpServer: ReturnType<typeof createServer>;
    const REG_TYPE = `issue_2446_rest_register_${Date.now()}`;
    const MIG_TYPE = `issue_2446_rest_migrate_${Date.now()}`;

    beforeAll(async () => {
      await cleanupType(REG_TYPE);
      await cleanupType(MIG_TYPE);
      await db.from("raw_fragments").delete().eq("entity_type", MIG_TYPE);
      httpServer = createServer(app);
      await new Promise<void>((resolve, reject) => {
        httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
        httpServer.once("error", reject);
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await cleanupType(REG_TYPE);
      await cleanupType(MIG_TYPE);
      await db.from("raw_fragments").delete().eq("entity_type", MIG_TYPE);
    });

    it("POST /register_schema with user_specific + activate activates the caller's new row, never a same-version global row", async () => {
      // Global 1.0 exists but is INACTIVE; global 2.0 is the active global
      // schema. A user-scoped registration at version "1.0" (the route's own
      // default) must not touch the global partition. If the route's second
      // activate() call resolves the version without the caller's scope, it
      // picks global 1.0, deactivates global 2.0, and flips every user's
      // global schema back to 1.0.
      const base = {
        entity_type: REG_TYPE,
        schema_definition: {
          fields: { name: { type: "string", required: true } },
          canonical_name_fields: ["name"],
        },
        reducer_config: { merge_policies: {} },
      };
      await schemaRegistry.register({ ...base, schema_version: "1.0", activate: false });
      await schemaRegistry.register({ ...base, schema_version: "2.0", activate: true });

      const httpRes = await fetch(`${API_BASE}/register_schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          schema_version: "1.0",
          user_specific: true,
          activate: true,
        }),
      });
      expect(httpRes.status).toBe(200);

      const { data } = await db
        .from("schema_registry")
        .select("schema_version, scope, user_id, active")
        .eq("entity_type", REG_TYPE);
      const rows = (data ?? []) as Array<{
        schema_version: string;
        scope: string | null;
        user_id: string | null;
        active: boolean;
      }>;
      const globalV1 = rows.find((r) => r.scope === "global" && r.schema_version === "1.0");
      const globalV2 = rows.find((r) => r.scope === "global" && r.schema_version === "2.0");
      const userV1 = rows.find((r) => r.scope === "user" && r.schema_version === "1.0");
      expect(userV1?.active).toBe(true);
      expect(userV1?.user_id).toBe(LOCAL_DEV_USER_ID);
      expect(globalV2?.active).toBe(true);
      expect(globalV1?.active).toBe(false);
    });

    it("POST /update_schema_incremental reports migrated_existing from the actual result, with migration_result (#2379)", async () => {
      await schemaRegistry.register({
        entity_type: MIG_TYPE,
        schema_version: "1.0.0",
        schema_definition: {
          fields: { name: { type: "string", required: true } },
          canonical_name_fields: ["name"],
        },
        reducer_config: { merge_policies: {} },
        activate: true,
      });
      // An orphan fragment for the HTTP caller: requested for migration, but
      // it cannot promote (no entity to attach to).
      await db.from("raw_fragments").insert({
        entity_type: MIG_TYPE,
        fragment_key: "evidence_grade",
        fragment_value: "A",
        source_id: `orphan-source-http-${Date.now()}`,
        interpretation_id: null,
        entity_id: null,
        user_id: LOCAL_DEV_USER_ID,
      });

      const httpRes = await fetch(`${API_BASE}/update_schema_incremental`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: MIG_TYPE,
          fields_to_add: [{ field_name: "evidence_grade", field_type: "string" }],
          migrate_existing: true,
        }),
      });
      expect(httpRes.status).toBe(200);
      const body = (await httpRes.json()) as {
        success?: boolean;
        migrated_existing?: boolean;
        scope?: string;
        migration_result?: {
          migrated_count: number;
          skipped: Array<{ field_name: string; reason: string; count: number }>;
        };
      };
      expect(body.success).toBe(true);
      expect(body.scope).toBe("global");
      expect(body.migrated_existing).toBe(false);
      expect(body.migration_result?.migrated_count).toBe(0);
      expect(body.migration_result?.skipped.some((g) => g.reason === "no_entity_resolution")).toBe(
        true
      );
    });

    // ----------------------------------------------------------------
    // #2197 over HTTP: openapi.yaml declares `force` on both routes, so it is
    // exercised on both, each in its natural call shape (JSON body). The naming
    // guard only throws in production, so NODE_ENV is set for these two tests.
    // ----------------------------------------------------------------
    describe("#2197: force over HTTP on both routes", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalTrust = process.env.NEOTOMA_TRUST_PROD_LOOPBACK;
      // Must END in a plural-looking pattern for the guard to flag it.
      const HTTP_PLURAL_TYPE = `issue_2197_http_${Date.now()}_probes`;

      beforeAll(() => {
        process.env.NODE_ENV = "production";
        // Production refuses to trust loopback as the local dev user; this
        // in-process test server is loopback-only, so opt in explicitly.
        process.env.NEOTOMA_TRUST_PROD_LOOPBACK = "1";
      });

      afterAll(async () => {
        process.env.NODE_ENV = originalEnv;
        if (originalTrust === undefined) delete process.env.NEOTOMA_TRUST_PROD_LOOPBACK;
        else process.env.NEOTOMA_TRUST_PROD_LOOPBACK = originalTrust;
        await cleanupType(HTTP_PLURAL_TYPE);
      });

      const definition = {
        fields: { name: { type: "string", required: true } },
        canonical_name_fields: ["name"],
      };

      async function post(path: string, body: Record<string, unknown>) {
        const res = await fetch(`${API_BASE}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: res.status, json: (await res.json()) as Record<string, any> };
      }

      it("POST /register_schema rejects a plural-looking type without force and stores the row with force", async () => {
        const base = {
          entity_type: HTTP_PLURAL_TYPE,
          schema_definition: definition,
          reducer_config: { merge_policies: {} },
          activate: true,
        };
        const rejected = await post("/register_schema", base);
        expect(rejected.status).toBe(400);
        expect(JSON.stringify(rejected.json)).toContain("ERR_PLURAL_ENTITY_TYPE");
        expect(await activeRows(HTTP_PLURAL_TYPE)).toHaveLength(0);

        const forced = await post("/register_schema", { ...base, force: true });
        expect(forced.status).toBe(200);
        const rows = await activeRows(HTTP_PLURAL_TYPE);
        expect(rows).toHaveLength(1);
      });

      it("POST /update_schema_incremental rejects a plural-looking type without force and writes the field with force", async () => {
        // The type now exists (registered with force above); the update route
        // re-validates the name on every call.
        const request = {
          entity_type: HTTP_PLURAL_TYPE,
          fields_to_add: [{ field_name: "extra_field", field_type: "string" }],
        };
        const rejected = await post("/update_schema_incremental", request);
        expect(rejected.status).toBe(400);
        expect(JSON.stringify(rejected.json)).toContain("ERR_PLURAL_ENTITY_TYPE");
        const before = await activeRows(HTTP_PLURAL_TYPE);
        expect(before).toHaveLength(1);
        const { data: beforeRow } = await db
          .from("schema_registry")
          .select("schema_definition")
          .eq("id", before[0].id)
          .single();
        expect(
          (beforeRow?.schema_definition as { fields?: Record<string, unknown> })?.fields
        ).not.toHaveProperty("extra_field");

        const forced = await post("/update_schema_incremental", { ...request, force: true });
        expect(forced.status).toBe(200);
        expect(forced.json.success).toBe(true);
        const after = await activeRows(HTTP_PLURAL_TYPE);
        expect(after).toHaveLength(1);
        const { data: afterRow } = await db
          .from("schema_registry")
          .select("schema_definition")
          .eq("id", after[0].id)
          .single();
        expect(
          (afterRow?.schema_definition as { fields?: Record<string, unknown> })?.fields
        ).toHaveProperty("extra_field");
      });
    });
  });
});
