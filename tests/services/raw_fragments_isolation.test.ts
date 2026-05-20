/**
 * Regression test for audit finding #3: unknown fields from one entity in
 * a multi-entity `store_structured` call were leaking into sibling
 * entities' raw_fragments rows.
 *
 * The fix invariant is that each entity iteration must pass its own
 * `entityType` + `unknownFields` and nothing else. This test drives
 * `storeUnknownFields` three times (as a loop body would) with three
 * distinct entity types and three disjoint unknown-field sets, then
 * asserts the db was written with the expected (entity_type, fragment_key)
 * tuples and no cross-pollination.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedRows: Array<Record<string, unknown>> = [];

function rawFragmentsTable() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null }),
    insert: (row: Record<string, unknown>) => ({
      select: async () => {
        insertedRows.push(row);
        return { data: [row], error: null };
      },
    }),
  };
  return chain;
}

vi.mock("../../src/db.js", () => ({
  db: {
    from: () => rawFragmentsTable(),
  },
}));

vi.mock("../../src/services/schema_recommendation.js", () => ({
  schemaRecommendationService: {
    queueAutoEnhancementCheck: vi.fn().mockResolvedValue(undefined),
  },
}));

import { storeUnknownFields } from "../../src/services/raw_fragments.js";

describe("raw_fragments isolation across multi-entity store_structured", () => {
  beforeEach(() => {
    insertedRows.length = 0;
  });

  it("stores each entity's unknown fields only under its own entity_type (no cross-pollination)", async () => {
    const sourceId = "src_multi_1";
    const userId = "00000000-0000-0000-0000-000000000000";

    // Simulate the inner loop of storeStructuredInternal: three distinct
    // entities, each with distinct unknown fields and distinct entity types.
    await storeUnknownFields({
      sourceId,
      userId,
      entityType: "receipt",
      schemaVersion: "1.0",
      unknownFields: { receipt_extra_a: "a1", receipt_extra_b: "a2" },
    });
    await storeUnknownFields({
      sourceId,
      userId,
      entityType: "transaction",
      schemaVersion: "1.0",
      unknownFields: { tx_code: "TX-99", tx_channel: "wire" },
    });
    await storeUnknownFields({
      sourceId,
      userId,
      entityType: "contact",
      schemaVersion: "1.0",
      unknownFields: { nickname: "Al", alt_email: "al@example.com" },
    });

    // Each row must carry the entity_type from its own call. No row for
    // "receipt" should contain transaction or contact keys, etc.
    const byType = new Map<string, Set<string>>();
    for (const row of insertedRows) {
      const entityType = row.entity_type as string;
      const key = row.fragment_key as string;
      if (!byType.has(entityType)) byType.set(entityType, new Set());
      byType.get(entityType)!.add(key);
    }

    expect(byType.get("receipt")).toEqual(
      new Set(["receipt_extra_a", "receipt_extra_b"]),
    );
    expect(byType.get("transaction")).toEqual(
      new Set(["tx_code", "tx_channel"]),
    );
    expect(byType.get("contact")).toEqual(
      new Set(["nickname", "alt_email"]),
    );

    // And the rows' fragment_value must match the originating entity,
    // not leak between them.
    const receiptRows = insertedRows.filter((r) => r.entity_type === "receipt");
    const txRows = insertedRows.filter((r) => r.entity_type === "transaction");
    const contactRows = insertedRows.filter((r) => r.entity_type === "contact");

    expect(
      receiptRows.every((r) =>
        ["a1", "a2"].includes(r.fragment_value as string),
      ),
    ).toBe(true);
    expect(
      txRows.every((r) =>
        ["TX-99", "wire"].includes(r.fragment_value as string),
      ),
    ).toBe(true);
    expect(
      contactRows.every((r) =>
        ["Al", "al@example.com"].includes(r.fragment_value as string),
      ),
    ).toBe(true);
  });

  it("does not emit rows for null or undefined unknown field values", async () => {
    await storeUnknownFields({
      sourceId: "src_x",
      userId: "00000000-0000-0000-0000-000000000000",
      entityType: "receipt",
      schemaVersion: "1.0",
      unknownFields: {
        keep_me: "yes",
        nullish: null,
        undefd: undefined,
      },
    });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].fragment_key).toBe("keep_me");
  });

  it("persists entity_id when provided so same-source same-type fragments stay isolated", async () => {
    const sourceId = "src_same_type";
    const userId = "00000000-0000-0000-0000-000000000000";

    await storeUnknownFields({
      sourceId,
      userId,
      entityId: "ent_tesy",
      entityType: "organization",
      schemaVersion: "1.0",
      unknownFields: { slug: "tesy" },
    });
    await storeUnknownFields({
      sourceId,
      userId,
      entityId: "ent_planadigm",
      entityType: "organization",
      schemaVersion: "1.0",
      unknownFields: { slug: "planadigm" },
    });

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: "ent_tesy",
          entity_type: "organization",
          fragment_key: "slug",
          fragment_value: "tesy",
        }),
        expect.objectContaining({
          entity_id: "ent_planadigm",
          entity_type: "organization",
          fragment_key: "slug",
          fragment_value: "planadigm",
        }),
      ]),
    );
  });
});
