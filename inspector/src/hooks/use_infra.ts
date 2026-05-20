import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { healthCheck, getServerInfo, getMe, healthCheckSnapshots } from "@/api/endpoints/infra";
import { getSession } from "@/api/endpoints/session";

export function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: healthCheck,
    refetchInterval: 60_000,
    enabled: isApiUrlConfigured(),
  });
}

export function useServerInfo() {
  return useQuery({
    queryKey: ["server-info"],
    queryFn: getServerInfo,
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    retry: false,
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useHealthCheckSnapshots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (autoFix: boolean) => healthCheckSnapshots(autoFix),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stats"] }),
  });
}
