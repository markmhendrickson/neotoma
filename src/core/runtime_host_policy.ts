import type {
  AttributionPolicySnapshot,
  AnonymousWriteMode,
  WritePath,
} from "../services/attribution_policy.js";

export interface LegacyIdentityPolicy {
  tenantScopedEntityIds: boolean;
}

const modes = new Set<unknown>(["allow", "warn", "reject"]);
const tiers = new Set<unknown>(["hardware", "software", "unverified_client"]);
const paths = new Set([
  "observations",
  "relationships",
  "sources",
  "interpretations",
  "timeline_events",
  "corrections",
]);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Bind existing host policies explicitly; no ambient resolver and no inferred defaults. */
export function validateEmbeddedHostPolicies(options: {
  legacyIdentityPolicy?: unknown;
  attributionPolicy?: unknown;
}): {
  legacyIdentityPolicy: Readonly<LegacyIdentityPolicy>;
  attributionPolicy: Readonly<AttributionPolicySnapshot>;
} {
  const identity = options.legacyIdentityPolicy;
  if (identity === undefined) throw new Error("EXPLICIT_RUNTIME_IDENTITY_POLICY_REQUIRED");
  if (
    !record(identity) ||
    Object.keys(identity).length !== 1 ||
    typeof identity.tenantScopedEntityIds !== "boolean"
  ) {
    throw new Error("EXPLICIT_RUNTIME_IDENTITY_POLICY_INVALID");
  }
  const attribution = options.attributionPolicy;
  if (attribution === undefined) throw new Error("EXPLICIT_RUNTIME_ATTRIBUTION_POLICY_REQUIRED");
  if (
    !record(attribution) ||
    Object.keys(attribution).some(
      (key) => !["anonymous_writes", "min_tier", "per_path"].includes(key)
    ) ||
    !modes.has(attribution.anonymous_writes) ||
    (Object.hasOwn(attribution, "min_tier") && !tiers.has(attribution.min_tier))
  ) {
    throw new Error("EXPLICIT_RUNTIME_ATTRIBUTION_POLICY_INVALID");
  }
  let perPath: AttributionPolicySnapshot["per_path"];
  if (Object.hasOwn(attribution, "per_path")) {
    if (
      !record(attribution.per_path) ||
      Object.entries(attribution.per_path).some(
        ([path, mode]) => !paths.has(path) || !modes.has(mode)
      )
    ) {
      throw new Error("EXPLICIT_RUNTIME_ATTRIBUTION_POLICY_INVALID");
    }
    perPath = Object.freeze({ ...attribution.per_path }) as Partial<
      Record<WritePath, AnonymousWriteMode>
    >;
  }
  const policy: AttributionPolicySnapshot = {
    anonymous_writes: attribution.anonymous_writes as AnonymousWriteMode,
  };
  if (Object.hasOwn(attribution, "min_tier"))
    policy.min_tier = attribution.min_tier as AttributionPolicySnapshot["min_tier"];
  if (perPath) policy.per_path = perPath;
  return {
    legacyIdentityPolicy: Object.freeze({ tenantScopedEntityIds: identity.tenantScopedEntityIds }),
    attributionPolicy: Object.freeze(policy),
  };
}
