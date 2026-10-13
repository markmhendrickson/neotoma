/**
 * Fail-closed parsing of NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS (#2384 invariant 5).
 *
 * The condition pre-registered on #2384 before implementation: "If the allowlist
 * string contains 3 entries and entry #2 is malformed, the parse must throw for
 * the *whole list* (rejecting entries 1 and 3 along with 2), not silently drop
 * only the bad entry and admit the good ones."
 *
 * That is what these tests pin. The alternative — skipping a bad entry and
 * honouring the rest — is friendlier on a typo but makes the allowlist enforce
 * something other than what the operator wrote, with no signal that it did: the
 * refusal a dropped entry produces is indistinguishable from an exact-match miss.
 *
 * `src/config.ts` validates at module load (a top-level call, not inside an
 * exported function), so these exercise it via fresh dynamic imports under
 * different env values, following tests/unit/config_db_backend.test.ts.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

async function importFreshConfig() {
  vi.resetModules();
  return import("../../src/config.ts");
}

async function makeProjectRoot(prefix: string): Promise<{ homeDir: string; projectRoot: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(root, "home");
  const projectRoot = path.join(root, "project");
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
  );
  return { homeDir, projectRoot };
}

async function stubBaseEnv(prefix: string) {
  const { homeDir, projectRoot } = await makeProjectRoot(prefix);
  vi.stubEnv("HOME", homeDir);
  vi.stubEnv("USERPROFILE", homeDir);
  vi.stubEnv("NEOTOMA_ENV", "development");
  vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
  vi.stubEnv("NEOTOMA_DATA_DIR", path.join(projectRoot, "data"));
}

describe("NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS parsing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("defaults to an empty list when unset", async () => {
    await stubBaseEnv("neotoma-trusted-cb-default-");
    vi.stubEnv("NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS", "");

    const { config } = await importFreshConfig();
    expect(config.oauthTrustedCallbackUrls).toEqual([]);
  });

  it("accepts a well-formed multi-entry list, trimming whitespace", async () => {
    await stubBaseEnv("neotoma-trusted-cb-valid-");
    vi.stubEnv(
      "NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS",
      " https://a.example.com/cb , https://b.example.com/auth/callback "
    );

    const { config } = await importFreshConfig();
    expect(config.oauthTrustedCallbackUrls).toEqual([
      "https://a.example.com/cb",
      "https://b.example.com/auth/callback",
    ]);
  });

  it("accepts http: for a loopback host", async () => {
    await stubBaseEnv("neotoma-trusted-cb-loopback-");
    vi.stubEnv("NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS", "http://localhost:5195/oauth/callback");

    const { config } = await importFreshConfig();
    expect(config.oauthTrustedCallbackUrls).toEqual(["http://localhost:5195/oauth/callback"]);
  });

  // The pre-registered invariant, stated literally: three entries, the second
  // malformed, and entries 1 and 3 must NOT survive.
  it("rejects the WHOLE list when one entry of three is malformed", async () => {
    await stubBaseEnv("neotoma-trusted-cb-partial-");
    vi.stubEnv(
      "NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS",
      "https://a.example.com/cb,not a url,https://c.example.com/cb"
    );

    // Startup fails rather than quietly honouring entries 1 and 3.
    await expect(importFreshConfig()).rejects.toThrow(
      /Invalid NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS/
    );
  });

  it("identifies WHICH entry is bad, by position and value", async () => {
    // An error that says only "the list is invalid" would leave the operator
    // bisecting their own config by hand.
    await stubBaseEnv("neotoma-trusted-cb-names-");
    vi.stubEnv(
      "NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS",
      "https://a.example.com/cb,not a url,https://c.example.com/cb"
    );

    await expect(importFreshConfig()).rejects.toThrow(/entry 2 \("not a url"\)/);
  });

  it("reports every bad entry at once, not just the first", async () => {
    await stubBaseEnv("neotoma-trusted-cb-multi-bad-");
    vi.stubEnv(
      "NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS",
      "not a url,https://ok.example.com/cb,ftp://x/y"
    );

    await expect(importFreshConfig()).rejects.toThrow(/2 of 3 entries/);
  });

  it.each([
    ["a plaintext http: entry to a non-loopback host", "http://evil.example.com/cb", /cleartext/],
    ["a non-http(s) scheme", "ftp://app.example.com/cb", /scheme "ftp:"/],
    ["an unparseable entry", "app.example.com/cb", /not a parseable absolute URL/],
    ["an entry carrying userinfo", "https://app.example.com@evil.example.com/cb", /userinfo/],
  ])("fails closed on %s", async (_label, value, expected) => {
    await stubBaseEnv("neotoma-trusted-cb-reject-");
    vi.stubEnv("NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS", value);

    await expect(importFreshConfig()).rejects.toThrow(expected);
  });

  it("redacts userinfo rather than echoing a possible credential", async () => {
    // The error text lands in startup logs; the one part of a callback URL that
    // could carry a secret must not be printed back verbatim.
    await stubBaseEnv("neotoma-trusted-cb-redact-");
    vi.stubEnv("NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS", "https://user:hunter2@app.example.com/cb");

    const error = await importFreshConfig().then(
      () => null,
      (err: Error) => err
    );
    expect(error).toBeTruthy();
    expect(error!.message).not.toContain("hunter2");
    expect(error!.message).toContain("<redacted>@");
  });

  it("tells the operator how to recover", async () => {
    await stubBaseEnv("neotoma-trusted-cb-recover-");
    vi.stubEnv("NEOTOMA_OAUTH_TRUSTED_CALLBACK_URLS", "not a url");

    // Both routes out: fix the entry, or unset and fall back to the built-ins.
    await expect(importFreshConfig()).rejects.toThrow(/unset the variable/);
  });
});
