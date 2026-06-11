/**
 * Pure helper: server-side PII redaction for usage_digest free-text fields.
 *
 * Extracted from the store-seam redaction guard in actions.ts so it can be
 * unit-tested without database or HTTP infrastructure.
 *
 * NOTE: Single telemetry sink today — entity_type === "usage_digest" is the
 * only branch. If a second redacted-free-text entity_type appears, lift these
 * field names into schema metadata (redact_free_text_fields) rather than
 * adding another branch here.
 */

import { scanAndRedact, generateRedactionSalt } from "./redaction.js";

export interface UsageDigestEntity {
  entity_type: string;
  notes?: unknown;
  friction_notes?: unknown;
  redaction_salt?: unknown;
  [key: string]: unknown;
}

export interface RedactUsageDigestResult {
  /** Mutated entity (same reference). */
  entity: UsageDigestEntity;
  /** Number of PII hits found across all scanned fields. */
  hits: number;
  /** Whether any redaction was applied. */
  applied: boolean;
}

/**
 * Scan and redact PII from a single usage_digest entity's free-text fields
 * (`notes` and `friction_notes`).
 *
 * - `notes` (string): scanned as a single body.
 * - `friction_notes` (string[]): each element is scanned INDIVIDUALLY to
 *   preserve array length and order — no join/split round-trip.
 * - A single `redaction_salt` is shared across all scanned fields within one
 *   entity so placeholder correlation (`<EMAIL:a3f9>`) is preserved. If the
 *   caller already set `redaction_salt` it is reused; otherwise a fresh salt
 *   is generated once and written back onto the entity when hits are found.
 *
 * The function mutates the entity in place and returns it together with hit
 * metadata. Callers that want immutability should deep-clone before calling.
 */
export function redactUsageDigestEntity(entity: UsageDigestEntity): RedactUsageDigestResult {
  const salt =
    typeof entity.redaction_salt === "string" && entity.redaction_salt.length > 0
      ? entity.redaction_salt
      : generateRedactionSalt();

  let totalHits = 0;

  // --- notes (plain string) ---
  const notesRaw = typeof entity.notes === "string" ? entity.notes : "";
  if (notesRaw) {
    const { body: notesRedacted, hits: notesHits } = scanAndRedact({
      title: "",
      body: notesRaw,
      salt,
    });
    if (notesHits.length > 0) {
      entity.notes = notesRedacted;
      totalHits += notesHits.length;
    }
  }

  // --- friction_notes (array of strings): redact each element individually ---
  // IMPORTANT: do NOT join/split — joining corrupts array length when any
  // element contains a newline character.
  if (Array.isArray(entity.friction_notes)) {
    const input = entity.friction_notes as unknown[];
    const output: unknown[] = [];
    for (const item of input) {
      if (typeof item !== "string" || item.length === 0) {
        output.push(item);
        continue;
      }
      const { body: itemRedacted, hits: itemHits } = scanAndRedact({
        title: "",
        body: item,
        salt,
      });
      if (itemHits.length > 0) {
        output.push(itemRedacted);
        totalHits += itemHits.length;
      } else {
        output.push(item);
      }
    }
    // Always write back to preserve element references; only content differs.
    entity.friction_notes = output;
  }

  const applied = totalHits > 0;
  if (applied && !entity.redaction_salt) {
    entity.redaction_salt = salt;
  }

  return { entity, hits: totalHits, applied };
}
