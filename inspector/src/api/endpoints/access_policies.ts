import { get, type FetchOptions } from "../client";

export interface AccessPoliciesResponse {
  policies: Record<string, string>;
  default_mode: string;
}

export function getAccessPolicies(fetch?: FetchOptions) {
  return get<AccessPoliciesResponse>("/access_policies", undefined, fetch);
}
