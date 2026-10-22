import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REPO_SLUG_PATTERN, isValidRepoSlug } from "../../shared/repo_slug.js";
import { loadIssuesConfig } from "./config.js";
import {
  ALLOWED_REPOS_ENV,
  assertRepoAllowed,
  isRepoAllowed,
  parseAllowedRepos,
  repoNotAllowedError,
  resolveIssueRepo,
} from "./repo_allowlist.js";

describe("parseAllowedRepos", () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a comma-separated string, trimming and skipping empties", () => {
    expect(parseAllowedRepos(" acme/widgets , ,Other/Thing,")).toEqual([
      "acme/widgets",
      "Other/Thing",
    ]);
  });

  it("accepts an array from the config file", () => {
    expect(parseAllowedRepos(["acme/widgets", 7, null, "x/y"])).toEqual(["acme/widgets", "x/y"]);
  });

  it("de-duplicates case-insensitively", () => {
    expect(parseAllowedRepos("acme/widgets,ACME/Widgets")).toEqual(["acme/widgets"]);
  });

  it("returns an empty list for unset, empty or non-list input", () => {
    expect(parseAllowedRepos(undefined)).toEqual([]);
    expect(parseAllowedRepos("")).toEqual([]);
    expect(parseAllowedRepos(42)).toEqual([]);
  });

  it("drops malformed entries and wildcards, never widening the list", () => {
    const parsed = parseAllowedRepos(
      "acme/*,*/widgets,*,acme,a/b/c,acme/..,https://github.com/acme/widgets,acme/ok"
    );
    expect(parsed).toEqual(["acme/ok"]);
  });
});

describe("isRepoAllowed / assertRepoAllowed", () => {
  const config = { repo: "Default/Repo", allowed_repos: ["acme/widgets"] };

  it("always allows the configured repo, case-insensitively", () => {
    expect(isRepoAllowed("default/repo", config)).toBe(true);
    expect(isRepoAllowed("Default/Repo", { repo: "Default/Repo" })).toBe(true);
  });

  it("allows listed repos case-insensitively and nothing else", () => {
    expect(isRepoAllowed("ACME/Widgets", config)).toBe(true);
    expect(isRepoAllowed("acme/other", config)).toBe(false);
    expect(isRepoAllowed("acme/widgets", { repo: "Default/Repo" })).toBe(false);
  });

  it("rejects malformed slugs even when they textually match an entry", () => {
    expect(isRepoAllowed("acme/widgets/", { repo: "x/y", allowed_repos: ["acme/widgets/"] })).toBe(
      false
    );
    expect(isRepoAllowed(undefined, config)).toBe(false);
  });

  it("throws a 403 error that does not name the repo or the approved list", () => {
    expect(() => assertRepoAllowed("other/repo", config)).toThrowError(
      expect.objectContaining({ code: "ERR_ISSUE_REPO_NOT_ALLOWED", status: 403 })
    );
    const err = repoNotAllowedError();
    expect(err.message).not.toContain("other/repo");
    expect(err.message + (err.hint ?? "")).not.toContain("acme/widgets");
    expect(err.hint).toContain(ALLOWED_REPOS_ENV);
  });
});

describe("resolveIssueRepo", () => {
  const config = { repo: "default/repo", allowed_repos: ["acme/widgets"] };

  it("uses the row's stored repo when valid and allowed", () => {
    expect(resolveIssueRepo({ repo: "acme/widgets" }, config)).toEqual({
      repo: "acme/widgets",
      githubAllowed: true,
    });
  });

  it("keeps the stored repo but disallows GitHub calls when it is not permitted", () => {
    expect(resolveIssueRepo({ repo: "other/repo" }, config)).toEqual({
      repo: "other/repo",
      githubAllowed: false,
    });
  });

  it("falls back to the configured repo when none or an invalid one is stored", () => {
    for (const repo of [undefined, "", "   ", "not-a-slug", "a/b/c", 5]) {
      expect(resolveIssueRepo({ repo }, config)).toEqual({
        repo: "default/repo",
        githubAllowed: true,
      });
    }
  });
});

describe("REPO_SLUG_PATTERN", () => {
  const re = new RegExp(REPO_SLUG_PATTERN);
  const cases = [
    "acme/widgets",
    "a/b",
    "A-b/c.d_e-f",
    "acme/.github",
    "acme/...",
    "a/b.git",
    "notaslug",
    "a/b/c",
    "owner/",
    "/name",
    "owner/..",
    "owner/.",
    "-owner/name",
    "owner-/name",
    "own er/name",
    "owner/na?me",
    "owner/na#me",
    "a/b\n",
    " a/b",
    "",
  ];
  it.each(cases)("agrees with isValidRepoSlug for %j", (slug) => {
    expect(re.test(slug)).toBe(isValidRepoSlug(slug));
  });
});

describe("loadIssuesConfig allowed_repos precedence", () => {
  let home: string;
  const saved = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    env: process.env[ALLOWED_REPOS_ENV],
  };

  function writeConfig(issues: Record<string, unknown>): void {
    const dir = path.join(home, ".config", "neotoma");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ issues }), "utf8");
  }

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), "issues-allowlist-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    delete process.env[ALLOWED_REPOS_ENV];
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (saved.HOME === undefined) delete process.env.HOME;
    else process.env.HOME = saved.HOME;
    if (saved.USERPROFILE === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = saved.USERPROFILE;
    if (saved.env === undefined) delete process.env[ALLOWED_REPOS_ENV];
    else process.env[ALLOWED_REPOS_ENV] = saved.env;
    rmSync(home, { recursive: true, force: true });
  });

  it("is empty when neither the environment nor the config file sets it", async () => {
    expect((await loadIssuesConfig()).allowed_repos).toEqual([]);
  });

  it("reads issues.allowed_repos from the config file", async () => {
    writeConfig({ allowed_repos: ["acme/widgets", "bad", "x/y"] });
    expect((await loadIssuesConfig()).allowed_repos).toEqual(["acme/widgets", "x/y"]);
  });

  it("lets the environment variable win over the config file", async () => {
    writeConfig({ allowed_repos: ["file/repo"] });
    process.env[ALLOWED_REPOS_ENV] = "env/one, env/two";
    expect((await loadIssuesConfig()).allowed_repos).toEqual(["env/one", "env/two"]);
  });

  it("treats an empty environment variable as an explicit empty list (fail closed)", async () => {
    writeConfig({ allowed_repos: ["file/repo"] });
    process.env[ALLOWED_REPOS_ENV] = "";
    expect((await loadIssuesConfig()).allowed_repos).toEqual([]);
  });
});
