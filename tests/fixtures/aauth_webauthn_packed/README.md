# aauth_webauthn_packed fixtures

Notes on fixture material used by the WebAuthn `packed` attestation
verifier (`src/services/aauth_attestation_webauthn_packed.ts`).

## What's here

Nothing on disk. WebAuthn `packed` chains contain authenticator-specific
secrets (private keys, AAGUIDs that may match real consumer
authenticators). Rather than commit fixtures, the test suite generates
fresh fixtures at runtime via the user's `openssl` binary, the same
approach used by `aauth_attestation_apple_se.test.ts`.

## How fixtures are generated

Both `tests/unit/aauth_attestation_webauthn_packed.test.ts` and
`tests/integration/aauth_webauthn_packed_e2e.test.ts` create a temporary
directory under `os.tmpdir()` and run a short openssl chain there:

1. Generate an EC P-256 root CA (`root.key`, `root.crt`).
2. Generate an EC P-256 leaf key + CSR (`leaf.key`, `leaf.csr`).
3. Sign the CSR using the root with an extension config that adds:
   - `basicConstraints=CA:FALSE`
   - `1.3.6.1.4.1.45724.1.1.4 = DER:04:10:<16-byte AAGUID hex>`
     — the FIDO `id-fido-gen-ce-aaguid` extension. openssl wraps this
     payload in an outer extnValue OCTET STRING automatically, so the
     leaf cert ends up with the canonical
     `OCTET STRING { OCTET STRING { 16 bytes }}` encoding most
     authenticators emit.
4. (Integration only) Write a JSON allowlist with the same AAGUID and
   point `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH` at it.

For the RSA path coverage the unit test additionally generates an
RSA-2048 root + leaf using the same extension config so the
`alg=-257` (RSASSA-PKCS1-v1_5 + SHA-256) branch is exercised.

The temp directory is removed in `afterAll`. There are no committed
PEM/DER fixtures.

## Why no committed fixtures?

- WebAuthn `packed` chains carry per-vendor metadata (AAGUIDs that
  identify YubiKey models, TPM manufacturers, etc.). Committing real
  vendor chains would either embed the test against a specific vendor
  or require continuous metadata updates.
- The verifier is deterministic over its inputs (statement bytes +
  trust config + bound challenge); runtime generation gives identical
  coverage with no fixture drift.
- openssl is available in CI and on developer machines; the Apple SE
  verifier already uses the same pattern.

## When to commit fixtures

Only when we need to assert against vendor-specific behavior that the
synthetic chain cannot reproduce. So far we don't — the verifier's
public surface is purely structural (parse, walk chain, bind key,
verify signature). If a real bug surfaces against a particular
authenticator, capture a redacted fixture under
`tests/fixtures/aauth_webauthn_packed/<vendor>/` and link it from the
relevant unit test.
