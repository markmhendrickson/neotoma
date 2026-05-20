import { getText, post } from "../client";

export function correct(data: {
  entity_id: string;
  entity_type: string;
  field: string;
  value: unknown;
  idempotency_key: string;
}) {
  return post<Record<string, unknown>>("/correct", data);
}

export interface BatchCorrectionChange {
  field: string;
  value: unknown;
}

export interface BatchCorrectionResponse {
  success: boolean;
  status: "applied" | "conflict" | "validation_error";
  entity_id: string;
  entity_type: string;
  applied: Array<{ observation_id: string; field: string; value: unknown }>;
  validation_errors?: Array<{ field: string; message: string }>;
  conflict?: {
    stored_last_observation_at: string | null;
    expected_last_observation_at: string | null;
    conflicting_fields: string[];
  };
  snapshot?: Record<string, unknown> | null;
  last_observation_at?: string | null;
}

export function batchCorrect(
  entityId: string,
  body: {
    changes: BatchCorrectionChange[];
    expected_last_observation_at?: string | null;
    overwrite?: boolean;
    idempotency_prefix?: string;
  }
): Promise<BatchCorrectionResponse> {
  return post<BatchCorrectionResponse>(
    `/entities/${encodeURIComponent(entityId)}/batch_correct`,
    body
  );
}

/**
 * Canonical markdown rendering of an entity snapshot. Deterministic and
 * matches the filesystem mirror byte-for-byte.
 */
export function getEntityMarkdown(entityId: string): Promise<string> {
  return getText(`/entities/${encodeURIComponent(entityId)}/markdown`);
}
