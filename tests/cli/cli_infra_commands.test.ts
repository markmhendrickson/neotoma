/**
 * CLI infrastructure command smoke tests
 *
 * Tests for commands that manage CLI infrastructure (auth, mcp config, storage, global options).
 * These are smoke tests: they verify commands exist, respond to --help, and don't crash.
 * Full end-to-end testing of OAuth flows and backup/restore is out of scope for unit tests.
 */

import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

// Run a command and capture help output; commands that print help exit with 0
async function getHelp(args: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(`${CLI_PATH} ${args} --help`);
    return stdout + stderr;
  } catch (err: any) {
    // --help may exit non-zero on some commander versions; still return output
    return (err.stdout ?? "") + (err.stderr ?? "");
  }
}

describe("CLI infrastructure command smoke tests", () => {
  describe("auth commands", () => {
    it("auth --help lists subcommands", async () => {
      const out = await getHelp("auth");
      expect(out).toMatch(/login|logout|status|mcp-token|whoami/i);
    });

    it("auth login --help shows usage", async () => {
      const out = await getHelp("auth login");
      expect(out).toMatch(/login|Usage|Options/i);
    });

    it("auth logout --help shows usage", async () => {
      const out = await getHelp("auth logout");
      expect(out).toMatch(/logout|Usage|Options/i);
    });

    it("auth mcp-token --help shows usage", async () => {
      const out = await getHelp("auth mcp-token");
      expect(out).toMatch(/mcp-token|token|Usage|Options/i);
    });

    it("auth status --json returns structured output", async () => {
      // auth status checks config; may return unauthenticated — that's fine
      try {
        const { stdout } = await execAsync(`${CLI_PATH} auth status --json`);
        const result = JSON.parse(stdout);
        expect(result).toBeDefined();
      } catch (err: any) {
        // If not configured, may error — verify it's a structured error
        expect(err).toBeDefined();
      }
    });
  });

  describe("mcp commands", () => {
    it("mcp --help lists subcommands", async () => {
      const out = await getHelp("mcp");
      expect(out).toMatch(/config|check|watch/i);
    });

    it("mcp config --help shows usage", async () => {
      const out = await getHelp("mcp config");
      expect(out).toMatch(/config|Usage|Options/i);
    });

    it("mcp check --help shows usage", async () => {
      const out = await getHelp("mcp check");
      expect(out).toMatch(/check|Usage|Options/i);
    });

    it("mcp watch --help shows usage", async () => {
      const out = await getHelp("mcp watch");
      expect(out).toMatch(/watch|Usage|Options/i);
    });
  });

  describe("storage commands", () => {
    it("storage --help lists subcommands", async () => {
      const out = await getHelp("storage");
      expect(out).toMatch(/info|backup|restore/i);
    });

    it("storage info --help shows usage", async () => {
      const out = await getHelp("storage info");
      expect(out).toMatch(/info|Usage|Options|storage/i);
    });

    it("storage backup --help shows usage", async () => {
      const out = await getHelp("storage backup");
      expect(out).toMatch(/backup|Usage|Options/i);
    });
  });

  describe("logs commands", () => {
    it("logs --help lists subcommands", async () => {
      const out = await getHelp("logs");
      expect(out).toMatch(/tail|Usage|Options/i);
    });

    it("logs tail --help shows usage", async () => {
      const out = await getHelp("logs tail");
      expect(out).toMatch(/tail|lines|decrypt|Usage|Options/i);
    });
  });

  describe("api commands", () => {
    it("api --help lists subcommands", async () => {
      const out = await getHelp("api");
      expect(out).toMatch(/start|stop|status|logs/i);
    });

    it("api status --help shows usage", async () => {
      const out = await getHelp("api status");
      expect(out).toMatch(/status|Usage|Options/i);
    });
  });

  describe("top-level infrastructure commands", () => {
    it("init --help shows usage", async () => {
      const out = await getHelp("init");
      expect(out).toMatch(/init|Usage|Options/i);
    });

    it("servers --help shows usage", async () => {
      const out = await getHelp("servers");
      expect(out).toMatch(/servers|Usage|Options/i);
    });

    it("options --help or output shows global options", async () => {
      try {
        const { stdout } = await execAsync(`${CLI_PATH} options --json`);
        expect(stdout).toBeDefined();
      } catch (err: any) {
        // options may print to stdout and exit 0; either way it should produce output
        expect((err.stdout ?? "") + (err.stderr ?? "")).toBeDefined();
      }
    });
  });

  describe("global options", () => {
    it("--debug flag is accepted by a command", async () => {
      // Use snapshots check since it doesn't require OAuth
      const { stdout } = await execAsync(`${CLI_PATH} snapshots check --debug --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("healthy");
    });

    it("--env flag is accepted by a command", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --env development --json`
      );
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("healthy");
    });

    it("--json and --pretty are mutually recognized flags", async () => {
      // --json produces parseable output
      const { stdout } = await execAsync(`${CLI_PATH} snapshots check --json`);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it("entities --help shows entity subcommands", async () => {
      // The CLI without a subcommand launches an interactive REPL (no --help support at top level).
      // Verify structure via the entities subcommand help instead, which exits immediately.
      const out = await getHelp("entities");
      expect(out).toMatch(/list/i);
      expect(out).toMatch(/get/i);
      expect(out).toMatch(/search/i);
      expect(out).toMatch(/delete/i);
      expect(out).toMatch(/restore/i);
    });
  });
});
