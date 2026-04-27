/**
 * Operator-managed allowlist for the `operator_attested` AAuth tier.
 *
 * Promotes verified AAuth signatures whose `iss` (or `iss:sub` composite)
 * matches an operator-supplied list to `operator_attested`. This sits
 * one rung below `hardware`: the underlying signature is verified, the
 * operator vouches for the issuer's process, but no cryptographic
 * attestation of a hardware root of trust has been provided.
 *
 * Inputs are CSV env vars so operators can manage them in deployment
 * configuration without restart hooks. Whitespace is trimmed, empty
 * entries are dropped, and matching is case-sensitive (subjects and
 * issuers are stable identifiers; do not normalise away meaningful
 * casing).
 *
 * | Env var | Shape | Match key |
 * |---|---|---|
 * | `NEOTOMA_OPERATOR_ATTESTED_ISSUERS` | CSV of `iss` values | `iss` only |
 * | `NEOTOMA_OPERATOR_ATTESTED_SUBS` | CSV of `iss:sub` composites | `iss:sub` |
 *
 * The cascade in `src/middleware/aauth_verify.ts` consults this module
 * after the attestation verifier returns a non-`hardware` outcome.
 */

export interface OperatorAllowlistMatch {
  matched: boolean;
  /** Which list contributed to the match. `null` when `matched=false`. */
  source: "issuer" | "issuer_subject" | null;
}

interface ParsedAllowlists {
  issuers: ReadonlySet<string>;
  issuerSubjects: ReadonlySet<string>;
}

let cached: ParsedAllowlists | null = null;

/**
 * Public lookup. Returns `{ matched: false, source: null }` when no
 * match is found; the middleware uses this to fall through to the
 * `software` tier.
 */
export function isOperatorAttested(input: {
  iss?: string | null;
  sub?: string | null;
}): OperatorAllowlistMatch {
  const iss = (input.iss ?? "").trim();
  const sub = (input.sub ?? "").trim();
  if (iss.length === 0) return { matched: false, source: null };

  const lists = ensureLoaded();
  if (sub.length > 0 && lists.issuerSubjects.has(`${iss}:${sub}`)) {
    return { matched: true, source: "issuer_subject" };
  }
  if (lists.issuers.has(iss)) {
    return { matched: true, source: "issuer" };
  }
  return { matched: false, source: null };
}

/** Test helper. Production code never invokes. */
export function resetOperatorAllowlistCacheForTests(): void {
  cached = null;
}

function ensureLoaded(): ParsedAllowlists {
  if (cached) return cached;
  cached = {
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
