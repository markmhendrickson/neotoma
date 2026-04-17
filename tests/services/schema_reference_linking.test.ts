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

describe("autoLinkReferenceFields", () => {
  beforeEach(() => {
    createRelationshipMock.mockReset();
    createRelationshipMock.mockResolvedValue({ id: "rel_1" });
  });

  it("skips when schema has no reference_fields", async () => {
    const { autoLinkReferenceFields } = await import(
      "../../src/services/schema_reference_linking.js"
    );
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
    const { autoLinkReferenceFields } = await import(
      "../../src/services/schema_reference_linking.js"
    );
    const result = await autoLinkReferenceFields({
      entityId: "ent_1",
      entityType: "transaction",
      fields: { merchant: "" },
      schema: {
        fields: {},
        reference_fields: [
          { field: "merchant", target_entity_type: "company" },
        ],
      },
      userId: "u1",
    });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(createRelationshipMock).not.toHaveBeenCalled();
  });

  it("records a skipped detail when target cannot be resolved", async () => {
    const { autoLinkReferenceFields } = await import(
      "../../src/services/schema_reference_linking.js"
    );
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
  });
});
