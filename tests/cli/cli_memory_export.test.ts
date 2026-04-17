/**
 * Behavioral coverage for `neotoma memory-export`.
 *
 * The underlying sort / render logic is covered by unit tests in
 * `src/services/memory_export.test.ts`. Here we validate command wiring:
 *   - the command is registered and visible in top-level help
 *   - option parsing rejects invalid --order values
 *   - end-to-end: writes a file with the requested path, deterministic
 *     output when there are no entities for the user
 */
import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI memory-export command", () => {
  it("shows memory-export in top-level help", async () => {
    const { stdout } = await execAsync(`${CLI_PATH} --help`);
    expect(stdout).toMatch(/\bmemory-export\b/);
  });

  it("rejects an invalid --order value", async () => {
    let failed = false;
    try {
      await execAsync(
        `${CLI_PATH} memory-export --order nonsense --path /tmp/neotoma-memory-export-invalid.md`
      );
    } catch (error) {
      failed = true;
      const e = error as NodeJS.ErrnoException & { stderr?: string };
      expect(String(e.stderr ?? "")).toMatch(/Invalid --order/i);
    }
    expect(failed).toBe(true);
  });

  it("writes an output file to the requested path", async () => {
    const workDir = join(tmpdir(), `neotoma-memory-export-${Date.now()}`);
    await mkdir(workDir, { recursive: true });
    const outputPath = join(workDir, "MEMORY.md");
    try {
      await execAsync(
        `${CLI_PATH} memory-export --path "${outputPath}" --limit-lines 50 --order recency`
      );
      const contents = await readFile(outputPath, "utf-8");
      expect(contents.endsWith("\n")).toBe(true);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
