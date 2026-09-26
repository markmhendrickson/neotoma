/**
 * AAuth verification middleware for Neotoma's MCP endpoint.
 *
 * Implements RFC 9421 HTTP Message Signatures verification with the AAuth
 * profile (agent-token JWT carried in the `Signature-Key` header). The
 * middleware is **non-blocking**: requests without AAuth headers are passed
 * through untouched so existing OAuth / bearer-token clients keep working.
 *
 * When AAuth headers *are* present and verification succeeds, the request is
 * annotated with an {@link AAuthRequestContext} at `req.aauth` for downstream
 * code (the MCP handler threads it into {@link NeotomaServer} and write-path
 * services stamp it into provenance).
 *
 * When verification fails (bad signature, expired JWT, JWKS fetch error),
 * the middleware logs a warning and — in the default (non-strict) mode —
 * treats the request as unauthenticated; it does NOT reject with 401.
 * Rationale: Phase 1 rolls AAuth out alongside existing auth; failing closed
 * would break every OAuth client the moment a misbehaving agent sends a
 * malformed signature. Set `NEOTOMA_AAUTH_STRICT=1` (or `options.strict`) to
 * reject signed-but-invalid requests with 401. Unsigned requests continue
 * to flow through even in strict mode so OAuth / Bearer clients keep
 * working. See docs/reports/security_audit_2026_04_22.md S-6.
 *
 * See the AAuth Neotoma integration plan and
 * docs/proposals/agent-trust-framework.md.
 */

import type { NextFunction, Request, Response } from "express";
import { expressVerify } from "@hellocoop/httpsig";
import { decodeJwt, decodeProtectedHeader } from "jose";

import type {
  AAuthRequestContext,
  AttributionDecisionDiagnostics,
  AttributionTier,
} from "../crypto/agent_identity.js";
import {
  computeExpectedChallenge,
  verifyAttestation,
  type AttestationEnvelope,
  type AttestationOutcome,
} from "../services/aauth_attestation_verifier.js";
import { loadAttestationTrustConfig } from "../services/aauth_attestation_trust_config.js";
import {
  isOperatorAttested,
  operatorAllowlistUsesGrants,
  type OperatorAllowlistSource,
} from "../services/aauth_operator_allowlist.js";
import { lookupGrantForIdentity, type AgentGrant } from "../services/agent_grants.js";
import { logger } from "../utils/logger.js";

/**
 * Stash a decision summary on the Express request so downstream handlers
 * (notably `/session`) can mirror it to the client without hitting the log
 * stream. Pure metadata; never contains signatures or public keys.
 */
function setAttributionDecision(req: Request, decision: AttributionDecisionDiagnostics): void {
  (
    req as Request & {
      attributionDecision?: AttributionDecisionDiagnostics;
    }
  ).attributionDecision = decision;
}

/**
 * Emit the single per-request diagnostic event all integrators can reason
 * about (see `docs/subsystems/agent_attribution_integration.md`). DEBUG
 * level on purpose: production logs stay quiet unless operators dial the
 * logger up to inspect a specific request.
 */
function logAttributionDecision(decision: AttributionDecisionDiagnostics): void {
  // Stable event name / shape — consumed by tests and integrator docs.
  logger.debug(JSON.stringify({ event: "attribution_decision", ...decision }));
}

/**
 * Options for {@link aauthVerify}.
 *
 * - `authority` is mandatory per AAuth §10.3.1 — the canonical host the
 *   server accepts signatures for. Using the request's own Host header is
 *   explicitly unsafe (an attacker could smuggle `@authority` via
 *   `Host: attacker.example`).
 * - `jwksCacheTtlMs` defaults to the httpsig library's 1h.
 * - `maxClockSkewSec` defaults to 60s.
 * - `strict` (docs/reports/security_audit_2026_04_22.md S-6): when true,
 *   signed requests that fail verification are rejected with 401 instead of
 *   falling through as unauthenticated. Unsigned requests are still passed
 *   through so OAuth / bearer clients keep working. Controlled at runtime by
 *   `NEOTOMA_AAUTH_STRICT=1` when the caller does not set this explicitly.
 */
export interface AAuthVerifyOptions {
  /** Canonical authority, e.g. `"neotoma.io"` or `"localhost:3080"`. */
  authority: string;
  jwksCacheTtlMs?: number;
  maxClockSkewSec?: number;
  /**
   * When true, log the extracted thumbprint / subject at info level. Defaults
   * to false to keep production logs quiet; useful for local debugging.
   */
  verbose?: boolean;
  /**
   * Reject signed-but-invalid requests with 401 (see S-6 above). Defaults
   * to the value of `NEOTOMA_AAUTH_STRICT` at middleware-build time.
   */
  strict?: boolean;
}

/**
 * Header names that indicate an AAuth-signed request. If none of these are
 * present we short-circuit the middleware — verifying unsigned requests is
 * a waste of CPU and log noise.
 */
const AAUTH_HEADERS = ["signature", "signature-input", "signature-key"] as const;

function hasAAuthHeaders(req: Request): boolean {
  return AAUTH_HEADERS.some((h) => req.headers[h] !== undefined);
}

/**
 * Parse the comma-separated `NEOTOMA_STRICT_AAUTH_SUBS` env var into a set
 * of subs that MUST present a valid AAuth signature when the request
 * claims that identity via the `x-agent-label` header.
 *
 * Rationale: the Netlify forwarder self-reports its identity as
 * `agent-site@neotoma.io` via `x-agent-label` today. The label is a
 * commitment: a request carrying it must be signed by a key pinned
 * (`match_thumbprint`) by an active `agent_grant` whose `match_sub` is the
 * label. An unsigned request, or one signed by a key no grant binds to
 * that sub, is rejected rather than falling through to tier-based
 * "unverified_client". The `sub` inside the agent token is not consulted.
 *
 * Env is parsed per-request for test-friendliness; the set is tiny so the
 * cost is a string split. Case-insensitive match.
 */
function getStrictAAuthSubs(): Set<string> {
  const raw = process.env.NEOTOMA_STRICT_AAUTH_SUBS;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
  );
}

function getAgentLabelHeader(req: Request): string | undefined {
  const header = req.headers["x-agent-label"];
  if (typeof header === "string") return header.trim().toLowerCase() || undefined;
  if (Array.isArray(header) && header.length > 0) {
    return String(header[0]).trim().toLowerCase() || undefined;
  }
  return undefined;
}

/**
 * Resolve the active grant that pins the verified signing key, or `null`
 * when none does (including when active grants under more than one owner
 * pin it). Identity-bearing decisions in this middleware — the strict-sub
 * check and operator-attested promotion — read the identity recorded on
 * this grant, never the agent token's own `sub` / `iss`. A lookup failure
 * is treated as "no grant", which is the restrictive outcome for both.
 */
async function resolvePinnedGrant(
  thumbprint: string | undefined,
  sub: string | undefined,
  iss: string | undefined
): Promise<AgentGrant | null> {
  if (!thumbprint) return null;
  try {
    const lookup = await lookupGrantForIdentity({ thumbprint, sub, iss });
    return lookup.grant;
  } catch (error) {
    logger.warn(
      `[aauth] Grant lookup for signing key failed (treating as unbound): ${(error as Error).message}`
    );
    return null;
  }
}

/**
 * The pinned grant's recorded identity, for operator-attested promotion.
 * `null` when the agent token's own `iss` / `sub` contradict the grant, so
 * the tier never describes an identity other than the one the request
 * carries.
 */
function grantIdentityForPromotion(
  grant: AgentGrant | null,
  claimed: { iss?: string; sub?: string }
): { iss: string | null; sub: string | null } | null {
  if (!grant) return null;
  const grantIss = grant.match_iss ?? null;
  const grantSub = grant.match_sub ?? null;
  if (grantIss && claimed.iss && claimed.iss !== grantIss) return null;
  if (grantSub && claimed.sub && claimed.sub !== grantSub) return null;
  return { iss: grantIss, sub: grantSub };
}

/**
 * Convert a public-key JWK to a JSON string for persistence. We use JSON
 * rather than the thumbprint alone so the Inspector can display the raw
 * key to curious humans and so future phases can inspect `kty` / `crv`.
 */
function serialisePublicKey(publicKey: unknown): string | undefined {
  if (!publicKey || typeof publicKey !== "object") return undefined;
  try {
    return JSON.stringify(publicKey);
  } catch {
    return undefined;
  }
}

/**
 * Validate the agent-token JWT when `keyType === 'jwt'`. The httpsig library
 * intentionally does NOT validate the JWT — per the RFC 9421 spec it is the
 * caller's responsibility to check issuer / expiration / audience.
 *
 * Phase 1 policy (intentionally permissive, tightened in Phase 2):
 * - Decode the JWT without signature verification (signature is already
 *   validated transitively via the HTTP signature, which covers the
 *   `signature-key` header containing the JWT).
 * - Confirm the JWT header declares `typ: "aa-agent+jwt"` (AAuth profile
 *   marker) — unrecognised typ values are still accepted with a warning so
 *   early-stage clients are not locked out.
 * - Enforce `exp` if present; ignore otherwise.
 * - Surface `sub` / `iss` for attribution.
 */
/** Shape of a single external actor claim from the agent_token. */
export interface ExternalActorTokenClaim {
  provider: string;
  id: number;
  login: string;
  linked_at?: string;
}

function validateAgentTokenJwt(raw: string | undefined): {
  sub?: string;
  iss?: string;
  iat?: number;
  attestation?: AttestationEnvelope;
  externalActorClaims?: ExternalActorTokenClaim[];
  valid: boolean;
  reason?: string;
} {
  if (!raw) return { valid: false, reason: "missing_jwt" };
  try {
    const header = decodeProtectedHeader(raw);
    const payload = decodeJwt(raw);
    const typ = typeof header.typ === "string" ? header.typ : undefined;
    if (typ && typ !== "aa-agent+jwt") {
      logger.warn(`[aauth] Unexpected JWT typ: ${typ}`);
    }
    if (typeof payload.exp === "number") {
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSec - 60) {
        return { valid: false, reason: "jwt_expired" };
      }
    }
    let attestation: AttestationEnvelope | undefined;
    const cnf = (payload as Record<string, unknown>)["cnf"];
    if (cnf && typeof cnf === "object" && !Array.isArray(cnf)) {
      const candidate = (cnf as Record<string, unknown>)["attestation"];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        attestation = candidate as AttestationEnvelope;
      }
    }

    let externalActorClaims: ExternalActorTokenClaim[] | undefined;
    const extActors = (payload as Record<string, unknown>)["https://neotoma.io/external_actors"];
    if (Array.isArray(extActors)) {
      externalActorClaims = extActors.filter(
        (entry): entry is ExternalActorTokenClaim =>
          entry != null &&
          typeof entry === "object" &&
          typeof (entry as Record<string, unknown>).provider === "string" &&
          typeof (entry as Record<string, unknown>).id === "number" &&
          typeof (entry as Record<string, unknown>).login === "string"
      );
    }

    return {
      valid: true,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      iss: typeof payload.iss === "string" ? payload.iss : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
      attestation,
      externalActorClaims: externalActorClaims?.length ? externalActorClaims : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      reason: `jwt_decode_failed:${(error as Error).message}`,
    };
  }
}

/**
 * Translate an {@link AttestationOutcome} into the diagnostic shape
 * persisted on the request (and surfaced through `/session`). Mirrors the
 * verifier output 1:1 so operators can map a decision back to a verifier
 * code without translation.
 */
function attestationOutcomeForDiagnostics(
  outcome: AttestationOutcome
): NonNullable<AttributionDecisionDiagnostics["attestation"]> {
  const revocation = outcome.revocation
    ? {
        checked: outcome.revocation.checked,
        ...(outcome.revocation.status ? { status: outcome.revocation.status } : {}),
        ...(outcome.revocation.source ? { source: outcome.revocation.source } : {}),
        ...(outcome.revocation.detail ? { detail: outcome.revocation.detail } : {}),
        ...(outcome.revocation.mode ? { mode: outcome.revocation.mode } : {}),
        ...(outcome.revocation.demoted !== undefined
          ? { demoted: outcome.revocation.demoted }
          : {}),
      }
    : undefined;
  if (outcome.verified) {
    return revocation
      ? { verified: true, format: outcome.format, revocation }
      : { verified: true, format: outcome.format };
  }
  return revocation
    ? {
        verified: false,
        format: outcome.format,
        reason: outcome.reason,
        revocation,
      }
    : {
        verified: false,
        format: outcome.format,
        reason: outcome.reason,
      };
}

/**
 * Build the Express middleware. Call at app-bootstrap time:
 *
 * ```ts
 * app.use("/mcp", aauthVerify({ authority: canonicalAuthority() }));
 * ```
 *
 * The middleware requires raw request bodies to be available — either via
 * `express.raw()` or via `express.json({ verify: (req,_,buf) => (req as any).rawBody = buf })`.
 * If neither is set, signatures that cover `content-digest` will fail to
 * verify.
 */
export function aauthVerify(options: AAuthVerifyOptions) {
  const { authority, jwksCacheTtlMs, maxClockSkewSec, verbose } = options;
  if (!authority || typeof authority !== "string") {
    throw new Error("aauthVerify requires a canonical `authority` string");
  }
  const envStrict =
    process.env.NEOTOMA_AAUTH_STRICT === "1" || process.env.NEOTOMA_AAUTH_STRICT === "true";
  const strict = options.strict ?? envStrict;

  function rejectStrict(
    res: Response,
    next: NextFunction,
    code: string,
    message: string,
    forceReject = false
  ): void {
    if (!strict && !forceReject) {
      next();
      return;
    }
    // Match the rest of the codebase's error envelope shape where possible.
    res.status(401).json({
      error_code: forceReject ? "AAUTH_REQUIRED" : "AAUTH_SIGNATURE_INVALID",
      message,
      details: { reason: code },
      timestamp: new Date().toISOString(),
    });
  }

  return async function aauthVerifyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const strictSubs = getStrictAAuthSubs();
    const claimedLabel = getAgentLabelHeader(req);
    const labelClaimsStrictSub = !!claimedLabel && strictSubs.has(claimedLabel);

    const signaturePresent = hasAAuthHeaders(req);
    if (!signaturePresent) {
      // Strict-require path: the request claims to be a pinned agent but
      // carries no AAuth signature at all. Reject unconditionally so an
      // attacker cannot use the label alone to impersonate the agent.
      if (labelClaimsStrictSub) {
        logger.warn(
          JSON.stringify({
            event: "aauth_strict_sub_rejected",
            reason: "signature_missing",
            agent_label: claimedLabel,
          })
        );
        res.status(401).json({
          error_code: "AAUTH_REQUIRED",
          message:
            `Agent "${claimedLabel}" must present an AAuth signature ` +
            "(NEOTOMA_STRICT_AAUTH_SUBS).",
          details: { reason: "signature_missing" },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      // Unsigned request. Stash a decision stub so `/session` and other
      // downstream helpers have a stable shape to merge with clientInfo
      // normalisation. `resolved_tier` here is an interim placeholder —
      // `buildSessionInfo()` derives the real tier from the merged
      // AAuth + clientInfo picture.
      const decision: AttributionDecisionDiagnostics = {
        signature_present: false,
        signature_verified: false,
        resolved_tier: "anonymous",
      };
      setAttributionDecision(req, decision);
      logAttributionDecision(decision);
      return next();
    }

    // The httpsig library needs a Buffer or string body. Prefer `rawBody`
    // captured by the body parser; fall back to already-parsed req.body when
    // it is a string (GET requests have no body).
    const rawBody = (req as Request & { rawBody?: Buffer | string }).rawBody;
    const bodyForVerify: Buffer | string | undefined =
      rawBody ??
      (typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body : undefined);

    try {
      const result = await expressVerify(
        {
          method: req.method,
          protocol: req.protocol,
          hostname: req.hostname,
          originalUrl: req.originalUrl,
          headers: req.headers as Record<string, string | string[]>,
          body: bodyForVerify,
        },
        authority,
        {
          jwksCacheTtl: jwksCacheTtlMs,
          maxClockSkew: maxClockSkewSec,
          // Keep strictAAuth on so we reject signatures that forget to cover
          // `signature-key` — that flag is the whole point of the profile.
          strictAAuth: true,
        }
      );

      if (!result.verified) {
        logger.warn(`[aauth] Signature verification failed: ${result.error ?? "unknown"}`);
        const decision: AttributionDecisionDiagnostics = {
          signature_present: true,
          signature_verified: false,
          signature_error_code: result.error ?? "signature_invalid",
          resolved_tier: "anonymous",
        };
        setAttributionDecision(req, decision);
        logAttributionDecision(decision);
        return rejectStrict(
          res,
          next,
          result.error ?? "signature_invalid",
          "AAuth signature verification failed",
          labelClaimsStrictSub
        );
      }

      let sub: string | undefined;
      let iss: string | undefined;
      let iat: number | undefined;
      let attestationEnvelope: AttestationEnvelope | undefined;
      if (result.keyType === "jwt" && result.jwt) {
        const jwtCheck = validateAgentTokenJwt(result.jwt.raw);
        if (!jwtCheck.valid) {
          logger.warn(`[aauth] Agent token JWT rejected: ${jwtCheck.reason ?? "invalid"}`);
          const decision: AttributionDecisionDiagnostics = {
            signature_present: true,
            signature_verified: false,
            signature_error_code: jwtCheck.reason ?? "jwt_invalid",
            resolved_tier: "anonymous",
          };
          setAttributionDecision(req, decision);
          logAttributionDecision(decision);
          return rejectStrict(
            res,
            next,
            jwtCheck.reason ?? "jwt_invalid",
            "AAuth agent token rejected",
            labelClaimsStrictSub
          );
        }
        sub = jwtCheck.sub;
        iss = jwtCheck.iss;
        iat = jwtCheck.iat;
        attestationEnvelope = jwtCheck.attestation;
        if (jwtCheck.externalActorClaims?.length) {
          (
            req as Request & { _externalActorClaims?: ExternalActorTokenClaim[] }
          )._externalActorClaims = jwtCheck.externalActorClaims;
        }
      }

      const algorithm =
        typeof (result.publicKey as { alg?: string })?.alg === "string"
          ? (result.publicKey as { alg?: string }).alg
          : undefined;
      const externalActorClaims = (
        req as Request & { _externalActorClaims?: ExternalActorTokenClaim[] }
      )._externalActorClaims;
      const ctx: AAuthRequestContext = {
        verified: true,
        publicKey: serialisePublicKey(result.publicKey),
        thumbprint: result.thumbprint,
        algorithm,
        sub,
        iss,
        ...(externalActorClaims?.length ? { externalActorClaims } : {}),
      };

      // The grant pinning this key (if any) carries the identity the
      // operator recorded for it. Looked up only when a decision below
      // depends on it; the admission middleware repeats the same lookup
      // and is served from the grant cache.
      const pinnedGrant =
        labelClaimsStrictSub || operatorAllowlistUsesGrants()
          ? await resolvePinnedGrant(result.thumbprint, sub, iss)
          : null;

      if (labelClaimsStrictSub) {
        const boundSub = (pinnedGrant?.match_sub ?? "").toLowerCase();
        if (!boundSub || boundSub !== claimedLabel) {
          const reason = pinnedGrant ? "sub_mismatch" : "key_not_bound";
          logger.warn(
            JSON.stringify({
              event: "aauth_strict_sub_rejected",
              reason,
              agent_label: claimedLabel,
              thumbprint_prefix: result.thumbprint?.slice(0, 12) ?? null,
            })
          );
          res.status(401).json({
            error_code: "AAUTH_REQUIRED",
            message:
              `Agent "${claimedLabel}" requires an AAuth signature from a key ` +
              "pinned by an active agent_grant whose match_sub is that label " +
              "(NEOTOMA_STRICT_AAUTH_SUBS).",
            details: { reason },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      (req as Request & { aauth?: AAuthRequestContext }).aauth = ctx;

      // Tier resolution cascade (docs/subsystems/aauth_attestation.md):
      //   1. verified attestation envelope -> hardware
      //   2. operator allowlist hit        -> operator_attested
      //      (key thumbprint, or the pinned grant's recorded identity)
      //   3. plain verified signature      -> software
      // The attestation verifier always runs (even when no envelope is
      // present) because operators want a structured `not_present`
      // diagnostic instead of an absent field.
      const trustConfig = loadAttestationTrustConfig();
      const expectedChallenge = computeExpectedChallenge({ iss, sub, iat });
      const boundJkt = result.thumbprint ?? "";
      const attestationOutcome = await verifyAttestation(attestationEnvelope ?? null, {
        expectedChallenge,
        boundJkt,
        trustConfig,
      });

      let resolvedTier: AttributionTier;
      let allowlistSource: OperatorAllowlistSource | undefined;
      if (attestationOutcome.verified) {
        resolvedTier = "hardware";
      } else {
        // Promotion keys on the verified key: its thumbprint, or the
        // identity recorded on the active grant that pins it. The token's
        // own iss/sub are never matched against the allowlists.
        const bound = grantIdentityForPromotion(pinnedGrant, { iss, sub });
        const allow = isOperatorAttested({
          thumbprint: result.thumbprint,
          grantIss: bound?.iss ?? null,
          grantSub: bound?.sub ?? null,
        });
        if (allow.matched && allow.source) {
          resolvedTier = "operator_attested";
          allowlistSource = allow.source;
        } else {
          resolvedTier = "software";
        }
      }

      const decision: AttributionDecisionDiagnostics = {
        signature_present: true,
        signature_verified: true,
        resolved_tier: resolvedTier,
        attestation: attestationOutcomeForDiagnostics(attestationOutcome),
      };
      if (allowlistSource) decision.operator_allowlist_source = allowlistSource;
      setAttributionDecision(req, decision);
      logAttributionDecision(decision);

      if (verbose) {
        logger.info(
          `[aauth] Verified: thumbprint=${ctx.thumbprint ?? "?"} sub=${ctx.sub ?? "?"} iss=${ctx.iss ?? "?"} tier=${resolvedTier}`
        );
      }

      next();
    } catch (error) {
      logger.warn(`[aauth] Verification threw (treating as unsigned): ${(error as Error).message}`);
      const decision: AttributionDecisionDiagnostics = {
        signature_present: true,
        signature_verified: false,
        signature_error_code: "verification_threw",
        resolved_tier: "anonymous",
      };
      setAttributionDecision(req, decision);
      logAttributionDecision(decision);
      rejectStrict(
        res,
        next,
        "verification_threw",
        "AAuth verification error",
        labelClaimsStrictSub
      );
    }
  };
}

/**
 * Helper for session-introspection to retrieve the stashed decision
 * without a cast dance.
 */
export function getAttributionDecisionFromRequest(
  req: Request
): AttributionDecisionDiagnostics | null {
  return (
    (
      req as Request & {
        attributionDecision?: AttributionDecisionDiagnostics;
      }
    ).attributionDecision ?? null
  );
}

/**
 * Export for tests — they assert the normalised shape of the stable
 * `attribution_decision` log line.
 */
export const ATTRIBUTION_DECISION_EVENT = "attribution_decision" as const;

// Also expose a helper callers can reuse when they want to push a decision
// into their own diagnostic pipeline without re-deriving fields.
export type { ClientNameNormalisationReason } from "../crypto/agent_identity.js";

/**
 * Fetch the AAuth context stamped on a request by {@link aauthVerify}.
 * Returns `null` when the request is unsigned or failed verification.
 */
export function getAAuthContextFromRequest(req: Request): AAuthRequestContext | null {
  const ctx = (req as Request & { aauth?: AAuthRequestContext }).aauth;
  return ctx && ctx.verified ? ctx : null;
}
