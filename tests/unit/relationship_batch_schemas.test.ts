import { describe, expect, it } from "vitest";

import {
  CreateRelationshipsRequestSchema,
  StoreRequestSchema,
  StoreStructuredRequestSchema,
} from "../../src/shared/action_schemas.js";

describe("relationship batch schemas", () => {
  it("accepts store_structured relationships by request entity index", () => {
    const parsed = StoreStructuredRequestSchema.parse({
      entities: [
        { entity_type: "conversation", conversation_id: "batch-schema-test" },
        { entity_type: "conversation_message", turn_key: "batch-schema-test:1" },
      ],
      relationships: [
        { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
      ],
      idempotency_key: "batch-schema-index",
    });

    expect(parsed.relationships?.[0]).toMatchObject({
      relationship_type: "PART_OF",
      source_index: 1,
      target_index: 0,
    });
  });

  it("accepts store_structured relationships by existing entity ids", () => {
    const parsed = StoreRequestSchema.parse({
      entities: [{ entity_type: "note", title: "batch-schema-test" }],
      relationships: [
        {
          relationship_type: "REFERS_TO",
          source_entity_id: "ent_source",
          target_entity_id: "ent_target",
          metadata: { reason: "unit-test" },
        },
      ],
      idempotency_key: "batch-schema-ids",
    });

    expect(parsed.relationships?.[0]).toMatchObject({
      relationship_type: "REFERS_TO",
      source_entity_id: "ent_source",
      target_entity_id: "ent_target",
      metadata: { reason: "unit-test" },
    });
  });

  it("accepts create_relationships batch requests", () => {
    const parsed = CreateRelationshipsRequestSchema.parse({
      relationships: [
        {
          relationship_type: "REFERS_TO",
          source_entity_id: "ent_a",
          target_entity_id: "ent_b",
        },
        {
          relationship_type: "PART_OF",
          source_entity_id: "ent_c",
          target_entity_id: "ent_d",
          metadata: { source: "test" },
        },
      ],
    });

    expect(parsed.relationships).toHaveLength(2);
  });

  it("rejects empty create_relationships batches", () => {
    expect(() =>
      CreateRelationshipsRequestSchema.parse({ relationships: [] }),
    ).toThrow();
  });
});
