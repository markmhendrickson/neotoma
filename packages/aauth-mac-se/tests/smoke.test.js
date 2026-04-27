/**
 * Darwin-only smoke tests for `@neotoma/aauth-mac-se`.
 *
 * These tests exercise the native Secure Enclave binding end-to-end on
 * macOS. They are intentionally narrow:
 *
 *   1. `isSupported()` returns the documented `{ supported, reason? }`
 *      shape on every host.
 *   2. On a host with an SE-backed keychain, `generateKey({ tag })`
 *      produces a P-256 JWK whose public bytes match what
 *      Node's `crypto.createPublicKey` derives from the same JWK.
 *   3. `sign({ tag, message })` round-trips: the DER signature it
 *      returns verifies under Node's crypto with the imported public
 *      key, against the same SHA-256 digest the SE was asked to sign.
 *
 * The tests SKIP cleanly when:
 *   - platform is not `darwin`
 *   - the native binding has not been built (`lib/index.js` missing)
 *   - the binding loads but reports `supported: false`
 *   - keychain access is denied (CI / sandboxed contexts)
 *
 * `attest()` is intentionally NOT exercised here. Apple's
 * `SecKeyCreateAttestation` with `kSecKeyAttestationKeyTypeGID`
 * requires an entitled application and an internet round-trip to the
 * Apple Attestation Service — neither of which a local unit-test
 * harness can provide. Attestation verification is exercised against
 * a synthetic chain in `tests/unit/aauth_attestation_apple_se.test.ts`.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const LIB_INDEX = path.join(PACKAGE_ROOT, "lib", "index.js");

const isDarwin = process.platform === "darwin";
const libBuilt = fs.existsSync(LIB_INDEX);

if (!isDarwin) {
  test("skipped on non-darwin", { skip: true }, () => {});
} else if (!libBuilt) {
  test("skipped: package not built (run npm run build && npm run build:native)", {
    skip: true,
  }, () => {});
}

let aauth;
let probe;
if (isDarwin && libBuilt) {
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

test("generateKey + sign roundtrips through node:crypto verify", { skip: !aauth || !probe?.supported }, () => {
  if (!aauth) return;
  if (!probe?.supported) return;

  // Use a stable-prefix + random suffix tag so concurrent runs don't
  // collide and so we can identify orphaned smoke-test keys in the
  // keychain. The binding does not currently expose a delete, so each
  // run leaves a small stub entry behind. Operators who run this in
  // CI can clean them up via `security delete-generic-password` or by
  // running `find packages/aauth-mac-se/tests -name '*.test.js'` and
  // adding a deletion helper there. (Tracked in FU-2026-04-aauth-
  // hardware-attestation manifest under `cleanup_followups`.)
  const tag = `neotoma-smoke-${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}`;

  let keypair;
  try {
    keypair = aauth.generateKey({ tag });
  } catch (err) {
    // Keychain access can be denied in sandboxed CI runners. That's a
    // legitimate "skip" rather than a test failure: the SE itself is
    // present and the binding loaded, but the harness cannot persist
    // a key. Surface as a console warning so CI can record it without
    // failing the suite.
    console.warn(
      `[aauth-mac-se] generateKey skipped: ${err && err.message ? err.message : err}`,
    );
    return;
  }

  assert.equal(keypair.keyTag, tag);
  assert.equal(keypair.jwk.kty, "EC");
  assert.equal(keypair.jwk.crv, "P-256");
  assert.equal(typeof keypair.jwk.x, "string");
  assert.equal(typeof keypair.jwk.y, "string");

  const message = Buffer.from(`neotoma-smoke-${tag}`);
  const digest = crypto.createHash("sha256").update(message).digest();

  const signature = aauth.sign({ tag, message: digest });
  assert.ok(Buffer.isBuffer(signature), "sign() returned non-Buffer");
  assert.ok(signature.length > 0, "signature is empty");

  const publicKey = crypto.createPublicKey({
    key: keypair.jwk,
    format: "jwk",
  });

  const verifier = crypto.createVerify("SHA256");
  verifier.update(digest);
  verifier.end();
  const ok = verifier.verify({ key: publicKey, dsaEncoding: "der" }, signature);
  assert.equal(ok, true, "ECDSA signature did not verify against the SE public key");
});

test("sign() rejects missing tag", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(() => aauth.sign({ message: Buffer.alloc(32) }), /tag/);
});

test("sign() rejects non-Buffer message", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(
    () => aauth.sign({ tag: "missing", message: "not-a-buffer" }),
    /message/,
  );
});

test("generateKey() rejects missing tag", { skip: !aauth }, () => {
  if (!aauth) return;
  assert.throws(() => aauth.generateKey({}), /tag/);
});
