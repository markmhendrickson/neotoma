import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getTurn, listTurns } from "@/api/endpoints/turns";

export function useTurns(params?: {
  limit?: number;
  offset?: number;
  activity_after?: string;
  activity_before?: string;
  harness?: string;
  status?: string;
  agent_key?: string;
}) {
  return useQuery({
    queryKey: ["conversation_turns", params],
    queryFn: () => listTurns(params),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useTurn(turnKey: string | null | undefined) {
  return useQuery({
    queryKey: ["conversation_turn", turnKey ?? null],
    queryFn: () => getTurn(turnKey as string),
    enabled: Boolean(turnKey) && isApiUrlConfigured(),
  });
}
