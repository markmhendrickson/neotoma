/**
 * Ambient declaration for the optional `@neotoma/aauth-yubikey` native
 * package.
 *
 * The package ships across darwin / linux / win32 (the YubiKey is an
 * external USB device) and is wired up as an `optionalDependency` in
 * the root `package.json`. We keep the type surface in sync with the
 * actual implementation in `packages/aauth-yubikey/src/ts/index.ts` so
 * the rest of the codebase can reference it without forcing TS to
 * resolve the (CommonJS-only) package source under `rootDir`.
 *
 * If you change one side, update the other.
 */
declare module "@neotoma/aauth-yubikey" {
  export type SupportedAlg = "ES256";
  export type PivSlot = "9c";

  export interface NativeSupportProbe {
    supported: boolean;
    reason?: string;
  }

  export interface GenerateKeyOptions {
    pkcs11Path?: string;
    slot?: PivSlot;
    alg?: SupportedAlg;
    pin?: string;
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
    slot: PivSlot;
    alg: SupportedAlg;
    /** YubiKey serial number (decimal string). */
    serial: string;
    /** Resolved libykcs11 path. */
    pkcs11Path: string;
    /** Per-slot YubiKey PIV attestation cert (base64url DER). */
    attestationCert: string;
    /** F9 attestation intermediate cert (base64url DER). */
    attestationIntermediate: string;
    /** YubiKey 5 series AAGUID (base64url). */
    aaguid: string;
  }

  export interface SignOptions {
    pkcs11Path?: string;
    slot: PivSlot;
    /** Precomputed message digest (32 bytes for SHA-256). */
    digest: Buffer;
    alg: SupportedAlg;
    pin?: string;
    serial?: string;
  }

  export interface AttestOptions {
    pkcs11Path?: string;
    slot: PivSlot;
    /** AAuth attestation challenge — base64url `SHA-256(iss||sub||iat)`. */
    challenge: string;
    /** RFC 7638 thumbprint of the bound JWK. */
    jkt: string;
    pin?: string;
    serial?: string;
  }

  export interface AttestResult {
    format: "packed";
    /** COSE algorithm identifier (-7 for ES256). */
    alg: number;
    /** Base64url DER ECDSA signature. */
    sig: string;
    /** Cert chain leaf-first: per-slot cert, F9 intermediate. */
    x5c: string[];
    /** YubiKey 5 series AAGUID (base64url). */
    aaguid: string;
  }

  export function isSupported(opts?: {
    pkcs11Path?: string;
  }): NativeSupportProbe;
  export function generateKey(opts?: GenerateKeyOptions): GenerateKeyResult;
  export function sign(opts: SignOptions): Buffer;
  export function attest(opts: AttestOptions): AttestResult;
}
