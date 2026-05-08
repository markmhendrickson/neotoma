import { describe, expect, it } from "vitest";

import {
  CreateRelationshipsRequestSchema,
  StoreRequestSchema,
  StoreStructuredRequestSchema,
} from "../../src/shared/action_schemas.js";

/** Matches {@link generateEntityId}: ent_ + 24 lowercase hex chars */
const EID_A = "ent_aaaaaaaaaaaaaaaaaaaaaaaa";
const EID_B = "ent_bbbbbbbbbbbbbbbbbbbbbbbb";
const EID_C = "ent_cccccccccccccccccccccccc";
const EID_D = "ent_dddddddddddddddddddddddd";
const EID_SRC = "ent_111111111111111111111111";
const EID_TGT = "ent_222222222222222222222222";
const EID_EXISTING_TARGET = "ent_333333333333333333333333";
const EID_EXISTING_SOURCE = "ent_444444444444444444444444";

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
          source_entity_id: EID_SRC,
          target_entity_id: EID_TGT,
          metadata: { reason: "unit-test" },
        },
      ],
      idempotency_key: "batch-schema-ids",
    });

    expect(parsed.relationships?.[0]).toMatchObject({
      relationship_type: "REFERS_TO",
      source_entity_id: EID_SRC,
      target_entity_id: EID_TGT,
      metadata: { reason: "unit-test" },
    });
  });

  it("accepts store relationships from a request entity index to an existing entity id", () => {
    const parsed = StoreRequestSchema.parse({
      entities: [{ entity_type: "conversation_message", turn_key: "batch-schema-test:2" }],
      relationships: [
        {
          relationship_type: "REFERS_TO",
          source_index: 0,
          target_entity_id: EID_EXISTING_TARGET,
          metadata: { reason: "mixed-index-id" },
        },
      ],
      idempotency_key: "batch-schema-source-index-target-id",
    });

    expect(parsed.relationships?.[0]).toMatchObject({
      relationship_type: "REFERS_TO",
      source_index: 0,
      target_entity_id: EID_EXISTING_TARGET,
      metadata: { reason: "mixed-index-id" },
    });
  });

  it("accepts store relationships from an existing entity id to a request entity index", () => {
    const parsed = StoreRequestSchema.parse({
      entities: [{ entity_type: "note", title: "batch-schema-target-index" }],
      relationships: [
        {
          relationship_type: "REFERS_TO",
          source_entity_id: EID_EXISTING_SOURCE,
          target_index: 0,
        },
      ],
      idempotency_key: "batch-schema-source-id-target-index",
    });

    expect(parsed.relationships?.[0]).toMatchObject({
      relationship_type: "REFERS_TO",
      source_entity_id: EID_EXISTING_SOURCE,
      target_index: 0,
    });
  });

  it("rejects store relationships without exactly one source endpoint and one target endpoint", () => {
    expect(() =>
      StoreRequestSchema.parse({
        entities: [{ entity_type: "note", title: "batch-schema-invalid" }],
        relationships: [
          {
            relationship_type: "REFERS_TO",
            source_index: 0,
            source_entity_id: EID_EXISTING_SOURCE,
            target_entity_id: EID_EXISTING_TARGET,
          },
        ],
        idempotency_key: "batch-schema-invalid-source-endpoint",
      }),
    ).toThrow();

    expect(() =>
      StoreRequestSchema.parse({
        entities: [{ entity_type: "note", title: "batch-schema-invalid" }],
        relationships: [
          {
            relationship_type: "REFERS_TO",
            source_index: 0,
          },
        ],
        idempotency_key: "batch-schema-missing-target-endpoint",
      }),
    ).toThrow();
  });

  it("rejects store relationships with non-Neotoma entity id strings", () => {
    expect(() =>
      StoreRequestSchema.parse({
        entities: [{ entity_type: "note", title: "bad-rel-ids" }],
        relationships: [
          {
            relationship_type: "REFERS_TO",
            source_entity_id: "PLACEHOLDER",
            target_entity_id: EID_TGT,
          },
        ],
        idempotency_key: "batch-schema-bad-source-id",
      }),
    ).toThrow();

    expect(() =>
      StoreRequestSchema.parse({
        entities: [{ entity_type: "note", title: "bad-rel-ids-2" }],
        relationships: [
          {
            relationship_type: "REFERS_TO",
            source_entity_id: EID_SRC,
            target_entity_id: "ent_not24_hex_chars_here___",
          },
        ],
        idempotency_key: "batch-schema-bad-target-id",
      }),
    ).toThrow();
  });

  it("accepts create_relationships batch requests", () => {
    const parsed = CreateRelationshipsRequestSchema.parse({
      relationships: [
        {
          relationship_type: "REFERS_TO",
          source_entity_id: EID_A,
          target_entity_id: EID_B,
        },
        {
          relationship_type: "PART_OF",
          source_entity_id: EID_C,
          target_entity_id: EID_D,
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
