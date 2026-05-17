/**
 * Correction Service (Domain Layer)
 *
 * Handles creation of correction observations that override entity field values
 * with highest priority. Extracted from actions.ts and server.ts to enforce
 * layer boundaries.
 */

import { db } from "../db.js";
import { generateObservationId } from "./observation_identity.js";
import { recomputeSnapshot } from "./snapshot_computation.js";
import {
  getCurrentAAuthAdmission,
  getCurrentAgentIdentity,
  getCurrentAttribution,
} from "./request_context.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";
import { assertCanWriteProtected } from "./protected_entity_types.js";
import {
  emitEntitySnapshotChange,
  emitObservationCreated,
} from "../events/substrate_store_emit.js";

export interface CreateCorrectionParams {
  entity_id: string;
  entity_type: string;
  field: string;
  value: unknown;
  schema_version: string;
  user_id: string;
  idempotency_key?: string;
  source_peer_id?: string;
}

export interface CorrectionResult {
  observation_id: string;
  entity_id: string;
  field: string;
  value: unknown;
  snapshot?: Record<string, unknown> | null;
}

export async function createCorrection(params: CreateCorrectionParams): Promise<CorrectionResult> {
  enforceAttributionPolicy("corrections", getCurrentAgentIdentity());
  assertCanWriteProtected({
    entity_type: params.entity_type,
    op: "correct",
    identity: getCurrentAgentIdentity(),
    admission: getCurrentAAuthAdmission(),
  });
  const { entity_id, entity_type, field, value, schema_version, user_id, idempotency_key } = params;

  const observationId = generateObservationId(
    null,
    null,
    entity_id,
    { [field]: value },
    idempotency_key
  );

  const row: Record<string, unknown> = {
    id: observationId,
    entity_id,
    entity_type,
    schema_version,
    source_id: null,
    interpretation_id: null,
    observed_at: new Date().toISOString(),
    specificity_score: 1.0,
    source_priority: 1000,
    fields: { [field]: value },
    user_id,
  };

  if (idempotency_key) {
    row.idempotency_key = idempotency_key;
  }

  const correctionAttribution = getCurrentAttribution();
  if (Object.keys(correctionAttribution).length > 0) {
    row.provenance = correctionAttribution;
  }

  const { error: obsError } = await db.from("observations").insert(row);

  if (obsError) {
    if (obsError.code === "23505") {
      return {
        observation_id: observationId,
        entity_id,
        field,
        value,
        snapshot: null,
      };
    }
    throw new Error(`Failed to create correction: ${obsError.message}`);
  }

  const snapshot = await recomputeSnapshot(entity_id, user_id);
  const snap = (snapshot?.snapshot as Record<string, unknown> | null | undefined) ?? null;
  const emitTs = row.observed_at as string;
  emitObservationCreated({
    user_id,
    entity_id,
    entity_type,
    observation_id: observationId,
    timestamp: emitTs,
    idempotency_key: idempotency_key,
    observation_source: "human",
    source_peer_id: params.source_peer_id,
  });
  emitEntitySnapshotChange({
    user_id,
    entity_id,
    entity_type,
    event_type: "entity.updated",
    timestamp: emitTs,
    observation_id: observationId,
    fields_changed: [field],
    idempotency_key: idempotency_key,
    observation_source: "human",
    source_peer_id: params.source_peer_id,
  });

  return {
    observation_id: observationId,
    entity_id,
    field,
    value,
    snapshot: snap,
  };
}
