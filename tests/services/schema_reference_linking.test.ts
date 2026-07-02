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
vi.mock("../../src/services/relationships.js", () => {
  return {
    relationshipsService: {
      createRelationship: createRelationshipMock,
    },
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
    resolveCompanyEntityMock.mockReset();
  });

  it("skips when schema has no reference_fields", async () => {
    const { autoLinkReferenceFields } =
      await import("../../src/services/schema_reference_linking.js");
    const result = await autoLinkReferenceFields({
      entityId: "ent_1",
      entityType: "transaction",
      fields: { merchant: "Acme" },
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
});
