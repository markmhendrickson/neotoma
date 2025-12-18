/**
 * Payload Identity Computation
 *
 * Handles deterministic generation of payload IDs:
 * - payload_content_id: Hash-based for deduplication
 * - payload_submission_id: UUIDv7 for audit trail
 */

import crypto from "crypto";
import type {
  Capability,
  CanonicalizationRules,
} from "./capability_registry.js";
import type { Provenance } from "./payload_schema.js";

/**
 * Normalize value based on canonicalization rules
 */
function normalizeValue(value: unknown, rules: CanonicalizationRules): unknown {
  if (typeof value === "string" && rules.normalizeStrings) {
    return value.trim().toLowerCase();
  }

  if (Array.isArray(value) && rules.sortArrays) {
    const normalized = value.map((item) => normalizeValue(item, rules));
    return normalized.sort((a, b) => {
      const aStr = JSON.stringify(a);
      const bStr = JSON.stringify(b);
      return aStr.localeCompare(bStr);
    });
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      normalized[key] = normalizeValue(val, rules);
    }
    return normalized;
  }

  return value;
}

/**
 * Normalize payload body per capability canonicalization rules
 */
export function normalizePayloadBody(
  body: Record<string, unknown>,
  capability: Capability,
): Record<string, unknown> {
  const { canonicalization_rules } = capability;
  const normalized: Record<string, unknown> = {};

  // Include only fields specified in includedFields
  for (const field of canonicalization_rules.includedFields) {
    if (field in body) {
      normalized[field] = normalizeValue(body[field], canonicalization_rules);
    }
  }

  return normalized;
}

/**
 * Compute payload_content_id from normalized payload
 *
 * Format: payload_{hash}
 * Hash includes: capability_id, normalized_body, source_refs, extractor_version
 */
export function computePayloadContentId(
  capabilityId: string,
  normalizedBody: Record<string, unknown>,
  provenance: Provenance,
): string {
  const canonical = {
    capability: capabilityId,
    body: normalizedBody,
    source_refs: [...provenance.source_refs].sort(),
    extractor_version: provenance.extractor_version,
  };

  // JSON.stringify on this canonical object is deterministic:
  // - Top-level keys are fixed
  // - normalizedBody includes only whitelisted fields in stable order
  // - source_refs is explicitly sorted
  const canonicalJson = JSON.stringify(canonical);
  const hash = crypto.createHash("sha256").update(canonicalJson).digest("hex");

  return `payload_${hash.substring(0, 24)}`;
}

/**
 * Generate payload_submission_id (UUIDv7)
 *
 * Format: sub_{uuidv7}
 */
export function generatePayloadSubmissionId(): string {
  // Prefer native randomUUID when available
  if (typeof crypto.randomUUID === "function") {
    return `sub_${crypto.randomUUID()}`;
  }

  // Fallback: derive UUID-like value from random bytes
  const bytes = crypto.randomBytes(16);
  // Set version (4) and variant bits to keep it UUID-compatible
  // eslint-disable-next-line no-bitwise
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // eslint-disable-next-line no-bitwise
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");

  return `sub_${uuid}`;
}

/**
 * Compute both payload IDs
 */
export interface PayloadIdentity {
  payload_content_id: string;
  payload_submission_id: string;
}

export function computePayloadIdentity(
  capabilityId: string,
  normalizedBody: Record<string, unknown>,
  provenance: Provenance,
): PayloadIdentity {
  return {
    payload_content_id: computePayloadContentId(
      capabilityId,
      normalizedBody,
      provenance,
    ),
    payload_submission_id: generatePayloadSubmissionId(),
  };
}
