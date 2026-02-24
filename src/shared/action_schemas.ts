import { z } from "zod";

export const EntityIdSchema = z.object({
  entity_id: z.string(),
});

export const EntitySnapshotRequestSchema = z.object({
  entity_id: z.string(),
  at: z.string().optional(),
});

export const ListObservationsRequestSchema = z.object({
  entity_id: z.string(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const FieldProvenanceRequestSchema = z.object({
  entity_id: z.string(),
  field: z.string(),
});

export const RelationshipTypeSchema = z.enum([
  "PART_OF",
  "CORRECTS",
  "REFERS_TO",
  "SETTLES",
  "DUPLICATE_OF",
  "DEPENDS_ON",
  "SUPERSEDES",
  "EMBEDS",
  "works_at",
  "owns",
  "manages",
  "part_of",
  "related_to",
  "depends_on",
  "references",
  "transacted_with",
  "member_of",
  "reports_to",
  "located_at",
  "created_by",
  "funded_by",
  "acquired_by",
  "subsidiary_of",
  "partner_of",
  "competitor_of",
  "supplies_to",
  "contracted_with",
  "invested_in",
]);

export const CreateRelationshipRequestSchema = z.object({
  relationship_type: RelationshipTypeSchema,
  source_entity_id: z.string(),
  target_entity_id: z.string(),
  source_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ListRelationshipsRequestSchema = z.object({
  entity_id: z.string(),
  direction: z
    .enum(["inbound", "outbound", "incoming", "outgoing", "both"])
    .optional()
    .default("both"),
  relationship_type: RelationshipTypeSchema.optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const TimelineEventsRequestSchema = z.object({
  event_type: z.string().optional(),
  after_date: z.string().optional(),
  before_date: z.string().optional(),
  source_id: z.string().optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const EntitiesQueryRequestSchema = z.object({
  entity_type: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
  include_merged: z.boolean().optional().default(false),
  user_id: z.string().optional(),
});

export const RetrieveEntitiesRequestSchema = z.object({
  user_id: z.string().optional(),
  entity_type: z.string().optional(),
  search: z.string().optional(),
  /**
   * Distance threshold for semantic search (L2, range ~0.9–1.5 in practice).
   * Results with distance >= threshold are dropped. Lower = stricter matching.
   * Typical values: 1.0 (very strict), 1.02 (moderate), 1.05 (loose).
   * Only applied when search is provided.
   */
  similarity_threshold: z.number().min(0).max(2).optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
  include_snapshots: z.boolean().optional().default(true),
  include_merged: z.boolean().optional().default(false),
});

export const ObservationsQueryRequestSchema = z.object({
  observation_id: z.string().optional(),
  entity_id: z.string().optional(),
  entity_type: z.string().optional(),
  source_id: z.string().optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
  user_id: z.string().optional(),
});

export const StoreStructuredRequestSchema = z.object({
  entities: z.array(z.record(z.unknown())),
  relationships: z
    .array(
      z.object({
        relationship_type: z.string(),
        source_index: z.number().int().min(0),
        target_index: z.number().int().min(0),
      })
    )
    .optional(),
  source_priority: z.number().optional().default(100),
  idempotency_key: z.string().min(1),
  user_id: z.string().optional(),
  original_filename: z.string().optional(),
});

/** REST store/unstructured: file_content (base64) + mime_type, optional interpret and idempotency_key. */
export const StoreUnstructuredRequestSchema = z.object({
  file_content: z.string(),
  mime_type: z.string().min(1),
  idempotency_key: z.string().min(1).optional(),
  original_filename: z.string().optional(),
  interpret: z.boolean().optional().default(true),
  interpretation_config: z.record(z.unknown()).optional(),
  user_id: z.string().optional(),
});

export const StoreRequestSchema = z
  .object({
    user_id: z.string().optional(),
    entities: z.array(z.record(z.unknown())).optional(),
    relationships: z
      .array(
        z.object({
          relationship_type: z.string(),
          source_index: z.number().int().min(0),
          target_index: z.number().int().min(0),
        })
      )
      .optional(),
    source_priority: z.number().optional().default(100),
    idempotency_key: z.string().min(1).optional(),
    file_idempotency_key: z.string().min(1).optional(),
    file_content: z.string().optional(),
    file_path: z.string().optional(),
    mime_type: z.string().min(1).optional(),
    original_filename: z.string().optional(),
    interpret: z.boolean().optional().default(true),
    interpretation_config: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => {
      const hasEntities = Boolean(data.entities && data.entities.length > 0);
      const hasFileContent = Boolean(data.file_content && data.mime_type);
      const hasFilePath = Boolean(data.file_path);
      return hasEntities || hasFileContent || hasFilePath;
    },
    {
      message:
        "Must provide either entities, file_path, or file_content with mime_type",
    }
  );

export const MergeEntitiesRequestSchema = z.object({
  from_entity_id: z.string(),
  to_entity_id: z.string(),
  merge_reason: z.string().optional(),
  user_id: z.string().optional(),
});

export const DeleteEntityRequestSchema = z.object({
  entity_id: z.string(),
  entity_type: z.string(),
  reason: z.string().optional(),
  user_id: z.string().optional(),
});

export const DeleteRelationshipRequestSchema = z.object({
  relationship_type: RelationshipTypeSchema,
  source_entity_id: z.string(),
  target_entity_id: z.string(),
  reason: z.string().optional(),
  user_id: z.string().optional(),
});

export const RestoreEntityRequestSchema = z.object({
  entity_id: z.string(),
  entity_type: z.string(),
  reason: z.string().optional(),
  user_id: z.string().optional(),
});

export const RestoreRelationshipRequestSchema = z.object({
  relationship_type: RelationshipTypeSchema,
  source_entity_id: z.string(),
  target_entity_id: z.string(),
  reason: z.string().optional(),
  user_id: z.string().optional(),
});

export const CorrectEntityRequestSchema = z.object({
  entity_id: z.string(),
  entity_type: z.string().optional().default("unknown"),
  field: z.string(),
  value: z.unknown(),
  idempotency_key: z.string().min(1),
  user_id: z.string().optional(),
});

export const ReinterpretRequestSchema = z.object({
  source_id: z.string().optional(),
  interpretation_id: z.string().optional(),
  interpretation_config: z.record(z.unknown()).optional(),
}).refine((data) => data.source_id || data.interpretation_id, {
  message: "Either source_id or interpretation_id is required",
});

export const InterpretUninterpretedRequestSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(50),
  dry_run: z.boolean().optional().default(false),
  user_id: z.string().optional(),
  interpretation_config: z.record(z.unknown()).optional(),
});

export const ListEntityTypesRequestSchema = z.object({
  keyword: z.string().optional(),
  summary: z.boolean().optional().default(false),
});

export const RetrieveEntityByIdentifierSchema = z.object({
  identifier: z.string(),
  entity_type: z.string().optional(),
});

export const RetrieveRelatedEntitiesSchema = z.object({
  entity_id: z.string(),
  relationship_types: z.array(RelationshipTypeSchema).optional(),
  direction: z.enum(["inbound", "outbound", "both"]).optional().default("both"),
  max_hops: z.number().int().positive().optional().default(1),
  include_entities: z.boolean().optional().default(true),
});

export const RetrieveGraphNeighborhoodSchema = z.object({
  node_id: z.string(),
  node_type: z.enum(["entity", "source"]).optional().default("entity"),
  include_relationships: z.boolean().optional().default(true),
  include_sources: z.boolean().optional().default(true),
  include_events: z.boolean().optional().default(true),
  include_observations: z.boolean().optional().default(false),
});

export const RelationshipSnapshotRequestSchema = z.object({
  relationship_type: RelationshipTypeSchema,
  source_entity_id: z.string(),
  target_entity_id: z.string(),
});

export const AnalyzeSchemaCandidatesRequestSchema = z.object({
  entity_type: z.string().optional(),
  user_id: z.string().optional(),
  min_frequency: z.number().int().positive().optional().default(5),
  min_confidence: z.number().min(0).max(1).optional().default(0.8),
});

export const GetSchemaRecommendationsRequestSchema = z.object({
  entity_type: z.string(),
  user_id: z.string().optional(),
  source: z.enum(["raw_fragments", "agent", "inference", "all"]).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export const UpdateSchemaIncrementalRequestSchema = z.object({
  entity_type: z.string(),
  fields_to_add: z.array(
    z.object({
      field_name: z.string(),
      field_type: z.enum(["string", "number", "date", "boolean", "array", "object"]),
      required: z.boolean().default(false),
      reducer_strategy: z
        .enum(["last_write", "highest_priority", "most_specific", "merge_array"])
        .optional(),
    })
  ),
  schema_version: z.string().optional(),
  user_specific: z.boolean().default(false),
  user_id: z.string().optional(),
  activate: z.boolean().default(true),
  migrate_existing: z.boolean().default(false),
});

export const RegisterSchemaRequestSchema = z.object({
  entity_type: z.string(),
  schema_definition: z.record(z.unknown()),
  reducer_config: z.record(z.unknown()),
  schema_version: z.string().default("1.0"),
  user_specific: z.boolean().default(false),
  user_id: z.string().optional(),
  activate: z.boolean().default(false),
});
