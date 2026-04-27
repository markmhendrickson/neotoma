/**
 * CLI-side helper that turns the TPM 2.0 native binding's attest output
 * into an AAuth `cnf.attestation` envelope ready to embed in an
 * `aa-agent+jwt`.
 *
 * The actual TPM 2.0 calls live in the `@neotoma/aauth-tpm2` package
 * (`packages/aauth-tpm2/`); this helper:
 *
 *   1. Probes the binding so callers can branch to the software-only
 *      tier on hosts without TPM hardware, without throwing.
 *   2. Wraps the binding's structured output into the exact JSON shape
 *      consumed by the server-side `verifyTpm2Attestation` (FU-3).
 *   3. Computes the AAuth challenge
 *      (`base64url(SHA-256(iss || sub || iat))`) so callers do not have
 *      to know the FU-3 binding contract.
 *
 * Used by:
 *   - `neotoma auth keygen --hardware` on Linux to mint the initial
 *     attestation envelope alongside the TPM-resident key.
 *   - `neotoma auth attest --refresh` to re-mint an envelope without
 *     rotating the underlying handle.
 *
 * Behaviour on non-Linux hosts (or Linux hosts without `libtss2` /
 * `/dev/tpmrm0`): {@link isTpm2BackendAvailable} returns `false` with a
 * reason, and {@link buildTpm2AttestationEnvelope} throws
 * {@link Tpm2BackendUnavailableError} so the caller can fall back to
 * the software signer cleanly.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

export const TPM2_PACKAGE_NAME = "@neotoma/aauth-tpm2";

export class Tpm2BackendUnavailableError extends Error {
  readonly code = "tpm2_backend_unavailable" as const;
  readonly reason: string;
  constructor(reason: string) {
    super(`TPM 2.0 backend unavailable: ${reason}`);
    this.reason = reason;
  }
}

export interface Tpm2BackendProbe {
  supported: boolean;
  reason?: string;
}

interface Tpm2BindingShape {
  isSupported(): { supported: boolean; reason?: string };
  generateKey(opts: {
    hierarchy?: "owner" | "endorsement";
    alg?: "ES256" | "RS256";
  }): {
    jwk: Record<string, unknown>;
    handle: string;
    hierarchy: "owner" | "endorsement";
    alg: "ES256" | "RS256";
  };
  attest(opts: { handle: string; challenge: string; jkt: string }): {
    format: "tpm2";
    ver: "2.0";
    alg: "ES256" | "RS256";
    x5c: string[];
    sig: string;
    certInfo: string;
    pubArea: string;
  };
}

let cachedBinding: Tpm2BindingShape | null = null;
let cachedLoadError: Error | null = null;

/**
 * Lazily resolve the optional `@neotoma/aauth-tpm2` package without
 * causing a hard-fail when it is not installed. Test code can override
 * the binding via {@link __setTpm2BindingForTesting}.
 */
function loadTpm2Binding(): Tpm2BindingShape | null {
  if (cachedBinding) return cachedBinding;
  if (cachedLoadError) return null;
  try {
    const required = requireFromHere(TPM2_PACKAGE_NAME) as Tpm2BindingShape;
    cachedBinding = required;
    return cachedBinding;
  } catch (err) {
    cachedLoadError =
      err instanceof Error ? err : new Error(String(err));
    return null;
  }
}

/**
 * Test-only override hook. Vitest specs install a synthetic binding via
 * this hook so they can exercise the helper without requiring the
 * real native package or a TPM 2.0 chip.
 */
export function __setTpm2BindingForTesting(
  binding: Tpm2BindingShape | null,
): void {
  cachedBinding = binding;
  cachedLoadError = null;
}

/**
 * Probe the TPM 2.0 backend. Returns `{ supported: true }` only when
 * the optional native package is installed AND its `isSupported()`
 * probe also returns `true`. Otherwise returns
 * `{ supported: false, reason }` so the CLI can render an actionable
 * error and fall back to the software signer.
 */
export function isTpm2BackendAvailable(): Tpm2BackendProbe {
  if (process.platform !== "linux") {
    return { supported: false, reason: "non-linux host" };
  }
  const binding = loadTpm2Binding();
  if (!binding) {
    return {
      supported: false,
      reason:
        cachedLoadError?.message ??
        `optional native package ${TPM2_PACKAGE_NAME} not installed`,
    };
  }
  try {
    return binding.isSupported();
  } catch (err) {
    return {
      supported: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Compute the AAuth attestation challenge:
 * `base64url(SHA-256(iss || sub || iat))`. This MUST match the
 * server-side `computeExpectedChallenge` (see
 * `src/services/aauth_attestation_verifier.ts`).
 */
export function computeAttestationChallenge(args: {
  iss: string;
  sub: string;
  iat: number;
}): string {
  return createHash("sha256")
    .update(`${args.iss}${args.sub}${args.iat}`, "utf8")
    .digest("base64url");
}

export interface BuildTpm2EnvelopeArgs {
  /** TPM persistent handle returned by the binding's `generateKey`. */
  handle: string;
  /** Issuer of the bound `aa-agent+jwt`. */
  iss: string;
  /** Subject of the bound `aa-agent+jwt`. */
  sub: string;
  /** `iat` (epoch seconds) of the bound `aa-agent+jwt`. */
  iat: number;
  /** RFC 7638 thumbprint of the bound JWK. */
  jkt: string;
}

export interface Tpm2AttestationEnvelope {
  format: "tpm2";
  statement: {
    ver: "2.0";
    alg: number;
    x5c: string[];
    sig: string;
    certInfo: string;
    pubArea: string;
  };
  challenge: string;
  key_binding_jkt: string;
}

const COSE_ALG_FOR_BACKEND: Record<"ES256" | "RS256", number> = {
  ES256: -7,
  RS256: -257,
};

/**
 * Mint a TPM 2.0 attestation envelope bound to the given JWT
 * coordinates. Throws {@link Tpm2BackendUnavailableError} on hosts
 * without a working TPM 2.0 backend so callers can fall back to the
 * software signer.
 *
 * The returned envelope has the exact shape consumed by FU-3's
 * `verifyTpm2Attestation`:
 *
 * ```json
 * {
 *   "format": "tpm2",
 *   "statement": {
 *     "ver": "2.0",
 *     "alg": -7,
 *     "x5c": ["<leaf>", "<...>", "<root>"],
 *     "sig": "<base64url AIK signature>",
 *     "certInfo": "<base64url TPMS_ATTEST>",
 *     "pubArea": "<base64url TPMT_PUBLIC>"
 *   },
 *   "challenge": "<sha256 base64url>",
 *   "key_binding_jkt": "<RFC 7638 thumbprint>"
 * }
 * ```
 */
export function buildTpm2AttestationEnvelope(
  args: BuildTpm2EnvelopeArgs,
): Tpm2AttestationEnvelope {
  const probe = isTpm2BackendAvailable();
  if (!probe.supported) {
    throw new Tpm2BackendUnavailableError(probe.reason ?? "unknown");
  }
  const binding = loadTpm2Binding();
  if (!binding) {
    throw new Tpm2BackendUnavailableError(
      cachedLoadError?.message ?? "binding load failed",
    );
  }
  const challenge = computeAttestationChallenge({
    iss: args.iss,
    sub: args.sub,
    iat: args.iat,
  });
  const result = binding.attest({
    handle: args.handle,
    challenge,
    jkt: args.jkt,
  });
  if (result.format !== "tpm2" || result.ver !== "2.0") {
    throw new Error(
      `aauth-tpm2: unexpected attest() shape (format=${String(result.format)}, ver=${String(result.ver)})`,
    );
  }
  const cose = COSE_ALG_FOR_BACKEND[result.alg];
  if (typeof cose !== "number") {
    throw new Error(`aauth-tpm2: unsupported alg ${String(result.alg)}`);
  }
  return {
    format: "tpm2",
    statement: {
      ver: "2.0",
      alg: cose,
      x5c: result.x5c,
      sig: result.sig,
      certInfo: result.certInfo,
      pubArea: result.pubArea,
    },
    challenge,
    key_binding_jkt: args.jkt,
  };
}
