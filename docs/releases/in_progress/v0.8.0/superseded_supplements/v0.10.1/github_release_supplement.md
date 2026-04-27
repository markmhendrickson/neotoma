v0.10.1 fills the last gap in the v0.8.0 attestation roadmap's hardware-key story: portable, USB-attached hardware. After v0.10.1, `neotoma auth keygen --hardware --backend yubikey` mints a key inside a YubiKey 5 (or compatible PIV-capable device) and produces a `webauthn-packed` envelope the v0.9.0 server-side verifier admits without modification. This makes hardware-backed AAuth available to agents running on machines that do not themselves have a TPM (laptops without a TPM, CI runners, ephemeral VMs, etc.) by giving the operator a portable hardware root they can carry between hosts.

This release implements one follow-up Feature Unit from the v0.8.0 attestation plan:

- **FU-2026-Q4-aauth-yubikey-cli** (FU-6)

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full sequencing rationale. FU-6 depends on FU-2 (WebAuthn-packed server-side verifier) which shipped in v0.9.0; the server side requires no further changes in this release.

## Ship constraints

- `npx tsc --noEmit` clean across `src/` and the new `packages/aauth-yubikey/` workspace member.
- The new N-API binding is published as an `optionalDependency` (matching `@neotoma/aauth-mac-se`, `@neotoma/aauth-tpm2`, `@neotoma/aauth-win-tbs`). It builds on Linux, macOS, and Windows wherever libykcs11 is available; absent libykcs11 it falls back gracefully and the CLI prints a clear "YubiKey backend unavailable" message.
- No schema migrations. The CLI generates `webauthn-packed` envelopes that the v0.9.0 verifier already understands; no new attestation format is introduced.
- No new server-side verification logic. The `webauthn-packed` verifier from v0.9.0 handles YubiKey-issued chains via the AAGUID trust list (`NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH`).

## Highlights

- **YubiKey 5 / 5C / Bio support, end-to-end.** A new optional dependency `@neotoma/aauth-yubikey` (lives in `packages/aauth-yubikey/`) wraps libykcs11 plus the YubiKey PIV `YKPIV_INS_ATTEST` instruction via N-API. Same `isSupported` / `generateKey` / `sign` / `attest` surface as the platform TPM bindings.
- **`signer.json` learns one new backend.** `SignerBackend` extends from `"software" | "apple-secure-enclave" | "tpm2" | "windows-tbs"` to add `"yubikey"`. A new `yubikey_serial` field on `signer.json` identifies which key produced the envelope (so the same host can ship multiple YubiKey-backed signers without ambiguity, e.g. one personal key plus one CI key).
- **Pluggable envelope generation honoured.** Because the server-side verifier already accepts `webauthn-packed`, the CLI's envelope generator routes YubiKey statements through the same path as a future browser-issued WebAuthn registration. The challenge derivation (`iat` + `cnf.jwk` thumbprint) is identical across all four hardware backends.
- **Per-host AAGUID admission.** Operators that want to admit only specific YubiKey models (e.g. only YubiKey 5C NFC FIPS) configure `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH` with the AAGUID set they accept. The default bundled trust list admits the major Yubico AAGUIDs; operators who want stricter policy can ship a narrower file.

## What changed for npm package users

**New optional dependency**

- `@neotoma/aauth-yubikey` (`packages/aauth-yubikey/`) — N-API binding to libykcs11. Cross-platform; gracefully absent when libykcs11 is not on the loader path. Build inputs: libykcs11 (yubico), node-gyp, a C++17 toolchain. Mirrors the package shape and error model already established by `@neotoma/aauth-mac-se`, `@neotoma/aauth-tpm2`, and `@neotoma/aauth-win-tbs`.

**CLI signer**

- `src/cli/aauth_signer.ts`:
  - `SignerBackend` enum extended with `"yubikey"`.
  - `generateAndStoreKeypair({ hardware: true, backend: "yubikey" })` flow — uses the YubiKey PIV `Authentication` slot to mint an EC P-256 key and emits an attestation chain rooted at Yubico's PIV root CA.
  - `buildAttestationEnvelope` now returns a `webauthn-packed` envelope when the active backend is `"yubikey"`, with the YubiKey-issued certificate chain in `x5c` and the canonical attestation data signed by the freshly minted slot key.
  - `mintCliAgentTokenJwt` and `cliSignedFetch` dispatch DER-ECDSA-to-JOSE conversion through the active YubiKey slot.
- `src/types/aauth-yubikey.d.ts` — new ambient module declaration so the CLI can dynamically import the optional dep.

**Documentation**

- `docs/subsystems/aauth_cli_attestation.md` — extended with the YubiKey keygen flow (PIV slot selection, PIN-cached vs PIN-always, AAGUID interactions) and an end-to-end example using `webauthn-packed` against a v0.9.0+ server.
- `docs/subsystems/aauth_attestation.md` — clarifies that the v0.9.0 `webauthn-packed` verifier admits YubiKey-issued chains and links to the bundled / operator-supplied AAGUID trust list rules.

## API surface & contracts

- No HTTP route additions or removals.
- `cnf.attestation.format` accepted values are unchanged from v0.9.0 (`apple-secure-enclave`, `webauthn-packed`, `tpm2`). YubiKey clients use `webauthn-packed`.
- `signer.json` schema addition (`yubikey_serial`) is additive. v0.8.0 / v0.9.0 / v0.10.0 signer files load unchanged.
- `openapi.yaml` is not materially tightened in this release; `npm run -s openapi:bc-diff -- --base v0.10.0` reports no breaking changes.

## Behavior changes

- On hosts with libykcs11 installed and a YubiKey inserted, `neotoma auth keygen --hardware --backend yubikey` succeeds where it previously aborted. (`--backend` itself is new; the v0.10.0 default behaviour of `neotoma auth keygen --hardware` continues to pick the platform's built-in hardware backend when one is available.)
- `neotoma auth session` now surfaces `yubikey_serial` in the signer summary when the active signer is YubiKey-backed.

## Tests and validation

- `packages/aauth-yubikey/test/` — unit tests for argument validation, error mapping, and the graceful "no YubiKey present" path. Real-hardware smoke tests are skipped unless `NEOTOMA_AAUTH_YUBIKEY_INTEGRATION=1` is set.
- `tests/integration/aauth_cli_keygen_yubikey.test.ts` — CLI-level keygen flow mocked at the binding boundary, asserting the resulting `signer.json` shape, that `cnf.attestation.format === "webauthn-packed"`, and that the produced envelope round-trips through the v0.9.0 verifier in-process.
- `npm run -s openapi:bc-diff -- --base v0.10.0` reports no breaking changes.

## New environment variables

None. YubiKey selection happens via libykcs11 standard mechanisms (PKCS#11 slot enumeration). The existing `NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH` from v0.8.0 governs server-side AAGUID admission unchanged.

## Fixes

- Hardware AAuth is no longer reachable only on hosts with built-in TPM / Secure Enclave. Operators can now ship hardware AAuth to laptop fleets, CI runners, and ephemeral VMs by issuing each agent operator a YubiKey.

## Breaking changes

None.

## Rollback

- npm: `v0.10.0` remains available; consumers can pin with `npm install neotoma@0.10.0`. Rolling back removes the YubiKey backend; agents that minted YubiKey-backed keys continue to verify on a v0.9.0+ server (the envelope is `webauthn-packed`, unchanged) but can no longer mint new YubiKey-backed keys until they reinstall a v0.10.1+ package.

## Follow-up work

- v0.11.0 will ship FU-7 (attestation revocation) in `log_only` mode; v0.12.0 flips it to `enforce`.

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full follow-up roadmap.
