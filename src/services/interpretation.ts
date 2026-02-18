// FU-121: Interpretation Service
// Schema validation, entity resolution, and unknown field routing
// Implements idempotence pattern: canonicalization, hash-based IDs, deduplication

import { supabase } from "../db.js";
import { schemaRegistry, type SchemaDefinition, type SchemaRegistryEntry } from "./schema_registry.js";
import { resolveEntity } from "./entity_resolution.js";
import {
  getSchemaDefinition,
  getRegisteredEntityTypes,
  resolveEntityTypeFromAlias,
  refineEntityTypeFromExtractedFields,
} from "./schema_definitions.js";
import { inferCanonicalEntityType, isLLMExtractionAvailable } from "./llm_extraction.js";
import { observationReducer } from "../reducers/observation_reducer.js";
import { randomUUID } from "crypto";
import { canonicalizeFields, hashCanonicalFields } from "./field_canonicalization.js";
import { 
  generateObservationId, 
  computeCanonicalHash, 
  checkObservationExistsByHash 
} from "./observation_identity.js";
import { validateFieldsWithConverters } from "./field_validation.js";
import {
  prepareEntitySnapshotWithEmbedding,
  getEntitySnapshotUpsertPayload,
} from "./entity_snapshot_embedding.js";
import { logger } from "../utils/logger.js";


export interface InterpretationConfig {
  provider: string;
  model_id: string;
  temperature: number;
  prompt_hash: string;
  code_version: string;
  feature_flags?: Record<string, boolean>;
  /** When true (default), create a user-scoped schema from extracted fields when entity type is unknown. */
  create_schema_for_unknown?: boolean;
  /** When true, use LLM to infer canonical entity type when no schema alias matches (e.g. localized types). */
  infer_entity_type_from_llm?: boolean;
}

export interface InterpretationOptions {
  userId: string;
  sourceId: string;
  extractedData: Record<string, unknown>[];
  config: InterpretationConfig;
}

export interface InterpretationResult {
  interpretationId: string;
  observationsCreated: number;
  unknownFieldsCount: number;
  observationsDeduplicated?: number; // Count of observations that already existed
  fixedPointReached?: boolean; // Whether fixed-point convergence was achieved
  convergenceIterations?: number; // Number of iterations to reach convergence
  entities: Array<{
    entityId: string;
    entityType: string;
    observationId: string;
  }>;
  /** Debug: per-entity type refinement (extracted keys, type before/after) for store responses */
  refinement_debug?: Array<{ extracted_keys: string[]; type_before: string; type_after: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _ValidatedField {
  field: string;
  value: unknown;
  valid: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _EntityData {
  entityType: string;
  fields: Record<string, unknown>;
  observedAt: Date;
  sourcePriority: number;
}

/**
 * Validate extracted data against schema definition with converter support
 * Returns: { validFields, unknownFields, originalValues }
 */
function validateAgainstSchema(
  data: Record<string, unknown>,
  schema: SchemaDefinition
): {
  validFields: Record<string, unknown>;
  unknownFields: Record<string, unknown>;
  originalValues: Record<string, unknown>;
} {
  // Use converter-aware validation
  return validateFieldsWithConverters(data, schema.fields);
}

/**
 * Run interpretation on extracted data
 * Creates interpretation run, validates fields, resolves entities, creates observations
 */
export async function runInterpretation(
  options: InterpretationOptions
): Promise<InterpretationResult> {
  const { userId, sourceId, extractedData, config } = options;

  // Create interpretation
  const { data: run, error: runError } = await supabase
    .from("interpretations")
    .insert({
      user_id: userId,
      source_id: sourceId,
      interpretation_config: config,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) {
    throw new Error(`Failed to create interpretation run: ${runError.message}`);
  }

  const interpretationId = run.id;
  let observationsCreated = 0;
  let unknownFieldsCount = 0;
  const entities: Array<{
    entityId: string;
    entityType: string;
    observationId: string;
  }> = [];
  const refinementDebug: Array<{ extracted_keys: string[]; type_before: string; type_after: string }> = [];

  try {
    // Build refinement candidates: DB schemas (user + global) + code-only types so dynamic schemas participate
    const dbSchemas = await schemaRegistry.listActiveSchemas(userId).catch(() => []);
    const dbTypes = new Set(dbSchemas.map((e) => e.entity_type));
    const refinementCandidates = [
      ...dbSchemas.map((e) => ({ entity_type: e.entity_type, schema_definition: e.schema_definition })),
      ...getRegisteredEntityTypes()
        .filter((t) => !dbTypes.has(t))
        .map((t) => getSchemaDefinition(t))
        .filter(Boolean)
        .map((s) => ({ entity_type: s!.entity_type, schema_definition: s!.schema_definition })),
    ];

    // Process each extracted entity
    for (const entityData of extractedData) {
      // Support both 'entity_type' and 'type' fields for entity type identification
      let entityType = (entityData.entity_type as string) ||
                      (entityData.type as string) ||
                      "generic";
      // Resolve to canonical type via schema-defined aliases (no hardcoded map)
      let resolvedType = resolveEntityTypeFromAlias(entityType);
      if (!resolvedType && config.infer_entity_type_from_llm && isLLMExtractionAvailable()) {
        const canonicalTypes = getRegisteredEntityTypes();
        resolvedType = await inferCanonicalEntityType(entityType, canonicalTypes, config.model_id);
      }
      if (resolvedType) entityType = resolvedType;
      // Refine type by field fit (considers dynamic + code schemas when another schema fits better)
      const extractedFieldKeys = Object.keys(entityData).filter(
        (k) => k !== "entity_type" && k !== "type"
      );
      const typeBeforeRefinement = entityType;
      entityType = refineEntityTypeFromExtractedFields(entityType, extractedFieldKeys, refinementCandidates);
      refinementDebug.push({
        extracted_keys: extractedFieldKeys,
        type_before: typeBeforeRefinement,
        type_after: entityType,
      });
      logger.info(
        "[Interpretation] type refinement: extracted_keys=%s type_before=%s type_after=%s",
        JSON.stringify(extractedFieldKeys),
        typeBeforeRefinement,
        entityType,
        typeBeforeRefinement !== entityType ? { refined: `${typeBeforeRefinement} → ${entityType}` } : {}
      );
      let currentEntityData = entityData;

      // Load active entity schema (user-scoped first, then global) from database
      // NOTE: Schemas should be initialized in the database via `npm run schema:init`
      let schema: SchemaRegistryEntry | null = await schemaRegistry.loadActiveSchema(entityType, userId);

      // Fallback to code-defined entity schemas if database schema not found
      if (!schema) {
        if (process.env.NODE_ENV === "development" || process.env.NEOTOMA_ENV === "development") {
          console.warn(
            `[Schema Fallback] No database entity schema found for entity type "${entityType}". ` +
            `Using code fallback. Run 'npm run schema:init' to register schemas in the database.`
          );
        }

        const codeSchema = getSchemaDefinition(entityType);

        if (codeSchema && codeSchema.entity_type && codeSchema.schema_definition && codeSchema.reducer_config) {
          schema = {
            id: "",
            entity_type: codeSchema.entity_type,
            schema_version: codeSchema.schema_version || "1.0",
            schema_definition: codeSchema.schema_definition,
            reducer_config: codeSchema.reducer_config,
            active: true,
            created_at: new Date().toISOString(),
          };
        }
      }

      // When no known schema: optionally create a user-scoped schema from extracted fields
      if (!schema && config.create_schema_for_unknown !== false) {
        schema = await schemaRegistry.ensureSchemaForExtractedEntity(
          entityType,
          entityData,
          userId,
          { create_if_missing: true }
        );
        if (schema) {
          entityType = schema.entity_type;
          currentEntityData = { ...entityData, entity_type: entityType };
        }
      }

      if (!schema) {
        // No schema found - route all fields to raw_fragments (helps debug: log extracted type)
        logger.warn(
          `[Interpretation] No schema for entity_type "${entityType}" (resolved from extracted data); routing to raw_fragments. ` +
            `Run schema:init or add alias for this type.`
        );
        const fragmentId = randomUUID();
        await supabase.from("raw_fragments").insert({
          id: fragmentId,
          source_id: sourceId,
          interpretation_id: interpretationId,
          user_id: userId,
          entity_type: entityType,
          fragment_key: "full_entity",
          fragment_value: currentEntityData,
          fragment_envelope: {
            reason: "no_schema",
            entity_type: entityType,
          },
        });
        unknownFieldsCount += Object.keys(currentEntityData).length;
        continue;
      }

      // Exclude entity_type and type from field validation (they're metadata, not schema fields)
      const fieldsToValidate = { ...currentEntityData };
      delete fieldsToValidate.entity_type;
      delete fieldsToValidate.type;

      // Validate fields against schema (with converter support)
      const { validFields, unknownFields, originalValues } = validateAgainstSchema(
        fieldsToValidate,
        schema.schema_definition
      );

      // Store original values in raw_fragments for converted fields (preserves zero data loss)
      for (const [key, value] of Object.entries(originalValues)) {
        // Skip null or undefined values (database constraint)
        if (value === null || value === undefined) {
          continue;
        }
        
        // Check if fragment already exists (for idempotence)
        const { data: existing } = await supabase
          .from("raw_fragments")
          .select("id, frequency_count")
          .eq("source_id", sourceId)
          .eq("fragment_key", key)
          .eq("user_id", userId)
          .maybeSingle();

        if (existing) {
          // Update existing fragment
          await supabase
            .from("raw_fragments")
            .update({
              fragment_value: value,
              fragment_envelope: {
                reason: "converted_value_original",
                entity_type: entityType,
                schema_version: schema.schema_version,
                converted_to: validFields[key],
              },
              frequency_count: (existing.frequency_count || 1) + 1,
              last_seen: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          // Insert new fragment
          const fragmentId = randomUUID();
          await supabase.from("raw_fragments").insert({
            id: fragmentId,
            source_id: sourceId,
            interpretation_id: interpretationId,
            user_id: userId,
            entity_type: entityType,
            fragment_key: key,
            fragment_value: value,
            fragment_envelope: {
              reason: "converted_value_original",
              entity_type: entityType,
              schema_version: schema.schema_version,
              converted_to: validFields[key],
            },
          });
        }
      }

      // Store unknown fields in raw_fragments (with idempotence)
      // Filter out null/undefined values before storing
      for (const [key, value] of Object.entries(unknownFields)) {
        // Skip null or undefined values (database constraint)
        if (value === null || value === undefined) {
          continue;
        }
        // Check if fragment already exists (for idempotence)
        const { data: existing } = await supabase
          .from("raw_fragments")
          .select("id, frequency_count")
          .eq("source_id", sourceId)
          .eq("fragment_key", key)
          .eq("user_id", userId)
          .maybeSingle();

        if (existing) {
          // Update existing fragment (increment frequency, update last_seen)
          await supabase
            .from("raw_fragments")
            .update({
              fragment_value: value,
              fragment_envelope: {
                reason: "unknown_field",
                entity_type: entityType,
                schema_version: schema.schema_version,
              },
              frequency_count: (existing.frequency_count || 1) + 1,
              last_seen: new Date().toISOString(),
            })
            .eq("id", existing.id);
          unknownFieldsCount++;
        } else {
          // Insert new fragment
          const fragmentId = randomUUID();
          const { error: insertError } = await supabase.from("raw_fragments").insert({
            id: fragmentId,
            source_id: sourceId,
            interpretation_id: interpretationId,
            user_id: userId,
            entity_type: entityType,
            fragment_key: key,
            fragment_value: value,
            fragment_envelope: {
              reason: "unknown_field",
              entity_type: entityType,
              schema_version: schema.schema_version,
            },
          });
          
          // Handle race condition (unique constraint violation)
          if (insertError?.code === "23505") {
            // Another process inserted it, retry as update
            const { data: retryExisting } = await supabase
              .from("raw_fragments")
              .select("id, frequency_count")
              .eq("source_id", sourceId)
              .eq("fragment_key", key)
              .eq("user_id", userId)
              .maybeSingle();
            
            if (retryExisting) {
              await supabase
                .from("raw_fragments")
                .update({
                  fragment_value: value,
                  fragment_envelope: {
                    reason: "unknown_field",
                    entity_type: entityType,
                    schema_version: schema.schema_version,
                  },
                  frequency_count: (retryExisting.frequency_count || 1) + 1,
                  last_seen: new Date().toISOString(),
                })
                .eq("id", retryExisting.id);
            }
          }
          unknownFieldsCount++;
        }
      }

      // Canonicalize valid fields for idempotence
      const canonicalFields = canonicalizeFields(validFields, schema.schema_definition);
      const canonicalHash = computeCanonicalHash(canonicalFields);

      // Resolve entity (user-scoped)
      const entityId = await resolveEntity({
        entityType,
        fields: canonicalFields,
        userId,
      });

      // Generate deterministic observation ID
      const observationId = generateObservationId(
        sourceId,
        interpretationId,
        entityId,
        canonicalFields
      );

      // Check for duplicate observation (idempotence check)
      const existingObservation = await checkObservationExistsByHash(
        sourceId,
        interpretationId,
        entityId,
        canonicalHash,
        userId
      );

      if (existingObservation) {
        // Observation already exists - don't create duplicate
        entities.push({
          entityId,
          entityType,
          observationId: existingObservation.id,
        });
        continue;
      }

      // Create observation with canonical fields and hash
      // Handle schema cache issues: if canonical_hash column not in cache, retry without it
      const observationData: Record<string, unknown> = {
        id: observationId,
        entity_id: entityId,
        entity_type: entityType,
        schema_version: schema.schema_version,
        source_id: sourceId,
        interpretation_id: interpretationId,
        observed_at: new Date().toISOString(),
        specificity_score: 0.5,
        source_priority: 0, // AI interpretation has priority 0
        fields: canonicalFields, // Store canonical fields, not raw
        canonical_hash: canonicalHash, // Store hash for deduplication
        user_id: userId,
      };

      let { error: obsError } = await supabase
        .from("observations")
        .insert(observationData);

      // If error is about canonical_hash not being in schema cache, retry without it
      if (obsError && (
        obsError.message?.includes("canonical_hash") || 
        obsError.code === "PGRST205" ||
        obsError.message?.includes("schema cache")
      )) {
        console.warn(
          `[WARN] canonical_hash column not in schema cache, inserting without it. ` +
          `Migration may need to be applied or schema cache refreshed.`
        );
        // Retry without canonical_hash
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { canonical_hash: _canonical_hash, ...observationDataWithoutHash } = observationData;
        ({ error: obsError } = await supabase
          .from("observations")
          .insert(observationDataWithoutHash));
      }

      if (obsError) {
        throw new Error(`Failed to create observation: ${obsError.message}`);
      }

      observationsCreated++;
      entities.push({
        entityId,
        entityType,
        observationId,
      });
    }

    // Compute snapshots for all entities
    for (const entity of entities) {
      try {
        // Get all observations for entity
        const { data: allObservations, error: fetchError } = await supabase
          .from("observations")
          .select("*")
          .eq("entity_id", entity.entityId)
          .order("observed_at", { ascending: false });

        if (fetchError) {
          console.error(
            `Failed to fetch observations for entity ${entity.entityId}:`,
            fetchError.message
          );
          continue;
        }

        if (allObservations && allObservations.length > 0) {
          // Compute snapshot
          const snapshot = await observationReducer.computeSnapshot(
            entity.entityId,
            allObservations as any
          );

          if (!snapshot) {
            console.error(
              `Failed to compute snapshot for entity ${entity.entityId}: computeSnapshot returned null`
            );
            continue;
          }

          const rowWithEmbedding = await prepareEntitySnapshotWithEmbedding({
            entity_id: snapshot.entity_id,
            entity_type: snapshot.entity_type,
            schema_version: snapshot.schema_version,
            snapshot: snapshot.snapshot,
            computed_at: snapshot.computed_at,
            observation_count: snapshot.observation_count,
            last_observation_at: snapshot.last_observation_at,
            provenance: snapshot.provenance,
            user_id: snapshot.user_id,
          });
          const toUpsert = getEntitySnapshotUpsertPayload(rowWithEmbedding);

          await supabase.from("entity_snapshots").upsert(
            toUpsert as Record<string, unknown>,
            {
              onConflict: "entity_id",
            }
          );
        }
      } catch (error) {
        console.error(
          `Failed to compute snapshot for entity ${entity.entityId}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue with other entities
      }
    }

    // Mark interpretation as completed
    await supabase
      .from("interpretations")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        observations_created: observationsCreated,
        unknown_fields_count: unknownFieldsCount,
      })
      .eq("id", interpretationId);

    return {
      interpretationId,
      observationsCreated,
      unknownFieldsCount,
      entities,
      refinement_debug: refinementDebug.length > 0 ? refinementDebug : undefined,
    };
  } catch (error) {
    // Mark interpretation as failed
    await supabase
      .from("interpretations")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq("id", interpretationId);

    throw error;
  }
}

/**
 * Run interpretation with fixed-point guarantee
 * Retries interpretation until canonical hash stabilizes
 * 
 * Per idempotence directive:
 * - Accept output only when canonical hash stabilizes
 * - hash(n) == hash(n-1) means convergence
 * - Idempotence achieved post-generation
 */
export async function runInterpretationWithFixedPoint(
  options: InterpretationOptions,
  maxIterations: number = 5
): Promise<InterpretationResult> {
  let lastHash: string | null = null;
  let iteration = 0;
  let result: InterpretationResult | null = null;
  
  while (iteration < maxIterations) {
    // Run interpretation
    result = await runInterpretation(options);
    
    // Compute hash of all canonical fields from result
    let allCanonicalFields: Record<string, unknown> = {};
    
    for (const entity of result.entities) {
      // Get observation to access canonical fields
      const { data: observation } = await supabase
        .from("observations")
        .select("fields, canonical_hash")
        .eq("id", entity.observationId)
        .single();
      
      if (observation?.fields) {
        allCanonicalFields = { ...allCanonicalFields, ...observation.fields };
      }
    }
    
    const currentHash = hashCanonicalFields(allCanonicalFields);
    
    // Check for fixed point
    if (lastHash === currentHash) {
      // Fixed point reached - same canonical output as previous iteration
      return {
        ...result,
        fixedPointReached: true,
        convergenceIterations: iteration + 1,
      };
    }
    
    lastHash = currentHash;
    iteration++;
  }
  
  // Fallback: return last result even if not converged
  // Log warning but don't fail (graceful degradation)
  console.warn(
    `Fixed-point convergence not reached after ${maxIterations} iterations for source ${options.sourceId}`
  );
  
  return {
    ...result!,
    fixedPointReached: false,
    convergenceIterations: maxIterations,
  };
}

/**
 * Check interpretation quota (simple hard-coded limit for v0.2.0)
 */
export async function checkInterpretationQuota(
  userId: string,
  limit: number = 100
): Promise<{ allowed: boolean; current: number; limit: number }> {
  // Count interpretation runs in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count, error } = await supabase
    .from("interpretations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (error) {
    console.warn(`Failed to check quota: ${error.message}`);
    // Allow on error (fail open)
    return { allowed: true, current: 0, limit };
  }

  const current = count || 0;
  return {
    allowed: current < limit,
    current,
    limit,
  };
}

/**
 * Create relationship observations from relationship data
 */
export async function createRelationshipObservations(
  relationships: Array<{
    relationship_type: string;
    source_entity_id: string;
    target_entity_id: string;
    metadata?: Record<string, unknown>;
  }>,
  sourceId: string,
  interpretationId: string | null,
  userId: string,
  sourcePriority: number = 0,
): Promise<number> {
  const { relationshipReducer } = await import("../reducers/relationship_reducer.js");
  const { createHash } = await import("crypto");
  
  // Get relationship schema for canonicalization
  const relationshipSchema = getSchemaDefinition("relationship");
  if (!relationshipSchema) {
    throw new Error("Relationship schema not found");
  }
  
  let relationshipsCreated = 0;
  const uniqueRelationshipKeys = new Set<string>();

  for (const rel of relationships) {
    try {
      // Generate relationship key
      const relationshipKey = `${rel.relationship_type}:${rel.source_entity_id}:${rel.target_entity_id}`;
      
      // Canonicalize metadata
      const canonicalMetadata = canonicalizeFields(rel.metadata || {}, relationshipSchema.schema_definition);
      const canonicalHash = hashCanonicalFields(canonicalMetadata);

      // Generate deterministic observation ID (UUID format)
      const hash = createHash("sha256")
        .update(
          JSON.stringify({
            source_id: sourceId,
            interpretation_id: interpretationId,
            relationship_key: relationshipKey,
            canonical_hash: canonicalHash,
          }),
        )
        .digest("hex");
      
      // Convert hash to UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const observationId = [
        hash.substring(0, 8),
        hash.substring(8, 12),
        hash.substring(12, 16),
        hash.substring(16, 20),
        hash.substring(20, 32),
      ].join("-");

      // Check for duplicate observation (idempotence)
      const { data: existingObs } = await supabase
        .from("relationship_observations")
        .select("id")
        .eq("source_id", sourceId)
        .eq("relationship_key", relationshipKey)
        .eq("canonical_hash", canonicalHash)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingObs) {
        // Observation already exists - skip
        uniqueRelationshipKeys.add(relationshipKey);
        continue;
      }

      // Create relationship observation
      // Handle schema cache issues: if canonical_hash column not in cache, retry without it
      const relationshipObsData: Record<string, unknown> = {
        id: observationId,
        relationship_key: relationshipKey,
        relationship_type: rel.relationship_type,
        source_entity_id: rel.source_entity_id,
        target_entity_id: rel.target_entity_id,
        source_id: sourceId,
        interpretation_id: interpretationId,
        observed_at: new Date().toISOString(),
        specificity_score: 0.8,
        source_priority: sourcePriority,
        metadata: canonicalMetadata,
        canonical_hash: canonicalHash,
        user_id: userId,
      };

      let { error: obsError } = await supabase
        .from("relationship_observations")
        .insert(relationshipObsData);

      // If error is about canonical_hash not being in schema cache, retry without it
      if (obsError && (
        obsError.message?.includes("canonical_hash") || 
        obsError.code === "PGRST205" ||
        obsError.message?.includes("schema cache")
      )) {
        console.warn(
          `[WARN] canonical_hash column not in schema cache for relationship_observations, inserting without it. ` +
          `Migration may need to be applied or schema cache refreshed.`
        );
        // Retry without canonical_hash
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { canonical_hash: _canonical_hash, ...relationshipObsDataWithoutHash } = relationshipObsData;
        ({ error: obsError } = await supabase
          .from("relationship_observations")
          .insert(relationshipObsDataWithoutHash));
      }

      if (obsError) {
        const rawDetails =
          typeof obsError === "object" && obsError && "details" in obsError
            ? (obsError as { details?: string | Record<string, unknown> }).details
            : undefined;
        const detailsStr =
          rawDetails != null
            ? typeof rawDetails === "string"
              ? rawDetails
              : JSON.stringify(rawDetails)
            : "";
        const errMsg = detailsStr
          ? `${obsError.message} (${detailsStr})`
          : obsError.message;
        const fullMsg = `Failed to create relationship observation for ${relationshipKey}: ${errMsg}`;
        console.error(fullMsg);
        throw new Error(fullMsg);
      }

      relationshipsCreated++;
      uniqueRelationshipKeys.add(relationshipKey);
    } catch (error) {
      console.error(
        `Failed to process relationship observation:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // Compute snapshots for all unique relationships
  for (const relationshipKey of uniqueRelationshipKeys) {
    try {
      // Get all observations for this relationship
      const { data: allObservations, error: fetchError } = await supabase
        .from("relationship_observations")
        .select("*")
        .eq("relationship_key", relationshipKey)
        .eq("user_id", userId)
        .order("observed_at", { ascending: false });

      if (fetchError) {
        console.error(
          `Failed to fetch observations for relationship ${relationshipKey}:`,
          fetchError.message,
        );
        continue;
      }

      if (allObservations && allObservations.length > 0) {
        // Compute snapshot
        const snapshot = await relationshipReducer.computeSnapshot(
          relationshipKey,
          allObservations as any,
        );

        // Save snapshot
        await supabase.from("relationship_snapshots").upsert(
          {
            relationship_key: snapshot.relationship_key,
            relationship_type: snapshot.relationship_type,
            source_entity_id: snapshot.source_entity_id,
            target_entity_id: snapshot.target_entity_id,
            schema_version: snapshot.schema_version,
            snapshot: snapshot.snapshot,
            computed_at: snapshot.computed_at,
            observation_count: snapshot.observation_count,
            last_observation_at: snapshot.last_observation_at,
            provenance: snapshot.provenance,
            user_id: snapshot.user_id,
          },
          {
            onConflict: "relationship_key",
          },
        );
      }
    } catch (error) {
      console.error(
        `Failed to compute snapshot for relationship ${relationshipKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return relationshipsCreated;
}