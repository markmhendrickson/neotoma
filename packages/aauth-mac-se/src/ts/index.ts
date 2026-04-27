/**
 * Public surface for `@neotoma/aauth-mac-se`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On non-macOS
 * hosts the binary will not exist; we surface this as
 * `{ supported: false, reason }` rather than throwing so the CLI can
 * branch to its software-key fallback.
 */

import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";

interface NativeBinding {
  isSupported(): { supported: boolean; reason?: string };
  generateKey(opts: { tag: string }): {
    jwk: { kty: "EC"; crv: "P-256"; x: string; y: string };
    keyTag: string;
  };
  sign(opts: { tag: string; message: Buffer }): Buffer;
  attest(opts: { tag: string; challenge: string }): {
    format: "apple-secure-enclave";
    attestation_blob: string;
    signature_blob: string;
  };
}

let cached: NativeBinding | null = null;
let loadError: Error | null = null;

/** Load the native binding lazily; cache the outcome so repeated calls are cheap. */
function loadBinding(): NativeBinding | null {
  if (cached) return cached;
  if (loadError) return null;
  if (process.platform !== "darwin") {
    loadError = new Error("aauth-mac-se: only supported on darwin");
    return null;
  }
  try {
    const req = createRequire(__filename);
    const nodeGypBuild = req("node-gyp-build") as (
      packageDir: string,
    ) => NativeBinding;
    const here = resolvePath(__dirname, "..");
    cached = nodeGypBuild(here);
    return cached;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    return null;
  }
}

/**
 * Capability probe. Returns `{ supported: false, reason }` rather than
 * throwing so the CLI can render a clean fallback message.
 */
export function isSupported(): { supported: boolean; reason?: string } {
  if (process.platform !== "darwin") {
    return { supported: false, reason: "non-macOS host" };
  }
  const binding = loadBinding();
  if (!binding) {
    return {
      supported: false,
      reason: loadError?.message ?? "native binding unavailable",
    };
  }
  try {
    return binding.isSupported();
  } catch (err) {
    return {
      supported: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate a new SE-backed P-256 keypair. The private key remains in the
 * Secure Enclave; only the public JWK is returned. `tag` is the
 * application-tag identifier under which the key is stored in the
 * keychain — pass the same value to {@link attest} to sign with this key.
 */
export function generateKey(opts: { tag: string }): {
  jwk: { kty: "EC"; crv: "P-256"; x: string; y: string };
  keyTag: string;
} {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-mac-se: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.generateKey(opts);
}

/**
 * Sign `message` (a precomputed SHA-256 digest, 32 bytes) with the
 * SE-backed P-256 key identified by `tag`. Returns a DER-encoded ECDSA
 * signature suitable for either an HTTP signature payload or a JWS
 * (after conversion to JOSE r||s by the caller).
 */
export function sign(opts: { tag: string; message: Buffer }): Buffer {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-mac-se: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.sign(opts);
}

/**
 * Run Apple App Attestation against the SE-backed key identified by
 * `tag`, binding the attestation to `challenge` (base64url
 * `SHA-256(iss || sub || iat)` per the AAuth spec).
 *
 * Returns the raw attestation blob and a separate signature blob. The
 * caller is responsible for splitting the attestation into individual
 * DER certificates and producing the final `cnf.attestation` envelope —
 * see `src/cli/aauth_signer.ts` for the wrapping logic.
 */
export function attest(opts: { tag: string; challenge: string }): {
  format: "apple-secure-enclave";
  attestation_blob: string;
  signature_blob: string;
} {
  const binding = loadBinding();
  if (!binding) {
    throw new Error(
      `aauth-mac-se: native binding unavailable (${
        loadError?.message ?? "unknown"
      })`,
    );
  }
  return binding.attest(opts);
}
