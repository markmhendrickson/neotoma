/**
 * Hook that streams the canonical markdown rendering of an entity snapshot
 * from `GET /entities/:id/markdown`.
 *
 * The server endpoint is deterministic and shares its renderer with the
 * filesystem mirror, so what the user sees in the Inspector preview is what
 * `cat mirror/entities/<type>/<slug>.md` would show.
 */
import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  batchCorrect,
  getEntityMarkdown,
  type BatchCorrectionChange,
  type BatchCorrectionResponse,
} from "@/api/endpoints/corrections";

export function useEntityMarkdown(entityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["entity-markdown", entityId],
    queryFn: () => getEntityMarkdown(entityId!),
    enabled: isApiUrlConfigured() && !!entityId && enabled,
  });
}

export function useBatchCorrect(entityId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    BatchCorrectionResponse,
    Error,
    {
      changes: BatchCorrectionChange[];
      expected_last_observation_at?: string | null;
      overwrite?: boolean;
      idempotency_prefix?: string;
    }
  >({
    mutationFn: (body) => batchCorrect(entityId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity", entityId] });
      qc.invalidateQueries({ queryKey: ["entity-markdown", entityId] });
      qc.invalidateQueries({ queryKey: ["entity-observations", entityId] });
    },
  });
}
