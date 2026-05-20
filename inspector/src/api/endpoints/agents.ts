import { get, patch, post } from "../client";
import type {
  AgentDetailResponse,
  AgentGrantCreateRequest,
  AgentGrantResponse,
  AgentGrantStatus,
  AgentGrantUpdateRequest,
  AgentGrantsListResponse,
  AgentRecordsResponse,
  AgentsListResponse,
} from "@/types/api";

export function listAgents() {
  return get<AgentsListResponse>("/agents");
}

export function getAgent(agentKey: string) {
  return get<AgentDetailResponse>(`/agents/${encodeURIComponent(agentKey)}`);
}

export function listAgentRecords(
  agentKey: string,
  params?: { limit?: number; offset?: number },
) {
  return get<AgentRecordsResponse>(
    `/agents/${encodeURIComponent(agentKey)}/records`,
    params as Record<string, string | number> | undefined,
  );
}

// ---------------------------------------------------------------------------
// Agent grants — Stronger AAuth Admission management surface
// ---------------------------------------------------------------------------

export function listAgentGrants(params?: {
  status?: AgentGrantStatus | "all";
  q?: string;
}) {
  return get<AgentGrantsListResponse>(
    "/agents/grants",
    params as Record<string, string> | undefined,
  );
}

export function getAgentGrant(grantId: string) {
  return get<AgentGrantResponse>(`/agents/grants/${encodeURIComponent(grantId)}`);
}

export function createAgentGrant(body: AgentGrantCreateRequest) {
  return post<AgentGrantResponse>("/agents/grants", body);
}

export function updateAgentGrant(grantId: string, body: AgentGrantUpdateRequest) {
  return patch<AgentGrantResponse>(
    `/agents/grants/${encodeURIComponent(grantId)}`,
    body,
  );
}

export function setAgentGrantStatus(
  grantId: string,
  next: "active" | "suspended" | "revoked",
) {
  const action = next === "active" ? "restore" : next;
  return post<AgentGrantResponse>(
    `/agents/grants/${encodeURIComponent(grantId)}/${action}`,
    {},
  );
}
