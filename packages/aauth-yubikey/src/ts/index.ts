/**
 * Public surface for `@neotoma/aauth-yubikey`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On hosts
 * without `libykcs11` (the Yubico PKCS#11 provider) installed, or when
 * no YubiKey 5 series device is connected, the binding short-circuits
 * with `{ supported: false, reason }` rather than throwing so the CLI
 * can branch to the next backend in the preference ladder.
 *
 * The shape of this surface intentionally mirrors
 * `@neotoma/aauth-mac-se`, `@neotoma/aauth-tpm2`, and
 * `@neotoma/aauth-win-tbs` so the CLI signer can switch backends with
 * a single discriminator. Unlike those packages, this surface is
 * portable across darwin, linux, and win32 because the YubiKey is an
 * external USB device.
 *
 * Wire format note: the produced attestation envelope uses
 * `format: "packed"` (WebAuthn-packed) so the FU-2 server-side
 * verifier consumes YubiKey envelopes through the same code path as
 * other WebAuthn-packed producers (e.g. platform authenticators).
 * No new server-side verifier is needed.
 */

import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";

export type SupportedAlg = "ES256";

/** PIV slot identifier; only `9c` (Digital Signature) is supported. */
export type PivSlot = "9c";

export interface NativeSupportProbe {
  supported: boolean;
  reason?: string;
}

export interface GenerateKeyOptions {
  /**
   * Override path to libykcs11. When omitted, the binding searches a
   * platform-specific list of well-known locations and honours
   * `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH`.
   */
  pkcs11Path?: string;
  /** PIV slot to bind. Currently only `"9c"` is supported. */
  slot?: PivSlot;
  /** COSE alg of the produced key. Currently only `"ES256"` is supported. */
  alg?: SupportedAlg;
  /**
   * PIN value forwarded to `C_Login`. Optional — when omitted the
   * binding falls back to interactive prompt (TTY only) or
   * `NEOTOMA_AAUTH_YUBIKEY_PIN`. NEVER persisted to signer.json.
   */
  pin?: string;
  /**
   * Pin to a specific YubiKey serial number when multiple are
   * connected. Honours `NEOTOMA_AAUTH_YUBIKEY_SERIAL` when omitted.
   */
  serial?: string;
}

export type EcJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
};

export type YubikeyJwk = EcJwk;

export interface GenerateKeyResult {
  jwk: YubikeyJwk;
  /** PIV slot identifier (always `"9c"` for now). */
  slot: PivSlot;
  alg: SupportedAlg;
  /** YubiKey serial number (decimal string). Persisted in signer.json. */
  serial: string;
  /** Resolved libykcs11 path. Persisted in signer.json. */
  pkcs11Path: string;
  /** Per-slot YubiKey PIV attestation cert (base64url DER, leaf). */
  attestationCert: string;
  /**
   * F9 attestation intermediate cert (base64url DER) chaining the
   * per-slot cert to the Yubico PIV CA root.
   */
  attestationIntermediate: string;
  /**
   * AAGUID associated with this YubiKey 5 series device, base64url
   * encoded. Used to populate the `aaguid` field of the
   * WebAuthn-packed envelope.
   */
  aaguid: string;
}

export interface SignOptions {
  pkcs11Path?: string;
  slot: PivSlot;
  /** Precomputed digest to sign (32 bytes for SHA-256). */
  digest: Buffer;
  alg: SupportedAlg;
  pin?: string;
  serial?: string;
}

export interface AttestOptions {
  pkcs11Path?: string;
  slot: PivSlot;
  /**
   * AAuth attestation challenge — base64url `SHA-256(iss||sub||iat)`
   * computed CLI-side. The binding signs
   * `authenticatorData || clientDataHash` per WebAuthn-packed §8.2,
   * where `clientDataHash = SHA-256(challenge || jkt)`.
   */
  challenge: string;
  /**
   * RFC 7638 thumbprint of the bound JWK. The binding constructs
   * `clientDataHash = SHA-256(challenge || jkt)` so the server-side
   * WebAuthn-packed verifier (FU-2) can prove the signature is bound
   * to the JWT's `cnf.jwk`.
   */
  jkt: string;
  pin?: string;
  serial?: string;
}

export interface AttestResult {
  /** Wire format identifier (matches FU-2 verifier expectation). */
  format: "packed";
  /** COSE algorithm identifier (-7 for ES256). */
  alg: number;
  /** Base64url ECDSA signature in DER form. */
  sig: string;
  /**
   * Cert chain leaf-first: per-slot attestation cert, then the F9
   * attestation intermediate. Each entry is base64url DER.
   */
  x5c: string[];
  /** YubiKey 5 series AAGUID (base64url). */
  aaguid: string;
}

interface NativeBinding {
  isSupported(opts?: { pkcs11Path?: string }): NativeSupportProbe;
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
 *   - `"native binding unavailable"` — the native module failed to
 *     load (typically because the package was not installed via
 *     `optionalDependencies` on this host).
 *   - `"libykcs11 not loadable"` — neither the explicit override nor
 *     any well-known path resolves to a loadable Yubico PKCS#11
 *     provider.
 *   - `"no YubiKey detected"` — `libykcs11` loaded but
 *     `C_GetSlotList` reports no YubiKey-shaped slot.
 *   - `"YubiKey firmware too old"` — slot detected but firmware
 *     version is < 5.0.0 (no `YKPIV_INS_ATTEST` support).
 *   - `"PIN locked"` — the PIN counter is exhausted (3 failed
 *     attempts); operator must reset via `ykman piv access change-pin`.
 */
export function isSupported(opts: {
  pkcs11Path?: string;
} = {}): NativeSupportProbe {
  const binding = loadBinding();
  if (!binding) {
    return {
      supported: false,
      reason: loadError?.message ?? "native binding unavailable",
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
 * Generate a new YubiKey-resident key in PIV slot 9c and return the
 * public JWK plus the YubiKey serial number, the per-slot attestation
 * cert (chained to Yubico's PIV CA), the F9 attestation intermediate,
 * and the device AAGUID. The private scalar never leaves the YubiKey.
 *
 * `slot` defaults to `"9c"` (Digital Signature). `alg` defaults to
 * `"ES256"` (P-256) — the only YubiKey PIV alg with stable
 * cross-platform support that round-trips through the WebAuthn-packed
 * verifier.
 */
export function generateKey(opts: GenerateKeyOptions = {}): GenerateKeyResult {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-yubikey: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  const slot = opts.slot ?? "9c";
  if (slot !== "9c") {
    const err = new Error(
      `aauth-yubikey: unsupported PIV slot ${slot} (only 9c is supported)`,
    );
    (err as { code?: string }).code = "YUBIKEY_SLOT_UNSUPPORTED";
    throw err;
  }
  return binding.generateKey({
    pkcs11Path: opts.pkcs11Path,
    slot,
    alg: opts.alg ?? "ES256",
    pin: opts.pin,
    serial: opts.serial,
  });
}

/**
 * Sign `digest` (a precomputed message digest) with the YubiKey-resident
 * key in PIV slot 9c. Returns a DER-encoded ECDSA signature. The CLI
 * converts the DER form to JOSE r||s for `ES256` JWS payloads.
 *
 * The PIN policy for slot 9c is `ONCE` per session: a single
 * successful `C_Login` unlocks the slot for the lifetime of the
 * PKCS#11 session. The binding does NOT cache the PIN across CLI
 * invocations.
 */
export function sign(opts: SignOptions): Buffer {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-yubikey: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  if (opts.slot !== "9c") {
    const err = new Error(
      `aauth-yubikey: unsupported PIV slot ${opts.slot} (only 9c is supported)`,
    );
    (err as { code?: string }).code = "YUBIKEY_SLOT_UNSUPPORTED";
    throw err;
  }
  return binding.sign(opts);
}

/**
 * Run YubiKey PIV attestation against the slot 9c-resident key. Issues
 * a `YKPIV_INS_ATTEST` (0xF9) APDU through the PKCS#11 session, packages
 * the resulting per-slot cert plus the F9 intermediate into a
 * WebAuthn-`packed`-format envelope, and signs
 * `authenticatorData || clientDataHash` where
 * `clientDataHash = SHA-256(challenge || jkt)`.
 *
 * Returned shape lines up exactly with the WebAuthn `packed` format
 * consumed by `verifyWebauthnPackedAttestation` on the server side
 * (FU-2) — the server treats YubiKey envelopes uniformly with other
 * packed producers as long as the `x5c` chain roots in the configured
 * trust set (Yubico PIV CA roots bundled in
 * `config/aauth/yubico_piv_roots.pem`).
 */
export function attest(opts: AttestOptions): AttestResult {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-yubikey: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  if (opts.slot !== "9c") {
    const err = new Error(
      `aauth-yubikey: unsupported PIV slot ${opts.slot} (only 9c is supported)`,
    );
    (err as { code?: string }).code = "YUBIKEY_SLOT_UNSUPPORTED";
    throw err;
  }
  return binding.attest(opts);
}
