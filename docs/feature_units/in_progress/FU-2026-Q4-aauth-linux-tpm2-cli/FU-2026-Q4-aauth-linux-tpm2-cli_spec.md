---
title: "Feature Unit: FU-2026-Q4-aauth-linux-tpm2-cli — Linux TPM 2.0 CLI Attestation Source"
summary: "**Status:** In Progress **Priority:** P1 (unblocks Linux hardware-tier coverage) **Risk Level:** Medium (new native package, new platform path) **Target Release:** v0.10.0 **Owner:** Engineering **Created:** 2026-04-27 **Last Updated:** ..."
---

# Feature Unit: FU-2026-Q4-aauth-linux-tpm2-cli — Linux TPM 2.0 CLI Attestation Source

**Status:** In Progress
**Priority:** P1 (unblocks Linux hardware-tier coverage)
**Risk Level:** Medium (new native package, new platform path)
**Target Release:** v0.10.0
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Add a Linux-side hardware attestation source for the AAuth CLI by introducing
a new optional native package `packages/aauth-tpm2/` that binds to `libtss2`
(the `tpm2-tss` user-space stack) and exposes the same `is_supported()` /
`generate_key()` / `sign()` / `attest()` surface as `packages/aauth-mac-se/`.
With this package installed and a TPM 2.0 chip available at `/dev/tpmrm0`, the
CLI's `--hardware` keygen flow can produce TPM-resident keys and emit
WebAuthn-`tpm`-format attestation envelopes that the v0.9.0 server-side TPM 2.0
verifier (FU-3) consumes to promote the agent to the `hardware` tier.

**User Value:**
- Operators running self-hosted Neotoma on Linux servers (the primary
  deployment target) can earn the `hardware` tier instead of being silently
  capped at `software` despite having a TPM 2.0 chip.
- Round-trips the v0.9.0 TPM 2.0 verifier work end-to-end so the format is
  exercised by a first-party CLI source rather than waiting on third-party
  WebAuthn integrations.
- Establishes a reusable Linux-native package shape (`packages/aauth-tpm2/`)
  that downstream attestation surfaces can mirror.

**Technical Approach (high level):**
- New `packages/aauth-tpm2/` package, parallel in shape and tone to
  `packages/aauth-mac-se/`. N-API binding via `node-addon-api` and `node-gyp`,
  linking against the system `libtss2-esys` / `libtss2-mu` / `libtss2-rc`
  shared libraries.
- ESYS (Enhanced System API) transport over `tcti-device` against
  `/dev/tpmrm0` (the resource-managed TPM device). Falls back to `/dev/tpm0`
  only when the resource manager is unavailable; refuses to run as root if the
  resource manager device exists but is unowned (caller-supplied permission
  problem, surfaced as a clear error).
- Surface (matches the SE binding shape):
  - `is_supported()` → `{ supported, reason? }`. `true` only when libtss2 is
    loadable, the device node is accessible, and `Esys_GetCapability` reports
    `TPM2_CAP_TPM_PROPERTIES`.
  - `generate_key({ hierarchy?: "owner" | "endorsement" })` → returns the
    persistent handle plus public coordinates as JWK (RSA-2048 default;
    ECC-P256 path under env override). Persists under
    `0x81000000`-range handle.
  - `sign({ handle, digest, alg })` → returns ASN.1 DER ECDSA / PKCS1v1.5
    signature.
  - `attest({ handle, challenge })` → calls TPM2_Quote (or TPM2_Certify when
    the bound key is a non-restricted key) with `qualifyingData = challenge`,
    returns `{ certInfo, pubArea, sig, alg, x5c }` for direct WebAuthn-`tpm`
    envelope construction.
- prebuildify config for `linux-x64` and `linux-arm64` against the most
  common `libtss2` ABI (Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Debian stable,
  Fedora stable). Install-time fallback to source build when no prebuilt
  matches; clear actionable error if `libtss2-dev` headers are missing.
- Wire as `optionalDependencies` in root `package.json` so `npm install`
  succeeds on macOS, Windows, and Linux hosts without TPM hardware.
- Extend `src/cli/aauth_signer.ts` with a deterministic backend preference
  ladder so a host with both SE and TPM2 always prefers SE on darwin, TPM2 on
  linux. Existing software fallback remains the terminal fallback.

## Requirements

### Functional Requirements

1. **Package layout.** A new `packages/aauth-tpm2/` workspace package MUST
   exist with `package.json`, `binding.gyp`, `src/aauth_tpm2.cc` (N-API
   binding), `src/index.js` (Node entrypoint), `tests/`, and a `README.md`.
   The package MUST be `private: true` and named `@neotoma/aauth-tpm2`.

2. **Native surface.** The native module MUST export the four primitives
   above (`is_supported`, `generate_key`, `sign`, `attest`) with shapes
   matching `packages/aauth-mac-se/` so the CLI signer can switch backends
   without per-backend branching beyond a `backend === "..."` discriminator.

3. **Hierarchy choice.** `generate_key` MUST default to the Owner hierarchy
   for development ergonomics and accept `{ hierarchy: "endorsement" }` as
   an override for fleets that pre-provision an EK certificate. The chosen
   hierarchy MUST be stamped into `signer.json` so future signs can re-derive
   the policy.

4. **Quote vs Certify.** `attest` MUST emit a TPM2_Quote when the bound key
   is a restricted signing key, and TPM2_Certify when the bound key is
   non-restricted. The returned `certInfo` MUST carry the FU-3 expected
   `extraData = SHA-256(challenge || jkt)`.

5. **CLI integration.** `src/cli/aauth_signer.ts` MUST gain a `tpm2` backend
   value. `neotoma auth keygen --hardware` on linux MUST attempt the TPM2
   backend before falling back. `signer.json` MUST persist:
   - `backend: "tpm2"`
   - `tpm2_handle`: persistent handle as hex string
   - `tpm2_hierarchy`: `"owner"` or `"endorsement"`

6. **Signing parity.** `mintCliAgentTokenJwt` and `cliSignedFetch` MUST treat
   `backend === "tpm2"` identically to `apple-secure-enclave` from a JOSE
   composition perspective: the binding produces the raw signature, the CLI
   wraps it into JOSE r||s or PKCS1 byte form per `alg`, and emits a
   bit-compatible JWT.

7. **Envelope construction.** A new `buildTpm2AttestationEnvelope({ config,
   iat })` helper in `src/cli/aauth_attestation.ts` MUST produce:
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
   This routes through FU-3's verifier on the server.

8. **Probe ergonomics.** `neotoma auth session` and
   `describeConfiguredSigner()` MUST surface a `hardware_supported_reason`
   when `backend === "tpm2"` (e.g. `"libtss2 unavailable"`,
   `"/dev/tpmrm0 not accessible"`, `"no TPM 2.0 device detected"`).

### Non-Functional Requirements

1. **Optional install.** `npm install` MUST succeed on hosts without
   `libtss2`. The package MUST be a top-level `optionalDependencies` entry
   so its build failure never breaks `neotoma` install.

2. **No private-key exposure.** The TPM-resident private scalar MUST never
   reach the Node.js process. All signing operations MUST go through
   `Esys_Sign` against the persistent handle.

3. **Constant-time equality.** Any thumbprint or extraData comparisons in
   the binding's helper layer MUST use a constant-time helper.

4. **Type safety.** The Node entrypoint (`src/index.js`) MUST export a
   TypeScript-compatible API surface via `index.d.ts`; the public surface
   MUST mirror `packages/aauth-mac-se/index.d.ts` shape.

5. **Reproducible prebuilts.** `prebuildify` config MUST pin the libtss2
   ABI version and commit a `prebuilds/<platform>-<arch>/` directory into
   the published tarball so install-time fallback to source build is the
   exception, not the rule.

### Invariants

**MUST:**
- MUST refuse to mint a TPM2 envelope when the persistent handle was
  generated for a different `cnf.jwk` thumbprint than the JWT advertises.
- MUST persist the persistent handle in `signer.json` so subsequent CLI
  invocations re-use the same TPM-resident key.
- MUST gate the binding's `attest()` on a successful `is_supported()` probe
  so attempting to attest on a host without a TPM produces a structured
  error rather than a process crash.

**MUST NOT:**
- MUST NOT shell out to `tpm2-tools` (`tpm2_quote`, `tpm2_create`, etc.) —
  the binding talks to libtss2 in-process to avoid forking and keep error
  surfaces typed.
- MUST NOT support TPM 1.2 hosts; `is_supported()` MUST return `false` for
  any non-2.0 family chip.
- MUST NOT auto-provision the EK hierarchy; that requires owner-level
  authorization and is outside CLI scope.

## Affected Subsystems

**Primary:**
- **AAuth CLI signer** (`src/cli/aauth_signer.ts` — extend with `tpm2`
  backend; preserve existing `software` and `apple-secure-enclave` paths).
- **CLI attestation envelope builder** (`src/cli/aauth_attestation.ts` —
  add `buildTpm2AttestationEnvelope`).
- **CLI describe surface** (`src/cli/aauth_signer.ts` /
  `describeConfiguredSigner`).
- **Native package** (`packages/aauth-tpm2/` — new).

**Documentation:**
- `docs/subsystems/aauth_cli_attestation.md` (Linux platform-support matrix,
  `tpm2` backend row, env vars, fallback behaviour).
- `docs/integrations/aauth_tpm2_linux.md` (new, sourcing instructions for
  `libtss2-dev` per distro).
- `packages/aauth-tpm2/README.md` (binding internals).

**Tests:**
- `packages/aauth-tpm2/tests/smoke.test.ts` — `is_supported` smoke gated by
  `process.env.NEOTOMA_TPM2_TEST_ENABLED === "1"` and the presence of
  `/dev/tpmrm0`.
- `tests/unit/cli_aauth_signer_tpm2.test.ts` — backend dispatch tests with
  the binding mocked.
- `tests/integration/cli_aauth_keygen_tpm2.test.ts` — end-to-end
  `neotoma auth keygen --hardware` against a mocked binding, gated by env.

**Configuration:**
- `package.json` — `optionalDependencies: { "@neotoma/aauth-tpm2": "..." }`.
- `.env.example` — document `NEOTOMA_AAUTH_TPM2_HANDLE` and
  `NEOTOMA_AAUTH_TPM2_HIERARCHY` overrides.
- `tsconfig.json` workspaces — exclude `packages/aauth-tpm2/build/`.

**Dependencies:**
- FU-3 (TPM 2.0 server-side verifier) — hard prerequisite. Without the
  server-side verifier shipping in v0.9.0, the envelopes this CLI source
  emits would be uniformly rejected.
- `packages/aauth-mac-se/` shape — non-blocking template.

## Out of Scope

- **TPM 1.2 hosts.** Already deprecated; not supported by libtss2 either.
- **PKCS#11 transport.** `tcti-pkcs11` is intentionally excluded; FU-6
  covers the YubiKey PKCS#11 surface separately.
- **Endorsement-key certificate provisioning.** Operators with
  pre-provisioned EK certs can opt in via `--hierarchy endorsement`; we do
  not provision them.
- **Kernel resource manager bring-up.** If `/dev/tpmrm0` is missing the
  binding refuses with a clear message; we do not attempt to load
  `tpm_crb` or `tpm_tis_core` modules.
- **Cross-distro libtss2 ABI matrix beyond Ubuntu LTS / Debian stable /
  Fedora stable.** Other distros work via source build; documented but not
  prebuilt.

## Acceptance Criteria

1. `packages/aauth-tpm2/` builds against Ubuntu 22.04 LTS, Ubuntu 24.04
   LTS, Debian 12, and Fedora 40 with `libtss2-dev` installed.
2. `is_supported()` returns `{ supported: true }` on a host with
   `/dev/tpmrm0` present and accessible by the running user.
3. `generate_key({ hierarchy: "owner" })` returns a persistent handle in
   the `0x81000000` range plus public JWK coordinates that round-trip
   through Node's `crypto.createPublicKey`.
4. `sign({ handle, digest, alg: "ES256" })` returns a DER signature that
   verifies under the public JWK from step 3 (validated in the smoke
   test).
5. `attest({ handle, challenge })` returns an envelope whose verifier
   outcome is `{ verified: true, format: "tpm2" }` when fed back through
   FU-3's `verifyTpm2Attestation` against a trust set containing the
   AIK chain root.
6. `neotoma auth keygen --hardware` on a TPM-equipped Linux host writes
   `signer.json` with `backend: "tpm2"`, persists a TPM2 handle, and the
   subsequent `auth session` reports `hardware_supported: true`.
7. `neotoma auth keygen --hardware` on a non-Linux host or a Linux host
   without TPM hardware fails cleanly with an actionable error and does
   NOT corrupt an existing `signer.json`.
8. `npm install` succeeds on macOS and Windows hosts (the package is
   `optionalDependencies`).
9. `docs/subsystems/aauth_cli_attestation.md` adds the Linux row and the
   `tpm2` backend row; `docs/integrations/aauth_tpm2_linux.md` ships with
   per-distro `apt`/`dnf` install instructions.
