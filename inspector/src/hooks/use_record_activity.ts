import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listRecordActivity } from "@/api/endpoints/record_activity";

export function useRecordActivity(
  params?: { limit?: number; offset?: number; record_types?: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["record_activity", params],
    queryFn: () => listRecordActivity(params),
    enabled: isApiUrlConfigured() && (options?.enabled ?? true),
    placeholderData: (prev) => prev,
  });
}
