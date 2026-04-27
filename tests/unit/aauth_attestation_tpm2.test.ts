/**
 * Unit tests for `src/services/aauth_attestation_tpm2.ts`.
 *
 * Covers the WebAuthn `tpm` attestation verifier:
 *   - parseStatement guard rails (malformed envelopes, bad ver, missing fields)
 *   - unsupported COSE alg -> signature_invalid
 *   - non-parseable / empty x5c -> chain_invalid
 *   - thumbprint mismatch (pubArea vs cnf.jwk) -> key_binding_failed
 *   - untrusted chain -> chain_invalid
 *   - tampered signature -> signature_invalid
 *   - challenge mismatch (extraData) -> challenge_mismatch
 *   - certify name mismatch -> pubarea_mismatch
 *   - happy path (quote) -> verified=true
 *   - happy path (certify with matching name) -> verified=true
 *
 * Uses a runtime-generated EC P-256 AIK chain (via openssl) plus an
 * RSA-2048 keypair (via node:crypto) for the bound key. The TPMT_PUBLIC
 * and TPMS_ATTEST blobs are hand-assembled so the verifier exercises
 * the full parser + cryptography path without an external TPM
 * dependency.
 */

import {
  X509Certificate,
  createHash,
  createPrivateKey,
  createSign,
  generateKeyPairSync,
} from "node:crypto";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { calculateJwkThumbprint, exportJWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyTpm2Attestation } from "../../src/services/aauth_attestation_tpm2.js";
import {
  computeBoundChallengeDigest,
  type AttestationContext,
} from "../../src/services/aauth_attestation_verifier.js";
import type { AttestationTrustConfig } from "../../src/services/aauth_attestation_trust_config.js";
import {
  TPM_ALG_RSA,
  TPM_ALG_SHA256,
  TPM_GENERATED_VALUE,
  TPM_ST_ATTEST_CERTIFY,
  TPM_ST_ATTEST_QUOTE,
} from "../../src/services/aauth_tpm_structures.js";

const TPM_ALG_NULL = 0x0010;

interface AikFixture {
  rootCert: X509Certificate;
  leafCert: X509Certificate;
  leafCertB64Url: string;
  rootCertB64Url: string;
  leafPrivatePem: string;
}

interface BoundKeyFixture {
  publicKeyPem: string;
  modulus: Buffer;
  jkt: string;
}

let aik: AikFixture | null = null;
let boundKey: BoundKeyFixture | null = null;
let tmpRoot: string;

function pemToB64Url(pem: string): string {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (!m) throw new Error("not a PEM CERTIFICATE block");
  const b64 = m[1]!.replace(/\s+/g, "");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function bufToB64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function uint16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

function uint32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function uint64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(value, 0);
  return buf;
}

function sized(value: Buffer): Buffer {
  return Buffer.concat([uint16(value.length), value]);
}

function buildTpmtPublicRsa(modulus: Buffer): Buffer {
  return Buffer.concat([
    uint16(TPM_ALG_RSA),
    uint16(TPM_ALG_SHA256),
    uint32(0x00040472),
    sized(Buffer.alloc(0)),
    uint16(TPM_ALG_NULL),
    uint16(TPM_ALG_NULL),
    uint16(modulus.length * 8),
    uint32(0),
    sized(modulus),
  ]);
}

function buildTpmsAttestQuote(extraData: Buffer): Buffer {
  const pcrSelect = Buffer.concat([
    uint32(1),
    uint16(TPM_ALG_SHA256),
    Buffer.from([0x03]),
    Buffer.from([0xff, 0xff, 0xff]),
  ]);
  return Buffer.concat([
    uint32(TPM_GENERATED_VALUE),
    uint16(TPM_ST_ATTEST_QUOTE),
    sized(Buffer.alloc(0)),
    sized(extraData),
    Buffer.alloc(17),
    uint64(0n),
    pcrSelect,
    sized(Buffer.alloc(32)),
  ]);
}

function buildTpmsAttestCertify(extraData: Buffer, name: Buffer): Buffer {
  return Buffer.concat([
    uint32(TPM_GENERATED_VALUE),
    uint16(TPM_ST_ATTEST_CERTIFY),
    sized(Buffer.alloc(0)),
    sized(extraData),
    Buffer.alloc(17),
    uint64(0n),
    sized(name),
    sized(Buffer.alloc(0)),
  ]);
}

function signCertInfo(privateKeyPem: string, certInfo: Buffer): Buffer {
  const signer = createSign("SHA256");
  signer.update(certInfo);
  signer.end();
  return signer.sign(createPrivateKey(privateKeyPem));
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-tpm2-"));
  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl ecparam -name prime256v1 -genkey -noout -out root.key",
        "openssl req -new -x509 -key root.key -days 3650 -out root.crt -subj /CN=NeotomaTestTpm2Root",
        "openssl ecparam -name prime256v1 -genkey -noout -out leaf.key",
        "openssl req -new -key leaf.key -out leaf.csr -subj /CN=NeotomaTestTpm2Leaf",
        "printf 'basicConstraints=CA:FALSE\\n' > ext.cnf",
        "openssl x509 -req -in leaf.csr -CA root.crt -CAkey root.key -CAcreateserial -days 3650 -out leaf.crt -extfile ext.cnf",
      ].join(" && "),
      { stdio: "ignore" },
    );
  } catch {
    return;
  }

  const rootPem = readFileSync(join(tmpRoot, "root.crt"), "utf8");
  const leafPem = readFileSync(join(tmpRoot, "leaf.crt"), "utf8");
  const leafKeyPem = readFileSync(join(tmpRoot, "leaf.key"), "utf8");

  aik = {
    rootCert: new X509Certificate(rootPem),
    leafCert: new X509Certificate(leafPem),
    leafCertB64Url: pemToB64Url(leafPem),
    rootCertB64Url: pemToB64Url(rootPem),
    leafPrivatePem: leafKeyPem,
  };
});

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

async function buildBoundKey(): Promise<BoundKeyFixture> {
  if (boundKey) return boundKey;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  void privateKey;
  const jwk = (await exportJWK(publicKey)) as { n: string; e: string; kty: string };
  const modulus = Buffer.from(
    jwk.n.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      jwk.n.length + ((4 - (jwk.n.length % 4)) % 4),
      "=",
    ),
    "base64",
  );
  const jkt = await calculateJwkThumbprint(
    jwk as Parameters<typeof calculateJwkThumbprint>[0],
  );
  boundKey = {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    modulus,
    jkt,
  };
  return boundKey;
}

function trustWith(roots: X509Certificate[]): AttestationTrustConfig {
  return {
    attestationRoots: roots,
    webauthnAaguidAllowlist: [],
    diagnostics: [],
  };
}

function ctxFor(
  challenge: string,
  jkt: string,
  trust: AttestationTrustConfig,
): AttestationContext {
  return {
    expectedChallenge: challenge,
    boundJkt: jkt,
    trustConfig: trust,
  };
}

describe("verifyTpm2Attestation - malformed envelopes", () => {
  it("returns malformed when statement is not an object", async () => {
    const out = await verifyTpm2Attestation(
      { format: "tpm2", statement: "nope", challenge: "c" },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "malformed",
    });
  });

  it("returns unsupported_format when ver is not '2.0'", async () => {
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "1.2",
          alg: -7,
          sig: "AA",
          x5c: ["AA"],
          certInfo: "AA",
          pubArea: "AA",
        },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "unsupported_format",
    });
  });

  it("returns malformed when required fields are missing", async () => {
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: { ver: "2.0", alg: -7, sig: "AA", x5c: ["AA"] },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "malformed" });
  });
});

describe("verifyTpm2Attestation - alg & chain handling", () => {
  it("returns signature_invalid for unsupported COSE alg (e.g. -8 EdDSA)", async () => {
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -8,
          sig: "AA",
          x5c: ["AA"],
          certInfo: "AA",
          pubArea: "AA",
        },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "signature_invalid" });
  });

  it("returns chain_invalid when x5c bytes are not parseable", async () => {
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: "AA",
          x5c: ["bm90LWFuLXg1MDk"],
          certInfo: "AA",
          pubArea: "AA",
        },
        challenge: "c",
      },
      ctxFor("c", "jkt", trustWith([])),
    );
    expect(out).toMatchObject({ verified: false, reason: "chain_invalid" });
  });
});

describe("verifyTpm2Attestation - key binding & chain trust", () => {
  it("returns key_binding_failed when pubArea thumbprint disagrees with boundJkt", async () => {
    if (!aik) return;
    const bound = await buildBoundKey();
    const challenge = "challenge-keybind";
    const extra = computeBoundChallengeDigest(challenge, "wrong-jkt");
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(extra);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: bufToB64Url(sig),
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
      ctxFor(challenge, "wrong-jkt", trustWith([aik.rootCert])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "key_binding_failed",
    });
  });

  it("returns chain_invalid when terminal cert is not in trust set", async () => {
    if (!aik) return;
    const bound = await buildBoundKey();
    const challenge = "challenge-chain";
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(extra);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: bufToB64Url(sig),
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
      ctxFor(challenge, bound.jkt, trustWith([])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "chain_invalid",
    });
  });
});

describe("verifyTpm2Attestation - signature & extraData", () => {
  it("returns signature_invalid when sig does not verify", async () => {
    if (!aik) return;
    const bound = await buildBoundKey();
    const challenge = "challenge-sig";
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(extra);
    const tampered = Buffer.from(certInfo);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    const sig = signCertInfo(aik.leafPrivatePem, tampered);
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: bufToB64Url(sig),
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
      ctxFor(challenge, bound.jkt, trustWith([aik.rootCert])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "signature_invalid",
    });
  });

  it("returns challenge_mismatch when extraData disagrees with bound digest", async () => {
    if (!aik) return;
    const bound = await buildBoundKey();
    const challenge = "challenge-extra";
    const wrongExtra = computeBoundChallengeDigest("other", bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(wrongExtra);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: bufToB64Url(sig),
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
      ctxFor(challenge, bound.jkt, trustWith([aik.rootCert])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "challenge_mismatch",
    });
  });
});

describe("verifyTpm2Attestation - happy paths", () => {
  it("verifies a well-formed quote end-to-end", async () => {
    if (!aik) return;
    const bound = await buildBoundKey();
    const challenge = "challenge-quote";
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(extra);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: bufToB64Url(sig),
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
      ctxFor(challenge, bound.jkt, trustWith([aik.rootCert])),
    );
    expect(out).toEqual({ verified: true, format: "tpm2" });
  });

  it("verifies a certify payload whose name matches SHA-256(pubArea)", async () => {
    if (!aik) return;
    const bound = await buildBoundKey();
    const challenge = "challenge-certify";
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const digest = createHash("sha256").update(pubArea).digest();
    const name = Buffer.concat([uint16(TPM_ALG_SHA256), digest]);
    const certInfo = buildTpmsAttestCertify(extra, name);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: bufToB64Url(sig),
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
      ctxFor(challenge, bound.jkt, trustWith([aik.rootCert])),
    );
    expect(out).toEqual({ verified: true, format: "tpm2" });
  });

  it("returns pubarea_mismatch when certify name digest disagrees with pubArea", async () => {
    if (!aik) return;
    const bound = await buildBoundKey();
    const challenge = "challenge-pubarea";
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const wrongDigest = createHash("sha256").update("wrong").digest();
    const name = Buffer.concat([uint16(TPM_ALG_SHA256), wrongDigest]);
    const certInfo = buildTpmsAttestCertify(extra, name);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);
    const out = await verifyTpm2Attestation(
      {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig: bufToB64Url(sig),
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
      ctxFor(challenge, bound.jkt, trustWith([aik.rootCert])),
    );
    expect(out).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "pubarea_mismatch",
    });
  });
});
