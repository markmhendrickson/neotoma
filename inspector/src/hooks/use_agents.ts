import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import {
  createAgentGrant,
  getAgent,
  getAgentGrant,
  listAgentGrants,
  listAgentRecords,
  listAgents,
  setAgentGrantStatus,
  updateAgentGrant,
} from "@/api/endpoints/agents";
import type {
  AgentGrantCreateRequest,
  AgentGrantStatus,
  AgentGrantUpdateRequest,
} from "@/types/api";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => listAgents(),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useAgent(agentKey: string | undefined) {
  return useQuery({
    queryKey: ["agents", agentKey],
    queryFn: () => getAgent(agentKey as string),
    enabled: isApiUrlConfigured() && Boolean(agentKey),
  });
}

export function useAgentRecords(
  agentKey: string | undefined,
  params?: { limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: ["agents", agentKey, "records", params],
    queryFn: () => listAgentRecords(agentKey as string, params),
    enabled: isApiUrlConfigured() && Boolean(agentKey),
  });
}

// ---------------------------------------------------------------------------
// Agent grants — Stronger AAuth Admission management surface
// ---------------------------------------------------------------------------

export function useAgentGrants(params?: {
  status?: AgentGrantStatus | "all";
  q?: string;
}) {
  return useQuery({
    queryKey: ["agents", "grants", params ?? null],
    queryFn: () => listAgentGrants(params),
    enabled: isApiUrlConfigured(),
    placeholderData: keepPreviousData,
  });
}

export function useAgentGrant(grantId: string | undefined) {
  return useQuery({
    queryKey: ["agents", "grants", "detail", grantId],
    queryFn: () => getAgentGrant(grantId as string),
    enabled: isApiUrlConfigured() && Boolean(grantId),
  });
}

export function useCreateAgentGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentGrantCreateRequest) => createAgentGrant(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", "grants"] });
    },
  });
}

export function useUpdateAgentGrant(grantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentGrantUpdateRequest) => updateAgentGrant(grantId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", "grants"] });
      qc.invalidateQueries({ queryKey: ["agents", "grants", "detail", grantId] });
    },
  });
}

export function useSetAgentGrantStatus(grantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: "active" | "suspended" | "revoked") =>
      setAgentGrantStatus(grantId, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", "grants"] });
      qc.invalidateQueries({ queryKey: ["agents", "grants", "detail", grantId] });
    },
  });
}
