import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Coverage guard for the CLI-test local-target guard
 * (`tests/helpers/cli_local_target.ts`).
 *
 * A test that starts the CLI through a raw `child_process` import bypasses the guard, and can
 * write to whatever Neotoma instance the environment (or a repo-root `.env`) points at.
 * "Starts the CLI" covers every entry: `dist/cli/index.js`, `dist/cli/bootstrap.js` and
 * `src/cli/bootstrap.ts` (run through tsx), written as a literal path or built with
 * `path.join`/`path.resolve` segments.
 *
 * A file that does that must use the helper INSTEAD of the raw import. Importing the helper
 * alongside a raw `child_process` import does not excuse the raw one: such a file must be listed
 * in the allowlist below with a reason, and the only accepted reason is help-only use (a
 * `--help` invocation makes no request).
 */

const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(TESTS_DIR, "..");
const HELPER_REL = "tests/helpers/cli_local_target.ts";
const SELF_REL = "tests/cli/cli_local_target_coverage_guard.test.ts";

/** Files that keep a raw child_process import for `--help` output only. Keep short. */
const HELP_ONLY_ALLOWLIST: Record<string, string> = {
  "tests/cli/cli_direct_invocation_parity.test.ts":
    "spawns `<command> --help` for every session command; help makes no request",
  "tests/cli/docs_cli_commands.test.ts":
    "execFileSync of `--help` / `help <command>` with a minimal env; help makes no request",
  "tests/cli/cli_user_id_propagation.test.ts":
    "runHelp() uses raw execSync for `--help` only; every request-making call uses execSyncLocal",
};

/** Any way a test file can name a CLI entry point. */
const CLI_ENTRY_PATTERNS: RegExp[] = [
  /dist\/cli\/index\.js/,
  /dist\/cli\/bootstrap\.js/,
  /src\/cli\/bootstrap\.ts/,
  // path.join / path.resolve built forms
  /["']dist["']\s*,\s*["']cli["']\s*,\s*["'](?:index|bootstrap)\.js["']/,
  /["']src["']\s*,\s*["']cli["']\s*,\s*["']bootstrap\.ts["']/,
  // Windows-style separators in a string literal
  /dist\\+cli\\+(?:index|bootstrap)\.js/,
  /src\\+cli\\+bootstrap\.ts/,
];

/** Any static way of getting child_process: named, namespace, default, or require(). */
const RAW_SPAWN_PATTERNS: RegExp[] = [
  /import\s+(?!type\b)[^;]*?from\s*["'](?:node:)?child_process["']/,
  /require\(\s*["'](?:node:)?child_process["']\s*\)/,
];

export function mentionsCliEntry(text: string): boolean {
  return CLI_ENTRY_PATTERNS.some((re) => re.test(text));
}
export function hasRawSpawnImport(text: string): boolean {
  return RAW_SPAWN_PATTERNS.some((re) => re.test(text));
}
/** Offender = starts the CLI AND imports raw child_process. The helper import is irrelevant. */
export function isOffender(text: string): boolean {
  return mentionsCliEntry(text) && hasRawSpawnImport(text);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("CLI local-target guard coverage", () => {
  const files = [...walk(TESTS_DIR), ...walk(path.join(REPO_ROOT, "src"))]
    .map((f) => ({
      rel: path.relative(REPO_ROOT, f).split(path.sep).join("/"),
      text: readFileSync(f, "utf8"),
    }))
    .filter((f) => f.rel !== HELPER_REL && f.rel !== SELF_REL)
    // Only test files: src/ also holds the CLI itself.
    .filter((f) => f.rel.startsWith("tests/") || /\.(?:test|spec)\.ts$/.test(f.rel));

  it("finds the CLI-spawning test files (instrument is not vacuous)", () => {
    expect(files.filter((f) => mentionsCliEntry(f.text)).length).toBeGreaterThan(25);
  });

  it("no CLI-spawning test uses a raw child_process import unless allowlisted as help-only", () => {
    const offenders = files
      .filter((f) => isOffender(f.text))
      .filter((f) => !(f.rel in HELP_ONLY_ALLOWLIST))
      .map((f) => f.rel);
    expect(
      offenders,
      "These tests start the CLI with a raw child_process import and can reach a real " +
        "instance. Use execAsync / execSyncLocal / spawnSyncLocal / execFileLocal from " +
        "tests/helpers/cli_local_target.ts instead of the raw import (importing the helper " +
        "alongside the raw import does not excuse it), or, for help-only use, add the file to " +
        "HELP_ONLY_ALLOWLIST with a reason."
    ).toEqual([]);
  });

  it("the help-only allowlist has no stale entries and every reason is stated", () => {
    for (const [rel, reason] of Object.entries(HELP_ONLY_ALLOWLIST)) {
      const file = files.find((f) => f.rel === rel);
      expect(file, `${rel} is allowlisted but missing`).toBeDefined();
      expect(isOffender(file!.text), `${rel} no longer needs its allowlist entry`).toBe(true);
      expect(file!.text, `${rel} must spawn the CLI for --help`).toMatch(/--help|"help"/);
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  describe("the matcher can fail (synthetic offenders)", () => {
    const named = `import { execFile } from "node:child_process";\n`;
    const entries: Array<[string, string]> = [
      ["dist/cli/index.js literal", `const c = "node dist/cli/index.js";`],
      ["dist/cli/bootstrap.js literal", `const c = path.join(root, "dist/cli/bootstrap.js");`],
      ["src/cli/bootstrap.ts literal", `const argv = ["--import", "tsx", "src/cli/bootstrap.ts"];`],
      ["path.join dist/cli/index.js", `path.join(process.cwd(), "dist", "cli", "index.js")`],
      ["path.join dist/cli/bootstrap.js", `path.join(root, 'dist', 'cli', 'bootstrap.js')`],
      ["path.join src/cli/bootstrap.ts", `path.resolve(root, "src", "cli", "bootstrap.ts")`],
      ["windows separators", String.raw`const c = "node dist\\cli\\index.js";`],
    ];
    for (const [label, entry] of entries) {
      it(`flags ${label}`, () => {
        expect(isOffender(named + entry)).toBe(true);
        expect(isOffender(entry)).toBe(false); // no raw import: fine
      });
    }

    const imports: Array<[string, string]> = [
      ["named node: import", `import { exec } from "node:child_process";`],
      ["named bare import", `import { spawnSync } from "child_process";`],
      ["namespace import", `import * as cp from "node:child_process";`],
      ["default import", `import cp from "node:child_process";`],
      ["default + named import", `import cp, { execSync } from "child_process";`],
      ["require node:", `const cp = require("node:child_process");`],
      ["require bare", `const { execFile } = require('child_process');`],
    ];
    for (const [label, imp] of imports) {
      it(`flags ${label}`, () => {
        expect(isOffender(`${imp}\nconst c = "dist/cli/index.js";`)).toBe(true);
      });
    }

    it("does not excuse a raw import because the helper is also imported", () => {
      const both =
        `import { execAsync } from "../helpers/cli_local_target.js";\n` +
        `import { execSync } from "node:child_process";\n` +
        `const c = "dist/cli/index.js";`;
      expect(isOffender(both)).toBe(true);
    });

    it("lets a helper-only file and a type-only import through", () => {
      expect(
        isOffender(
          `import { execAsync } from "../helpers/cli_local_target.js";\nconst c = "dist/cli/index.js";`
        )
      ).toBe(false);
      expect(
        isOffender(
          `import type { ExecOptions } from "node:child_process";\nconst c = "dist/cli/index.js";`
        )
      ).toBe(false);
    });
  });
});
