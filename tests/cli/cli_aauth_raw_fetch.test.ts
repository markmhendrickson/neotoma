/**
 * End-to-end through the built CLI: commands that send their own HTTP request
 * rather than going through the API client follow the same credential rule.
 * With an AAuth key configured the request signature is the only credential;
 * the bearer (NEOTOMA_BEARER_TOKEN) is added only with `--with-bearer`; and a
 * variable that turns signing off while a key is configured makes the command
 * refuse before that request is sent.
 *
 * Covered: `edit` (its `POST /entities/:id/batch_correct` write), `request
 * --operation eventsStream`, and the `GET /me` probes of `auth status` and
 * `auth login`.
 *
 * The CLI talks to a capture server on loopback, never to a Neotoma instance.
 * HOME is a temp directory, so the stored login and user env are the test's own.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportJWK, generateKeyPair } from "jose";

import { execFileLocal, localCliEnv } from "../helpers/cli_local_target.js";

const CLI = path.resolve("dist/cli/index.js");
const ENV_TOKEN = "env-bearer-test-value";
const ENTITY_ID = "ent_cli_raw_fetch_test";

interface Captured {
  method?: string;
  path: string;
  authorization?: string;
  signature?: string;
}

describe("CLI raw-fetch commands: bearer beside an AAuth signature", () => {
  let root: string;
  let keyPath: string;
  let editorScript: string;
  let server: http.Server;
  let baseUrl: string;
  let captured: Captured[] = [];

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "neotoma-cli-aauth-raw-"));
    keyPath = path.join(root, "private.jwk");
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = (await exportJWK(privateKey)) as Record<string, unknown>;
    jwk.alg = "ES256";
    jwk.kid = "cli-raw-fetch-test-kid";
    writeFileSync(keyPath, JSON.stringify(jwk), { mode: 0o600 });

    // A non-interactive "editor" for `neotoma edit`: changes one field value.
    editorScript = path.join(root, "editor.mjs");
    writeFileSync(
      editorScript,
      [
        'import { readFileSync, writeFileSync } from "node:fs";',
        "const file = process.argv[2];",
        'writeFileSync(file, readFileSync(file, "utf-8").replace("before-edit", "after-edit"));',
      ].join("\n")
    );

    server = http.createServer((req, res) => {
      const reqPath = (req.url ?? "").split("?")[0];
      captured.push({
        method: req.method,
        path: reqPath,
        authorization: req.headers.authorization,
        signature: req.headers.signature as string | undefined,
      });
      req.resume();
      req.on("end", () => {
        if (reqPath === "/events/stream") {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.end('data: {"ok":true}\n\n');
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        if (reqPath.endsWith("/batch_correct")) {
          res.end(JSON.stringify({ status: "applied", applied: [{ field: "title" }] }));
        } else if (reqPath.startsWith("/entities/")) {
          res.end(
            JSON.stringify({
              entity_type: "note",
              snapshot: { title: "before-edit" },
              last_observation_at: null,
            })
          );
        } else {
          res.end(JSON.stringify({ user_id: "capture-user" }));
        }
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

  function childEnv(opts: { key: boolean; extra?: Record<string, string> }): NodeJS.ProcessEnv {
    const home = mkdtempSync(path.join(root, "home-"));
    const env = localCliEnv({ ...process.env });
    for (const k of [
      "NEOTOMA_BEARER_TOKEN",
      "NEOTOMA_BASE_URL",
      "NEOTOMA_CLI_AAUTH_DISABLE",
      "NEOTOMA_CLI_AAUTH_ENABLE",
      "NEOTOMA_FORCE_LOCAL_TRANSPORT",
      "NEOTOMA_KEY_FILE_PATH",
      "NEOTOMA_MNEMONIC",
      "EDITOR",
      "VISUAL",
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
      NEOTOMA_AAUTH_SUB: "cli-raw-fetch-test@example.invalid",
      NEOTOMA_AAUTH_PRIVATE_JWK_PATH: opts.key ? keyPath : path.join(root, "absent.jwk"),
      NEOTOMA_BEARER_TOKEN: ENV_TOKEN,
      ...(opts.extra ?? {}),
    };
  }

  async function runCli(
    env: NodeJS.ProcessEnv,
    args: string[],
    flags: string[] = []
  ): Promise<{ ok: boolean; output: string }> {
    try {
      const { stdout } = await execFileLocal(
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
          ...args,
        ],
        { env, cwd: root, timeout: 60_000 }
      );
      return { ok: true, output: String(stdout) };
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      return { ok: false, output: `${e.stderr ?? ""}${e.stdout ?? ""}${e.message ?? ""}` };
    }
  }

  const edit = (env: NodeJS.ProcessEnv, flags: string[] = []) =>
    runCli(env, ["edit", ENTITY_ID, "--editor", `node ${editorScript}`], flags);
  const eventsStream = (env: NodeJS.ProcessEnv, flags: string[] = []) =>
    runCli(env, ["request", "--operation", "eventsStream"], flags);
  const authStatus = (env: NodeJS.ProcessEnv, flags: string[] = []) =>
    runCli(env, ["auth", "status"], flags);
  const authLogin = (env: NodeJS.ProcessEnv, flags: string[] = []) =>
    runCli(env, ["auth", "login"], flags);

  const byPath = (suffix: string) => captured.filter((c) => c.path.endsWith(suffix));

  describe("edit: batch_correct write", () => {
    it("key + env bearer: read and write carry the signature, no bearer", async () => {
      const result = await edit(childEnv({ key: true }));
      expect(result.ok, result.output).toBe(true);
      expect(result.output).toContain("applied");
      const writes = byPath("/batch_correct");
      expect(writes).toHaveLength(1);
      expect(writes[0].method).toBe("POST");
      expect(writes[0].signature).toBeTruthy();
      expect(writes[0].authorization).toBeUndefined();
      const reads = byPath(`/entities/${ENTITY_ID}`);
      expect(reads.length).toBeGreaterThan(0);
      for (const read of reads) expect(read.authorization).toBeUndefined();
    }, 90_000);

    it("key + env bearer + --with-bearer: the write carries signature and bearer", async () => {
      const result = await edit(childEnv({ key: true }), ["--with-bearer"]);
      expect(result.ok, result.output).toBe(true);
      const writes = byPath("/batch_correct");
      expect(writes).toHaveLength(1);
      expect(writes[0].signature).toBeTruthy();
      expect(writes[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
    }, 90_000);

    it("key + NEOTOMA_CLI_AAUTH_DISABLE=1: refuses, nothing is written", async () => {
      const result = await edit(childEnv({ key: true, extra: { NEOTOMA_CLI_AAUTH_DISABLE: "1" } }));
      expect(result.ok).toBe(false);
      expect(result.output).toContain("NEOTOMA_CLI_AAUTH_DISABLE=1");
      expect(result.output).toContain("--with-bearer");
      expect(byPath("/batch_correct")).toHaveLength(0);
    }, 90_000);

    it("no key + env bearer: the write carries the bearer, unsigned", async () => {
      const result = await edit(childEnv({ key: false }));
      expect(result.ok, result.output).toBe(true);
      const writes = byPath("/batch_correct");
      expect(writes).toHaveLength(1);
      expect(writes[0].signature).toBeUndefined();
      expect(writes[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
    }, 90_000);
  });

  describe("request --operation eventsStream", () => {
    it("key + env bearer: signature only", async () => {
      const result = await eventsStream(childEnv({ key: true }));
      expect(result.ok, result.output).toBe(true);
      const seen = byPath("/events/stream");
      expect(seen).toHaveLength(1);
      expect(seen[0].signature).toBeTruthy();
      expect(seen[0].authorization).toBeUndefined();
    }, 90_000);

    it("key + env bearer + --with-bearer: signature and bearer", async () => {
      const result = await eventsStream(childEnv({ key: true }), ["--with-bearer"]);
      expect(result.ok, result.output).toBe(true);
      const seen = byPath("/events/stream");
      expect(seen).toHaveLength(1);
      expect(seen[0].signature).toBeTruthy();
      expect(seen[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
    }, 90_000);

    it("key + NEOTOMA_CLI_AAUTH_DISABLE=1: refuses before sending", async () => {
      const result = await eventsStream(
        childEnv({ key: true, extra: { NEOTOMA_CLI_AAUTH_DISABLE: "1" } })
      );
      expect(result.ok).toBe(false);
      expect(result.output).toContain("NEOTOMA_CLI_AAUTH_DISABLE=1");
      expect(byPath("/events/stream")).toHaveLength(0);
    }, 90_000);
  });

  describe("request --guest-access-token: the guest token replaces the configured credential", () => {
    const GUEST = "guest-token-test-value";
    for (const operation of ["eventsStream", "getMe"]) {
      it(`${operation}, key configured: guest bearer only, unsigned`, async () => {
        const result = await runCli(childEnv({ key: true }), [
          "request",
          "--operation",
          operation,
          "--guest-access-token",
          GUEST,
        ]);
        expect(result.ok, result.output).toBe(true);
        expect(captured).toHaveLength(1);
        expect(captured[0].signature).toBeUndefined();
        expect(captured[0].authorization).toBe(`Bearer ${GUEST}`);
      }, 90_000);
    }
  });

  describe("GET /me probes", () => {
    it("auth status, key + env bearer: signature only", async () => {
      const result = await authStatus(childEnv({ key: true }));
      expect(result.ok, result.output).toBe(true);
      const seen = byPath("/me");
      expect(seen).toHaveLength(1);
      expect(seen[0].signature).toBeTruthy();
      expect(seen[0].authorization).toBeUndefined();
    }, 90_000);

    it("auth status, key + env bearer + --with-bearer: signature and bearer", async () => {
      const result = await authStatus(childEnv({ key: true }), ["--with-bearer"]);
      expect(result.ok, result.output).toBe(true);
      const seen = byPath("/me");
      expect(seen).toHaveLength(1);
      expect(seen[0].signature).toBeTruthy();
      expect(seen[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
    }, 90_000);

    it("auth status, key + NEOTOMA_CLI_AAUTH_ENABLE=0: refuses and names the variable", async () => {
      const result = await authStatus(
        childEnv({ key: true, extra: { NEOTOMA_CLI_AAUTH_ENABLE: "0" } })
      );
      expect(result.ok).toBe(false);
      expect(result.output).toContain("NEOTOMA_CLI_AAUTH_ENABLE=0");
      expect(result.output).toContain("--with-bearer");
      expect(byPath("/me")).toHaveLength(0);
    }, 90_000);

    it("auth status, no key + env bearer: bearer unchanged", async () => {
      const result = await authStatus(childEnv({ key: false }));
      expect(result.ok, result.output).toBe(true);
      const seen = byPath("/me");
      expect(seen).toHaveLength(1);
      expect(seen[0].signature).toBeUndefined();
      expect(seen[0].authorization).toBe(`Bearer ${ENV_TOKEN}`);
    }, 90_000);

    it("auth login already-signed-in check, key + env bearer: signature only", async () => {
      const result = await authLogin(childEnv({ key: true }));
      expect(result.ok, result.output).toBe(true);
      const seen = byPath("/me");
      expect(seen).toHaveLength(1);
      expect(seen[0].signature).toBeTruthy();
      expect(seen[0].authorization).toBeUndefined();
    }, 90_000);

    it("auth login already-signed-in check, key + DISABLE=1: refuses before sending", async () => {
      const result = await authLogin(
        childEnv({ key: true, extra: { NEOTOMA_CLI_AAUTH_DISABLE: "1" } })
      );
      expect(result.ok).toBe(false);
      expect(result.output).toContain("NEOTOMA_CLI_AAUTH_DISABLE=1");
      expect(byPath("/me")).toHaveLength(0);
    }, 90_000);
  });
});
