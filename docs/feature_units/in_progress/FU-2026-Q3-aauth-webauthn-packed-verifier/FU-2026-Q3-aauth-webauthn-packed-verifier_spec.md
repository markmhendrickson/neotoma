---
title: "Feature Unit: FU-2026-Q3-aauth-webauthn-packed-verifier — WebAuthn `packed` Server-Side Verifier"
summary: "**Status:** In Progress **Priority:** P1 (unblocks broad hardware-attestation coverage) **Risk Level:** Medium (write-path tier resolution, cryptographic verification) **Target Release:** v0.9.0 **Owner:** Engineering **Created:** 2026-0..."
---

# Feature Unit: FU-2026-Q3-aauth-webauthn-packed-verifier — WebAuthn `packed` Server-Side Verifier

**Status:** In Progress
**Priority:** P1 (unblocks broad hardware-attestation coverage)
**Risk Level:** Medium (write-path tier resolution, cryptographic verification)
**Target Release:** v0.9.0
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Replace the v0.8.0 stub at `src/services/aauth_attestation_webauthn_packed.ts`
(which always returns `{ verified: false, reason: "not_implemented" }`)
with a real verifier for the W3C WebAuthn §8.2 `packed` attestation
statement format. WebAuthn-`packed` is the most widely deployed
attestation format across FIDO2 / WebAuthn ecosystems and is the path
FU-6 (YubiKey CLI) routes its slot-9c attestations through, so shipping
this verifier first is the unblocker for the broader hardware-tier
fleet beyond Apple Secure Enclave.

**User Value:**
- Operators running FIDO2 / WebAuthn-style authenticators that emit
  `packed` envelopes (YubiKey, Solo, Titan, browser-resident platform
  authenticators) can finally earn the `hardware` tier instead of
  silently being downgraded to `software`.
- Removes a deliberate stub from the v0.8.0 verifier dispatch table
  without changing the envelope or wire format.
- Establishes a deterministic AAGUID admission pipeline that future
  CLI sources (FU-6 YubiKey, any future FIDO2-emitting backend) can
  reuse.

**Technical Approach (high level):**
- Parse the WebAuthn §8.2 `packed` statement: `alg` (COSE algorithm
  identifier), `sig` (signature bytes, base64url), `x5c` (DER chain,
  leaf-first, base64url), optional AAGUID extracted from the leaf cert
  extension OID `1.3.6.1.4.1.45724.1.1.4`.
- Validate the `x5c` chain to a trusted attestation root via the
  existing `aauth_attestation_trust_config.ts` merged trust set
  (bundled Apple root + operator-supplied CAs, with WebAuthn-specific
  CAs added through `NEOTOMA_AAUTH_ATTESTATION_CA_PATH`).
- Verify `sig` over `SHA-256(challenge || jkt)` (mirroring the Apple
  SE verifier's bound-challenge derivation), using the leaf
  certificate's public key. The `alg` field disambiguates between
  ECDSA-P256, ECDSA-P384, RSA-PKCS1-SHA256, and RSA-PSS-SHA256;
  unsupported algorithms yield `signature_invalid` rather than throwing.
- Bind the leaf credential public key to `cnf.jwk` via RFC 7638
  thumbprint comparison (constant-time string equality), reusing the
  Apple SE verifier's `key_binding_failed` reason on mismatch.
- AAGUID admission via existing `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`
  loaded by `aauth_attestation_trust_config.ts`. When the allowlist is
  empty the AAGUID gate is skipped; when populated, an unknown or
  missing AAGUID yields a new failure reason `aaguid_not_trusted`.

## Requirements

### Functional Requirements

1. **Statement parsing.** The verifier MUST parse a `packed` statement
   into a typed shape with `alg: number`, `sig: string` (base64url),
   `x5c: string[]` (base64url DER, leaf-first). Missing or
   non-string-array `x5c` MUST yield `chain_invalid`. Missing `alg` /
   `sig` MUST yield `malformed`. The optional ECDAA path is NOT
   supported and is rejected with `unsupported_format` reason mapping
   when `ecdaaKeyId` is set.

2. **AAGUID extraction.** When the leaf certificate carries the OID
   `1.3.6.1.4.1.45724.1.1.4` extension, the verifier MUST decode the
   16-byte payload as a lower-case hyphenated UUID. When the operator
   trust list (`NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`) is non-empty,
   the extracted AAGUID MUST appear in it, otherwise the verifier
   MUST return `{ verified: false, reason: "aaguid_not_trusted" }`.
   When the operator trust list is empty, AAGUID admission is skipped
   (FIDO2 ecosystem fallback).

3. **Chain validation.** The verifier MUST walk `x5c` leaf→root,
   confirming each certificate verifies under the next, and MUST
   accept only when the terminal certificate is rooted in the merged
   trust set returned by `loadAttestationTrustConfig()`. Failure MUST
   yield `chain_invalid`.

4. **Signature verification.** The verifier MUST verify `sig` over
   `SHA-256(challenge || jkt)` using the leaf public key and the
   COSE-derived algorithm. Supported COSE algorithm IDs:
   - `-7` (ES256, ECDSA-P256-SHA256)
   - `-35` (ES384, ECDSA-P384-SHA384)
   - `-257` (RS256, RSASSA-PKCS1-v1_5-SHA256)
   - `-37` (PS256, RSA-PSS-SHA256)
   Unsupported `alg` values MUST return `signature_invalid` with a
   diagnostic note rather than throw.

5. **Key binding.** The verifier MUST compute the RFC 7638 thumbprint
   of the leaf certificate's public key, MUST compare it against
   `ctx.boundJkt` in constant time, and MUST return
   `key_binding_failed` on mismatch.

6. **Failure reason taxonomy.** The verifier MUST extend
   `AttestationFailureReason` in
   `src/services/aauth_attestation_verifier.ts` with
   `"aaguid_not_trusted"` (no other new reasons). All existing reason
   codes (`malformed`, `chain_invalid`, `signature_invalid`,
   `key_binding_failed`, `challenge_mismatch`) MUST be reused where
   semantically appropriate.

### Non-Functional Requirements

1. **No external crypto dependencies.** The verifier MUST use only
   `node:crypto` primitives (`X509Certificate`, `createVerify`,
   `createPublicKey`, `createHash`); no `webcrypto`-only paths and no
   third-party `node-rsa` / `pkijs` / `cose` packages. RFC 7638
   thumbprint generation reuses the existing `jose.calculateJwkThumbprint`
   import already used by the Apple SE verifier.

2. **Constant-time comparisons.** All thumbprint and challenge
   comparisons MUST use the constant-time string-equality helper
   already used by `aauth_attestation_apple_se.ts`. The verifier MUST
   NOT short-circuit on mismatch length.

3. **No throwing.** The verifier MUST return a structured outcome on
   every input shape; thrown exceptions inside parsing/cryptography
   MUST be caught and converted to a failure outcome with the closest
   semantically appropriate reason.

4. **Type safety.** No `any` casts in the implementation; all
   cross-format types live on `AttestationOutcome` /
   `AttestationFailureReason` exports.

### Invariants

**MUST:**
- MUST treat absence of `x5c` (or empty array) identically to
  `chain_invalid`.
- MUST extract AAGUID before chain validation so that an unknown
  AAGUID short-circuits the cost of full chain walking when the
  operator trust list is configured.
- MUST keep failure-mode behavior aligned with the Apple SE verifier:
  any failure cascades to the operator-allowlist tier or `software`
  rather than rejecting the request.

**MUST NOT:**
- MUST NOT support the ECDAA path (deprecated by W3C; fail with
  `unsupported_format` mapped via the existing `unsupported_format`
  reason code emitted by the dispatcher).
- MUST NOT trust an `x5c` chain whose terminal cert is not rooted in
  the merged trust set, even when the chain internally verifies.
- MUST NOT bypass AAGUID admission when the trust list is non-empty,
  even on otherwise-valid chains.

## Affected Subsystems

**Primary:**
- **AAuth attestation verifier** (`src/services/aauth_attestation_webauthn_packed.ts` — rewrite)
- **AAuth verifier dispatch** (`src/services/aauth_attestation_verifier.ts` — extend `AttestationFailureReason`)
- **Trust config** (`src/services/aauth_attestation_trust_config.ts` — no code change; consume `webauthnAaguidAllowlist`)

**Documentation:**
- `docs/subsystems/aauth_attestation.md` (flip `webauthn-packed` row from "stub" to "verified" with supported subset)
- `docs/subsystems/agent_attribution_integration.md` (decision diagnostics: `aaguid_not_trusted` failure reason)

**Tests:**
- `tests/unit/aauth_attestation_webauthn_packed.test.ts` (new) — synthetic CA + leaf chain, `verified` / `chain_invalid` / `aaguid_not_trusted` / `signature_invalid` / `key_binding_failed`.
- `tests/integration/aauth_webauthn_packed_e2e.test.ts` (new) — runtime-generated chain end-to-end against the AAuth middleware.

**Dependencies:**
- v0.8.0 envelope dispatcher (`src/services/aauth_attestation_verifier.ts`) — already in main.
- v0.8.0 trust config (`src/services/aauth_attestation_trust_config.ts`) — already in main.

## Out of Scope

- **ECDAA path.** Deprecated by W3C; intentionally ignored.
- **FIDO U2F attestation format.** Legacy register-only format; would be
  a separate FU if ever requested.
- **Browser platform-authenticator attestations** that rely on
  Apple/Google attestation root extensions outside the standard `x5c`
  chain (anonymous-attestation paths). Out of scope; will surface as
  `chain_invalid` until a dedicated FU adds those roots.
- **Inspector visualization of `aaguid_not_trusted` failure reason** —
  covered by FU-1 once this verifier emits it.

## Acceptance Criteria

1. `src/services/aauth_attestation_webauthn_packed.ts` returns a
   verified outcome for a synthetic `verified` fixture (well-formed
   chain, matching AAGUID, valid ECDSA-P256 signature, matching
   thumbprint).
2. The same verifier returns `chain_invalid`, `aaguid_not_trusted`,
   `signature_invalid`, `key_binding_failed`, and `malformed` for the
   correspondingly-corrupted fixtures.
3. `AttestationFailureReason` includes `aaguid_not_trusted`; the
   v0.8.0 dispatcher continues to compile cleanly.
4. `tests/unit/aauth_attestation_webauthn_packed.test.ts` and
   `tests/integration/aauth_webauthn_packed_e2e.test.ts` pass under
   `npx vitest run`.
5. `npx tsc --noEmit` at repository root passes cleanly.
6. `docs/subsystems/aauth_attestation.md` flips the `webauthn-packed`
   row from "stub" to "verified" and documents the supported COSE
   algorithm subset.
