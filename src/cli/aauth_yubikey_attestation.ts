/**
 * CLI-side helper that turns the YubiKey PKCS#11 native binding's
 * attest output into an AAuth `cnf.attestation` envelope ready to embed
 * in an `aa-agent+jwt`.
 *
 * The actual PKCS#11 / `YKPIV_INS_ATTEST` calls live in the
 * `@neotoma/aauth-yubikey` package (`packages/aauth-yubikey/`); this
 * helper:
 *
 *   1. Probes the binding so callers can branch to the next backend
 *      (or the software signer) on hosts without `libykcs11` or
 *      without a YubiKey 5 series device connected, without throwing.
 *   2. Wraps the binding's structured output into the exact JSON shape
 *      consumed by the server-side `verifyWebauthnPackedAttestation`
 *      (FU-2). Even though the backend is YubiKey-specific, the wire
 *      format is the standard WebAuthn-`packed` envelope and reuses
 *      the FU-2 verifier — no new server-side format is needed.
 *   3. Computes the AAuth challenge
 *      (`base64url(SHA-256(iss || sub || iat))`) so callers do not
 *      have to know the FU-2 binding contract.
 *
 * Used by:
 *   - `neotoma auth keygen --hardware` on any host without a
 *     platform-native hardware backend (no SE on darwin, no TBS on
 *     win32, no TPM2 on linux) to mint the initial attestation
 *     envelope alongside the YubiKey-resident PIV slot 9c key.
 *   - `neotoma auth attest --refresh` to re-mint an envelope without
 *     rotating the underlying YubiKey-resident key.
 *
 * Behaviour on hosts without a YubiKey or without `libykcs11`:
 * {@link isYubikeyBackendAvailable} returns `false` with a reason,
 * and {@link buildYubikeyAttestationEnvelope} throws
 * {@link YubikeyBackendUnavailableError} so the caller can fall back
 * to the next backend cleanly.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

export const YUBIKEY_PACKAGE_NAME = "@neotoma/aauth-yubikey";

/** PIV slot identifier; only `9c` is supported. */
export type PivSlot = "9c";

export class YubikeyBackendUnavailableError extends Error {
  readonly code = "yubikey_backend_unavailable" as const;
  readonly reason: string;
  constructor(reason: string) {
    super(`YubiKey backend unavailable: ${reason}`);
    this.reason = reason;
  }
}

export interface YubikeyBackendProbe {
  supported: boolean;
  reason?: string;
}

interface YubikeyBindingShape {
  isSupported(opts?: { pkcs11Path?: string }): {
    supported: boolean;
    reason?: string;
  };
  generateKey(opts: {
    pkcs11Path?: string;
    slot?: PivSlot;
    alg?: "ES256";
    pin?: string;
    serial?: string;
  }): {
    jwk: Record<string, unknown>;
    slot: PivSlot;
    alg: "ES256";
    serial: string;
    pkcs11Path: string;
    attestationCert: string;
    attestationIntermediate: string;
    aaguid: string;
  };
  attest(opts: {
    pkcs11Path?: string;
    slot: PivSlot;
    challenge: string;
    jkt: string;
    pin?: string;
    serial?: string;
  }): {
    format: "packed";
    alg: number;
    sig: string;
    x5c: string[];
    aaguid: string;
  };
}

let cachedBinding: YubikeyBindingShape | null = null;
let cachedLoadError: Error | null = null;

/**
 * Lazily resolve the optional `@neotoma/aauth-yubikey` package without
 * causing a hard-fail when it is not installed. Test code can override
 * the binding via {@link __setYubikeyBindingForTesting}.
 */
function loadYubikeyBinding(): YubikeyBindingShape | null {
  if (cachedBinding) return cachedBinding;
  if (cachedLoadError) return null;
  try {
    const required = requireFromHere(
      YUBIKEY_PACKAGE_NAME,
    ) as YubikeyBindingShape;
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
 * real native package or a YubiKey.
 */
export function __setYubikeyBindingForTesting(
  binding: YubikeyBindingShape | null,
): void {
  cachedBinding = binding;
  cachedLoadError = null;
}

/**
 * Probe the YubiKey backend. Returns `{ supported: true }` only when
 * the optional native package is installed AND its `isSupported()`
 * probe also returns `true` (i.e. `libykcs11` loads, a YubiKey 5
 * series device is connected, and firmware >= 5.0.0 supports
 * `YKPIV_INS_ATTEST`). Otherwise returns `{ supported: false, reason }`
 * so the CLI can render an actionable error and fall back to the next
 * backend.
 *
 * Unlike the platform-specific helpers (`isTpm2BackendAvailable`,
 * `isTbsBackendAvailable`), this probe does NOT gate on
 * `process.platform` — the YubiKey is portable across darwin / linux /
 * win32 and `libykcs11` ships for all three. The only platform check
 * is whether the optional native package is installed.
 */
export function isYubikeyBackendAvailable(opts: {
  pkcs11Path?: string;
} = {}): YubikeyBackendProbe {
  const binding = loadYubikeyBinding();
  if (!binding) {
    return {
      supported: false,
      reason:
        cachedLoadError?.message ??
        `optional native package ${YUBIKEY_PACKAGE_NAME} not installed`,
    };
  }
  try {
    return binding.isSupported({ pkcs11Path: opts.pkcs11Path });
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
 * `src/services/aauth_attestation_verifier.ts`) and the
 * helpers used by FU-4 (`computeAttestationChallenge` in
 * `src/cli/aauth_tpm2_attestation.ts`) and FU-5
 * (`computeAttestationChallenge` in `src/cli/aauth_tbs_attestation.ts`).
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

export interface BuildYubikeyEnvelopeArgs {
  /** PIV slot to use; only `9c` is currently supported. */
  slot?: PivSlot;
  /** Optional libykcs11 path override. */
  pkcs11Path?: string;
  /** Optional PIN injected non-interactively. NEVER persisted. */
  pin?: string;
  /** Optional YubiKey serial number to pin to a specific device. */
  serial?: string;
  /** Issuer of the bound `aa-agent+jwt`. */
  iss: string;
  /** Subject of the bound `aa-agent+jwt`. */
  sub: string;
  /** `iat` (epoch seconds) of the bound `aa-agent+jwt`. */
  iat: number;
  /** RFC 7638 thumbprint of the bound JWK. */
  jkt: string;
}

export interface YubikeyAttestationEnvelope {
  format: "webauthn-packed";
  statement: {
    /** COSE algorithm identifier (-7 for ES256). */
    alg: number;
    /** Base64url DER ECDSA signature. */
    sig: string;
    /** Cert chain leaf-first: per-slot cert, F9 intermediate. */
    x5c: string[];
  };
  challenge: string;
  key_binding_jkt: string;
  /** YubiKey 5 series AAGUID (base64url). */
  aaguid: string;
}

/**
 * Mint a YubiKey attestation envelope bound to the given JWT
 * coordinates. Throws {@link YubikeyBackendUnavailableError} on hosts
 * without a working YubiKey backend so callers can fall back to the
 * next backend in the ladder (or the software signer).
 *
 * The returned envelope uses the `webauthn-packed` wire format
 * consumed by FU-2's `verifyWebauthnPackedAttestation`. The server
 * does not distinguish YubiKey-rooted packed envelopes from other
 * packed producers beyond the cert-chain root: YubiKey envelopes
 * chain to Yubico's PIV CA roots (bundled in
 * `config/aauth/yubico_piv_roots.pem`), while platform authenticators
 * chain to their respective vendor roots.
 *
 * ```json
 * {
 *   "format": "webauthn-packed",
 *   "statement": {
 *     "alg": -7,
 *     "sig": "<base64url DER ECDSA>",
 *     "x5c": ["<slot 9c attestation cert>", "<F9 intermediate>"]
 *   },
 *   "challenge": "<sha256 base64url>",
 *   "key_binding_jkt": "<RFC 7638 thumbprint>",
 *   "aaguid": "<yubikey 5 series AAGUID>"
 * }
 * ```
 *
 * The `aaguid` field is hoisted to the envelope top level for
 * convenience (matching the canonical WebAuthn-`packed` semantics
 * where AAGUID is part of `authenticatorData`); the server-side
 * verifier extracts AAGUID from the leaf cert's
 * `id-fido-gen-ce-aaguid` extension when present, and falls back to
 * this hoisted field when the cert lacks the extension.
 */
export function buildYubikeyAttestationEnvelope(
  args: BuildYubikeyEnvelopeArgs,
): YubikeyAttestationEnvelope {
  const slot = args.slot ?? "9c";
  if (slot !== "9c") {
    const err = new Error(
      `aauth-yubikey: unsupported PIV slot ${slot} (only 9c is supported)`,
    );
    (err as { code?: string }).code = "YUBIKEY_SLOT_UNSUPPORTED";
    throw err;
  }
  const probe = isYubikeyBackendAvailable({ pkcs11Path: args.pkcs11Path });
  if (!probe.supported) {
    throw new YubikeyBackendUnavailableError(probe.reason ?? "unknown");
  }
  const binding = loadYubikeyBinding();
  if (!binding) {
    throw new YubikeyBackendUnavailableError(
      cachedLoadError?.message ?? "binding load failed",
    );
  }
  const challenge = computeAttestationChallenge({
    iss: args.iss,
    sub: args.sub,
    iat: args.iat,
  });
  const result = binding.attest({
    pkcs11Path: args.pkcs11Path,
    slot,
    challenge,
    jkt: args.jkt,
    pin: args.pin,
    serial: args.serial,
  });
  if (result.format !== "packed") {
    throw new Error(
      `aauth-yubikey: unexpected attest() format=${String(result.format)} (expected "packed")`,
    );
  }
  if (typeof result.alg !== "number") {
    throw new Error(
      `aauth-yubikey: unexpected attest() alg=${String(result.alg)} (expected number)`,
    );
  }
  if (!Array.isArray(result.x5c) || result.x5c.length === 0) {
    throw new Error(
      `aauth-yubikey: attest() returned empty or non-array x5c chain`,
    );
  }
  if (typeof result.sig !== "string" || result.sig.length === 0) {
    throw new Error(`aauth-yubikey: attest() returned empty signature`);
  }
  if (typeof result.aaguid !== "string" || result.aaguid.length === 0) {
    throw new Error(`aauth-yubikey: attest() returned empty AAGUID`);
  }
  return {
    format: "webauthn-packed",
    statement: {
      alg: result.alg,
      sig: result.sig,
      x5c: result.x5c,
    },
    challenge,
    key_binding_jkt: args.jkt,
    aaguid: result.aaguid,
  };
}
