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
]);

export const CreateRelationshipRequestSchema = z.object({
  relationship_type: RelationshipTypeSchema,
  source_entity_id: z.string(),
  target_entity_id: z.string(),
  source_id: z.string().uuid().optional(),
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
  user_id: z.string().uuid().optional(),
});

export const RetrieveEntitiesRequestSchema = z.object({
  user_id: z.string().uuid().optional(),
  entity_type: z.string().optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
  include_snapshots: z.boolean().optional().default(true),
  include_merged: z.boolean().optional().default(false),
});

export const ObservationsQueryRequestSchema = z.object({
  entity_id: z.string().optional(),
  entity_type: z.string().optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
  user_id: z.string().uuid().optional(),
});

export const StoreStructuredRequestSchema = z.object({
  entities: z.array(z.record(z.unknown())),
  source_priority: z.number().optional().default(100),
  idempotency_key: z.string().min(1),
  user_id: z.string().uuid().optional(),
});

export const MergeEntitiesRequestSchema = z.object({
  from_entity_id: z.string(),
  to_entity_id: z.string(),
  merge_reason: z.string().optional(),
  user_id: z.string().uuid().optional(),
});

export const CorrectEntityRequestSchema = z.object({
  entity_id: z.string(),
  entity_type: z.string(),
  field: z.string(),
  value: z.unknown(),
  idempotency_key: z.string().min(1),
  user_id: z.string().uuid().optional(),
});

export const ReinterpretRequestSchema = z.object({
  source_id: z.string(),
  interpretation_config: z.record(z.unknown()),
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
  user_id: z.string().uuid().optional(),
  min_frequency: z.number().int().positive().optional().default(5),
  min_confidence: z.number().min(0).max(1).optional().default(0.8),
});

export const GetSchemaRecommendationsRequestSchema = z.object({
  entity_type: z.string(),
  user_id: z.string().uuid().optional(),
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
  user_id: z.string().uuid().optional(),
  activate: z.boolean().default(true),
  migrate_existing: z.boolean().default(false),
});

export const RegisterSchemaRequestSchema = z.object({
  entity_type: z.string(),
  schema_definition: z.record(z.unknown()),
  reducer_config: z.record(z.unknown()),
  schema_version: z.string().default("1.0"),
  user_specific: z.boolean().default(false),
  user_id: z.string().uuid().optional(),
  activate: z.boolean().default(false),
});
