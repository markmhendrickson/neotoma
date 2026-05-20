import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listTimeline, getTimelineById } from "@/api/endpoints/timeline";

export function useTimeline(
  params?: {
    start_date?: string;
    end_date?: string;
    event_type?: string;
    entity_id?: string;
    limit?: number;
    offset?: number;
    order_by?: "event_timestamp" | "created_at";
  },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["timeline", params],
    queryFn: () => listTimeline(params),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured() && (options?.enabled ?? true),
  });
}

export function useEntityWorldTimeEvents(
  entityId: string | undefined,
  options?: { limit?: number; offset?: number },
) {
  return useTimeline(
    {
      entity_id: entityId,
      limit: options?.limit,
      offset: options?.offset,
      order_by: "event_timestamp",
    },
    { enabled: Boolean(entityId) },
  );
}

export function useTimelineEvent(id: string | undefined) {
  return useQuery({
    queryKey: ["timeline-event", id],
    queryFn: () => getTimelineById(id!),
    enabled: isApiUrlConfigured() && !!id,
  });
}
