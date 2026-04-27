"use strict";
/**
 * Public surface for `@neotoma/aauth-tpm2`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On non-Linux
 * hosts (and on Linux hosts that lack `libtss2` or `/dev/tpmrm0`) the
 * binary will not load; we surface this as `{ supported: false, reason }`
 * rather than throwing so the CLI can branch to its software-key
 * fallback.
 *
 * The shape of this surface intentionally mirrors
 * `@neotoma/aauth-mac-se` so the CLI signer can switch backends with a
 * single discriminator.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupported = isSupported;
exports.generateKey = generateKey;
exports.sign = sign;
exports.attest = attest;
const node_module_1 = require("node:module");
const node_path_1 = require("node:path");
let cached = null;
let loadError = null;
/** Load the native binding lazily; cache the outcome so repeated calls are cheap. */
function loadBinding() {
    if (cached)
        return cached;
    if (loadError)
        return null;
    if (process.platform !== "linux") {
        loadError = new Error("aauth-tpm2: only supported on linux");
        return null;
    }
    try {
        const req = (0, node_module_1.createRequire)(__filename);
        const nodeGypBuild = req("node-gyp-build");
        const here = (0, node_path_1.resolve)(__dirname, "..");
        cached = nodeGypBuild(here);
        return cached;
    }
    catch (err) {
        loadError = err instanceof Error ? err : new Error(String(err));
        return null;
    }
}
/**
 * Capability probe. Returns `{ supported: false, reason }` rather than
 * throwing so the CLI can render a clean fallback message.
 */
function isSupported() {
    if (process.platform !== "linux") {
        return { supported: false, reason: "non-linux host" };
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
    }
    catch (err) {
        return {
            supported: false,
            reason: err instanceof Error ? err.message : String(err),
        };
    }
}
/**
 * Generate a new TPM-resident key under a persistent handle and return
 * the public JWK plus the handle. The private scalar never leaves the
 * TPM.
 */
function generateKey(opts = {}) {
    const binding = loadBinding();
    if (!binding) {
        throw new Error(`aauth-tpm2: native binding unavailable (${loadError?.message ?? "unknown"})`);
    }
    return binding.generateKey({
        hierarchy: opts.hierarchy ?? "owner",
        alg: opts.alg ?? "RS256",
    });
}
/**
 * Sign `digest` (a precomputed message digest) with the TPM-resident
 * key identified by `handle`.
 */
function sign(opts) {
    const binding = loadBinding();
    if (!binding) {
        throw new Error(`aauth-tpm2: native binding unavailable (${loadError?.message ?? "unknown"})`);
    }
    return binding.sign(opts);
}
/**
 * Run TPM 2.0 attestation against the TPM-resident key identified by
 * `handle`. Issues `TPM2_Quote` (or `TPM2_Certify`) with
 * `qualifyingData = SHA-256(challenge || jkt)` and returns the raw
 * structures ready to feed into the AAuth `cnf.attestation` envelope.
 */
function attest(opts) {
    const binding = loadBinding();
    if (!binding) {
        throw new Error(`aauth-tpm2: native binding unavailable (${loadError?.message ?? "unknown"})`);
    }
    return binding.attest(opts);
}
//# sourceMappingURL=index.js.map
