/** Synthetic unsigned independent software client. No operator config is admitted. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const [root, baseUrl, operation, body] = process.argv.slice(2);
assert.equal(new URL(baseUrl).hostname, "127.0.0.1");
assert.notEqual(process.cwd(), root);
const allowed = new Set([
  "__CF_USER_TEXT_ENCODING",
  "PATH",
  "HOME",
  "NODE_ENV",
  "NODE_OPTIONS",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_DB_BACKEND",
  "NEOTOMA_ENCRYPTION_ENABLED",
  "NEOTOMA_CLI_AAUTH_DISABLE",
  "NEOTOMA_FORCE_LOCAL_TRANSPORT",
  "NEOTOMA_DISABLE_OFFLINE_FALLBACK",
  "NEOTOMA_BEARER_TOKEN",
]);
assert.deepEqual(
  Object.keys(process.env).filter((k) => !allowed.has(k)),
  []
);
assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.env.NEOTOMA_CLI_AAUTH_DISABLE, "1");
assert.equal(process.env.NEOTOMA_FORCE_LOCAL_TRANSPORT, "false");
assert.equal(process.env.NEOTOMA_DISABLE_OFFLINE_FALLBACK, "true");
const forbiddenPaths = [
  ...[".env", ".env.production", ".env.development"].map((f) => path.join(root, f)),
  path.join(process.cwd(), ".neotoma", "config.json"),
  path.join(process.env.HOME, ".config", "neotoma", "config.json"),
  path.join(process.env.HOME, ".config", "neotoma", ".env"),
  path.join(process.env.HOME, ".neotoma", "aauth"),
];
assert.equal(forbiddenPaths.some(existsSync), false);
const { config } = await import(pathToFileURL(path.join(root, "dist/config.js")).href);
const { readConfig, readEffectiveConfig } = await import(
  pathToFileURL(path.join(root, "dist/cli/config.js")).href
);
assert.deepEqual(await readConfig(), {});
assert.deepEqual(await readEffectiveConfig(), { _source: "user" });
assert.equal(config.dataDir, process.env.NEOTOMA_DATA_DIR);
assert.equal(config.encryption.enabled, false);
assert.equal(config.encryption.keyFilePath, "");
assert.equal(config.encryption.mnemonic, "");
assert.equal(config.encryption.mnemonicPassphrase, "");
assert.equal(config.encryption.logEncryptionEnabled, false);
const sessionResponse = await fetch(baseUrl + "/session", {
  headers: { authorization: `Bearer ${process.env.NEOTOMA_BEARER_TOKEN}` },
});
assert.equal(sessionResponse.status, 200);
const session = await sessionResponse.json();
assert.equal(session.attribution.tier, "anonymous");
assert.equal(Object.hasOwn(session.attribution, "agent_thumbprint"), false);
assert.equal(Object.hasOwn(session, "authenticated_actor_id"), false);
process.stderr.write(
  "INDEPENDENT_CLIENT " +
    JSON.stringify({
      session,
      pid: process.pid,
      parent_pid: process.ppid,
      env_keys: Object.keys(process.env)
        .filter((k) => k !== "NEOTOMA_BEARER_TOKEN")
        .sort(),
      config_empty: true,
      effective_config: { _source: "user" },
      encryption_disabled: true,
      key_mnemonic_absent: true,
      config_and_signer_paths_absent: true,
      dedicated_home: true,
      dedicated_cwd: true,
      dedicated_data: true,
      signing_disabled: true,
      force_local: false,
      offline_fallback: false,
      fixture_bearer_only: true,
    }) +
    "\n"
);
const originalFetch = globalThis.fetch;
let observed = 0;
globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  assert.equal(new URL(request.url).origin, baseUrl);
  const headers = new Headers(request.headers);
  for (const name of ["signature", "signature-input", "agent-token", "x-aauth-agent-token"])
    assert.equal(headers.has(name), false);
  assert.equal(headers.get("authorization"), `Bearer ${process.env.NEOTOMA_BEARER_TOKEN}`);
  const payload = JSON.parse(await request.clone().text());
  assert.deepEqual(payload, JSON.parse(body));
  const response = await originalFetch(input, init);
  observed++;
  process.stderr.write(
    "INDEPENDENT_HTTP " +
      JSON.stringify({
        method: request.method,
        route: new URL(request.url).pathname,
        request: payload,
        response_status: response.status,
        acknowledgment: await response.clone().json(),
        signature_headers_absent: true,
        client_name_header: headers.get("x-client-name"),
      }) +
      "\n"
  );
  return response;
};
process.argv = [
  process.execPath,
  path.join(root, "dist/cli/index.js"),
  "--no-log-file",
  "--json",
  "--base-url",
  baseUrl,
  "request",
  "--operation",
  operation,
  "--body",
  body,
];
process.on("beforeExit", () => {
  assert.equal(observed, 1);
  assert.equal(existsSync(path.join(process.env.NEOTOMA_DATA_DIR, "neotoma.db")), false);
});
await import(pathToFileURL(path.join(root, "dist/cli/index.js")).href);
