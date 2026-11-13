import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Coverage guard for the CLI-test local-target guard
 * (`tests/helpers/cli_local_target.ts`).
 *
 * A test that spawns `node dist/cli/index.js` through a raw `child_process`
 * import bypasses the guard, and can write to whatever Neotoma instance the
 * environment (or a repo-root `.env`) points at. Every such file must either
 * import the helper or be listed below as help-only (a `--help` invocation
 * makes no request).
 */

const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Files that spawn the CLI for `--help` output only. Keep this list short and justified. */
const HELP_ONLY_ALLOWLIST = new Set<string>(["tests/cli/cli_direct_invocation_parity.test.ts"]);

const CLI_MARKER = "dist/cli/index.js";
const RAW_SPAWN_IMPORT =
  /import\s*\{[^}]*\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\b[^}]*\}\s*from\s*["'](?:node:)?child_process["']/;
const HELPER_IMPORT = /from\s*["'][^"']*cli_local_target(?:\.js)?["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const REPO_ROOT = path.resolve(TESTS_DIR, "..");
const HELPER_REL = "tests/helpers/cli_local_target.ts";

describe("CLI local-target guard coverage", () => {
  const files = walk(TESTS_DIR).map((f) => ({
    rel: path.relative(REPO_ROOT, f).split(path.sep).join("/"),
    text: readFileSync(f, "utf8"),
  }));

  it("finds the CLI-spawning test files (instrument is not vacuous)", () => {
    const spawners = files.filter((f) => f.text.includes(CLI_MARKER));
    expect(spawners.length).toBeGreaterThan(20);
  });

  it("no CLI-spawning test uses a raw child_process import without the local-target helper", () => {
    const offenders = files
      .filter(
        (f) => f.rel !== HELPER_REL && f.rel !== "tests/cli/cli_local_target_coverage_guard.test.ts"
      )
      .filter((f) => f.text.includes(CLI_MARKER))
      .filter((f) => RAW_SPAWN_IMPORT.test(f.text) && !HELPER_IMPORT.test(f.text))
      .filter((f) => !HELP_ONLY_ALLOWLIST.has(f.rel))
      .map((f) => f.rel);
    expect(
      offenders,
      "These tests spawn the CLI with a raw child_process import and can reach a real " +
        "instance. Import execAsync / execSyncLocal / spawnSyncLocal / execFileLocal from " +
        "tests/helpers/cli_local_target.ts, or (help-only) add the file to HELP_ONLY_ALLOWLIST."
    ).toEqual([]);
  });

  it("the help-only allowlist has no stale entries", () => {
    const known = new Set(files.map((f) => f.rel));
    const stale = [...HELP_ONLY_ALLOWLIST].filter((rel) => !known.has(rel));
    expect(stale).toEqual([]);
    for (const rel of HELP_ONLY_ALLOWLIST) {
      const text = files.find((f) => f.rel === rel)!.text;
      expect(text, `${rel} must still spawn the CLI and only for --help`).toContain(CLI_MARKER);
      expect(text).toMatch(/--help/);
    }
  });

  it("flags a synthetic offender (the matcher can fail)", () => {
    const offender = `import { execFile } from "node:child_process";\nconst x = "${CLI_MARKER}";`;
    expect(RAW_SPAWN_IMPORT.test(offender) && !HELPER_IMPORT.test(offender)).toBe(true);
    const fixed = `${offender}\nimport { execFileLocal } from "../helpers/cli_local_target.js";`;
    expect(RAW_SPAWN_IMPORT.test(fixed) && !HELPER_IMPORT.test(fixed)).toBe(false);
  });
});
