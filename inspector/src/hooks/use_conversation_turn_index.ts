import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getConversationTurnIndex } from "@/api/endpoints/recent_conversations";

// FU-2026-05-003: fetches the per-turn anchor index for a conversation.
// Drives anchor sections, timeline sidebar, and inline issue consent card.
export function useConversationTurnIndex(conversationId: string | undefined) {
  const id = conversationId?.trim();
  return useQuery({
    queryKey: ["conversation_turn_index", id],
    queryFn: ({ signal }) => getConversationTurnIndex(id!, { signal }),
    enabled: Boolean(id) && isApiUrlConfigured(),
  });
}
