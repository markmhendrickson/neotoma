import type { AccessPolicyMode } from "../access_policy.js";

export const SUBMISSION_CONFIG_ENTITY_TYPE = "submission_config";

/** One external mirror entry (e.g. GitHub, generic webhook). */
export interface ExternalMirrorConfigEntry {
  provider: "github" | "linear" | "custom_webhook";
  config: Record<string, unknown>;
}

/** Parsed `submission_config` snapshot row. */
export interface SubmissionConfigRecord {
  entity_id: string;
  config_key: string;
  target_entity_type: string;
  access_policy: AccessPolicyMode;
  active: boolean;
  enable_conversation_threading: boolean;
  enable_guest_read_back: boolean;
  external_mirrors: ExternalMirrorConfigEntry[];
}

export interface SubmitEntityParams {
  entity_type: string;
  /** Primary entity fields (merged into the stored row; must include schema-required fields). */
  fields: Record<string, unknown>;
  /** When `enable_conversation_threading` is true, becomes the first `conversation_message.content` if set. */
  initial_message?: string;
}

export interface SubmitEntityResult {
  entity_id: string;
  conversation_id?: string;
  guest_access_token?: string;
}
