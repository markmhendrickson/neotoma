/**
 * Unit tests for `src/services/aauth_attestation_webauthn_packed.ts`.
 *
 * Covers the WebAuthn `packed` attestation verifier:
 *   - parseStatement guard rails (malformed envelopes)
 *   - unsupported COSE alg / ECDAA path -> signature_invalid
 *   - non-parseable / empty x5c -> chain_invalid / malformed
 *   - thumbprint mismatch -> key_binding_failed
 *   - untrusted chain -> chain_invalid
 *   - AAGUID extension absent or not allowlisted -> aaguid_not_trusted
 *   - AAGUID admission skipped when allowlist empty
 *   - tampered signature -> signature_invalid
 *   - happy path -> verified=true (ES256 with AAGUID admission)
 *
 * Uses runtime-generated EC P-256 + RSA-2048 root and leaf certs (via
 * the user's openssl binary, same approach as
 * `aauth_attestation_apple_se.test.ts`). The leaf cert embeds the FIDO
 * AAGUID extension (OID 1.3.6.1.4.1.45724.1.1.4) so we can exercise the
 * AAGUID admission path without bundling vendor metadata.
 */

import {
  X509Certificate,
  createPrivateKey,
  createSign,
} from "node:crypto";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { calculateJwkThumbprint, exportJWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyWebauthnPackedAttestation } from "../../src/services/aauth_attestation_webauthn_packed.js";
import {
  computeBoundChallengeDigest,
  type AttestationContext,
} from "../../src/services/aauth_attestation_verifier.js";
import type { AttestationTrustConfig } from "../../src/services/aauth_attestation_trust_config.js";

interface Fixture {
  rootCert: X509Certificate;
  leafCert: X509Certificate;
  leafCertB64Url: string;
  rootCertB64Url: string;
  leafPrivatePem: string;
  /**
   * AAGUID baked into the leaf certificate's FIDO extension. Lower-case
   * hyphenated UUID matching the format the verifier emits.
   */
  leafAaguid: string;
  rsaLeafCert: X509Certificate | null;
  rsaLeafCertB64Url: string | null;
  rsaRootCert: X509Certificate | null;
  rsaRootCertB64Url: string | null;
  rsaLeafPrivatePem: string | null;
}

let fixture: Fixture;
let tmpRoot: string;

function pemToB64Url(pem: string): string {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (!m) throw new Error("not a PEM CERTIFICATE block");
  const b64 = m[1]!.replace(/\s+/g, "");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-webauthn-packed-"));

  // 16-byte AAGUID baked into the leaf cert's FIDO extension. Choose a
  // fixed value so tests can assert on it deterministically.
  const aaguidHex = "0102030405060708090a0b0c0d0e0f10";
  const aaguidPretty = [
    aaguidHex.slice(0, 8),
    aaguidHex.slice(8, 12),
    aaguidHex.slice(12, 16),
    aaguidHex.slice(16, 20),
    aaguidHex.slice(20, 32),
  ].join("-");

  // Generate an EC P-256 root + leaf chain with the AAGUID extension on
  // the leaf. The extension's extnValue OCTET STRING wraps an inner
  // OCTET STRING containing the raw 16-byte AAGUID, matching the
  // encoding most WebAuthn authenticators emit. openssl wraps the
  // `DER:` payload in an outer extnValue OCTET STRING automatically, so
  // we only supply the inner `OCTET STRING { 16 bytes }` here.
  const aaguidExt = `04:10:${aaguidHex.match(/.{2}/g)!.join(":")}`;
  // Also generate an RSA leaf so we can cover the rsa-pkcs1 path. RSA
  // generation is slower, so guard against environments without openssl
  // by tolerating failure.
  let rsaGenerated = false;
  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl ecparam -name prime256v1 -genkey -noout -out root.key",
        "openssl req -new -x509 -key root.key -days 3650 -out root.crt -subj /CN=NeotomaTestWebauthnPackedRoot",
        "openssl ecparam -name prime256v1 -genkey -noout -out leaf.key",
        "openssl req -new -key leaf.key -out leaf.csr -subj /CN=NeotomaTestWebauthnPackedLeaf",
        // basicConstraints CA:FALSE PLUS our custom AAGUID extension.
        `printf 'basicConstraints=CA:FALSE\\n1.3.6.1.4.1.45724.1.1.4=DER:${aaguidExt}\\n' > ext.cnf`,
        "openssl x509 -req -in leaf.csr -CA root.crt -CAkey root.key -CAcreateserial -days 3650 -out leaf.crt -extfile ext.cnf",
      ].join(" && "),
      { stdio: "ignore" },
    );
  } catch {
    return;
  }

  let rsaRootPem: string | null = null;
  let rsaLeafPem: string | null = null;
  let rsaLeafKeyPem: string | null = null;
  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl genrsa -out root_rsa.key 2048",
        "openssl req -new -x509 -key root_rsa.key -days 3650 -out root_rsa.crt -subj /CN=NeotomaTestWebauthnPackedRsaRoot",
        "openssl genrsa -out leaf_rsa.key 2048",
        "openssl req -new -key leaf_rsa.key -out leaf_rsa.csr -subj /CN=NeotomaTestWebauthnPackedRsaLeaf",
        `printf 'basicConstraints=CA:FALSE\\n1.3.6.1.4.1.45724.1.1.4=DER:${aaguidExt}\\n' > ext_rsa.cnf`,
        "openssl x509 -req -in leaf_rsa.csr -CA root_rsa.crt -CAkey root_rsa.key -CAcreateserial -days 3650 -out leaf_rsa.crt -extfile ext_rsa.cnf",
      ].join(" && "),
      { stdio: "ignore" },
    );
    rsaRootPem = readFileSync(join(tmpRoot, "root_rsa.crt"), "utf8");
    rsaLeafPem = readFileSync(join(tmpRoot, "leaf_rsa.crt"), "utf8");
    rsaLeafKeyPem = readFileSync(join(tmpRoot, "leaf_rsa.key"), "utf8");
    rsaGenerated = true;
  } catch {
    rsaGenerated = false;
  }

  const rootPem = readFileSync(join(tmpRoot, "root.crt"), "utf8");
  const leafPem = readFileSync(join(tmpRoot, "leaf.crt"), "utf8");
  const leafKeyPem = readFileSync(join(tmpRoot, "leaf.key"), "utf8");

  fixture = {
    rootCert: new X509Certificate(rootPem),
    leafCert: new X509Certificate(leafPem),
    leafCertB64Url: pemToB64Url(leafPem),
    rootCertB64Url: pemToB64Url(rootPem),
    leafPrivatePem: leafKeyPem,
    leafAaguid: aaguidPretty,
    rsaLeafCert: rsaGenerated && rsaLeafPem ? new X509Certificate(rsaLeafPem) : null,
    rsaLeafCertB64Url: rsaGenerated && rsaLeafPem ? pemToB64Url(rsaLeafPem) : null,
    rsaRootCert: rsaGenerated && rsaRootPem ? new X509Certificate(rsaRootPem) : null,
    rsaRootCertB64Url: rsaGenerated && rsaRootPem ? pemToB64Url(rsaRootPem) : null,
    rsaLeafPrivatePem: rsaGenerated ? rsaLeafKeyPem : null,
  };
  void writeFileSync; // silence unused import warning when guards skip
});

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

async function leafJktFor(cert: X509Certificate): Promise<string> {
  const jwk = await exportJWK(cert.publicKey);
  return calculateJwkThumbprint(
    jwk as Parameters<typeof calculateJwkThumbprint>[0],
  );
}

function trustWith(
  roots: X509Certificate[],
  aaguidAllowlist: string[] = [],
): AttestationTrustConfig {
  return {
    attestationRoots: roots,
    webauthnAaguidAllowlist: aaguidAllowlist,
    diagnostics: [],
  };
}

function ctxFor(
  challenge: string,
  boundJkt: string,
  trust: AttestationTrustConfig,
): AttestationContext {
  return {
    expectedChallenge: challenge,
    boundJkt,
    trustConfig: trust,
  };
}

function signWithLeaf(
  hash: "SHA256" | "SHA384",
  privateKeyPem: string,
  digest: Buffer,
): string {
  const signer = createSign(hash);
  signer.update(digest);
  signer.end();
  return base64UrlEncode(signer.sign(createPrivateKey(privateKeyPem)));
}

describe("verifyWebauthnPackedAttestation - malformed envelopes", () => {
  it("returns malformed when statement is not an object", async () => {
    const out = await verifyWebauthnPackedAttestation(
      { format: "webauthn-packed", statement: "nope", challenge: "c" },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "webauthn-packed",
      reason: "malformed",
    });
  });

  it("returns malformed when alg is missing", async () => {
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: { sig: "AA", x5c: ["AA"] },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "malformed" });
  });

  it("returns malformed when sig is missing or empty", async () => {
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: { alg: -7, sig: "", x5c: ["AA"] },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "malformed" });
  });

  it("returns malformed when x5c is missing or empty", async () => {
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: { alg: -7, sig: "AA", x5c: [] },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "malformed" });
  });

  it("returns malformed when x5c entries are not strings", async () => {
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig: "AA",
          x5c: [123 as unknown as string],
        },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "malformed" });
  });
});

describe("verifyWebauthnPackedAttestation - unsupported alg / ECDAA", () => {
  it("returns signature_invalid for unsupported COSE alg (e.g. -8 EdDSA)", async () => {
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: { alg: -8, sig: "AA", x5c: ["AA"] },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "signature_invalid" });
  });

  it("returns signature_invalid when ecdaaKeyId is set (deprecated path)", async () => {
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig: "AA",
          x5c: ["AA"],
          ecdaaKeyId: "AA",
        },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "signature_invalid" });
  });
});

describe("verifyWebauthnPackedAttestation - chain handling", () => {
  it("returns chain_invalid when x5c bytes are not parseable as X.509", async () => {
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig: "AA",
          x5c: ["bm90LWFuLXg1MDk"], // "not-an-x509"
        },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "chain_invalid" });
  });

  it("returns chain_invalid when terminal cert is not in trust set", async () => {
    if (!fixture) return;
    const challenge = "challenge-untrusted";
    const jkt = await leafJktFor(fixture.leafCert);
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig: "AA",
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
      ctxFor(challenge, jkt, trustWith([])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "webauthn-packed",
      reason: "chain_invalid",
    });
  });
});

describe("verifyWebauthnPackedAttestation - AAGUID admission", () => {
  it("returns aaguid_not_trusted when allowlist is non-empty and AAGUID is missing", async () => {
    if (!fixture) return;
    const challenge = "challenge-aaguid-mismatch";
    const jkt = await leafJktFor(fixture.leafCert);
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig: "AA",
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
      ctxFor(
        challenge,
        jkt,
        trustWith([fixture.rootCert], ["00000000-0000-0000-0000-000000000000"]),
      ),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "webauthn-packed",
      reason: "aaguid_not_trusted",
    });
  });

  it("admits AAGUID when allowlist contains the leaf's AAGUID", async () => {
    if (!fixture) return;
    const challenge = "challenge-aaguid-match";
    const jkt = await leafJktFor(fixture.leafCert);
    const digest = computeBoundChallengeDigest(challenge, jkt);
    const sig = signWithLeaf("SHA256", fixture.leafPrivatePem, digest);
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig,
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
      ctxFor(
        challenge,
        jkt,
        trustWith([fixture.rootCert], [fixture.leafAaguid]),
      ),
    );
    expect(out).toEqual({ verified: true, format: "webauthn-packed" });
  });

  it("skips AAGUID admission when allowlist is empty", async () => {
    if (!fixture) return;
    const challenge = "challenge-aaguid-empty";
    const jkt = await leafJktFor(fixture.leafCert);
    const digest = computeBoundChallengeDigest(challenge, jkt);
    const sig = signWithLeaf("SHA256", fixture.leafPrivatePem, digest);
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig,
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
      ctxFor(challenge, jkt, trustWith([fixture.rootCert])),
    );
    expect(out).toEqual({ verified: true, format: "webauthn-packed" });
  });
});

describe("verifyWebauthnPackedAttestation - key binding", () => {
  it("returns key_binding_failed when leaf jkt does not match boundJkt", async () => {
    if (!fixture) return;
    const challenge = "challenge-keybind";
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig: "AA",
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
      ctxFor(challenge, "wrong-jkt", trustWith([fixture.rootCert])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "webauthn-packed",
      reason: "key_binding_failed",
    });
  });
});

describe("verifyWebauthnPackedAttestation - signature & success", () => {
  it("returns signature_invalid when signature does not verify", async () => {
    if (!fixture) return;
    const challenge = "challenge-sig-bad";
    const jkt = await leafJktFor(fixture.leafCert);
    const wrongDigest = computeBoundChallengeDigest("other-challenge", jkt);
    const sig = signWithLeaf("SHA256", fixture.leafPrivatePem, wrongDigest);
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig,
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
      ctxFor(challenge, jkt, trustWith([fixture.rootCert])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "webauthn-packed",
      reason: "signature_invalid",
    });
  });

  it("verifies a well-formed ES256 packed statement end-to-end", async () => {
    if (!fixture) return;
    const challenge = "challenge-success";
    const jkt = await leafJktFor(fixture.leafCert);
    const digest = computeBoundChallengeDigest(challenge, jkt);
    const sig = signWithLeaf("SHA256", fixture.leafPrivatePem, digest);
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig,
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
      ctxFor(challenge, jkt, trustWith([fixture.rootCert])),
    );
    expect(out).toEqual({ verified: true, format: "webauthn-packed" });
  });

  it("verifies a well-formed RSA-PKCS1 packed statement end-to-end (alg=-257)", async () => {
    if (!fixture || !fixture.rsaLeafCert || !fixture.rsaRootCert || !fixture.rsaLeafCertB64Url || !fixture.rsaRootCertB64Url || !fixture.rsaLeafPrivatePem) {
      return;
    }
    const challenge = "challenge-rsa-success";
    const jkt = await leafJktFor(fixture.rsaLeafCert);
    const digest = computeBoundChallengeDigest(challenge, jkt);
    const sig = signWithLeaf("SHA256", fixture.rsaLeafPrivatePem, digest);
    const out = await verifyWebauthnPackedAttestation(
      {
        format: "webauthn-packed",
        statement: {
          alg: -257,
          sig,
          x5c: [fixture.rsaLeafCertB64Url, fixture.rsaRootCertB64Url],
        },
        challenge,
      },
      ctxFor(
        challenge,
        jkt,
        trustWith([fixture.rsaRootCert], [fixture.leafAaguid]),
      ),
    );
    expect(out).toEqual({ verified: true, format: "webauthn-packed" });
  });
});
