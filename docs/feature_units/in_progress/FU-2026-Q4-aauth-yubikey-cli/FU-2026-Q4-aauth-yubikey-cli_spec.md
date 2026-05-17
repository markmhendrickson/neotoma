---
title: "Feature Unit: FU-2026-Q4-aauth-yubikey-cli — YubiKey CLI Attestation Source"
summary: "**Status:** In Progress **Priority:** P1 (cross-platform hardware-tier coverage) **Risk Level:** Medium (new native package, new platform path, new trust roots) **Target Release:** v0.10.x **Owner:** Engineering **Created:** 2026-04-27 *..."
---

# Feature Unit: FU-2026-Q4-aauth-yubikey-cli — YubiKey CLI Attestation Source

**Status:** In Progress
**Priority:** P1 (cross-platform hardware-tier coverage)
**Risk Level:** Medium (new native package, new platform path, new
trust roots)
**Target Release:** v0.10.x
**Owner:** Engineering
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Overview

**Brief Description:**
Add a cross-platform hardware attestation source for the AAuth CLI by
introducing a new optional native package `packages/aauth-yubikey/`
that binds to the PKCS#11 YubiKey provider (`libykcs11`) and exposes
the same `is_supported()` / `generate_key()` / `sign()` / `attest()`
surface as `packages/aauth-mac-se/`, `packages/aauth-tpm2/`, and
`packages/aauth-win-tbs/`. With this package installed and a YubiKey 5
series device connected, the CLI's `--hardware` keygen flow can
produce slot 9c-resident keys via PIV `GENERATE_ASYMMETRIC` and emit
WebAuthn-`packed`-format attestation envelopes via the `YKPIV_INS_ATTEST`
APDU that the v0.9.0 server-side WebAuthn-packed verifier (FU-2)
consumes to promote the agent to the `hardware` tier.

**User Value:**
- Operators on hosts without a TPM 2.0 chip (older Linux machines,
  Intel macOS, virtualised environments without TPM passthrough) can
  still earn the `hardware` tier by plugging in a YubiKey.
- Portable hardware identity: the same YubiKey can attest from any
  host (darwin, linux, win32) the operator works on, eliminating the
  per-host re-enrolment burden of TPM-bound keys.
- Routes through FU-2's existing WebAuthn-packed verifier with no
  additional server-side format work — the YubiKey PIV slot
  attestation is envelope-compatible with the WebAuthn `packed` format
  out of the box.

**Technical Approach (high level):**
- New `packages/aauth-yubikey/` package, parallel in shape and tone to
  `packages/aauth-mac-se/`, `packages/aauth-tpm2/`, and
  `packages/aauth-win-tbs/`. N-API binding via `node-addon-api` and
  `node-gyp`, dynamically loading `libykcs11` (Yubico PKCS#11 provider
  shipped with `yubico-piv-tool` / YubiKey Manager) at runtime so the
  build does not hard-link a vendor library. The binding falls back to
  searching the standard system paths
  (`/usr/local/lib/libykcs11.so`, `/Library/Yubico/libykcs11.dylib`,
  `C:\Program Files\Yubico\YubiKey Manager\libykcs11.dll`) and accepts
  an explicit override via `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH`.
- PIV slot 9c (Digital Signature) for the resident key and per-slot
  attestation. The YubiKey 5 series exposes a per-slot attestation
  cert chained to Yubico's PIV CA via the `YKPIV_INS_ATTEST` APDU
  (`0xF9`). Slot 9c is chosen over 9a because the PIN policy is
  `NEVER` for 9a and `ONCE` per session for 9c, which gives operators
  a meaningful PIN gate per CLI run without requiring a PIN on every
  signature.
- Surface (matches the SE / TPM2 / TBS binding shape):
  - `is_supported()` → `{ supported, reason? }`. `true` only when
    `libykcs11` loads cleanly, `C_GetSlotList` reports at least one
    YubiKey slot, and the slot's firmware version supports
    `YKPIV_INS_ATTEST` (5.0.0 or newer).
  - `generate_key({ alg?: "ES256" })` → calls
    `C_GenerateKeyPair` with `CKM_EC_KEY_PAIR_GEN` against the YubiKey
    PKCS#11 slot mapped to PIV slot 9c (`CKA_LABEL = "PIV AUTH key"`,
    `CKA_ID = 0x9c`). Returns `{ jwk, slot, alg, attestation_cert }`
    where `attestation_cert` is the per-slot cert pulled via
    `C_GetAttributeValue(CKA_VALUE)` against object class
    `CKO_CERTIFICATE` with `CKA_ID = 0xF9` (the per-slot attestation
    object).
  - `sign({ slot, digest, alg })` → returns ASN.1 DER ECDSA signature
    via `C_Sign` with `CKM_ECDSA`. The PIN gate is honoured by
    `C_Login` against the slot; the binding accepts a PIN via
    `NEOTOMA_AAUTH_YUBIKEY_PIN` or, when interactive, prompts via
    `process.stdin` (TTY only).
  - `attest({ slot, challenge })` → packages the per-slot attestation
    cert plus the F9 attestation cert (the intermediate that chains to
    Yubico's PIV CA) into a WebAuthn-`packed` envelope:
    ```json
    {
      "fmt": "packed",
      "alg": -7,
      "sig": "<base64url ECDSA over (authenticatorData || clientDataHash)>",
      "x5c": [
        "<slot 9c attestation cert DER>",
        "<F9 attestation intermediate DER>"
      ],
      "aaguid": "<yubikey 5 series AAGUID>"
    }
    ```
- prebuildify config for `darwin-x64`, `darwin-arm64`, `linux-x64`,
  `linux-arm64`, `win32-x64`. Install-time fallback to source build
  when no prebuilt matches; clear actionable error if `libykcs11` is
  not on the runtime search path.
- Wire as `optionalDependencies` in root `package.json` so
  `npm install` succeeds on hosts without a YubiKey.
- Extend `src/cli/aauth_signer.ts` with a deterministic backend
  preference ladder so a host with multiple supported backends always
  prefers SE on darwin, TBS on win32, TPM2 on linux, and YubiKey as
  the cross-platform fallback when no platform-native backend is
  available. Operators can pin to YubiKey explicitly via
  `NEOTOMA_AAUTH_HARDWARE_BACKEND=yubikey`.

## Requirements

### Functional Requirements

1. **Package layout.** A new `packages/aauth-yubikey/` workspace
   package MUST exist with `package.json`, `binding.gyp`,
   `src/native/binding.cc` (N-API binding), `src/ts/index.ts`
   (TypeScript public API), `lib/index.js` and `lib/index.d.ts`
   (compiled outputs), `tests/`, and a `README.md`. The package MUST
   be `private: true` and named `@neotoma/aauth-yubikey`. Unlike the
   platform-specific packages, the `os` field MUST cover all three
   platforms (`["darwin", "linux", "win32"]`).

2. **Native surface.** The native module MUST export the four
   primitives above (`is_supported`, `generate_key`, `sign`, `attest`)
   with shapes matching the SE / TPM2 / TBS bindings so the CLI signer
   can switch backends without per-backend branching beyond a
   `backend === "..."` discriminator.

3. **PKCS#11 path discovery.** `is_supported()` MUST search a
   well-known list of paths for `libykcs11` and accept an explicit
   override via `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH`. Default search
   order:
   - `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH` (if set)
   - `/usr/local/lib/libykcs11.so` (linux Homebrew / source install)
   - `/usr/lib/x86_64-linux-gnu/libykcs11.so` (Debian/Ubuntu)
   - `/opt/homebrew/lib/libykcs11.dylib` (macOS arm64 Homebrew)
   - `/usr/local/lib/libykcs11.dylib` (macOS x64 Homebrew)
   - `C:\Program Files\Yubico\YubiKey Manager\libykcs11.dll`

4. **Slot binding.** `generate_key` MUST target PIV slot 9c
   (`CKA_ID = 0x9c`). The YubiKey serial number MUST be persisted
   in `signer.json` so subsequent CLI invocations re-bind to the same
   physical key (a different YubiKey plugged into the same host
   triggers a `key_binding_mismatch` error rather than silently
   re-keying).

5. **Attestation envelope shape.** `attest` MUST emit a WebAuthn
   `packed` envelope (NOT a custom `yubico-piv` format) so the
   server-side verifier path is FU-2's existing
   `verifyWebAuthnPackedAttestation`. The envelope's `aaguid` field
   MUST match a Yubico AAGUID admitted by the configured AAGUID
   trust list (`NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`).

6. **CLI integration.** `src/cli/aauth_signer.ts` MUST gain a
   `yubikey` backend value. `neotoma auth keygen --hardware` MUST
   attempt the YubiKey backend AFTER the platform-native backend has
   declined (i.e. the YubiKey path is the cross-platform fallback,
   not the default). `signer.json` MUST persist:
   - `backend: "yubikey"`
   - `yubikey_serial`: device serial number (decimal string)
   - `yubikey_slot`: PIV slot identifier (default `"9c"`)
   - `yubikey_pkcs11_path`: resolved `libykcs11` path

7. **Signing parity.** `mintCliAgentTokenJwt` and `cliSignedFetch`
   MUST treat `backend === "yubikey"` identically to
   `apple-secure-enclave`, `tpm2`, and `tbs` from a JOSE composition
   perspective: the binding produces the raw signature, the CLI wraps
   it into JOSE r||s form per `alg`, and emits a bit-compatible JWT.

8. **Envelope construction.** A new
   `buildYubikeyAttestationEnvelope({ config, iat })` helper MUST
   produce the WebAuthn-`packed` envelope shape consumed by FU-2:
   ```json
   {
     "format": "webauthn-packed",
     "statement": {
       "fmt": "packed",
       "alg": -7,
       "sig": "<base64url ECDSA>",
       "x5c": ["<slot 9c attestation cert>", "<F9 intermediate>"],
       "aaguid": "<yubikey 5 series AAGUID base64url>"
     },
     "challenge": "<sha256 base64url>",
     "key_binding_jkt": "<RFC 7638 thumbprint>"
   }
   ```

9. **Probe ergonomics.** `neotoma auth session` and
   `describeConfiguredSigner()` MUST surface a
   `hardware_supported_reason` when `backend === "yubikey"` (e.g.
   `"libykcs11 not loadable"`, `"no YubiKey detected"`, `"YubiKey 5
   firmware required for attestation"`).

10. **Yubico PIV CA roots.** A new bundled root file
    `config/aauth/yubico_piv_roots.pem` MUST exist with sourcing notes
    pointing at Yubico's developer documentation. The trust config
    loader (`src/services/aauth_attestation_trust_config.ts`) MUST
    pick this up via `NEOTOMA_AAUTH_YUBICO_PIV_ROOTS_PATH` (default:
    bundled file) so the server can validate YubiKey-issued envelopes
    without operator intervention.

### Non-Functional Requirements

1. **Optional install.** `npm install` MUST succeed on hosts without
   `libykcs11`. The package MUST be a top-level
   `optionalDependencies` entry so its load failure never breaks
   `neotoma` install.

2. **No private-key exposure.** The YubiKey-resident private scalar
   MUST never reach the Node.js process. All signing operations MUST
   go through `C_Sign` against the slot 9c handle obtained from
   `C_FindObjects`.

3. **Dynamic linkage only.** The binding MUST `dlopen` / `LoadLibrary`
   `libykcs11` at runtime — it MUST NOT link against `libykcs11` at
   build time so the `aauth-yubikey` package builds on hosts without
   YubiKey Manager installed.

4. **PIN handling.** The PIN MUST never be logged. PIN entry via
   `NEOTOMA_AAUTH_YUBIKEY_PIN` MUST be redacted in any error message
   surfaced by the binding. Interactive PIN entry MUST disable echo
   on stdin via `tty.setRawMode(true)`.

5. **Constant-time equality.** Any thumbprint or extraData
   comparisons in the binding's helper layer MUST use a constant-time
   helper.

6. **Type safety.** The TypeScript shim (`src/ts/index.ts`) MUST
   export a public API surface that mirrors the SE / TPM2 / TBS
   shapes.

7. **Reproducible prebuilts.** `prebuildify` config MUST cover
   `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, and
   `win32-x64` so the install-time fallback to source build is the
   exception, not the rule.

### Invariants

**MUST:**
- MUST refuse to mint a YubiKey envelope when the resident key was
  generated for a different `cnf.jwk` thumbprint than the JWT
  advertises.
- MUST persist the YubiKey serial number in `signer.json` and refuse
  to sign when the connected YubiKey serial does not match.
- MUST gate the binding's `attest()` on a successful `is_supported()`
  probe so attempting to attest without a YubiKey produces a
  structured error rather than a process crash.

**MUST NOT:**
- MUST NOT shell out to `yubico-piv-tool` or `ykman` — the binding
  talks to PKCS#11 in-process to avoid forking and keep error
  surfaces typed.
- MUST NOT support YubiKey 4 series or NEO devices; `is_supported()`
  MUST return `false` for any firmware older than 5.0.0 because
  `YKPIV_INS_ATTEST` is unavailable.
- MUST NOT cache the PIN across CLI invocations. The PIN policy is
  `ONCE` per session by design; persisting it would defeat the gate.
- MUST NOT route YubiKey envelopes through a custom `yubico-piv`
  format — they are envelope-compatible with WebAuthn `packed` and
  reusing FU-2 avoids a fourth format and a fourth verifier.

## Affected Subsystems

**Primary:**
- **AAuth CLI signer** (`src/cli/aauth_signer.ts` — extend with
  `yubikey` backend; preserve existing `software`,
  `apple-secure-enclave`, `tpm2`, and `tbs` paths).
- **CLI attestation envelope builder** (`src/cli/aauth_yubikey_attestation.ts`
  — new helper paralleling `src/cli/aauth_tpm2_attestation.ts` and
  `src/cli/aauth_tbs_attestation.ts`).
- **CLI describe surface** (`src/cli/aauth_signer.ts` /
  `describeConfiguredSigner`).
- **Native package** (`packages/aauth-yubikey/` — new).
- **Server-side trust config**
  (`src/services/aauth_attestation_trust_config.ts` — extend to load
  `config/aauth/yubico_piv_roots.pem`).

**Documentation:**
- `docs/subsystems/aauth_cli_attestation.md` (cross-platform
  platform-support matrix, `yubikey` backend row, env vars, fallback
  behaviour).
- `docs/integrations/aauth_yubikey.md` (new, YubiKey Manager install
  prerequisites, PIN policy guide, AAGUID configuration).
- `packages/aauth-yubikey/README.md` (binding internals).

**Tests:**
- `packages/aauth-yubikey/tests/smoke.test.js` — `is_supported` smoke
  gated by `NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED === "1"` and a
  hardware-present probe.
- `tests/unit/cli_aauth_yubikey_attestation.test.ts` — backend
  dispatch tests with the binding mocked, parallel to
  `tests/unit/cli_aauth_tpm2_attestation.test.ts`.
- `tests/integration/cli_aauth_keygen_yubikey.test.ts` — end-to-end
  `neotoma auth keygen --hardware` against a mocked binding.

**Configuration:**
- `package.json` — `optionalDependencies: { "@neotoma/aauth-yubikey": "..." }`.
- `.env.example` — document `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH`,
  `NEOTOMA_AAUTH_YUBIKEY_PIN`, `NEOTOMA_AAUTH_YUBIKEY_SLOT`,
  `NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED`, and
  `NEOTOMA_AAUTH_YUBICO_PIV_ROOTS_PATH` overrides.
- `config/aauth/yubico_piv_roots.pem` — bundled Yubico PIV CA roots
  with sourcing notes.
- `tsconfig.json` workspaces — exclude
  `packages/aauth-yubikey/build/`.
- `src/types/aauth-yubikey.d.ts` — ambient module declaration so the
  rest of the codebase can reference the package without TS resolving
  the CommonJS package source.

**Dependencies:**
- FU-2 (WebAuthn-packed server-side verifier) — hard prerequisite.
  Without the server-side packed verifier shipping in v0.9.0, the
  envelopes this CLI source emits would be uniformly rejected.
- `packages/aauth-mac-se/`, `packages/aauth-tpm2/`, and
  `packages/aauth-win-tbs/` shapes — non-blocking templates.

## Out of Scope

- **YubiKey 4 / NEO firmware (< 5.0.0).** No `YKPIV_INS_ATTEST` APDU
  exposed; `is_supported()` returns `false` cleanly.
- **YubiKey FIDO2 attestation.** Separate slot, separate format, and
  Web Authentication User Presence semantics. A future FU may add a
  FIDO2 path if user-presence tier signalling is wanted.
- **Multiple YubiKeys plugged simultaneously.** We bind to the first
  detected slot and document the assumption. Operators with multiple
  YubiKeys should pin to a serial via
  `NEOTOMA_AAUTH_YUBIKEY_SERIAL`.
- **YubiKey-managed key rotation / re-attestation.** Operators
  manage attestation lifetime via JWT `exp`; an "auto-rotate" UX is
  outside scope.
- **PIV slots other than 9c.** Slots 9a (PIN never), 9d (PIN ONCE +
  KEY MANAGEMENT), and 9e (PIN NEVER + CARD AUTH) have different PIN
  policies and different intended uses; we only support 9c and
  surface a clear error for `NEOTOMA_AAUTH_YUBIKEY_SLOT` overrides.
- **PKCS#11 providers other than Yubico's.** OpenSC, ePass, SoftHSM —
  separate trust roots, separate AAGUIDs, separate scope.

## Acceptance Criteria

1. `packages/aauth-yubikey/` builds against Node.js 20+ on darwin,
   linux, and win32 with `node-addon-api` headers and no hard link
   to `libykcs11`.
2. `is_supported()` returns `{ supported: true }` on a host with a
   YubiKey 5 series device connected and `libykcs11` reachable.
3. `generate_key({ alg: "ES256" })` returns a JWK plus per-slot
   attestation cert that round-trips through Node's
   `crypto.createPublicKey` and chains to a Yubico PIV CA root.
4. `sign({ slot: "9c", digest, alg: "ES256" })` returns a DER
   signature that verifies under the public JWK from step 3
   (validated in the smoke test).
5. `attest({ slot: "9c", challenge })` returns an envelope whose
   verifier outcome is `{ verified: true, format: "webauthn-packed" }`
   when fed back through FU-2's `verifyWebAuthnPackedAttestation`
   against a trust set containing the bundled Yubico PIV CA root.
6. `neotoma auth keygen --hardware` on a host with a YubiKey
   connected and no platform-native hardware backend writes
   `signer.json` with `backend: "yubikey"`, persists the YubiKey
   serial number, and the subsequent `auth session` reports
   `hardware_supported: true`.
7. `neotoma auth keygen --hardware` on a host without a YubiKey
   connected falls through to the next backend in the preference
   ladder (or the software backend) without corrupting an existing
   `signer.json`.
8. `npm install` succeeds on hosts without `libykcs11` (the package
   is `optionalDependencies`).
9. `docs/subsystems/aauth_cli_attestation.md` adds the cross-platform
   YubiKey row and the `yubikey` backend row;
   `docs/integrations/aauth_yubikey.md` ships with YubiKey Manager
   install + PIN policy guidance.
