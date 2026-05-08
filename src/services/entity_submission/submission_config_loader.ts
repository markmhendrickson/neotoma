import { db } from "../../db.js";
import { logger } from "../../utils/logger.js";
import type { AccessPolicyMode } from "../access_policy.js";
import {
  SUBMISSION_CONFIG_ENTITY_TYPE,
  type ExternalMirrorConfigEntry,
  type SubmissionConfigRecord,
} from "./types.js";

const VALID_MODES = new Set<AccessPolicyMode>([
  "closed",
  "read_only",
  "submit_only",
  "submitter_scoped",
  "open",
]);

function parseMirrors(raw: unknown): ExternalMirrorConfigEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalMirrorConfigEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const provider = o.provider;
    const config = o.config;
    if (
      (provider === "github" || provider === "linear" || provider === "custom_webhook") &&
      config &&
      typeof config === "object"
    ) {
      out.push({ provider, config: config as Record<string, unknown> });
    }
  }
  return out;
}

function parseRecord(entityId: string, snapshot: Record<string, unknown>): SubmissionConfigRecord | null {
  const config_key = snapshot.config_key;
  const target_entity_type = snapshot.target_entity_type;
  if (typeof config_key !== "string" || typeof target_entity_type !== "string") return null;
  const ap = snapshot.access_policy;
  const mode = typeof ap === "string" && VALID_MODES.has(ap as AccessPolicyMode) ? (ap as AccessPolicyMode) : "closed";
  const active = snapshot.active !== false;
  return {
    entity_id: entityId,
    config_key,
    target_entity_type,
    access_policy: mode,
    active,
    enable_conversation_threading: Boolean(snapshot.enable_conversation_threading),
    enable_guest_read_back: Boolean(snapshot.enable_guest_read_back),
    external_mirrors: parseMirrors(snapshot.external_mirrors),
  };
}

/**
 * Load the active submission_config row for a target entity type (first match).
 */
export async function getSubmissionConfigForTargetType(
  targetEntityType: string,
): Promise<SubmissionConfigRecord | null> {
  const { data: rows, error } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .eq("entity_type", SUBMISSION_CONFIG_ENTITY_TYPE);

  if (error) {
    logger.warn("[submission_config] load failed", { message: error.message });
    return null;
  }

  for (const row of rows ?? []) {
    const snap = (row as { snapshot: Record<string, unknown> }).snapshot;
    const parsed = parseRecord((row as { entity_id: string }).entity_id, snap);
    if (parsed?.target_entity_type === targetEntityType && parsed.active) {
      return parsed;
    }
  }
  return null;
}
