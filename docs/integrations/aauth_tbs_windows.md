# AAuth TBS / NCrypt on Windows

## Purpose

Operator-facing setup guide for the optional `@neotoma/aauth-win-tbs`
native package (FU-5). When installed and probing successfully on a
Windows host with a usable TPM 2.0 chip, `neotoma auth keygen
--hardware` mints a TPM-resident AIK under the Microsoft Platform
Crypto Provider and embeds a WebAuthn-`tpm`-format `cnf.attestation`
envelope in the CLI's `aa-agent+jwt` agent token. The server-side
verifier (FU-3) promotes the resulting writes to the `hardware`
attestation tier — even though the CLI used `NCryptCreateClaim` rather
than raw TPM 2.0 commands, the wire format is identical.

## Scope

Covers:

- Windows version, edition, and TPM 2.0 prerequisites.
- TBS service and Microsoft Platform Crypto Provider availability
  checks.
- How to test and validate the binding once installed.
- Common failure modes and remediation hints.

Does NOT cover:

- The CLI signer's backend dispatch (see
  [`docs/subsystems/aauth_cli_attestation.md`](../subsystems/aauth_cli_attestation.md)).
- Server-side TPM 2.0 verification semantics (see
  [`docs/subsystems/aauth_attestation.md`](../subsystems/aauth_attestation.md)).
- The native binding's internal C++ implementation (see
  [`packages/aauth-win-tbs/README.md`](../../packages/aauth-win-tbs/README.md)).

## Requirements

- Windows 10 21H2+, Windows 11, Windows Server 2019+, or Windows Server
  2022+ on x64 or arm64.
- A discrete or firmware TPM 2.0 chip enabled in firmware (Intel PTT,
  AMD fTPM, or a discrete dTPM) and recognised by Windows. Verify with
  `Get-Tpm` in an elevated PowerShell:

  ```powershell
  Get-Tpm | Format-List TpmPresent, TpmReady, TpmEnabled, TpmActivated, ManufacturerVersion
  # TpmPresent  : True
  # TpmReady    : True
  # TpmEnabled  : True
  # TpmActivated: True
  ```

- The Trusted Platform Module Base Services (`TBS`) service running.
  Verify with `Get-Service TBS`; if it is `Stopped` or `Disabled`,
  start it via `Start-Service TBS` and audit your group policy.
- The **Microsoft Platform Crypto Provider** registered as an NCrypt
  key storage provider. Verify with:

  ```powershell
  certutil -csplist | Select-String "Microsoft Platform Crypto Provider"
  ```

  When the provider is missing, the host either lacks a usable TPM or
  the platform provider has been blocked by group policy.
- Windows SDK + Visual Studio Build Tools (C++ workload) when building
  the binding from source. Pre-built binaries are produced via
  `prebuildify` for the standard Windows matrix; source builds are
  only the fallback for arm64 hosts and other off-matrix configurations.
- Node.js ≥ 20 (to match the rest of the Neotoma CLI).

## Build prerequisites (source builds only)

Source builds require:

- Visual Studio 2019 or 2022 Build Tools with the **Desktop development
  with C++** workload (`vc_redist`, MSVC v143 toolset, Windows 11 SDK
  10.0.22621.0+).
- Python 3.11+ on `PATH` (`node-gyp` requirement).
- `npm config set msvs_version 2022` once per machine to pin the
  toolchain.

When pre-built binaries are available for the host architecture,
`npm install @neotoma/aauth-win-tbs` skips the source build entirely.

## Installing `@neotoma/aauth-win-tbs`

The package is shipped as an `optionalDependency` of the Neotoma CLI:
non-Windows installs skip it silently, and Windows installs without
the C++ build tools fall back to the prebuilt binary when available
or print a single non-fatal warning during `npm install`. Operators
who want to opt in explicitly can run:

```powershell
cd packages/aauth-win-tbs
npm install
npm run build
```

The build step runs `node-gyp` with `tbs.lib`, `ncrypt.lib`,
`crypt32.lib`, and `bcrypt.lib` linked from the Windows SDK.

## Testing the binding

The smoke tests are gated behind `NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED=1`
because they exercise real TPM hardware:

```powershell
cd packages/aauth-win-tbs
$env:NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED=1
npm test
```

The tests cover:

- `isSupported()` returns `{ supported: true }`.
- `generateKey()` returns a JWK that round-trips through
  `createPublicKey`.
- `sign()` produces an ES256 / RS256 signature verifiable under the
  generated public key.
- `attest()` returns an envelope shaped like the WebAuthn-`tpm` format
  and verifiable end-to-end against the FU-3 server-side verifier with
  the test root chain in `packages/aauth-win-tbs/test_roots/`.

When the env var is not set, every test skips with a clear reason so
CI on hardware-less hosts stays green.

## Troubleshooting

### `unsupported: non-windows host`

Reported by `isTbsBackendAvailable()` when the helper is called on a
darwin or linux host. Use the macOS Secure Enclave path
(`packages/aauth-mac-se`) on darwin or the Linux TPM 2.0 path
(`packages/aauth-tpm2`) on linux.

### `unsupported: optional native package @neotoma/aauth-win-tbs not installed`

`npm install` skipped the optional package — typically because the
host architecture has no prebuild and the C++ build tools were not
installed. Install Visual Studio Build Tools + the Windows SDK and
re-run `npm install`. On managed Windows hosts where source builds
are blocked, raise an issue against the Neotoma release pipeline so
a prebuild can be added for that target.

### `unsupported: TBS service not running`

The Trusted Platform Module Base Services (TBS) service has been
stopped or disabled. Run `Start-Service TBS` from an elevated
PowerShell, set the start type back to `Automatic`, and audit any
group policy that disables it. Without TBS running, `NCryptCreateClaim`
cannot reach the TPM.

### `unsupported: Microsoft Platform Crypto Provider unavailable`

The Microsoft Platform Crypto Provider is missing or blocked. Verify
with `certutil -csplist`. If the provider is missing, confirm the
host has a usable TPM 2.0 chip (`Get-Tpm`) and that the platform
provider has not been disabled by group policy. On Windows Server
Core, the provider may need to be installed via
`Install-WindowsFeature CryptoSvc` (or equivalent).

### `unsupported: TPM not ready`

`Get-Tpm` reports `TpmReady: False`. Re-run TPM provisioning with
`Initialize-Tpm -AllowClear` (only on hosts where you can clear the
TPM safely — this invalidates BitLocker recovery keys backed by the
TPM). Operators integrating with managed fleets should pre-provision
the TPM via MDM and use `NEOTOMA_AAUTH_WIN_TBS_KEY_NAME` to pin to a
known-good NCrypt key name.

### `NCryptCreatePersistedKey failed: NTE_PERM`

The current user lacks permission to create persisted keys under the
configured scope. Re-run from an elevated shell, or set
`NEOTOMA_AAUTH_WIN_TBS_SCOPE=user` to bind the key under the calling
user instead of the machine.

### `certutil -csplist` works but the binding still fails

If the platform provider is registered in `certutil` but the binding
reports `unsupported`, the most likely cause is that the binding
cannot find `ncrypt.dll` at runtime. Verify that the `aauth-win-tbs`
N-API native (`build\Release\aauth_win_tbs.node`) loads cleanly from
the same shell that runs the CLI:

```powershell
node -e "require('@neotoma/aauth-win-tbs').isSupported()"
```

Any `LoadLibrary` failure points at a missing dependency; reinstall
the Visual C++ Redistributable for the matching toolchain.

## Operator checklist

- [ ] Windows 10 21H2+ / 11 / Server 2019+ on x64 or arm64.
- [ ] `Get-Tpm` reports `TpmPresent`, `TpmReady`, `TpmEnabled`, and
      `TpmActivated` all `True`.
- [ ] `Get-Service TBS` reports `Running` with `StartType: Automatic`.
- [ ] `certutil -csplist` lists the Microsoft Platform Crypto Provider.
- [ ] `@neotoma/aauth-win-tbs` installed and the binding builds cleanly
      (or the prebuild for the target architecture loads cleanly).
- [ ] `NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED=1 npm test` passes inside
      `packages/aauth-win-tbs/`.
- [ ] `neotoma auth keygen --hardware` writes a `signer.json` with
      `backend: "tbs"`, the configured `tbs_provider`, `tbs_scope`,
      and `tbs_key_name`.
- [ ] `neotoma auth session` reports `hardware_supported: true` plus
      the resolved provider, scope, and key name.

## Related documents

- [`docs/subsystems/aauth_cli_attestation.md`](../subsystems/aauth_cli_attestation.md) — CLI signer and backend dispatch
- [`docs/subsystems/aauth_attestation.md`](../subsystems/aauth_attestation.md) — Server-side verification spec
- [`docs/feature_units/in_progress/FU-2026-Q4-aauth-windows-tbs-cli/FU-2026-Q4-aauth-windows-tbs-cli_spec.md`](../feature_units/in_progress/FU-2026-Q4-aauth-windows-tbs-cli/FU-2026-Q4-aauth-windows-tbs-cli_spec.md) — FU-5 specification
- [`packages/aauth-win-tbs/README.md`](../../packages/aauth-win-tbs/README.md) — Native binding internals
- [`docs/integrations/aauth_tpm2_linux.md`](aauth_tpm2_linux.md) — Linux TPM 2.0 install + troubleshooting (parallel doc)
