/**
 * Integration tests: WebAuthn `packed` attestation through the AAuth
 * middleware (FU-2026-Q3-aauth-webauthn-packed-verifier).
 *
 * Mirrors `aauth_tier_resolution.test.ts` but routes through the
 * WebAuthn packed verifier rather than Apple Secure Enclave. The HTTP
 * message-signature layer is mocked (we don't run a JWKS server in the
 * test suite) but every other layer is real: trust-config loader,
 * attestation verifier, tier resolver, attribution stamping.
 *
 * Cases under test:
 *   1. Verified packed envelope (ES256 + AAGUID admission) -> hardware
 *   2. Tampered signature -> software with verified=false / signature_invalid
 *   3. AAGUID allowlist mismatch -> software with verified=false / aaguid_not_trusted
 */

import { X509Certificate, createPrivateKey, createSign } from "node:crypto";
import { execSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

const verifyMock = vi.mocked(expressVerify);

interface Fixture {
  rootPemPath: string;
  leafCert: X509Certificate;
  leafCertB64Url: string;
  rootCertB64Url: string;
  leafPrivatePem: string;
  /** AAGUID baked into the leaf cert's FIDO extension. */
  leafAaguid: string;
  /** Path to a JSON file containing only the leaf AAGUID (for the
   *  allowlist hit case). */
  aaguidAllowlistMatchPath: string;
  /** Path to a JSON file containing a non-matching AAGUID (for the
   *  allowlist miss case). */
  aaguidAllowlistMissPath: string;
}

let fixture: Fixture | null = null;
let tmpRoot: string;

function pemToB64Url(pem: string): string {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (!m) throw new Error("not a PEM CERTIFICATE block");
  return m[1]!.replace(/\s+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-webauthn-packed-e2e-"));

  const aaguidHex = "deadbeefcafef00d0011223344556677";
  const aaguidPretty = [
    aaguidHex.slice(0, 8),
    aaguidHex.slice(8, 12),
    aaguidHex.slice(12, 16),
    aaguidHex.slice(16, 20),
    aaguidHex.slice(20, 32),
  ].join("-");
  // openssl wraps the `DER:` payload in an outer extnValue OCTET
  // STRING automatically, so we only supply the inner OCTET STRING +
  // 16 byte AAGUID payload here. The result on the leaf cert is the
  // canonical `OCTET STRING { OCTET STRING { 16 bytes }}` encoding.
  const aaguidExt = `04:10:${aaguidHex.match(/.{2}/g)!.join(":")}`;

  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl ecparam -name prime256v1 -genkey -noout -out root.key",
        "openssl req -new -x509 -key root.key -days 3650 -out root.crt -subj /CN=NeotomaTestWebauthnPackedE2eRoot",
        "openssl ecparam -name prime256v1 -genkey -noout -out leaf.key",
        "openssl req -new -key leaf.key -out leaf.csr -subj /CN=NeotomaTestWebauthnPackedE2eLeaf",
        `printf 'basicConstraints=CA:FALSE\\n1.3.6.1.4.1.45724.1.1.4=DER:${aaguidExt}\\n' > ext.cnf`,
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

  const aaguidAllowlistMatchPath = join(tmpRoot, "aaguid_match.json");
  const aaguidAllowlistMissPath = join(tmpRoot, "aaguid_miss.json");
  writeFileSync(
    aaguidAllowlistMatchPath,
    JSON.stringify([aaguidPretty]),
  );
  writeFileSync(
    aaguidAllowlistMissPath,
    JSON.stringify(["00000000-0000-0000-0000-000000000000"]),
  );

  fixture = {
    rootPemPath: join(tmpRoot, "root.crt"),
    leafCert: new X509Certificate(leafPem),
    leafCertB64Url: pemToB64Url(leafPem),
    rootCertB64Url: pemToB64Url(rootPem),
    leafPrivatePem: leafKeyPem,
    leafAaguid: aaguidPretty,
    aaguidAllowlistMatchPath,
    aaguidAllowlistMissPath,
  };
});

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

const ENV_KEYS = [
  "NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH",
  "NEOTOMA_AAUTH_ATTESTATION_CA_PATH",
  "NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH",
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

async function leafJkt(): Promise<string> {
  const leafKey = fixture!.leafCert.publicKey;
  const jwk = await exportJWK(leafKey);
  return calculateJwkThumbprint(
    jwk as Parameters<typeof calculateJwkThumbprint>[0],
  );
}

function signLeafOverDigest(digest: Buffer): string {
  const signer = createSign("SHA256");
  signer.update(digest);
  signer.end();
  const der = signer.sign(createPrivateKey(fixture!.leafPrivatePem));
  return base64UrlEncode(der);
}

describe("AAuth WebAuthn packed end-to-end", () => {
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

  it("verified packed envelope promotes to hardware (ES256 + AAGUID admission)", async () => {
    if (!fixture) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH: fixture.aaguidAllowlistMatchPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:hw-packed";
    const iat = Math.floor(Date.now() / 1000);
    const jkt = await leafJkt();

    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });
    const digest = computeBoundChallengeDigest(challenge, jkt);
    const sig = signLeafOverDigest(digest);

    const cnf = {
      jwk: { kty: "EC", crv: "P-256", alg: "ES256" },
      attestation: {
        format: "webauthn-packed",
        statement: {
          alg: -7,
          sig,
          x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
        },
        challenge,
      },
    };

    const jwtRaw = buildJwtRaw({
      sub,
      iss,
      iat,
      exp: iat + 3600,
      cnf,
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: jkt,
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
      format: "webauthn-packed",
    });
  });

  it("tampered packed signature falls back to software with signature_invalid diagnostic", async () => {
    if (!fixture) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH: fixture.aaguidAllowlistMatchPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:tamper-packed";
    const iat = Math.floor(Date.now() / 1000);
    const jkt = await leafJkt();
    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });
    // Sign over the WRONG digest so the signature does not verify.
    const wrongDigest = computeBoundChallengeDigest("wrong-challenge", jkt);
    const sig = signLeafOverDigest(wrongDigest);

    const jwtRaw = buildJwtRaw({
      sub,
      iss,
      iat,
      exp: iat + 3600,
      cnf: {
        attestation: {
          format: "webauthn-packed",
          statement: {
            alg: -7,
            sig,
            x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
          },
          challenge,
        },
      },
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: jkt,
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
      format: "webauthn-packed",
      reason: "signature_invalid",
    });
  });

  it("AAGUID allowlist mismatch produces aaguid_not_trusted with software fallback", async () => {
    if (!fixture) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH: fixture.aaguidAllowlistMissPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:aaguid-miss";
    const iat = Math.floor(Date.now() / 1000);
    const jkt = await leafJkt();
    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });
    const digest = computeBoundChallengeDigest(challenge, jkt);
    const sig = signLeafOverDigest(digest);

    const jwtRaw = buildJwtRaw({
      sub,
      iss,
      iat,
      exp: iat + 3600,
      cnf: {
        attestation: {
          format: "webauthn-packed",
          statement: {
            alg: -7,
            sig,
            x5c: [fixture.leafCertB64Url, fixture.rootCertB64Url],
          },
          challenge,
        },
      },
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: jkt,
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
      format: "webauthn-packed",
      reason: "aaguid_not_trusted",
    });
  });
});
