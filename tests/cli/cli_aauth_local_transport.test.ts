/**
 * The CLI's default data path for a user: no `--api-only`, NODE_ENV not
 * "test", so `preAction` turns local transport on and the CLI starts its own
 * API child on 127.0.0.1. Requests to that child follow the same credential
 * rule as requests to a remote API: with an AAuth key configured the
 * signature is the only credential, the bearer is added only with
 * `--with-bearer`, and a disable variable with a key configured refuses.
 *
 * The child is the real API server (`dist/actions.js`), which verifies AAuth
 * signatures on every route, so its `GET /session` answer says what arrived:
 * `attribution.decision.signature_verified`. The stored login is a value the
 * child does not accept, so a request that carries it is refused by the child
 * ("Failed to resolve session identity"); a request that succeeds carried no
 * bearer.
 *
 * HOME and the data directory are temp directories; nothing reaches a
 * Neotoma instance other than the child this test's CLI starts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportJWK, generateKeyPair } from "jose";

import { execFileLocal, localCliEnv } from "../helpers/cli_local_target.js";

const CLI = path.resolve("dist/cli/index.js");
const STORED_TOKEN = "stored-bearer-the-child-does-not-accept";
// Nothing listens here: the local transport must not need a remote API.
const UNUSED_BASE_URL = "http://127.0.0.1:9";

interface SessionAnswer {
  _neotoma?: { transport?: string };
  attribution?: { decision?: { signature_present?: boolean; signature_verified?: boolean } };
  error?: string;
}

describe("CLI local transport: bearer beside an AAuth signature", () => {
  let root: string;
  let keyPath: string;

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "neotoma-cli-aauth-local-"));
    keyPath = path.join(root, "private.jwk");
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = (await exportJWK(privateKey)) as Record<string, unknown>;
    jwk.alg = "ES256";
    jwk.kid = "cli-local-transport-test-kid";
    writeFileSync(keyPath, JSON.stringify(jwk), { mode: 0o600 });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function childEnv(opts: { key: boolean; extra?: Record<string, string> }): NodeJS.ProcessEnv {
    const home = mkdtempSync(path.join(root, "home-"));
    mkdirSync(path.join(home, ".config", "neotoma"), { recursive: true });
    writeFileSync(
      path.join(home, ".config", "neotoma", "config.json"),
      JSON.stringify({ access_token: STORED_TOKEN })
    );
    const env = localCliEnv({ ...process.env });
    for (const k of [
      "NEOTOMA_API_ONLY",
      "NEOTOMA_OFFLINE",
      "NEOTOMA_BEARER_TOKEN",
      "NEOTOMA_BASE_URL",
      "NEOTOMA_CLI_AAUTH_DISABLE",
      "NEOTOMA_CLI_AAUTH_ENABLE",
      "NEOTOMA_FORCE_LOCAL_TRANSPORT",
      "NEOTOMA_DISABLE_OFFLINE_FALLBACK",
      "NEOTOMA_KEY_FILE_PATH",
      "NEOTOMA_MNEMONIC",
      "NEOTOMA_AAUTH_AUTHORITY",
      "NEOTOMA_PUBLIC_BASE_URL",
      "NEOTOMA_HOST_URL",
      "NEOTOMA_HTTP_HOST",
      "NEOTOMA_SESSION_ENV",
      "NEOTOMA_CLI_PREFERRED_ENV",
    ]) {
      delete env[k];
    }
    return {
      ...env,
      HOME: home,
      // Not "test": preAction must choose local transport as it does for a user.
      NODE_ENV: "development",
      NEOTOMA_ENV: "development",
      NEOTOMA_DATA_DIR: path.join(home, "data"),
      NO_UPDATE_NOTIFIER: "1",
      NEOTOMA_AAUTH_SUB: "cli-local-transport-test@example.invalid",
      NEOTOMA_AAUTH_PRIVATE_JWK_PATH: opts.key ? keyPath : path.join(root, "absent.jwk"),
      ...(opts.extra ?? {}),
    };
  }

  async function authSession(
    env: NodeJS.ProcessEnv,
    flags: string[] = []
  ): Promise<{ ok: boolean; answer: SessionAnswer; output: string }> {
    try {
      const { stdout } = await execFileLocal(
        "node",
        [
          CLI,
          "--base-url",
          UNUSED_BASE_URL,
          "--json",
          "--no-log-file",
          "--no-update-check",
          ...flags,
          "auth",
          "session",
        ],
        { env, cwd: root, timeout: 120_000 }
      );
      const output = String(stdout);
      return { ok: true, answer: JSON.parse(output.slice(output.indexOf("{"))), output };
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      const output = `${e.stderr ?? ""}${e.stdout ?? ""}${e.message ?? ""}`;
      return { ok: false, answer: {}, output };
    }
  }

  it("key + stored bearer: the child receives the signature and no bearer", async () => {
    const result = await authSession(childEnv({ key: true }));
    expect(result.ok, result.output).toBe(true);
    expect(result.answer._neotoma?.transport).toBe("offline");
    expect(result.answer.attribution?.decision?.signature_present).toBe(true);
    expect(result.answer.attribution?.decision?.signature_verified).toBe(true);
  }, 180_000);

  it("key + stored bearer + --with-bearer: the bearer reaches the child", async () => {
    const result = await authSession(childEnv({ key: true }), ["--with-bearer"]);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Failed to resolve session identity");
  }, 180_000);

  it("key + NEOTOMA_CLI_AAUTH_DISABLE=1: refuses before sending", async () => {
    const result = await authSession(
      childEnv({ key: true, extra: { NEOTOMA_CLI_AAUTH_DISABLE: "1" } })
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain("NEOTOMA_CLI_AAUTH_DISABLE=1");
    expect(result.output).toContain("--with-bearer");
  }, 180_000);

  it("no key + stored bearer: the bearer reaches the child, unsigned", async () => {
    const result = await authSession(childEnv({ key: false }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Failed to resolve session identity");
  }, 180_000);
});
