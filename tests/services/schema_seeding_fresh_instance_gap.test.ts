/**
 * Regression coverage for the "fresh-instance schema-seeding gap" documented
 * in tests/integration/company_entity_resolution_leads.test.ts and
 * docs/developer/schema_initialization.md:
 *
 * `schemaRegistry.loadActiveSchema` (src/services/schema_registry.ts) is
 * DB-backed only — unlike src/services/interpretation.ts's type-refinement
 * path, it has NO fallback to the code-defined `ENTITY_SCHEMAS` when no
 * `schema_registry` row exists (see loadGlobalSchema / loadUserSpecificSchema,
 * both pure `db.from("schema_registry")` lookups, and
 * applyBuiltInSchemaIdentityDefaults, which only merges identity defaults
 * onto an *existing* row and returns `null` unchanged otherwise).
 *
 * Concretely: the `reference_fields`-driven auto-link hook at store time
 * (src/server.ts storeStructuredInternal -> autoLinkReferenceFields) reads
 * the schema via `schemaRegistry.loadActiveSchema` directly, with no
 * code-fallback wrapper. So on a fresh/unseeded instance DB, a `contact`'s
 * `organization` field will NOT auto-link to a `company` via `works_at`
 * (the join key the company_query / query_contacts_at_company tool depends
 * on) until the `contact` schema — including its `reference_fields` — is
 * registered into that instance's `schema_registry` table.
 *
 * The fix is NOT new code: `scripts/initialize-schemas.ts` (npm run
 * schema:init) already exists, is idempotent, and already iterates every
 * entry in `ENTITY_SCHEMAS` (including `contact`) registering each at
 * *global* scope — the scope `loadActiveSchema` falls through to for any
 * caller/userId once no user-specific override exists. This test proves,
 * using the exact registration call the script makes (global scope, no
 * user_id — see registerSchema() in scripts/initialize-schemas.ts), that:
 *
 *  1. the gap is real: with no schema_registry row, loadActiveSchema
 *     returns null for a fresh entity_type at global scope;
 *  2. the existing seeding mechanism closes it: registering (global scope,
 *     mirroring initialize-schemas.ts) makes loadActiveSchema return a
 *     schema whose reference_fields survive the round-trip intact — the
 *     load-bearing piece for the auto-link hook and, transitively, for
 *     query_contacts_at_company / queryContactsAtCompany.
 *
 * Uses a scratch entity_type (not the real `contact` type) so this test
 * doesn't depend on, or disturb, whatever global `contact` schema state
 * other tests in the shared local SQLite test DB (vitest.setup.ts) may have
 * already registered — matching the isolation pattern in
 * schema_reference_fields_resolve_target_validation.test.ts.
 */

import { describe, it, expect, afterAll } from "vitest";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { db } from "../../src/db.js";
import type { SchemaDefinition } from "../../src/services/schema_registry.js";

const FRESH_TYPE = "seed_gap_fresh_instance_test_type";

async function cleanup(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", FRESH_TYPE);
}

describe("fresh-instance schema-seeding gap: loadActiveSchema has no code fallback", () => {
  afterAll(cleanup);

  it("(1) the gap: loadActiveSchema returns null (global scope) when no schema_registry row exists yet", async () => {
    // No register() call has happened for FRESH_TYPE yet in this test run.
    const schema = await schemaRegistry.loadActiveSchema(FRESH_TYPE);
    expect(schema).toBeNull();
  });

  it("(2) the fix: registering at global scope (mirroring scripts/initialize-schemas.ts) makes loadActiveSchema resolve it, reference_fields intact", async () => {
    const schemaDefinition: SchemaDefinition = {
      fields: {
        organization: { type: "string", required: false },
      },
      identity_opt_out: "heuristic_canonical_name",
      // The load-bearing shape under test: a reference_fields entry with
      // resolve_target: true, matching the real contact schema's
      // organization -> company works_at link (schema_definitions.ts).
      reference_fields: [
        {
          field: "organization",
          target_entity_type: "company",
          relationship_type: "works_at",
          resolve_target: true,
        },
      ],
    };

    // Same call shape as scripts/initialize-schemas.ts registerSchema():
    // no user_id / user_specific, so scope defaults to "global".
    await schemaRegistry.register({
      entity_type: FRESH_TYPE,
      schema_version: "1.0",
      schema_definition: schemaDefinition,
      reducer_config: { merge_policies: {} },
    });
    await schemaRegistry.activate(FRESH_TYPE, "1.0");

    // Any caller — including one supplying an arbitrary/unseen userId, since
    // no user-specific override exists — now resolves the global schema via
    // the same fallthrough loadActiveSchema uses in production.
    const resolvedGlobal = await schemaRegistry.loadActiveSchema(FRESH_TYPE);
    const resolvedForArbitraryUser = await schemaRegistry.loadActiveSchema(
      FRESH_TYPE,
      "00000000-0000-0000-0000-0000000000fe"
    );

    for (const resolved of [resolvedGlobal, resolvedForArbitraryUser]) {
      expect(resolved).not.toBeNull();
      expect(resolved!.schema_definition.reference_fields).toEqual([
        {
          field: "organization",
          target_entity_type: "company",
          relationship_type: "works_at",
          resolve_target: true,
        },
      ]);
    }
  });
});
