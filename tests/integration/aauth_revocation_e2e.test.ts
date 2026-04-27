/**
 * Integration tests: AAuth attestation revocation through the
 * middleware → verifier → revocation cascade
 * (FU-2026-Q4-aauth-attestation-revocation).
 *
 * Mirrors `aauth_tier_resolution.test.ts` but adds a local HTTP server
 * that impersonates Apple's anonymous-attestation revocation endpoint.
 * The middleware → Apple SE verifier → revocation service path runs
 * end-to-end against the real default fetcher (`node:http`) — no
 * vi.mock of the revocation module — so we exercise the genuine
 * cache + fetcher + parser surface.
 *
 * Cases under test:
 *   1. `enforce` mode + revoked serial -> hardware demotes to software,
 *      reason=`revoked`, decision.attestation.revocation.demoted=true
 *   2. `log_only` mode + revoked serial -> hardware stays hardware,
 *      diagnostic surfaces revocation.status=`revoked`,
 *      revocation.demoted=false
 *   3. `disabled` mode -> no diagnostic, no demotion (and the
 *      impersonating server records zero hits, proving the verifier
 *      never opened a socket).
 */

import {
  X509Certificate,
  createPrivateKey,
  createSign,
} from "node:crypto";
import { execSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

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
import { resetRevocationCacheForTests } from "../../src/services/aauth_attestation_revocation.js";

const verifyMock = vi.mocked(expressVerify);

interface Fixture {
  rootPemPath: string;
  leafCert: X509Certificate;
  leafCertB64Url: string;
  rootCertB64Url: string;
  leafPrivatePem: string;
  /** Lower-cased serial as the revocation server expects it. */
  leafSerialLower: string;
}

let fixture: Fixture | null = null;
let tmpRoot: string;

/**
 * Local HTTP server impersonating Apple's anonymous-attestation
 * revocation endpoint. The set of revoked serials is mutable per test
 * so we can flip behaviour without restarting the server.
 */
let revocationServer: Server | null = null;
let revocationServerUrl: string | null = null;
const revokedSerials = new Set<string>();
let serverHits = 0;

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

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-revocation-e2e-"));
  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl ecparam -name prime256v1 -genkey -noout -out root.key",
        "openssl req -new -x509 -key root.key -days 3650 -out root.crt -subj /CN=NeotomaTestRevocationE2eRoot",
        "openssl ecparam -name prime256v1 -genkey -noout -out leaf.key",
        "openssl req -new -key leaf.key -out leaf.csr -subj /CN=NeotomaTestRevocationE2eLeaf",
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
  const leafCert = new X509Certificate(leafPem);

  fixture = {
    rootPemPath: join(tmpRoot, "root.crt"),
    leafCert,
    leafCertB64Url: pemToB64Url(leafPem),
    rootCertB64Url: pemToB64Url(rootPem),
    leafPrivatePem: leafKeyPem,
    leafSerialLower: leafCert.serialNumber.toLowerCase(),
  };

  // Spin up an impersonating revocation endpoint. The Apple endpoint
  // accepts POST { "serial_numbers": [...] } and returns
  // { "revoked": [...] }. Match that shape exactly so the production
  // code path runs unchanged.
  revocationServer = createServer((req, res) => {
    serverHits += 1;
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let serials: string[] = [];
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (parsed && Array.isArray(parsed.serial_numbers)) {
          serials = parsed.serial_numbers
            .filter((entry: unknown): entry is string => typeof entry === "string")
            .map((entry: string) => entry.toLowerCase());
        }
      } catch {
        serials = [];
      }
      const revoked = serials.filter((s) => revokedSerials.has(s));
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ revoked }));
    });
  });
  await new Promise<void>((resolve) => {
    revocationServer!.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = revocationServer.address() as AddressInfo;
  revocationServerUrl = `http://127.0.0.1:${addr.port}/v1/revoked-list`;
});

afterAll(async () => {
  if (revocationServer) {
    await new Promise<void>((resolve) => {
      revocationServer!.close(() => resolve());
    });
    revocationServer = null;
  }
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

const ENV_KEYS = [
  "NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH",
  "NEOTOMA_AAUTH_ATTESTATION_CA_PATH",
  "NEOTOMA_AAUTH_REVOCATION_MODE",
  "NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN",
  "NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS",
  "NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS",
  "NEOTOMA_AAUTH_APPLE_REVOCATION_URL",
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
  resetRevocationCacheForTests();
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

interface BuiltEnvelope {
  jwtRaw: string;
  jkt: string;
  iat: number;
  iss: string;
  sub: string;
}

async function buildAppleSeEnvelope(sub: string): Promise<BuiltEnvelope> {
  const iss = "https://issuer.example";
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
      jwk: { kty: "EC", crv: "P-256", alg: "ES256" },
      attestation: {
        format: "apple-secure-enclave",
        statement: {
          attestation_chain: [
            fixture!.leafCertB64Url,
            fixture!.rootCertB64Url,
          ],
          signature: sig,
        },
        challenge,
      },
    },
  });
  return { jwtRaw, jkt, iat, iss, sub };
}

describe("AAuth attestation revocation end-to-end", () => {
  const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    verifyMock.mockReset();
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    revokedSerials.clear();
    serverHits = 0;
    resetAttestationTrustConfigCacheForTests();
    resetOperatorAllowlistCacheForTests();
    resetRevocationCacheForTests();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const v = originalEnv[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetAttestationTrustConfigCacheForTests();
    resetOperatorAllowlistCacheForTests();
    resetRevocationCacheForTests();
  });

  it("enforce + revoked serial demotes hardware to software with reason=revoked", async () => {
    if (!fixture || !revocationServerUrl) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_AAUTH_REVOCATION_MODE: "enforce",
      NEOTOMA_AAUTH_APPLE_REVOCATION_URL: revocationServerUrl,
    });
    revokedSerials.add(fixture.leafSerialLower);

    const env = await buildAppleSeEnvelope("agent:revoked-enforce");
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: env.jkt,
      created: env.iat,
      jwt: { header: {}, payload: {}, raw: env.jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(serverHits).toBeGreaterThan(0);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("software");
    expect(decision?.attestation).toMatchObject({
      verified: false,
      format: "apple-secure-enclave",
      reason: "revoked",
      revocation: {
        checked: true,
        status: "revoked",
        source: "apple",
        mode: "enforce",
        demoted: true,
      },
    });
  });

  it("log_only + revoked serial keeps hardware tier and surfaces diagnostic", async () => {
    if (!fixture || !revocationServerUrl) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_AAUTH_REVOCATION_MODE: "log_only",
      NEOTOMA_AAUTH_APPLE_REVOCATION_URL: revocationServerUrl,
    });
    revokedSerials.add(fixture.leafSerialLower);

    const env = await buildAppleSeEnvelope("agent:revoked-log-only");
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: env.jkt,
      created: env.iat,
      jwt: { header: {}, payload: {}, raw: env.jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(serverHits).toBeGreaterThan(0);
    const decision = getAttributionDecisionFromRequest(req);
    // log_only never demotes; the chain still verifies, hardware is the
    // resolved tier, and the diagnostic carries the revocation evidence
    // so operators can audit before flipping to enforce.
    expect(decision?.resolved_tier).toBe("hardware");
    expect(decision?.attestation).toMatchObject({
      verified: true,
      format: "apple-secure-enclave",
      revocation: {
        checked: true,
        status: "revoked",
        source: "apple",
        mode: "log_only",
        demoted: false,
      },
    });
  });

  it("disabled mode skips the lookup entirely (no socket open, no diagnostic)", async () => {
    if (!fixture || !revocationServerUrl) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_AAUTH_REVOCATION_MODE: "disabled",
      NEOTOMA_AAUTH_APPLE_REVOCATION_URL: revocationServerUrl,
    });
    revokedSerials.add(fixture.leafSerialLower);

    const env = await buildAppleSeEnvelope("agent:revoked-disabled");
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: env.jkt,
      created: env.iat,
      jwt: { header: {}, payload: {}, raw: env.jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(serverHits).toBe(0);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("hardware");
    // Disabled mode intentionally omits the diagnostic so operators can
    // tell "we never checked" apart from "we checked and got `good`".
    expect(decision?.attestation).toEqual({
      verified: true,
      format: "apple-secure-enclave",
    });
  });

  it("enforce + good serial leaves hardware tier intact with status=good diagnostic", async () => {
    if (!fixture || !revocationServerUrl) return;
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: fixture.rootPemPath,
      NEOTOMA_AAUTH_REVOCATION_MODE: "enforce",
      NEOTOMA_AAUTH_APPLE_REVOCATION_URL: revocationServerUrl,
    });
    // No serials in the revoked set; the leaf is "good".

    const env = await buildAppleSeEnvelope("agent:good-enforce");
    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: env.jkt,
      created: env.iat,
      jwt: { header: {}, payload: {}, raw: env.jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();
    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(serverHits).toBeGreaterThan(0);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("hardware");
    expect(decision?.attestation).toMatchObject({
      verified: true,
      format: "apple-secure-enclave",
      revocation: {
        checked: true,
        status: "good",
        source: "apple",
        mode: "enforce",
        demoted: false,
      },
    });
  });
});
