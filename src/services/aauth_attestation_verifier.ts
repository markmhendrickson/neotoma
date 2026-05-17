/**
 * AAuth attestation verifier — format-dispatching entry point.
 *
 * Receives the parsed `cnf.attestation` envelope from the AAuth middleware
 * (along with the JWT-derived challenge inputs and the credential
 * thumbprint claimed by `cnf.jwk`), routes to a per-format verifier, and
 * returns a structured outcome. The middleware uses the outcome to decide
 * whether the request earns the `hardware` tier; failure modes intentionally
 * fall through to the operator allowlist or `software` tier rather than
 * rejecting the request.
 *
 * See `docs/subsystems/aauth_attestation.md` for the envelope shape, the
 * verification cascade, and the failure-reason taxonomy.
 */

import { createHash } from "node:crypto";

import type { AttestationTrustConfig } from "./aauth_attestation_trust_config.js";
import type { RevocationOutcome, RevocationStatus } from "./aauth_attestation_revocation.js";
import { verifyAppleSecureEnclaveAttestation } from "./aauth_attestation_apple_se.js";
import { verifyWebauthnPackedAttestation } from "./aauth_attestation_webauthn_packed.js";
import { verifyTpm2Attestation } from "./aauth_attestation_tpm2.js";

/** Discriminator values understood by the verifier. */
export type AttestationFormat = "apple-secure-enclave" | "webauthn-packed" | "tpm2";

/** Reason codes surfaced when {@link verifyAttestation} rejects. */
export type AttestationFailureReason =
  | "not_present"
  | "unsupported_format"
  | "key_binding_failed"
  | "challenge_mismatch"
  | "chain_invalid"
  | "signature_invalid"
  | "aaguid_not_trusted"
  | "pubarea_mismatch"
  | "not_implemented"
  | "malformed"
  | "revoked";

/**
 * Revocation evidence summary surfaced on every attestation outcome
 * (success or failure) so diagnostics, the Inspector, and operator
 * dashboards can render the status without re-running the check.
 */
export interface AttestationRevocationDiagnostic {
  /** Whether the revocation service ran. False when mode=`disabled`. */
  checked: boolean;
  /** Resolved status (`good`/`revoked`/`unknown`) when `checked=true`. */
  status?: RevocationStatus;
  /** Channel that produced the status (apple/ocsp/crl/cache/...). */
  source?: RevocationOutcome["source"];
  /** Optional diagnostic detail (e.g. responder error category). */
  detail?: string;
  /**
   * Operational mode at the time of the lookup
   * (`disabled`/`log_only`/`enforce`). Useful when interpreting why a
   * `revoked` outcome did or did not demote the tier.
   */
  mode?: "disabled" | "log_only" | "enforce";
  /**
   * `true` when the verifier demoted a `hardware`-eligible outcome to
   * `software` because of revocation evidence. Always `false` in
   * `log_only` mode.
   */
  demoted?: boolean;
}

export type AttestationOutcome =
  | {
      verified: true;
      format: AttestationFormat;
      revocation?: AttestationRevocationDiagnostic;
    }
  | {
      verified: false;
      format: AttestationFormat | "unknown";
      reason: AttestationFailureReason;
      revocation?: AttestationRevocationDiagnostic;
    };

/**
 * Raw envelope shape carried inside `aa-agent+jwt.cnf.attestation`. Kept
 * permissive so the verifier can produce a structured `malformed` outcome
 * instead of throwing; format-specific verifiers narrow the inner
 * `statement` shape themselves.
 */
export interface AttestationEnvelope {
  format?: unknown;
  statement?: unknown;
  challenge?: unknown;
}

/**
 * Inputs the format-specific verifiers need beyond the envelope itself.
 *
 * - `expectedChallenge` — server-recomputed `SHA-256(iss || sub || iat)`
 *   over the JWT claims, base64url-encoded. The format verifier compares
 *   this against the `challenge` field embedded in the envelope.
 * - `boundJkt` — RFC 7638 thumbprint of `cnf.jwk` (already computed by
 *   the middleware). Format verifiers MUST reject if the credential
 *   public key inside the statement does not produce a matching
 *   thumbprint.
 * - `trustConfig` — merged attestation trust configuration. Always
 *   includes the bundled Apple Attestation Root; operator-supplied CAs
 *   are appended.
 */
export interface AttestationContext {
  expectedChallenge: string;
  boundJkt: string;
  trustConfig: AttestationTrustConfig;
}

/**
 * Pure dispatcher. The middleware computes `expectedChallenge` and
 * `boundJkt` once per request and reuses them across the cascade.
 *
 * Returns `{ verified: false, format: "unknown", reason: "not_present" }`
 * when the envelope is `null`/`undefined` so callers can distinguish
 * "no attestation attempted" from "attestation attempted and failed"
 * without a separate boolean.
 */
export async function verifyAttestation(
  envelope: AttestationEnvelope | null | undefined,
  ctx: AttestationContext
): Promise<AttestationOutcome> {
  if (envelope === null || envelope === undefined) {
    return { verified: false, format: "unknown", reason: "not_present" };
  }
  if (typeof envelope !== "object") {
    return { verified: false, format: "unknown", reason: "malformed" };
  }
  const format = envelope.format;
  if (typeof format !== "string" || format.length === 0) {
    return { verified: false, format: "unknown", reason: "malformed" };
  }
  if (envelope.statement === null || typeof envelope.statement !== "object") {
    return {
      verified: false,
      format: format as AttestationFormat,
      reason: "malformed",
    };
  }
  if (typeof envelope.challenge !== "string" || envelope.challenge.length === 0) {
    return {
      verified: false,
      format: format as AttestationFormat,
      reason: "malformed",
    };
  }

  // Cheap precheck: server-computed challenge must match what the agent
  // claims to have signed. Per-format verifiers redo this check after
  // parsing the statement (where applicable), but rejecting up-front
  // keeps the format-specific code paths focused on cryptography.
  if (!constantTimeStringEquals(envelope.challenge, ctx.expectedChallenge)) {
    return {
      verified: false,
      format: format as AttestationFormat,
      reason: "challenge_mismatch",
    };
  }

  switch (format) {
    case "apple-secure-enclave":
      return verifyAppleSecureEnclaveAttestation(
        envelope as { statement: unknown; challenge: string; format: string },
        ctx
      );
    case "webauthn-packed":
      return verifyWebauthnPackedAttestation(
        envelope as { statement: unknown; challenge: string; format: string },
        ctx
      );
    case "tpm2":
      return verifyTpm2Attestation(
        envelope as { statement: unknown; challenge: string; format: string },
        ctx
      );
    default:
      return {
        verified: false,
        format: "unknown",
        reason: "unsupported_format",
      };
  }
}

/**
 * Apply the revocation policy to a verified attestation outcome. The
 * format verifier runs `checkRevocation` against the validated chain
 * and passes the resulting outcome here so the policy is centralised:
 *
 *   - `disabled` mode: status is not surfaced; outcome is unchanged.
 *   - `log_only` mode: status is attached to the outcome but the tier
 *     mapping is unchanged. Callers (the AAuth middleware) can log
 *     the result and operators can audit before the v0.12 flip.
 *   - `enforce` mode: a `revoked` status (and `unknown` when fail-open
 *     is disabled) demotes a previously verified outcome to
 *     `{ verified: false, reason: "revoked" }` so the cascade falls
 *     to the operator allowlist or `software` tier.
 */
export function applyRevocationPolicy(
  outcome: AttestationOutcome,
  policy: {
    mode: "disabled" | "log_only" | "enforce";
    failOpen: boolean;
    revocation: RevocationOutcome | null;
  }
): AttestationOutcome {
  if (policy.mode === "disabled" || policy.revocation === null) {
    return outcome;
  }
  const diagnostic: AttestationRevocationDiagnostic = {
    checked: true,
    status: policy.revocation.status,
    source: policy.revocation.source,
    detail: policy.revocation.detail,
    mode: policy.mode,
    demoted: false,
  };
  if (policy.mode === "log_only") {
    return { ...outcome, revocation: diagnostic };
  }
  // enforce
  const treatAsRevoked =
    policy.revocation.status === "revoked" ||
    (policy.revocation.status === "unknown" && !policy.failOpen);
  if (!treatAsRevoked) {
    return { ...outcome, revocation: diagnostic };
  }
  if (!outcome.verified) {
    // Already a failure — keep the original reason; the revocation
    // diagnostic still attaches so operators can see both signals.
    return { ...outcome, revocation: { ...diagnostic, demoted: false } };
  }
  return {
    verified: false,
    format: outcome.format,
    reason: "revoked",
    revocation: { ...diagnostic, demoted: true },
  };
}

/**
 * Recompute the canonical challenge from the JWT claims used for AAuth.
 * Format verifiers compare the envelope's `challenge` field against the
 * value returned here. Inputs are coerced through `String()` so the
 * digest is stable even when `iat` arrives as a number.
 */
export function computeExpectedChallenge(input: {
  iss?: string | null;
  sub?: string | null;
  iat?: number | string | null;
}): string {
  const iss = input.iss ?? "";
  const sub = input.sub ?? "";
  const iat = input.iat === undefined || input.iat === null ? "" : String(input.iat);
  const digest = createHash("sha256").update(String(iss)).update(String(sub)).update(iat).digest();
  return base64url(digest);
}

/**
 * Helper shared with format verifiers: the Apple SE backend, for example,
 * signs `SHA-256(challenge || jkt)` so the leaf signature commits both to
 * the recomputed challenge and the bound credential thumbprint.
 */
export function computeBoundChallengeDigest(challenge: string, jkt: string): Buffer {
  return createHash("sha256").update(challenge).update(jkt).digest();
}

function constantTimeStringEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
