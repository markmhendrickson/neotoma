import { get, type FetchOptions } from "../client";
import type { BundleInfoResponse, BundleListResponse } from "@/types/api";

export function listBundles(fetch?: FetchOptions) {
  return get<BundleListResponse>("/bundles", undefined, fetch);
}

export function getBundle(name: string, fetch?: FetchOptions) {
  return get<BundleInfoResponse>(`/bundles/${encodeURIComponent(name)}`, undefined, fetch);
}
