import { get } from "../client";

export interface AccessPoliciesResponse {
  policies: Record<string, string>;
  default_mode: string;
}

export function getAccessPolicies() {
  return get<AccessPoliciesResponse>("/access_policies");
}
