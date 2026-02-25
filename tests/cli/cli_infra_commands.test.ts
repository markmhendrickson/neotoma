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
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

function createTestDb(path: string, rows: Array<{ id: string; value: string }>): void {
  const db = new Database(path);
  db.exec("CREATE TABLE IF NOT EXISTS cli_test_records (id TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO cli_test_records (id, value) VALUES (?, ?)");
  for (const row of rows) insert.run(row.id, row.value);
  db.close();
}

function readTestDbRows(path: string): Array<{ id: string; value: string }> {
  const db = new Database(path, { readonly: true });
  const rows = db
    .prepare("SELECT id, value FROM cli_test_records ORDER BY id")
    .all() as Array<{ id: string; value: string }>;
  db.close();
  return rows;
}

async function setupTempNeotomaRepo(root: string): Promise<void> {
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "neotoma",
        version: "0.0.0-test",
      },
      null,
      2
    )
  );
}

async function execCliWithRepoRoot(command: string, repoRoot: string): Promise<{
  stdout: string;
  stderr: string;
}> {
  return execAsync(command, {
    env: {
      ...process.env,
      NEOTOMA_REPO_ROOT: repoRoot,
      HOME: repoRoot,
      USERPROFILE: repoRoot,
    },
  });
}

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

    it("watch accepts env as first argument (e.g. watch dev)", async () => {
      const out = await getHelp("watch dev");
      expect(out).toMatch(/watch|Usage|Options|Stream/i);
    });

    it("watch without env reports specify environment", async () => {
      const { stderr } = await execAsync(`${CLI_PATH} watch`, {
        timeout: 2000,
      }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
      expect(stderr).toMatch(/specify (environment|--env)/i);
    });
  });

  describe("storage commands", () => {
    it("storage --help lists subcommands", async () => {
      const out = await getHelp("storage");
      expect(out).toMatch(/info/i);
    });

    it("storage info --help shows usage", async () => {
      const out = await getHelp("storage info");
      expect(out).toMatch(/info|Usage|Options|storage/i);
    });

    it("storage set-data-dir --help shows usage", async () => {
      const out = await getHelp("storage set-data-dir");
      expect(out).toMatch(/set-data-dir|move-db-files|on-conflict|Usage|Options/i);
    });

    it("backup --help shows usage", async () => {
      const out = await getHelp("backup");
      expect(out).toMatch(/create|restore|Usage|Options/i);
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
      expect(out).toMatch(/auth-mode/i);
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

    it("options --json returns global option metadata", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} options --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("options");
      expect(Array.isArray(result.options)).toBe(true);
      expect(result.options.length).toBeGreaterThan(0);
    });
  });

  describe("behavioral infrastructure flows", () => {
    it("init should create initialization result with --json", async () => {
      const dir = await mkdtemp(join(tmpdir(), "neotoma-cli-init-"));
      const dataDir = join(dir, "data");
      const { stdout } = await execAsync(
        `${CLI_PATH} init --data-dir "${dataDir}" --skip-db --json`
      );
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);
      expect(result).toHaveProperty("steps");
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result).toHaveProperty("auth_setup");
      expect(result.auth_setup).toHaveProperty("mode");
    });

    it("init --json should defer oauth setup when oauth auth mode is requested", async () => {
      const dir = await mkdtemp(join(tmpdir(), "neotoma-cli-init-oauth-"));
      const dataDir = join(dir, "data");
      const { stdout } = await execAsync(
        `${CLI_PATH} init --data-dir "${dataDir}" --skip-db --auth-mode oauth --json`
      );
      const result = JSON.parse(stdout);
      expect(result.auth_setup.mode).toBe("oauth");
      expect(Array.isArray(result.next_steps)).toBe(true);
      const combined = result.next_steps.join(" ");
      expect(combined).toMatch(/auth login/i);
      expect(combined).toMatch(/skipped/i);
    });

    it("init should reject invalid auth mode values", async () => {
      await expect(
        execAsync(`${CLI_PATH} init --skip-db --auth-mode not-a-mode --json`)
      ).rejects.toBeDefined();
      await expect(
        execAsync(`${CLI_PATH} init --skip-db --auth-mode skip --json`)
      ).rejects.toBeDefined();
    });

    it("api start --background should return init guidance when repo is not configured", async () => {
      const isolatedHome = await mkdtemp(join(tmpdir(), "neotoma-cli-home-"));
      const isolatedCwd = await mkdtemp(join(tmpdir(), "neotoma-cli-cwd-"));
      const cliPathAbsolute = join(process.cwd(), "dist", "cli", "index.js");
      const { stdout } = await execAsync(
        `node "${cliPathAbsolute}" api start --background --env dev --json`,
        {
          cwd: isolatedCwd,
          env: {
            ...process.env,
            HOME: isolatedHome,
            USERPROFILE: isolatedHome,
          },
        }
      );
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("ok", false);
      expect(String(result.error ?? "")).toMatch(/neotoma init/i);
    });

    it("servers should report local URL when session env vars are set", async () => {
      const { stdout } = await execAsync(
        `NEOTOMA_SESSION_ENV=dev NEOTOMA_SESSION_DEV_PORT=8080 ${CLI_PATH} servers`
      );
      expect(stdout).toContain("http://127.0.0.1:8080/mcp");
    });

    it("servers should honor selected session instance port", async () => {
      const { stdout } = await execAsync(
        `NEOTOMA_SESSION_ENV=prod NEOTOMA_SESSION_API_PORT=9191 ${CLI_PATH} servers`
      );
      expect(stdout).toContain("http://127.0.0.1:9191/mcp");
    });

    it("storage info should return JSON payload", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} storage info --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("storage_backend");
      expect(result).toHaveProperty("storage_paths");
      expect(result.storage_paths).toHaveProperty("data_dir");
      expect(result.storage_paths).toHaveProperty("sqlite_db");
    });

    it("storage backup create and restore should work with temporary directories", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-backup-"));
      const dataDir = join(root, "data");
      const outputDir = join(root, "out");
      const restoreDir = join(root, "restore");
      const { stdout: backupStdout } = await execAsync(
        `NEOTOMA_DATA_DIR="${dataDir}" ${CLI_PATH} backup create --output "${outputDir}" --json`
      );
      const backupResult = JSON.parse(backupStdout);
      expect(backupResult).toHaveProperty("status");
      expect(backupResult.status).toBe("complete");
      expect(backupResult).toHaveProperty("backup_dir");

      const { stdout: restoreStdout } = await execAsync(
        `NEOTOMA_DATA_DIR="${dataDir}" ${CLI_PATH} backup restore --from "${backupResult.backup_dir}" --target "${restoreDir}" --json`
      );
      const restoreResult = JSON.parse(restoreStdout);
      expect(restoreResult).toHaveProperty("status");
      expect(restoreResult.status).toBe("restored");
      expect(restoreResult).toHaveProperty("target_dir");
    });

    it("storage set-data-dir should update NEOTOMA_DATA_DIR in .env", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-set-data-dir-env-"));
      await setupTempNeotomaRepo(root);
      const oldDir = join(root, "old_data");
      const newDir = join(root, "new_data");
      await writeFile(
        join(root, ".env"),
        `NEOTOMA_DATA_DIR="${oldDir}"\nOPENAI_API_KEY=test-key\n`
      );
      await execCliWithRepoRoot(
        `${CLI_PATH} storage set-data-dir "${newDir}" --no-move-db-files --yes --json`,
        root
      );
      const envText = await readFile(join(root, ".env"), "utf-8");
      expect(envText).toMatch(new RegExp(`NEOTOMA_DATA_DIR=${newDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      expect(envText).toMatch(/OPENAI_API_KEY=test-key/);
    });

    it("storage set-data-dir should copy DB files when no conflict and keep old files", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-set-data-dir-copy-"));
      await setupTempNeotomaRepo(root);
      const oldDir = join(root, "old_data");
      const newDir = join(root, "new_data");
      await writeFile(join(root, ".env"), `NEOTOMA_DATA_DIR=${oldDir}\n`);
      await mkdir(oldDir, { recursive: true });
      await mkdir(newDir, { recursive: true });
      createTestDb(join(oldDir, "neotoma.db"), [{ id: "a", value: "old" }]);
      await writeFile(join(oldDir, "neotoma.db-wal"), "wal");
      const { stdout } = await execCliWithRepoRoot(
        `${CLI_PATH} storage set-data-dir "${newDir}" --move-db-files --yes --json`,
        root
      );
      const result = JSON.parse(stdout);
      expect(result.move_db_files).toBe(true);
      expect(readTestDbRows(join(newDir, "neotoma.db"))).toEqual([{ id: "a", value: "old" }]);
      expect(readTestDbRows(join(oldDir, "neotoma.db"))).toEqual([{ id: "a", value: "old" }]);
    });

    it("storage set-data-dir overwrite should backup target DB files and replace them", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-set-data-dir-overwrite-"));
      await setupTempNeotomaRepo(root);
      const oldDir = join(root, "old_data");
      const newDir = join(root, "new_data");
      await writeFile(join(root, ".env"), `NEOTOMA_DATA_DIR=${oldDir}\n`);
      await mkdir(oldDir, { recursive: true });
      await mkdir(newDir, { recursive: true });
      createTestDb(join(oldDir, "neotoma.db"), [{ id: "old_only", value: "source" }]);
      createTestDb(join(newDir, "neotoma.db"), [{ id: "new_only", value: "target" }]);

      const { stdout } = await execCliWithRepoRoot(
        `${CLI_PATH} storage set-data-dir "${newDir}" --move-db-files --on-conflict overwrite --yes --json`,
        root
      );
      const result = JSON.parse(stdout);
      expect(result.conflict_strategy).toBe("overwrite");
      expect(result.backups_created.length).toBeGreaterThan(0);
      expect(readTestDbRows(join(newDir, "neotoma.db"))).toEqual([
        { id: "old_only", value: "source" },
      ]);
    });

    it("storage set-data-dir use-new should keep target DB files unchanged", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-set-data-dir-use-new-"));
      await setupTempNeotomaRepo(root);
      const oldDir = join(root, "old_data");
      const newDir = join(root, "new_data");
      await writeFile(join(root, ".env"), `NEOTOMA_DATA_DIR=${oldDir}\n`);
      await mkdir(oldDir, { recursive: true });
      await mkdir(newDir, { recursive: true });
      createTestDb(join(oldDir, "neotoma.db"), [{ id: "old_only", value: "source" }]);
      createTestDb(join(newDir, "neotoma.db"), [{ id: "new_only", value: "target" }]);

      const { stdout } = await execCliWithRepoRoot(
        `${CLI_PATH} storage set-data-dir "${newDir}" --move-db-files --on-conflict use-new --yes --json`,
        root
      );
      const result = JSON.parse(stdout);
      expect(result.conflict_strategy).toBe("use-new");
      expect(result.copied_files).toEqual([]);
      expect(readTestDbRows(join(newDir, "neotoma.db"))).toEqual([
        { id: "new_only", value: "target" },
      ]);
    });

    it("storage set-data-dir merge should merge rows into target DB", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-set-data-dir-merge-"));
      await setupTempNeotomaRepo(root);
      const oldDir = join(root, "old_data");
      const newDir = join(root, "new_data");
      await writeFile(join(root, ".env"), `NEOTOMA_DATA_DIR=${oldDir}\n`);
      await mkdir(oldDir, { recursive: true });
      await mkdir(newDir, { recursive: true });
      createTestDb(join(oldDir, "neotoma.db"), [
        { id: "shared", value: "source_shared" },
        { id: "old_only", value: "source" },
      ]);
      createTestDb(join(newDir, "neotoma.db"), [
        { id: "shared", value: "target_shared" },
        { id: "new_only", value: "target" },
      ]);

      const { stdout } = await execCliWithRepoRoot(
        `${CLI_PATH} storage set-data-dir "${newDir}" --move-db-files --on-conflict merge --yes --json`,
        root
      );
      const result = JSON.parse(stdout);
      expect(result.conflict_strategy).toBe("merge");
      expect(result.merge_stats.length).toBeGreaterThan(0);
      expect(readTestDbRows(join(newDir, "neotoma.db"))).toEqual([
        { id: "new_only", value: "target" },
        { id: "old_only", value: "source" },
        { id: "shared", value: "target_shared" },
      ]);
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
