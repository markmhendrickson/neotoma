/**
 * Public surface for `@neotoma/aauth-tpm2`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On non-Linux
 * hosts the binary will not exist; we surface this as
 * `{ supported: false, reason }` rather than throwing so the CLI can
 * branch to its software-key fallback.
 */
/// <reference types="node" />
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
/**
 * Capability probe. Returns `{ supported: false, reason }` rather than
 * throwing so the CLI can render a clean fallback message.
 */
export declare function isSupported(): NativeSupportProbe;
/**
 * Generate a new TPM-resident key under a persistent handle and return
 * the public JWK plus the handle. The private scalar never leaves the
 * TPM.
 */
export declare function generateKey(opts?: GenerateKeyOptions): GenerateKeyResult;
/**
 * Sign `digest` (a precomputed message digest) with the TPM-resident
 * key identified by `handle`.
 */
export declare function sign(opts: SignOptions): Buffer;
/**
 * Run TPM 2.0 attestation against the TPM-resident key identified by
 * `handle`. Issues `TPM2_Quote` (or `TPM2_Certify`) with
 * `qualifyingData = SHA-256(challenge || jkt)` and returns the raw
 * structures ready to feed into the AAuth `cnf.attestation` envelope.
 */
export declare function attest(opts: AttestOptions): AttestResult;
//# sourceMappingURL=index.d.ts.map
