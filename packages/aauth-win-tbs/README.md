# @neotoma/aauth-win-tbs

Optional native bridge between Neotoma's AAuth signer and a Windows
host's TPM 2.0 chip via the
[Windows TBS API](https://learn.microsoft.com/en-us/windows/win32/tbs/tbs-portal)
plus
[CNG (Cryptography API: Next Generation)](https://learn.microsoft.com/en-us/windows/win32/seccng/cng-portal),
specifically NCrypt against the Microsoft Platform Crypto Provider
(`MS_PLATFORM_KEY_STORAGE_PROVIDER`).

Generates TPM-resident keys via `NCryptCreatePersistedKey` (RSA-2048
default; ECC P-256 on opt-in) and produces WebAuthn-`tpm`-format
attestation envelopes via `NCryptCreateClaim` that populate the
`cnf.attestation` claim in Neotoma agent JWTs. The server-side
verifier ships in v0.9.0 (FU-2026-Q3-aauth-tpm2-verifier); the wire
format is identical to the Linux TPM2 path so the server consumes
both producers without distinguishing them.

This package only loads on Windows. On macOS, Linux, or Windows hosts
without TBS / the Microsoft Platform Crypto Provider the loader
returns `{ supported: false, reason }` and the CLI falls back to
software-only JWKs. See `docs/subsystems/aauth_cli_attestation.md` for
the full flow.

## Install

Pulled in automatically as an optional dependency of `neotoma` on
Windows. Standalone install:

```powershell
npm install @neotoma/aauth-win-tbs
```

Build prerequisites (one-time, per host):

| Component                     | Version / Notes                                          |
| ----------------------------- | -------------------------------------------------------- |
| Windows                       | Windows 10 / 11 / Server 2019+ with TBS service running  |
| Windows SDK                   | 10.0.19041.0 or newer (`NCryptCreateClaim` available)    |
| Visual Studio Build Tools     | v143 toolset (`MSVC 14.34+`) with C++ workload           |
| Node.js                       | 20.x or newer                                            |

The user running the CLI MUST have access to the Microsoft Platform
Crypto Provider. On managed Windows endpoints this is provisioned by
default; on Server Core or freshly imaged hosts you may need to enable
the TBS service:

```powershell
Get-Service TbsService
Start-Service TbsService
Set-Service  TbsService -StartupType Automatic
```

## API

```ts
import {
  isSupported,
  generateKey,
  sign,
  attest,
} from "@neotoma/aauth-win-tbs";

const probe = isSupported();
if (!probe.supported) throw new Error(probe.reason);

const { jwk, keyName, provider, scope, alg } = generateKey({
  scope: "user",
  alg: "RS256",
});

const env = attest({
  keyName,
  provider,
  challenge: "<base64url SHA-256(iss || sub || iat)>",
  jkt: "<RFC 7638 thumbprint of jwk>",
});
// env => { format: "tpm2", ver: "2.0", alg, x5c, sig, certInfo, pubArea }
```

The CLI feeds `env` straight into `cnf.attestation` per
`docs/subsystems/aauth_attestation.md`. The server-side
`verifyTpm2Attestation` (FU-3) parses `pubArea`, validates the AIK
chain, verifies `sig` over `certInfo`, and confirms
`certInfo.extraData == SHA-256(challenge || jkt)`. The wire format is
identical to the Linux TPM2 path so the server treats both producers
uniformly.

## Build

Source builds require:

- Windows SDK 10.0.19041.0 or newer
- Visual Studio Build Tools v143 (or Visual Studio 2022) with the
  "Desktop development with C++" workload installed
- Node.js 20+ headers

Prebuilt binaries are published for `win32-x64` and `win32-arm64`
against the Windows SDK ABI shipped with Windows 10 (10.0.19041.0).
Install-time fallback runs `node-gyp` against the source.

```powershell
npm install
npm run build           # TypeScript shim
npm run build:native    # native binding (requires Windows SDK)
```

## Testing

The smoke test set is gated behind an explicit opt-in:

```powershell
$env:NEOTOMA_AAUTH_WIN_TBS_TEST_ENABLED = "1"
npm test
```

Without the env var (and on every non-Windows host) the suite skips
cleanly. The CI matrix runs the smoke tests on a TPM-equipped
Windows Server 2022 runner with the TBS service enabled; everywhere
else they remain skipped.

## License

MIT.
