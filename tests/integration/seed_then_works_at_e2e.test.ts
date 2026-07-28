/**
 * Issue #1968 — effect-verified end-to-end test (pm/QA acceptance criterion).
 *
 * The bootstrap unit tests prove the seeding *contract* (skip-if-present,
 * idempotency, custom-schema preservation). This test proves the *user-visible
 * effect the bug report was about*: after a fresh/plain deploy runs seeding,
 * storing a `contact` with an `organization` fires `organization -> company`
 * `works_at` auto-linking end-to-end. Maps to the standing quality gate
 * `fixed_means_behavior_verified_not_contract_accepted`.
 *
 *  - NEGATIVE CONTROL: with the contact schema unseeded (no active GLOBAL row),
 *    storing produces no `works_at` edge — i.e. the exact original bug. If a
 *    change made linking fire without the seeded binding, this would fail.
 *  - POSITIVE: after the SEEDER (seedSchemaRegistryIfEmpty, the deploy-time
 *    step) registers the built-in contact schema, the same store produces a
 *    `works_at` edge to a real `company` entity.
 *
 * The seeder registers GLOBAL schemas (user_specific:false, keyed on
 * loadGlobalSchema). This suite therefore owns the global `contact` schema row
 * for its duration: it removes any pre-existing row in beforeEach, matching the
 * global-row manipulation pattern in schema_registry_bootstrap.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";
import { relationshipsService } from "../../src/services/relationships.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { seedSchemaRegistryIfEmpty } from "../../src/services/schema_registry_bootstrap.js";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-0000000019be";

type StoreResponse = {
  error?: unknown;
  entities?: Array<{ entity_id?: string }>;
};

async function removeGlobalContactSchema(): Promise<void> {
  await db.from("schema_registry").delete().eq("entity_type", "contact").is("user_id", null);
}

describe("seed -> works_at auto-link, end-to-end (#1968 effect verification)", () => {
  let storeAs: {
    store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
  };

  beforeAll(() => {
    const server = new NeotomaServer();
    // Inject the authenticated user directly (matches
    // company_entity_resolution_leads.test.ts) so the MCP store path does not
    // require a NEOTOMA_CONNECTION_ID env in the test harness.
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
    storeAs = server as unknown as typeof storeAs;
  });

  beforeEach(async () => {
    await cleanupEntityType("contact", TEST_USER_ID);
    await cleanupEntityType("company", TEST_USER_ID);
    await removeGlobalContactSchema();
  });

  afterAll(async () => {
    await cleanupEntityType("contact", TEST_USER_ID);
    await cleanupEntityType("company", TEST_USER_ID);
    await removeGlobalContactSchema();
  });

  async function storeContact(name: string, organization: string): Promise<string | null> {
    const result = await storeAs.store({
      user_id: TEST_USER_ID,
      idempotency_key: `seed-e2e-${name}-${Date.now()}-${Math.random()}`,
      commit: true,
      entities: [{ entity_type: "contact", name, organization, schema_version: "1.0" }],
    });
    const body = JSON.parse(result.content[0].text) as StoreResponse;
    return body.entities?.[0]?.entity_id ?? null;
  }

  async function worksAtCount(contactId: string): Promise<number> {
    const outgoing = await relationshipsService.getRelationshipsForEntity(
      contactId,
      "outgoing",
      false,
      TEST_USER_ID
    );
    return outgoing.filter((r) => r.relationship_type === "works_at").length;
  }

  it("NEGATIVE CONTROL: contact schema unseeded => storing produces no works_at edge", async () => {
    expect(await schemaRegistry.loadGlobalSchema("contact")).toBeNull();

    const contactId = await storeContact("Unseeded Ursula", "Northgate");

    // The regression signal: no works_at edge without a seeded reference
    // binding. If a future change made auto-linking fire absent the seeded
    // schema, this assertion fails and flags it.
    if (contactId) {
      expect(await worksAtCount(contactId)).toBe(0);
    }
  });

  it("POSITIVE: after seeding, storing a contact with organization fires works_at to a real company", async () => {
    // Run the SEEDER under test over the real built-in contact schema — the
    // code path a plain deploy exercises.
    const summary = await seedSchemaRegistryIfEmpty({ schemas: [ENTITY_SCHEMAS.contact] });
    expect(summary.failed).toEqual([]);

    const active = await schemaRegistry.loadGlobalSchema("contact");
    expect(active).not.toBeNull();
    // The seeded schema must carry the reference binding that makes linking fire.
    expect(active!.schema_definition.reference_fields ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "organization",
          target_entity_type: "company",
          relationship_type: "works_at",
        }),
      ])
    );

    const contactId = await storeContact("Jamie Founder", "Northgate");
    expect(typeof contactId).toBe("string");

    const outgoing = await relationshipsService.getRelationshipsForEntity(
      contactId as string,
      "outgoing",
      false,
      TEST_USER_ID
    );
    const worksAt = outgoing.filter((r) => r.relationship_type === "works_at");
    expect(worksAt).toHaveLength(1);

    const { data: companyRow } = await db
      .from("entities")
      .select("id, entity_type, canonical_name")
      .eq("id", worksAt[0].target_entity_id)
      .single();
    expect(companyRow.entity_type).toBe("company");
    expect(String(companyRow.canonical_name).toLowerCase()).toContain("northgate");
  });
});
