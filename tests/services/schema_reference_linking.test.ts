import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObservationReducer, type Observation } from "../../src/reducers/observation_reducer.js";

vi.mock("../../src/db.js", () => {
  const snapshots: Array<Record<string, unknown>> = [];
  const dbMock = {
    from: vi.fn((table: string) => {
      if (table === "entity_snapshots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => Promise.resolve({ data: snapshots, error: null }),
                }),
                limit: () => Promise.resolve({ data: snapshots, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }),
    __snapshots: snapshots,
  };
  return { db: dbMock };
});

const createRelationshipMock = vi.fn();
const getRelationshipsForEntityMock = vi.fn();
vi.mock("../../src/services/relationships.js", () => {
  return {
    relationshipsService: {
      createRelationship: createRelationshipMock,
      getRelationshipsForEntity: getRelationshipsForEntityMock,
    },
  };
});

const softDeleteRelationshipMock = vi.fn();
vi.mock("../../src/services/deletion.js", () => {
  return {
    softDeleteRelationship: (...args: unknown[]) => softDeleteRelationshipMock(...args),
  };
});

const resolveCompanyEntityMock = vi.fn();
vi.mock("../../src/services/company_resolution.js", () => {
  return {
    resolveCompanyEntity: (...args: unknown[]) => resolveCompanyEntityMock(...args),
  };
});

// Used only by the replay/out-of-order delivery test below, which drives the
// real ObservationReducer to prove last-write-wins is order-independent.
const loadActiveSchemaMock = vi.fn();
vi.mock("../../src/services/schema_registry.js", () => ({
  DEFAULT_OBSERVATION_SOURCE_PRIORITY: [
    "sensor",
    "workflow_state",
    "llm_summary",
    "human",
    "import",
  ] as const,
  schemaRegistry: {
    loadActiveSchema: (...args: unknown[]) => loadActiveSchemaMock(...args),
  },
}));
vi.mock("../../src/services/schema_definitions.js", () => ({
  getSchemaDefinition: vi.fn().mockReturnValue(null),
}));
vi.mock("../../src/services/field_validation.js", () => ({
  validateFieldWithConverters: vi.fn().mockImplementation((_field: string, value: unknown) => ({
    isValid: true,
    value,
    shouldRouteToRawFragments: false,
  })),
}));

describe("autoLinkReferenceFields", () => {
  beforeEach(() => {
    createRelationshipMock.mockReset();
    createRelationshipMock.mockResolvedValue({ id: "rel_1" });
    getRelationshipsForEntityMock.mockReset();
    getRelationshipsForEntityMock.mockResolvedValue([]);
    softDeleteRelationshipMock.mockReset();
    softDeleteRelationshipMock.mockResolvedValue({ success: true, observation_id: "obs_1" });
    resolveCompanyEntityMock.mockReset();
  });

  it("skips when schema has no reference_fields", async () => {
    const { autoLinkReferenceFields } =
      await import("../../src/services/schema_reference_linking.js");
    const result = await autoLinkReferenceFields({
      entityId: "ent_1",
      entityType: "transaction",
      fields: { merchant: "Northgate" },
      schema: { fields: {} },
      userId: "u1",
    });
    expect(result.created).toBe(0);
    expect(createRelationshipMock).not.toHaveBeenCalled();
  });

  it("skips when field value is empty", async () => {
    const { autoLinkReferenceFields } =
      await import("../../src/services/schema_reference_linking.js");
    const result = await autoLinkReferenceFields({
      entityId: "ent_1",
      entityType: "transaction",
      fields: { merchant: "" },
      schema: {
        fields: {},
        reference_fields: [{ field: "merchant", target_entity_type: "company" }],
      },
      userId: "u1",
    });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(createRelationshipMock).not.toHaveBeenCalled();
  });

  it("records a skipped detail when target cannot be resolved", async () => {
    const { autoLinkReferenceFields } =
      await import("../../src/services/schema_reference_linking.js");
    const result = await autoLinkReferenceFields({
      entityId: "ent_1",
      entityType: "transaction",
      fields: { merchant: "Nonexistent Co" },
      schema: {
        fields: {},
        reference_fields: [
          {
            field: "merchant",
            target_entity_type: "company",
            relationship_type: "REFERS_TO",
          },
        ],
      },
      userId: "u1",
    });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.details[0]).toMatchObject({
      field: "merchant",
      target_canonical_name: "Nonexistent Co",
      linked: false,
      relationship_type: "REFERS_TO",
    });
    expect(createRelationshipMock).not.toHaveBeenCalled();
    // No resolve_target on this reference field: the company resolver must
    // never be invoked, preserving today's "we do not invent targets" default.
    expect(resolveCompanyEntityMock).not.toHaveBeenCalled();
  });

  describe("resolve_target: true (company get-or-create)", () => {
    it("resolves and links to a company entity via resolveCompanyEntity when no existing target matches", async () => {
      resolveCompanyEntityMock.mockResolvedValue({
        entityId: "ent_company_northgate",
        normalizedName: "northgate",
        canonicalName: "Northgate",
        basis: "created",
        created: true,
      });

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Northgate" },
        schema: {
          fields: {},
          reference_fields: [
            {
              field: "organization",
              target_entity_type: "company",
              relationship_type: "works_at",
              resolve_target: true,
            },
          ],
        },
        userId: "u1",
      });

      expect(resolveCompanyEntityMock).toHaveBeenCalledWith({
        organizationName: "Northgate",
        userId: "u1",
      });
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.details[0]).toMatchObject({
        field: "organization",
        target_entity_id: "ent_company_northgate",
        relationship_type: "works_at",
        linked: true,
      });
      expect(createRelationshipMock).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_northgate",
          user_id: "u1",
        })
      );
    });

    it("does not invoke the company resolver when commit is false (dry-run/--plan)", async () => {
      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Northgate" },
        schema: {
          fields: {},
          reference_fields: [
            {
              field: "organization",
              target_entity_type: "company",
              relationship_type: "works_at",
              resolve_target: true,
            },
          ],
        },
        userId: "u1",
        commit: false,
      });

      expect(resolveCompanyEntityMock).not.toHaveBeenCalled();
      expect(createRelationshipMock).not.toHaveBeenCalled();
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.details[0].linked).toBe(false);
    });

    it("falls back to skip-if-missing with a warning when resolve_target is set for a target_entity_type with no wired resolver", async () => {
      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { partner_org: "Some Vendor" },
        schema: {
          fields: {},
          reference_fields: [
            {
              field: "partner_org",
              target_entity_type: "vendor", // no resolver wired for "vendor"
              resolve_target: true,
            },
          ],
        },
        userId: "u1",
      });

      expect(resolveCompanyEntityMock).not.toHaveBeenCalled();
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.details[0].linked).toBe(false);
    });

    it("does not resolve_target when the reference field lacks the flag, even for target_entity_type company", async () => {
      // Regression guard: resolve_target defaults to falsy/undefined, so a
      // schema declaring reference_fields without the flag must keep the
      // pre-existing skip-if-missing behavior (covered above too, kept here
      // for symmetry with the resolve_target-on describe block).
      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Northgate" },
        schema: {
          fields: {},
          reference_fields: [{ field: "organization", target_entity_type: "company" }],
        },
        userId: "u1",
      });

      expect(resolveCompanyEntityMock).not.toHaveBeenCalled();
    });
  });

  describe("retraction on organization change (#1963)", () => {
    const orgSchema = {
      fields: {},
      reference_fields: [
        {
          field: "organization",
          target_entity_type: "company",
          relationship_type: "works_at" as const,
          resolve_target: true,
        },
      ],
    };

    function mockCompanyResolution(entityId: string, canonicalName: string) {
      resolveCompanyEntityMock.mockResolvedValueOnce({
        entityId,
        normalizedName: canonicalName.toLowerCase(),
        canonicalName,
        basis: "created",
        created: true,
      });
    }

    it("retracts the prior auto-linked edge when organization changes to a new company", async () => {
      // Contact already has a live auto-linked works_at edge to Dust.
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_dust",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_dust",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Stripe" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_stripe",
        })
      );
      expect(softDeleteRelationshipMock).toHaveBeenCalledWith(
        "works_at:ent_contact_1:ent_company_dust",
        "works_at",
        "ent_contact_1",
        "ent_company_dust",
        "u1",
        expect.stringContaining("organization")
      );
      expect(result.created).toBe(1);
      expect(result.retracted).toBe(1);
      expect(result.retraction_failures).toBe(0);
      expect(result.details[0]).toMatchObject({
        target_entity_id: "ent_company_stripe",
        linked: true,
        retracted_target_entity_id: "ent_company_dust",
      });
    });

    it("preserves a manually-created works_at edge to a different company", async () => {
      // Manual edge (no auto_linked metadata) to Company A, plus an
      // auto-linked edge to Company B that must be retracted.
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_a",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_a",
          snapshot: {},
        },
        {
          relationship_key: "works_at:ent_contact_1:ent_company_b",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_b",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      mockCompanyResolution("ent_company_c", "Company C");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Company C" },
        schema: orgSchema,
        userId: "u1",
      });

      // Only the auto-linked Company B edge is retracted.
      expect(softDeleteRelationshipMock).toHaveBeenCalledTimes(1);
      expect(softDeleteRelationshipMock).toHaveBeenCalledWith(
        "works_at:ent_contact_1:ent_company_b",
        "works_at",
        "ent_contact_1",
        "ent_company_b",
        "u1",
        expect.any(String)
      );
    });

    it("is a no-op when organization is re-observed with the same value", async () => {
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_stripe",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_stripe",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Stripe" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).not.toHaveBeenCalled();
      expect(softDeleteRelationshipMock).not.toHaveBeenCalled();
      expect(result.details[0]).toMatchObject({
        target_entity_id: "ent_company_stripe",
        linked: true,
      });
    });

    it("retracts the prior auto-linked edge and creates nothing when organization is cleared", async () => {
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_stripe",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_stripe",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).not.toHaveBeenCalled();
      expect(resolveCompanyEntityMock).not.toHaveBeenCalled();
      expect(softDeleteRelationshipMock).toHaveBeenCalledWith(
        "works_at:ent_contact_1:ent_company_stripe",
        "works_at",
        "ent_contact_1",
        "ent_company_stripe",
        "u1",
        expect.any(String)
      );
      expect(result.created).toBe(0);
      expect(result.retracted).toBe(1);
      expect(result.retraction_failures).toBe(0);
      expect(result.details[0]).toMatchObject({
        linked: false,
        retracted_target_entity_id: "ent_company_stripe",
      });
    });

    it("does not retract when the target resolves to the same company despite casing/whitespace differences", async () => {
      // Simulates "Stripe" -> "stripe " both resolving to the same company
      // entity id: the canonical lookup in autoLinkReferenceFields already
      // case/whitespace-normalizes, so the resolved targetEntityId matches
      // the prior auto-linked edge's target and no thrash occurs.
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_stripe",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_stripe",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "stripe " },
        schema: orgSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).not.toHaveBeenCalled();
      expect(softDeleteRelationshipMock).not.toHaveBeenCalled();
    });

    it("no-ops safely when the stale auto-linked edge was already retracted (softDeleteRelationship idempotency)", async () => {
      // getRelationshipsForEntity defaults to live-only (includeDeleted=false),
      // so an already-deleted edge simply never appears here — retraction is
      // naturally idempotent because there's nothing stale left to retract.
      getRelationshipsForEntityMock.mockResolvedValueOnce([]);
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Stripe" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(softDeleteRelationshipMock).not.toHaveBeenCalled();
      expect(result.created).toBe(1);
    });

    it("retracts the prior auto-linked edge when the field's new value cannot be resolved to any target", async () => {
      // organization renamed to a company not yet in the graph, and
      // resolve_target's resolver call itself fails (e.g. transient error) —
      // the field is non-empty but yields no target, so the prior Dust edge
      // must still be retracted rather than surviving indefinitely.
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_dust",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_dust",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      resolveCompanyEntityMock.mockRejectedValueOnce(new Error("resolution unavailable"));

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Unresolvable New Co" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).not.toHaveBeenCalled();
      expect(softDeleteRelationshipMock).toHaveBeenCalledWith(
        "works_at:ent_contact_1:ent_company_dust",
        "works_at",
        "ent_contact_1",
        "ent_company_dust",
        "u1",
        expect.any(String)
      );
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.retracted).toBe(1);
      expect(result.retraction_failures).toBe(0);
      expect(result.details[0]).toMatchObject({
        linked: false,
        retracted_target_entity_id: "ent_company_dust",
      });
    });

    it("retracts the prior auto-linked edge when the field resolves to a self-loop", async () => {
      // targetEntityId === entityId is skipped as a link (no self-loops),
      // but the prior auto-linked edge for this field must still retract —
      // the field's resolved target changed even though nothing new links.
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_dust",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_dust",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      mockCompanyResolution("ent_contact_1", "Self Co");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Self Co" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).not.toHaveBeenCalled();
      expect(softDeleteRelationshipMock).toHaveBeenCalledWith(
        "works_at:ent_contact_1:ent_company_dust",
        "works_at",
        "ent_contact_1",
        "ent_company_dust",
        "u1",
        expect.any(String)
      );
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.retracted).toBe(1);
      expect(result.retraction_failures).toBe(0);
      expect(result.details[0]).toMatchObject({
        linked: false,
        retracted_target_entity_id: "ent_company_dust",
      });
    });

    it("surfaces retraction failures on the result instead of only logging, and escalates to logger.error", async () => {
      // ux review acceptance check: mock softDeleteRelationship to fail and
      // assert (a) logger.error was called, not logger.warn, and (b)
      // result.retraction_failures reflects the failure count.
      const { logger } = await import("../../src/utils/logger.js");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_dust",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_dust",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      softDeleteRelationshipMock.mockResolvedValueOnce({
        success: false,
        error: "db unavailable",
      });
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Stripe" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(result.created).toBe(1);
      expect(result.retracted).toBe(0);
      expect(result.retraction_failures).toBe(1);
      // The failed target id must be surfaced so a caller can follow the
      // remediation (delete_relationship needs the target_entity_id).
      expect(result.failed_retraction_target_entity_ids).toEqual(["ent_company_dust"]);
      expect(result.retracted_target_entity_ids).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to retract stale auto-linked edge")
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Failed to retract stale auto-linked edge")
      );

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("retracts on target change keyed on the field, not hardcoded to organization (generic reference field)", async () => {
      // PM review on #1970: the fix is generic to any schema-declared reference
      // field, but coverage only exercised the `organization`/`works_at` pair.
      // This proves the retraction is keyed on `auto_link_field` (the schema's
      // field name), not the literal string "organization": a differently-named
      // reference field (`primary_employer`) with a different relationship_type
      // (`member_of`) retracts its own prior edge and leaves nothing else.
      const employerSchema = {
        fields: {},
        reference_fields: [
          {
            field: "primary_employer",
            target_entity_type: "company",
            relationship_type: "member_of" as const,
            resolve_target: true,
          },
        ],
      };

      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "member_of:ent_contact_1:ent_company_dust",
          relationship_type: "member_of",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_dust",
          snapshot: {
            auto_linked: true,
            auto_link_field: "primary_employer",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { primary_employer: "Stripe" },
        schema: employerSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship_type: "member_of",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_stripe",
        })
      );
      expect(softDeleteRelationshipMock).toHaveBeenCalledWith(
        "member_of:ent_contact_1:ent_company_dust",
        "member_of",
        "ent_contact_1",
        "ent_company_dust",
        "u1",
        expect.stringContaining("primary_employer")
      );
      expect(result.created).toBe(1);
      expect(result.retracted).toBe(1);
      expect(result.retracted_target_entity_ids).toEqual(["ent_company_dust"]);
    });

    it("partitions results correctly when multiple stale edges retract with mixed success/failure", async () => {
      // Non-blocking qa finding on #1970: cover >1 stale auto-linked edge for the
      // same field where one soft-delete succeeds and one fails. The succeeding
      // and failing target ids must land in the right buckets.
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_dust",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_dust",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
        {
          relationship_key: "works_at:ent_contact_1:ent_company_acme",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_acme",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      // First retraction (Dust) succeeds; second (Acme) fails.
      softDeleteRelationshipMock
        .mockResolvedValueOnce({ success: true, observation_id: "obs_1" })
        .mockResolvedValueOnce({ success: false, error: "db unavailable" });
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: { organization: "Stripe" },
        schema: orgSchema,
        userId: "u1",
      });

      expect(result.created).toBe(1);
      expect(result.retracted).toBe(1);
      expect(result.retraction_failures).toBe(1);
      expect(result.retracted_target_entity_ids).toEqual(["ent_company_dust"]);
      expect(result.failed_retraction_target_entity_ids).toEqual(["ent_company_acme"]);
      expect(result.failed_retractions).toEqual([
        {
          field: "organization",
          relationship_type: "works_at",
          target_entity_id: "ent_company_acme",
        },
      ]);
    });

    it("survives out-of-order delivery: the last-write-winning organization value wins even when the older observation is stored second", async () => {
      // Regression for the PM review on #1970: autoLinkReferenceFields treats
      // params.fields[ref.field] as an opaque given value with no internal
      // awareness of observation timestamps or delivery order. That is by
      // design — ordering is the reducer's job, not this function's. This
      // test proves the full contract end to end: (1) the reducer's
      // last-write-wins merge is order-independent (sorts by observed_at
      // DESC regardless of array/delivery order), and (2) whatever value the
      // reducer resolves is exactly what autoLinkReferenceFields acts on.
      //
      // Delivery order: the NEWER observation (Stripe, 2025-02-01) is stored
      // in the array BEFORE the OLDER observation (Dust, 2025-01-01) — i.e.
      // the older observation is "delivered second" (a backfill/replay
      // scenario). last_write must still resolve to Stripe.
      loadActiveSchemaMock.mockResolvedValueOnce({
        id: "schema-contact",
        entity_type: "contact",
        schema_version: "1.0.0",
        schema_definition: {
          fields: { organization: { type: "string" as const, required: false } },
          identity_opt_out: "heuristic_canonical_name",
        },
        reducer_config: {
          merge_policies: { organization: { strategy: "last_write" as const } },
        },
        active: true,
      });

      const observations: Observation[] = [
        {
          id: "obs_newer_stripe",
          entity_id: "ent_contact_1",
          entity_type: "contact",
          schema_version: "1.0",
          source_id: "src_1",
          observed_at: "2025-02-01T00:00:00Z",
          specificity_score: 1.0,
          source_priority: 100,
          fields: { organization: "Stripe" },
          created_at: "2025-02-01T00:00:00Z",
          user_id: "u1",
        },
        {
          id: "obs_older_dust",
          entity_id: "ent_contact_1",
          entity_type: "contact",
          schema_version: "1.0",
          source_id: "src_1",
          observed_at: "2025-01-01T00:00:00Z",
          specificity_score: 1.0,
          source_priority: 100,
          fields: { organization: "Dust" },
          created_at: "2025-01-01T00:00:00Z",
          user_id: "u1",
        },
      ];

      const reducer = new ObservationReducer();
      const snap = await reducer.computeSnapshot("ent_contact_1", observations);
      expect(snap).not.toBeNull();
      // The older observation was stored/delivered second (later array
      // position corresponds to earlier observed_at is irrelevant here —
      // observations[0] IS the newer one; what matters is the reducer sorts
      // by observed_at, not array position). Assert last-write-wins picked
      // the later observed_at value regardless of array order.
      expect(snap!.snapshot.organization).toBe("Stripe");
      expect(snap!.provenance.organization).toBe("obs_newer_stripe");

      // Now feed the reducer's resolved (winning) value into
      // autoLinkReferenceFields, proving it links/retracts against the
      // correct last-write-winning value rather than an intermediate one.
      getRelationshipsForEntityMock.mockResolvedValueOnce([
        {
          relationship_key: "works_at:ent_contact_1:ent_company_dust",
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_dust",
          snapshot: {
            auto_linked: true,
            auto_link_field: "organization",
            auto_link_entity_type: "contact",
          },
        },
      ]);
      mockCompanyResolution("ent_company_stripe", "Stripe");

      const { autoLinkReferenceFields } =
        await import("../../src/services/schema_reference_linking.js");
      const result = await autoLinkReferenceFields({
        entityId: "ent_contact_1",
        entityType: "contact",
        fields: snap!.snapshot,
        schema: orgSchema,
        userId: "u1",
      });

      expect(createRelationshipMock).toHaveBeenCalledWith(
        expect.objectContaining({
          relationship_type: "works_at",
          source_entity_id: "ent_contact_1",
          target_entity_id: "ent_company_stripe",
        })
      );
      expect(softDeleteRelationshipMock).toHaveBeenCalledWith(
        "works_at:ent_contact_1:ent_company_dust",
        "works_at",
        "ent_contact_1",
        "ent_company_dust",
        "u1",
        expect.any(String)
      );
      expect(result.created).toBe(1);
      expect(result.retracted).toBe(1);
      expect(result.details[0]).toMatchObject({
        target_entity_id: "ent_company_stripe",
        linked: true,
        retracted_target_entity_id: "ent_company_dust",
      });
    });
  });
});
