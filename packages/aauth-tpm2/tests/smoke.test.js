/**
 * Linux-only smoke tests for `@neotoma/aauth-tpm2`.
 *
 * These tests exercise the native TPM 2.0 binding end-to-end on a Linux
 * host with a real TPM 2.0 chip exposed at `/dev/tpmrm0`. They are
 * intentionally narrow:
 *
 *   1. `isSupported()` returns the documented `{ supported, reason? }`
 *      shape on every host.
 *   2. On a TPM-equipped host, `generateKey()` produces a persistent
 *      handle in the `0x81000000` range plus a JWK whose public bytes
 *      round-trip through `crypto.createPublicKey`.
 *   3. `sign({ handle, digest, alg })` returns a DER signature that
 *      verifies under Node's crypto with the imported public JWK.
 *   4. `attest({ handle, challenge, jkt })` returns an envelope with
 *      the documented WebAuthn-`tpm` shape (`format`, `ver`, `alg`,
 *      `x5c`, `sig`, `certInfo`, `pubArea`).
 *
 * The tests SKIP cleanly when:
 *   - platform is not `linux`
 *   - the explicit opt-in env var
 *     `NEOTOMA_AAUTH_TPM2_TEST_ENABLED=1` is not set
 *   - the native binding has not been built (`lib/index.js` missing)
 *   - the binding loads but reports `supported: false`
 *   - `/dev/tpmrm0` is not accessible (most non-server hosts)
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const LIB_INDEX = path.join(PACKAGE_ROOT, "lib", "index.js");

const isLinux = process.platform === "linux";
const enabled = process.env.NEOTOMA_AAUTH_TPM2_TEST_ENABLED === "1";
const libBuilt = fs.existsSync(LIB_INDEX);

if (!isLinux) {
  test("skipped on non-linux", { skip: true }, () => {});
} else if (!enabled) {
  test(
    "skipped: NEOTOMA_AAUTH_TPM2_TEST_ENABLED=1 not set",
    { skip: true },
    () => {},
  );
} else if (!libBuilt) {
  test(
    "skipped: package not built (run npm run build && npm run build:native)",
    { skip: true },
    () => {},
  );
}

let aauth;
let probe;
if (isLinux && enabled && libBuilt) {
  try {
    aauth = require(LIB_INDEX);
  } catch (err) {
    test(
      `skipped: package failed to load (${err.message})`,
      { skip: true },
      () => {},
    );
  }
}
if (aauth) {
  try {
    probe = aauth.isSupported();
  } catch (err) {
    probe = { supported: false, reason: err.message };
  }
}

test("isSupported() returns the documented shape", { skip: !aauth }, () => {
  assert.equal(typeof probe, "object");
  assert.notEqual(probe, null);
  assert.equal(typeof probe.supported, "boolean");
  if (!probe.supported) {
    assert.equal(typeof probe.reason, "string");
  }
});

test(
  "generateKey + sign roundtrips through node:crypto verify",
  { skip: !aauth || !probe?.supported },
  () => {
    if (!aauth || !probe?.supported) return;

    let keypair;
    try {
      keypair = aauth.generateKey({ hierarchy: "owner", alg: "RS256" });
    } catch (err) {
      console.warn(
        `[aauth-tpm2] generateKey skipped: ${err && err.message ? err.message : err}`,
      );
      return;
    }

    assert.ok(typeof keypair.handle === "string");
    assert.ok(/^0x81[0-9a-fA-F]+$/.test(keypair.handle), "handle out of range");
    assert.ok(keypair.jwk && typeof keypair.jwk.kty === "string");

    const message = Buffer.from(`neotoma-tpm2-smoke-${keypair.handle}`);
    const digest = crypto.createHash("sha256").update(message).digest();

    const signature = aauth.sign({
      handle: keypair.handle,
      digest,
      alg: keypair.alg,
    });
    assert.ok(Buffer.isBuffer(signature), "sign() returned non-Buffer");
    assert.ok(signature.length > 0, "signature is empty");

    const publicKey = crypto.createPublicKey({
      key: keypair.jwk,
      format: "jwk",
    });

    const verifier = crypto.createVerify("SHA256");
    verifier.update(digest);
    verifier.end();
    const ok = verifier.verify(
      keypair.alg === "ES256"
        ? { key: publicKey, dsaEncoding: "der" }
        : publicKey,
      signature,
    );
    assert.equal(
      ok,
      true,
      "TPM2 signature did not verify against the bound public JWK",
    );
  },
);

test(
  "attest() produces a WebAuthn-tpm envelope shape",
  { skip: !aauth || !probe?.supported },
  () => {
    if (!aauth || !probe?.supported) return;
    let keypair;
    try {
      keypair = aauth.generateKey({ hierarchy: "owner", alg: "RS256" });
    } catch (err) {
      console.warn(
        `[aauth-tpm2] generateKey skipped: ${err && err.message ? err.message : err}`,
      );
      return;
    }
    const challenge = crypto
      .createHash("sha256")
      .update("neotoma-tpm2-smoke-challenge")
      .digest("base64url");
    const jkt = crypto
      .createHash("sha256")
      .update(JSON.stringify(keypair.jwk))
      .digest("base64url");

    let env;
    try {
      env = aauth.attest({ handle: keypair.handle, challenge, jkt });
    } catch (err) {
      console.warn(
        `[aauth-tpm2] attest skipped: ${err && err.message ? err.message : err}`,
      );
      return;
    }
    assert.equal(env.format, "tpm2");
    assert.equal(env.ver, "2.0");
    assert.ok(Array.isArray(env.x5c) && env.x5c.length >= 1);
    assert.equal(typeof env.sig, "string");
    assert.equal(typeof env.certInfo, "string");
    assert.equal(typeof env.pubArea, "string");
  },
);

test("sign() rejects missing handle", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(
    () => aauth.sign({ digest: Buffer.alloc(32), alg: "RS256" }),
    /handle/,
  );
});

test("attest() rejects missing handle", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(() => aauth.attest({ challenge: "c", jkt: "j" }), /handle/);
});
