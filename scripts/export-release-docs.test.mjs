import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const release = "v0.25.0";
const commit = execFileSync("git", ["rev-parse", `refs/tags/${release}^{commit}`], {
  encoding: "utf8",
}).trim();
const run = (...args) =>
  spawnSync(process.execPath, ["scripts/export-release-docs.mjs", ...args], { encoding: "utf8" });
const base = ["--release", release, "--commit", commit];

test("export is deterministic and binds all page hashes to a released commit", () => {
  const first = run(...base);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(run(...base).stdout, first.stdout);
  const bundle = JSON.parse(first.stdout);
  assert.equal(bundle.documentation_commit, commit);
  assert.equal(bundle.pages.length, 3);
  assert.ok(bundle.capabilities.length > 0);
  assert.ok(
    bundle.pages.every(
      (page) => page.source_url.includes(commit) && /^[a-f0-9]{64}$/.test(page.sha256)
    )
  );
});

test("unresolved or mismatched versions fail closed", () => {
  assert.equal(run("--release", release, "--commit", "0".repeat(40)).status, 1);
  assert.equal(run("--release", "v999.999.999", "--commit", commit).status, 1);
  assert.equal(run("--release", release, "--commit", "main").status, 1);
});

test("check detects altered bytes and output refuses overwrite", () => {
  const directory = mkdtempSync(join(tmpdir(), "neotoma-docs-test-"));
  const output = join(directory, "bundle.json");
  assert.equal(run(...base, "--output", output).status, 0);
  assert.equal(run(...base, "--check", output).status, 0);
  assert.equal(run(...base, "--output", output).status, 1);
  writeFileSync(output, "{}\n");
  const stale = run(...base, "--check", output);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale or altered/);
});
