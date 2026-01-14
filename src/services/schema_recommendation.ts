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
    const { data: fragments, error } = await supabase
      .from("raw_fragments")
      .select("fragment_value, frequency_count, source_id, record_id")
      .eq("entity_type", options.entity_type)
      .eq("fragment_key", options.fragment_key)
      .eq("user_id", options.user_id || null);

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

    // 6. Check source diversity (2+ different sources)
    const uniqueSources = new Set(fragments.map((f) => f.source_id)).size;
    if (uniqueSources < 2) {
      return {
        eligible: false,
        confidence: confidenceResult.confidence,
        reasoning: "Field appears in only one source (no diversity)",
      };
    }

    // Eligible for auto-enhancement!
    return {
      eligible: true,
      confidence: confidenceResult.confidence,
      inferred_type: confidenceResult.inferred_type,
      reasoning: `High confidence (${confidenceResult.confidence.toFixed(2)}) with ${uniqueSources} sources`,
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
      // Create recommendation record
      const { data: recommendation, error: recError } = await supabase
        .from("schema_recommendations")
        .insert({
          entity_type: options.entity_type,
          user_id: options.user_id || null,
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
    const { data: fragments } = await supabase
      .from("raw_fragments")
      .select("fragment_value, frequency_count")
      .eq("entity_type", options.entity_type)
      .eq("fragment_key", options.fragment_key)
      .eq("user_id", options.user_id || null);

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
    let query = supabase
      .from("raw_fragments")
      .select(
        "entity_type, fragment_key, fragment_value, frequency_count, user_id",
      );

    if (options.entity_type) {
      query = query.eq("entity_type", options.entity_type);
    }
    if (options.user_id) {
      query = query.eq("user_id", options.user_id);
    }

    const { data: fragments, error } = await query;

    if (error || !fragments) {
      return [];
    }

    // Group by entity_type and fragment_key
    const grouped = new Map<
      string,
      Array<{ fragment_value: unknown; frequency_count: number }>
    >();
    for (const fragment of fragments) {
      const key = `${fragment.entity_type}::${fragment.fragment_key}::${fragment.user_id || "global"}`;
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
      await supabase.from("auto_enhancement_queue").upsert(
        {
          entity_type: options.entity_type,
          fragment_key: options.fragment_key,
          user_id: options.user_id || null,
          status: "pending",
          frequency_count: options.frequency_count,
        },
        {
          onConflict: "entity_type,fragment_key,user_id",
          ignoreDuplicates: false, // Update if already exists
        },
      );
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

    for (const sample of samples) {
      const type = this.inferType(sample);
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    // Find dominant type
    let dominantType = "string";
    let maxCount = 0;
    for (const [type, count] of typeCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    const consistency = maxCount / samples.length;

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
    if (typeof value === "number") return "number";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";

    // Pass 2: String analysis - detect dates, emails, UUIDs
    if (typeof value === "string") {
      const str = value.trim();

      // ISO 8601 date detection
      if (this.isISODate(str)) return "date";

      // Email detection (basic)
      if (this.isEmail(str)) return "string"; // Keep as string for emails

      // UUID detection
      if (this.isUUID(str)) return "string"; // Keep as string for UUIDs

      // Numeric string detection
      if (this.isNumericString(str)) return "number";

      // Boolean string detection
      if (this.isBooleanString(str)) return "boolean";
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
      /_id$/i,
      /_date$/i,
      /_time$/i,
      /_at$/i,
      /_amount$/i,
      /_price$/i,
      /_cost$/i,
      /_name$/i,
      /_email$/i,
      /_url$/i,
      /_link$/i,
      /_address$/i,
      /_phone$/i,
      /^is_/i,
      /^has_/i,
      /^can_/i,
      /^should_/i,
    ];

    return patterns.some((pattern) => pattern.test(fieldName));
  }

  /**
   * Check format consistency for specific types
   */
  private checkFormatConsistency(
    samples: unknown[],
    type: string,
  ): number {
    if (type === "date") {
      // Check if all dates follow same format
      const formats = new Set<string>();
      for (const sample of samples) {
        if (typeof sample === "string") {
          if (this.isISODate(sample)) formats.add("iso");
        }
      }
      return formats.size === 1 ? 1.0 : 0.5;
    }

    if (type === "number") {
      // Check if all numbers have similar precision
      const integers = samples.filter(
        (s) => typeof s === "number" && Number.isInteger(s),
      );
      const consistency = integers.length / samples.length;
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
