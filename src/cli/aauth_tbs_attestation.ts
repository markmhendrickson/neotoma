/**
 * CLI-side helper that turns the Windows TBS / NCrypt native binding's
 * attest output into an AAuth `cnf.attestation` envelope ready to embed
 * in an `aa-agent+jwt`.
 *
 * The actual TBS + CNG calls live in the `@neotoma/aauth-win-tbs`
 * package (`packages/aauth-win-tbs/`); this helper:
 *
 *   1. Probes the binding so callers can branch to the software-only
 *      tier on hosts without TPM hardware (or non-Windows hosts),
 *      without throwing.
 *   2. Wraps the binding's structured output into the exact JSON shape
 *      consumed by the server-side `verifyTpm2Attestation` (FU-3).
 *      Even though the backend is TBS + NCrypt, the wire format is
 *      WebAuthn-`tpm` and reuses the FU-3 verifier.
 *   3. Computes the AAuth challenge
 *      (`base64url(SHA-256(iss || sub || iat))`) so callers do not have
 *      to know the FU-3 binding contract.
 *
 * Used by:
 *   - `neotoma auth keygen --hardware` on Windows to mint the initial
 *     attestation envelope alongside the TPM-resident NCrypt key.
 *   - `neotoma auth attest --refresh` to re-mint an envelope without
 *     rotating the underlying NCrypt key.
 *
 * Behaviour on non-Windows hosts (or Windows hosts without the
 * Microsoft Platform Crypto Provider / a usable TPM 2.0 chip):
 * {@link isTbsBackendAvailable} returns `false` with a reason, and
 * {@link buildTbsAttestationEnvelope} throws
 * {@link TbsBackendUnavailableError} so the caller can fall back to
 * the software signer cleanly.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

export const TBS_PACKAGE_NAME = "@neotoma/aauth-win-tbs";

export class TbsBackendUnavailableError extends Error {
  readonly code = "tbs_backend_unavailable" as const;
  readonly reason: string;
  constructor(reason: string) {
    super(`Windows TBS backend unavailable: ${reason}`);
    this.reason = reason;
  }
}

export interface TbsBackendProbe {
  supported: boolean;
  reason?: string;
}

interface TbsBindingShape {
  isSupported(): { supported: boolean; reason?: string };
  generateKey(opts: {
    provider?: string;
    scope?: "user" | "machine";
    alg?: "ES256" | "RS256";
    keyName?: string;
  }): {
    jwk: Record<string, unknown>;
    keyName: string;
    provider: string;
    scope: "user" | "machine";
    alg: "ES256" | "RS256";
  };
  attest(opts: {
    keyName: string;
    provider?: string;
    challenge: string;
    jkt: string;
  }): {
    format: "tpm2";
    ver: "2.0";
    alg: "ES256" | "RS256";
    x5c: string[];
    sig: string;
    certInfo: string;
    pubArea: string;
  };
}

let cachedBinding: TbsBindingShape | null = null;
let cachedLoadError: Error | null = null;

/**
 * Lazily resolve the optional `@neotoma/aauth-win-tbs` package without
 * causing a hard-fail when it is not installed. Test code can override
 * the binding via {@link __setTbsBindingForTesting}.
 */
function loadTbsBinding(): TbsBindingShape | null {
  if (cachedBinding) return cachedBinding;
  if (cachedLoadError) return null;
  try {
    const required = requireFromHere(TBS_PACKAGE_NAME) as TbsBindingShape;
    cachedBinding = required;
    return cachedBinding;
  } catch (err) {
    cachedLoadError = err instanceof Error ? err : new Error(String(err));
    return null;
  }
}

/**
 * Test-only override hook. Vitest specs install a synthetic binding via
 * this hook so they can exercise the helper without requiring the
 * real native package or a TPM 2.0 chip.
 */
export function __setTbsBindingForTesting(
  binding: TbsBindingShape | null,
): void {
  cachedBinding = binding;
  cachedLoadError = null;
}

/**
 * Probe the Windows TBS backend. Returns `{ supported: true }` only
 * when the optional native package is installed AND its
 * `isSupported()` probe also returns `true`. Otherwise returns
 * `{ supported: false, reason }` so the CLI can render an actionable
 * error and fall back to the software signer.
 */
export function isTbsBackendAvailable(): TbsBackendProbe {
  if (process.platform !== "win32") {
    return { supported: false, reason: "non-windows host" };
  }
  const binding = loadTbsBinding();
  if (!binding) {
    return {
      supported: false,
      reason:
        cachedLoadError?.message ??
        `optional native package ${TBS_PACKAGE_NAME} not installed`,
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

export interface BuildTbsEnvelopeArgs {
  /** NCrypt key name returned by the binding's `generateKey`. */
  keyName: string;
  /** Optional NCrypt provider override (defaults to MS_PLATFORM_KEY_STORAGE_PROVIDER). */
  provider?: string;
  /** Issuer of the bound `aa-agent+jwt`. */
  iss: string;
  /** Subject of the bound `aa-agent+jwt`. */
  sub: string;
  /** `iat` (epoch seconds) of the bound `aa-agent+jwt`. */
  iat: number;
  /** RFC 7638 thumbprint of the bound JWK. */
  jkt: string;
}

export interface TbsAttestationEnvelope {
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
 * Mint a Windows TBS attestation envelope bound to the given JWT
 * coordinates. Throws {@link TbsBackendUnavailableError} on hosts
 * without a working Windows TBS backend so callers can fall back to
 * the software signer.
 *
 * The returned envelope has the exact shape consumed by FU-3's
 * `verifyTpm2Attestation` (the wire format is WebAuthn-`tpm` even on
 * Windows; the TBS + NCrypt backend is purely an implementation
 * detail of the CLI):
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
export function buildTbsAttestationEnvelope(
  args: BuildTbsEnvelopeArgs,
): TbsAttestationEnvelope {
  const probe = isTbsBackendAvailable();
  if (!probe.supported) {
    throw new TbsBackendUnavailableError(probe.reason ?? "unknown");
  }
  const binding = loadTbsBinding();
  if (!binding) {
    throw new TbsBackendUnavailableError(
      cachedLoadError?.message ?? "binding load failed",
    );
  }
  const challenge = computeAttestationChallenge({
    iss: args.iss,
    sub: args.sub,
    iat: args.iat,
  });
  const result = binding.attest({
    keyName: args.keyName,
    provider: args.provider,
    challenge,
    jkt: args.jkt,
  });
  if (result.format !== "tpm2" || result.ver !== "2.0") {
    throw new Error(
      `aauth-win-tbs: unexpected attest() shape (format=${String(result.format)}, ver=${String(result.ver)})`,
    );
  }
  const cose = COSE_ALG_FOR_BACKEND[result.alg];
  if (typeof cose !== "number") {
    throw new Error(`aauth-win-tbs: unsupported alg ${String(result.alg)}`);
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
