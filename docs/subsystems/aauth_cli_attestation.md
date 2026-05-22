# AAuth CLI attestation

## Purpose

Defines how the Neotoma CLI generates AAuth keypairs, mints `aa-agent+jwt`
agent tokens, and attaches a `cnf.attestation` envelope when the
operator opts in to hardware-backed signing across macOS, Linux,
Windows, and any host with a YubiKey 5 series device. This is the
client-side counterpart to `docs/subsystems/aauth_attestation.md`, which
specifies how the server verifies the resulting envelope.

This document is the upstream spec for the CLI signer implementation in
`src/cli/aauth_signer.ts` and the optional native packages in
`packages/aauth-mac-se/` (darwin), `packages/aauth-tpm2/` (linux),
`packages/aauth-win-tbs/` (win32), and `packages/aauth-yubikey/`
(cross-platform).

## Platform support matrix

After v0.10.x the `--hardware` flag is supported on every platform
Neotoma ships an installer for. The CLI selects a backend per the
ladder below; operators can pin a specific backend via
`NEOTOMA_AAUTH_HARDWARE_BACKEND`.

| Platform    | Default `--hardware` backend                | Optional fallback                            |
|-------------|---------------------------------------------|----------------------------------------------|
| **darwin**  | `aauth-mac-se` (Secure Enclave; FU umbrella) | `aauth-yubikey` (FU-6, when external YubiKey is preferred) |
| **linux**   | `aauth-tpm2` (TPM 2.0; FU-4)                | `aauth-yubikey` (FU-6, when no `/dev/tpmrm0`) |
| **win32**   | `aauth-win-tbs` (TBS + NCrypt; FU-5)        | `aauth-yubikey` (FU-6, when no Microsoft Platform Crypto Provider) |
| **any host with a YubiKey** | `aauth-yubikey` (FU-6)        | n/a — pure-fallback path                     |

The wire format produced by each backend, and therefore the server-side
verifier it lands in, is fixed:

| Backend                | Wire format       | Server verifier                       |
|------------------------|-------------------|---------------------------------------|
| `apple-secure-enclave` | `apple-secure-enclave` | `verifyAppleSecureEnclaveAttestation` |
| `tpm2` (linux)         | `tpm2`            | `verifyTpm2Attestation` (FU-3)        |
| `tbs` (win32)          | `tpm2`            | `verifyTpm2Attestation` (FU-3)        |
| `yubikey` (any)        | `webauthn-packed` | `verifyWebauthnPackedAttestation` (FU-2) |

In particular: Windows/TBS reuses the FU-3 TPM 2.0 verifier unchanged
even though the CLI talks to `NCrypt` rather than raw TPM commands;
YubiKey reuses the FU-2 WebAuthn-`packed` verifier rather than FU-3
because YubiKey PIV chains terminate at Yubico's PIV CA, not a TPM
manufacturer chain.

## Scope

Covers:

- CLI keygen modes (software vs `--hardware`) for darwin / linux /
  win32 and the cross-platform YubiKey fallback.
- The `signer.json` on-disk schema (`backend`, plus the per-backend
  fields `se_key_tag`, `tpm2_handle`, `tpm2_hierarchy`, `tbs_provider`,
  `tbs_scope`, `tbs_key_name`, `yubikey_slot`, `yubikey_serial`,
  `yubikey_pkcs11_path`).
- How JWTs and HTTP message signatures are produced for hardware-backed
  keys.
- How the CLI generates an attestation envelope per backend and binds
  it to the JWT it signs.
- Operator UX: required environment variables, expected `auth session`
  output, fallback behaviour when a native binding is missing or a TPM
  / YubiKey probe fails.

Does NOT cover:

- Server-side verification rules (see
  `docs/subsystems/aauth_attestation.md`).
- The native bindings' internal implementations (see each package's
  `README.md`).

## Signer backends

`src/cli/aauth_signer.ts` supports five key-storage backends, recorded
in `signer.json` as `backend`:

| `backend`              | Where the private key lives           | Platform | Tier promotion path |
| ---------------------- | ------------------------------------- | -------- | ------------------- |
| `software` (default)   | `~/.config/neotoma/aauth/private.jwk` | any      | `software` (always); `operator_attested` if allowlisted server-side |
| `apple-secure-enclave` | macOS Secure Enclave keychain entry, referenced by `se_key_tag` | darwin   | `hardware` when the JWT carries a verified `cnf.attestation`; otherwise `software` (or `operator_attested` if allowlisted) |
| `tpm2`                 | Linux TPM 2.0 persistent handle (`tpm2_handle`, default `0x81010000`) under the configured `tpm2_hierarchy` | linux    | `hardware` when the JWT carries a verified TPM 2.0 `cnf.attestation` (FU-3 verifier); otherwise `software` (or `operator_attested` if allowlisted) |
| `tbs`                  | Windows TBS / NCrypt key under the Microsoft Platform Crypto Provider, referenced by `tbs_key_name` (default `neotoma-aauth-aik`) | win32    | `hardware` when the JWT carries a verified TPM 2.0 `cnf.attestation` (FU-3 verifier); otherwise `software` (or `operator_attested` if allowlisted) |
| `yubikey`              | YubiKey 5 series PIV slot 9c, referenced by `yubikey_serial` and `yubikey_pkcs11_path` | darwin / linux / win32 | `hardware` when the JWT carries a verified WebAuthn-`packed` `cnf.attestation` rooted in the bundled Yubico PIV CA (FU-2 verifier); otherwise `software` (or `operator_attested` if allowlisted) |

For SE-backed keys the on-disk `private.jwk` stores ONLY the public
material plus a `backend: "apple-secure-enclave"` discriminator — the
private scalar never leaves the Enclave. Signing always goes through
`@neotoma/aauth-mac-se`'s native `sign()` primitive.

## On-disk schema (`signer.json`)

```json
{
  "sub": "cursor-agent@<hostname>",
  "iss": "https://neotoma.cursor.local",
  "kid": "<jwk-thumbprint>",
  "token_ttl_sec": 300,
  "backend": "apple-secure-enclave",
  "se_key_tag": "io.neotoma.aauth.cli.default"
}
```

`backend` and `se_key_tag` are optional and absent for legacy software
keypairs (treated as `backend: "software"` for back-compat). Software
keypairs continue to store a full private JWK in `private.jwk` with mode
`0600`. SE-backed `private.jwk` files contain only public coordinates
plus the `backend` field; reading them with `jose` produces a public-key
import as expected.

## Keygen flows

### `neotoma auth keygen` (software, default)

1. Generate a P-256 keypair via Web Crypto.
2. Write `private.jwk` (full JWK with `d`) at `0600`, `public.jwk` at
   `0644`, and `signer.json` with `backend: "software"`.

### `neotoma auth keygen --hardware`

Available on darwin only and requires `@neotoma/aauth-mac-se` to be
installed (it ships as an optional dependency on macOS hosts).

1. Validate `alg === "ES256"` (Secure Enclave only supports P-256).
2. Probe `se.isSupported()`; refuse if the host has no usable Secure
   Enclave or the binding cannot load.
3. Call `se.generateKey({ tag: <se_key_tag> })`; the native binding
   creates a fresh P-256 keypair pinned to the Enclave with biometric
   access policy and returns the public coordinates as a JWK.
4. Compute the RFC 7638 thumbprint and persist `private.jwk` (public
   material + `backend: "apple-secure-enclave"`), `public.jwk`, and
   `signer.json` with `backend` and `se_key_tag` populated.

If `--hardware` is passed on a non-macOS host, on a macOS host without
the optional package installed, or on a host where the Secure Enclave
probe fails, the command fails with a clear diagnostic. Operators can
re-run without `--hardware` to fall back to the software backend.

### `neotoma auth keygen --hardware` (Linux / TPM 2.0)

Available on linux only and requires `@neotoma/aauth-tpm2` to be
installed (it ships as an optional dependency on linux x64 / arm64
hosts). Implementation lives in `packages/aauth-tpm2/` (FU-4) and is
gated behind the same probe-then-fail pattern as the SE backend.

1. Validate that `process.platform === "linux"` and the requested alg
   is `ES256` or `RS256` (TPM 2.0 supports both via `TPM2_ALG_ECDSA` /
   `TPM2_ALG_RSASSA`).
2. Probe `tpm2.isSupported()`; refuse if the host has no usable
   `/dev/tpmrm0`, the resource manager is unreachable, or the binding
   cannot load.
3. Call `tpm2.generateKey({ hierarchy, alg })`; the native binding
   creates a fresh AIK, persists it at the configured TPM handle
   (default `0x81010000`, override via `NEOTOMA_AAUTH_TPM2_HANDLE`),
   and returns the public coordinates as a JWK.
4. Persist `private.jwk` (public material + `backend: "tpm2"`),
   `public.jwk`, and `signer.json` with `backend`, `tpm2_handle`, and
   `tpm2_hierarchy` populated.

If `--hardware` is passed on a non-Linux host, on a Linux host without
the optional package installed, or on a host where the TPM probe
fails (no `libtss2`, missing `/dev/tpmrm0`, restrictive `tss` group
membership), the command fails with a clear diagnostic and an
actionable hint pointing at `docs/integrations/aauth_tpm2_linux.md`.
Operators can re-run without `--hardware` to fall back to the
software backend.

### `neotoma auth keygen --hardware` (Windows / TBS + NCrypt)

Available on win32 only and requires `@neotoma/aauth-win-tbs` to be
installed (it ships as an optional dependency on Windows x64 / arm64
hosts). Implementation lives in `packages/aauth-win-tbs/` (FU-5) and is
gated behind the same probe-then-fail pattern as the SE and TPM2
backends. Although the wire format is WebAuthn-`tpm` (and the FU-3
verifier is reused unchanged), the CLI uses the Trusted Platform Module
Base Services (TBS) and Cryptography Next Generation (CNG / NCrypt)
APIs rather than direct command-level TPM 2.0 access, because Windows
does not expose a stable userspace TPM device the way `/dev/tpmrm0`
does on Linux.

1. Validate that `process.platform === "win32"` and the requested alg
   is `ES256` or `RS256` (TPM 2.0 supports both via `TPM2_ALG_ECDSA` /
   `TPM2_ALG_RSASSA`; CNG exposes both shapes).
2. Probe `tbs.isSupported()`; refuse if the host has no usable
   Microsoft Platform Crypto Provider, the TBS service is disabled, or
   the binding cannot load.
3. Call `tbs.generateKey({ provider, scope, alg, keyName })`; the
   native binding calls `NCryptOpenStorageProvider` followed by
   `NCryptCreatePersistedKey` against the Microsoft Platform Crypto
   Provider with `NCRYPT_MACHINE_KEY_FLAG` toggled by `scope`. The
   binding finalises the key (`NCryptFinalizeKey`) and returns the
   public coordinates as a JWK.
4. Persist `private.jwk` (public material + `backend: "tbs"`),
   `public.jwk`, and `signer.json` with `backend`, `tbs_provider`,
   `tbs_scope`, and `tbs_key_name` populated.

If `--hardware` is passed on a non-Windows host, on a Windows host
without the optional package installed, or on a host where the TBS
probe fails (no Microsoft Platform Crypto Provider, no usable TPM 2.0
chip, or the TBS service disabled), the command fails with a clear
diagnostic and an actionable hint pointing at
`docs/integrations/aauth_tbs_windows.md`. Operators can re-run without
`--hardware` to fall back to the software backend.

### `neotoma auth keygen --hardware --backend=yubikey` (cross-platform / YubiKey)

Available on darwin / linux / win32 and requires `@neotoma/aauth-yubikey`
plus `libykcs11` (the Yubico PKCS#11 provider, part of YubiKey Manager
or yubico-piv-tool) plus a YubiKey 5 series device connected. The
package ships as an optional dependency on all three platforms (the
YubiKey is an external USB device). Implementation lives in
`packages/aauth-yubikey/` (FU-6) and is gated behind the same
probe-then-fail pattern as the SE, TPM2, and TBS backends.

Unlike the platform-native backends, YubiKey is intentionally a
fallback in the backend ladder rather than the default: a host with a
TPM 2.0 chip on linux or win32 (or a Secure Enclave on darwin) prefers
the platform-native backend because that path requires no operator
action beyond `--hardware`. YubiKey is selected when the
platform-native backend declines (no TPM / no SE / virtualised host
without passthrough) or when operators explicitly pin via
`NEOTOMA_AAUTH_HARDWARE_BACKEND=yubikey`.

The wire format for YubiKey envelopes is WebAuthn-`packed` (the same
format consumed by FU-2's `verifyWebauthnPackedAttestation`), NOT
WebAuthn-`tpm`. YubiKey PIV slot attestations chain to Yubico's PIV CA
(bundled in `config/aauth/yubico_piv_roots.pem`) rather than a TPM
manufacturer chain, so they reuse the FU-2 verifier rather than the
FU-3 TPM 2.0 verifier. Operators do not need to configure a separate
trust anchor for YubiKey beyond ensuring `config/aauth/yubico_piv_roots.pem`
is present in the server's trust store.

1. Validate that the requested alg is `ES256` (YubiKey PIV slot 9c
   only supports P-256 with stable cross-platform attestation).
2. Probe `yk.isSupported({ pkcs11Path? })`; refuse if `libykcs11` is
   not loadable, no YubiKey is detected, the firmware is too old
   (< 5.0.0; no `YKPIV_INS_ATTEST` support), or the binding cannot
   load.
3. Prompt for the PIV PIN (interactive TTY) or honour
   `NEOTOMA_AAUTH_YUBIKEY_PIN`. The PIN value is forwarded once via
   `C_Login` and NEVER persisted to `signer.json`.
4. Call `yk.generateKey({ slot: "9c", alg: "ES256", pin, serial })`;
   the native binding calls `C_GenerateKeyPair` against the YubiKey's
   PKCS#11 slot mapped to PIV slot 9c (`CKA_ID = 0x9c`,
   `CKA_LABEL = "PIV AUTH key"`). The binding then fetches the
   per-slot YubiKey PIV attestation cert and the F9 attestation
   intermediate via `C_GetAttributeValue` against the cert objects
   with `CKA_ID = 0x9c` (per-slot) and `CKA_ID = 0xF9` (intermediate).
   The private scalar NEVER leaves the YubiKey.
5. Persist `private.jwk` (public material + `backend: "yubikey"`),
   `public.jwk`, and `signer.json` with `backend`, `yubikey_slot`,
   `yubikey_serial`, and `yubikey_pkcs11_path` populated. The PIN is
   NEVER persisted to disk — every subsequent CLI invocation that
   requires signing prompts for the PIN again unless
   `NEOTOMA_AAUTH_YUBIKEY_PIN` is set.

If `--backend=yubikey` is passed on a host without the optional
package installed, or on a host where the YubiKey probe fails (no
`libykcs11`, no device connected, firmware too old, PIN locked), the
command fails with a clear diagnostic and an actionable hint pointing
at `docs/integrations/aauth_yubikey.md`. Operators can re-run without
`--hardware` to fall back to the software backend, or with
`NEOTOMA_AAUTH_HARDWARE_BACKEND=auto` (the default) to let the CLI
pick the best available backend per the ladder above.

## JWT minting (`mintCliAgentTokenJwt`)

`mintCliAgentTokenJwt(config, options)` produces an `aa-agent+jwt`
agent token with these standard claims:

- `iss`, `sub`, `iat`, `exp`, `kid`
- `cnf.jwk`: the public JWK (RFC 7800 confirmation key)
- `cnf.attestation` (optional): an `AttestationEnvelope` per
  `docs/subsystems/aauth_attestation.md`

For `backend: "software"` the function delegates to `jose.SignJWT`.
For `backend: "apple-secure-enclave"` it:

1. Manually composes the JOSE header (`{ alg: "ES256", typ: "JWT", kid }`)
   and base64url-encoded payload.
2. Computes the SHA-256 digest of the signing input
   (`<base64url(header)>.<base64url(payload)>`).
3. Calls `se.sign({ tag: se_key_tag, message })`; the native binding
   returns a DER-encoded ECDSA signature produced inside the Enclave.
4. Converts the DER signature to JOSE r||s format
   (`derEcdsaToJose`) and base64url-encodes it.
5. Concatenates the three parts with `.` separators.

This keeps the JWT bit-for-bit compatible with software-signed tokens
while never exposing the private scalar to the JavaScript runtime.

## HTTP message signing (`cliSignedFetch`)

`cliSignedFetch` is the single entry point for authenticated CLI →
Neotoma API calls. It dispatches on `config.backend`:

- `software`: hands `signingKey` (the private JWK) to
  `@hellocoop/httpsig`'s `signedFetch`, which signs over the default
  RFC 9421 component set with the `aasig` label.
- `apple-secure-enclave`: routes through the local `seSignedFetch`
  helper. The helper assembles the same component set
  (`@method`, `@target-uri`, optional `content-type` /
  `content-digest`, `signature-key`), builds the RFC 9421 signature
  base, and calls the SE-backed `seSignJoseEs256` to produce the
  `signature` header value. The agent token is carried in the
  `signature-key` header verbatim, exactly like the software path.

Both paths produce an identical wire format from the server's
perspective; only the signing primitive differs.

## Generating attestation envelopes

`buildAppleAttestationEnvelope({ config, iat })` produces an
`AttestationEnvelope` for the configured Secure Enclave key:

1. Refuses unless `config.backend === "apple-secure-enclave"` and the
   native binding is available.
2. Computes `challenge = sha256(iss + "\n" + sub + "\n" + iat)` via the
   shared `buildAttestationChallenge` helper. The same `iat` MUST be
   used when minting the JWT that carries the envelope; otherwise the
   server rejects the bound challenge.
3. Calls `se.attest({ tag, challenge })`; the binding returns the
   Apple-issued attestation chain plus a key-binding signature blob.
4. Computes the JWK thumbprint (`key_binding_jkt`) over the same public
   key the JWT advertises in `cnf.jwk` and packages everything into the
   envelope shape:

   ```json
   {
     "format": "apple-secure-enclave",
     "statement": {
       "attestation_object": "<base64url Apple chain>",
       "key_id": "<base64url key binding>"
     },
     "challenge": "<sha256 base64url>",
     "key_binding_jkt": "<RFC 7638 thumbprint>"
   }
   ```

When the helper returns `null` (non-darwin host, missing binding,
unsupported Enclave, or non-SE backend), the caller MUST proceed with a
software-tier signed write rather than fabricating an envelope.

### `buildTpm2AttestationEnvelope` (Linux / TPM 2.0)

`src/cli/aauth_tpm2_attestation.ts` is the Linux/TPM 2.0 counterpart of
the Apple SE helper above. It consumes the optional
`@neotoma/aauth-tpm2` native package and produces an envelope shaped
exactly as FU-3's `verifyTpm2Attestation` expects:

1. {@link isTpm2BackendAvailable} probes the binding without throwing
   so callers can branch to the software signer cleanly when the host
   lacks `libtss2` or `/dev/tpmrm0`.
2. {@link computeAttestationChallenge} derives
   `base64url(SHA-256(iss || sub || iat))` — bit-for-bit identical to
   the server-side `computeExpectedChallenge` so the binding contract
   does not drift.
3. {@link buildTpm2AttestationEnvelope} calls
   `tpm2.attest({ handle, challenge, jkt })` and packages the binding's
   AIK chain, TPMS_ATTEST quote, and TPMT_PUBLIC into:

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

The helper throws `Tpm2BackendUnavailableError` (rather than returning
`null`) so misconfigured `--hardware` flows surface a structured error
with a `reason` describing why the backend is unavailable. Callers
opting into hardware mode catch this error and fall back to the
software signer; callers wired through `keygen --hardware` re-throw
to abort with a clean diagnostic.

### `buildTbsAttestationEnvelope` (Windows / TBS + NCrypt)

`src/cli/aauth_tbs_attestation.ts` is the Windows / TBS counterpart of
the Apple SE and Linux TPM 2.0 helpers above. It consumes the optional
`@neotoma/aauth-win-tbs` native package and produces an envelope
shaped exactly as FU-3's `verifyTpm2Attestation` expects — even though
the underlying calls are `NCryptCreateClaim` against the Microsoft
Platform Crypto Provider rather than raw TPM 2.0 commands, the wire
format is identical:

1. {@link isTbsBackendAvailable} probes the binding without throwing
   so callers can branch to the software signer cleanly when the host
   lacks the Microsoft Platform Crypto Provider, has no usable TPM, or
   has the TBS service disabled.
2. {@link computeAttestationChallenge} derives
   `base64url(SHA-256(iss || sub || iat))` — bit-for-bit identical to
   the server-side `computeExpectedChallenge` so the binding contract
   does not drift across CLI backends.
3. {@link buildTbsAttestationEnvelope} calls
   `tbs.attest({ keyName, provider?, challenge, jkt })` and packages
   the binding's AIK chain, TPMS_ATTEST quote, and TPMT_PUBLIC into:

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

The helper throws `TbsBackendUnavailableError` (rather than returning
`null`) so misconfigured `--hardware` flows surface a structured error
with a `reason` describing why the backend is unavailable. Callers
opting into hardware mode catch this error and fall back to the
software signer; callers wired through `keygen --hardware` re-throw
to abort with a clean diagnostic.

### `buildYubikeyAttestationEnvelope` (cross-platform / YubiKey PKCS#11)

`src/cli/aauth_yubikey_attestation.ts` is the cross-platform YubiKey
counterpart of the SE / TPM 2.0 / TBS helpers above. It consumes the
optional `@neotoma/aauth-yubikey` native package and produces an
envelope shaped exactly as FU-2's `verifyWebauthnPackedAttestation`
expects — the wire format is the standard WebAuthn-`packed` envelope
(`format: "webauthn-packed"`), NOT WebAuthn-`tpm`. The server reuses
the FU-2 verifier without modification:

1. {@link isYubikeyBackendAvailable} probes the binding without
   throwing so callers can branch to the next backend (or the
   software signer) cleanly when the host lacks `libykcs11`, has no
   YubiKey connected, or has a YubiKey with firmware < 5.0.0 (no
   `YKPIV_INS_ATTEST` support).
2. {@link computeAttestationChallenge} derives
   `base64url(SHA-256(iss || sub || iat))` — bit-for-bit identical to
   the server-side `computeExpectedChallenge` and to the helpers used
   by FU-4 (TPM 2.0) and FU-5 (TBS). The cross-FU helper compatibility
   is enforced by a unit test (`tests/unit/cli_aauth_yubikey_attestation.test.ts`).
3. {@link buildYubikeyAttestationEnvelope} calls
   `yk.attest({ slot, challenge, jkt, pkcs11Path?, pin?, serial? })`
   and packages the per-slot attestation cert plus the F9 intermediate
   into:

   ```json
   {
     "format": "webauthn-packed",
     "statement": {
       "alg": -7,
       "sig": "<base64url DER ECDSA signature>",
       "x5c": ["<slot 9c attestation cert>", "<F9 intermediate>"]
     },
     "challenge": "<sha256 base64url>",
     "key_binding_jkt": "<RFC 7638 thumbprint>",
     "aaguid": "<yubikey 5 series AAGUID base64url>"
   }
   ```

   The `aaguid` field is hoisted to the envelope top level for
   convenience; the server-side verifier extracts AAGUID from the leaf
   cert's `id-fido-gen-ce-aaguid` extension when present and falls back
   to this hoisted field when the cert lacks the extension.

The helper throws `YubikeyBackendUnavailableError` (rather than
returning `null`) so misconfigured `--hardware --backend=yubikey`
flows surface a structured error with a `reason` describing why the
backend is unavailable. Callers opting into hardware mode catch this
error and fall back to the software signer; callers wired through
`keygen --hardware` re-throw to abort with a clean diagnostic.

PIN handling: every call to `buildYubikeyAttestationEnvelope` that
does not pass `pin` explicitly relies on the binding's PIN resolution
(in priority order: explicit `pin` argument → `NEOTOMA_AAUTH_YUBIKEY_PIN`
env var → interactive TTY prompt). The helper NEVER caches the PIN
across invocations and NEVER logs PIN values. Three failed PIN
attempts lock the YubiKey; recovery requires
`ykman piv access change-pin --puk`.

## `auth session` and `describeConfiguredSigner`

`describeConfiguredSigner()` extends the legacy summary with three new
fields so operators can confirm which backend is in use:

- `backend`: `"software"` or `"apple-secure-enclave"`
- `se_key_tag` (when present)
- `hardware_supported` / `hardware_supported_reason` (only when the
  signer is SE-backed; reflects the most recent `isSupported()` probe)

`neotoma auth session` already renders these fields in its `signer:`
block.

## Operator environment

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NEOTOMA_AAUTH_PRIVATE_JWK_PATH` | `~/.config/neotoma/aauth/private.jwk` | Override JWK location for all backends |
| `NEOTOMA_AAUTH_SE_KEY_TAG` | `io.neotoma.aauth.cli.default` | Override the keychain tag used by `--hardware` keygen on darwin |
| `NEOTOMA_AAUTH_TPM2_HANDLE` | `0x81010000` | Override the TPM 2.0 persistent handle used by `--hardware` keygen on linux |
| `NEOTOMA_AAUTH_TPM2_HIERARCHY` | `owner` | Override the TPM 2.0 hierarchy (`owner` or `endorsement`) on linux |
| `NEOTOMA_AAUTH_TPM2_TEST_ENABLED` | unset | Gate hardware-bound smoke tests in `packages/aauth-tpm2/tests/` |
| `NEOTOMA_AAUTH_WIN_TBS_PROVIDER` | `Microsoft Platform Crypto Provider` | Override the NCrypt key storage provider used by `--hardware` keygen on Windows |
| `NEOTOMA_AAUTH_WIN_TBS_KEY_NAME` | `neotoma-aauth-aik` | Override the NCrypt key name used by `--hardware` keygen on Windows |
| `NEOTOMA_AAUTH_WIN_TBS_SCOPE` | `user` | Override the NCrypt key scope (`user` or `machine`) on Windows |
| `NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED` | unset | Gate hardware-bound smoke tests in `packages/aauth-win-tbs/tests/` |
| `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH` | platform-specific search list | Override the path to `libykcs11` (Yubico PKCS#11 provider) used by `--hardware --backend=yubikey` |
| `NEOTOMA_AAUTH_YUBIKEY_SERIAL` | unset | Pin to a specific YubiKey by decimal serial number (when multiple YubiKeys are connected) |
| `NEOTOMA_AAUTH_YUBIKEY_PIN` | unset | Inject the PIV PIN non-interactively. NEVER logged, NEVER persisted to `signer.json`. Three failed attempts lock the YubiKey |
| `NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED` | unset | Gate hardware-bound smoke tests in `packages/aauth-yubikey/tests/` |
| `NEOTOMA_AAUTH_HARDWARE_BACKEND` | `auto` | Pin the hardware backend selection (`auto`, `apple-secure-enclave`, `tpm2`, `tbs`, `yubikey`). `auto` picks the best platform-native backend, falling back to YubiKey when none is available |

Server-side trust knobs (`NEOTOMA_AAUTH_ATTESTATION_CA_PATH`,
`NEOTOMA_OPERATOR_ATTESTED_ISSUERS`, etc.) are documented in
`docs/subsystems/aauth_attestation.md` and `.env.example`; the CLI does
not consume them directly.

## Related documents

- [`docs/subsystems/aauth_attestation.md`](aauth_attestation.md) — Server-side verification spec
- [`docs/subsystems/agent_attribution_integration.md`](agent_attribution_integration.md) — End-to-end attribution flow
- [`packages/aauth-mac-se/README.md`](../../packages/aauth-mac-se/README.md) — macOS Secure Enclave binding internals
- [`packages/aauth-tpm2/README.md`](../../packages/aauth-tpm2/README.md) — Linux TPM 2.0 binding internals (FU-4)
- [`packages/aauth-win-tbs/README.md`](../../packages/aauth-win-tbs/README.md) — Windows TBS / NCrypt binding internals (FU-5)
- [`packages/aauth-yubikey/README.md`](../../packages/aauth-yubikey/README.md) — Cross-platform YubiKey PKCS#11 binding internals (FU-6)
- [`docs/integrations/aauth_tpm2_linux.md`](../integrations/aauth_tpm2_linux.md) — Per-distro TPM 2.0 install + troubleshooting
- [`docs/integrations/aauth_tbs_windows.md`](../integrations/aauth_tbs_windows.md) — Windows TBS install + troubleshooting
- [`docs/integrations/aauth_yubikey.md`](../integrations/aauth_yubikey.md) — Cross-platform YubiKey install + troubleshooting
- [`docs/developer/cli_reference.md`](../developer/cli_reference.md) — CLI command reference
