import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI auth commands", () => {
  describe("auth status", () => {
    it("should return auth status payload with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} auth status --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("base_url");
      expect(result).toHaveProperty("auth_mode");
    });
  });

  describe("auth logout", () => {
    it("should clear credentials and return confirmation message in JSON mode", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} auth logout --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    });
  });

  describe("auth mcp-token", () => {
    it("should return non-zero exit code when no key source is configured", async () => {
      const envWithoutKey = { ...process.env };
      delete envWithoutKey.NEOTOMA_KEY_FILE_PATH;
      delete envWithoutKey.NEOTOMA_MNEMONIC;
      delete envWithoutKey.NEOTOMA_MNEMONIC_PASSPHRASE;
      const cwdNoEnv = mkdtempSync(path.join(tmpdir(), "neotoma-auth-test-"));
      let exitCode = 0;
      try {
        await execAsync(`${CLI_PATH} auth mcp-token --json`, {
          env: envWithoutKey,
          cwd: cwdNoEnv,
        });
      } catch (error: any) {
        exitCode = error.code ?? 1;
        if (error.stdout) {
          const payload = JSON.parse(error.stdout);
          expect(payload).toHaveProperty("error");
        }
      } finally {
        try {
          rmSync(cwdNoEnv, { recursive: true });
        } catch {
          /* ignore */
        }
      }
      expect(exitCode).toBeGreaterThan(0);
    });
  });

  describe("auth login", () => {
    it("should expose login command usage via help", async () => {
      const { stdout, stderr } = await execAsync(`${CLI_PATH} auth login --help`);
      const out = stdout + stderr;
      expect(out).toMatch(/Login using OAuth PKCE|--dev-stub|Usage/i);
    });
  });
});
