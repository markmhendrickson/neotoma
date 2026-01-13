/**
 * Payload Compilation Service
 *
 * Compiles payload envelopes into payloads with deterministic deduplication.
 *
 * Flow:
 * 1. Lookup capability → entity_type + schema_version
 * 2. Normalize body per entity schema rules
 * 3. Check for existing payload by payload_content_id
 * 4. If duplicate: return existing payload ID
 * 5. If new: create payload in payload_submissions table
 * 6. Generate embeddings and summaries
 * 7. Trigger observation extraction from payload
 */

import { supabase } from "../db.js";
import { getCapability } from "./capability_registry.js";
import type {
  PayloadEnvelope,
  CompilationResult,
  PayloadSubmission,
} from "./payload_schema.js";
import {
  normalizePayloadBody,
  computePayloadIdentity,
} from "./payload_identity.js";

export interface CompilePayloadOptions {
  userId?: string; // Optional user ID for multi-user support
  skipObservations?: boolean; // Skip observation creation (for testing)
}

/**
 * Compile payload envelope into stored payload
 */
export async function compilePayload(
  envelope: PayloadEnvelope,
  options: CompilePayloadOptions = {},
): Promise<CompilationResult> {
  const {
    userId = "00000000-0000-0000-0000-000000000000",
    skipObservations = false,
  } = options;

  // 1. Lookup capability
  const capability = getCapability(envelope.capability_id);
  if (!capability) {
    throw new Error(`Unknown capability: ${envelope.capability_id}`);
  }

  // 2. Normalize body per capability rules
  const normalizedBody = normalizePayloadBody(envelope.body, capability);

  // 3. Compute payload identities
  const { payload_content_id, payload_submission_id } = computePayloadIdentity(
    envelope.capability_id,
    normalizedBody,
    envelope.provenance,
  );

  // 4. Check for existing payload by payload_content_id
  const { data: existing } = await supabase
    .from("payload_submissions")
    .select("id, payload_submission_id")
    .eq("payload_content_id", payload_content_id)
    .maybeSingle();

  if (existing) {
    // Duplicate found - return existing
    return {
      payload_id: existing.id,
      payload_content_id,
      payload_submission_id: existing.payload_submission_id,
      created: false,
    };
  }

  // 5. Create new payload
  const { data: payload, error } = await supabase
    .from("payload_submissions")
    .insert({
      payload_submission_id,
      payload_content_id,
      capability_id: envelope.capability_id,
      body: envelope.body, // Store original body, not normalized
      provenance: envelope.provenance,
      client_request_id: envelope.client_request_id,
    })
    .select()
    .single();

  if (error || !payload) {
    throw new Error(
      `Failed to create payload: ${error?.message || "Unknown error"}`,
    );
  }

  // 6. TODO: Generate embeddings and summaries
  // This will be implemented in a future iteration

  // 7. Trigger observation extraction from payload
  if (!skipObservations) {
    // Import dynamically to avoid circular dependencies
    const { createObservationsFromPayload } =
      await import("./observation_ingestion.js");
    await createObservationsFromPayload(
      payload as PayloadSubmission,
      capability,
      userId,
    );
  }

  return {
    payload_id: payload.id,
    payload_content_id,
    payload_submission_id,
    created: true,
  };
}

/**
 * Get payload by ID
 */
export async function getPayloadById(
  payloadId: string,
): Promise<PayloadSubmission | null> {
  const { data, error } = await supabase
    .from("payload_submissions")
    .select("*")
    .eq("id", payloadId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as PayloadSubmission;
}

/**
 * Get payload by content ID
 */
export async function getPayloadByContentId(
  payloadContentId: string,
): Promise<PayloadSubmission | null> {
  const { data, error } = await supabase
    .from("payload_submissions")
    .select("*")
    .eq("payload_content_id", payloadContentId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as PayloadSubmission;
}

/**
 * List payloads by capability
 */
export async function listPayloadsByCapability(
  capabilityId: string,
  limit = 100,
): Promise<PayloadSubmission[]> {
  const { data, error } = await supabase
    .from("payload_submissions")
    .select("*")
    .eq("capability_id", capabilityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data as PayloadSubmission[];
}
