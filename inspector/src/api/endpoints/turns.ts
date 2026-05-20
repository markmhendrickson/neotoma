import { get } from "../client";
import type {
  ConversationTurnDetail,
  ConversationTurnsResponse,
} from "@/types/api";

export function listTurns(params?: {
  limit?: number;
  offset?: number;
  activity_after?: string;
  activity_before?: string;
  harness?: string;
  status?: string;
  agent_key?: string;
}) {
  return get<ConversationTurnsResponse>(
    "/turns",
    params as Record<string, string | number | undefined>,
  );
}

export function getTurn(turnKey: string) {
  return get<ConversationTurnDetail>(`/turns/${encodeURIComponent(turnKey)}`);
}
