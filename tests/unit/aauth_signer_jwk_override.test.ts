/**
 * Unit tests for the per-agent JWK path override on the CLI AAuth signer.
 *
 * `NEOTOMA_AAUTH_PRIVATE_JWK_PATH` lets a per-agent caller (e.g. a swarm daemon)
 * sign as its own identity instead of the shared `~/.neotoma/aauth/private.jwk`.
 * Mirrors the override the proxy signer already supports.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ENV_KEY = "NEOTOMA_AAUTH_PRIVATE_JWK_PATH";

describe("CLI AAuth per-agent JWK override", () => {
  const tmpDir = path.join(os.tmpdir(), `neotoma-aauth-override-${randomUUID()}`);
  const agentKeyPath = path.join(tmpDir, "apus.private.jwk");
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env[ENV_KEY];
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedEnv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults to the shared keypair path when the env var is unset", async () => {
    delete process.env[ENV_KEY];
    const { resolveCliPrivateJwkPath, AAUTH_PRIVATE_JWK_PATH } = await import(
      "../../src/cli/aauth_signer.js"
    );
    expect(resolveCliPrivateJwkPath()).toBe(AAUTH_PRIVATE_JWK_PATH);
  });

  it("honors an absolute override path", async () => {
    process.env[ENV_KEY] = agentKeyPath;
    const { resolveCliPrivateJwkPath } = await import("../../src/cli/aauth_signer.js");
    expect(resolveCliPrivateJwkPath()).toBe(agentKeyPath);
  });

  it("resolves a relative override against the cwd", async () => {
    process.env[ENV_KEY] = "keys/apus.private.jwk";
    const { resolveCliPrivateJwkPath } = await import("../../src/cli/aauth_signer.js");
    expect(resolveCliPrivateJwkPath()).toBe(path.resolve(process.cwd(), "keys/apus.private.jwk"));
  });

  it("loadCliSignerConfig + hasCliAAuthKeypair read the overridden key", async () => {
    const { generateKeyPair, exportJWK } = await import("jose");
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = (await exportJWK(privateKey)) as Record<string, unknown>;
    jwk.alg = "ES256";
    jwk.kid = "apus-test-kid";
    writeFileSync(agentKeyPath, JSON.stringify(jwk), { mode: 0o600 });

    // A per-agent caller sets the path override + the claim overrides together,
    // so its identity does not inherit the default ~/.neotoma/aauth/config.json.
    process.env[ENV_KEY] = agentKeyPath;
    process.env.NEOTOMA_AAUTH_SUB = "apus@ateles-swarm";
    process.env.NEOTOMA_AAUTH_KID = "apus-test-kid";
    const mod = await import("../../src/cli/aauth_signer.js");
    try {
      expect(await mod.hasCliAAuthKeypair()).toBe(true);
      const cfg = await mod.loadCliSignerConfig();
      expect(cfg).not.toBeNull();
      expect(cfg!.sub).toBe("apus@ateles-swarm");
      expect(cfg!.kid).toBe("apus-test-kid");
      // privateJwk comes straight from the overridden key file — proves the
      // override (not the shared key) was loaded.
      expect(cfg!.privateJwk.kid).toBe("apus-test-kid");
    } finally {
      delete process.env.NEOTOMA_AAUTH_SUB;
      delete process.env.NEOTOMA_AAUTH_KID;
    }
  });

  it("returns null (signing disabled) when the overridden key is absent", async () => {
    process.env[ENV_KEY] = path.join(tmpDir, "does-not-exist.jwk");
    const { loadCliSignerConfig, hasCliAAuthKeypair } = await import("../../src/cli/aauth_signer.js");
    expect(await hasCliAAuthKeypair()).toBe(false);
    expect(await loadCliSignerConfig()).toBeNull();
  });
});
