/**
 * Public surface for `@neotoma/aauth-mac-se`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On non-macOS
 * hosts the binary will not exist; we surface this as
 * `{ supported: false, reason }` rather than throwing so the CLI can
 * branch to its software-key fallback.
 */
/**
 * Capability probe. Returns `{ supported: false, reason }` rather than
 * throwing so the CLI can render a clean fallback message.
 */
export declare function isSupported(): {
    supported: boolean;
    reason?: string;
};
/**
 * Generate a new SE-backed P-256 keypair. The private key remains in the
 * Secure Enclave; only the public JWK is returned. `tag` is the
 * application-tag identifier under which the key is stored in the
 * keychain — pass the same value to {@link attest} to sign with this key.
 */
export declare function generateKey(opts: {
    tag: string;
}): {
    jwk: {
        kty: "EC";
        crv: "P-256";
        x: string;
        y: string;
    };
    keyTag: string;
};
/**
 * Sign `message` (a precomputed SHA-256 digest, 32 bytes) with the
 * SE-backed P-256 key identified by `tag`. Returns a DER-encoded ECDSA
 * signature suitable for either an HTTP signature payload or a JWS
 * (after conversion to JOSE r||s by the caller).
 */
export declare function sign(opts: {
    tag: string;
    message: Buffer;
}): Buffer;
/**
 * Run Apple App Attestation against the SE-backed key identified by
 * `tag`, binding the attestation to `challenge` (base64url
 * `SHA-256(iss || sub || iat)` per the AAuth spec).
 *
 * Returns the raw attestation blob and a separate signature blob. The
 * caller is responsible for splitting the attestation into individual
 * DER certificates and producing the final `cnf.attestation` envelope —
 * see `src/cli/aauth_signer.ts` for the wrapping logic.
 */
export declare function attest(opts: {
    tag: string;
    challenge: string;
}): {
    format: "apple-secure-enclave";
    attestation_blob: string;
    signature_blob: string;
};
//# sourceMappingURL=index.d.ts.map