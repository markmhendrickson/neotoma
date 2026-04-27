/**
 * Integration tests: AAuth tier resolution cascade (v0.8.0).
 *
 * Exercises the full middleware path with the real attestation verifier,
 * the real operator-allowlist service, and the real trust-config loader.
 * Only the HTTP message-signature layer is mocked (because exercising it
 * end-to-end requires JWKS infrastructure not available in unit/
 * integration suite).
 *
 * Cascade under test (per docs/subsystems/aauth_attestation.md):
 *   verified attestation → hardware
 *   operator allowlist hit → operator_attested
 *   plain verified signature → software
 *
 * The "verified attestation" path uses a runtime-generated EC P-256 root
 * + leaf chain so we never need real Apple attestation fixtures.
 */

import {
  X509Certificate,
  createPrivateKey,
  createSign,
} from "node:crypto";
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
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-tier-"));
  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl ecparam -name prime256v1 -genkey -noout -out root.key",
        "openssl req -new -x509 -key root.key -days 3650 -out root.crt -subj /CN=NeotomaTestRoot",
        "openssl ecparam -name prime256v1 -genkey -noout -out leaf.key",
        "openssl req -new -key leaf.key -out leaf.csr -subj /CN=NeotomaTestLeaf",
        `printf 'basicConstraints=CA:FALSE\\n' > ext.cnf`,
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

  fixture = {
    rootPemPath: join(tmpRoot, "root.crt"),
    leafCert: new X509Certificate(leafPem),
    leafCertB64Url: pemToB64Url(leafPem),
    rootCertB64Url: pemToB64Url(rootPem),
    leafPrivatePem: leafKeyPem,
  };
});

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

const ENV_KEYS = [
  "NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH",
  "NEOTOMA_AAUTH_ATTESTATION_CA_PATH",
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

describe("AAuth tier resolution cascade", () => {
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

  it("verified signature with no attestation and no allowlist -> software", async () => {
    const iat = Math.floor(Date.now() / 1000);
    const jwtRaw = buildJwtRaw({
      sub: "agent:plain",
      iss: "https://issuer.example",
      iat,
      exp: iat + 3600,
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: "tp-soft",
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
    expect(decision?.signature_verified).toBe(true);
    // The verifier is intentionally honest: when no `cnf.attestation`
    // envelope is present it records `{ verified: false, format:
    // "unknown", reason: "not_present" }` rather than omitting the
    // diagnostic, so operators can tell "no envelope" apart from "we
    // did not check".
    expect(decision?.attestation).toEqual({
      verified: false,
      format: "unknown",
      reason: "not_present",
    });
    expect(decision?.operator_allowlist_source).toBeUndefined();
  });

  it("operator allowlist hit by issuer -> operator_attested", async () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://allow.example",
    });
    const iat = Math.floor(Date.now() / 1000);
    const jwtRaw = buildJwtRaw({
      sub: "agent:any",
      iss: "https://allow.example",
      iat,
      exp: iat + 3600,
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: "tp-allow",
      created: iat,
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("operator_attested");
    expect(decision?.operator_allowlist_source).toBe("issuer");
  });

  it("operator allowlist by issuer:subject prefers issuer_subject source", async () => {
    withEnv({
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://allow.example",
      NEOTOMA_OPERATOR_ATTESTED_SUBS:
        "https://allow.example:agent:special",
    });
    const iat = Math.floor(Date.now() / 1000);
    const jwtRaw = buildJwtRaw({
      sub: "agent:special",
      iss: "https://allow.example",
      iat,
      exp: iat + 3600,
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: "tp-pair",
      created: iat,
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("operator_attested");
    expect(decision?.operator_allowlist_source).toBe("issuer_subject");
  });

  it("verified attestation promotes to hardware (Apple SE end-to-end)", async () => {
    if (!fixture) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
    });

    const iss = "https://issuer.example";
    const sub = "agent:hw";
    const iat = Math.floor(Date.now() / 1000);
    const jkt = await leafJkt();

    // Compute the challenge the SERVER will recompute and use it on the
    // agent side (this mirrors the CLI signer's buildAttestationChallenge).
    const { computeExpectedChallenge } = await import(
      "../../src/services/aauth_attestation_verifier.js"
    );
    const challenge = computeExpectedChallenge({ iss, sub, iat });

    const digest = computeBoundChallengeDigest(challenge, jkt);
    const sig = signLeafOverDigest(digest);

    const cnf = {
      jwk: { kty: "EC", crv: "P-256", alg: "ES256" },
      attestation: {
        format: "apple-secure-enclave",
        statement: {
          attestation_chain: [
            fixture.leafCertB64Url,
            fixture.rootCertB64Url,
          ],
          signature: sig,
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
      format: "apple-secure-enclave",
    });
  });

  it("malformed attestation envelope leaves tier at software with diagnostic", async () => {
    if (!fixture) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
    });

    const iat = Math.floor(Date.now() / 1000);
    const jwtRaw = buildJwtRaw({
      sub: "agent:bad-attest",
      iss: "https://issuer.example",
      iat,
      exp: iat + 3600,
      cnf: {
        attestation: {
          format: "apple-secure-enclave",
          statement: {},
          challenge: "irrelevant",
        },
      },
    });
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: "tp-bad",
      created: iat,
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    const decision = getAttributionDecisionFromRequest(req);
    // Either malformed (statement empty) or challenge_mismatch — both
    // mean "did not promote to hardware" with a recorded reason.
    expect(decision?.resolved_tier).toBe("software");
    expect(decision?.attestation?.verified).toBe(false);
    expect(decision?.attestation?.format).toBe("apple-secure-enclave");
    expect(typeof decision?.attestation?.reason).toBe("string");
  });

  it("attestation verified beats operator allowlist (hardware wins)", async () => {
    if (!fixture) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_OPERATOR_ATTESTED_ISSUERS: "https://issuer.example",
    });

    const iss = "https://issuer.example";
    const sub = "agent:hw-and-allow";
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
          format: "apple-secure-enclave",
          statement: {
            attestation_chain: [
              fixture.leafCertB64Url,
              fixture.rootCertB64Url,
            ],
            signature: sig,
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

    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("hardware");
    // operator_allowlist_source is intentionally omitted when hardware
    // wins — the cascade short-circuits at the first verified hit.
    expect(decision?.operator_allowlist_source).toBeUndefined();
  });

  // The integration test for unsigned requests is covered exhaustively
  // in the middleware unit tests (aauth_verify_middleware.test.ts); we
  // do not re-test it here.
});
