# @neotoma/aauth-tpm2

Optional native bridge between Neotoma's AAuth signer and a Linux host's
TPM 2.0 chip via the [tpm2-tss](https://github.com/tpm2-software/tpm2-tss)
user-space stack (`libtss2-esys`, `libtss2-mu`, `libtss2-rc`,
`libtss2-tctildr`).

Generates TPM-resident keys (RSA-2048 default; ECC P-256 on opt-in) and
produces WebAuthn-`tpm`-format attestation envelopes that populate the
`cnf.attestation` claim in Neotoma agent JWTs. The server-side verifier
ships in v0.9.0 (FU-2026-Q3-aauth-tpm2-verifier).

This package only loads on Linux. On macOS, Windows, or Linux hosts
without a TPM 2.0 chip / accessible `/dev/tpmrm0` the loader returns
`{ supported: false, reason }` and the CLI falls back to software-only
JWKs. See `docs/subsystems/aauth_cli_attestation.md` for the full flow.

## Install

Pulled in automatically as an optional dependency of `neotoma` on Linux.
Standalone install:

```bash
npm install @neotoma/aauth-tpm2
```

Build prerequisites (one-time, per host):

| Distro                | Command                                                |
| --------------------- | ------------------------------------------------------ |
| Ubuntu 22.04 / 24.04  | `sudo apt-get install -y libtss2-dev`                  |
| Debian 12             | `sudo apt-get install -y libtss2-dev`                  |
| Fedora 40             | `sudo dnf install -y tpm2-tss-devel`                   |
| Arch                  | `sudo pacman -S --needed tpm2-tss`                     |
| Alpine                | `sudo apk add tpm2-tss-dev`                            |

The user running the CLI MUST have read/write access to `/dev/tpmrm0`
(the resource-managed TPM 2.0 device). Most distros ship a `tss` group;
add yourself with `sudo usermod -aG tss $USER` and re-login.

## API

```ts
import { isSupported, generateKey, sign, attest } from "@neotoma/aauth-tpm2";

const probe = isSupported();
if (!probe.supported) throw new Error(probe.reason);

const { jwk, handle, hierarchy, alg } = generateKey({
  hierarchy: "owner",
  alg: "RS256",
});

const env = attest({
  handle,
  challenge: "<base64url SHA-256(iss || sub || iat)>",
  jkt: "<RFC 7638 thumbprint of jwk>",
});
// env => { format: "tpm2", ver: "2.0", alg, x5c, sig, certInfo, pubArea }
```

The CLI feeds `env` straight into `cnf.attestation` per
`docs/subsystems/aauth_attestation.md`. The server-side
`verifyTpm2Attestation` (FU-3) parses `pubArea`, validates the AIK
chain, verifies `sig` over `certInfo`, and confirms
`certInfo.extraData == SHA-256(challenge || jkt)`.

## Build

Source builds require:

- `libtss2-dev` (or your distro equivalent — see install table above)
- a C++17 toolchain (`gcc` ≥ 11, `clang` ≥ 13)
- Node.js 20+ headers

Prebuilt binaries are published for `linux-x64` and `linux-arm64`
against the ABIs shipped by Ubuntu LTS, Debian stable, and Fedora
stable. Install-time fallback runs `node-gyp` against the source.

```bash
npm install
npm run build           # TypeScript shim
npm run build:native    # native binding (requires libtss2-dev)
```

## Testing

The smoke test set is gated behind an explicit opt-in:

```bash
NEOTOMA_AAUTH_TPM2_TEST_ENABLED=1 npm test
```

Without the env var (and on every non-Linux host) the suite skips
cleanly. The CI matrix runs the smoke tests on a TPM-equipped Ubuntu
24.04 LTS runner; everywhere else they remain skipped.

## License

MIT.
