/**
 * Attribution policy module.
 *
 * Central seam for gating durable writes based on the resolved
 * {@link AttributionTier} stamped onto the request. Call
 * {@link enforceAttributionPolicy} at the top of each write-path service
 * so all transports (HTTP, MCP stdio, MCP HTTP, CLI backup) honour the
 * same rules uniformly.
 *
 * Sources of configuration (resolved in priority order, most specific
 * wins):
 *   1. `NEOTOMA_ATTRIBUTION_POLICY=allow|warn|reject` environment variable.
 *   2. `NEOTOMA_MIN_ATTRIBUTION_TIER=hardware|software|unverified_client`.
 *   3. Per-write-path overrides supplied via
 *      `NEOTOMA_ATTRIBUTION_POLICY_JSON` (JSON object keyed by write path).
 *
 * Defaults preserve historical behaviour: everything is allowed, no
 * minimum tier.
 */

import type {
  AgentIdentity,
  AttributionTier,
} from "../crypto/agent_identity.js";
import { logger } from "../utils/logger.js";

/**
 * Canonical write-path identifier. Used as the per-path override key and
 * mirrored in `enforceAttributionPolicy(writePath, …)` call sites.
 */
export type WritePath =
  | "observations"
  | "relationships"
  | "sources"
  | "interpretations"
  | "timeline_events"
  | "corrections";

export type AnonymousWriteMode = "allow" | "warn" | "reject";

/** Shape surfaced on the `/session` response and on error envelopes. */
export interface AttributionPolicySnapshot {
  /** Global policy mode applied to writes with `tier === "anonymous"`. */
  anonymous_writes: AnonymousWriteMode;
  /** Optional floor tier; writes below this tier are rejected. */
  min_tier?: AttributionTier;
  /** Per-write-path overrides; present only when set. */
  per_path?: Partial<Record<WritePath, AnonymousWriteMode>>;
}

const DEFAULT_POLICY: AttributionPolicySnapshot = {
  anonymous_writes: "allow",
};

function parseAnonymousWriteMode(
  raw: string | undefined,
): AnonymousWriteMode | undefined {
  if (!raw) return undefined;
  const normalised = raw.trim().toLowerCase();
  if (
    normalised === "allow" ||
    normalised === "warn" ||
    normalised === "reject"
  ) {
    return normalised;
  }
  return undefined;
}

function parseMinTier(raw: string | undefined): AttributionTier | undefined {
  if (!raw) return undefined;
  const normalised = raw.trim().toLowerCase();
  if (
    normalised === "hardware" ||
    normalised === "software" ||
    normalised === "unverified_client"
  ) {
    return normalised;
  }
  return undefined;
}

function parsePerPath(
  raw: string | undefined,
): Partial<Record<WritePath, AnonymousWriteMode>> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const out: Partial<Record<WritePath, AnonymousWriteMode>> = {};
    const allowedPaths: ReadonlySet<WritePath> = new Set<WritePath>([
      "observations",
      "relationships",
      "sources",
      "interpretations",
      "timeline_events",
      "corrections",
    ]);
    for (const [key, value] of Object.entries(parsed)) {
      if (!allowedPaths.has(key as WritePath)) continue;
      const mode = parseAnonymousWriteMode(
        typeof value === "string" ? value : undefined,
      );
      if (mode) out[key as WritePath] = mode;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the current policy snapshot from environment variables. Always
 * returns a fresh object; callers may surface this to clients without
 * worrying about mutation.
 */
export function getAttributionPolicySnapshot(): AttributionPolicySnapshot {
  const anonymousWrites =
    parseAnonymousWriteMode(process.env.NEOTOMA_ATTRIBUTION_POLICY) ??
    DEFAULT_POLICY.anonymous_writes;
  const minTier = parseMinTier(process.env.NEOTOMA_MIN_ATTRIBUTION_TIER);
  const perPath = parsePerPath(process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON);
  const snapshot: AttributionPolicySnapshot = {
    anonymous_writes: anonymousWrites,
  };
  if (minTier) snapshot.min_tier = minTier;
  if (perPath) snapshot.per_path = perPath;
  return snapshot;
}

/**
 * Effective mode for a specific write path after applying per-path
 * overrides. Shared helper so {@link enforceAttributionPolicy} and the
 * `/session` eligibility flag agree on the resolved mode.
 */
export function effectiveAnonymousWriteMode(
  policy: AttributionPolicySnapshot,
  path: WritePath,
): AnonymousWriteMode {
  return policy.per_path?.[path] ?? policy.anonymous_writes;
}

const TIER_RANK: Record<AttributionTier, number> = {
  anonymous: 0,
  unverified_client: 1,
  software: 2,
  operator_attested: 3,
  hardware: 4,
};

/**
 * Structured error thrown by {@link enforceAttributionPolicy} when the
 * caller is below the required tier. HTTP handlers surface this as a 403
 * with `code: "ATTRIBUTION_REQUIRED"` (see `src/actions.ts`).
 */
export class AttributionPolicyError extends Error {
  readonly code = "ATTRIBUTION_REQUIRED" as const;
  readonly statusCode = 403;
  readonly writePath: WritePath;
  readonly currentTier: AttributionTier;
  readonly minTier: AttributionTier;
  readonly hint: string;
  /** True for transient causes (e.g. AAuth JWKS outage); callers may retry. */
  readonly retryable: boolean;

  constructor(params: {
    writePath: WritePath;
    currentTier: AttributionTier;
    minTier: AttributionTier;
    hint: string;
    retryable?: boolean;
  }) {
    super(
      `Attribution policy rejected write to "${params.writePath}": ` +
        `current tier "${params.currentTier}" is below required "${params.minTier}"`,
    );
    this.name = "AttributionPolicyError";
    this.writePath = params.writePath;
    this.currentTier = params.currentTier;
    this.minTier = params.minTier;
    this.hint = params.hint;
    this.retryable = params.retryable ?? false;
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    min_tier: AttributionTier;
    current_tier: AttributionTier;
    write_path: WritePath;
    hint: string;
    retryable: boolean;
  } {
    return {
      code: this.code,
      message: this.message,
      min_tier: this.minTier,
      current_tier: this.currentTier,
      write_path: this.writePath,
      hint: this.hint,
      retryable: this.retryable,
    };
  }
}

/**
 * Outcome returned by {@link enforceAttributionPolicy}. `action === "reject"`
 * is reported as a thrown error; callers only see `"allow"` or `"warn"`.
 * The `warn` outcome carries a message header so HTTP handlers can add
 * `X-Neotoma-Attribution-Warning`.
 */
export interface PolicyOutcome {
  action: "allow" | "warn";
  warningMessage?: string;
}

/**
 * Enforce the active policy for `writePath` against `identity`. Throws an
 * {@link AttributionPolicyError} on rejection; returns the outcome otherwise.
 * Callers MUST invoke this at the top of each public write method so
 * all transports (HTTP, MCP stdio, MCP HTTP, CLI backup) share one seam.
 *
 * This function is synchronous and cheap: it reads `process.env` once per
 * call. If a future profile caches snapshots, keep this signature stable
 * so call sites don't change.
 */
export function enforceAttributionPolicy(
  writePath: WritePath,
  identity: AgentIdentity | null,
): PolicyOutcome {
  const policy = getAttributionPolicySnapshot();
  const tier: AttributionTier = identity?.tier ?? "anonymous";
  const mode = effectiveAnonymousWriteMode(policy, writePath);

  // Anonymous tier is gated by the per-path mode.
  if (tier === "anonymous") {
    if (mode === "reject") {
      throw new AttributionPolicyError({
        writePath,
        currentTier: tier,
        minTier: policy.min_tier ?? "unverified_client",
        hint:
          "Sign this request with AAuth (preferred), or supply an MCP " +
          "clientInfo.name on initialize so the request is attributable.",
      });
    }
    if (mode === "warn") {
      const warning =
        `write to ${writePath} accepted with anonymous attribution (policy=warn)`;
      logger.warn(
        JSON.stringify({
          event: "attribution_policy_warn",
          write_path: writePath,
          resolved_tier: tier,
        }),
      );
      return { action: "warn", warningMessage: warning };
    }
    // mode === "allow"
    return { action: "allow" };
  }

  // Non-anonymous tiers honour the configured floor when set.
  if (policy.min_tier && TIER_RANK[tier] < TIER_RANK[policy.min_tier]) {
    throw new AttributionPolicyError({
      writePath,
      currentTier: tier,
      minTier: policy.min_tier,
      hint: `Upgrade attribution to at least "${policy.min_tier}" for this write path.`,
    });
  }

  return { action: "allow" };
}

