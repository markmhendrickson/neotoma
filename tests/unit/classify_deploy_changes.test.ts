import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The deploy classifier decides whether a push to main redeploys the operator
 * instance. A wrong skip leaves a runtime change undeployed, so every test here
 * drives the real decision against a real git repository, diffing from the
 * commit the instance "serves" exactly as the workflow does.
 */

const classifier: unknown = await import("../../scripts/classify_deploy_changes.mjs");
const { decide, main, classifyPackageJsonChange } = classifier as {
  decide: (opts: Record<string, unknown>) => Promise<{
    deploy: boolean;
    reason: string;
    served?: string;
    rows: Array<{ path: string; deploy: boolean; why: string }>;
  }>;
  main: (
    argv: string[],
    env: Record<string, string>
  ) => Promise<{ deploy: boolean; reason: string }>;
  classifyPackageJsonChange: (
    a: string | null,
    b: string | null
  ) => { skippable: boolean; why: string };
};

/**
 * Variables that point git at a repository other than the one in `cwd`. Git
 * exports some of them to hooks, so when this suite runs inside the repo's own
 * pre-commit hook they name the REAL checkout, and a `git init` in a temp dir
 * would re-initialise that checkout instead (it did once: it set core.bare on
 * the shared clone). They are removed for this file, because `decide()` spawns
 * git with the inherited environment, and restored afterwards.
 */
const REPO_LOCATING_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
];
const savedGitVars = new Map<string, string>();
for (const name of REPO_LOCATING_VARS) {
  const value = process.env[name];
  if (value !== undefined) savedGitVars.set(name, value);
  delete process.env[name];
}

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  for (const [name, value] of savedGitVars) process.env[name] = value;
});

function mkTmp(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

function git(cwd: string, ...args: string[]): string {
  const leaked = REPO_LOCATING_VARS.filter((n) => process.env[n] !== undefined);
  if (leaked.length) throw new Error(`refusing to run git with ${leaked.join(", ")} set`);
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.invalid",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.invalid",
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: os.tmpdir(),
    },
  }).trim();
}

const BASE_PACKAGE = {
  name: "neotoma",
  version: "1.0.0",
  description: "old description",
  scripts: { "build:server": "tsc", test: "vitest run", lint: "eslint src" },
  dependencies: { express: "^4.0.0" },
};

const BASE_FILES: Record<string, string> = {
  "package.json": JSON.stringify(BASE_PACKAGE, null, 2) + "\n",
  "src/index.ts": "export const a = 1;\n",
  "docs/guide.md": "# guide\n",
  "frontend/src/app.tsx": "export {};\n",
  "tests/unit/a.test.ts": "// test\n",
  "tests/fixtures/json/seed.json": "{}\n",
  "tests/fixtures/sandbox/seed.json": "{}\n",
  "README.md": "# readme\n",
};

function writeFiles(cwd: string, files: Record<string, string | null>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(cwd, rel);
    if (content === null) {
      fs.rmSync(abs, { force: true });
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }
}

/** A repo whose first commit is "served"; `change` is committed on top. */
function repoWithChange(change: Record<string, string | null>): {
  cwd: string;
  served: string;
  head: string;
} {
  const cwd = mkTmp("classify-deploy-");
  git(cwd, "init", "-q", "-b", "main");
  // Never write into anything but the temp repo just created.
  expect(git(cwd, "rev-parse", "--absolute-git-dir")).toBe(path.join(fs.realpathSync(cwd), ".git"));
  writeFiles(cwd, BASE_FILES);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "served");
  const served = git(cwd, "rev-parse", "HEAD");
  writeFiles(cwd, change);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "--allow-empty", "-m", "change");
  return { cwd, served, head: git(cwd, "rev-parse", "HEAD") };
}

async function decideFor(change: Record<string, string | null>) {
  const { cwd, served, head } = repoWithChange(change);
  return decide({ event: "push", head, servedSha: served, cwd });
}

function pkg(mutate: (p: typeof BASE_PACKAGE & Record<string, unknown>) => void): string {
  const p = structuredClone(BASE_PACKAGE) as typeof BASE_PACKAGE & Record<string, unknown>;
  mutate(p);
  return JSON.stringify(p, null, 2) + "\n";
}

describe("classify_deploy_changes: skips pushes that cannot change the image", () => {
  it("skips a docs-only push", async () => {
    const r = await decideFor({
      "docs/guide.md": "# changed\n",
      "docs/site/manifest.yaml": "a: 1\n",
      "README.md": "# r2\n",
    });
    expect(r.deploy).toBe(false);
    expect(r.rows.map((x) => x.path).sort()).toEqual([
      "README.md",
      "docs/guide.md",
      "docs/site/manifest.yaml",
    ]);
  });

  it("skips a frontend-only push", async () => {
    const r = await decideFor({
      "frontend/src/app.tsx": "export const x = 2;\n",
      "frontend/package.json": "{}\n",
    });
    expect(r.deploy).toBe(false);
  });

  it("skips a tests-only push", async () => {
    const r = await decideFor({
      "tests/unit/a.test.ts": "// changed\n",
      "tests/fixtures/pdf/x.txt": "x\n",
    });
    expect(r.deploy).toBe(false);
  });

  it("deploys a fixture under tests/fixtures/json, which the image copies", async () => {
    const r = await decideFor({
      "tests/unit/a.test.ts": "// changed\n",
      "tests/fixtures/json/seed.json": '{"a":1}\n',
    });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain("tests/fixtures/json/seed.json");
  });

  it("deploys a fixture under tests/fixtures/sandbox, which the image copies", async () => {
    const r = await decideFor({ "tests/fixtures/sandbox/seed.json": '{"a":1}\n' });
    expect(r.deploy).toBe(true);
  });

  it("skips a package.json change to description only", async () => {
    const r = await decideFor({ "package.json": pkg((p) => (p.description = "new description")) });
    expect(r.deploy).toBe(false);
  });

  it("skips a package.json change to a test script only", async () => {
    const r = await decideFor({
      "package.json": pkg((p) => (p.scripts.test = "vitest run --bail 1")),
    });
    expect(r.deploy).toBe(false);
  });

  it("deploys a package.json dependency change", async () => {
    const r = await decideFor({ "package.json": pkg((p) => (p.dependencies.express = "^5.0.0")) });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain("dependencies");
  });

  it("deploys a package.json version bump and a build-script change", async () => {
    expect((await decideFor({ "package.json": pkg((p) => (p.version = "1.0.1")) })).deploy).toBe(
      true
    );
    expect(
      (await decideFor({ "package.json": pkg((p) => (p.scripts["build:server"] = "tsc -b")) }))
        .deploy
    ).toBe(true);
  });
});

describe("classify_deploy_changes: deploys anything that can change the image", () => {
  it("deploys a src/ change", async () => {
    const r = await decideFor({ "src/index.ts": "export const a = 2;\n" });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain("src/index.ts");
    // Deployed by its own rule, not merely by the unknown-path fallback.
    expect(r.rows).toEqual([{ path: "src/index.ts", deploy: true, why: "server source" }]);
  });

  it("deploys Markdown under src/, which bundle assets copy into the image", async () => {
    const r = await decideFor({ "src/services/bundles/core/skills/x/SKILL.md": "# skill\n" });
    expect(r.deploy).toBe(true);
  });

  it("deploys a deleted src/ file", async () => {
    const r = await decideFor({ "src/index.ts": null });
    expect(r.deploy).toBe(true);
  });

  it("deploys an unknown path", async () => {
    const r = await decideFor({ "brand_new_dir/thing.yaml": "a: 1\n" });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain("not on the skip list");
  });

  it("deploys a mixed set when one path is a deploy path", async () => {
    const r = await decideFor({
      "docs/guide.md": "# changed\n",
      "frontend/src/app.tsx": "export const x = 3;\n",
      "tests/unit/a.test.ts": "// changed\n",
      Dockerfile: "FROM node:20-alpine\n",
    });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain("Dockerfile");
  });

  it("deploys this workflow file even though other .github paths skip", async () => {
    expect((await decideFor({ ".github/workflows/ci_test_lanes.yml": "x: 1\n" })).deploy).toBe(
      false
    );
    expect(
      (await decideFor({ ".github/workflows/deploy-operator-instance.yml": "x: 1\n" })).deploy
    ).toBe(true);
  });

  it("deploys workflow_dispatch runs without looking at the diff", async () => {
    const { cwd, served, head } = repoWithChange({ "docs/guide.md": "# changed\n" });
    const r = await decide({ event: "workflow_dispatch", head, servedSha: served, cwd });
    expect(r.deploy).toBe(true);
  });

  it("deploys when the served commit is not an ancestor of the pushed commit", async () => {
    const { cwd, head } = repoWithChange({ "docs/guide.md": "# changed\n" });
    git(cwd, "checkout", "-q", "--orphan", "other");
    writeFiles(cwd, { "docs/other.md": "# o\n" });
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", "unrelated");
    const unrelated = git(cwd, "rev-parse", "HEAD");
    const r = await decide({ event: "push", head, servedSha: unrelated, cwd });
    expect(r.deploy).toBe(true);
    expect(r.reason).toContain("not an ancestor");
  });
});

describe("classify_deploy_changes: an unreadable served sha deploys, never skips", () => {
  // Same docs-only push throughout: it WOULD skip if the served sha were read.
  const docsOnly = { "docs/guide.md": "# changed\n" };

  it("deploys when the served sha is empty or malformed", async () => {
    const { cwd, head } = repoWithChange(docsOnly);
    for (const servedSha of ["", "unknown", "01HXYZMACHINEVERSIONULID", "abc123"]) {
      const r = await decide({ event: "push", head, servedSha, cwd });
      expect(r.deploy, servedSha).toBe(true);
      expect(r.reason).toContain("could not read");
    }
  });

  it("deploys when the served sha is a well-formed commit the repo does not have", async () => {
    const { cwd, head } = repoWithChange(docsOnly);
    const r = await decide({ event: "push", head, servedSha: "f".repeat(40), cwd });
    expect(r.deploy).toBe(true);
  });

  describe("read from the instance's root JSON", () => {
    let server: http.Server;
    let base: string;
    const routes: Record<string, (res: http.ServerResponse) => void> = {};

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        const handler = routes[req.url ?? ""];
        if (handler) handler(res);
        else res.writeHead(404).end();
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    const fast = { attempts: 2, retryDelayMs: 1, timeoutMs: 2000 };

    it("skips only when the root JSON yields the served commit", async () => {
      const { cwd, served, head } = repoWithChange(docsOnly);
      routes["/ok"] = (res) =>
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ git_sha: served }));
      const r = await decide({
        event: "push",
        head,
        servedUrl: `${base}/ok`,
        fetchOptions: fast,
        cwd,
      });
      expect(r.deploy).toBe(false);
      expect(r.served).toBe(served);
    });

    it("deploys on an HTTP error, a missing git_sha, non-JSON, or no listener", async () => {
      const { cwd, head } = repoWithChange(docsOnly);
      routes["/500"] = (res) => res.writeHead(500).end();
      routes["/nosha"] = (res) =>
        res.writeHead(200).end(JSON.stringify({ version: "1.0.0", git_sha: "01HMACHINE" }));
      routes["/html"] = (res) =>
        res.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
      const closed = http.createServer();
      await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
      const deadPort = (closed.address() as AddressInfo).port;
      await new Promise<void>((r) => closed.close(() => r()));
      for (const url of [
        `${base}/500`,
        `${base}/nosha`,
        `${base}/html`,
        `http://127.0.0.1:${deadPort}/`,
        "https:///",
      ]) {
        const r = await decide({ event: "push", head, servedUrl: url, fetchOptions: fast, cwd });
        expect(r.deploy, url).toBe(true);
        expect(r.reason, url).toContain("could not read");
      }
    });
  });
});

describe("classify_deploy_changes: shallow checkouts", () => {
  it("deepens a depth-1 checkout until it finds the served commit", async () => {
    const { cwd: origin, served } = repoWithChange({ "docs/guide.md": "# 1\n" });
    for (let i = 2; i <= 4; i++) {
      writeFiles(origin, { "docs/guide.md": `# ${i}\n` });
      git(origin, "commit", "-q", "-am", `docs ${i}`);
    }
    const head = git(origin, "rev-parse", "HEAD");
    const clone = mkTmp("classify-shallow-");
    git(clone, "clone", "-q", "--depth", "1", `file://${origin}`, ".");
    expect(git(clone, "rev-parse", "--is-shallow-repository")).toBe("true");
    const r = await decide({ event: "push", head, servedSha: served, cwd: clone });
    expect(r.deploy).toBe(false);
  });

  it("deploys when the history fetch fails", async () => {
    const { cwd: origin, served, head } = repoWithChange({ "docs/guide.md": "# 1\n" });
    const clone = mkTmp("classify-shallow-");
    git(clone, "clone", "-q", "--depth", "1", `file://${origin}`, ".");
    git(clone, "remote", "set-url", "origin", `file://${origin}-missing`);
    const r = await decide({ event: "push", head, servedSha: served, cwd: clone });
    expect(r.deploy).toBe(true);
  });
});

describe("classify_deploy_changes: outputs and run summary", () => {
  function runMain(args: string[]): {
    result: Promise<{ deploy: boolean; reason: string }>;
    output: string;
    summary: string;
  } {
    const dir = mkTmp("classify-out-");
    const output = path.join(dir, "output");
    const summary = path.join(dir, "summary");
    const result = main(args, { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary });
    return { result, output, summary };
  }

  it("writes deploy=false and a summary naming each non-image path on a skip", async () => {
    const { cwd, served, head } = repoWithChange({
      "docs/guide.md": "# changed\n",
      "frontend/src/app.tsx": "export const x = 4;\n",
    });
    const prev = process.cwd();
    process.chdir(cwd);
    try {
      const run = runMain(["--event", "push", "--head", head, "--served-sha", served]);
      expect((await run.result).deploy).toBe(false);
      expect(fs.readFileSync(run.output, "utf8")).toMatch(/^deploy=false$/m);
      const summary = fs.readFileSync(run.summary, "utf8");
      expect(summary).toContain("deploy skipped");
      expect(summary).toContain("Not a failure");
      expect(summary).toContain(served);
      expect(summary).toContain("`docs/guide.md`");
      expect(summary).toContain("`frontend/src/app.tsx`");
    } finally {
      process.chdir(prev);
    }
  });

  it("writes deploy=true when it deploys", async () => {
    const { cwd, served, head } = repoWithChange({ "src/index.ts": "export const a = 9;\n" });
    const prev = process.cwd();
    process.chdir(cwd);
    try {
      const run = runMain(["--event", "push", "--head", head, "--served-sha", served]);
      expect((await run.result).deploy).toBe(true);
      expect(fs.readFileSync(run.output, "utf8")).toMatch(/^deploy=true$/m);
      expect(fs.readFileSync(run.summary, "utf8")).not.toContain("deploy skipped");
    } finally {
      process.chdir(prev);
    }
  });
});

describe("classify_deploy_changes: package.json comparison", () => {
  const before = JSON.stringify(BASE_PACKAGE);

  it("treats key reordering and whitespace as no change", () => {
    const reordered = Object.fromEntries(Object.entries(BASE_PACKAGE).reverse());
    expect(classifyPackageJsonChange(before, JSON.stringify(reordered, null, 4))).toEqual({
      skippable: true,
      why: "formatting only",
    });
  });

  it("deploys when a skippable-named script is run by a build script", () => {
    const b = {
      ...BASE_PACKAGE,
      scripts: { ...BASE_PACKAGE.scripts, "build:server": "tsc && npm run lint" },
    };
    const a = { ...b, scripts: { ...b.scripts, lint: "eslint src --fix" } };
    expect(classifyPackageJsonChange(JSON.stringify(b), JSON.stringify(a)).skippable).toBe(false);
  });

  it("deploys when package.json does not parse, or appears or disappears", () => {
    expect(classifyPackageJsonChange(before, "{not json").skippable).toBe(false);
    expect(classifyPackageJsonChange(null, before).skippable).toBe(false);
    expect(classifyPackageJsonChange(before, null).skippable).toBe(false);
  });
});
