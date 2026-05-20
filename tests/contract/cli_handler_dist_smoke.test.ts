/**
 * Dist-level CLI handler smoke tests.
 *
 * These tests spawn `node dist/cli/index.js <command>` as a real subprocess and
 * assert that the handler's dynamic import() calls succeed inside the compiled
 * output.  Source-level tests and TypeScript type-checks cannot catch wrong
 * relative paths in dynamic imports because they always resolve from `src/`,
 * whereas the compiled handler resolves from `dist/cli/`.
 *
 * Regression target: issue #304 — `schemas repair-plural-types` shipped with
 * `../../services/plural_type_repair.js` instead of `../services/plural_type_repair.js`,
 * producing ERR_MODULE_NOT_FOUND on globally-installed builds.
 *
 * Pattern: run each command in dry-run / read-only mode so the test is safe
 * against a live database and requires no special environment setup beyond a
 * built dist/ directory.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../../dist/cli/index.js");

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

describe("CLI handler dist smoke — dynamic imports resolve in compiled output", () => {
  /**
   * `schemas repair-plural-types` (dry-run, no --apply flag) invokes the
   * `.action()` callback which contains a dynamic import of
   * plural_type_repair.js.  A wrong path (../../services/ vs ../services/)
   * surfaces here but not in source-level tests or `--help` invocations.
   */
  it("schemas repair-plural-types resolves all dynamic imports without ERR_MODULE_NOT_FOUND", () => {
    const { stderr, status } = runCli(["schemas", "repair-plural-types"]);

    // The specific failure class we are guarding against:
    expect(stderr).not.toMatch(/Cannot find module/);
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);

    // The command exits 0 on a clean or unavailable database (dry-run default).
    // It may exit non-zero if the DB is unreachable, but that is a different
    // error class — not a module resolution failure.
    if (status !== 0) {
      // Any non-zero exit must not be caused by a missing module.
      expect(stderr).not.toMatch(/Cannot find module/);
    }
  });

  /**
   * `schemas audit` exercises a separate handler import chain.  Include it so
   * the pattern extends beyond the single regression target.
   */
  it("schemas audit resolves all dynamic imports without ERR_MODULE_NOT_FOUND", () => {
    const { stderr } = runCli(["schemas", "audit"]);

    expect(stderr).not.toMatch(/Cannot find module/);
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
  });

  /**
   * `schemas list` is a read-only command that requires no write access.
   */
  it("schemas list resolves all dynamic imports without ERR_MODULE_NOT_FOUND", () => {
    const { stderr } = runCli(["schemas", "list"]);

    expect(stderr).not.toMatch(/Cannot find module/);
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
  });

  /**
   * `status` is a simple read-only command — validates the top-level handler path.
   */
  it("status resolves all dynamic imports without ERR_MODULE_NOT_FOUND", () => {
    const { stderr } = runCli(["status"]);

    expect(stderr).not.toMatch(/Cannot find module/);
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
  });
});
