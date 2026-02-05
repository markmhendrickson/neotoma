import { describe, expect, it } from "vitest";
import { CorrectEntityRequestSchema, StoreStructuredRequestSchema } from "./action_schemas.js";

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
