/**
 * Ambient declaration for the optional `@neotoma/aauth-mac-se` native
 * package.
 *
 * The package ships only on macOS and is wired up as an
 * `optionalDependency` in the root `package.json`. We keep the type
 * surface in sync with the actual implementation in
 * `packages/aauth-mac-se/src/ts/index.ts` so the rest of the codebase
 * can reference it without forcing TS to resolve the (CommonJS-only)
 * package source under `rootDir`.
 *
 * If you change one side, update the other.
 */
declare module "@neotoma/aauth-mac-se" {
  export interface SecureEnclaveSupportProbe {
    supported: boolean;
    reason?: string;
  }

  export interface GenerateKeyOptions {
    tag: string;
  }

  export interface GenerateKeyResult {
    jwk: { kty: "EC"; crv: "P-256"; x: string; y: string };
    keyTag: string;
  }

  export interface SignOptions {
    tag: string;
    /** SHA-256 message digest will be computed natively over `message`. */
    message: Buffer;
  }

  export interface AttestOptions {
    tag: string;
    challenge: string;
  }

  export interface AttestResult {
    format: "apple-secure-enclave";
    attestation_blob: string;
    signature_blob: string;
  }

  export function isSupported(): SecureEnclaveSupportProbe;
  export function generateKey(opts: GenerateKeyOptions): GenerateKeyResult;
  export function sign(opts: SignOptions): Buffer;
  export function attest(opts: AttestOptions): AttestResult;
}
