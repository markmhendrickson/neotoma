/**
 * Public surface for `@neotoma/aauth-tpm2`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On non-Linux
 * hosts (and on Linux hosts that lack `libtss2` or `/dev/tpmrm0`) the
 * binary will not load; we surface this as `{ supported: false, reason }`
 * rather than throwing so the CLI can branch to its software-key
 * fallback.
 *
 * The shape of this surface intentionally mirrors
 * `@neotoma/aauth-mac-se` so the CLI signer can switch backends with a
 * single discriminator.
 */

import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";

export type Hierarchy = "owner" | "endorsement";
export type SupportedAlg = "ES256" | "RS256";

export interface NativeSupportProbe {
  supported: boolean;
  reason?: string;
}

export interface GenerateKeyOptions {
  hierarchy?: Hierarchy;
  alg?: SupportedAlg;
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

export type Tpm2Jwk = EcJwk | RsaJwk;

export interface GenerateKeyResult {
  jwk: Tpm2Jwk;
  /** TPM persistent handle, hex-encoded (e.g. `0x81000000`). */
  handle: string;
  hierarchy: Hierarchy;
  alg: SupportedAlg;
}

export interface SignOptions {
  /** TPM persistent handle returned by {@link generateKey}. */
  handle: string;
  /** Precomputed digest to sign (32 bytes for SHA-256). */
  digest: Buffer;
  alg: SupportedAlg;
}

export interface AttestOptions {
  /** TPM persistent handle returned by {@link generateKey}. */
  handle: string;
  /** AAuth attestation challenge — base64url `SHA-256(iss||sub||iat)`. */
  challenge: string;
  /**
   * RFC 7638 thumbprint of the bound JWK. The binding uses
   * `extraData = SHA-256(challenge || jkt)` so the server-side TPM 2.0
   * verifier (FU-3) can prove the quote is bound to the JWT's `cnf.jwk`.
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
  if (process.platform !== "linux") {
    loadError = new Error("aauth-tpm2: only supported on linux");
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
 *   - `"non-linux host"` — runtime is not Linux.
 *   - `"libtss2 unavailable"` — `libtss2-esys.so.0` failed to load.
 *   - `"/dev/tpmrm0 not accessible"` — resource manager device is
 *     missing or not readable by the running user.
 *   - `"no TPM 2.0 device detected"` — `Esys_GetCapability` did not
 *     return TPM 2.0 properties.
 */
export function isSupported(): NativeSupportProbe {
  if (process.platform !== "linux") {
    return { supported: false, reason: "non-linux host" };
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
 * Generate a new TPM-resident key under a persistent handle and return
 * the public JWK plus the handle. The private scalar never leaves the
 * TPM. `hierarchy` defaults to `"owner"` for development ergonomics;
 * fleets that have provisioned an Endorsement Key (EK) certificate may
 * pass `{ hierarchy: "endorsement" }`. `alg` defaults to `"RS256"`
 * (RSA-2048) but may be set to `"ES256"` (ECC P-256) for newer TPMs.
 */
export function generateKey(opts: GenerateKeyOptions = {}): GenerateKeyResult {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-tpm2: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.generateKey({
    hierarchy: opts.hierarchy ?? "owner",
    alg: opts.alg ?? "RS256",
  });
}

/**
 * Sign `digest` (a precomputed message digest) with the TPM-resident
 * key identified by `handle`. Returns a DER-encoded signature
 * (ECDSA for `ES256`, PKCS1v1.5 for `RS256`). The CLI converts the
 * DER form to JOSE r||s for `ES256` JWS payloads.
 */
export function sign(opts: SignOptions): Buffer {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-tpm2: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.sign(opts);
}

/**
 * Run TPM 2.0 attestation against the TPM-resident key identified by
 * `handle`. Issues `TPM2_Quote` (for restricted signing keys) or
 * `TPM2_Certify` (for non-restricted keys) with
 * `qualifyingData = SHA-256(challenge || jkt)`, returning the raw
 * `certInfo`, `pubArea`, AIK signature, and AIK chain ready to feed
 * into the AAuth `cnf.attestation` envelope.
 *
 * Returned shape lines up exactly with the WebAuthn `tpm` format
 * consumed by `verifyTpm2Attestation` on the server side (FU-3).
 */
export function attest(opts: AttestOptions): AttestResult {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-tpm2: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.attest(opts);
}
