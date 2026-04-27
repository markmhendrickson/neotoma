/**
 * Public surface for `@neotoma/aauth-win-tbs`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On non-
 * Windows hosts (and on Windows hosts that lack the TBS service or the
 * Microsoft Platform Crypto Provider) the binary will not load; we
 * surface this as `{ supported: false, reason }` rather than throwing
 * so the CLI can branch to its software-key fallback.
 *
 * The shape of this surface intentionally mirrors
 * `@neotoma/aauth-mac-se` and `@neotoma/aauth-tpm2` so the CLI signer
 * can switch backends with a single discriminator.
 *
 * Note: although the implementation backend is Windows-specific
 * (TBS + NCrypt against MS_PLATFORM_KEY_STORAGE_PROVIDER), the wire
 * format of the attestation envelope is identical to the Linux TPM2
 * path — `format: "tpm2"` on the FU-3 server-side verifier — because
 * Windows TBS produces TPM 2.0-format quotes natively.
 */

import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";

export type Scope = "user" | "machine";
export type SupportedAlg = "ES256" | "RS256";

export interface NativeSupportProbe {
  supported: boolean;
  reason?: string;
}

export interface GenerateKeyOptions {
  /** NCrypt provider name. Defaults to `"Microsoft Platform Crypto Provider"`. */
  provider?: string;
  /** Per-user vs per-machine key scope. Defaults to `"user"`. */
  scope?: Scope;
  /** COSE alg of the produced key. Defaults to `"RS256"` for compatibility. */
  alg?: SupportedAlg;
  /** Optional override for the NCrypt key name; defaults to a random GUID-named key. */
  keyName?: string;
}

export type EcJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
};

export type RsaJwk = {
  kty: "RSA";
  n: string;
  e: string;
};

export type TbsJwk = EcJwk | RsaJwk;

export interface GenerateKeyResult {
  jwk: TbsJwk;
  /** Opaque NCrypt key name (UTF-8). Persisted in `signer.json` and used to re-open the key. */
  keyName: string;
  /** Provider name actually used; echoed back so callers can persist it. */
  provider: string;
  scope: Scope;
  alg: SupportedAlg;
}

export interface SignOptions {
  /** NCrypt key name returned by {@link generateKey}. */
  keyName: string;
  /** NCrypt provider name (defaults to `"Microsoft Platform Crypto Provider"`). */
  provider?: string;
  /** Precomputed digest to sign (32 bytes for SHA-256). */
  digest: Buffer;
  alg: SupportedAlg;
}

export interface AttestOptions {
  /** NCrypt key name returned by {@link generateKey}. */
  keyName: string;
  /** NCrypt provider name (defaults to `"Microsoft Platform Crypto Provider"`). */
  provider?: string;
  /** AAuth attestation challenge — base64url `SHA-256(iss||sub||iat)`. */
  challenge: string;
  /**
   * RFC 7638 thumbprint of the bound JWK. The binding uses
   * `extraData = SHA-256(challenge || jkt)` so the server-side TPM 2.0
   * verifier (FU-3) can prove the quote is bound to the JWT's
   * `cnf.jwk`.
   */
  jkt: string;
}

export interface AttestResult {
  format: "tpm2";
  /** TPM 2.0 protocol version, always `"2.0"`. */
  ver: "2.0";
  alg: SupportedAlg;
  /** AIK X.509 chain (leaf first, root last), each base64url-encoded DER. */
  x5c: string[];
  /** AIK signature over `certInfo`, base64url. */
  sig: string;
  /** Raw `TPMS_ATTEST` blob, base64url. */
  certInfo: string;
  /** Raw `TPMT_PUBLIC` blob describing the bound key, base64url. */
  pubArea: string;
}

interface NativeBinding {
  isSupported(): NativeSupportProbe;
  generateKey(opts: GenerateKeyOptions): GenerateKeyResult;
  sign(opts: SignOptions): Buffer;
  attest(opts: AttestOptions): AttestResult;
}

let cached: NativeBinding | null = null;
let loadError: Error | null = null;

/** Load the native binding lazily; cache the outcome so repeated calls are cheap. */
function loadBinding(): NativeBinding | null {
  if (cached) return cached;
  if (loadError) return null;
  if (process.platform !== "win32") {
    loadError = new Error("aauth-win-tbs: only supported on win32");
    return null;
  }
  try {
    const req = createRequire(__filename);
    const nodeGypBuild = req("node-gyp-build") as (
      packageDir: string,
    ) => NativeBinding;
    const here = resolvePath(__dirname, "..");
    cached = nodeGypBuild(here);
    return cached;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    return null;
  }
}

/**
 * Capability probe. Returns `{ supported: false, reason }` rather than
 * throwing so the CLI can render a clean fallback message.
 *
 * Reasons surface as:
 *   - `"non-win32 host"` — runtime is not Windows.
 *   - `"native binding unavailable"` — the native module failed to load
 *     (typically because the package was not installed via
 *     `optionalDependencies` on this host).
 *   - `"TBS service unavailable"` — `Tbsi_Context_Create` returned a
 *     failure code (the TBS service is disabled or absent).
 *   - `"MS Platform Crypto Provider not loadable"` —
 *     `NCryptOpenStorageProvider` against
 *     `MS_PLATFORM_KEY_STORAGE_PROVIDER` failed.
 *   - `"no TPM 2.0 device detected"` — TBS reported a non-2.0 family
 *     chip.
 */
export function isSupported(): NativeSupportProbe {
  if (process.platform !== "win32") {
    return { supported: false, reason: "non-win32 host" };
  }
  const binding = loadBinding();
  if (!binding) {
    return {
      supported: false,
      reason: loadError?.message ?? "native binding unavailable",
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
 * Generate a new TPM-resident key under an NCrypt persistent key name
 * and return the public JWK plus the key name. The private scalar
 * never leaves the TPM. `provider` defaults to
 * `"Microsoft Platform Crypto Provider"` so the key is bound to the
 * host TPM. `alg` defaults to `"RS256"` (RSA-2048) for compatibility
 * with older TPMs; modern Windows 11 TPMs support `"ES256"`.
 */
export function generateKey(opts: GenerateKeyOptions = {}): GenerateKeyResult {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-win-tbs: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.generateKey({
    provider: opts.provider ?? "Microsoft Platform Crypto Provider",
    scope: opts.scope ?? "user",
    alg: opts.alg ?? "RS256",
    keyName: opts.keyName,
  });
}

/**
 * Sign `digest` (a precomputed message digest) with the TPM-resident
 * key identified by `keyName`. Returns a DER-encoded signature
 * (ECDSA for `ES256`, PKCS1v1.5 for `RS256`). The CLI converts the
 * DER form to JOSE r||s for `ES256` JWS payloads.
 */
export function sign(opts: SignOptions): Buffer {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-win-tbs: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.sign(opts);
}

/**
 * Run TPM 2.0 key attestation against the TPM-resident key identified
 * by `keyName`. Calls `NCryptCreateClaim` with
 * `NCRYPT_CLAIM_AUTHORITY_AND_SUBJECT_TYPE`, qualified with the AAuth
 * challenge propagated as `NCRYPT_CLAIM_NONCE_PROPERTY` and bound via
 * `extraData = SHA-256(challenge || jkt)`, returning the raw
 * `certInfo`, `pubArea`, AIK signature, and AIK chain ready to feed
 * into the AAuth `cnf.attestation` envelope.
 *
 * Returned shape lines up exactly with the WebAuthn `tpm` format
 * consumed by `verifyTpm2Attestation` on the server side (FU-3) — the
 * server does not distinguish between TBS and Linux TPM2 producers.
 */
export function attest(opts: AttestOptions): AttestResult {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-win-tbs: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.attest(opts);
}
