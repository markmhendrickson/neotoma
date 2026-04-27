v0.10.0 takes the server-side TPM 2.0 verifier shipped in v0.9.0 and gives it real-world client-side counterparts on Linux and Windows. After v0.10.0, `neotoma auth keygen --hardware` works on three operating systems instead of one: macOS via Apple Secure Enclave (v0.8.0), Linux via libtss2 / TPM 2.0 (this release), and Windows via TBS + CNG (this release). Hardware attestation is no longer a darwin-only feature.

This release implements two follow-up Feature Units from the v0.8.0 attestation plan:

- **FU-2026-Q4-aauth-linux-tpm2-cli** (FU-4)
- **FU-2026-Q4-aauth-windows-tbs-cli** (FU-5)

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full sequencing rationale. Both FUs depend on FU-3 (TPM 2.0 server-side verifier) which shipped in v0.9.0.

## Ship constraints

- `npx tsc --noEmit` clean across `src/` and the new `packages/aauth-tpm2/` and `packages/aauth-win-tbs/` workspace members.
- The two new N-API bindings are published as `optionalDependencies` (matching `@neotoma/aauth-mac-se`'s v0.8.0 model). They build only on their respective host OSes; non-matching hosts continue to use the software signer with no behavioral change.
- No schema migrations. The existing `cnf.attestation` envelope on the agent token is reused unchanged; the new CLI backends only generate envelopes the v0.9.0 verifier already understands.
- Bundled trust roots from v0.9.0 (`config/aauth/tpm_attestation_roots/`) are unchanged.

## Highlights

- **`neotoma auth keygen --hardware` works on Linux.** A new optional dependency `@neotoma/aauth-tpm2` (lives in `packages/aauth-tpm2/`) wraps libtss2 via N-API and exposes `isSupported`, `generateKey`, `sign`, and `attest`. The CLI uses it to mint a TPM-resident AIK key and produce a `tpm` envelope (TPMS_ATTEST + TPMT_PUBLIC + AIK chain) that the v0.9.0 verifier admits.
- **`neotoma auth keygen --hardware` works on Windows.** A new optional dependency `@neotoma/aauth-win-tbs` (lives in `packages/aauth-win-tbs/`) wraps the Windows Trusted Base Services API plus CNG via N-API. Same `isSupported` / `generateKey` / `sign` / `attest` surface; same envelope output shape; same v0.9.0 verifier on the server side.
- **Cross-platform parity in `signer.json`.** `src/cli/aauth_signer.ts` extends `SignerBackend` from `"software" | "apple-secure-enclave"` to add `"tpm2"` and `"windows-tbs"`. The on-disk `signer.json` schema gains two backend-specific tag fields (`tpm2_handle_persistent_path` and `cng_key_name`) but otherwise keeps the same shape; existing software and Apple SE signer files load unchanged.
- **`neotoma auth session` reports per-platform hardware status.** `describeConfiguredSigner` now answers `hardware_supported: true | false` and `hardware_supported_reason: string` honestly on Linux and Windows in addition to macOS, so operators can tell at a glance whether the host can mint hardware-backed keys.

## What changed for npm package users

**New optional dependencies**

- `@neotoma/aauth-tpm2` (`packages/aauth-tpm2/`) — N-API binding to libtss2. Linux-only; gracefully absent on macOS and Windows. Build inputs: libtss2-dev, node-gyp, a C++17 toolchain. Mirrors the package shape and error model already established by `@neotoma/aauth-mac-se`.
- `@neotoma/aauth-win-tbs` (`packages/aauth-win-tbs/`) — N-API binding to TBS + CNG. Windows-only; gracefully absent on macOS and Linux. Build inputs: Windows SDK, node-gyp, MSVC toolchain. Same package shape.

**CLI signer**

- `src/cli/aauth_signer.ts`:
  - `SignerBackend` enum extended with `"tpm2"` and `"windows-tbs"`.
  - `generateAndStoreKeypair({ hardware: true })` now dispatches to the platform-appropriate backend (Linux → `aauth-tpm2`, Windows → `aauth-win-tbs`, macOS → `aauth-mac-se`, fallback → software with a clear "no hardware backend available" message).
  - `mintCliAgentTokenJwt` and `cliSignedFetch` extended to dispatch DER-ECDSA-to-JOSE conversion through the active backend.
  - `buildAttestationEnvelope` returns the platform-appropriate envelope: Apple App Attestation on macOS, WebAuthn `tpm` format on Linux and Windows. The challenge derivation (`iat` + `cnf.jwk` thumbprint) is identical across backends.
- `src/types/aauth-tpm2.d.ts` and `src/types/aauth-win-tbs.d.ts` — new ambient module declarations so the CLI can dynamically import the optional deps without hard build-time dependencies.

**Documentation**

- `docs/subsystems/aauth_cli_attestation.md` — extended with Linux and Windows keygen flows, the new `signer.json` field documentation, and per-platform troubleshooting (TPM permission errors, CNG provider missing, TBS service stopped).
- `docs/subsystems/aauth_attestation.md` — operator-facing notes on the new envelopes the server now accepts in production (the server-side verifier itself was already capable as of v0.9.0).

## API surface & contracts

- No HTTP route additions or removals.
- `cnf.attestation.format` values accepted by the verifier remain `apple-secure-enclave`, `webauthn-packed`, and `tpm2`. Linux and Windows clients use `tpm2`; YubiKey clients (FU-6, v0.10.x) will use `webauthn-packed`. No new format strings are introduced.
- `signer.json` schema additions (`tpm2_handle_persistent_path`, `cng_key_name`) are additive. v0.8.0 / v0.9.0 signer files load unchanged.
- `openapi.yaml` is not materially tightened in this release; `npm run -s openapi:bc-diff -- --base v0.9.0` reports no breaking changes.

## Behavior changes

- On Linux hosts with a functional TPM 2.0 device and libtss2 installed, `neotoma auth keygen --hardware` succeeds where it previously aborted with "hardware backend unavailable on this platform".
- On Windows hosts with a functional TPM (BitLocker-class hardware) and the TBS service running, the same is true.
- `neotoma auth session` now reports a non-`null` `hardware_supported_reason` on Linux and Windows. Operators that scraped the v0.8.0 / v0.9.0 macOS-only output should review.

## Tests and validation

- `packages/aauth-tpm2/test/` — unit tests for the N-API binding's argument validation, error mapping, and graceful "TPM not present" path. Real-TPM smoke tests are skipped unless `NEOTOMA_AAUTH_TPM2_INTEGRATION=1` is set in CI.
- `packages/aauth-win-tbs/test/` — unit tests for the N-API binding's argument validation, error mapping, and graceful "TBS unavailable" path. Real-TPM smoke tests are skipped unless `NEOTOMA_AAUTH_WIN_TBS_INTEGRATION=1`.
- `tests/integration/aauth_cli_keygen_linux.test.ts` and `tests/integration/aauth_cli_keygen_windows.test.ts` — CLI-level keygen flows mocked at the binding boundary, asserting the resulting `signer.json` shape and that the produced envelope round-trips through the v0.9.0 verifier in-process.
- `npm run -s openapi:bc-diff -- --base v0.9.0` reports no breaking changes.

## New environment variables

None. The new packages discover the TPM via OS-standard mechanisms (libtss2's TCTI selection on Linux, TBS service on Windows). Operators that need to override TCTI selection on Linux can set the standard `TCTI` env var; this is upstream behavior, not a Neotoma surface.

## Fixes

- `neotoma auth session`'s `hardware_supported_reason` previously hard-coded "darwin only" on Linux and Windows. The reason string is now honest about why hardware is or is not available on the running platform.

## Breaking changes

None.

## Rollback

- npm: `v0.9.0` remains available; consumers can pin with `npm install neotoma@0.9.0`. Rolling back removes the Linux and Windows hardware backends; agents that minted TPM-backed keys continue to verify on the v0.9.0 server (the envelope format is unchanged) but can no longer mint new hardware-backed keys until they reinstall a v0.10.x package.

## Follow-up work

- v0.10.x will ship FU-6 (YubiKey CLI), hard-blocked on the FU-2 WebAuthn-packed verifier delivered in v0.9.0.
- v0.11.0 will ship FU-7 (attestation revocation) in `log_only` mode; v0.12.0 flips it to `enforce`.

See `.cursor/plans/aauth_attestation_followups.plan.md` for the full follow-up roadmap.
