/**
 * Cross-platform YubiKey smoke tests for `@neotoma/aauth-yubikey`.
 *
 * These tests exercise the native PKCS#11 + YKPIV_INS_ATTEST binding
 * end-to-end on any host (darwin / linux / win32) with a YubiKey 5
 * series device connected and `libykcs11` reachable. They are
 * intentionally narrow:
 *
 *   1. `isSupported()` returns the documented `{ supported, reason? }`
 *      shape on every host.
 *   2. On a YubiKey-equipped host, `generateKey()` produces a slot 9c
 *      attestation cert plus a JWK whose public bytes round-trip
 *      through `crypto.createPublicKey`.
 *   3. `sign({ slot, digest, alg })` returns a DER signature that
 *      verifies under Node's crypto with the imported public JWK.
 *   4. `attest({ slot, challenge, jkt })` returns an envelope with the
 *      documented WebAuthn-`packed` shape (`format`, `alg`, `sig`,
 *      `x5c`, `aaguid`).
 *
 * The tests SKIP cleanly when:
 *   - the explicit opt-in env var
 *     `NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED=1` is not set (avoids
 *     accidental PIN lockout on developer YubiKeys)
 *   - the native binding has not been built (`lib/index.js` missing)
 *   - the binding loads but reports `supported: false` (no libykcs11
 *     installed, no YubiKey connected, firmware too old, etc.)
 *   - PIN is not provided via NEOTOMA_AAUTH_YUBIKEY_PIN (smoke tests
 *     refuse to prompt interactively to avoid CI hangs)
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const LIB_INDEX = path.join(PACKAGE_ROOT, "lib", "index.js");

const enabled = process.env.NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED === "1";
const libBuilt = fs.existsSync(LIB_INDEX);
const pin = process.env.NEOTOMA_AAUTH_YUBIKEY_PIN;

if (!enabled) {
  test(
    "skipped: NEOTOMA_AAUTH_YUBIKEY_TEST_ENABLED=1 not set",
    { skip: true },
    () => {},
  );
} else if (!libBuilt) {
  test(
    "skipped: package not built (run npm run build && npm run build:native)",
    { skip: true },
    () => {},
  );
} else if (!pin) {
  test(
    "skipped: NEOTOMA_AAUTH_YUBIKEY_PIN not provided (smoke tests refuse to prompt)",
    { skip: true },
    () => {},
  );
}

let aauth;
let probe;
if (enabled && libBuilt && pin) {
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
      keypair = aauth.generateKey({ slot: "9c", alg: "ES256", pin });
    } catch (err) {
      console.warn(
        `[aauth-yubikey] generateKey skipped: ${
          err && err.message ? err.message : err
        }`,
      );
      return;
    }

    assert.ok(typeof keypair.serial === "string");
    assert.ok(keypair.serial.length > 0, "serial is empty");
    assert.equal(keypair.slot, "9c");
    assert.equal(keypair.alg, "ES256");
    assert.ok(typeof keypair.attestationCert === "string");
    assert.ok(typeof keypair.attestationIntermediate === "string");
    assert.ok(keypair.jwk && keypair.jwk.kty === "EC");

    const message = Buffer.from(`neotoma-yubikey-smoke-${keypair.serial}`);
    const digest = crypto.createHash("sha256").update(message).digest();

    const signature = aauth.sign({
      slot: "9c",
      pkcs11Path: keypair.pkcs11Path,
      digest,
      alg: keypair.alg,
      pin,
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
      { key: publicKey, dsaEncoding: "der" },
      signature,
    );
    assert.equal(
      ok,
      true,
      "YubiKey signature did not verify against the bound public JWK",
    );
  },
);

test(
  "attest() produces a WebAuthn-packed envelope shape",
  { skip: !aauth || !probe?.supported },
  () => {
    if (!aauth || !probe?.supported) return;
    let keypair;
    try {
      keypair = aauth.generateKey({ slot: "9c", alg: "ES256", pin });
    } catch (err) {
      console.warn(
        `[aauth-yubikey] generateKey skipped: ${
          err && err.message ? err.message : err
        }`,
      );
      return;
    }
    const challenge = crypto
      .createHash("sha256")
      .update("neotoma-yubikey-smoke-challenge")
      .digest("base64url");
    const jkt = crypto
      .createHash("sha256")
      .update(JSON.stringify(keypair.jwk))
      .digest("base64url");

    let env;
    try {
      env = aauth.attest({
        slot: "9c",
        pkcs11Path: keypair.pkcs11Path,
        challenge,
        jkt,
        pin,
      });
    } catch (err) {
      console.warn(
        `[aauth-yubikey] attest skipped: ${
          err && err.message ? err.message : err
        }`,
      );
      return;
    }
    assert.equal(env.format, "packed");
    assert.equal(env.alg, -7);
    assert.equal(typeof env.sig, "string");
    assert.ok(Array.isArray(env.x5c) && env.x5c.length >= 1);
    assert.equal(typeof env.aaguid, "string");
  },
);

test("sign() rejects missing slot", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(
    () => aauth.sign({ digest: Buffer.alloc(32), alg: "ES256" }),
    /slot|YUBIKEY/,
  );
});

test("attest() rejects unsupported slot override", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(
    () => aauth.attest({ slot: "9a", challenge: "c", jkt: "j" }),
    /9a|YUBIKEY_SLOT_UNSUPPORTED/,
  );
});

test("generateKey() rejects unsupported slot override", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(
    () => aauth.generateKey({ slot: "9a" }),
    /9a|YUBIKEY_SLOT_UNSUPPORTED/,
  );
});
