import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getRecentConversation } from "@/api/endpoints/recent_conversations";

export function useRecentConversation(conversationId: string | undefined) {
  const id = conversationId?.trim();
  return useQuery({
    queryKey: ["recent_conversation", id],
    queryFn: ({ signal }) => getRecentConversation(id!, { signal }),
    enabled: Boolean(id) && isApiUrlConfigured(),
  });
}
