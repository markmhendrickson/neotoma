/**
 * Unit tests for `src/services/aauth_attestation_trust_config.ts`.
 *
 * Covers bundled-root loading, operator CA file/directory loading, AAGUID
 * allowlist parsing, and the fail-open semantics (missing or malformed
 * env-var inputs become diagnostics, not throws). Uses the bundled Apple
 * root that ships in the repository as a stable, real-world fixture.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadAttestationTrustConfig,
  resetAttestationTrustConfigCacheForTests,
} from "../../src/services/aauth_attestation_trust_config.js";

const ENV_KEYS = [
  "NEOTOMA_AAUTH_ATTESTATION_CA_PATH",
  "NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH",
  "NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH",
] as const;

const BUNDLED_APPLE_ROOT_PEM = readFileSync(
  resolve(process.cwd(), "config/aauth/apple_attestation_root.pem"),
  "utf8",
);

let tmpRoot: string;
const original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
): void {
  for (const key of ENV_KEYS) {
    if (!(key in values)) continue;
    const v = values[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  resetAttestationTrustConfigCacheForTests();
}

/** Returns a known-valid self-signed PEM (the bundled Apple root). */
function makeKnownGoodPem(): string {
  return BUNDLED_APPLE_ROOT_PEM;
}

/**
 * Two distinct self-signed test certificates generated with openssl.
 * Stable across runs so trust-set sizes can be asserted exactly. Used
 * when the test needs more than one root in the pool (e.g. operator CA
 * append vs dedupe).
 */
const TEST_CA_PEM_1 = `-----BEGIN CERTIFICATE-----
MIIBhzCCAS2gAwIBAgIUfcP9aKkQsZFmjXRIUZF6gpTBVvAwCgYIKoZIzj0EAwIw
GTEXMBUGA1UEAwwOTmVvdG9tYVRlc3RDQTEwHhcNMjYwNDI3MDcxNTA1WhcNMzYw
NDI0MDcxNTA1WjAZMRcwFQYDVQQDDA5OZW90b21hVGVzdENBMTBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABLw6l8j0AJpQw4nEHyz6TardMHY/xiZ1YwWRLhhX3c66
+L8AhEGIYinWHWGGuU8pSylOpNnFId3UPym3meGwhIijUzBRMB0GA1UdDgQWBBQ1
9dwp4OXd6UbyTtKaOqPuf4cnbTAfBgNVHSMEGDAWgBQ19dwp4OXd6UbyTtKaOqPu
f4cnbTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIC4fve4JTn6L
ARPJEVZZretpa77IMlm0v3UnHtYTTrrmAiEA1J/4uHp3XY6ff6FoCgwP9KHVqYsH
rr7XZFBjXQS41Ik=
-----END CERTIFICATE-----
`;

const TEST_CA_PEM_2 = `-----BEGIN CERTIFICATE-----
MIIBhzCCAS2gAwIBAgIUXaW+XtHnbE+WLYOgq5guNXgkdaMwCgYIKoZIzj0EAwIw
GTEXMBUGA1UEAwwOTmVvdG9tYVRlc3RDQTIwHhcNMjYwNDI3MDcxNTA4WhcNMzYw
NDI0MDcxNTA4WjAZMRcwFQYDVQQDDA5OZW90b21hVGVzdENBMjBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABNO/BNWvbskr/dd5YY5KC6ObgDh9sXb4OAJiIsaaLsF9
7HjpQoXOe5/IuazgAKArVow/QhJ1WBRXKUSuFZVtV0ujUzBRMB0GA1UdDgQWBBRo
hNZRIbJyrWfjCOUfD3pQ03AoDDAfBgNVHSMEGDAWgBRohNZRIbJyrWfjCOUfD3pQ
03AoDDAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQCTT7dAu4z5
PfltBPltQnTFKAaZIX53B3jSR2GBMtiavAIgQNosHIkG3bCZeIKqPW4dcM7u9XeQ
OQHrUVvI2c8wga0=
-----END CERTIFICATE-----
`;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-trust-"));
  for (const key of ENV_KEYS) original[key] = process.env[key];
  resetAttestationTrustConfigCacheForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const v = original[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  resetAttestationTrustConfigCacheForTests();
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("loadAttestationTrustConfig — bundled root", () => {
  it("loads the bundled Apple Attestation Root from the repo by default", () => {
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_CA_PATH: undefined,
      NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH: undefined,
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: undefined,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.attestationRoots.length).toBeGreaterThan(0);
    const subjects = cfg.attestationRoots.map((c) => c.subject);
    // The Apple App Attestation Root CA — stable subject string.
    expect(subjects.join("|")).toContain("Apple");
    expect(cfg.webauthnAaguidAllowlist).toEqual([]);
  });

  it("uses NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH when provided", () => {
    const overridePath = join(tmpRoot, "override-root.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.attestationRoots.length).toBe(1);
    expect(cfg.attestationRoots[0].subject).toContain("Apple");
  });

  it("emits a diagnostic when the override path is missing", () => {
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: join(
        tmpRoot,
        "does-not-exist.pem",
      ),
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.attestationRoots.length).toBe(0);
    expect(cfg.diagnostics.join("\n")).toMatch(/failed to load bundled apple root/);
  });
});

describe("loadAttestationTrustConfig — operator CA path", () => {
  it("appends a distinct operator PEM file to the bundled root", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    const opPath = join(tmpRoot, "operator.pem");
    writeFileSync(opPath, TEST_CA_PEM_1, "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
      NEOTOMA_AAUTH_ATTESTATION_CA_PATH: opPath,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.attestationRoots.length).toBe(2);
    const subjects = cfg.attestationRoots.map((c) => c.subject).join("|");
    expect(subjects).toContain("Apple");
    expect(subjects).toContain("NeotomaTestCA1");
  });

  it("deduplicates identical operator PEM bytes against the bundled root", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    const opPath = join(tmpRoot, "operator.pem");
    writeFileSync(opPath, makeKnownGoodPem(), "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
      NEOTOMA_AAUTH_ATTESTATION_CA_PATH: opPath,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.attestationRoots.length).toBe(1);
  });

  it("loads *.pem and *.crt entries from a directory and ignores other files", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    const dir = join(tmpRoot, "operator-cas");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.pem"), TEST_CA_PEM_1, "utf8");
    writeFileSync(join(dir, "b.crt"), TEST_CA_PEM_2, "utf8");
    writeFileSync(join(dir, "ignore.txt"), TEST_CA_PEM_1, "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
      NEOTOMA_AAUTH_ATTESTATION_CA_PATH: dir,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    // bundled (Apple) + 2 distinct operator certs; .txt is ignored.
    expect(cfg.attestationRoots.length).toBe(3);
  });

  it("emits a diagnostic and skips the file when the path is unreadable", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
      NEOTOMA_AAUTH_ATTESTATION_CA_PATH: join(tmpRoot, "nope.pem"),
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.diagnostics.join("\n")).toMatch(
      /failed to load operator CAs/,
    );
    expect(cfg.attestationRoots.length).toBe(1); // bundled still present
  });
});

describe("loadAttestationTrustConfig — AAGUID allowlist", () => {
  it("parses a JSON array of strings into a lowercased allowlist", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    const aaguid = join(tmpRoot, "aaguids.json");
    writeFileSync(
      aaguid,
      JSON.stringify(["AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", " bbbb "]),
      "utf8",
    );
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
      NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH: aaguid,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.webauthnAaguidAllowlist).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbb",
    ]);
  });

  it("emits a diagnostic when the file is malformed JSON", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    const aaguid = join(tmpRoot, "bad.json");
    writeFileSync(aaguid, "{not json", "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
      NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH: aaguid,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.webauthnAaguidAllowlist).toEqual([]);
    expect(cfg.diagnostics.join("\n")).toMatch(/failed to load AAGUID allowlist/);
  });

  it("emits a diagnostic when the JSON is not an array of strings", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    const aaguid = join(tmpRoot, "wrong-shape.json");
    writeFileSync(aaguid, JSON.stringify({ foo: "bar" }), "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
      NEOTOMA_AAUTH_AAGUID_TRUST_LIST_PATH: aaguid,
    });
    const cfg = loadAttestationTrustConfig({ refresh: true });
    expect(cfg.webauthnAaguidAllowlist).toEqual([]);
    expect(cfg.diagnostics.join("\n")).toMatch(
      /did not contain a JSON array of strings/,
    );
  });
});

describe("loadAttestationTrustConfig — caching", () => {
  it("caches across calls until refresh: true is passed", () => {
    const overridePath = join(tmpRoot, "bundled.pem");
    writeFileSync(overridePath, makeKnownGoodPem(), "utf8");
    withEnv({
      NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH: overridePath,
    });
    const a = loadAttestationTrustConfig({ refresh: true });
    const b = loadAttestationTrustConfig();
    expect(b).toBe(a);

    const overridePath2 = join(tmpRoot, "bundled-2.pem");
    writeFileSync(overridePath2, makeKnownGoodPem(), "utf8");
    process.env.NEOTOMA_AAUTH_ATTESTATION_BUNDLED_ROOT_PATH = overridePath2;
    const c = loadAttestationTrustConfig();
    expect(c).toBe(a); // still cached

    const d = loadAttestationTrustConfig({ refresh: true });
    expect(d).not.toBe(a);
  });
});
