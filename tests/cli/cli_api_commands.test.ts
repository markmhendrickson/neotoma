import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

/**
 * #2377 follow-up: these commands shell out to process-inspection tools
 * (`lsof`, `ps`) that are unbounded by default. A cold `lsof` was measured at
 * 49.7s on a machine with nothing listening on the probed port, versus 0.07s
 * warm — which is why this file passed in isolation (its earlier cases warmed
 * the cache) but failed when the full lane ran and another suite got there
 * first. The CLI now caps each probe (PROCESS_PROBE_TIMEOUT_MS), so give the
 * subprocess enough room to return the capped result rather than racing it.
 */
const PROBE_TEST_TIMEOUT_MS = 30_000;

describe("CLI api commands", () => {
  describe("api status", () => {
    it("should return status payload with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api status --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("latency_ms");
    });

    it("should render APIs box in pretty output", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} api status`);
      expect(stdout).toContain(" APIs ");
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
    /**
     * Runs with NEOTOMA_API_STOP_DRY_RUN=1 so the command reports
     * `stop_ran: false`, `dry_run: true`, and kills nothing.
     *
     * Previously this ran for real, where `api stop --env dev` SIGKILLs
     * whatever holds port 3080 — on a developer machine that is their own dev
     * server — and `kill_port.js` then sleeps 1500ms per kill. A test
     * asserting the shape of a JSON payload must not terminate unrelated
     * processes to do it. Note that cwd is NOT a way to avoid this: the CLI
     * resolves its repo root from the script's own location, so running from a
     * temp directory still finds `scripts/kill_port.js` and still kills.
     */
    it(
      "should return stop payload in JSON mode",
      async () => {
        const { stdout } = await execAsync(`${CLI_PATH} api stop --env dev --json`, {
          env: { ...process.env, NEOTOMA_API_STOP_DRY_RUN: "1" },
        });
        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("env");
        expect(result).toHaveProperty("port");
        expect(result).toHaveProperty("stop_ran");
        expect(result).toHaveProperty("message");
        expect(result.env).toBe("dev");
        expect(result.port).toBe(3080);
        expect(result.stop_ran).toBe(false);
        expect(result.dry_run).toBe(true);
        expect(String(result.message).toLowerCase()).toContain("dry-run");
        expect(String(result.message).toLowerCase()).not.toContain("source root");
      },
      PROBE_TEST_TIMEOUT_MS
    );
  });

  describe("api processes", () => {
    /**
     * Read-only: enumerates listeners on the candidate ports. The assertion
     * deliberately does not constrain `processes.length` — whether anything is
     * listening on 3080/3180 depends on the machine, and a probe that times out
     * legitimately reports an empty/partial list with probe_status ≠ ok.
     */
    it(
      "should list API processes in JSON mode",
      async () => {
        const { stdout } = await execAsync(`${CLI_PATH} api processes --json`);
        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("processes");
        expect(result).toHaveProperty("ports_checked");
        expect(result).toHaveProperty("probe_status");
        expect(Array.isArray(result.processes)).toBe(true);
        expect(result.ports_checked).toEqual([3080, 3180]);
        expect(["ok", "timed_out", "unavailable"]).toContain(result.probe_status);
      },
      PROBE_TEST_TIMEOUT_MS
    );
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
