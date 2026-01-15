/**
 * MCP Spec Validators
 * 
 * Validates that MCP action responses and errors conform to the specifications
 * defined in docs/specs/MCP_SPEC.md
 */

import { expect } from "vitest";

/**
 * Error Envelope Schema (per MCP_SPEC.md section 4)
 */
export interface MCPErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    trace_id?: string;
  };
}

/**
 * Validate error follows ErrorEnvelope format (MCP_SPEC.md section 4)
 */
export function validateErrorEnvelope(error: any): asserts error is MCPErrorEnvelope {
  expect(error).toBeDefined();
  expect(error.error).toBeDefined();
  expect(error.error.code).toBeDefined();
  expect(typeof error.error.code).toBe("string");
  expect(error.error.message).toBeDefined();
  expect(typeof error.error.message).toBe("string");
  
  // Details and trace_id are optional
  if (error.error.details !== undefined) {
    expect(typeof error.error.details).toBe("object");
  }
  if (error.error.trace_id !== undefined) {
    expect(typeof error.error.trace_id).toBe("string");
  }
}

/**
 * Validate error code matches MCP_SPEC.md section 5
 */
export function validateErrorCode(errorCode: string, expectedCodes: string[]) {
  expect(expectedCodes).toContain(errorCode);
}

/**
 * Validate store response for structured data (MCP_SPEC.md section 3.1)
 */
export interface StoreStructuredResponse {
  source_id: string;
  entities: Array<{
    entity_id: string;
    entity_type: string;
    observation_id: string;
  }>;
  unknown_fields_count: number;
  related_entities: Array<any>;
  related_relationships: Array<{
    id: string;
    relationship_type: string;
    source_entity_id: string;
    target_entity_id: string;
    metadata?: Record<string, unknown>;
  }>;
}

export function validateStoreStructuredResponse(response: any): asserts response is StoreStructuredResponse {
  expect(response).toBeDefined();
  expect(response.source_id).toBeDefined();
  expect(typeof response.source_id).toBe("string");
  
  expect(response.entities).toBeDefined();
  expect(Array.isArray(response.entities)).toBe(true);
  
  for (const entity of response.entities) {
    expect(entity.entity_id).toBeDefined();
    expect(typeof entity.entity_id).toBe("string");
    expect(entity.entity_type).toBeDefined();
    expect(typeof entity.entity_type).toBe("string");
    expect(entity.observation_id).toBeDefined();
    expect(typeof entity.observation_id).toBe("string");
  }
  
  expect(response.unknown_fields_count).toBeDefined();
  expect(typeof response.unknown_fields_count).toBe("number");
  
  expect(response.related_entities).toBeDefined();
  expect(Array.isArray(response.related_entities)).toBe(true);
  
  expect(response.related_relationships).toBeDefined();
  expect(Array.isArray(response.related_relationships)).toBe(true);
}

/**
 * Validate store response for unstructured data (MCP_SPEC.md section 3.1)
 */
export interface StoreUnstructuredResponse {
  source_id: string;
  content_hash: string;
  file_size?: number;
  deduplicated: boolean;
  interpretation?: {
    run_id: string;
    entities_created: number;
    observations_created: number;
  } | null;
}

export function validateStoreUnstructuredResponse(response: any): asserts response is StoreUnstructuredResponse {
  expect(response).toBeDefined();
  expect(response.source_id).toBeDefined();
  expect(typeof response.source_id).toBe("string");
  
  expect(response.content_hash).toBeDefined();
  expect(typeof response.content_hash).toBe("string");
  
  expect(response.deduplicated).toBeDefined();
  expect(typeof response.deduplicated).toBe("boolean");
  
  if (response.file_size !== undefined) {
    expect(typeof response.file_size).toBe("number");
  }
  
  // interpretation is optional (may be undefined, null, or present)
  if (response.interpretation) {
    expect(response.interpretation.run_id).toBeDefined();
    expect(typeof response.interpretation.run_id).toBe("string");
    expect(typeof response.interpretation.entities_created).toBe("number");
    expect(typeof response.interpretation.observations_created).toBe("number");
  }
}

/**
 * Validate retrieve_entity_snapshot response (MCP_SPEC.md section 3.4)
 */
export interface RetrieveEntitySnapshotResponse {
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, any>;
  provenance: Record<string, string>;
  computed_at: string;
  observation_count: number;
  last_observation_at: string;
}

export function validateRetrieveEntitySnapshotResponse(response: any): asserts response is RetrieveEntitySnapshotResponse {
  expect(response).toBeDefined();
  expect(response.entity_id).toBeDefined();
  expect(typeof response.entity_id).toBe("string");
  expect(response.entity_type).toBeDefined();
  expect(typeof response.entity_type).toBe("string");
  expect(response.schema_version).toBeDefined();
  expect(typeof response.schema_version).toBe("string");
  
  expect(response.snapshot).toBeDefined();
  expect(typeof response.snapshot).toBe("object");
  
  expect(response.provenance).toBeDefined();
  expect(typeof response.provenance).toBe("object");
  
  expect(response.computed_at).toBeDefined();
  expect(typeof response.computed_at).toBe("string");
  
  expect(typeof response.observation_count).toBe("number");
  
  expect(response.last_observation_at).toBeDefined();
  expect(typeof response.last_observation_at).toBe("string");
}

/**
 * Validate list_entity_types response (MCP_SPEC.md section 3.2)
 */
export interface ListEntityTypesResponse {
  entity_types: Array<{
    entity_type: string;
    schema_version: string;
    field_names: string[];
    field_summary: Record<string, {
      type: string;
      required: boolean;
    }>;
    similarity_score?: number;
    match_type?: "keyword" | "vector";
  }>;
  total: number;
  keyword: string | null;
  search_method?: string;
}

export function validateListEntityTypesResponse(response: any): asserts response is ListEntityTypesResponse {
  expect(response).toBeDefined();
  expect(response.entity_types).toBeDefined();
  expect(Array.isArray(response.entity_types)).toBe(true);
  
  for (const entityType of response.entity_types) {
    expect(entityType.entity_type).toBeDefined();
    expect(typeof entityType.entity_type).toBe("string");
    expect(entityType.schema_version).toBeDefined();
    expect(typeof entityType.schema_version).toBe("string");
    expect(Array.isArray(entityType.field_names)).toBe(true);
    expect(typeof entityType.field_summary).toBe("object");
  }
  
  expect(typeof response.total).toBe("number");
  expect(response.keyword === null || typeof response.keyword === "string").toBe(true);
}

/**
 * Validate analyze_schema_candidates response (MCP_SPEC.md section 3.18)
 */
export interface AnalyzeSchemaCandidatesResponse {
  recommendations: Array<{
    entity_type: string;
    fields: Array<{
      field_name: string;
      field_type: "string" | "number" | "date" | "boolean" | "array" | "object";
      frequency: number;
      confidence: number;
      type_consistency: number;
      sample_values: unknown[];
      naming_pattern_match?: boolean;
      format_consistency?: number;
    }>;
    source: "raw_fragments";
    confidence_score: number;
    reasoning?: string;
  }>;
  total_entity_types: number;
  total_fields: number;
  min_frequency: number;
  min_confidence: number;
}

export function validateAnalyzeSchemaCandidatesResponse(response: any): asserts response is AnalyzeSchemaCandidatesResponse {
  expect(response).toBeDefined();
  expect(response.recommendations).toBeDefined();
  expect(Array.isArray(response.recommendations)).toBe(true);
  
  for (const rec of response.recommendations) {
    expect(rec.entity_type).toBeDefined();
    expect(typeof rec.entity_type).toBe("string");
    expect(rec.source).toBe("raw_fragments");
    expect(Array.isArray(rec.fields)).toBe(true);
    
    for (const field of rec.fields) {
      expect(field.field_name).toBeDefined();
      expect(typeof field.field_name).toBe("string");
      expect(["string", "number", "date", "boolean", "array", "object"]).toContain(field.field_type);
      expect(typeof field.frequency).toBe("number");
      expect(typeof field.confidence).toBe("number");
      expect(typeof field.type_consistency).toBe("number");
      expect(Array.isArray(field.sample_values)).toBe(true);
    }
  }
  
  expect(typeof response.total_entity_types).toBe("number");
  expect(typeof response.total_fields).toBe("number");
  expect(typeof response.min_frequency).toBe("number");
  expect(typeof response.min_confidence).toBe("number");
}

/**
 * Validate get_schema_recommendations response (MCP_SPEC.md section 3.19)
 */
export interface GetSchemaRecommendationsResponse {
  recommendations: Array<{
    id: string;
    entity_type: string;
    fields: Array<{
      field_name: string;
      field_type: "string" | "number" | "date" | "boolean" | "array" | "object";
      required?: boolean;
    }>;
    source: "raw_fragments" | "agent" | "inference";
    confidence_score: number;
    reasoning?: string;
    status: "pending" | "approved" | "rejected" | "applied" | "auto_applied";
  }>;
  total: number;
  entity_type: string;
}

export function validateGetSchemaRecommendationsResponse(response: any): asserts response is GetSchemaRecommendationsResponse {
  expect(response).toBeDefined();
  expect(response.recommendations).toBeDefined();
  expect(Array.isArray(response.recommendations)).toBe(true);
  
  for (const rec of response.recommendations) {
    expect(rec.id).toBeDefined();
    expect(typeof rec.id).toBe("string");
    expect(rec.entity_type).toBeDefined();
    expect(typeof rec.entity_type).toBe("string");
    expect(["raw_fragments", "agent", "inference"]).toContain(rec.source);
    expect(["pending", "approved", "rejected", "applied", "auto_applied"]).toContain(rec.status);
    expect(Array.isArray(rec.fields)).toBe(true);
  }
  
  expect(typeof response.total).toBe("number");
  expect(response.entity_type).toBeDefined();
  expect(typeof response.entity_type).toBe("string");
}

/**
 * Common error codes (MCP_SPEC.md section 5)
 */
export const VALIDATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "ENTITY_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "FILE_NOT_FOUND",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_FILE_TYPE",
];

export const SERVER_ERROR_CODES = [
  "DB_INSERT_FAILED",
  "DB_UPDATE_FAILED",
  "DB_DELETE_FAILED",
  "DB_QUERY_FAILED",
  "SIGNING_FAILED",
  "ANALYSIS_FAILED",
];

export const SPECIFIC_ERROR_CODES = [
  "ENTITY_ALREADY_MERGED",
  "CYCLE_DETECTED",
  "INVALID_RELATIONSHIP_TYPE",
  "FIELD_NOT_FOUND",
  "QUOTA_EXCEEDED",
  "SCHEMA_NOT_FOUND",
  "USER_ID_REQUIRED",
  "SCHEMA_EXISTS",
  "NOT_FOUND",
  "FILE_READ_ERROR",
];

export const ALL_ERROR_CODES = [
  ...VALIDATION_ERROR_CODES,
  ...SERVER_ERROR_CODES,
  ...SPECIFIC_ERROR_CODES,
];
