/**
 * Schema Recommendation Service
 *
 * Analyzes raw_fragments to identify fields that should be promoted to schema fields.
 * Supports auto-enhancement for high-confidence fields and manual recommendations.
 */

import { supabase } from "../db.js";
import { SchemaRegistryService, SchemaDefinition } from "./schema_registry.js";
import { logger } from "../utils/logger.js";

export interface FieldRecommendation {
  field_name: string;
  field_type: "string" | "number" | "date" | "boolean" | "array" | "object";
  required?: boolean;
  frequency: number;
  sample_values: unknown[];
  confidence: number; // 0-1
  type_consistency: number; // 0-1, how consistent the type is across samples
  source_diversity?: number; // Number of unique sources
  naming_pattern_match?: boolean;
  format_consistency?: number;
}

export interface SchemaRecommendation {
  entity_type: string;
  fields: FieldRecommendation[];
  source: "raw_fragments" | "agent" | "inference";
  confidence_score: number;
  reasoning?: string;
  affected_entities_count?: number;
}

export interface AutoEnhancementConfig {
  enabled: boolean; // Master switch for auto-enhancement
  threshold: 1 | 2 | 3 | "pattern"; // Occurrences before auto-enhance (or 'pattern' for pattern detection only)
  min_confidence: number; // 0-1, minimum confidence for auto-enhance
  auto_enhance_high_confidence: boolean; // Auto-enhance high-confidence fields
  user_specific_aggressive: boolean; // More aggressive for user-specific schemas
  global_conservative: boolean; // More conservative for global schemas
}

// Default configuration (recommended)
export const DEFAULT_AUTO_ENHANCEMENT_CONFIG: AutoEnhancementConfig = {
  enabled: true, // Enable by default
  threshold: 3, // After 3 occurrences (filters one-offs, still fast)
  min_confidence: 0.85, // 85% confidence minimum (balances speed and quality)
  auto_enhance_high_confidence: true, // Auto-enhance high-confidence fields
  user_specific_aggressive: true, // More aggressive for user-specific schemas (user's own data)
  global_conservative: true, // Conservative for global schemas (affects all users)
};

export class SchemaRecommendationService {
  private schemaRegistry: SchemaRegistryService;

  constructor() {
    this.schemaRegistry = new SchemaRegistryService();
  }

  /**
   * Check if a field is eligible for auto-enhancement based on confidence criteria
   */
  async checkAutoEnhancementEligibility(options: {
    entity_type: string;
    fragment_key: string;
    user_id?: string;
    config?: AutoEnhancementConfig;
  }): Promise<{
    eligible: boolean;
    confidence: number;
    inferred_type?:
      | "string"
      | "number"
      | "date"
      | "boolean"
      | "array"
      | "object";
    reasoning?: string;
  }> {
    const config = options.config || DEFAULT_AUTO_ENHANCEMENT_CONFIG;

    // 1. Check blacklist first
    const isBlacklisted = await this.checkBlacklist(
      options.entity_type,
      options.fragment_key,
      options.user_id,
    );
    if (isBlacklisted) {
      return {
        eligible: false,
        confidence: 0,
        reasoning: "Field is blacklisted",
      };
    }

    // 2. Validate field name
    if (!this.isValidFieldName(options.fragment_key)) {
      return {
        eligible: false,
        confidence: 0,
        reasoning: "Invalid field name pattern",
      };
    }

    // 3. Query raw_fragments for this field
    // Include both record_id (for CSV/record-based) and source_id for diversity checks
    // Note: fragment_type stores entity_type for structured data (parquet files)
    let fragmentsQuery = supabase
      .from("raw_fragments")
      .select("fragment_value, frequency_count, source_id, record_id, fragment_type")
      .eq("fragment_type", options.entity_type) // fragment_type stores entity_type for structured data
      .eq("fragment_key", options.fragment_key);
    
    // Handle user_id properly: check both the provided user_id and the default UUID
    // Also handle null (for global schemas)
    const defaultUserId = "00000000-0000-0000-0000-000000000000";
    if (options.user_id) {
      if (options.user_id === defaultUserId) {
        // Check both default UUID and null (legacy data might use null)
        fragmentsQuery = fragmentsQuery.or(`user_id.eq.${defaultUserId},user_id.is.null`);
      } else {
        fragmentsQuery = fragmentsQuery.eq("user_id", options.user_id);
      }
    } else {
      // No user_id provided - check both null and default UUID
      fragmentsQuery = fragmentsQuery.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
    }
    
    const { data: fragments, error } = await fragmentsQuery;

    if (error || !fragments || fragments.length === 0) {
      return {
        eligible: false,
        confidence: 0,
        reasoning: "No fragments found for this field",
      };
    }

    // Sum frequency counts
    const totalFrequency = fragments.reduce(
      (sum, f) => sum + (f.frequency_count || 1),
      0,
    );

    // Check threshold
    if (
      config.threshold !== "pattern" &&
      totalFrequency < (config.threshold as number)
    ) {
      return {
        eligible: false,
        confidence: 0,
        reasoning: `Frequency ${totalFrequency} below threshold ${config.threshold}`,
      };
    }

    // 4. Calculate confidence
    const confidenceResult = await this.calculateFieldConfidence({
      fragment_key: options.fragment_key,
      entity_type: options.entity_type,
      user_id: options.user_id,
    });

    // 5. Check minimum confidence
    if (confidenceResult.confidence < config.min_confidence) {
      return {
        eligible: false,
        confidence: confidenceResult.confidence,
        reasoning: `Confidence ${confidenceResult.confidence.toFixed(2)} below minimum ${config.min_confidence}`,
      };
    }

    // 6. Check source diversity (2+ different sources) OR row diversity (2+ different rows/observations)
    // This allows structured files (parquet, CSV, JSON arrays) with multiple rows to trigger enhancement
    // while still requiring multiple sources for single-row file types
    
    const uniqueSources = new Set(fragments.map((f) => f.source_id)).size;
    
    // For row diversity: check record_id (CSV/records) OR count observations per source (parquet/structured)
    // Parquet files have record_id = null, so we need to count observations instead
    const uniqueRows = new Set(fragments.map((f) => f.record_id).filter(id => id != null)).size;
    
    // For sources with record_id = null (parquet/structured), count unique observations
    // Each observation represents a row in the structured file
    let uniqueObservations = 0;
    if (uniqueRows === 0 && uniqueSources === 1) {
      // This is likely a parquet/structured file - count observations for this field
      const sourceId = fragments[0]?.source_id;
      if (sourceId) {
        // Build query with proper null handling for user_id
        // Note: Queue items convert default UUID to null, but observations may have default UUID
        // So we need to check both null and default UUID
        let obsQuery = supabase
          .from("observations")
          .select("id", { count: "exact", head: true })
          .eq("source_id", sourceId)
          .eq("entity_type", options.entity_type);
        
        // Handle user_id properly: check both default UUID and null
        const defaultUserId = "00000000-0000-0000-0000-000000000000";
        if (options.user_id) {
          if (options.user_id === defaultUserId) {
            // Check both default UUID and null (observations might have either)
            obsQuery = obsQuery.or(`user_id.eq.${defaultUserId},user_id.is.null`);
          } else {
            obsQuery = obsQuery.eq("user_id", options.user_id);
          }
        } else {
          // No user_id provided - check both null and default UUID
          obsQuery = obsQuery.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
        }
        
        const { count } = await obsQuery;
        uniqueObservations = count || 0;
      }
    }
    
    // Require EITHER 2+ sources OR 2+ rows/observations
    // This enables auto-enhancement for structured files (parquet, CSV) while preserving
    // source diversity requirement for single-row file types
    const hasDiversity = uniqueSources >= 2 || uniqueRows >= 2 || uniqueObservations >= 2;
    
    if (!hasDiversity) {
      return {
        eligible: false,
        confidence: confidenceResult.confidence,
        reasoning: uniqueSources < 2 && uniqueRows < 2 && uniqueObservations < 2
          ? "Field appears in only one source and one row/observation (no diversity)"
          : uniqueSources < 2
          ? "Field appears in only one source (no diversity)"
          : "Field appears in only one row/observation (no diversity)",
      };
    }

    // Eligible for auto-enhancement!
    const diversityInfo = uniqueSources >= 2 
      ? `${uniqueSources} sources`
      : uniqueRows >= 2
      ? `${uniqueRows} rows`
      : `${uniqueObservations} observations`;
    return {
      eligible: true,
      confidence: confidenceResult.confidence,
      inferred_type: confidenceResult.inferred_type,
      reasoning: `High confidence (${confidenceResult.confidence.toFixed(2)}) with ${diversityInfo}`,
    };
  }

  /**
   * Automatically enhance schema for high-confidence fields
   * Includes race condition handling for concurrent enhancements
   */
  async autoEnhanceSchema(options: {
    entity_type: string;
    field_name: string;
    field_type: "string" | "number" | "date" | "boolean" | "array" | "object";
    user_id?: string;
    user_specific?: boolean;
  }): Promise<any> {
    // Generate idempotency key to prevent duplicate enhancements
    const idempotencyKey = `auto_enhance_${options.entity_type}_${options.field_name}_${options.user_id || "global"}`;

    // Check if already enhanced (idempotent check)
    const { data: existing } = await supabase
      .from("schema_recommendations")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existing && ["applied", "auto_applied"].includes(existing.status)) {
      logger.error(
        `[AUTO_ENHANCE] Field ${options.field_name} already enhanced for ${options.entity_type}`,
      );
      return existing;
    }

    // Check if field already exists in schema
    const currentSchema = await this.schemaRegistry.loadActiveSchema(
      options.entity_type,
    );
    if (
      currentSchema &&
      currentSchema.schema_definition.fields[options.field_name]
    ) {
      logger.error(
        `[AUTO_ENHANCE] Field ${options.field_name} already exists in schema for ${options.entity_type}`,
      );
      return currentSchema;
    }

    try {
      // Handle default user ID: convert to null for foreign key constraint
      // The default UUID '00000000-0000-0000-0000-000000000000' doesn't exist in auth.users
      // So we use NULL instead, which the unique index handles via COALESCE
      const defaultUserId = "00000000-0000-0000-0000-000000000000";
      const userId = options.user_id && options.user_id !== defaultUserId 
        ? options.user_id 
        : null;

      // Create recommendation record
      const { data: recommendation, error: recError } = await supabase
        .from("schema_recommendations")
        .insert({
          entity_type: options.entity_type,
          user_id: userId,
          source: "raw_fragments",
          recommendation_type: "add_fields",
          fields_to_add: [
            {
              field_name: options.field_name,
              field_type: options.field_type,
              required: false,
            },
          ],
          confidence_score: 0.9, // High confidence for auto-enhancement
          status: "auto_applied",
          applied_at: new Date().toISOString(),
          idempotency_key: idempotencyKey,
          can_rollback: true,
        })
        .select()
        .single();

      if (recError) {
        // Check if it's a unique constraint violation (already exists)
        if (recError.code === "23505") {
          logger.error(
            `[AUTO_ENHANCE] Idempotency key collision - enhancement already in progress`,
          );
          return null;
        }
        throw recError;
      }

      logger.error(
        `[AUTO_ENHANCE] Auto-enhancing ${options.entity_type}.${options.field_name} with type ${options.field_type}`,
      );

      // Note: Actual schema update would be done via SchemaRegistryService.updateSchemaIncremental()
      // This would be called by the auto-enhancement processor, not here directly
      // to avoid blocking the storage operation

      return recommendation;
    } catch (error: any) {
      logger.error(
        `[AUTO_ENHANCE] Failed to auto-enhance schema:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Calculate confidence score for a field based on samples
   * Enhanced with robust type inference logic
   */
  async calculateFieldConfidence(options: {
    fragment_key: string;
    entity_type: string;
    user_id?: string;
  }): Promise<{
    confidence: number; // 0-1
    type_consistency: number; // 0-1
    naming_pattern_match: boolean;
    format_consistency: number; // 0-1
    inferred_type?:
      | "string"
      | "number"
      | "date"
      | "boolean"
      | "array"
      | "object";
  }> {
    // Get all samples for this field
    // Note: For structured data (parquet), fragment_type stores entity_type
    // The raw_fragments table only has fragment_type, not entity_type
    let confidenceQuery = supabase
      .from("raw_fragments")
      .select("fragment_value, frequency_count")
      .eq("fragment_type", options.entity_type) // fragment_type stores entity_type for structured data
      .eq("fragment_key", options.fragment_key);
    
    // Handle user_id properly: check both the provided user_id and the default UUID
    const defaultUserId = "00000000-0000-0000-0000-000000000000";
    if (options.user_id) {
      if (options.user_id === defaultUserId) {
        // Check both default UUID and null (legacy data might use null)
        confidenceQuery = confidenceQuery.or(`user_id.eq.${defaultUserId},user_id.is.null`);
      } else {
        confidenceQuery = confidenceQuery.eq("user_id", options.user_id);
      }
    } else {
      // No user_id provided - check both null and default UUID
      confidenceQuery = confidenceQuery.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
    }
    
    const { data: fragments } = await confidenceQuery;

    if (!fragments || fragments.length === 0) {
      return {
        confidence: 0,
        type_consistency: 0,
        naming_pattern_match: false,
        format_consistency: 0,
      };
    }

    // Collect all sample values
    const samples = fragments.map((f) => f.fragment_value);

    // Multi-pass type detection
    const typeAnalysis = this.analyzeTypes(samples);

    // Check naming patterns
    const namingPatternMatch = this.checkNamingPattern(options.fragment_key);

    // Check format consistency for specific types
    const formatConsistency = this.checkFormatConsistency(
      samples,
      typeAnalysis.dominant_type,
    );

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence({
      type_consistency: typeAnalysis.consistency,
      naming_pattern_match: namingPatternMatch,
      format_consistency: formatConsistency,
      sample_count: samples.length,
    });

    return {
      confidence,
      type_consistency: typeAnalysis.consistency,
      naming_pattern_match: namingPatternMatch,
      format_consistency: formatConsistency,
      inferred_type: typeAnalysis.dominant_type,
    };
  }

  /**
   * Analyze raw_fragments to identify fields that should be promoted
   */
  async analyzeRawFragments(options: {
    entity_type?: string;
    user_id?: string;
    min_frequency?: number;
    min_confidence?: number;
  }): Promise<SchemaRecommendation[]> {
    const minFrequency = options.min_frequency || 5;
    const minConfidence = options.min_confidence || 0.8;

    // Query raw_fragments grouped by entity_type and fragment_key
    // Note: For structured data, fragment_type stores entity_type
    let query = supabase
      .from("raw_fragments")
      .select(
        "entity_type, fragment_type, fragment_key, fragment_value, frequency_count, user_id",
      );

    if (options.entity_type) {
      // Check both fragment_type (structured data) and entity_type (unstructured data)
      query = query.or(`fragment_type.eq.${options.entity_type},entity_type.eq.${options.entity_type}`);
    }
    
    // Handle user_id properly: check both the provided user_id and the default UUID
    // Also handle null (for global schemas)
    const defaultUserId = "00000000-0000-0000-0000-000000000000";
    if (options.user_id) {
      if (options.user_id === defaultUserId) {
        // Check both default UUID and null (legacy data might use null)
        query = query.or(`user_id.eq.${defaultUserId},user_id.is.null`);
      } else {
        query = query.eq("user_id", options.user_id);
      }
    } else {
      // No user_id provided - check both null and default UUID
      query = query.or(`user_id.is.null,user_id.eq.${defaultUserId}`);
    }

    const { data: fragments, error } = await query;

    if (error || !fragments) {
      return [];
    }

    // Group by entity_type and fragment_key
    // Note: For structured data, use fragment_type; for unstructured, use entity_type
    const grouped = new Map<
      string,
      Array<{ fragment_value: unknown; frequency_count: number }>
    >();
    for (const fragment of fragments) {
      // Use fragment_type for structured data (parquet), entity_type for unstructured
      const effectiveEntityType = fragment.fragment_type || fragment.entity_type;
      if (!effectiveEntityType) {
        // Skip fragments without entity type (shouldn't happen, but defensive)
        continue;
      }
      const key = `${effectiveEntityType}::${fragment.fragment_key}::${fragment.user_id || "global"}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push({
        fragment_value: fragment.fragment_value,
        frequency_count: fragment.frequency_count || 1,
      });
    }

    // Analyze each group
    const recommendations: SchemaRecommendation[] = [];

    for (const [key, samples] of grouped.entries()) {
      const [entity_type, fragment_key, user_id_str] = key.split("::");
      const user_id = user_id_str === "global" ? undefined : user_id_str;

      // Calculate total frequency
      const totalFrequency = samples.reduce(
        (sum, s) => sum + s.frequency_count,
        0,
      );
      if (totalFrequency < minFrequency) {
        continue;
      }

      // Calculate confidence
      const confidenceResult = await this.calculateFieldConfidence({
        fragment_key,
        entity_type,
        user_id,
      });

      if (confidenceResult.confidence < minConfidence) {
        continue;
      }

      // Create recommendation
      const fieldRec: FieldRecommendation = {
        field_name: fragment_key,
        field_type: confidenceResult.inferred_type || "string",
        required: false,
        frequency: totalFrequency,
        sample_values: samples
          .map((s) => s.fragment_value)
          .slice(0, 10), // Limit sample values
        confidence: confidenceResult.confidence,
        type_consistency: confidenceResult.type_consistency,
        naming_pattern_match: confidenceResult.naming_pattern_match,
        format_consistency: confidenceResult.format_consistency,
      };

      // Check if recommendation already exists for this entity type
      const existingRec = recommendations.find(
        (r) => r.entity_type === entity_type,
      );
      if (existingRec) {
        existingRec.fields.push(fieldRec);
        existingRec.confidence_score = Math.max(
          existingRec.confidence_score,
          confidenceResult.confidence,
        );
      } else {
        recommendations.push({
          entity_type,
          fields: [fieldRec],
          source: "raw_fragments",
          confidence_score: confidenceResult.confidence,
          reasoning: `Analyzed ${samples.length} fragments with ${totalFrequency} occurrences`,
          affected_entities_count: samples.length,
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate LLM-based recommendations (opt-in, non-deterministic)
   */
  async generateInferenceRecommendations(options: {
    entity_type: string;
    user_id?: string;
    raw_fragments_sample: Array<{
      fragment_key: string;
      fragment_value: unknown;
      frequency_count: number;
    }>;
  }): Promise<SchemaRecommendation> {
    // Prepare prompt for LLM
    const fragmentsSummary = options.raw_fragments_sample
      .map(
        (f) =>
          `- ${f.fragment_key}: appears ${f.frequency_count} times, sample value: ${JSON.stringify(f.fragment_value).slice(0, 100)}`,
      )
      .join("\n");

    const prompt = `Analyze these fields from raw data fragments for entity type "${options.entity_type}":

${fragmentsSummary}

Based on these fragments, recommend:
1. Field names (use snake_case)
2. Field types (string, number, date, boolean, array, object)
3. Whether each field should be required
4. Confidence level for each recommendation (0-1)

Return your recommendations in JSON format:
{
  "fields": [
    {
      "field_name": "...",
      "field_type": "...",
      "required": false,
      "confidence": 0.9,
      "reasoning": "..."
    }
  ],
  "overall_confidence": 0.85,
  "reasoning": "..."
}`;

    try {
      // Use OpenAI directly for LLM-based recommendations
      const OpenAI = (await import("openai")).default;
      const { config } = await import("../config.js");
      
      if (!config.openaiApiKey) {
        throw new Error("OpenAI API key not configured");
      }
      
      const openai = new OpenAI({ apiKey: config.openaiApiKey });

      // Call LLM with prompt
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3, // Lower temperature for more consistent results
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });
      
      const response = completion.choices[0]?.message?.content || "{}";

      // Parse JSON response
      const parsed = JSON.parse(response);

      // Convert to SchemaRecommendation format
      const fields: FieldRecommendation[] = parsed.fields.map((f: any) => ({
        field_name: f.field_name,
        field_type: f.field_type,
        required: f.required || false,
        frequency: options.raw_fragments_sample.find(
          (frag) => frag.fragment_key === f.field_name,
        )?.frequency_count || 0,
        sample_values: [
          options.raw_fragments_sample.find(
            (frag) => frag.fragment_key === f.field_name,
          )?.fragment_value,
        ],
        confidence: f.confidence,
        type_consistency: f.confidence, // Use confidence as type_consistency
      }));

      return {
        entity_type: options.entity_type,
        fields,
        source: "inference",
        confidence_score: parsed.overall_confidence,
        reasoning: parsed.reasoning,
      };
    } catch (error: any) {
      logger.error(
        `[SCHEMA_INFERENCE] Failed to generate LLM recommendations:`,
        error.message,
      );

      // Fallback to deterministic analysis if LLM fails
      logger.error(
        `[SCHEMA_INFERENCE] Falling back to deterministic analysis`,
      );

      const fields: FieldRecommendation[] = options.raw_fragments_sample.map(
        (f) => ({
          field_name: f.fragment_key,
          field_type: this.inferType(f.fragment_value) as any,
          required: false,
          frequency: f.frequency_count,
          sample_values: [f.fragment_value],
          confidence: 0.6, // Lower confidence for fallback
          type_consistency: 0.8,
        }),
      );

      return {
        entity_type: options.entity_type,
        fields,
        source: "inference",
        confidence_score: 0.6,
        reasoning: "LLM inference failed, using fallback deterministic analysis",
      };
    }
  }

  /**
   * Store recommendation from agent or inference
   */
  async storeRecommendation(recommendation: {
    entity_type: string;
    user_id?: string;
    source: "agent" | "inference";
    fields: FieldRecommendation[];
    confidence_score: number;
    reasoning?: string;
  }): Promise<string> {
    const { data, error } = await supabase
      .from("schema_recommendations")
      .insert({
        entity_type: recommendation.entity_type,
        user_id: recommendation.user_id || null,
        source: recommendation.source,
        recommendation_type: "add_fields",
        fields_to_add: recommendation.fields.map((f) => ({
          field_name: f.field_name,
          field_type: f.field_type,
          required: f.required || false,
        })),
        confidence_score: recommendation.confidence_score,
        reasoning: recommendation.reasoning,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to store recommendation: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Get pending recommendations for an entity type
   */
  async getRecommendations(options: {
    entity_type?: string;
    user_id?: string;
    source?: "raw_fragments" | "agent" | "inference";
    status?: "pending" | "approved" | "rejected";
  }): Promise<Array<SchemaRecommendation & { id: string; status: string }>> {
    let query = supabase.from("schema_recommendations").select("*");

    if (options.entity_type) {
      query = query.eq("entity_type", options.entity_type);
    }
    if (options.user_id !== undefined) {
      query = query.eq("user_id", options.user_id || null);
    }
    if (options.source) {
      query = query.eq("source", options.source);
    }
    if (options.status) {
      query = query.eq("status", options.status);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      throw new Error(`Failed to get recommendations: ${error.message}`);
    }

    return (
      data?.map((rec: any) => ({
        id: rec.id,
        entity_type: rec.entity_type,
        fields: rec.fields_to_add,
        source: rec.source,
        confidence_score: rec.confidence_score,
        reasoning: rec.reasoning,
        status: rec.status,
        affected_entities_count: rec.sample_count,
      })) || []
    );
  }

  /**
   * Queue auto-enhancement check for deferred processing
   */
  async queueAutoEnhancementCheck(options: {
    entity_type: string;
    fragment_key: string;
    user_id?: string;
    frequency_count?: number;
  }): Promise<void> {
    try {
      // Handle default user ID: convert to null for foreign key constraint
      // The default UUID '00000000-0000-0000-0000-000000000000' doesn't exist in auth.users
      // So we use NULL instead, which the unique index handles via COALESCE
      const defaultUserId = "00000000-0000-0000-0000-000000000000";
      const userId = options.user_id && options.user_id !== defaultUserId 
        ? options.user_id 
        : null;
      
      // Check if entry already exists
      let query = supabase
        .from("auto_enhancement_queue")
        .select("id, status, frequency_count")
        .eq("entity_type", options.entity_type)
        .eq("fragment_key", options.fragment_key);
      
      if (userId) {
        query = query.eq("user_id", userId);
      } else {
        query = query.is("user_id", null);
      }
      
      const { data: existing, error: checkError } = await query.maybeSingle();
      
      if (checkError && checkError.code !== "PGRST116") {
        // PGRST116 is "no rows" which is fine
        throw checkError;
      }
      
      if (existing) {
        // Update existing entry
        const { error: updateError } = await supabase
          .from("auto_enhancement_queue")
          .update({
            status: "pending", // Reset to pending if it was skipped/failed
            frequency_count: options.frequency_count || existing.frequency_count,
          })
          .eq("id", existing.id);
        
        if (updateError) {
          throw updateError;
        }
      } else {
        // Insert new entry
        const { error: insertError } = await supabase
          .from("auto_enhancement_queue")
          .insert({
            entity_type: options.entity_type,
            fragment_key: options.fragment_key,
            user_id: userId,
            status: "pending",
            frequency_count: options.frequency_count,
          });
        
        if (insertError) {
          throw insertError;
        }
      }
    } catch (error: any) {
      // Don't throw - queuing is best-effort
      logger.error(
        `[AUTO_ENHANCE] Failed to queue enhancement check:`,
        error.message,
      );
    }
  }

  // --- Private helper methods ---

  /**
   * Check if field matches blacklist patterns
   */
  private async checkBlacklist(
    entityType: string,
    fieldName: string,
    userId?: string,
  ): Promise<boolean> {
    const { data: blacklist } = await supabase
      .from("field_blacklist")
      .select("field_pattern")
      .or(
        `entity_type.is.null,entity_type.eq.${entityType}`,
      )
      .or(
        `user_id.is.null,user_id.eq.${userId || "00000000-0000-0000-0000-000000000000"}`,
      );

    if (!blacklist) return false;

    // Check if field name matches any blacklist pattern
    for (const entry of blacklist) {
      if (this.matchesPattern(fieldName, entry.field_pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if field name matches a wildcard pattern
   */
  private matchesPattern(fieldName: string, pattern: string): boolean {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
      .replace(/\*/g, ".*"); // Convert * to .*
    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(fieldName);
  }

  /**
   * Validate field name
   */
  private isValidFieldName(fieldName: string): boolean {
    // Reject suspicious patterns
    if (fieldName.startsWith("_") || fieldName.endsWith("_")) return false;
    if (fieldName.startsWith("__")) return false; // Double underscore
    if (fieldName.length > 50) return false;
    if (fieldName.length < 2) return false;
    if (/[^a-zA-Z0-9_]/.test(fieldName)) return false; // Only alphanumeric + underscore
    return true;
  }

  /**
   * Analyze types across samples (multi-pass type detection)
   * Null values are excluded from consistency calculation since they're expected for optional fields
   */
  private analyzeTypes(samples: unknown[]): {
    dominant_type:
      | "string"
      | "number"
      | "date"
      | "boolean"
      | "array"
      | "object";
    consistency: number;
  } {
    const typeCounts = new Map<string, number>();
    let nonNullCount = 0;

    for (const sample of samples) {
      const type = this.inferType(sample);
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      // Count non-null samples for consistency calculation
      if (type !== "null") {
        nonNullCount++;
      }
    }

    // Find dominant type (excluding null)
    let dominantType = "string";
    let maxCount = 0;
    for (const [type, count] of typeCounts.entries()) {
      if (type === "null") continue; // Skip null when finding dominant type
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    // Calculate consistency based on non-null samples only
    // If all samples are null, consistency is 0
    // Otherwise, consistency = (dominant type count) / (non-null sample count)
    const consistency = nonNullCount === 0 ? 0 : maxCount / nonNullCount;

    return {
      dominant_type: dominantType as any,
      consistency,
    };
  }

  /**
   * Infer type from a single value (multi-pass detection)
   */
  private inferType(
    value: unknown,
  ):
    | "string"
    | "number"
    | "date"
    | "boolean"
    | "array"
    | "object"
    | "null" {
    if (value === null || value === undefined) return "null";

    // Pass 1: Detect obvious types
    if (typeof value === "boolean") return "boolean";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    
    // Pass 1.5: Number analysis - detect timestamps (BigInt or large numbers that are likely dates)
    if (typeof value === "number") {
      // Check if it's a timestamp (reasonable date range)
      // Timestamps are typically:
      // - Unix timestamp in seconds: 1000000000 to 9999999999 (1970-2099)
      // - Unix timestamp in milliseconds: 1000000000000 to 9999999999999 (1970-2099)
      // - BigInt timestamps (nanoseconds): 1000000000000000 to 9999999999999999999
      if (value > 1000000000 && value < 9999999999999999999) {
        // Check if it's in a reasonable timestamp range
        // Convert to milliseconds if needed and check if it's a valid date
        let timestampMs = value;
        if (value < 1000000000000) {
          // Likely seconds, convert to milliseconds
          timestampMs = value * 1000;
        } else if (value > 9999999999999) {
          // Likely nanoseconds, convert to milliseconds
          timestampMs = value / 1000000;
        }
        
        // Check if it's a reasonable date (between 1970 and 2100)
        const date = new Date(timestampMs);
        if (!isNaN(date.getTime()) && date.getFullYear() >= 1970 && date.getFullYear() <= 2100) {
          return "date";
        }
      }
      return "number";
    }

    // Pass 2: String analysis - detect dates, emails, UUIDs
    if (typeof value === "string") {
      const str = value.trim();

      // ISO 8601 date detection
      if (this.isISODate(str)) return "date";

      // Email detection (basic)
      if (this.isEmail(str)) return "string"; // Keep as string for emails

      // UUID detection
      if (this.isUUID(str)) return "string"; // Keep as string for UUIDs

      // Boolean string detection
      if (this.isBooleanString(str)) return "boolean";

      // Numeric string detection - but keep as string for IDs and long numeric strings
      // Only convert to number if it's a short numeric string that's likely a numeric value
      // Long numeric strings (like IDs) should remain as strings
      if (this.isNumericString(str)) {
        // Keep as string if it's longer than 10 digits (likely an ID)
        // or if it starts with leading zeros (definitely an ID)
        if (str.length > 10 || /^0+/.test(str)) {
          return "string";
        }
        return "number";
      }
    }

    return "string";
  }

  /**
   * Check if string is ISO 8601 date
   */
  private isISODate(str: string): boolean {
    if (str.length < 10) return false;
    const date = new Date(str);
    return !isNaN(date.getTime()) && str.includes("-"); // Simple check
  }

  /**
   * Check if string is email
   */
  private isEmail(str: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  /**
   * Check if string is UUID
   */
  private isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      str,
    );
  }

  /**
   * Check if string is numeric
   */
  private isNumericString(str: string): boolean {
    if (str === "") return false;
    const num = parseFloat(str);
    return !isNaN(num) && isFinite(num);
  }

  /**
   * Check if string is boolean
   */
  private isBooleanString(str: string): boolean {
    const lower = str.toLowerCase();
    return (
      lower === "true" ||
      lower === "false" ||
      lower === "yes" ||
      lower === "no" ||
      lower === "1" ||
      lower === "0"
    );
  }

  /**
   * Check if field name matches common naming patterns
   */
  private checkNamingPattern(fieldName: string): boolean {
    const patterns = [
      /_id$/i,           // singular ID
      /_ids$/i,          // plural IDs (e.g., project_ids, section_ids)
      /_gid$/i,          // global ID (e.g., assignee_gid, asana_source_gid)
      /_gids$/i,         // plural global IDs (e.g., followers_gids)
      /_date$/i,
      /_time$/i,
      /_at$/i,
      /_amount$/i,
      /_price$/i,
      /_cost$/i,
      /_name$/i,         // singular name
      /_names$/i,        // plural names (e.g., follower_names, project_names)
      /_email$/i,
      /_url$/i,
      /_link$/i,
      /_address$/i,
      /_phone$/i,
      /_path$/i,         // file paths (e.g., execution_plan_path)
      /_html$/i,         // HTML content (e.g., description_html)
      /_workspace$/i,    // workspace fields (e.g., asana_workspace)
      /^urgency$/i,      // urgency/enum fields (exact match)
      /^recurrence$/i,   // recurrence/enum fields (exact match)
      /^is_/i,
      /^has_/i,
      /^can_/i,
      /^should_/i,
    ];

    return patterns.some((pattern) => pattern.test(fieldName));
  }

  /**
   * Check format consistency for specific types
   * Null values are excluded from format consistency calculation since they're expected for optional fields
   */
  private checkFormatConsistency(
    samples: unknown[],
    type: string,
  ): number {
    // Filter out null values - they don't affect format consistency
    const nonNullSamples = samples.filter(s => s !== null && s !== undefined);
    
    if (nonNullSamples.length === 0) {
      // All samples are null - can't assess format consistency
      return 0.9; // Default to high consistency for optional fields
    }

    if (type === "date") {
      // Check if all dates follow same format
      const formats = new Set<string>();
      for (const sample of nonNullSamples) {
        if (typeof sample === "string") {
          if (this.isISODate(sample)) formats.add("iso");
        }
      }
      return formats.size === 1 ? 1.0 : 0.5;
    }

    if (type === "number") {
      // Check if all numbers have similar precision
      // Handle both actual numbers and numeric strings
      const integers = nonNullSamples.filter((s) => {
        if (typeof s === "number") {
          return Number.isInteger(s);
        }
        if (typeof s === "string") {
          // Check if it's a numeric string that represents an integer
          const num = parseFloat(s);
          return !isNaN(num) && isFinite(num) && Number.isInteger(num);
        }
        return false;
      });
      const consistency = integers.length / nonNullSamples.length;
      return consistency;
    }

    // Default: high consistency for other types
    return 0.9;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(params: {
    type_consistency: number;
    naming_pattern_match: boolean;
    format_consistency: number;
    sample_count: number;
  }): number {
    let confidence = 0;

    // Type consistency is most important (50% weight)
    confidence += params.type_consistency * 0.5;

    // Format consistency (25% weight)
    confidence += params.format_consistency * 0.25;

    // Naming pattern match (15% weight)
    confidence += (params.naming_pattern_match ? 1.0 : 0.5) * 0.15;

    // Sample count bonus (10% weight) - more samples = higher confidence
    const sampleScore = Math.min(params.sample_count / 10, 1.0);
    confidence += sampleScore * 0.1;

    return Math.min(confidence, 1.0);
  }
}

// Export singleton instance
export const schemaRecommendationService = new SchemaRecommendationService();
