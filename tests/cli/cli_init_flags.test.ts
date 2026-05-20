/**
 * Tests for `neotoma init --safe` (dry-run) and `neotoma init --project-local`
 * (project-scoped config) flags.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type CliModule = {
  runCli: (argv: string[]) => Promise<void>;
};

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-init-flags-home-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const previousRepoRoot = process.env.NEOTOMA_REPO_ROOT;
  const previousDataDir = process.env.NEOTOMA_DATA_DIR;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  delete process.env.NEOTOMA_REPO_ROOT;
  delete process.env.NEOTOMA_DATA_DIR;
  try {
    return await callback(tempDir);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousRepoRoot === undefined) delete process.env.NEOTOMA_REPO_ROOT;
    else process.env.NEOTOMA_REPO_ROOT = previousRepoRoot;
    if (previousDataDir === undefined) delete process.env.NEOTOMA_DATA_DIR;
    else process.env.NEOTOMA_DATA_DIR = previousDataDir;
  }
}

function captureStdout(): { lines: () => string; restore: () => void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    if (typeof chunk === "string") chunks.push(chunk);
    return true;
  });
  return {
    lines: () => chunks.join(""),
    restore: () => spy.mockRestore(),
  };
}

function mockReadlineForInit(): void {
  vi.doMock("node:readline", () => ({
    createInterface: () => ({
      on: () => {},
      question: (_q: string, cb: (v: string) => void) => cb(""),
      close: () => {},
    }),
  }));
}

describe("neotoma init --safe (dry-run)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("exits without creating any files", async () => {
    await withTempHome(async (homeDir) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-init-safe-cwd-"));
      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        mockReadlineForInit();
        const { runCli } = await loadCli();
        const out = captureStdout();
        try {
          await runCli([
            "node",
            "cli",
            "init",
            "--safe",
            "--skip-db",
            "--skip-env",
            "--auth-mode",
            "dev_local",
          ]);
        } finally {
          out.restore();
        }

        // No files should have been created in the home dir config dir
        const configPath = path.join(homeDir, ".config", "neotoma", "config.json");
        await expect(fs.access(configPath)).rejects.toThrow();

        // The dry-run output should mention dry-run / no-files
        const text = out.lines();
        expect(text).toContain("dry-run");
      } finally {
        process.chdir(previousCwd);
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  }, 15000);

  it("reports planned actions in pretty mode", async () => {
    await withTempHome(async (_homeDir) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-init-safe-pretty-"));
      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        mockReadlineForInit();
        const { runCli } = await loadCli();
        const out = captureStdout();
        try {
          await runCli([
            "node",
            "cli",
            "init",
            "--safe",
            "--skip-db",
            "--skip-env",
            "--auth-mode",
            "dev_local",
          ]);
        } finally {
          out.restore();
        }
        const text = out.lines();
        // Should include check marks for planned actions
        expect(text).toContain("✓");
        // Should list directory creation
        expect(text).toMatch(/Create data directory|data directory/i);
      } finally {
        process.chdir(previousCwd);
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  }, 15000);

  it("reports project-local config path when combined with --project-local", async () => {
    await withTempHome(async (_homeDir) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-init-safe-local-"));
      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        mockReadlineForInit();
        const { runCli } = await loadCli();
        const out = captureStdout();
        try {
          await runCli([
            "node",
            "cli",
            "init",
            "--safe",
            "--project-local",
            "--skip-db",
            "--skip-env",
            "--auth-mode",
            "dev_local",
          ]);
        } finally {
          out.restore();
        }
        const text = out.lines();
        // Should mention the project-local config path
        expect(text).toContain(".neotoma");
        expect(text).toContain("project-local");
      } finally {
        process.chdir(previousCwd);
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  }, 15000);

  it("outputs JSON with dry_run=true and planned_actions array when --json is set", async () => {
    await withTempHome(async (_homeDir) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-init-safe-json-"));
      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        mockReadlineForInit();
        const { runCli } = await loadCli();
        const chunks: string[] = [];
        const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
          if (typeof chunk === "string") chunks.push(chunk);
          return true;
        });
        try {
          await runCli([
            "node",
            "cli",
            "--json",
            "init",
            "--safe",
            "--skip-db",
            "--skip-env",
            "--auth-mode",
            "dev_local",
          ]);
        } finally {
          spy.mockRestore();
        }
        const text = chunks.join("");
        const parsed = JSON.parse(text) as Record<string, unknown>;
        expect(parsed.ok).toBe(true);
        expect(parsed.dry_run).toBe(true);
        expect(Array.isArray(parsed.planned_actions)).toBe(true);
      } finally {
        process.chdir(previousCwd);
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  }, 15000);
});

describe("neotoma init --project-local: config module", () => {
  /**
   * These tests exercise the config module functions directly to avoid
   * running the full init flow (which requires SQLite and server setup).
   */
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("projectLocalConfigPath returns .neotoma/config.json relative to cwd", async () => {
    const { projectLocalConfigPath } = await import("../../src/cli/config.ts");
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-plcp-"));
    try {
      const result = projectLocalConfigPath(cwd);
      expect(result).toBe(path.join(cwd, ".neotoma", "config.json"));
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it("writeProjectLocalConfig creates .neotoma/config.json with the supplied config", async () => {
    const { writeProjectLocalConfig } = await import("../../src/cli/config.ts");
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-wplc-"));
    try {
      const testConfig = { init_auth_mode: "dev_local" as const, project_root: "/some/path" };
      const writtenPath = await writeProjectLocalConfig(testConfig, cwd);
      expect(writtenPath).toBe(path.join(cwd, ".neotoma", "config.json"));

      const raw = await fs.readFile(writtenPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.init_auth_mode).toBe("dev_local");
      expect(parsed.project_root).toBe("/some/path");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it("writeProjectLocalConfig creates the .neotoma directory if it does not exist", async () => {
    const { writeProjectLocalConfig } = await import("../../src/cli/config.ts");
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-wplc-mkdir-"));
    try {
      const neotomaDir = path.join(cwd, ".neotoma");
      // Directory should not exist yet
      await expect(fs.access(neotomaDir)).rejects.toThrow();

      await writeProjectLocalConfig({ init_auth_mode: "dev_local" as const }, cwd);

      // Directory should now exist
      await expect(fs.access(neotomaDir)).resolves.toBeUndefined();
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it("readEffectiveConfig prefers project-local config over user-level config", async () => {
    const { readEffectiveConfig, writeProjectLocalConfig, writeConfig } = await import(
      "../../src/cli/config.ts"
    );
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-rec-"));
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-rec-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      // Write user-level config
      await writeConfig({ init_auth_mode: "oauth" as const, project_root: "/user/path" });
      // Write project-local config with different values
      await writeProjectLocalConfig(
        { init_auth_mode: "dev_local" as const, project_root: "/local/path" },
        cwd
      );

      const effective = await readEffectiveConfig(cwd);
      expect(effective._source).toBe("project-local");
      expect(effective.init_auth_mode).toBe("dev_local");
      expect(effective.project_root).toBe("/local/path");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });

  it("readEffectiveConfig falls back to user-level config when no project-local config exists", async () => {
    const { readEffectiveConfig, writeConfig } = await import("../../src/cli/config.ts");
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-rec-fallback-"));
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-rec-fallback-home-"));
    const previousHome = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      // Write only user-level config; no project-local
      await writeConfig({ init_auth_mode: "oauth" as const, project_root: "/user/path" });

      const effective = await readEffectiveConfig(cwd);
      expect(effective._source).toBe("user");
      expect(effective.init_auth_mode).toBe("oauth");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });

  it("writeProjectLocalConfig writes the file with mode 0600", async () => {
    const { writeProjectLocalConfig } = await import("../../src/cli/config.ts");
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-wplc-mode-"));
    try {
      const writtenPath = await writeProjectLocalConfig(
        { init_auth_mode: "dev_local" as const },
        cwd
      );
      const stat = await fs.stat(writtenPath);
      // mode & 0o777 gives the permission bits; 0o600 = owner r/w only
      expect(stat.mode & 0o777).toBe(0o600);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("neotoma init --safe: blocker detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("reports a blocker when config target already exists (without --force)", async () => {
    await withTempHome(async (homeDir) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-safe-blocker-"));
      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        mockReadlineForInit();
        // Pre-create the config file so init would encounter an existing config
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify({}));

        const { runCli } = await loadCli();
        const out = captureStdout();
        const previousExitCode = process.exitCode;
        try {
          await runCli([
            "node",
            "cli",
            "init",
            "--safe",
            "--skip-db",
            "--skip-env",
            "--auth-mode",
            "dev_local",
          ]);
        } finally {
          out.restore();
        }
        const text = out.lines();
        // Should report a blocker for the existing config
        expect(text).toMatch(/already exists|blocker/i);
        // exit code should be non-zero when there's a blocker
        expect(process.exitCode).toBe(1);
        process.exitCode = previousExitCode;
      } finally {
        process.chdir(previousCwd);
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  }, 15000);

  it("does not report a blocker when --force is given and config already exists", async () => {
    await withTempHome(async (homeDir) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-safe-force-"));
      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        mockReadlineForInit();
        // Pre-create the config file
        const configDir = path.join(homeDir, ".config", "neotoma");
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify({}));

        const { runCli } = await loadCli();
        const out = captureStdout();
        const previousExitCode = process.exitCode;
        try {
          await runCli([
            "node",
            "cli",
            "init",
            "--safe",
            "--force",
            "--skip-db",
            "--skip-env",
            "--auth-mode",
            "dev_local",
          ]);
        } finally {
          out.restore();
        }
        const text = out.lines();
        // With --force the config-exists blocker should not appear
        expect(text).not.toMatch(/already exists.*blocker/i);
        // No blocker → "All checks passed"
        expect(text).toMatch(/all checks passed/i);
        process.exitCode = previousExitCode;
      } finally {
        process.chdir(previousCwd);
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  }, 15000);

  it("omits database entries from planned actions when --skip-db is given", async () => {
    await withTempHome(async (_homeDir) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-safe-skipdb-"));
      const previousCwd = process.cwd();
      process.chdir(cwd);
      try {
        mockReadlineForInit();
        const { runCli } = await loadCli();
        const chunks: string[] = [];
        const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
          if (typeof chunk === "string") chunks.push(chunk);
          return true;
        });
        try {
          await runCli([
            "node",
            "cli",
            "--json",
            "init",
            "--safe",
            "--skip-db",
            "--skip-env",
            "--auth-mode",
            "dev_local",
          ]);
        } finally {
          spy.mockRestore();
        }
        const parsed = JSON.parse(chunks.join("")) as { planned_actions: Array<{ label: string }> };
        const labels = parsed.planned_actions.map((a) => a.label);
        // When --skip-db is set, no "Initialize database" entries should appear
        expect(labels.every((l) => !l.toLowerCase().includes("database"))).toBe(true);
      } finally {
        process.chdir(previousCwd);
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  }, 15000);
});
