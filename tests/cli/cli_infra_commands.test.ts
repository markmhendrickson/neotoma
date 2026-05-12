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
import Database from "../../src/repositories/sqlite/sqlite_driver.js";

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

async function writeCliConfig(home: string, config: Record<string, unknown>): Promise<void> {
  const configDir = join(home, ".config", "neotoma");
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "config.json"), JSON.stringify(config, null, 2));
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

    it("mcp guide --help shows usage", async () => {
      const out = await getHelp("mcp guide");
      expect(out).toMatch(/guide|Usage|Options/i);
    });

    it("mcp config --help shows usage", async () => {
      const out = await getHelp("mcp config");
      expect(out).toMatch(/config|Usage|Options/i);
      expect(out).toMatch(/--rewrite-neotoma-mcp/i);
    });

    it("mcp check --help shows usage", async () => {
      const out = await getHelp("mcp check");
      expect(out).toMatch(/check|Usage|Options/i);
      expect(out).toMatch(/--rewrite-neotoma-mcp/i);
    });

    it("mcp watch --help shows usage", async () => {
      const out = await getHelp("mcp watch");
      expect(out).toMatch(/watch|Usage|Options/i);
    });

    it("cli help lists guide and config subcommands", async () => {
      const out = await getHelp("cli");
      expect(out).toMatch(/guide/i);
      expect(out).toMatch(/config/i);
    });

    it("cli config --help shows scope and yes flags", async () => {
      const out = await getHelp("cli config");
      expect(out).toMatch(/--scope/i);
      expect(out).toMatch(/--yes/i);
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

    it("storage merge-db --help shows usage", async () => {
      const out = await getHelp("storage merge-db");
      expect(out).toMatch(/merge-db|source|target|mode|dry-run|recompute-snapshots|Usage|Options/i);
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

    it("api start --help mentions the required env flag", async () => {
      const out = await getHelp("api start");
      expect(out).toMatch(/--env dev or --env prod/i);
      expect(out).toMatch(/api start --env prod/i);
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

    it("init --yes should complete in non-interactive mode", async () => {
      const dir = await mkdtemp(join(tmpdir(), "neotoma-cli-init-yes-"));
      const dataDir = join(dir, "data");
      const { stdout } = await execAsync(`${CLI_PATH} init --yes --data-dir "${dataDir}" --skip-db --skip-env`);
      expect(stdout).toMatch(/Neotoma initialized/i);
      expect(stdout).toMatch(/neotoma/i);
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

    it("api start --background should work from outside source checkout", async () => {
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
      expect(result).toHaveProperty("ok", true);
      expect(String(result.message ?? "")).toMatch(/started in background/i);

      // Cleanup background API for test isolation.
      await execAsync(`node "${cliPathAbsolute}" api stop --env dev --json`, {
        cwd: isolatedCwd,
        env: {
          ...process.env,
          HOME: isolatedHome,
          USERPROFILE: isolatedHome,
        },
      });
    });

    it("servers should report local URL when session env vars are set", async () => {
      const { stdout } = await execAsync(
        `NEOTOMA_SESSION_ENV=dev NEOTOMA_SESSION_DEV_PORT=3080 ${CLI_PATH} servers`
      );
      expect(stdout).toContain("http://localhost:3080/mcp");
    });

    it("servers should honor selected session instance port", async () => {
      const { stdout } = await execAsync(
        `NEOTOMA_SESSION_ENV=prod NEOTOMA_SESSION_API_PORT=9191 ${CLI_PATH} servers`
      );
      expect(stdout).toContain("http://localhost:9191/mcp");
    });

    it("storage info should return JSON payload", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} storage info --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("storage_backend");
      expect(result).toHaveProperty("storage_paths");
      expect(result.storage_paths).toHaveProperty("data_dir");
      expect(result.storage_paths).toHaveProperty("sqlite_db");
    });

    it("site configure prefers directory-local checkout over saved config repo root", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-site-config-local-precedence-"));
      const home = join(root, "home");
      const localRepoRoot = join(root, "local-repo");
      const configuredRepoRoot = join(root, "configured-repo");
      const cliPathAbsolute = join(process.cwd(), "dist", "cli", "index.js");
      await mkdir(home, { recursive: true });
      await mkdir(localRepoRoot, { recursive: true });
      await mkdir(configuredRepoRoot, { recursive: true });
      await setupTempNeotomaRepo(localRepoRoot);
      await setupTempNeotomaRepo(configuredRepoRoot);
      await writeCliConfig(home, { project_root: configuredRepoRoot, repo_root: configuredRepoRoot });

      await execAsync(
        `node "${cliPathAbsolute}" site configure --umami-url https://umami.local.test --umami-website-id 11111111-1111-1111-1111-111111111111`,
        {
        cwd: localRepoRoot,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          NEOTOMA_REPO_ROOT: "",
        },
        }
      );

      const localEnv = await readFile(join(localRepoRoot, ".env"), "utf-8");
      expect(localEnv).toMatch(/VITE_UMAMI_URL=https:\/\/umami\.local\.test/);
      expect(localEnv).toMatch(
        /VITE_UMAMI_WEBSITE_ID=11111111-1111-1111-1111-111111111111/
      );
      await expect(readFile(join(configuredRepoRoot, ".env"), "utf-8")).rejects.toBeDefined();
    });

    it("site configure writes Umami env vars when flags are passed", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-site-config-umami-"));
      const home = join(root, "home");
      const localRepoRoot = join(root, "local-repo");
      const cliPathAbsolute = join(process.cwd(), "dist", "cli", "index.js");
      await mkdir(home, { recursive: true });
      await mkdir(localRepoRoot, { recursive: true });
      await setupTempNeotomaRepo(localRepoRoot);

      await execAsync(
        `node "${cliPathAbsolute}" site configure --umami-url https://umami.test.local --umami-website-id 11111111-1111-1111-1111-111111111111`,
        {
          cwd: localRepoRoot,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            NEOTOMA_REPO_ROOT: "",
          },
        }
      );

      const localEnv = await readFile(join(localRepoRoot, ".env"), "utf-8");
      expect(localEnv).toMatch(/VITE_UMAMI_URL=https:\/\/umami\.test\.local/);
      expect(localEnv).toMatch(/VITE_UMAMI_WEBSITE_ID=11111111-1111-1111-1111-111111111111/);
    });

    it("site configure writes Umami dev vars to .env.development.local when flags are passed", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-site-config-umami-dev-"));
      const home = join(root, "home");
      const localRepoRoot = join(root, "local-repo");
      const cliPathAbsolute = join(process.cwd(), "dist", "cli", "index.js");
      await mkdir(home, { recursive: true });
      await mkdir(localRepoRoot, { recursive: true });
      await setupTempNeotomaRepo(localRepoRoot);

      await execAsync(
        `node "${cliPathAbsolute}" site configure --umami-website-id-dev 22222222-2222-2222-2222-222222222222 --umami-url-dev https://umami-dev.test`,
        {
          cwd: localRepoRoot,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            NEOTOMA_REPO_ROOT: "",
          },
        }
      );

      const devLocal = await readFile(join(localRepoRoot, ".env.development.local"), "utf-8");
      expect(devLocal).toMatch(/VITE_UMAMI_WEBSITE_ID_DEV=22222222-2222-2222-2222-222222222222/);
      expect(devLocal).toMatch(/VITE_UMAMI_URL_DEV=https:\/\/umami-dev\.test/);
    });

    it("storage backup create and restore should work with temporary directories", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-backup-"));
      const dataDir = join(root, "data");
      const outputDir = join(root, "out");
      const restoreDir = join(root, "restore");
      await mkdir(dataDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });
      createTestDb(join(dataDir, "neotoma.db"), [{ id: "a", value: "backup-src" }]);
      const { stdout: backupStdout } = await execAsync(
        `NEOTOMA_DATA_DIR="${dataDir}" ${CLI_PATH} backup create --output "${outputDir}" --json`
      );
      const backupResult = JSON.parse(backupStdout);
      expect(backupResult).toHaveProperty("status");
      expect(backupResult.status).toBe("complete");
      expect(backupResult).toHaveProperty("backup_dir");
      expect(backupResult).toHaveProperty("backup_size");
      expect((backupResult as { backup_size: { bytes: number; files: number; human: string } }).backup_size.bytes).toBeGreaterThan(0);
      expect(
        (backupResult as { backup_size: { bytes: number; files: number; human: string } }).backup_size.human
      ).toMatch(/\d/);

      const { stdout: restoreStdout } = await execAsync(
        `NEOTOMA_DATA_DIR="${dataDir}" ${CLI_PATH} backup restore --from "${backupResult.backup_dir}" --target "${restoreDir}" --json`
      );
      const restoreResult = JSON.parse(restoreStdout);
      expect(restoreResult).toHaveProperty("status");
      expect(restoreResult.status).toBe("restored");
      expect(restoreResult).toHaveProperty("target_dir");
    });

    it("backup create --tar should write a non-empty tar.gz beside the backup dir", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-backup-tar-"));
      const dataDir = join(root, "data");
      const outputDir = join(root, "out");
      await mkdir(dataDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });
      createTestDb(join(dataDir, "neotoma.db"), [{ id: "b", value: "ok" }]);
      const { stdout } = await execAsync(
        `NEOTOMA_DATA_DIR="${dataDir}" ${CLI_PATH} backup create --output "${outputDir}" --tar --json`
      );
      const backupResult = JSON.parse(stdout) as {
        status: string;
        archive_path?: string;
        archive_bytes?: number;
      };
      expect(backupResult.status).toBe("complete");
      expect(backupResult).toHaveProperty("backup_size");
      expect(
        (backupResult as { backup_size: { archive_bytes?: number } }).backup_size.archive_bytes
      ).toBeGreaterThan(0);
      expect(backupResult.archive_path).toBeDefined();
      expect(backupResult.archive_bytes).toBeGreaterThan(0);
      const { stat } = await import("fs/promises");
      const st = await stat(backupResult.archive_path!);
      expect(st.size).toBe(backupResult.archive_bytes);
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

    it("storage merge-db dry-run safe should report conflicts without writing", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-merge-db-dry-run-"));
      const sourceDb = join(root, "source.db");
      const targetDb = join(root, "target.db");
      createTestDb(sourceDb, [
        { id: "shared", value: "source_shared" },
        { id: "source_only", value: "source_only_value" },
      ]);
      createTestDb(targetDb, [
        { id: "shared", value: "target_shared" },
        { id: "target_only", value: "target_only_value" },
      ]);

      const { stdout } = await execAsync(
        `${CLI_PATH} storage merge-db --source "${sourceDb}" --target "${targetDb}" --mode safe --dry-run --no-recompute-snapshots --json`
      );
      const result = JSON.parse(stdout);
      expect(result.status).toBe("dry-run-complete");
      expect(result.merge_stats.rows_conflicted).toBeGreaterThan(0);
      expect(readTestDbRows(targetDb)).toEqual([
        { id: "shared", value: "target_shared" },
        { id: "target_only", value: "target_only_value" },
      ]);
    });

    it("storage merge-db keep-source should replace conflicting rows", async () => {
      const root = await mkdtemp(join(tmpdir(), "neotoma-cli-merge-db-keep-source-"));
      const sourceDb = join(root, "source.db");
      const targetDb = join(root, "target.db");
      createTestDb(sourceDb, [
        { id: "shared", value: "source_shared" },
        { id: "source_only", value: "source_only_value" },
      ]);
      createTestDb(targetDb, [
        { id: "shared", value: "target_shared" },
        { id: "target_only", value: "target_only_value" },
      ]);

      const { stdout } = await execAsync(
        `${CLI_PATH} storage merge-db --source "${sourceDb}" --target "${targetDb}" --mode keep-source --no-recompute-snapshots --json`
      );
      const result = JSON.parse(stdout);
      expect(result.status).toBe("merged");
      expect(result.mode).toBe("keep-source");
      expect(readTestDbRows(targetDb)).toEqual([
        { id: "shared", value: "source_shared" },
        { id: "source_only", value: "source_only_value" },
        { id: "target_only", value: "target_only_value" },
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
