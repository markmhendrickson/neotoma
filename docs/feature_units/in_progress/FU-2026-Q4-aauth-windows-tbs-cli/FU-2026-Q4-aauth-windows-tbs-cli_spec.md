---
title: "Feature Unit: FU-2026-Q4-aauth-windows-tbs-cli — Windows TBS CLI Attestation Source"
summary: "**Status:** In Progress **Priority:** P1 (unblocks Windows hardware-tier coverage) **Risk Level:** Medium (new native package, new platform path) **Target Release:** v0.10.0 **Owner:** Engineering **Created:** 2026-04-27 **Last Updated:*..."
---

# Feature Unit: FU-2026-Q4-aauth-windows-tbs-cli — Windows TBS CLI Attestation Source

**Status:** In Progress
**Priority:** P1 (unblocks Windows hardware-tier coverage)
**Risk Level:** Medium (new native package, new platform path)
**Target Release:** v0.10.0
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Add a Windows-side hardware attestation source for the AAuth CLI by introducing
a new optional native package `packages/aauth-win-tbs/` that binds to the
Windows TBS (TPM Base Services) API plus CNG (Cryptography API: Next
Generation) and exposes the same `is_supported()` / `generate_key()` /
`sign()` / `attest()` surface as `packages/aauth-mac-se/` and
`packages/aauth-tpm2/`. With this package installed and a TPM 2.0 chip
exposed via the Microsoft Platform Crypto Provider (MS_PLATFORM_KEY_STORAGE_PROVIDER),
the CLI's `--hardware` keygen flow can produce TPM-resident keys via
`NCryptCreatePersistedKey` and emit WebAuthn-`tpm`-format attestation
envelopes via `NCryptCreateClaim` that the v0.9.0 server-side TPM 2.0
verifier (FU-3) consumes to promote the agent to the `hardware` tier.

**User Value:**
- Operators running Neotoma on managed Windows fleets (Windows 11 mandates
  TPM 2.0; corporate Windows endpoints already provision keys under the
  Microsoft Platform Crypto Provider) can earn the `hardware` tier with no
  additional setup beyond the optional native package.
- Round-trips the v0.9.0 TPM 2.0 verifier work end-to-end on Windows
  through a vendor-supported path (TBS + CNG) rather than a custom
  libtss2-style transport.
- Establishes a reusable Windows-native package shape (`packages/aauth-win-tbs/`)
  parallel to `packages/aauth-mac-se/` and `packages/aauth-tpm2/`.

**Technical Approach (high level):**
- New `packages/aauth-win-tbs/` package, parallel in shape and tone to
  `packages/aauth-mac-se/` and `packages/aauth-tpm2/`. N-API binding via
  `node-addon-api` and `node-gyp`, linking against the Windows SDK
  libraries `tbs.lib`, `ncrypt.lib`, and `crypt32.lib`.
- TBS API for attestation operations (`Tbsi_Context_Create`,
  `Tbsip_Submit_Command`, `Tbsi_GetDeviceInfo`); CNG via NCrypt for key
  lifecycle (`NCryptOpenStorageProvider` against
  `MS_PLATFORM_KEY_STORAGE_PROVIDER`, `NCryptCreatePersistedKey`,
  `NCryptSignHash`).
- Surface (matches the SE / TPM2 binding shape):
  - `is_supported()` → `{ supported, reason? }`. `true` only when the TBS
    service (`Tbsi_Context_Create`) reports a TPM 2.0 device AND the
    Microsoft Platform Crypto Provider opens cleanly.
  - `generate_key({ alg?: "ES256" | "RS256" })` → returns an opaque
    NCrypt key name (UTF-8 string) plus public coordinates as JWK
    (RSA-2048 default; ECC-P256 path under env override). Keys are
    created with `NCRYPT_MACHINE_KEY_FLAG | NCRYPT_OVERWRITE_KEY_FLAG`
    semantics negotiated against the user's intended scope (operator
    can pin to user scope via `NEOTOMA_AAUTH_WIN_TBS_SCOPE=user`).
  - `sign({ keyName, digest, alg })` → returns ASN.1 DER ECDSA or
    PKCS1v1.5 signature via `NCryptSignHash` (BCRYPT_PAD_PKCS1 for RSA,
    raw `NCRYPT_PAD_NONE` for ES256 r||s).
  - `attest({ keyName, challenge })` → calls `NCryptCreateClaim` with
    `NCRYPT_CLAIM_AUTHORITY_AND_SUBJECT_TYPE` (subject type
    `NCRYPT_CLAIM_KEY_ATTESTATION_KEY_TYPE`) and qualifies the claim
    with the AAuth challenge as `NCRYPT_CLAIM_NONCE_PROPERTY`. Returns
    `{ certInfo, pubArea, sig, alg, x5c }` for direct WebAuthn-`tpm`
    envelope construction.
- prebuildify config for `win32-x64` and `win32-arm64` against the
  oldest Windows SDK that exposes `NCryptCreateClaim`
  (Windows 8.1 SDK / 10240). Install-time fallback to source build when
  no prebuilt matches; clear actionable error if the Windows SDK is
  missing or the TBS service is disabled.
- Wire as `optionalDependencies` in root `package.json` so `npm install`
  succeeds on macOS, Linux, and Windows hosts without TPM hardware or
  with the TBS service disabled.
- Extend `src/cli/aauth_signer.ts` with a deterministic backend preference
  ladder so a host with multiple supported backends always prefers SE on
  darwin, TBS on win32, TPM2 on linux. Existing software fallback remains
  the terminal fallback.

## Requirements

### Functional Requirements

1. **Package layout.** A new `packages/aauth-win-tbs/` workspace package
   MUST exist with `package.json`, `binding.gyp`, `src/native/binding.cc`
   (N-API binding), `src/ts/index.ts` (TypeScript public API),
   `lib/index.js` and `lib/index.d.ts` (compiled outputs), `tests/`, and
   a `README.md`. The package MUST be `private: true` and named
   `@neotoma/aauth-win-tbs`. The package's `os` field MUST be
   `["win32"]` so non-Windows installs skip it cleanly.

2. **Native surface.** The native module MUST export the four primitives
   above (`is_supported`, `generate_key`, `sign`, `attest`) with shapes
   matching `packages/aauth-mac-se/` and `packages/aauth-tpm2/` so the
   CLI signer can switch backends without per-backend branching beyond a
   `backend === "..."` discriminator.

3. **Provider choice.** `generate_key` MUST default to the Microsoft
   Platform Crypto Provider (`MS_PLATFORM_KEY_STORAGE_PROVIDER`) so the
   private material is bound to the host TPM. The provider MUST be
   stamped into `signer.json` so future signs can re-derive the lookup
   path.

4. **Attestation claim type.** `attest` MUST emit an `NCRYPT_CLAIM_AUTHORITY_AND_SUBJECT_TYPE`
   claim. The returned `certInfo` MUST carry the FU-3 expected
   `extraData = SHA-256(challenge || jkt)` propagated via
   `NCRYPT_CLAIM_NONCE_PROPERTY` so the claim binds to the AAuth
   challenge cryptographically.

5. **CLI integration.** `src/cli/aauth_signer.ts` MUST gain a `tbs`
   backend value. `neotoma auth keygen --hardware` on win32 MUST attempt
   the TBS backend before falling back. `signer.json` MUST persist:
   - `backend: "tbs"`
   - `tbs_key_name`: opaque NCrypt key name (UTF-8 string)
   - `tbs_provider`: provider name (default
     `Microsoft Platform Crypto Provider`)
   - `tbs_scope`: `"user"` or `"machine"` (default `"user"`)

6. **Signing parity.** `mintCliAgentTokenJwt` and `cliSignedFetch` MUST
   treat `backend === "tbs"` identically to `apple-secure-enclave` and
   `tpm2` from a JOSE composition perspective: the binding produces the
   raw signature, the CLI wraps it into JOSE r||s or PKCS1 byte form per
   `alg`, and emits a bit-compatible JWT.

7. **Envelope construction.** A new `buildTbsAttestationEnvelope({
   config, iat })` helper MUST produce the same FU-3 envelope shape
   as `buildTpm2AttestationEnvelope`:
   ```json
   {
     "format": "tpm2",
     "statement": {
       "ver": "2.0",
       "alg": -7,
       "x5c": ["<leaf>", "<...>", "<root>"],
       "sig": "<base64url AIK signature>",
       "certInfo": "<base64url TPMS_ATTEST>",
       "pubArea": "<base64url TPMT_PUBLIC>"
     },
     "challenge": "<sha256 base64url>",
     "key_binding_jkt": "<RFC 7638 thumbprint>"
   }
   ```
   This routes through FU-3's verifier on the server. Note: the
   envelope `format` is `"tpm2"`, NOT `"tbs"` — TBS is an
   implementation detail of the Windows producer; the wire format is
   identical to what the Linux TPM2 path emits so the server can
   ignore the producer.

8. **Probe ergonomics.** `neotoma auth session` and
   `describeConfiguredSigner()` MUST surface a `hardware_supported_reason`
   when `backend === "tbs"` (e.g. `"TBS service unavailable"`,
   `"MS Platform Crypto Provider not loadable"`, `"no TPM 2.0 device
   detected"`).

### Non-Functional Requirements

1. **Optional install.** `npm install` MUST succeed on hosts without
   the Windows SDK / TBS. The package MUST be a top-level
   `optionalDependencies` entry so its build failure never breaks
   `neotoma` install.

2. **No private-key exposure.** The TPM-resident private scalar MUST
   never reach the Node.js process. All signing operations MUST go
   through `NCryptSignHash` against the persistent key handle obtained
   from `NCryptOpenKey`.

3. **Constant-time equality.** Any thumbprint or extraData comparisons
   in the binding's helper layer MUST use a constant-time helper.

4. **Type safety.** The TypeScript shim (`src/ts/index.ts`) MUST export
   a public API surface that mirrors `packages/aauth-mac-se/lib/index.d.ts`
   and `packages/aauth-tpm2/lib/index.d.ts`.

5. **Reproducible prebuilts.** `prebuildify` config MUST pin the Windows
   SDK version and commit a `prebuilds/<platform>-<arch>/` directory
   into the published tarball so install-time fallback to source build
   is the exception, not the rule.

### Invariants

**MUST:**
- MUST refuse to mint a TBS envelope when the persistent key was
  generated for a different `cnf.jwk` thumbprint than the JWT
  advertises.
- MUST persist the NCrypt key name in `signer.json` so subsequent CLI
  invocations re-use the same TPM-resident key.
- MUST gate the binding's `attest()` on a successful `is_supported()`
  probe so attempting to attest on a host without TBS produces a
  structured error rather than a process crash.

**MUST NOT:**
- MUST NOT shell out to `certutil`, `tpmtool`, or PowerShell — the
  binding talks to TBS / NCrypt in-process to avoid forking and keep
  error surfaces typed.
- MUST NOT support TPM 1.2 hosts; `is_supported()` MUST return `false`
  for any non-2.0 family chip even if the TBS service exposes it.
- MUST NOT auto-elevate to admin to enable the TBS service; that
  requires UAC consent and is outside CLI scope. Surface a clear
  diagnostic instead.

## Affected Subsystems

**Primary:**
- **AAuth CLI signer** (`src/cli/aauth_signer.ts` — extend with `tbs`
  backend; preserve existing `software`, `apple-secure-enclave`, and
  `tpm2` paths).
- **CLI attestation envelope builder** (`src/cli/aauth_tbs_attestation.ts`
  — new helper paralleling `src/cli/aauth_tpm2_attestation.ts`).
- **CLI describe surface** (`src/cli/aauth_signer.ts` /
  `describeConfiguredSigner`).
- **Native package** (`packages/aauth-win-tbs/` — new).

**Documentation:**
- `docs/subsystems/aauth_cli_attestation.md` (Windows platform-support
  matrix, `tbs` backend row, env vars, fallback behaviour).
- `docs/integrations/aauth_tbs_windows.md` (new, Windows SDK install
  prerequisites, TBS service troubleshooting, MS Platform Crypto
  Provider activation guide).
- `packages/aauth-win-tbs/README.md` (binding internals).

**Tests:**
- `packages/aauth-win-tbs/tests/smoke.test.js` — `is_supported` smoke
  gated by `process.platform === "win32"` and
  `NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED === "1"`.
- `tests/unit/cli_aauth_tbs_attestation.test.ts` — backend dispatch
  tests with the binding mocked, parallel to
  `tests/unit/cli_aauth_tpm2_attestation.test.ts`.
- `tests/integration/cli_aauth_keygen_tbs.test.ts` — end-to-end
  `neotoma auth keygen --hardware` against a mocked binding, gated by
  `process.platform === "win32"`.

**Configuration:**
- `package.json` — `optionalDependencies: { "@neotoma/aauth-win-tbs": "..." }`.
- `.env.example` — document `NEOTOMA_AAUTH_WIN_TBS_SCOPE`,
  `NEOTOMA_AAUTH_WIN_TBS_PROVIDER`, and
  `NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED` overrides.
- `tsconfig.json` workspaces — exclude
  `packages/aauth-win-tbs/build/`.
- `src/types/aauth-win-tbs.d.ts` — ambient module declaration so the
  rest of the codebase can reference the package without TS resolving
  the CommonJS package source.

**Dependencies:**
- FU-3 (TPM 2.0 server-side verifier) — hard prerequisite. Without the
  server-side verifier shipping in v0.9.0, the envelopes this CLI
  source emits would be uniformly rejected.
- `packages/aauth-mac-se/` and `packages/aauth-tpm2/` shapes —
  non-blocking templates.

## Out of Scope

- **TPM 1.2 hosts.** Already deprecated; not supported by the MS
  Platform Crypto Provider either.
- **Windows Hello biometric attestation.** Separate user-presence
  concern, not key-residency. A future FU may add a Windows Hello path
  if user-presence tier signalling is wanted.
- **Windows Smart Card attestation.** Separate format and separate
  trust roots; would warrant its own FU.
- **Group Policy / MDM-managed key provisioning.** Operators with
  pre-provisioned NCrypt keys can opt in by overriding
  `NEOTOMA_AAUTH_WIN_TBS_KEY_NAME`; we do not provision them.
- **Windows Server Core hosts without the TBS service.** Detected as
  unsupported and surfaced via the probe; we do not attempt to enable
  the service.

## Acceptance Criteria

1. `packages/aauth-win-tbs/` builds against Windows 10 SDK
   (10.0.19041 or newer) with the v143 toolset.
2. `is_supported()` returns `{ supported: true }` on a host with the
   TBS service running and the Microsoft Platform Crypto Provider
   loadable.
3. `generate_key({ alg: "ES256" })` returns an NCrypt key name plus
   public JWK coordinates that round-trip through Node's
   `crypto.createPublicKey`.
4. `sign({ keyName, digest, alg: "ES256" })` returns a DER signature
   that verifies under the public JWK from step 3 (validated in the
   smoke test).
5. `attest({ keyName, challenge })` returns an envelope whose verifier
   outcome is `{ verified: true, format: "tpm2" }` when fed back through
   FU-3's `verifyTpm2Attestation` against a trust set containing the
   AIK chain root.
6. `neotoma auth keygen --hardware` on a TPM-equipped Windows host
   writes `signer.json` with `backend: "tbs"`, persists an NCrypt key
   name, and the subsequent `auth session` reports
   `hardware_supported: true`.
7. `neotoma auth keygen --hardware` on a non-Windows host or a Windows
   host without TBS fails cleanly with an actionable error and does
   NOT corrupt an existing `signer.json`.
8. `npm install` succeeds on macOS and Linux hosts (the package is
   `optionalDependencies`).
9. `docs/subsystems/aauth_cli_attestation.md` adds the Windows row and
   the `tbs` backend row; `docs/integrations/aauth_tbs_windows.md`
   ships with TBS service troubleshooting guidance.
