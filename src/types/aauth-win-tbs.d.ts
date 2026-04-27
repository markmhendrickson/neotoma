/**
 * Ambient declaration for the optional `@neotoma/aauth-win-tbs` native
 * package.
 *
 * The package ships only on Windows and is wired up as an
 * `optionalDependency` in the root `package.json`. We keep the type
 * surface in sync with the actual implementation in
 * `packages/aauth-win-tbs/src/ts/index.ts` so the rest of the codebase
 * can reference it without forcing TS to resolve the (CommonJS-only)
 * package source under `rootDir`.
 *
 * If you change one side, update the other.
 */
declare module "@neotoma/aauth-win-tbs" {
  export type Scope = "user" | "machine";
  export type SupportedAlg = "ES256" | "RS256";

  export interface NativeSupportProbe {
    supported: boolean;
    reason?: string;
  }

  export interface GenerateKeyOptions {
    provider?: string;
    scope?: Scope;
    alg?: SupportedAlg;
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
    keyName: string;
    provider: string;
    scope: Scope;
    alg: SupportedAlg;
  }

  export interface SignOptions {
    keyName: string;
    provider?: string;
    /** Precomputed message digest (32 bytes for SHA-256). */
    digest: Buffer;
    alg: SupportedAlg;
  }

  export interface AttestOptions {
    keyName: string;
    provider?: string;
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
