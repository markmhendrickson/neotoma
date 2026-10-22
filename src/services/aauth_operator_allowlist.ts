/**
 * Operator-managed allowlist for the `operator_attested` AAuth tier.
 *
 * Promotes a verified AAuth signature to `operator_attested` when the
 * signing key is one the operator vouches for. This sits one rung below
 * `hardware`: the underlying signature is verified, the operator vouches
 * for the key's process, but no cryptographic attestation of a hardware
 * root of trust has been provided.
 *
 * The tier is bound to the verified key, never to identity claims the
 * signer makes about itself. A key qualifies in one of two ways:
 *
 *   1. Its RFC 7638 thumbprint is listed in
 *      `NEOTOMA_OPERATOR_ATTESTED_THUMBPRINTS`.
 *   2. It is pinned (`match_thumbprint`) by an active `agent_grant`, and
 *      the identity recorded on that grant (`match_iss`, or the
 *      `match_iss:match_sub` composite) is listed in
 *      `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` / `NEOTOMA_OPERATOR_ATTESTED_SUBS`.
 *
 * The middleware resolves the grant from the verified thumbprint and
 * passes the grant's recorded identity here; the `iss` / `sub` carried in
 * the agent token are not inputs.
 *
 * Inputs are CSV env vars so operators can manage them in deployment
 * configuration. Whitespace is trimmed, empty entries are dropped, and
 * matching is case-sensitive (thumbprints, subjects and issuers are
 * stable identifiers; do not normalise away meaningful casing).
 *
 * | Env var | Shape | Match key |
 * |---|---|---|
 * | `NEOTOMA_OPERATOR_ATTESTED_THUMBPRINTS` | CSV of key thumbprints | verified key thumbprint |
 * | `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` | CSV of `iss` values | pinned grant's `match_iss` |
 * | `NEOTOMA_OPERATOR_ATTESTED_SUBS` | CSV of `iss:sub` composites | pinned grant's `match_iss:match_sub` |
 *
 * The cascade in `src/middleware/aauth_verify.ts` consults this module
 * after the attestation verifier returns a non-`hardware` outcome.
 */

export type OperatorAllowlistSource = "thumbprint" | "issuer" | "issuer_subject";

export interface OperatorAllowlistMatch {
  matched: boolean;
  /** Which list contributed to the match. `null` when `matched=false`. */
  source: OperatorAllowlistSource | null;
}

interface ParsedAllowlists {
  thumbprints: ReadonlySet<string>;
  issuers: ReadonlySet<string>;
  issuerSubjects: ReadonlySet<string>;
}

let cached: ParsedAllowlists | null = null;

/**
 * Public lookup. Returns `{ matched: false, source: null }` when no
 * match is found; the middleware uses this to fall through to the
 * `software` tier.
 *
 * - `thumbprint`: the verified signing key's thumbprint.
 * - `grantIss` / `grantSub`: `match_iss` / `match_sub` of the active
 *   grant that pins that key, or `null` when no grant pins it. Never the
 *   agent token's own claims.
 */
export function isOperatorAttested(input: {
  thumbprint?: string | null;
  grantIss?: string | null;
  grantSub?: string | null;
}): OperatorAllowlistMatch {
  const lists = ensureLoaded();
  const thumbprint = (input.thumbprint ?? "").trim();
  if (thumbprint.length > 0 && lists.thumbprints.has(thumbprint)) {
    return { matched: true, source: "thumbprint" };
  }
  const iss = (input.grantIss ?? "").trim();
  const sub = (input.grantSub ?? "").trim();
  if (iss.length === 0) return { matched: false, source: null };
  if (sub.length > 0 && lists.issuerSubjects.has(`${iss}:${sub}`)) {
    return { matched: true, source: "issuer_subject" };
  }
  if (lists.issuers.has(iss)) {
    return { matched: true, source: "issuer" };
  }
  return { matched: false, source: null };
}

/**
 * True when the issuer or issuer:subject lists are configured, i.e. when
 * promotion may depend on the grant pinning the key. Lets the middleware
 * skip the grant lookup when only the thumbprint list (or nothing) is set.
 */
export function operatorAllowlistUsesGrants(): boolean {
  const lists = ensureLoaded();
  return lists.issuers.size > 0 || lists.issuerSubjects.size > 0;
}

/** Test helper. Production code never invokes. */
export function resetOperatorAllowlistCacheForTests(): void {
  cached = null;
}

function ensureLoaded(): ParsedAllowlists {
  if (cached) return cached;
  cached = {
    thumbprints: parseCsvSet(process.env.NEOTOMA_OPERATOR_ATTESTED_THUMBPRINTS),
    issuers: parseCsvSet(process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS),
    issuerSubjects: parseCsvSet(process.env.NEOTOMA_OPERATOR_ATTESTED_SUBS),
  };
  return cached;
}

function parseCsvSet(value: string | undefined): ReadonlySet<string> {
  if (!value) return new Set();
  const out = new Set<string>();
  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    out.add(trimmed);
  }
  return out;
}
