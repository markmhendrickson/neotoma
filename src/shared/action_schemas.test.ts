import { describe, expect, it } from "vitest";
import {
  CorrectEntityRequestSchema,
  IssuesSubmitRequestSchema,
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

describe("IssuesSubmitRequestSchema target_repo validation", () => {
  const base = { title: "T", body: "B" };

  it("accepts a well-formed owner/repo", () => {
    expect(() =>
      IssuesSubmitRequestSchema.parse({ ...base, target_repo: "markmhendrickson/ateles" })
    ).not.toThrow();
  });

  it("omits target_repo entirely (optional)", () => {
    expect(() => IssuesSubmitRequestSchema.parse(base)).not.toThrow();
  });

  it("rejects a bare repo with no owner", () => {
    // B3: a malformed value must fail validation at the boundary rather than
    // silently degrading to "stored locally, no mirror" inside submitIssue.
    const result = IssuesSubmitRequestSchema.safeParse({ ...base, target_repo: "ateles" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("owner/repo");
    }
  });

  it("rejects a full GitHub URL", () => {
    expect(
      IssuesSubmitRequestSchema.safeParse({
        ...base,
        target_repo: "https://github.com/markmhendrickson/ateles",
      }).success
    ).toBe(false);
  });

  it("rejects an owner/repo containing whitespace", () => {
    expect(
      IssuesSubmitRequestSchema.safeParse({ ...base, target_repo: "owner /repo" }).success
    ).toBe(false);
  });

  it("rejects extra path segments", () => {
    expect(
      IssuesSubmitRequestSchema.safeParse({ ...base, target_repo: "owner/repo/extra" }).success
    ).toBe(false);
  });
});
