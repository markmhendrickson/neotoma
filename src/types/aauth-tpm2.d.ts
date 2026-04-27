/**
 * Ambient declaration for the optional `@neotoma/aauth-tpm2` native
 * package.
 *
 * The package ships only on Linux and is wired up as an
 * `optionalDependency` in the root `package.json`. We keep the type
 * surface in sync with the actual implementation in
 * `packages/aauth-tpm2/src/ts/index.ts` so the rest of the codebase
 * can reference it without forcing TS to resolve the (CommonJS-only)
 * package source under `rootDir`.
 *
 * If you change one side, update the other.
 */
declare module "@neotoma/aauth-tpm2" {
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
    handle: string;
    hierarchy: Hierarchy;
    alg: SupportedAlg;
  }

  export interface SignOptions {
    handle: string;
    /** Precomputed message digest (32 bytes for SHA-256). */
    digest: Buffer;
    alg: SupportedAlg;
  }

  export interface AttestOptions {
    handle: string;
    /** AAuth attestation challenge — base64url `SHA-256(iss||sub||iat)`. */
    challenge: string;
    /** RFC 7638 thumbprint of the bound JWK. */
    jkt: string;
  }

  export interface AttestResult {
    format: "tpm2";
    ver: "2.0";
    alg: SupportedAlg;
    x5c: string[];
    sig: string;
    certInfo: string;
    pubArea: string;
  }

  export function isSupported(): NativeSupportProbe;
  export function generateKey(opts?: GenerateKeyOptions): GenerateKeyResult;
  export function sign(opts: SignOptions): Buffer;
  export function attest(opts: AttestOptions): AttestResult;
}
