import { beforeEach, describe, expect, it, vi } from "vitest";

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
      expect(result.details[0]).toMatchObject({
        target_entity_id: "ent_company_stripe",
        linked: true,
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
      expect(result.details[0].linked).toBe(false);
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
    });
  });
});
