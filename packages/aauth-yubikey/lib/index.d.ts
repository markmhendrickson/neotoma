/**
 * Public surface for `@neotoma/aauth-yubikey`.
 *
 * Cross-platform YubiKey native binding for Neotoma AAuth. Generates
 * PIV slot 9c-resident keys via the Yubico PKCS#11 provider
 * (libykcs11) and produces WebAuthn-`packed`-format attestation
 * envelopes via the YKPIV_INS_ATTEST APDU.
 */
/// <reference types="node" />
export type SupportedAlg = "ES256";
/** PIV slot identifier; only `9c` is supported. */
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
    /** YubiKey serial number (decimal string). Persisted in signer.json. */
    serial: string;
    /** Resolved libykcs11 path. Persisted in signer.json. */
    pkcs11Path: string;
    /** Per-slot YubiKey PIV attestation cert (base64url DER, leaf). */
    attestationCert: string;
    /** F9 attestation intermediate cert (base64url DER). */
    attestationIntermediate: string;
    /** YubiKey 5 series AAGUID (base64url). */
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
     * AAuth attestation challenge — base64url
     * `SHA-256(iss || sub || iat)` computed CLI-side.
     */
    challenge: string;
    /**
     * RFC 7638 thumbprint of the bound JWK. The binding constructs
     * `clientDataHash = SHA-256(challenge || jkt)`.
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
    /** Cert chain leaf-first: per-slot cert, F9 intermediate. */
    x5c: string[];
    /** YubiKey 5 series AAGUID (base64url). */
    aaguid: string;
}
/**
 * Capability probe. Returns `{ supported: false, reason }` rather than
 * throwing so the CLI can render a clean fallback message.
 */
export declare function isSupported(opts?: {
    pkcs11Path?: string;
}): NativeSupportProbe;
/**
 * Generate a new YubiKey-resident key in PIV slot 9c.
 */
export declare function generateKey(opts?: GenerateKeyOptions): GenerateKeyResult;
/**
 * Sign `digest` with the YubiKey-resident key in PIV slot 9c.
 */
export declare function sign(opts: SignOptions): Buffer;
/**
 * Run YubiKey PIV attestation against the slot 9c-resident key and
 * return a WebAuthn-`packed` envelope.
 */
export declare function attest(opts: AttestOptions): AttestResult;
//# sourceMappingURL=index.d.ts.map
