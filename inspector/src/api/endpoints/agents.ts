import { get, patch, post, type FetchOptions } from "../client";
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

export function listAgents(fetch?: FetchOptions) {
  return get<AgentsListResponse>("/agents", undefined, fetch);
}

export function getAgent(agentKey: string, fetch?: FetchOptions) {
  return get<AgentDetailResponse>(`/agents/${encodeURIComponent(agentKey)}`, undefined, fetch);
}

export function listAgentRecords(
  agentKey: string,
  params?: { limit?: number; offset?: number },
  fetch?: FetchOptions,
) {
  return get<AgentRecordsResponse>(
    `/agents/${encodeURIComponent(agentKey)}/records`,
    params as Record<string, string | number> | undefined,
    fetch,
  );
}

export function listAgentGrants(
  params?: {
    status?: AgentGrantStatus | "all";
    q?: string;
  },
  fetch?: FetchOptions,
) {
  return get<AgentGrantsListResponse>(
    "/agents/grants",
    params as Record<string, string> | undefined,
    fetch,
  );
}

export function getAgentGrant(grantId: string, fetch?: FetchOptions) {
  return get<AgentGrantResponse>(`/agents/grants/${encodeURIComponent(grantId)}`, undefined, fetch);
}

export function createAgentGrant(body: AgentGrantCreateRequest, fetch?: FetchOptions) {
  return post<AgentGrantResponse>("/agents/grants", body, fetch);
}

export function updateAgentGrant(
  grantId: string,
  body: AgentGrantUpdateRequest,
  fetch?: FetchOptions,
) {
  return patch<AgentGrantResponse>(`/agents/grants/${encodeURIComponent(grantId)}`, body, fetch);
}

export function setAgentGrantStatus(
  grantId: string,
  next: "active" | "suspended" | "revoked",
  fetch?: FetchOptions,
) {
  const action = next === "active" ? "restore" : next;
  return post<AgentGrantResponse>(
    `/agents/grants/${encodeURIComponent(grantId)}/${action}`,
    {},
    fetch,
  );
}
