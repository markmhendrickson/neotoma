/**
 * Payload Schema Definitions
 *
 * Defines the structure and validation for payload submissions.
 */

import { z } from "zod";

/**
 * Provenance schema
 */
export const ProvenanceSchema = z.object({
  source_refs: z
    .array(z.string())
    .describe("Immediate source payload IDs (not full chain)"),
  extracted_at: z.string().datetime().describe("ISO 8601 timestamp"),
  extractor_version: z
    .string()
    .describe('Extractor version (e.g., "neotoma-mcp:v0.2.1")'),
  agent_id: z.string().optional().describe("Optional agent identifier"),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Payload envelope schema
 */
export const PayloadEnvelopeSchema = z.object({
  capability_id: z
    .string()
    .describe('Versioned intent (e.g., "neotoma:store_invoice:v1")'),
  body: z.record(z.unknown()).describe("Payload data"),
  provenance: ProvenanceSchema,
  client_request_id: z
    .string()
    .optional()
    .describe("Optional: retry correlation"),
});

export type PayloadEnvelope = z.infer<typeof PayloadEnvelopeSchema>;

/**
 * Payload submission (stored in database)
 */
export interface PayloadSubmission {
  id: string;
  payload_submission_id: string;
  payload_content_id: string;
  capability_id: string;
  body: Record<string, unknown>;
  provenance: Provenance;
  client_request_id?: string;
  embedding?: number[];
  summary?: string;
  created_at: Date;
}

/**
 * Compilation result
 */
export interface CompilationResult {
  payload_id: string;
  payload_content_id: string;
  payload_submission_id: string;
  created: boolean; // true if new, false if duplicate
}

/**
 * Validate payload envelope
 */
export function validatePayloadEnvelope(data: unknown): PayloadEnvelope {
  return PayloadEnvelopeSchema.parse(data);
}

/**
 * Validate provenance
 */
export function validateProvenance(data: unknown): Provenance {
  return ProvenanceSchema.parse(data);
}
