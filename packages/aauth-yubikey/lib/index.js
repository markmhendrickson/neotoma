"use strict";
/**
 * Public surface for `@neotoma/aauth-yubikey`.
 *
 * The native binding is loaded via `node-gyp-build`, which resolves a
 * prebuilt binary (when available) or compiles from source. On hosts
 * without `libykcs11` installed, or when no YubiKey 5 series device is
 * connected, the binding short-circuits with `{ supported: false,
 * reason }` rather than throwing so the CLI can branch to the next
 * backend in the preference ladder.
 *
 * The shape of this surface intentionally mirrors
 * `@neotoma/aauth-mac-se`, `@neotoma/aauth-tpm2`, and
 * `@neotoma/aauth-win-tbs` so the CLI signer can switch backends with
 * a single discriminator. Unlike those packages, this surface is
 * portable across darwin, linux, and win32.
 *
 * Wire format note: the produced attestation envelope uses
 * `format: "packed"` (WebAuthn-packed) so the FU-2 server-side
 * verifier consumes YubiKey envelopes through the same code path as
 * other WebAuthn-packed producers.
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
function loadBinding() {
    if (cached)
        return cached;
    if (loadError)
        return null;
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
function isSupported(opts = {}) {
    const binding = loadBinding();
    if (!binding) {
        return {
            supported: false,
            reason: loadError?.message ?? "native binding unavailable",
        };
    }
    try {
        return binding.isSupported({ pkcs11Path: opts.pkcs11Path });
    }
    catch (err) {
        return {
            supported: false,
            reason: err instanceof Error ? err.message : String(err),
        };
    }
}
function generateKey(opts = {}) {
    const binding = loadBinding();
    if (!binding) {
        throw new Error(`aauth-yubikey: native binding unavailable (${loadError?.message ?? "unknown"})`);
    }
    const slot = opts.slot ?? "9c";
    if (slot !== "9c") {
        const err = new Error(`aauth-yubikey: unsupported PIV slot ${slot} (only 9c is supported)`);
        err.code = "YUBIKEY_SLOT_UNSUPPORTED";
        throw err;
    }
    return binding.generateKey({
        pkcs11Path: opts.pkcs11Path,
        slot,
        alg: opts.alg ?? "ES256",
        pin: opts.pin,
        serial: opts.serial,
    });
}
function sign(opts) {
    const binding = loadBinding();
    if (!binding) {
        throw new Error(`aauth-yubikey: native binding unavailable (${loadError?.message ?? "unknown"})`);
    }
    if (opts.slot !== "9c") {
        const err = new Error(`aauth-yubikey: unsupported PIV slot ${opts.slot} (only 9c is supported)`);
        err.code = "YUBIKEY_SLOT_UNSUPPORTED";
        throw err;
    }
    return binding.sign(opts);
}
function attest(opts) {
    const binding = loadBinding();
    if (!binding) {
        throw new Error(`aauth-yubikey: native binding unavailable (${loadError?.message ?? "unknown"})`);
    }
    if (opts.slot !== "9c") {
        const err = new Error(`aauth-yubikey: unsupported PIV slot ${opts.slot} (only 9c is supported)`);
        err.code = "YUBIKEY_SLOT_UNSUPPORTED";
        throw err;
    }
    return binding.attest(opts);
}
//# sourceMappingURL=index.js.map
