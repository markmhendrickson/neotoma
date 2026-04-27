# Feature Unit: FU-2026-Q3-aauth-tpm2-verifier — TPM 2.0 Server-Side Verifier

**Status:** In Progress
**Priority:** P1 (unblocks Linux/Windows hardware-tier coverage)
**Risk Level:** Medium (write-path tier resolution, custom binary parser)
**Target Release:** v0.9.0
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Replace the v0.8.0 stub at `src/services/aauth_attestation_tpm2.ts` (which always
returns `{ verified: false, reason: "not_implemented" }`) with a real verifier for
the WebAuthn `tpm` attestation statement format (W3C WebAuthn §8.3). TPM 2.0 is
the universal hardware-root-of-trust on Linux servers, modern Windows endpoints,
and corporate-managed devices, so shipping the server-side verifier first is the
prerequisite for FU-4 (Linux TPM2 CLI) and FU-5 (Windows TBS CLI) — both of those
sources produce TPM 2.0-format quotes that need a server-side counterpart.

**User Value:**
- Operators running Linux servers or Windows endpoints with TPM 2.0 hardware can
  finally earn the `hardware` tier instead of being silently downgraded.
- Removes the second deliberate stub from the v0.8.0 verifier dispatch table
  without changing the envelope or wire format.
- Establishes a TPM 2.0 trust-root distribution channel
  (`config/aauth/tpm_attestation_roots/`) that downstream CLI sources can rely on.

**Technical Approach (high level):**
- Parse the WebAuthn §8.3 `tpm` statement: `ver` (must be `"2.0"`), `alg`
  (COSE algorithm of the AIK signature), `x5c` (AIK chain, leaf-first, base64url
  DER), `sig` (signature bytes over `certInfo`, base64url), `certInfo` (the TPM
  `TPMS_ATTEST` quote payload, base64url big-endian binary), and `pubArea` (the
  TPM `TPMT_PUBLIC` of the bound key, base64url big-endian binary). Reject
  envelopes with `ver !== "2.0"` as `unsupported_format`.
- Walk the AIK chain to a trusted TPM CA root via the existing
  `aauth_attestation_trust_config.ts` merged trust set, after extending it with
  TPM-specific roots loaded from `config/aauth/tpm_attestation_roots/` (Infineon,
  STMicro, Intel, AMD bundles).
- Verify `sig` over the raw `certInfo` bytes using the AIK leaf's public key and
  the COSE-derived algorithm. Mismatched algorithms yield `signature_invalid`
  rather than throwing.
- Decode `pubArea` using a hand-written `TPMT_PUBLIC` parser, extract the bound
  public key, and verify it via RFC 7638 thumbprint comparison against
  `cnf.jwk`. Mismatches return `key_binding_failed`.
- Decode `certInfo` using a hand-written `TPMS_ATTEST` parser, validate the
  `extraData` field (which carries our challenge derivation) matches the bound
  challenge, validate `magic` and `type`, and confirm the quoted key digest
  matches the SHA-256 of the bound `pubArea`. Mismatches return
  `challenge_mismatch` (extraData) or `pubarea_mismatch` (digest).
- The TPMS_ATTEST + TPMT_PUBLIC parser MUST be implemented by hand against the
  TCG TPM 2.0 Library spec (Part 2 — Structures). NO external TPM library
  dependency. The parser lives in a dedicated module
  (`src/services/aauth_tpm_structures.ts`) so it can be unit-tested in isolation
  and reused by tests.

## Requirements

### Functional Requirements

1. **Statement parsing.** The verifier MUST parse a `tpm` statement into a typed
   shape with `ver: "2.0"`, `alg: number`, `sig: string` (base64url),
   `x5c: string[]` (base64url DER, leaf-first), `certInfo: string` (base64url
   binary), `pubArea: string` (base64url binary). Missing or non-string `ver`
   MUST yield `malformed`. Missing or non-`"2.0"` `ver` MUST yield
   `unsupported_format`. Missing/empty `x5c` MUST yield `chain_invalid`. Missing
   `alg`, `sig`, `certInfo`, or `pubArea` MUST yield `malformed`.

2. **TPMT_PUBLIC parser.** A hand-written big-endian, length-prefixed decoder in
   `src/services/aauth_tpm_structures.ts` MUST extract: `type` (TPM_ALG_RSA /
   TPM_ALG_ECC), `nameAlg`, `objectAttributes`, `parameters` (RSA/ECC scheme),
   and `unique` (the public key bytes). For RSA keys, MUST emit a Node-compatible
   public-key object via `crypto.createPublicKey({ format: "jwk", key: { kty:
   "RSA", n: ..., e: ... }})`. For ECC keys, MUST emit P-256 / P-384 / P-521 keys
   via the same pathway. Malformed input MUST throw a typed error caught by the
   verifier and converted to `malformed`.

3. **TPMS_ATTEST parser.** A hand-written big-endian decoder MUST extract:
   `magic` (must equal `0xff544347` "TCG"), `type` (must equal
   `TPM_ST_ATTEST_QUOTE` `0x8014` for quotes, OR
   `TPM_ST_ATTEST_CERTIFY` `0x8017` when binding key residency), `qualifiedSigner`,
   `extraData` (the raw bytes that carry our challenge derivation),
   `clockInfo`, `firmwareVersion`, and the type-specific `attested` body. For
   `TPM_ST_ATTEST_CERTIFY`, the `attested.name` field MUST decode as
   `nameAlg || digest(pubArea)`. Magic mismatch MUST yield `malformed`. Type
   outside the supported set MUST yield `unsupported_format`.

4. **Chain validation.** The verifier MUST walk `x5c` leaf→root, confirming each
   certificate verifies under the next, AND MUST accept only when the terminal
   certificate is rooted in the merged trust set returned by
   `loadAttestationTrustConfig()`. Failure MUST yield `chain_invalid`.

5. **Signature verification.** The verifier MUST verify `sig` over the raw
   `certInfo` bytes (NOT a re-encoded version) using the AIK leaf public key and
   the COSE-derived algorithm. Supported COSE algorithm IDs:
   - `-7` (ES256, ECDSA-P256-SHA256)
   - `-35` (ES384, ECDSA-P384-SHA384)
   - `-257` (RS256, RSASSA-PKCS1-v1_5-SHA256)
   - `-37` (PS256, RSASSA-PSS-SHA256)
   Unsupported `alg` values MUST return `signature_invalid` with a diagnostic
   note rather than throw.

6. **Key binding (pubArea → cnf.jwk).** The verifier MUST extract the public
   key from `pubArea` (via the TPMT_PUBLIC parser), MUST compute its RFC 7638
   thumbprint, and MUST compare against `ctx.boundJkt` in constant time. A
   mismatch MUST return `key_binding_failed`.

7. **Quote binding (extraData → bound challenge).** The verifier MUST verify
   that `certInfo.extraData` equals `SHA-256(challenge || jkt)`, the same
   binding the Apple SE / WebAuthn-packed verifiers use. Mismatch MUST return
   `challenge_mismatch`.

8. **PubArea binding (certify name → SHA-256(pubArea)).** When `certInfo.type`
   is `TPM_ST_ATTEST_CERTIFY`, the verifier MUST decode `attested.name` as
   `nameAlg || digest`, recompute the digest of the supplied `pubArea` under the
   matching algorithm, and confirm equality. Mismatch MUST return a NEW failure
   reason `pubarea_mismatch`.

9. **Failure reason taxonomy.** The verifier MUST extend
   `AttestationFailureReason` with `"pubarea_mismatch"` (one new reason this
   FU; `aaguid_not_trusted` was added in FU-2). All existing reason codes MUST
   be reused where semantically appropriate.

### Non-Functional Requirements

1. **No external TPM dependency.** The TPMS_ATTEST + TPMT_PUBLIC parser MUST be
   implemented from scratch against the TCG TPM 2.0 Library spec Part 2
   (Structures). No `tpm2-tss`, `node-tpm2`, or comparable runtime dependency.
   The verifier MAY use `node:crypto` primitives only.

2. **Constant-time comparisons.** All thumbprint, extraData, and certify-name
   comparisons MUST use a constant-time helper. The verifier MUST NOT
   short-circuit on mismatch length.

3. **No throwing.** The verifier MUST return a structured outcome on every
   input shape; thrown exceptions inside parsing or cryptography MUST be caught
   and converted to a failure outcome with the closest semantically appropriate
   reason.

4. **Type safety.** No `any` casts in the implementation. The TPMT_PUBLIC parser
   MUST emit a discriminated union (`{ type: "rsa", n: Buffer, e: Buffer }` /
   `{ type: "ecc", curve: "P-256" | "P-384" | "P-521", x: Buffer, y: Buffer }`).

5. **Trust root provenance.** The `config/aauth/tpm_attestation_roots/` bundle
   MUST include a `README.md` listing every CA's source URL, vendor, and
   SHA-256 fingerprint, mirroring the bundled Apple root convention.

### Invariants

**MUST:**
- MUST verify the AIK signature over the raw `certInfo` bytes — not a
  re-encoded copy — to avoid normalisation footguns.
- MUST decode `pubArea` deterministically; the same input bytes MUST always
  produce the same parsed shape.
- MUST keep failure-mode behavior aligned with the Apple SE / WebAuthn-packed
  verifiers: any failure cascades to the operator-allowlist tier or
  `software` rather than rejecting the request.

**MUST NOT:**
- MUST NOT trust an `x5c` chain whose terminal cert is not rooted in the
  merged trust set, even when the chain internally verifies.
- MUST NOT bypass key binding when the `pubArea` parser succeeds but produces a
  thumbprint that disagrees with `cnf.jwk`.
- MUST NOT support TPM 1.2 quote payloads (`ver !== "2.0"` short-circuits).
- MUST NOT shell out to `tpm2-tools` or any external binary; the verifier runs
  entirely inside the Node.js process.

## Affected Subsystems

**Primary:**
- **AAuth attestation verifier** (`src/services/aauth_attestation_tpm2.ts` —
  rewrite)
- **TPM structure parser** (`src/services/aauth_tpm_structures.ts` — new)
- **AAuth verifier dispatch** (`src/services/aauth_attestation_verifier.ts` —
  extend `AttestationFailureReason` with `pubarea_mismatch`)
- **Trust config** (`src/services/aauth_attestation_trust_config.ts` — extend
  to load `config/aauth/tpm_attestation_roots/`)

**Documentation:**
- `docs/subsystems/aauth_attestation.md` (flip `tpm2` row from "stub" to
  "verified" with supported subset)
- `docs/subsystems/agent_attribution_integration.md` (decision diagnostics:
  `pubarea_mismatch` failure reason)

**Tests:**
- `tests/unit/aauth_attestation_tpm2.test.ts` (new) — synthetic AIK chain +
  hand-authored TPMS_ATTEST + TPMT_PUBLIC byte buffers, covering `verified`,
  `chain_invalid`, `signature_invalid`, `key_binding_failed`,
  `pubarea_mismatch`, `challenge_mismatch`, `unsupported_format` (TPM 1.2),
  `malformed` (parser error inputs).
- `tests/unit/aauth_tpm_structures.test.ts` (new) — pure parser tests covering
  TPMT_PUBLIC RSA/ECC variants and TPMS_ATTEST quote / certify variants.
- `tests/integration/aauth_tpm2_e2e.test.ts` (new) — runtime-generated AIK
  chain end-to-end against the AAuth middleware.

**Configuration:**
- `config/aauth/tpm_attestation_roots/` (new directory) with `README.md`
  documenting bundled Infineon / STMicro / Intel / AMD roots.

**Dependencies:**
- v0.8.0 envelope dispatcher (`src/services/aauth_attestation_verifier.ts`) —
  already in main.
- v0.8.0 trust config (`src/services/aauth_attestation_trust_config.ts`) —
  already in main; this FU extends it with TPM-specific roots.
- FU-2 (WebAuthn-packed verifier) — for shared `aaguid_not_trusted` reason
  (no direct code dependency, but ships in the same release window).

## Out of Scope

- **TPM 1.2 quote payloads.** Deprecated; `ver !== "2.0"` rejects.
- **Quote-protocol negotiation / server-issued nonce.** We accept whatever the
  client signed, with our deterministic `SHA-256(challenge || jkt)` derivation.
- **Live TPM hardware in tests.** All fixtures are synthetic byte buffers.
  The Linux TPM2 CLI smoke tests in FU-4 will exercise real hardware paths.
- **Inspector visualization of `pubarea_mismatch` failure reason.** Covered by
  FU-1 once this verifier emits it.

## Acceptance Criteria

1. `src/services/aauth_attestation_tpm2.ts` returns a verified outcome for a
   synthetic well-formed envelope (valid AIK chain, valid signature, matching
   thumbprint, matching extraData, matching pubArea digest).
2. The same verifier returns `chain_invalid`, `signature_invalid`,
   `key_binding_failed`, `pubarea_mismatch`, `challenge_mismatch`,
   `unsupported_format` (TPM 1.2), and `malformed` for the correspondingly
   corrupted fixtures.
3. `AttestationFailureReason` includes `pubarea_mismatch`; the v0.8.0 / v0.9.0
   dispatcher continues to compile cleanly.
4. `tests/unit/aauth_attestation_tpm2.test.ts`,
   `tests/unit/aauth_tpm_structures.test.ts`, and
   `tests/integration/aauth_tpm2_e2e.test.ts` pass under `npx vitest run`.
5. `npx tsc --noEmit` at repository root passes cleanly.
6. `docs/subsystems/aauth_attestation.md` flips the `tpm2` row from "stub" to
   "verified" and documents the supported COSE algorithm subset and the bundled
   TPM CA roots.
7. `config/aauth/tpm_attestation_roots/README.md` lists every bundled root with
   source URL and SHA-256 fingerprint.
