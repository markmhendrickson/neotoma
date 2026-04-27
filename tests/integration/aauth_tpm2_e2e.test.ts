/**
 * Integration tests: WebAuthn `tpm` attestation through the AAuth
 * middleware (FU-2026-Q3-aauth-tpm2-verifier).
 *
 * Mirrors `aauth_webauthn_packed_e2e.test.ts` but routes through the
 * TPM 2.0 verifier. The HTTP message-signature layer is mocked (we
 * don't run a JWKS server in the test suite) but every other layer is
 * real: trust-config loader, attestation verifier (with the
 * hand-written TPMS_ATTEST + TPMT_PUBLIC parser), tier resolver,
 * attribution stamping.
 *
 * Cases under test:
 *   1. Verified TPM2 envelope (ES256 AIK + matching pubArea) → hardware
 *   2. Tampered signature → software with verified=false / signature_invalid
 *   3. Mismatched pubArea thumbprint → software / key_binding_failed
 *   4. Certify name digest mismatch → software / pubarea_mismatch
 *
 * The TPMT_PUBLIC and TPMS_ATTEST blobs are hand-assembled in this file.
 * Bound key is RSA-2048 (modulus extracted from a node:crypto-generated
 * keypair) so the parser's RSA branch and the JWK round-trip both run.
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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@hellocoop/httpsig", () => ({
  expressVerify: vi.fn(),
}));

import { expressVerify } from "@hellocoop/httpsig";

import {
  aauthVerify,
  getAttributionDecisionFromRequest,
} from "../../src/middleware/aauth_verify.js";
import { computeBoundChallengeDigest } from "../../src/services/aauth_attestation_verifier.js";
import { resetAttestationTrustConfigCacheForTests } from "../../src/services/aauth_attestation_trust_config.js";
import { resetOperatorAllowlistCacheForTests } from "../../src/services/aauth_operator_allowlist.js";
import {
  TPM_ALG_RSA,
  TPM_ALG_SHA256,
  TPM_GENERATED_VALUE,
  TPM_ST_ATTEST_CERTIFY,
  TPM_ST_ATTEST_QUOTE,
} from "../../src/services/aauth_tpm_structures.js";

const verifyMock = vi.mocked(expressVerify);
const TPM_ALG_NULL = 0x0010;

interface AikFixture {
  rootPemPath: string;
  rootCert: X509Certificate;
  leafCert: X509Certificate;
  leafCertB64Url: string;
  rootCertB64Url: string;
  leafPrivatePem: string;
}

interface BoundKeyFixture {
  modulus: Buffer;
  jkt: string;
}

let aik: AikFixture | null = null;
let bound: BoundKeyFixture | null = null;
let tmpRoot: string;

function pemToB64Url(pem: string): string {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (!m) throw new Error("not a PEM CERTIFICATE block");
  return m[1]!.replace(/\s+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function bufToB64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function uint16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v, 0);
  return b;
}
function uint32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v, 0);
  return b;
}
function uint64(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(v, 0);
  return b;
}
function sized(v: Buffer): Buffer {
  return Buffer.concat([uint16(v.length), v]);
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

function buildTpmsAttestQuote(extra: Buffer): Buffer {
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
    sized(extra),
    Buffer.alloc(17),
    uint64(0n),
    pcrSelect,
    sized(Buffer.alloc(32)),
  ]);
}

function buildTpmsAttestCertify(extra: Buffer, name: Buffer): Buffer {
  return Buffer.concat([
    uint32(TPM_GENERATED_VALUE),
    uint16(TPM_ST_ATTEST_CERTIFY),
    sized(Buffer.alloc(0)),
    sized(extra),
    Buffer.alloc(17),
    uint64(0n),
    sized(name),
    sized(Buffer.alloc(0)),
  ]);
}

function signCertInfo(privateKeyPem: string, certInfo: Buffer): string {
  const signer = createSign("SHA256");
  signer.update(certInfo);
  signer.end();
  return bufToB64Url(signer.sign(createPrivateKey(privateKeyPem)));
}

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-tpm2-e2e-"));
  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl ecparam -name prime256v1 -genkey -noout -out root.key",
        "openssl req -new -x509 -key root.key -days 3650 -out root.crt -subj /CN=NeotomaTestTpm2E2eRoot",
        "openssl ecparam -name prime256v1 -genkey -noout -out leaf.key",
        "openssl req -new -key leaf.key -out leaf.csr -subj /CN=NeotomaTestTpm2E2eLeaf",
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
    rootPemPath: join(tmpRoot, "root.crt"),
    rootCert: new X509Certificate(rootPem),
    leafCert: new X509Certificate(leafPem),
    leafCertB64Url: pemToB64Url(leafPem),
    rootCertB64Url: pemToB64Url(rootPem),
    leafPrivatePem: leafKeyPem,
  };

  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = (await exportJWK(publicKey)) as { n: string; e: string };
  const padN = jwk.n.padEnd(jwk.n.length + ((4 - (jwk.n.length % 4)) % 4), "=");
  const modulus = Buffer.from(
    padN.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  const jkt = await calculateJwkThumbprint(
    jwk as Parameters<typeof calculateJwkThumbprint>[0],
  );
  bound = { modulus, jkt };
});

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

const ENV_KEYS = [
  "NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH",
  "NEOTOMA_AAUTH_ATTESTATION_CA_PATH",
  "NEOTOMA_AAUTH_TPM_ROOTS_PATH",
  "NEOTOMA_OPERATOR_ATTESTED_ISSUERS",
  "NEOTOMA_OPERATOR_ATTESTED_SUBS",
] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
): void {
  for (const key of ENV_KEYS) {
    if (key in values) {
      const v = values[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
  resetAttestationTrustConfigCacheForTests();
  resetOperatorAllowlistCacheForTests();
}

function buildReq(): any {
  return {
    method: "POST",
    protocol: "https",
    hostname: "neotoma.io",
    originalUrl: "/mcp",
    headers: {
      signature: "sig=:abc:",
      "signature-input": "sig=(\"@method\");created=1",
      "signature-key": "sk",
    },
    rawBody: Buffer.from(""),
  };
}

function buildJwtRaw(payload: Record<string, unknown>): string {
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" }),
  ).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${headerB64}.${payloadB64}.sig`;
}

describe("AAuth TPM 2.0 end-to-end", () => {
  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    verifyMock.mockReset();
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    resetAttestationTrustConfigCacheForTests();
    resetOperatorAllowlistCacheForTests();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const v = originalEnv[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetAttestationTrustConfigCacheForTests();
    resetOperatorAllowlistCacheForTests();
  });

  it("verified TPM2 envelope promotes to hardware (ES256 AIK + matching pubArea)", async () => {
    if (!aik || !bound) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: aik.rootPemPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:hw-tpm2";
    const iat = Math.floor(Date.now() / 1000);
    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(extra);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);

    const cnf = {
      jwk: { kty: "RSA" },
      attestation: {
        format: "tpm2",
        statement: {
          ver: "2.0",
          alg: -7,
          sig,
          x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
          certInfo: bufToB64Url(certInfo),
          pubArea: bufToB64Url(pubArea),
        },
        challenge,
      },
    };

    const jwtRaw = buildJwtRaw({ sub, iss, iat, exp: iat + 3600, cnf });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "RSA" },
      thumbprint: bound.jkt,
      created: iat,
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("hardware");
    expect(decision?.attestation).toEqual({
      verified: true,
      format: "tpm2",
    });
  });

  it("tampered TPM2 signature falls back to software with signature_invalid diagnostic", async () => {
    if (!aik || !bound) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: aik.rootPemPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:tamper-tpm2";
    const iat = Math.floor(Date.now() / 1000);
    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(extra);
    const tampered = Buffer.from(certInfo);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    const sig = signCertInfo(aik.leafPrivatePem, tampered);

    const jwtRaw = buildJwtRaw({
      sub,
      iss,
      iat,
      exp: iat + 3600,
      cnf: {
        attestation: {
          format: "tpm2",
          statement: {
            ver: "2.0",
            alg: -7,
            sig,
            x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
            certInfo: bufToB64Url(certInfo),
            pubArea: bufToB64Url(pubArea),
          },
          challenge,
        },
      },
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "RSA" },
      thumbprint: bound.jkt,
      created: iat,
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("software");
    expect(decision?.attestation).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "signature_invalid",
    });
  });

  it("mismatched pubArea thumbprint falls back to software with key_binding_failed", async () => {
    if (!aik || !bound) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: aik.rootPemPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:keybind-tpm2";
    const iat = Math.floor(Date.now() / 1000);
    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });
    const extra = computeBoundChallengeDigest(challenge, "wrong-jkt");
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const certInfo = buildTpmsAttestQuote(extra);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);

    const jwtRaw = buildJwtRaw({
      sub,
      iss,
      iat,
      exp: iat + 3600,
      cnf: {
        attestation: {
          format: "tpm2",
          statement: {
            ver: "2.0",
            alg: -7,
            sig,
            x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
            certInfo: bufToB64Url(certInfo),
            pubArea: bufToB64Url(pubArea),
          },
          challenge,
        },
      },
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "RSA" },
      thumbprint: "wrong-jkt",
      created: iat,
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("software");
    expect(decision?.attestation).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "key_binding_failed",
    });
  });

  it("certify name digest mismatch falls back to software with pubarea_mismatch", async () => {
    if (!aik || !bound) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: aik.rootPemPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:certify-tpm2";
    const iat = Math.floor(Date.now() / 1000);
    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });
    const extra = computeBoundChallengeDigest(challenge, bound.jkt);
    const pubArea = buildTpmtPublicRsa(bound.modulus);
    const wrongDigest = createHash("sha256").update("wrong").digest();
    const name = Buffer.concat([uint16(TPM_ALG_SHA256), wrongDigest]);
    const certInfo = buildTpmsAttestCertify(extra, name);
    const sig = signCertInfo(aik.leafPrivatePem, certInfo);

    const jwtRaw = buildJwtRaw({
      sub,
      iss,
      iat,
      exp: iat + 3600,
      cnf: {
        attestation: {
          format: "tpm2",
          statement: {
            ver: "2.0",
            alg: -7,
            sig,
            x5c: [aik.leafCertB64Url, aik.rootCertB64Url],
            certInfo: bufToB64Url(certInfo),
            pubArea: bufToB64Url(pubArea),
          },
          challenge,
        },
      },
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "RSA" },
      thumbprint: bound.jkt,
      created: iat,
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("software");
    expect(decision?.attestation).toMatchObject({
      verified: false,
      format: "tpm2",
      reason: "pubarea_mismatch",
    });
  });
});
