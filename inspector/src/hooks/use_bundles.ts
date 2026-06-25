import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getBundle, listBundles } from "@/api/endpoints/bundles";

export function useBundles() {
  return useQuery({
    queryKey: ["bundles"],
    queryFn: ({ signal }) => listBundles({ signal }),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useBundle(name: string | undefined) {
  return useQuery({
    queryKey: ["bundles", name],
    queryFn: ({ signal }) => getBundle(name as string, { signal }),
    enabled: isApiUrlConfigured() && Boolean(name),
  });
}
