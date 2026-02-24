import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI api commands", () => {
  describe("api status", () => {
    it("should return status payload with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api status --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("latency_ms");
    });
  });

  describe("api start", () => {
    it("should provide command guidance in JSON mode", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api start --env dev --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("commands");
      expect(result).toHaveProperty("ports");
      expect(result).toHaveProperty("message");
    });

    it("should return validation error when --env is missing", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api start --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("ok");
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  describe("api stop", () => {
    it("should return stop payload in JSON mode", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api stop --env dev --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("env");
      expect(result).toHaveProperty("port");
      expect(result).toHaveProperty("stop_ran");
      expect(result).toHaveProperty("message");
    });
  });

  describe("api processes", () => {
    it("should list API processes in JSON mode", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api processes --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("processes");
      expect(result).toHaveProperty("ports_checked");
      expect(Array.isArray(result.processes)).toBe(true);
    });
  });

  describe("api logs", () => {
    it("should return a structured message when log file is missing", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api logs --env dev --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("env");
      expect(result).toHaveProperty("log_file");
      expect(result.error || result.content !== undefined).toBeTruthy();
    });

    it("should return validation error when --env is missing", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api logs --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("ok");
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });
});
