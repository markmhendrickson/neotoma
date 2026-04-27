# @neotoma/aauth-mac-se

Optional native bridge between Neotoma's AAuth signer and Apple's Secure
Enclave. Generates SE-backed P-256 keys via `Security.framework` and
produces App Attestation chains used to populate the
`cnf.attestation` claim in Neotoma agent JWTs.

This package only loads on macOS. On Linux, Windows, or unsupported macOS
hosts (e.g. Intel Macs without a T2/Secure Enclave) the loader returns
`{ supported: false, reason }` and the CLI falls back to software-only
JWKs. See `docs/subsystems/aauth_cli_attestation.md` for the full flow.

## Install

Pulled in automatically as an optional dependency of `neotoma` on macOS.
Standalone install:

```bash
npm install @neotoma/aauth-mac-se
```

## API

```ts
import { isSupported, generateKey, attest } from "@neotoma/aauth-mac-se";

const probe = isSupported();
if (!probe.supported) throw new Error(probe.reason);

const { jwk, keyTag } = generateKey({ tag: "neotoma-aauth-default" });
const { attestation_blob, signature_blob } = attest({
  tag: keyTag,
  challenge: "<base64url SHA-256(iss||sub||iat)>",
});
```

The CLI splits `attestation_blob` into per-certificate DER blobs (leaf
first), wraps it in the JSON envelope expected by
`docs/subsystems/aauth_attestation.md`, and embeds it in the agent JWT.

## Build

Source builds require Xcode command line tools. Prebuilt binaries are
published for `darwin-arm64` and `darwin-x64`; install-time fallback
runs `node-gyp` against the source.

```bash
npm install
npm run build           # TypeScript shim
npm run build:native    # native binding
```

## License

MIT.
