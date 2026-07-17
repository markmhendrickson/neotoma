/**
 * Integration test: contact -> company auto-linking and the company query
 * seam ("who do we have connected at company X").
 *
 * Covers:
 *  (c) storing a `contact` with `organization` auto-creates/resolves a
 *      canonical `company` entity and links contact -> company via `works_at`
 *      (schema-driven `reference_fields` with `resolve_target: true`, see
 *      schema_definitions.ts `contact` schema and schema_reference_linking.ts).
 *  (d) `queryContactsAtCompany` (company_query.ts) resolves a company name
 *      (exact or fuzzy) and returns every contact linked to it, including
 *      contacts whose `organization` string was a near-duplicate variant
 *      ("Northgate" / "North Gate" / "Northgate LLC") of the company that was
 *      actually created.
 *  (e) the `query_contacts_at_company` MCP tool wraps `queryContactsAtCompany`
 *      end-to-end (input validation + executeTool dispatch + happy path),
 *      per Nick's v1 acceptance criterion that this must be reachable over
 *      MCP, not just as an internal service function.
 *
 * Exercises the MCP store path (NeotomaServer.store -> storeStructuredInternal)
 * to match the existing store-response integration test pattern
 * (store_prefix_duplicate_candidates.test.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";
import { queryContactsAtCompany } from "../../src/services/company_query.js";
import { relationshipsService } from "../../src/services/relationships.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";
import { getOpenApiInputSchemaOrThrow } from "../../src/shared/openapi_schema.js";

const TEST_USER_ID = "00000000-0000-0000-0000-0000000000c1";

type EntityResult = {
  entity_id?: string;
  entity_type?: string;
  canonical_name?: string;
  action?: string;
};

type StoreResponse = {
  entities?: EntityResult[];
  source_id?: string;
  error?: unknown;
};

describe("company entity resolution: contact -> company linking + company query", () => {
  let server: NeotomaServer;
  let storeAs: {
    store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
  };

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
    storeAs = server as unknown as typeof storeAs;

    // The `reference_fields`-driven auto-link hook reads the schema via
    // `schemaRegistry.loadActiveSchema`, which is DB-backed only (it does NOT
    // fall back to the code-defined ENTITY_SCHEMAS the way `resolveEntityWithTrace`
    // does — see schema_registry.ts `applyBuiltInSchemaIdentityDefaults`). A
    // fresh test DB has no seeded `schema_registry` row for `contact` (that
    // seeding is a separate deploy-time step, `scripts/initialize-schemas.ts`),
    // so register the real code-defined `contact` schema (including the
    // `organization` -> `company` `resolve_target` reference field under test)
    // as a user-scoped schema here, matching the pattern used by other
    // integration tests that depend on a registered schema (e.g.
    // store_null_cleared_field_warning.test.ts).
    if (!(await schemaRegistry.loadActiveSchema("contact", TEST_USER_ID))) {
      const contactSchema = ENTITY_SCHEMAS.contact;
      await schemaRegistry.register({
        entity_type: "contact",
        schema_version: contactSchema.schema_version,
        schema_definition: contactSchema.schema_definition,
        reducer_config: contactSchema.reducer_config,
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
        metadata: contactSchema.metadata,
      });
    }
  });

  afterAll(async () => {
    await cleanupEntityType("contact", TEST_USER_ID);
    await cleanupEntityType("company", TEST_USER_ID);
  });

  async function storeContact(name: string, organization: string): Promise<string> {
    const result = await storeAs.store({
      user_id: TEST_USER_ID,
      idempotency_key: `company-link-${name}-${Date.now()}-${Math.random()}`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name,
          organization,
          schema_version: "1.0",
        },
      ],
    });
    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    expect(body.entities).toHaveLength(1);
    const entityId = body.entities![0].entity_id;
    expect(typeof entityId).toBe("string");
    return entityId as string;
  }

  it("(c) storing a contact with organization auto-links it to a company entity via works_at", async () => {
    const contactId = await storeContact("Jamie Founder", "Northgate");

    const outgoing = await relationshipsService.getRelationshipsForEntity(
      contactId,
      "outgoing",
      false,
      TEST_USER_ID
    );
    const worksAt = outgoing.filter((r) => r.relationship_type === "works_at");
    expect(worksAt).toHaveLength(1);

    // The target must be an actual `company` entity, not a bare string.
    const { db } = await import("../../src/db.js");
    const { data: companyRow } = await db
      .from("entities")
      .select("id, entity_type, canonical_name")
      .eq("id", worksAt[0].target_entity_id)
      .single();
    expect(companyRow.entity_type).toBe("company");
    expect(companyRow.canonical_name.toLowerCase()).toContain("northgate");
  });

  it("(c) two contacts at suffix/case variants of the same org link to the SAME company entity", async () => {
    const aliceId = await storeContact("Alice Exact", "Northgate");
    const bobId = await storeContact("Bob Suffix", "Northgate, LLC");

    const aliceEdges = await relationshipsService.getRelationshipsForEntity(
      aliceId,
      "outgoing",
      false,
      TEST_USER_ID
    );
    const bobEdges = await relationshipsService.getRelationshipsForEntity(
      bobId,
      "outgoing",
      false,
      TEST_USER_ID
    );
    const aliceCompany = aliceEdges.find(
      (r) => r.relationship_type === "works_at"
    )?.target_entity_id;
    const bobCompany = bobEdges.find((r) => r.relationship_type === "works_at")?.target_entity_id;

    expect(aliceCompany).toBeDefined();
    expect(bobCompany).toBe(aliceCompany);
  });

  it("(c) a contact with no organization field is not linked (no self-loop, no error)", async () => {
    const result = await storeAs.store({
      user_id: TEST_USER_ID,
      idempotency_key: `company-link-noorg-${Date.now()}`,
      commit: true,
      entities: [{ entity_type: "contact", name: "No Org Person", schema_version: "1.0" }],
    });
    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    const contactId = body.entities![0].entity_id as string;

    const outgoing = await relationshipsService.getRelationshipsForEntity(
      contactId,
      "outgoing",
      false,
      TEST_USER_ID
    );
    expect(outgoing.filter((r) => r.relationship_type === "works_at")).toHaveLength(0);
  });

  it("(d) queryContactsAtCompany('Initrove8') returns every contact linked via works_at, including a fuzzy-matched org spelling", async () => {
    // Use an org name unique to this test (earlier tests in this file already
    // created Northgate-family contacts, which would otherwise also match).
    const carolId = await storeContact("Carol Query", "Initrove8");
    // "Initrove 8" (space) is a near-duplicate spelling — the contact schema's
    // resolve_target linking resolves it (fuzzy) to the SAME company entity
    // Carol is linked to, so a query for "Initrove8" must also surface Dana.
    const danaId = await storeContact("Dana FuzzySpelling", "Initrove 8");

    const result = await queryContactsAtCompany({ companyName: "Initrove8", userId: TEST_USER_ID });

    expect(result.company).not.toBeNull();
    expect(result.company!.entity_id).toBeDefined();

    const contactIds = result.contacts.map((c) => c.entity_id).sort();
    expect(contactIds).toEqual([carolId, danaId].sort());

    const carolResult = result.contacts.find((c) => c.entity_id === carolId);
    expect(carolResult?.canonical_name).toBe("Carol Query");
  });

  it("(d) queryContactsAtCompany returns company: null and no contacts for an org with no presence", async () => {
    const result = await queryContactsAtCompany({
      companyName: "Totally Unrelated Nonexistent Corp XYZ123",
      userId: TEST_USER_ID,
    });
    expect(result.company).toBeNull();
    expect(result.contacts).toEqual([]);
  });

  it("(d) queryContactsAtCompany never creates a company entity (read-only)", async () => {
    const { db } = await import("../../src/db.js");
    const before = await db
      .from("entities")
      .select("id")
      .eq("entity_type", "company")
      .eq("user_id", TEST_USER_ID);
    const beforeCount = (before.data ?? []).length;

    await queryContactsAtCompany({
      companyName: "Never Created Corp Query Only",
      userId: TEST_USER_ID,
    });

    const after = await db
      .from("entities")
      .select("id")
      .eq("entity_type", "company")
      .eq("user_id", TEST_USER_ID);
    expect((after.data ?? []).length).toBe(beforeCount);
  });

  it("(d) queryContactsAtCompany throws when userId is missing instead of scanning across all tenants (cross-tenant leak guard)", async () => {
    await expect(
      queryContactsAtCompany({
        companyName: "Initrove8",
        // @ts-expect-error — userId is required; this exercises the runtime
        // guard for callers that bypass the type system.
        userId: undefined,
      })
    ).rejects.toThrow(/requires a non-empty userId/);
  });

  it("(d) queryContactsAtCompany throws when userId is an empty string", async () => {
    await expect(
      queryContactsAtCompany({
        companyName: "Initrove8",
        userId: "",
      })
    ).rejects.toThrow(/requires a non-empty userId/);
  });
});

describe("(e) query_contacts_at_company MCP tool", () => {
  let server: NeotomaServer;
  let storeAs: {
    store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
  };

  const TOOL_USER_ID = "00000000-0000-0000-0000-0000000000c2";

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TOOL_USER_ID;
    storeAs = server as unknown as typeof storeAs;

    // Same fresh-instance schema-seeding workaround as the top-level suite:
    // the reference_fields-driven auto-link hook reads the schema via
    // schemaRegistry.loadActiveSchema, which is DB-backed only (see
    // scripts/initialize-schemas.ts / docs/developer/schema_initialization.md
    // for the real deploy-time seeding step).
    if (!(await schemaRegistry.loadActiveSchema("contact", TOOL_USER_ID))) {
      const contactSchema = ENTITY_SCHEMAS.contact;
      await schemaRegistry.register({
        entity_type: "contact",
        schema_version: contactSchema.schema_version,
        schema_definition: contactSchema.schema_definition,
        reducer_config: contactSchema.reducer_config,
        user_id: TOOL_USER_ID,
        user_specific: true,
        activate: true,
        metadata: contactSchema.metadata,
      });
    }
  });

  afterAll(async () => {
    await cleanupEntityType("contact", TOOL_USER_ID);
    await cleanupEntityType("company", TOOL_USER_ID);
  });

  async function storeContact(name: string, organization: string): Promise<string> {
    const result = await storeAs.store({
      user_id: TOOL_USER_ID,
      idempotency_key: `company-tool-${name}-${Date.now()}-${Math.random()}`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name,
          organization,
          schema_version: "1.0",
        },
      ],
    });
    const body = JSON.parse(result.content[0].text) as StoreResponse;
    expect(body.error).toBeUndefined();
    return body.entities![0].entity_id as string;
  }

  it("is registered in the tool catalog and has an OpenAPI-backed input schema", () => {
    expect(NEOTOMA_TOOL_NAMES).toContain("query_contacts_at_company");
    const schema = getOpenApiInputSchemaOrThrow("query_contacts_at_company") as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(schema.required).toContain("company_name");
    expect(schema.properties).toHaveProperty("company_name");
    expect(schema.properties).toHaveProperty("owner_user_id");
    expect(schema.properties).toHaveProperty("limit");
  });

  it("input validation: rejects a call with no company_name", async () => {
    await expect(
      (server as any).queryContactsAtCompanyTool({})
    ).rejects.toThrow();
  });

  it("input validation: rejects an empty-string company_name", async () => {
    await expect(
      (server as any).queryContactsAtCompanyTool({ company_name: "" })
    ).rejects.toThrow();
  });

  it("happy path: resolves a company and returns its linked contacts via the tool handler", async () => {
    const evaId = await storeContact("Eva ToolPath", "Toolgraph Inc");
    const finnId = await storeContact("Finn ToolPath", "Toolgraph Inc");

    const result = await (server as any).queryContactsAtCompanyTool({
      company_name: "Toolgraph Inc",
    });

    expect(result).toHaveProperty("content");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeUndefined();
    expect(parsed.company).not.toBeNull();
    expect(parsed.company.canonical_name.toLowerCase()).toContain("toolgraph");
    expect(parsed.total_contacts).toBe(2);
    expect(parsed.limit).toBe(100);
    const contactIds = parsed.contacts.map((c: { entity_id: string }) => c.entity_id).sort();
    expect(contactIds).toEqual([evaId, finnId].sort());
  });

  it("fuzzy Northgate-shaped variant: resolves a compact query to a contact stored under a spaced spelling via the tool handler", async () => {
    // Exercises the same "Northgate" / "North Gate" near-duplicate-spelling
    // shape the design calls out (docs/foundation/entity_resolution.md#15.4),
    // but with a name unique to this test file's tenant — the literal
    // "Northgate"/"North Gate" strings are also used as shared-DB fixtures in
    // tests/services/company_resolution.test.ts under its own dedicated
    // testUserId, and reusing them here previously cross-matched that
    // fixture's company row.
    const graceId = await storeContact("Grace FuzzyTool", "Initrove8 Query");

    const result = await (server as any).queryContactsAtCompanyTool({
      company_name: "Initrove8Query",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.company).not.toBeNull();
    expect(parsed.company.basis).toBe("fuzzy_match");
    const contactIds = parsed.contacts.map((c: { entity_id: string }) => c.entity_id);
    expect(contactIds).toContain(graceId);
  });

  it("no match: returns company: null and an empty contacts array, not an error", async () => {
    const result = await (server as any).queryContactsAtCompanyTool({
      company_name: "Totally Unmatched MCP Tool Corp XYZ789",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeUndefined();
    expect(parsed.company).toBeNull();
    expect(parsed.contacts).toEqual([]);
    expect(parsed.total_contacts).toBe(0);
  });

  it("limit: caps the returned contacts array while total_contacts reflects the true count", async () => {
    await storeContact("Limit One", "Limitgraph LLC");
    await storeContact("Limit Two", "Limitgraph LLC");
    await storeContact("Limit Three", "Limitgraph LLC");

    const result = await (server as any).queryContactsAtCompanyTool({
      company_name: "Limitgraph LLC",
      limit: 2,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.contacts).toHaveLength(2);
    expect(parsed.total_contacts).toBe(3);
    expect(parsed.limit).toBe(2);
  });

  it("full executeTool dispatch reaches the handler (regression: dispatch-layer wiring)", async () => {
    await storeContact("Dispatch Path", "Dispatchgraph Co");

    const result = await server.executeToolForCli(
      "query_contacts_at_company",
      { company_name: "Dispatchgraph Co" },
      TOOL_USER_ID
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeUndefined();
    expect(parsed.company).not.toBeNull();
    expect(parsed.contacts.length).toBeGreaterThanOrEqual(1);
  });

  it("read-only: never creates a company entity even on a fuzzy near-miss", async () => {
    const { db } = await import("../../src/db.js");
    const before = await db
      .from("entities")
      .select("id")
      .eq("entity_type", "company")
      .eq("user_id", TOOL_USER_ID);
    const beforeCount = (before.data ?? []).length;

    await (server as any).queryContactsAtCompanyTool({
      company_name: "Never Created Via Tool Corp",
    });

    const after = await db
      .from("entities")
      .select("id")
      .eq("entity_type", "company")
      .eq("user_id", TOOL_USER_ID);
    expect((after.data ?? []).length).toBe(beforeCount);
  });
});
