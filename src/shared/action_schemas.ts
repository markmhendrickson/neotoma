import { z } from "zod";

export const EntityIdSchema = z.object({
  entity_id: z.string(),
});

export const EntitySnapshotRequestSchema = z.object({
  entity_id: z.string(),
  at: z.string().optional(),
  /**
   * Response text format. Defaults to `markdown` so MCP output is KV-cache
   * stable for LLMs (see canonical_markdown renderer). Use `json` for
   * machine-parseable output (e.g. CLI, tests, dashboards).
   */
  format: z.enum(["markdown", "json"]).optional(),
});

export const ListObservationsRequestSchema = z.object({
  entity_id: z.string(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
  updated_since: z.string().optional(),
  created_since: z.string().optional(),
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
  user_id: z.string().optional(),
});

const CreateRelationshipBatchItemSchema = CreateRelationshipRequestSchema.omit({
  user_id: true,
}).extend({
  source_id: z.string().optional(),
});

export const CreateRelationshipsRequestSchema = z.object({
  relationships: z.array(CreateRelationshipBatchItemSchema).min(1),
  source_id: z.string().optional(),
  user_id: z.string().optional(),
});

const StoreRelationshipByIndexSchema = z.object({
  relationship_type: z.string(),
  source_index: z.number().int().min(0),
  target_index: z.number().int().min(0),
  metadata: z.record(z.unknown()).optional(),
});

const StoreRelationshipByEntityIdSchema = z.object({
  relationship_type: z.string(),
  source_entity_id: z.string().min(1),
  target_entity_id: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const StoreRelationshipInputSchema = z.union([
  StoreRelationshipByIndexSchema,
  StoreRelationshipByEntityIdSchema,
]);

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
  order_by: z.enum(["event_timestamp", "created_at"]).optional().default("event_timestamp"),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

const EntityQuerySortBySchema = z
  .enum(["entity_id", "canonical_name", "observation_count", "last_observation_at"])
  .optional()
  .default("entity_id");
const EntityQuerySortOrderSchema = z.enum(["asc", "desc"]).optional().default("asc");

function validateEntityQueryCombinations(
  value: {
    search?: string;
    sort_by?: "entity_id" | "canonical_name" | "observation_count" | "last_observation_at";
    sort_order?: "asc" | "desc";
    published?: boolean;
    published_after?: string;
    published_before?: string;
  },
  ctx: z.RefinementCtx
): void {
  const normalizedSearch = typeof value.search === "string" ? value.search.trim() : "";
  const hasSearch = normalizedSearch.length > 0;
  const hasPublishedFilters =
    value.published !== undefined ||
    Boolean(value.published_after) ||
    Boolean(value.published_before);
  const hasNonDefaultSort =
    (value.sort_by && value.sort_by !== "entity_id") ||
    (value.sort_order && value.sort_order !== "asc");

  if (hasSearch && hasPublishedFilters) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "search cannot be combined with published filters (published, published_after, published_before)",
      path: ["search"],
    });
  }

  if (hasSearch && hasNonDefaultSort) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "search cannot be combined with non-default sorting (sort_by/sort_order)",
      path: ["search"],
    });
  }

  if (
    value.published_after &&
    value.published_before &&
    value.published_after.localeCompare(value.published_before) > 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "published_after must be less than or equal to published_before",
      path: ["published_after"],
    });
  }
}

const EntitiesQueryRequestBaseSchema = z
  .object({
    entity_type: z.string().optional(),
    search: z.string().optional(),
    limit: z.number().int().positive().optional().default(100),
    offset: z.number().int().nonnegative().optional().default(0),
    sort_by: EntityQuerySortBySchema,
    sort_order: EntityQuerySortOrderSchema,
    published: z.boolean().optional(),
    published_after: z.string().optional(),
    published_before: z.string().optional(),
    include_snapshots: z.boolean().optional().default(true),
    include_merged: z.boolean().optional().default(false),
    user_id: z.string().optional(),
    updated_since: z.string().optional(),
    created_since: z.string().optional(),
    /**
     * R3: filter entities whose observations were resolved with the given
     * `identity_basis`. Satisfied when ANY observation for the entity carries
     * this basis. Enables the Inspector "Ambiguous/heuristic" filter without
     * joining observations client-side. See
     * `src/services/entity_resolution.ts#IdentityBasis`.
     */
    identity_basis: z
      .enum([
        "schema_rule",
        "schema_lookup",
        "heuristic_name",
        "heuristic_fallback",
        "target_id",
      ])
      .optional(),
  })
  .superRefine(validateEntityQueryCombinations);

export const EntitiesQueryRequestSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const raw = input as Record<string, unknown>;
  return {
    ...raw,
    // Compatibility aliases used by some MCP clients/tools.
    search: raw.search ?? raw.search_query ?? raw.query,
  };
}, EntitiesQueryRequestBaseSchema);

const RetrieveEntitiesRequestBaseSchema = z
  .object({
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
    sort_by: EntityQuerySortBySchema,
    sort_order: EntityQuerySortOrderSchema,
    published: z.boolean().optional(),
    published_after: z.string().optional(),
    published_before: z.string().optional(),
    include_snapshots: z.boolean().optional().default(true),
    include_merged: z.boolean().optional().default(false),
    updated_since: z.string().optional(),
    created_since: z.string().optional(),
  })
  .superRefine(validateEntityQueryCombinations);

export const RetrieveEntitiesRequestSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const raw = input as Record<string, unknown>;
  return {
    ...raw,
    // Compatibility aliases used by some MCP clients/tools.
    search: raw.search ?? raw.search_query ?? raw.query,
  };
}, RetrieveEntitiesRequestBaseSchema);

export const ObservationsQueryRequestSchema = z.object({
  observation_id: z.string().optional(),
  entity_id: z.string().optional(),
  entity_type: z.string().optional(),
  source_id: z.string().optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
  user_id: z.string().optional(),
  updated_since: z.string().optional(),
  created_since: z.string().optional(),
});

/**
 * Classification of the *kind* of write being performed, orthogonal to
 * numeric `source_priority`. See `Observation.observation_source` in
 * openapi.yaml for the full semantic contract. Default (`llm_summary`)
 * is applied by the write path, not at parse time, so MCP callers that
 * omit the field remain LLM-driven by construction without breaking
 * idempotency hashes or contract-test fixtures.
 */
export const OBSERVATION_SOURCE_VALUES = [
  "sensor",
  "llm_summary",
  "workflow_state",
  "human",
  "import",
] as const;

export const ObservationSourceSchema = z.enum(OBSERVATION_SOURCE_VALUES);

export type ObservationSource = z.infer<typeof ObservationSourceSchema>;

export const StoreStructuredRequestSchema = z.object({
  entities: z.array(z.record(z.unknown())),
  relationships: z
    .array(StoreRelationshipInputSchema)
    .optional(),
  source_priority: z.number().optional().default(100),
  observation_source: ObservationSourceSchema.optional(),
  idempotency_key: z.string().min(1),
  user_id: z.string().optional(),
  original_filename: z.string().optional(),
});

/** REST store/unstructured: file_content (base64) + mime_type, raw storage only. */
export const StoreUnstructuredRequestSchema = z.object({
  file_content: z.string(),
  mime_type: z.string().min(1),
  idempotency_key: z.string().min(1).optional(),
  original_filename: z.string().optional(),
  user_id: z.string().optional(),
});

export const StoreRequestSchema = z
  .object({
    user_id: z.string().optional(),
    entities: z.array(z.record(z.unknown())).optional(),
    relationships: z
      .array(StoreRelationshipInputSchema)
      .optional(),
    source_priority: z.number().optional().default(100),
    observation_source: ObservationSourceSchema.optional(),
    idempotency_key: z.string().min(1).optional(),
    file_idempotency_key: z.string().min(1).optional(),
    file_content: z.string().optional(),
    file_path: z.string().optional(),
    mime_type: z.string().min(1).optional(),
    original_filename: z.string().optional(),
    /** Plan/dry-run: resolve and report action per observation, skip inserts. */
    commit: z.boolean().optional().default(true),
    /** Refuse merges that resolve to an existing entity without a deterministic rule. */
    strict: z.boolean().optional().default(false),
  })
  .refine(
    (data) => {
      const hasEntities = Boolean(data.entities && data.entities.length > 0);
      const hasFileContent = Boolean(data.file_content && data.mime_type);
      const hasFilePath = Boolean(data.file_path);
      return hasEntities || hasFileContent || hasFilePath;
    },
    {
      message: "Must provide either entities, file_path, or file_content with mime_type",
    }
  );

export const MergeEntitiesRequestSchema = z.object({
  from_entity_id: z.string(),
  to_entity_id: z.string(),
  merge_reason: z.string().optional(),
  user_id: z.string().optional(),
});

/**
 * R5: declarative predicate for `split_entity`. Schema-agnostic — every
 * form reads a column every observation row carries (entity_id,
 * observed_at, source_id, fields blob). See
 * `src/services/entity_split.ts#SplitPredicate`.
 */
export const SplitPredicateSchema = z
  .object({
    observed_at_gte: z.string().optional(),
    source_id_in: z.array(z.string()).optional(),
    observation_field_equals: z
      .object({
        field: z.string().min(1),
        value: z.string().optional(),
        value_starts_with: z.string().optional(),
      })
      .refine(
        (v) => v.value !== undefined || v.value_starts_with !== undefined,
        {
          message:
            "observation_field_equals requires either `value` or `value_starts_with`",
        },
      )
      .optional(),
  })
  .refine(
    (v) =>
      v.observed_at_gte !== undefined ||
      (v.source_id_in !== undefined && v.source_id_in.length > 0) ||
      v.observation_field_equals !== undefined,
    {
      message:
        "Split predicate must declare at least one of observed_at_gte, source_id_in, observation_field_equals",
    },
  );

export const SplitEntityRequestSchema = z.object({
  source_entity_id: z.string().min(1),
  predicate: SplitPredicateSchema,
  new_entity: z.object({
    entity_type: z.string().min(1),
    canonical_name: z.string().min(1),
    target_entity_id: z.string().optional(),
  }),
  idempotency_key: z.string().min(1),
  reason: z.string().optional(),
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

export const ListEntityTypesRequestSchema = z.object({
  keyword: z.string().optional(),
  summary: z.boolean().optional().default(false),
});

export const RetrieveEntityByIdentifierSchema = z.object({
  identifier: z.string(),
  entity_type: z.string().optional(),
  user_id: z.string().optional(),
  by: z.string().optional(),
  limit: z.number().int().positive().optional(),
  include_observations: z.boolean().optional().default(false),
  observations_limit: z.number().int().positive().max(200).optional().default(20),
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
  user_id: z.string().optional(),
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

export const UpdateSchemaIncrementalRequestSchema = z
  .object({
    entity_type: z.string(),
    fields_to_add: z
      .array(
        z.object({
          field_name: z.string(),
          field_type: z.enum(["string", "number", "date", "boolean", "array", "object"]),
          required: z.boolean().default(false),
          reducer_strategy: z
            .enum(["last_write", "highest_priority", "most_specific", "merge_array"])
            .optional(),
        })
      )
      .optional(),
    fields_to_remove: z.array(z.string()).optional(),
    schema_version: z.string().optional(),
    user_specific: z.boolean().default(false),
    user_id: z.string().optional(),
    activate: z.boolean().default(true),
    migrate_existing: z.boolean().default(false),
    force: z.boolean().default(false),
  })
  .refine(
    (data) =>
      (data.fields_to_add && data.fields_to_add.length > 0) ||
      (data.fields_to_remove && data.fields_to_remove.length > 0),
    { message: "At least one of fields_to_add or fields_to_remove must be provided and non-empty" }
  );

export const RegisterSchemaRequestSchema = z.object({
  entity_type: z.string(),
  schema_definition: z.record(z.unknown()),
  reducer_config: z.record(z.unknown()),
  schema_version: z.string().default("1.0"),
  user_specific: z.boolean().default(false),
  user_id: z.string().optional(),
  activate: z.boolean().default(false),
  force: z.boolean().default(false),
});
