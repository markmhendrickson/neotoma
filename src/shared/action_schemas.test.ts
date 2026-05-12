import { describe, expect, it } from "vitest";
import {
  CorrectEntityRequestSchema,
  RELATIONSHIP_ENTITY_ID_FORMAT_HINT,
  RELATIONSHIP_ENTITY_ID_FORMAT_ISSUE_CODE,
  StoreRequestSchema,
  StoreStructuredRequestSchema,
} from "./action_schemas.js";

describe("StoreStructuredRequestSchema", () => {
  it("requires idempotency_key", () => {
    expect(() =>
      StoreStructuredRequestSchema.parse({
        entities: [{ entity_type: "contact", name: "Test Contact" }],
      })
    ).toThrow();
  });

  it("accepts idempotency_key", () => {
    expect(() =>
      StoreStructuredRequestSchema.parse({
        entities: [{ entity_type: "contact", name: "Test Contact" }],
        idempotency_key: "idemp_test_key",
      })
    ).not.toThrow();
  });

  it("accepts explicit interpretation provenance", () => {
    expect(() =>
      StoreStructuredRequestSchema.parse({
        entities: [{ entity_type: "contact", name: "Test Contact" }],
        idempotency_key: "idemp_test_key",
        interpretation: {
          source_id: "source_test",
          interpretation_config: { extractor_type: "agent", schema_version: "1.0" },
        },
      })
    ).not.toThrow();
  });

  it("rejects interpretation provenance without a source", () => {
    expect(() =>
      StoreStructuredRequestSchema.parse({
        entities: [{ entity_type: "contact", name: "Test Contact" }],
        idempotency_key: "idemp_test_key",
        interpretation: {
          interpretation_config: { extractor_type: "agent" },
        },
      })
    ).toThrow();
  });
});

describe("StoreRequestSchema", () => {
  it("accepts combined structured and unstructured payload", () => {
    expect(() =>
      StoreRequestSchema.parse({
        entities: [{ entity_type: "task", title: "Combined payload" }],
        idempotency_key: "idemp_combined",
        file_content: Buffer.from("hello").toString("base64"),
        mime_type: "text/plain",
      })
    ).not.toThrow();
  });

  it("rejects non-Neotoma relationship entity ids with a structured hint", () => {
    const parsed = StoreRequestSchema.safeParse({
      entities: [{ entity_type: "task", title: "Relationship payload" }],
      idempotency_key: "idemp_relationship_payload",
      relationships: [
        {
          relationship_type: "REFERS_TO",
          source_entity_id: "legacy-source-id",
          target_index: 0,
        },
      ],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("Expected StoreRequestSchema to reject invalid relationship ids");
    }
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["relationships", 0, "source_entity_id"],
          message: expect.stringContaining(RELATIONSHIP_ENTITY_ID_FORMAT_HINT),
          params: {
            code: RELATIONSHIP_ENTITY_ID_FORMAT_ISSUE_CODE,
            hint: RELATIONSHIP_ENTITY_ID_FORMAT_HINT,
          },
        }),
      ])
    );
  });
});

describe("CorrectEntityRequestSchema", () => {
  it("requires idempotency_key", () => {
    expect(() =>
      CorrectEntityRequestSchema.parse({
        entity_id: "ent_test",
        entity_type: "contact",
        field: "name",
        value: "Updated Name",
      })
    ).toThrow();
  });

  it("accepts idempotency_key", () => {
    expect(() =>
      CorrectEntityRequestSchema.parse({
        entity_id: "ent_test",
        entity_type: "contact",
        field: "name",
        value: "Updated Name",
        idempotency_key: "idemp_test_key",
      })
    ).not.toThrow();
  });
});
