# AAuth TPM 2.0 on Linux

## Purpose

Operator-facing setup guide for the optional `@neotoma/aauth-tpm2`
native package (FU-4). When installed and probing successfully on a
Linux host, `neotoma auth keygen --hardware` mints a TPM-resident AIK
and embeds a WebAuthn-`tpm`-format `cnf.attestation` envelope in the
CLI's `aa-agent+jwt` agent token. The server-side verifier (FU-3)
promotes the resulting writes to the `hardware` attestation tier.

## Scope

Covers:

- Per-distro install of `libtss2-dev` + the resource manager.
- Required `/dev/tpmrm0` permissions and `tss` group membership.
- How to test and validate the binding once installed.
- Common failure modes and remediation hints.

Does NOT cover:

- The CLI signer's backend dispatch (see
  [`docs/subsystems/aauth_cli_attestation.md`](../subsystems/aauth_cli_attestation.md)).
- Server-side TPM 2.0 verification semantics (see
  [`docs/subsystems/aauth_attestation.md`](../subsystems/aauth_attestation.md)).
- The native binding's internal C++ implementation (see
  [`packages/aauth-tpm2/README.md`](../../packages/aauth-tpm2/README.md)).

## Requirements

- Linux x64 or arm64.
- A discrete or firmware TPM 2.0 chip exposed at `/dev/tpmrm0`
  (resource-managed device node — `/dev/tpm0` is the raw device and is
  intentionally NOT used by the binding).
- `libtss2-esys`, `libtss2-mu`, `libtss2-rc`, `libtss2-tctildr` shared
  libraries available at runtime, plus matching `-dev` headers when
  building from source.
- Node.js ≥ 20 (to match the rest of the Neotoma CLI).

## Per-distro install

### Debian 12 / Ubuntu 22.04 / Ubuntu 24.04

```bash
sudo apt-get update
sudo apt-get install -y libtss2-dev tpm2-tools
sudo systemctl enable --now tpm2-abrmd  # optional; only when not using kernel RM
sudo usermod -aG tss "$USER"
# Log out and back in so `tss` group membership takes effect.
```

### Fedora 39+ / RHEL 9+

```bash
sudo dnf install -y tpm2-tss-devel tpm2-tools
sudo usermod -aG tss "$USER"
```

### Arch / Manjaro

```bash
sudo pacman -S tpm2-tss tpm2-tools
sudo usermod -aG tss "$USER"
```

### Alpine

```bash
sudo apk add tpm2-tss-dev tpm2-tools
addgroup "$USER" tss
```

After installing, verify the resource manager device is reachable:

```bash
ls -l /dev/tpmrm0
# crw-rw---- 1 tss tss 254, 0 ... /dev/tpmrm0
tpm2_getcap properties-fixed | head -n 20
```

If `tpm2_getcap` succeeds for your shell, the native binding's
`isSupported()` probe will succeed for the same shell.

## Installing `@neotoma/aauth-tpm2`

The package is shipped as an `optionalDependency` of the Neotoma CLI:
non-Linux installs skip it silently, and Linux installs without
`libtss2-dev` see a single non-fatal warning during `npm install`.
Operators who want to opt in explicitly can run:

```bash
cd packages/aauth-tpm2
npm install
npm run build
```

The build step runs `node-gyp` against `libtss2-esys`,
`libtss2-mu`, `libtss2-rc`, and `libtss2-tctildr`. Pre-built binaries
are produced via `prebuildify` for the standard distro matrix; source
builds are the fallback when no prebuilt matches the host.

## Testing the binding

The smoke tests are gated behind `NEOTOMA_AAUTH_TPM2_TEST_ENABLED=1`
because they exercise real TPM hardware:

```bash
cd packages/aauth-tpm2
NEOTOMA_AAUTH_TPM2_TEST_ENABLED=1 npm test
```

The tests cover:

- `isSupported()` returns `{ supported: true }`.
- `generateKey()` returns a JWK that round-trips through
  `createPublicKey`.
- `sign()` produces an ES256 / RS256 signature verifiable under the
  generated public key.
- `attest()` returns an envelope verifiable end-to-end against the
  FU-3 server-side verifier with the test root chain in
  `packages/aauth-tpm2/test_roots/`.

When the env var is not set, every test skips with a clear reason so
CI on hardware-less hosts stays green.

## Troubleshooting

### `unsupported: non-linux host`

Reported by `isTpm2BackendAvailable()` when the helper is called on a
darwin or win32 host. Use the macOS Secure Enclave path
(`packages/aauth-mac-se`) on darwin or the upcoming TBS path
(FU-5, `packages/aauth-win-tbs`) on win32.

### `unsupported: optional native package @neotoma/aauth-tpm2 not installed`

`npm install` skipped the optional package — typically because
`libtss2-dev` was not installed at the time. Install the headers and
re-run `npm install`. On systems with sandboxed installs (snap,
restricted CI runners) a prebuild may be required; see the
`packages/aauth-tpm2/README.md` build matrix.

### `unsupported: /dev/tpmrm0 not accessible`

The current shell is not a member of the `tss` group, or the device
node has been remapped. Verify with `ls -l /dev/tpmrm0`. If the group
is correct, log out and back in to refresh group membership; if it is
not, audit the TPM udev rules shipped by your distro.

### `unsupported: ESYS_TR_RH_OWNER unavailable`

The owner hierarchy is locked or in lockout. Re-run with
`NEOTOMA_AAUTH_TPM2_HIERARCHY=endorsement` to bind the AIK under the
endorsement hierarchy instead. Operators integrating with managed
fleets can pre-provision a persistent handle and override
`NEOTOMA_AAUTH_TPM2_HANDLE`.

### `tpm2_getcap` works but the binding still fails

If `tpm2_getcap` succeeds in the shell but the binding reports
`unsupported`, the most likely cause is that the binding cannot find
`libtss2-esys.so` at runtime. Run:

```bash
ldd "$(node -e 'console.log(require.resolve("@neotoma/aauth-tpm2/build/Release/aauth_tpm2.node"))')"
```

Any `not found` row points at a missing shared library; install the
matching `-dev` package and rebuild.

## Operator checklist

- [ ] `libtss2-dev` installed.
- [ ] `/dev/tpmrm0` exists and is accessible to the calling user.
- [ ] `tpm2_getcap` succeeds without sudo.
- [ ] `@neotoma/aauth-tpm2` installed and the binding builds cleanly.
- [ ] `NEOTOMA_AAUTH_TPM2_TEST_ENABLED=1 npm test` passes inside
      `packages/aauth-tpm2/`.
- [ ] `neotoma auth keygen --hardware` writes a `signer.json` with
      `backend: "tpm2"` and the configured `tpm2_handle`.
- [ ] `neotoma auth session` reports
      `hardware_supported: true` plus the resolved hierarchy and
      handle.

## Related documents

- [`docs/subsystems/aauth_cli_attestation.md`](../subsystems/aauth_cli_attestation.md) — CLI signer and backend dispatch
- [`docs/subsystems/aauth_attestation.md`](../subsystems/aauth_attestation.md) — Server-side verification spec
- [`docs/feature_units/in_progress/FU-2026-Q4-aauth-linux-tpm2-cli/FU-2026-Q4-aauth-linux-tpm2-cli_spec.md`](../feature_units/in_progress/FU-2026-Q4-aauth-linux-tpm2-cli/FU-2026-Q4-aauth-linux-tpm2-cli_spec.md) — FU-4 specification
- [`packages/aauth-tpm2/README.md`](../../packages/aauth-tpm2/README.md) — Native binding internals
