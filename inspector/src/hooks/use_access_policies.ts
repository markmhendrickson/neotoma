import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getAccessPolicies } from "@/api/endpoints/access_policies";

export function useAccessPolicies() {
  return useQuery({
    queryKey: ["access_policies"],
    queryFn: getAccessPolicies,
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
