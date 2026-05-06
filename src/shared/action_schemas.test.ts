import { describe, expect, it } from "vitest";
import { CorrectEntityRequestSchema, StoreRequestSchema, StoreStructuredRequestSchema } from "./action_schemas.js";

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
