import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { queryEntities } from "@/api/endpoints/entities";
import type { EntitiesQueryParams, EntitySnapshot } from "@/types/api";

/**
 * Hook for listing `neotoma_feedback` entities — items mirrored from the
 * agent.neotoma.io feedback pipeline. See
 * `docs/subsystems/agent_feedback_pipeline.md` for the upstream data model.
 */
export function useNeotomaFeedback(
  params: Omit<EntitiesQueryParams, "entity_type"> = {},
) {
  const merged: EntitiesQueryParams = {
    entity_type: "neotoma_feedback",
    include_snapshots: true,
    sort_by: "last_observation_at",
    sort_order: "desc",
    limit: 50,
    offset: 0,
    ...params,
  };
  return useQuery<{
    entities: EntitySnapshot[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ["neotoma-feedback", merged],
    queryFn: () => queryEntities(merged),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
