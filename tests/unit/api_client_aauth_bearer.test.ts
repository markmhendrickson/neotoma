/**
 * With an AAuth keypair configured, the API client sends the request signature
 * as the only credential: a bearer passed as `token` (the CLI resolves it from
 * NEOTOMA_BEARER_TOKEN or the stored login) is withheld unless the caller asks
 * for it explicitly. An environment variable that turns signing off while a key
 * is configured makes the request refuse rather than go out unsigned.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";

import {
  CliAAuthDisabledWithKeyError,
  createApiClient,
  setExplicitBearerRequested,
} from "../../src/shared/api_client.js";

const TOKEN = "test-bearer-value";

interface Captured {
  authorization?: string;
  signature?: string;
  signatureKey?: string;
}

const ENV_KEYS = [
  "NEOTOMA_AAUTH_PRIVATE_JWK_PATH",
  "NEOTOMA_AAUTH_SUB",
  "NEOTOMA_CLI_AAUTH_DISABLE",
  "NEOTOMA_CLI_AAUTH_ENABLE",
  "NEOTOMA_FORCE_LOCAL_TRANSPORT",
  "NEOTOMA_ENABLE_OFFLINE_FALLBACK",
] as const;

describe("API client: bearer beside an AAuth signature", () => {
  const tmpDir = path.join(os.tmpdir(), `neotoma-aauth-bearer-${randomUUID()}`);
  const keyPath = path.join(tmpDir, "private.jwk");
  const missingKeyPath = path.join(tmpDir, "absent.jwk");
  const saved: Record<string, string | undefined> = {};
  let server: http.Server;
  let baseUrl: string;
  let captured: Captured[];

  beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.NEOTOMA_AAUTH_SUB = "bearer-test@example.invalid";
    mkdirSync(tmpDir, { recursive: true });
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = (await exportJWK(privateKey)) as Record<string, unknown>;
    jwk.alg = "ES256";
    jwk.kid = "bearer-test-kid";
    writeFileSync(keyPath, JSON.stringify(jwk), { mode: 0o600 });

    captured = [];
    server = http.createServer((req, res) => {
      captured.push({
        authorization: req.headers.authorization,
        signature: req.headers.signature as string | undefined,
        signatureKey: req.headers["signature-key"] as string | undefined,
      });
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ user_id: "u" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    setExplicitBearerRequested(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function call(options: Parameters<typeof createApiClient>[0]): Promise<Captured> {
    const api = createApiClient({ baseUrl, token: TOKEN, ...options });
    await api.POST("/get_authenticated_user" as any, { body: {} });
    expect(captured).toHaveLength(1);
    return captured[0];
  }

  it("key configured: sends the signature and withholds the bearer", async () => {
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = keyPath;
    const seen = await call({ signWithCliAAuth: true });
    expect(seen.signature).toBeTruthy();
    expect(seen.signatureKey).toBeTruthy();
    expect(seen.authorization).toBeUndefined();
  });

  it("key configured + allowBearerWithSignature: sends both", async () => {
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = keyPath;
    const seen = await call({ signWithCliAAuth: true, allowBearerWithSignature: true });
    expect(seen.signature).toBeTruthy();
    expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("key configured + explicit CLI request (--with-bearer): sends both", async () => {
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = keyPath;
    setExplicitBearerRequested(true);
    const seen = await call({ signWithCliAAuth: true });
    expect(seen.signature).toBeTruthy();
    expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("key configured but unusable: the unsigned fallback also withholds the bearer", async () => {
    writeFileSync(keyPath, "{not json", { mode: 0o600 });
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = keyPath;
    const seen = await call({ signWithCliAAuth: true });
    expect(seen.signature).toBeUndefined();
    expect(seen.authorization).toBeUndefined();
  });

  it("no key configured: the bearer is sent unchanged", async () => {
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = missingKeyPath;
    const seen = await call({ signWithCliAAuth: true });
    expect(seen.signature).toBeUndefined();
    expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
  });

  for (const [name, value] of [
    ["NEOTOMA_CLI_AAUTH_DISABLE", "1"],
    ["NEOTOMA_CLI_AAUTH_ENABLE", "0"],
  ] as const) {
    it(`${name}=${value} + key configured: refuses and sends nothing`, async () => {
      process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = keyPath;
      process.env[name] = value;
      const api = createApiClient({ baseUrl, token: TOKEN });
      await expect(api.POST("/get_authenticated_user" as any, { body: {} })).rejects.toThrow(
        CliAAuthDisabledWithKeyError
      );
      expect(captured).toHaveLength(0);
    });
  }

  it("disable variable + key + explicit bearer request: sends the bearer, unsigned", async () => {
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = keyPath;
    process.env.NEOTOMA_CLI_AAUTH_DISABLE = "1";
    setExplicitBearerRequested(true);
    const seen = await call({});
    expect(seen.signature).toBeUndefined();
    expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("disable variable + no key: the bearer is sent unchanged", async () => {
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = missingKeyPath;
    process.env.NEOTOMA_CLI_AAUTH_DISABLE = "1";
    const seen = await call({});
    expect(seen.signature).toBeUndefined();
    expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("an explicit signWithCliAAuth: false is not refused by the disable variable", async () => {
    // Callers that decide signing themselves (e.g. the issues service's
    // deliberate unsigned guest retry) are not subject to the env refusal.
    process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = keyPath;
    process.env.NEOTOMA_CLI_AAUTH_DISABLE = "1";
    const seen = await call({ signWithCliAAuth: false });
    expect(seen.signature).toBeUndefined();
    expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
  });
});
