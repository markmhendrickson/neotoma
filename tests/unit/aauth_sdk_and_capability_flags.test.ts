/**
 * Unit tests for two pieces of the observer-wire surface (#265, #266):
 *
 *   - `parseCapabilityFlags` in src/cli/index.ts — parses repeated
 *     `--capability <op>:<types>` flags used by `neotoma auth keygen --register`.
 *   - `loadSignerConfig` in src/sdk/aauth.ts — public SDK that lets external
 *     Node observers load a signing config from an inline JWK, a key path,
 *     or fall back to the default CLI config.
 *
 * Pure-function tests: no DB, no HTTP. Filesystem use is limited to a tmp
 * dir for the on-disk key fixture.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseCapabilityFlags } from "../../src/cli/index.ts";
import { loadSignerConfig } from "../../src/sdk/aauth.ts";

// ---------------------------------------------------------------------------
// parseCapabilityFlags
// ---------------------------------------------------------------------------

describe("parseCapabilityFlags", () => {
  it("parses a single op:types flag", () => {
    expect(parseCapabilityFlags(["store:issue,observation"])).toEqual([
      { op: "store", entity_types: ["issue", "observation"] },
    ]);
  });

  it("supports wildcard entity types", () => {
    expect(parseCapabilityFlags(["retrieve:*"])).toEqual([
      { op: "retrieve", entity_types: ["*"] },
    ]);
  });

  it("parses multiple flags into multiple entries", () => {
    expect(
      parseCapabilityFlags(["store:issue", "retrieve:*", "correct:plan,task"])
    ).toEqual([
      { op: "store", entity_types: ["issue"] },
      { op: "retrieve", entity_types: ["*"] },
      { op: "correct", entity_types: ["plan", "task"] },
    ]);
  });

  it("trims whitespace around op and each entity type", () => {
    expect(parseCapabilityFlags(["  store :  issue ,  observation  "])).toEqual([
      { op: "store", entity_types: ["issue", "observation"] },
    ]);
  });

  it("rejects flags without a colon", () => {
    expect(() => parseCapabilityFlags(["store"])).toThrow(/expected "<op>:<entity_types_csv>"/);
  });

  it("rejects flags with empty op", () => {
    expect(() => parseCapabilityFlags([":issue"])).toThrow(/op is empty/);
  });

  it("rejects flags with empty types list", () => {
    expect(() => parseCapabilityFlags(["store:"])).toThrow(/entity_types list is empty/);
    expect(() => parseCapabilityFlags(["store: , "])).toThrow(/entity_types list is empty/);
  });

  it("returns an empty array for no flags", () => {
    expect(parseCapabilityFlags([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadSignerConfig (SDK export)
// ---------------------------------------------------------------------------

describe("loadSignerConfig (sdk/aauth)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-aauth-sdk-test-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns a config built from an inline privateJwk + sub/iss", async () => {
    const privateJwk = {
      kty: "OKP",
      crv: "Ed25519",
      d: "fakeprivate",
      x: "fakepublic",
      alg: "EdDSA",
      kid: "thumb-abc",
    };
    const cfg = await loadSignerConfig({
      privateJwk,
      sub: "lemonbrand-observer@host",
      iss: "https://neotoma.cursor.local",
    });
    expect(cfg).not.toBeNull();
    expect(cfg!.privateJwk).toEqual(privateJwk);
    expect(cfg!.sub).toBe("lemonbrand-observer@host");
    expect(cfg!.iss).toBe("https://neotoma.cursor.local");
    expect(cfg!.kid).toBe("thumb-abc");
    expect(cfg!.tokenTtlSec).toBe(300);
  });

  it("defaults iss to https://neotoma.cursor.local when omitted", async () => {
    const cfg = await loadSignerConfig({
      privateJwk: { kty: "OKP", crv: "Ed25519", d: "x", x: "y", alg: "EdDSA" },
      sub: "agent@host",
    });
    expect(cfg!.iss).toBe("https://neotoma.cursor.local");
  });

  it("reads a key from disk when keyPath is supplied", async () => {
    const keyPath = path.join(tmpRoot, "private.jwk");
    const jwk = {
      kty: "OKP",
      crv: "Ed25519",
      d: "diskprivate",
      x: "diskpublic",
      alg: "EdDSA",
      kid: "from-disk",
    };
    writeFileSync(keyPath, JSON.stringify(jwk));

    const cfg = await loadSignerConfig({
      keyPath,
      sub: "disk-agent@host",
    });
    expect(cfg!.privateJwk).toEqual(jwk);
    expect(cfg!.kid).toBe("from-disk");
  });

  it("requires sub when supplying an explicit key", async () => {
    await expect(
      loadSignerConfig({
        privateJwk: { kty: "OKP", crv: "Ed25519", d: "x", x: "y", alg: "EdDSA" },
      })
    ).rejects.toThrow(/`sub` is required/);
  });

  it("refuses both privateJwk and keyPath together", async () => {
    await expect(
      loadSignerConfig({
        privateJwk: { kty: "OKP", crv: "Ed25519", d: "x", x: "y", alg: "EdDSA" },
        keyPath: path.join(tmpRoot, "ignored.jwk"),
        sub: "agent@host",
      })
    ).rejects.toThrow(/pass either `privateJwk` or `keyPath`, not both/);
  });

  it("honours an explicit tokenTtlSec override", async () => {
    const cfg = await loadSignerConfig({
      privateJwk: { kty: "OKP", crv: "Ed25519", d: "x", x: "y", alg: "EdDSA" },
      sub: "agent@host",
      tokenTtlSec: 60,
    });
    expect(cfg!.tokenTtlSec).toBe(60);
  });
});
