# @neotoma/aauth-yubikey

Optional native bridge between Neotoma's AAuth signer and a YubiKey 5
series device via the
[Yubico PKCS#11 provider (`libykcs11`)](https://developers.yubico.com/yubico-piv-tool/YKCS11/)
plus the YubiKey-specific PIV attestation APDU (`YKPIV_INS_ATTEST`,
`0xF9`).

Generates PIV slot 9c-resident keys via `C_GenerateKeyPair` (ECDSA
P-256 / `ES256`) and produces WebAuthn-`packed`-format attestation
envelopes via the per-slot YubiKey attestation cert that populate the
`cnf.attestation` claim in Neotoma agent JWTs. The server-side
verifier already ships in v0.9.0 (FU-2026-Q3-aauth-webauthn-packed-verifier);
no new server-side format work is required — YubiKey PIV slot
attestations are envelope-compatible with WebAuthn `packed` out of the
box.

This package is the only AAuth attestation source that is portable
across darwin, linux, and win32. It is intentionally a fallback in the
backend ladder rather than the default: a host with a TPM 2.0 chip on
linux or win32 (or a Secure Enclave on darwin) will prefer the
platform-native backend because that path requires no operator action
beyond `--hardware`. YubiKey is preferred when the platform-native
backend declines (no TPM / no SE / virtualised host without
passthrough), or when operators explicitly pin via
`NEOTOMA_AAUTH_HARDWARE_BACKEND=yubikey`.

If neither `libykcs11` nor a YubiKey is available the loader returns
`{ supported: false, reason }` and the CLI falls back to the next
backend in the ladder. See `docs/subsystems/aauth_cli_attestation.md`
for the full flow.

## Install

Pulled in automatically as an optional dependency of `neotoma` on
darwin, linux, and win32. Standalone install:

```bash
npm install @neotoma/aauth-yubikey
```

YubiKey Manager / `yubico-piv-tool` provides `libykcs11`; install per
platform:

| Platform | Install command                                           |
| -------- | --------------------------------------------------------- |
| macOS    | `brew install yubico-piv-tool` (provides `libykcs11.dylib`) |
| Linux    | `sudo apt install yubico-piv-tool libykcs11-2`            |
|          | or `sudo dnf install yubico-piv-tool`                     |
| Windows  | YubiKey Manager (Yubico's GUI) or yubico-piv-tool MSI     |

Build prerequisites (one-time, per host):

| Component                 | Version / Notes                                  |
| ------------------------- | ------------------------------------------------ |
| Node.js                   | 20.x or newer                                    |
| C++ toolchain             | Clang 14+ (macOS), GCC 10+ (Linux), MSVC 14.34+  |
| `libykcs11`               | YubiKey Manager / yubico-piv-tool 2.0+           |

The binding `dlopen`s `libykcs11` at runtime, so building this package
does NOT require `libykcs11` to be present at build time. Operators
without the Yubico PKCS#11 provider installed will see a clean
`{ supported: false, reason: "libykcs11 not loadable" }` probe.

## API

```ts
import {
  isSupported,
  generateKey,
  sign,
  attest,
} from "@neotoma/aauth-yubikey";

const probe = isSupported();
if (!probe.supported) throw new Error(probe.reason);

const key = generateKey({
  slot: "9c",
  alg: "ES256",
  pin: process.env.NEOTOMA_AAUTH_YUBIKEY_PIN,
});

const env = attest({
  slot: "9c",
  challenge: "<base64url SHA-256(iss || sub || iat)>",
  jkt: "<RFC 7638 thumbprint of jwk>",
});
// env => {
//   format: "packed",
//   alg: -7,
//   sig: "<base64url DER ECDSA signature>",
//   x5c: ["<slot 9c attestation cert>", "<F9 intermediate>"],
//   aaguid: "<yubikey 5 series AAGUID>",
// }
```

The CLI feeds `env` straight into `cnf.attestation` per
`docs/subsystems/aauth_attestation.md`. The server-side
`verifyWebauthnPackedAttestation` (FU-2) parses the `x5c` chain,
validates it against the bundled Yubico PIV CA roots
(`config/aauth/yubico_piv_roots.pem`), confirms the AAGUID is in the
configured trust list, and verifies `sig` over
`SHA-256(challenge || jkt)` using the leaf public key.

## PIN policy

Slot 9c is gated by PIV's `PIN ONCE` policy: a single successful
`C_Login` unlocks the slot for the lifetime of the PKCS#11 session,
not the YubiKey lifetime. This means each `neotoma auth keygen
--hardware` invocation requires exactly one PIN entry; subsequent
operations within the same CLI process reuse the unlocked session.

The binding does NOT cache the PIN across CLI invocations — every new
`neotoma auth ...` invocation triggers a new PIN prompt unless
`NEOTOMA_AAUTH_YUBIKEY_PIN` is set. Three failed PIN attempts lock the
YubiKey; recovery requires `ykman piv access change-pin --puk`.

## Build

Source builds require:

- Node.js 20+ headers
- C++17-capable toolchain (Clang 14+ / GCC 10+ / MSVC 14.34+)

Prebuilt binaries are published for `darwin-x64`, `darwin-arm64`,
`linux-x64`, `linux-arm64`, and `win32-x64`. Install-time fallback
runs `node-gyp` against the source.

```bash
npm install
npm run build           # TypeScript shim
npm run build:native    # native binding
```

## Testing

The smoke test set is gated behind an explicit opt-in to avoid
accidental PIN lockout on developer YubiKeys:

```bash
NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED=1 \
NEOTOMA_AAUTH_YUBIKEY_PIN="<test-pin>" \
npm test
```

Without the env var the suite skips cleanly. The CI matrix runs the
smoke tests on a YubiKey-equipped Linux runner with a known test PIN;
everywhere else they remain skipped.

## License

MIT.
