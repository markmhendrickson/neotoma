/**
 * Effect tests for scripts/generate-automated-test-catalog.ts.
 *
 * The catalog is generated from the test filenames in the tree, and CI renders
 * it (the default write path) rather than validating it, so the behavior that
 * matters is that a stale catalog is actually rewritten back to correct
 * content — not merely that the command is callable. Each test therefore
 * deliberately stales the committed catalog, runs the real script through its
 * natural call shape, and asserts on the resulting file content.
 *
 * Surfaces covered:
 * - CI / render: `npm run generate:test-catalog` (and the underlying tsx path)
 * - Local advisory: `npm run validate:test-catalog` / `--check`
 * - Loud failure: write failure leaves a nonzero exit CI would see
 *
 * The generator resolves both its repo root and its output path from its own
 * module location, so there is no seam to point it at a fixture tree. Tests
 * instead snapshot the real file, mutate it, and restore it in `afterEach`, so
 * a failing assertion can never leave the tracked catalog corrupted.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "generate-automated-test-catalog.ts");
const catalogPath = path.join(repoRoot, "docs", "testing", "automated_test_catalog.md");
const npmScriptsDocPath = path.join(repoRoot, "docs", "developer", "npm_scripts.md");
const workflowPath = path.join(repoRoot, ".github", "workflows", "ci_test_lanes.yml");

/** The correct output for the current tree, captured before anything is staled. */
let freshCatalog: string;

function runGenerator(args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("npx", ["tsx", scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: process.env,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runNpmScript(script: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("npm", ["run", script], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: process.env,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function writeCatalog(content: string): void {
  fs.writeFileSync(catalogPath, content);
}

function readCatalog(): string {
  return fs.readFileSync(catalogPath, "utf8");
}

function restoreCatalogFile(): void {
  // A failure-path test may replace the catalog path with a directory.
  if (fs.existsSync(catalogPath)) {
    const stat = fs.lstatSync(catalogPath);
    if (stat.isDirectory()) {
      fs.rmSync(catalogPath, { recursive: true, force: true });
    }
  }
  writeCatalog(freshCatalog);
}

beforeAll(() => {
  // Render once so the baseline is what the generator would produce for this
  // tree, whether or not the committed copy happens to be current.
  const result = runGenerator();
  expect(result.status, `generator failed to produce a baseline: ${result.stderr}`).toBe(0);
  freshCatalog = readCatalog();
  expect(freshCatalog.length).toBeGreaterThan(0);
  expect(freshCatalog.startsWith("# Automated test catalog")).toBe(true);
});

afterEach(() => {
  restoreCatalogFile();
});

describe("generate-automated-test-catalog render path", () => {
  it("regenerates a stale catalog back to the correct content", () => {
    const stale = freshCatalog.replace("# Automated test catalog", "# Automated test catalog (STALE)");
    expect(stale).not.toBe(freshCatalog);
    writeCatalog(stale);

    const result = runGenerator();

    expect(result.status).toBe(0);
    // The effect, not the exit code: the file is byte-identical to correct output.
    expect(readCatalog()).toBe(freshCatalog);
    expect(readCatalog()).not.toContain("(STALE)");
  });

  it("restores inventory entries and counters dropped from a stale catalog", () => {
    // Simulate the real drift this change exists for: a test file landed but
    // the catalog was never regenerated, so its row is missing and the
    // `**Files (N):**` counter for its suite reads one too low.
    const countMatch = freshCatalog.match(/\*\*Files \((\d+)\):\*\*\n(- `[^`]+`\n)/);
    expect(countMatch, "expected a suite section with at least one file row").not.toBeNull();
    const [, countText, firstRow] = countMatch as RegExpMatchArray;
    const droppedCount = Number(countText) - 1;

    const stale = freshCatalog.replace(
      `**Files (${countText}):**\n${firstRow}`,
      `**Files (${droppedCount}):**\n`,
    );
    expect(stale).not.toBe(freshCatalog);
    expect(stale).not.toContain(firstRow.trim());
    writeCatalog(stale);

    const result = runGenerator();

    expect(result.status).toBe(0);
    // Both the missing row and the understated counter come back.
    expect(readCatalog()).toContain(firstRow.trim());
    expect(readCatalog()).toContain(`**Files (${countText}):**`);
    expect(readCatalog()).toBe(freshCatalog);
  });

  it("leaves an already-fresh catalog byte-identical", () => {
    writeCatalog(freshCatalog);

    const result = runGenerator();

    expect(result.status).toBe(0);
    expect(readCatalog()).toBe(freshCatalog);
  });

  it("writes a full catalog when the file is missing entirely", () => {
    // Empty/absent output must produce the real inventory, not a silent no-op
    // or a truncated file.
    fs.rmSync(catalogPath, { force: true });

    const result = runGenerator();

    expect(result.status).toBe(0);
    expect(fs.existsSync(catalogPath)).toBe(true);
    expect(readCatalog()).toBe(freshCatalog);
  });
});

describe("generate-automated-test-catalog --check advisory gate", () => {
  it("exits nonzero and names the fix when the catalog is stale", () => {
    const stale = freshCatalog.replace("# Automated test catalog", "# Automated test catalog (STALE)");
    writeCatalog(stale);

    const result = runGenerator(["--check"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("generate:test-catalog");
    // --check reports; it must not rewrite the file.
    expect(readCatalog()).toBe(stale);
  });

  it("exits zero against a fresh catalog", () => {
    writeCatalog(freshCatalog);

    const result = runGenerator(["--check"]);

    expect(result.status).toBe(0);
    expect(readCatalog()).toBe(freshCatalog);
  });
});

describe("npm script surfaces (natural call shapes)", () => {
  it("npm run generate:test-catalog regenerates a stale catalog and then validate passes", () => {
    const stale = freshCatalog.replace("# Automated test catalog", "# Automated test catalog (STALE)");
    writeCatalog(stale);

    const generate = runNpmScript("generate:test-catalog");
    expect(generate.status, generate.stderr).toBe(0);
    expect(readCatalog()).toBe(freshCatalog);

    const validate = runNpmScript("validate:test-catalog");
    expect(validate.status, validate.stderr).toBe(0);
  });

  it("npm run validate:test-catalog exits nonzero on a stale catalog and names generate:test-catalog", () => {
    const stale = freshCatalog.replace("# Automated test catalog", "# Automated test catalog (STALE)");
    writeCatalog(stale);

    const validate = runNpmScript("validate:test-catalog");
    expect(validate.status).not.toBe(0);
    const combined = `${validate.stdout}\n${validate.stderr}`;
    expect(combined).toContain("generate:test-catalog");
    expect(readCatalog()).toBe(stale);
  });
});

describe("generate-automated-test-catalog loud failure", () => {
  it("exits nonzero when the catalog path cannot be written", () => {
    // Replace the output file with a directory so writeFileSync fails. CI must
    // see a nonzero exit rather than silently accepting a broken catalog.
    fs.rmSync(catalogPath, { force: true });
    fs.mkdirSync(catalogPath);

    const result = runGenerator();

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Failed to write automated test catalog/i);
  });
});

describe("generate-automated-test-catalog CLI surface", () => {
  it("no longer accepts a third --reconcile mode", () => {
    // The catalog has exactly two modes: render (default) and --check. An
    // unknown flag must fall through to the default write path rather than
    // selecting some other behavior.
    expect(fs.readFileSync(scriptPath, "utf8")).not.toContain("--reconcile");

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts["reconcile:test-catalog"]).toBeUndefined();
    expect(packageJson.scripts["generate:test-catalog"]).toBe(
      "tsx scripts/generate-automated-test-catalog.ts",
    );
    expect(packageJson.scripts["validate:test-catalog"]).toBe(
      "tsx scripts/generate-automated-test-catalog.ts --check",
    );
  });

  it("runs the render path in the required CI baseline lane", () => {
    const workflow = fs.readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("npm run generate:test-catalog");
    expect(workflow).not.toContain("reconcile:test-catalog");
    expect(workflow).not.toContain("validate:test-catalog");
    // The lane must not fail on a rewritten catalog, nor commit one.
    expect(workflow).not.toMatch(/git diff --exit-code[^\n]*automated_test_catalog/);
  });

  it("documents sibling generated-file CI policies as intentionally different", () => {
    const docs = fs.readFileSync(npmScriptsDocPath, "utf8");
    expect(docs).toContain("generate:test-catalog");
    expect(docs).toMatch(/baseline lane runs `npm run generate:test-catalog`/i);
    expect(docs).toContain("openapi.yaml");
    expect(docs).toContain("openapi_types.ts");
    expect(docs).toMatch(/fail(?:s)? on [`']?git diff|fail-on-drift/i);
    expect(docs).toContain("capability_manifest.json");
    expect(docs).toMatch(/intentionally different|authored API contract/i);
  });
});
