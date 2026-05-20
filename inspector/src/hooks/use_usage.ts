import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getUsage } from "@/api/endpoints/usage";

export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: ({ signal }) => getUsage({ signal }),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}
