/**
 * Regression: duplicate `let status` in release_orchestrator.js main() caused
 * `SyntaxError: Identifier 'status' has already been declared` on load.
 *
 * `node --check` only parses and cannot catch same-scope redeclaration that
 * throws on actual evaluation. The script has no `require.main === module`
 * guard — `main()` runs unconditionally — so it must be invoked as a
 * subprocess, not imported in-process.
 *
 * Invoking with `--help` still loads/evaluates the module (argv[2] becomes the
 * release id); assert stderr has no SyntaxError. File I/O may fail with ENOENT
 * for a non-existent release dir — that is a different error class.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "../../scripts/release_orchestrator.js");

describe("release_orchestrator.js load-time syntax", () => {
  it("loads without SyntaxError when invoked as a subprocess with --help", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--help"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
      cwd: path.resolve(__dirname, "../.."),
    });

    const stderr = result.stderr ?? "";
    expect(stderr).not.toMatch(/SyntaxError/);
  });
});
