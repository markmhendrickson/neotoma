/**
 * Unit tests for `src/services/aauth_attestation_revocation.ts`.
 *
 * Covers env-driven mode/timeout/TTL parsing, cache hit/miss behaviour,
 * and format-aware dispatch (Apple endpoint vs OCSP vs CRL fallback).
 * The fetcher is injected through the call-site `RevocationCheckContext`
 * so the tests never touch the network.
 */

import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { X509Certificate } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkRevocation,
  getRevocationCacheSizeForTests,
  readCacheTtlMs,
  readFailOpen,
  readRevocationMode,
  readTimeoutMs,
  resetRevocationCacheForTests,
  type RevocationFetcher,
} from "../../src/services/aauth_attestation_revocation.js";

let leafCert: X509Certificate | null = null;
let tmpRoot: string | null = null;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "neotoma-aauth-revocation-"));
  // Generate a self-signed leaf using openssl. The cert has no AIA or
  // CDP extensions, which is the shape the no-endpoint test expects.
  try {
    execSync(
      [
        `cd ${tmpRoot}`,
        "openssl ecparam -name prime256v1 -genkey -noout -out leaf.key",
        "openssl req -new -x509 -key leaf.key -days 3650 -out leaf.crt -subj /CN=NeotomaTestRevocationLeaf",
      ].join(" && "),
      { stdio: "ignore" },
    );
    const pem = readFileSync(join(tmpRoot, "leaf.crt"), "utf8");
    leafCert = new X509Certificate(pem);
  } catch {
    leafCert = null;
  }
});

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  resetRevocationCacheForTests();
  delete process.env.NEOTOMA_AAUTH_REVOCATION_MODE;
  delete process.env.NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS;
  delete process.env.NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS;
  delete process.env.NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN;
  delete process.env.NEOTOMA_AAUTH_APPLE_REVOCATION_URL;
});

function requireLeaf(): X509Certificate {
  if (!leafCert) {
    throw new Error(
      "openssl unavailable; cannot generate test fixture cert",
    );
  }
  return leafCert;
}

function fixedFetcher(
  output: Awaited<ReturnType<RevocationFetcher["fetch"]>>,
): { fetcher: RevocationFetcher; calls: Array<unknown> } {
  const calls: Array<unknown> = [];
  return {
    fetcher: {
      async fetch(input) {
        calls.push(input);
        return output;
      },
    },
    calls,
  };
}

describe("readRevocationMode", () => {
  it("defaults to disabled when env unset", () => {
    expect(readRevocationMode({} as NodeJS.ProcessEnv)).toBe("disabled");
  });

  it("accepts the three documented modes", () => {
    expect(
      readRevocationMode({
        NEOTOMA_AAUTH_REVOCATION_MODE: "log_only",
      } as NodeJS.ProcessEnv),
    ).toBe("log_only");
    expect(
      readRevocationMode({
        NEOTOMA_AAUTH_REVOCATION_MODE: "enforce",
      } as NodeJS.ProcessEnv),
    ).toBe("enforce");
    expect(
      readRevocationMode({
        NEOTOMA_AAUTH_REVOCATION_MODE: "DISABLED",
      } as NodeJS.ProcessEnv),
    ).toBe("disabled");
  });

  it("falls back to disabled on unknown values", () => {
    expect(
      readRevocationMode({
        NEOTOMA_AAUTH_REVOCATION_MODE: "loud",
      } as NodeJS.ProcessEnv),
    ).toBe("disabled");
  });
});

describe("readCacheTtlMs / readTimeoutMs / readFailOpen", () => {
  it("uses defaults when env unset", () => {
    expect(readCacheTtlMs({} as NodeJS.ProcessEnv)).toBe(60 * 60 * 1000);
    expect(readTimeoutMs({} as NodeJS.ProcessEnv)).toBe(1500);
    expect(readFailOpen({} as NodeJS.ProcessEnv)).toBe(true);
  });

  it("normalises malformed env values to defaults", () => {
    expect(
      readCacheTtlMs({
        NEOTOMA_AAUTH_REVOCATION_CACHE_TTL_SECONDS: "abc",
      } as NodeJS.ProcessEnv),
    ).toBe(60 * 60 * 1000);
    expect(
      readTimeoutMs({
        NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS: "abc",
      } as NodeJS.ProcessEnv),
    ).toBe(1500);
  });

  it("clamps timeouts to a 100ms floor", () => {
    expect(
      readTimeoutMs({
        NEOTOMA_AAUTH_REVOCATION_TIMEOUT_MS: "10",
      } as NodeJS.ProcessEnv),
    ).toBe(100);
  });

  it("treats false-y string values as fail-closed", () => {
    expect(
      readFailOpen({
        NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      readFailOpen({
        NEOTOMA_AAUTH_REVOCATION_FAIL_OPEN: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("checkRevocation — disabled mode", () => {
  it("short-circuits without calling the fetcher", async () => {
    const cert = requireLeaf();
    const { fetcher, calls } = fixedFetcher({
      ok: true,
      status: 200,
      body: Buffer.alloc(0),
    });
    const out = await checkRevocation({
      chain: [cert],
      format: "apple-secure-enclave",
      modeOverride: "disabled",
      fetcher,
    });
    expect(out).toEqual({ status: "good", source: "disabled" });
    expect(calls).toHaveLength(0);
  });
});

describe("checkRevocation — Apple endpoint", () => {
  it("flags a serial that appears in the revoked list", async () => {
    const cert = requireLeaf();
    const serial = cert.serialNumber.toLowerCase();
    const { fetcher } = fixedFetcher({
      ok: true,
      status: 200,
      body: Buffer.from(JSON.stringify({ revoked: [serial] }), "utf8"),
    });
    const out = await checkRevocation({
      chain: [cert],
      format: "apple-secure-enclave",
      modeOverride: "enforce",
      fetcher,
    });
    expect(out.status).toBe("revoked");
    expect(out.source).toBe("apple");
  });

  it("returns good when the serial is not present", async () => {
    const cert = requireLeaf();
    const { fetcher } = fixedFetcher({
      ok: true,
      status: 200,
      body: Buffer.from(
        JSON.stringify({ revoked: ["deadbeef"] }),
        "utf8",
      ),
    });
    const out = await checkRevocation({
      chain: [cert],
      format: "apple-secure-enclave",
      modeOverride: "log_only",
      fetcher,
    });
    expect(out.status).toBe("good");
    expect(out.source).toBe("apple");
  });

  it("maps a non-2xx HTTP response to unknown", async () => {
    const cert = requireLeaf();
    const { fetcher } = fixedFetcher({
      ok: false,
      status: 503,
      body: Buffer.alloc(0),
    });
    const out = await checkRevocation({
      chain: [cert],
      format: "apple-secure-enclave",
      modeOverride: "enforce",
      fetcher,
    });
    expect(out.status).toBe("unknown");
    expect(out.source).toBe("apple");
    expect(out.detail).toBe("http_503");
  });

  it("maps a fetcher error to unknown", async () => {
    const cert = requireLeaf();
    const { fetcher } = fixedFetcher({
      ok: false,
      status: 0,
      body: Buffer.alloc(0),
      error: "ETIMEDOUT",
    });
    const out = await checkRevocation({
      chain: [cert],
      format: "apple-secure-enclave",
      modeOverride: "enforce",
      fetcher,
    });
    expect(out.status).toBe("unknown");
    expect(out.detail).toContain("ETIMEDOUT");
  });
});

describe("checkRevocation — webauthn-packed (no AIA/CDP)", () => {
  it("returns no_endpoint when the leaf has no AIA or CDP", async () => {
    const cert = requireLeaf();
    const { fetcher, calls } = fixedFetcher({
      ok: true,
      status: 200,
      body: Buffer.alloc(0),
    });
    const out = await checkRevocation({
      chain: [cert],
      format: "webauthn-packed",
      modeOverride: "enforce",
      fetcher,
    });
    expect(out.status).toBe("unknown");
    expect(out.source).toBe("no_endpoint");
    expect(calls).toHaveLength(0);
  });
});

describe("checkRevocation — cache behaviour", () => {
  it("caches outcomes so repeated calls hit memory only", async () => {
    const cert = requireLeaf();
    const { fetcher, calls } = fixedFetcher({
      ok: true,
      status: 200,
      body: Buffer.from(JSON.stringify({ revoked: [] }), "utf8"),
    });
    const first = await checkRevocation({
      chain: [cert],
      format: "apple-secure-enclave",
      modeOverride: "log_only",
      fetcher,
    });
    expect(first.source).toBe("apple");
    const second = await checkRevocation({
      chain: [cert],
      format: "apple-secure-enclave",
      modeOverride: "log_only",
      fetcher,
    });
    expect(second.source).toBe("cache");
    expect(calls).toHaveLength(1);
    expect(getRevocationCacheSizeForTests()).toBe(1);
  });
});

describe("checkRevocation — empty chain", () => {
  it("returns unknown/no_endpoint for an empty chain", async () => {
    const { fetcher } = fixedFetcher({
      ok: true,
      status: 200,
      body: Buffer.alloc(0),
    });
    const out = await checkRevocation({
      chain: [],
      format: "tpm2",
      modeOverride: "enforce",
      fetcher,
    });
    expect(out.status).toBe("unknown");
    expect(out.source).toBe("no_endpoint");
    expect(out.detail).toBe("empty_chain");
  });
});
