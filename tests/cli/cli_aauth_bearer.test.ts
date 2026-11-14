/**
 * End-to-end through the built CLI: with an AAuth key configured, a generic
 * command (`auth whoami`) sends the request signature as its only credential.
 * The bearer the CLI resolves (NEOTOMA_BEARER_TOKEN, else the stored login in
 * ~/.config/neotoma/config.json) is added only with the explicit
 * `--with-bearer` flag. An environment variable that turns signing off while a
 * key is configured makes the command refuse before any request is sent.
 *
 * The CLI talks to a capture server on loopback, never to a Neotoma instance.
 * HOME is a temp directory, so the stored login and user env are the test's own.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportJWK, generateKeyPair } from "jose";

import { execFileLocal, localCliEnv } from "../helpers/cli_local_target.js";

const CLI = path.resolve("dist/cli/index.js");
const ENV_TOKEN = "env-bearer-test-value";
const STORED_TOKEN = "stored-bearer-test-value";

interface Captured {
  authorization?: string;
  signature?: string;
}

describe("CLI: bearer beside an AAuth signature", () => {
  let root: string;
  let keyPath: string;
  let server: http.Server;
  let baseUrl: string;
  let captured: Captured[] = [];

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "neotoma-cli-aauth-bearer-"));
    keyPath = path.join(root, "private.jwk");
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = (await exportJWK(privateKey)) as Record<string, unknown>;
    jwk.alg = "ES256";
    jwk.kid = "cli-bearer-test-kid";
    writeFileSync(keyPath, JSON.stringify(jwk), { mode: 0o600 });

    server = http.createServer((req, res) => {
      captured.push({
        authorization: req.headers.authorization,
        signature: req.headers.signature as string | undefined,
      });
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ user_id: "capture-user" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    captured = [];
  });

  /** A fresh HOME per case; `storedToken` writes the CLI's stored login there. */
  function childEnv(opts: {
    key: boolean;
    envToken?: string;
    storedToken?: string;
    extra?: Record<string, string>;
  }): NodeJS.ProcessEnv {
    const home = mkdtempSync(path.join(root, "home-"));
    if (opts.storedToken) {
      mkdirSync(path.join(home, ".config", "neotoma"), { recursive: true });
      writeFileSync(
        path.join(home, ".config", "neotoma", "config.json"),
        JSON.stringify({ access_token: opts.storedToken })
      );
    }
    const env = localCliEnv({ ...process.env });
    for (const k of [
      "NEOTOMA_BEARER_TOKEN",
      "NEOTOMA_BASE_URL",
      "NEOTOMA_CLI_AAUTH_DISABLE",
      "NEOTOMA_CLI_AAUTH_ENABLE",
      "NEOTOMA_FORCE_LOCAL_TRANSPORT",
      "NEOTOMA_KEY_FILE_PATH",
      "NEOTOMA_MNEMONIC",
    ]) {
      delete env[k];
    }
    return {
      ...env,
      HOME: home,
      // Signing defaults on outside NODE_ENV=test; the CLI must behave as it
      // does for a user here.
      NODE_ENV: "development",
      NEOTOMA_DATA_DIR: path.join(home, "data"),
      NO_UPDATE_NOTIFIER: "1",
      NEOTOMA_AAUTH_SUB: "cli-bearer-test@example.invalid",
      NEOTOMA_AAUTH_PRIVATE_JWK_PATH: opts.key ? keyPath : path.join(root, "absent.jwk"),
      ...(opts.envToken ? { NEOTOMA_BEARER_TOKEN: opts.envToken } : {}),
      ...(opts.extra ?? {}),
    };
  }

  async function whoami(
    env: NodeJS.ProcessEnv,
    flags: string[] = []
  ): Promise<{ ok: boolean; stderr: string }> {
    try {
      await execFileLocal(
        "node",
        [
          CLI,
          "--base-url",
          baseUrl,
          "--api-only",
          "--json",
          "--no-log-file",
          "--no-update-check",
          ...flags,
          "auth",
          "whoami",
        ],
        { env, cwd: root, timeout: 60_000 }
      );
      return { ok: true, stderr: "" };
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      return { ok: false, stderr: `${e.stderr ?? ""}${e.stdout ?? ""}${e.message ?? ""}` };
    }
  }

  it("key + env bearer: signature only", async () => {
    const result = await whoami(childEnv({ key: true, envToken: ENV_TOKEN }));
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].signature).toBeTruthy();
    expect(captured[0].authorization).toBeUndefined();
  }, 90_000);

  it("key + stored bearer: signature only", async () => {
    const result = await whoami(childEnv({ key: true, storedToken: STORED_TOKEN }));
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].signature).toBeTruthy();
    expect(captured[0].authorization).toBeUndefined();
  }, 90_000);

  it("key + env bearer + --with-bearer: signature and bearer", async () => {
    const result = await whoami(childEnv({ key: true, envToken: ENV_TOKEN }), ["--with-bearer"]);
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].signature).toBeTruthy();
    expect(captured[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
  }, 90_000);

  it("key + NEOTOMA_CLI_AAUTH_DISABLE=1: refuses before sending", async () => {
    const result = await whoami(
      childEnv({ key: true, envToken: ENV_TOKEN, extra: { NEOTOMA_CLI_AAUTH_DISABLE: "1" } })
    );
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("NEOTOMA_CLI_AAUTH_DISABLE=1");
    expect(result.stderr).toContain("--with-bearer");
    expect(captured).toHaveLength(0);
  }, 90_000);

  it("key + NEOTOMA_CLI_AAUTH_DISABLE=1 + --with-bearer: bearer, unsigned", async () => {
    const result = await whoami(
      childEnv({ key: true, envToken: ENV_TOKEN, extra: { NEOTOMA_CLI_AAUTH_DISABLE: "1" } }),
      ["--with-bearer"]
    );
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].signature).toBeUndefined();
    expect(captured[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
  }, 90_000);

  it("no key + env bearer: bearer unchanged", async () => {
    const result = await whoami(childEnv({ key: false, envToken: ENV_TOKEN }));
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].signature).toBeUndefined();
    expect(captured[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
  }, 90_000);

  it("no key + stored bearer: bearer unchanged", async () => {
    const result = await whoami(childEnv({ key: false, storedToken: STORED_TOKEN }));
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].signature).toBeUndefined();
    expect(captured[0].authorization).toBe(`Bearer ${STORED_TOKEN}`);
  }, 90_000);
});
