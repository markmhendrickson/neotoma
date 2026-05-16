---
title: "AAuth YubiKey PKCS#11 (cross-platform)"
summary: "Operator-facing setup guide for the optional `@neotoma/aauth-yubikey` native package (FU-6). When installed and probing successfully on a host with `libykcs11` (the Yubico PKCS#11 provider, part of YubiKey Manager / yubico-piv-tool) and ..."
---

# AAuth YubiKey PKCS#11 (cross-platform)

## Purpose

Operator-facing setup guide for the optional `@neotoma/aauth-yubikey`
native package (FU-6). When installed and probing successfully on a
host with `libykcs11` (the Yubico PKCS#11 provider, part of YubiKey
Manager / yubico-piv-tool) and a YubiKey 5 series device connected,
`neotoma auth keygen --hardware --backend=yubikey` mints a
YubiKey-resident PIV slot 9c key and embeds a WebAuthn-`packed`-format
`cnf.attestation` envelope in the CLI's `aa-agent+jwt` agent token.
The server-side verifier (FU-2) promotes the resulting writes to the
`hardware` attestation tier — the YubiKey envelope chains through the
bundled Yubico PIV CA roots (`config/aauth/yubico_piv_roots.pem`).

YubiKey is intentionally a fallback in the AAuth backend ladder rather
than the default: a host with a TPM 2.0 chip on Linux or Windows (or a
Secure Enclave on macOS) prefers the platform-native backend because
that path requires no operator action beyond `--hardware`. YubiKey is
selected when:

- The platform-native backend declines (no TPM / no SE / virtualised
  host without TPM passthrough).
- The host is not on the platform-native matrix (e.g. FreeBSD, ARM
  Windows without Microsoft Platform Crypto Provider, Linux without
  `/dev/tpmrm0`).
- The operator explicitly pins via
  `NEOTOMA_AAUTH_HARDWARE_BACKEND=yubikey`.

## Scope

Covers:

- Per-platform install of YubiKey Manager / `yubico-piv-tool` so the
  binding can dlopen `libykcs11`.
- YubiKey 5 series firmware version requirement.
- PIN policy for PIV slot 9c and PIN lockout recovery.
- How to test and validate the binding once installed.
- Common failure modes and remediation hints.

Does NOT cover:

- The CLI signer's backend dispatch (see
  [`docs/subsystems/aauth_cli_attestation.md`](../subsystems/aauth_cli_attestation.md)).
- Server-side WebAuthn-`packed` verification semantics (see
  [`docs/subsystems/aauth_attestation.md`](../subsystems/aauth_attestation.md)).
- The native binding's internal C++ implementation (see
  [`packages/aauth-yubikey/README.md`](../../packages/aauth-yubikey/README.md)).

## Requirements

- A YubiKey 5 series device with firmware 5.0.0 or newer. Older
  firmware (4.x and below) lacks the `YKPIV_INS_ATTEST` (`0xF9`) APDU
  and will report `YUBIKEY_FIRMWARE_TOO_OLD` from the binding's
  capability probe.
- YubiKey Manager (`ykman`) or `yubico-piv-tool` 2.0+ installed. Both
  packages bundle `libykcs11` (the Yubico PKCS#11 provider) which the
  binding `dlopen`s at runtime.
- The PIV PIN set to a known value. The YubiKey ships with the default
  PIV PIN `123456` and PUK `12345678`; change them BEFORE deploying
  to production via `ykman piv access change-pin` and
  `ykman piv access change-puk`.
- Node.js 20+ (matches the rest of the Neotoma CLI).
- A C++17-capable toolchain when source-building the binding
  (Clang 14+, GCC 10+, or MSVC 14.34+). Pre-built binaries cover
  `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, and
  `win32-x64`.

## Per-platform install

### macOS

```bash
brew install yubico-piv-tool
# installs /usr/local/lib/libykcs11.dylib (Intel)
# or       /opt/homebrew/lib/libykcs11.dylib (Apple Silicon)
```

The binding searches both Homebrew prefixes plus
`/Library/Yubico/lib/libykcs11.dylib` (used by the YubiKey Manager
GUI installer). When YubiKey Manager is installed via the GUI rather
than Homebrew, the dylib lives under `/Library/Yubico/`.

### Linux (Debian / Ubuntu)

```bash
sudo apt install yubico-piv-tool libykcs11-2
# installs /usr/lib/x86_64-linux-gnu/libykcs11.so.2
```

The `libykcs11-2` package ships the PKCS#11 provider; `yubico-piv-tool`
ships the matching CLI helpers used by the troubleshooting commands
below.

### Linux (Fedora / RHEL)

```bash
sudo dnf install yubico-piv-tool
# installs /usr/lib64/libykcs11.so
```

### Linux (Arch)

```bash
sudo pacman -S yubico-piv-tool
# installs /usr/lib/libykcs11.so
```

### Windows

Install YubiKey Manager from
<https://www.yubico.com/products/services-software/download/yubikey-manager/>
or `yubico-piv-tool` MSI from
<https://developers.yubico.com/yubico-piv-tool/Releases/>. Both place
`libykcs11.dll` under
`C:\Program Files\Yubico\Yubico PIV Tool\bin\`. The binding searches
both `C:\Program Files\Yubico\` and the legacy
`C:\Program Files (x86)\Yubico\` paths.

Confirm installation via:

```powershell
& 'C:\Program Files\Yubico\Yubico PIV Tool\bin\yubico-piv-tool.exe' --version
```

### Custom path

When `libykcs11` is installed in a non-standard prefix (chroot, custom
build, fleet image), point the binding at it explicitly:

```bash
export NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH=/opt/yubico/lib/libykcs11.so.2
```

This override is honoured by both the capability probe
(`isYubikeyBackendAvailable`) and `neotoma auth keygen --hardware
--backend=yubikey` itself.

## Validation

Before running `neotoma auth keygen --hardware --backend=yubikey`,
confirm the device + provider are healthy:

```bash
ykman info                                              # serial, firmware
ykman piv info                                          # slot status (9a, 9c, 9d, 9e)
yubico-piv-tool -a status                               # PIV applet state
yubico-piv-tool -a verify-pin -P "<pin>" -a list-objects # PIN works
```

The binding's capability probe is reachable through the CLI:

```bash
neotoma auth diagnose --backend=yubikey
# expected:
#   yubikey: supported (firmware 5.4.3, serial 12345678, libykcs11=/usr/lib/...)
```

If the probe reports unsupported, the message includes a structured
reason — see [Failure modes](#failure-modes) below.

## PIN policy

PIV slot 9c uses the `PIN ONCE` policy: a single successful `C_Login`
unlocks the slot for the lifetime of the PKCS#11 session, not the
YubiKey lifetime. Implications:

- Each `neotoma auth keygen --hardware --backend=yubikey` invocation
  triggers exactly one PIN prompt (the keygen, attestation, and JWS
  signing all reuse the same session).
- Subsequent CLI invocations (e.g. `neotoma auth attest --refresh`,
  any signed write) trigger a new PIN prompt UNLESS
  `NEOTOMA_AAUTH_YUBIKEY_PIN` is set in the environment.
- The binding does NOT cache the PIN across CLI invocations. The PIN
  is NEVER written to `signer.json`, NEVER logged, and NEVER copied
  into shell history.
- Three failed PIN attempts lock the YubiKey. Recovery requires
  `ykman piv access change-pin --puk` (which uses the PUK to set a
  new PIN) or `ykman piv reset` (which destroys ALL PIV data,
  including the slot 9c key — operators must re-run `keygen` and
  re-attest from scratch).

For non-interactive callers (CI, daemons, fleet provisioning):

```bash
export NEOTOMA_AAUTH_YUBIKEY_PIN="$(< /run/secrets/yubikey-pin)"
neotoma auth keygen --hardware --backend=yubikey
```

The PIN should be sourced from a secret manager (HashiCorp Vault,
1Password CLI, AWS Secrets Manager, systemd `LoadCredential`) — never
from a static file or environment file checked into git.

## Failure modes

| Probe reason                              | Cause                                                                               | Fix                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `libykcs11 not loadable`                  | Yubico PKCS#11 provider not installed, or installed in a non-standard prefix.       | Install YubiKey Manager / `yubico-piv-tool` per [Per-platform install](#per-platform-install). Override path via `NEOTOMA_AAUTH_YUBIKEY_PKCS11_PATH` if non-standard. |
| `no YubiKey detected`                     | No YubiKey connected, or device is asleep / in a hub that lost power.               | Reconnect the YubiKey directly to a primary USB port. Confirm via `ykman list`.                                    |
| `YubiKey firmware too old`                | Firmware < 5.0.0; no `YKPIV_INS_ATTEST` support.                                    | YubiKey 4.x and below do NOT support PIV attestation. Provision a YubiKey 5 series device.                          |
| `PIN locked`                              | Three failed PIN entries since last successful login.                               | Recover via `ykman piv access change-pin --puk`, or `ykman piv reset` (destructive). Re-run keygen after recovery.  |
| `PIN invalid`                             | Wrong PIN passed via `NEOTOMA_AAUTH_YUBIKEY_PIN` or interactive prompt.             | Re-enter the correct PIN. Counter is decremented on each failure; recover via PUK if locked.                       |
| `serial mismatch`                         | `NEOTOMA_AAUTH_YUBIKEY_SERIAL` is set but no connected YubiKey matches.             | List connected devices via `ykman list` and update the env var, or unset it to use the first matched device.       |
| `slot 9c not provisioned`                 | Cert and key in slot 9c were destroyed (e.g. `ykman piv reset`).                    | Re-run `neotoma auth keygen --hardware --backend=yubikey` to provision a fresh key + per-slot attestation cert.    |
| `attestation cert chain validation failed` | The per-slot cert does NOT chain to a Yubico PIV CA root the server trusts.        | Confirm `config/aauth/yubico_piv_roots.pem` is up to date on the server side. See FU-2 trust anchor docs.          |
| `optional native package … not installed` | The `@neotoma/aauth-yubikey` package was excluded by `--no-optional` install.       | Re-run `npm install` without `--no-optional`, or install the package explicitly: `npm install @neotoma/aauth-yubikey`. |

## Hardware-bound smoke tests

The `packages/aauth-yubikey/tests/smoke.test.js` suite runs end-to-end
against a live YubiKey but is gated behind `NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED=1`
to avoid accidental PIN lockout on developer YubiKeys. Run them with:

```bash
NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED=1 \
NEOTOMA_AAUTH_YUBIKEY_PIN="<test-pin>" \
npm test --workspace packages/aauth-yubikey
```

The smoke suite refuses to prompt interactively, so the PIN MUST be
provided via `NEOTOMA_AAUTH_YUBIKEY_PIN`. CI on hosts without a
YubiKey skips cleanly — the suite exits with `skip:` annotations
rather than failing.

## Related documents

- [`docs/subsystems/aauth_cli_attestation.md`](../subsystems/aauth_cli_attestation.md) — CLI signer dispatch and backend ladder
- [`docs/subsystems/aauth_attestation.md`](../subsystems/aauth_attestation.md) — Server-side WebAuthn-`packed` verification semantics
- [`packages/aauth-yubikey/README.md`](../../packages/aauth-yubikey/README.md) — Native binding internals
- [`docs/integrations/aauth_tpm2_linux.md`](aauth_tpm2_linux.md) — Linux TPM 2.0 fallback
- [`docs/integrations/aauth_tbs_windows.md`](aauth_tbs_windows.md) — Windows TBS fallback
- [Yubico PKCS#11 documentation](https://developers.yubico.com/yubico-piv-tool/YKCS11/) — Upstream `libykcs11` reference
- [YubiKey 5 PIV attestation](https://developers.yubico.com/PIV/Introduction/PIV_attestation.html) — `YKPIV_INS_ATTEST` semantics
