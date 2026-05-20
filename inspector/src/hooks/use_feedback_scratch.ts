import { useMutation, useQueryClient } from "@tanstack/react-query";
import { correct } from "@/api/endpoints/corrections";
import {
  INSPECTOR_SCRATCH_KEY,
  scratchOf,
  snapshotOf,
  type InspectorScratch,
} from "@/lib/feedback";
import type { EntitySnapshot } from "@/types/api";

export type ScratchPatch = Partial<InspectorScratch> & {
  [key: string]: unknown;
};

/**
 * Compute the new {@link InspectorScratch} blob from a patch. Null /
 * empty-string values clear the field; arrays and objects replace. This
 * is a pure helper exported for unit testing and admin-proxy promotion
 * flows that need to clear individual scratch fields atomically.
 */
export function applyScratchPatch(
  current: InspectorScratch,
  patch: ScratchPatch,
): InspectorScratch {
  const next: InspectorScratch = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) {
      delete next[key];
      continue;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      delete next[key];
      continue;
    }
    next[key] = value;
  }
  if (Object.keys(next).length === 0) {
    return {};
  }
  next.updated_at = new Date().toISOString();
  return next;
}

/**
 * Hook for writing Inspector-local scratch annotations. All writes live
 * under the `inspector_scratch` field on the `neotoma_feedback` snapshot
 * and are never propagated to agent.neotoma.io unless explicitly promoted
 * through the Phase 4 admin proxy.
 *
 * Implementation: read-modify-write via the `correct` endpoint with a
 * single-field update to `inspector_scratch`, leaving every mirrored
 * pipeline field untouched.
 */
export function useFeedbackScratch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      entity: EntitySnapshot;
      patch: ScratchPatch;
    }) => {
      const entityId = args.entity.entity_id ?? args.entity.id;
      if (!entityId) throw new Error("Entity is missing an id");
      const entityType = args.entity.entity_type ?? "neotoma_feedback";
      const currentScratch = scratchOf(snapshotOf(args.entity));
      const next = applyScratchPatch(currentScratch, args.patch);
      const idempotencyKey = `scratch-${entityId}-${Date.now()}`;
      return correct({
        entity_id: entityId,
        entity_type: entityType,
        field: INSPECTOR_SCRATCH_KEY,
        value: Object.keys(next).length === 0 ? null : next,
        idempotency_key: idempotencyKey,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["neotoma-feedback"] });
      qc.invalidateQueries({ queryKey: ["entity"] });
      qc.invalidateQueries({ queryKey: ["entity-observations"] });
    },
  });
}

/** Clears the entire scratch namespace for an entity. */
export function useClearFeedbackScratch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entity: EntitySnapshot) => {
      const entityId = entity.entity_id ?? entity.id;
      if (!entityId) throw new Error("Entity is missing an id");
      const entityType = entity.entity_type ?? "neotoma_feedback";
      const idempotencyKey = `scratch-clear-${entityId}-${Date.now()}`;
      return correct({
        entity_id: entityId,
        entity_type: entityType,
        field: INSPECTOR_SCRATCH_KEY,
        value: null,
        idempotency_key: idempotencyKey,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["neotoma-feedback"] });
      qc.invalidateQueries({ queryKey: ["entity"] });
      qc.invalidateQueries({ queryKey: ["entity-observations"] });
    },
  });
}
