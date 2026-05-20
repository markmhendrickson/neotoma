import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listRecentConversations } from "@/api/endpoints/recent_conversations";

export function useRecentConversations(params?: {
  limit?: number;
  offset?: number;
  activity_after?: string;
  activity_before?: string;
  agent_key?: string;
}) {
  return useQuery({
    queryKey: ["recent_conversations", params],
    queryFn: () => listRecentConversations(params),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
