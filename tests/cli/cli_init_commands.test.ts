import { exec } from "node:child_process";
import { mkdtemp, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);
const CLI_PATH = `node "${path.join(process.cwd(), "dist", "cli", "index.js")}"`;

async function setupTempNeotomaRepo(root: string): Promise<void> {
  await mkdir(path.join(root, "src", "cli"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
  );
  await writeFile(path.join(root, "src", "cli", "index.ts"), "// test marker\n");
}

async function writeCliConfig(home: string, config: Record<string, unknown>): Promise<void> {
  const configDir = path.join(home, ".config", "neotoma");
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, "config.json"), JSON.stringify(config, null, 2));
}

function baseEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    NEOTOMA_REPO_ROOT: "",
    NEOTOMA_DATA_DIR: "",
    ...extra,
  };
}

describe("CLI init command non-interactive coverage", () => {
  it("creates directories and both sqlite files by default", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-default-"));
    const dataDir = path.join(root, "data");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });

    const { stdout } = await execAsync(`${CLI_PATH} init --yes --data-dir "${dataDir}" --skip-env --json`, {
      env: baseEnv(home),
    });
    const result = JSON.parse(stdout) as {
      success: boolean;
      steps: Array<{ name: string; status: string; path?: string }>;
    };

    expect(result.success).toBe(true);
    await expect(stat(dataDir)).resolves.toBeDefined();
    await expect(stat(path.join(dataDir, "sources"))).resolves.toBeDefined();
    await expect(stat(path.join(dataDir, "logs"))).resolves.toBeDefined();
    await expect(stat(path.join(dataDir, "neotoma.db"))).resolves.toBeDefined();
    await expect(stat(path.join(dataDir, "neotoma.prod.db"))).resolves.toBeDefined();
    expect(result.steps.some((step) => step.name === "neotoma.db")).toBe(true);
    expect(result.steps.some((step) => step.name === "neotoma.prod.db")).toBe(true);
  });

  it("skips db initialization with --skip-db", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-skip-db-"));
    const dataDir = path.join(root, "data");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });

    const { stdout } = await execAsync(`${CLI_PATH} init --yes --skip-db --data-dir "${dataDir}" --skip-env --json`, {
      env: baseEnv(home),
    });
    const result = JSON.parse(stdout) as {
      steps: Array<{ name: string; status: string }>;
    };

    expect(result.steps).toContainEqual({ name: "database", status: "skipped" });
    await expect(stat(path.join(dataDir, "neotoma.db"))).rejects.toBeDefined();
    await expect(stat(path.join(dataDir, "neotoma.prod.db"))).rejects.toBeDefined();
  });

  it("reuses existing db files without force", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-reuse-"));
    const dataDir = path.join(root, "data");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "neotoma.db"), "");
    await writeFile(path.join(dataDir, "neotoma.prod.db"), "");

    const { stdout } = await execAsync(`${CLI_PATH} init --yes --data-dir "${dataDir}" --skip-env --json`, {
      env: baseEnv(home),
    });
    const result = JSON.parse(stdout) as {
      steps: Array<{ name: string; status: string }>;
    };

    expect(result.steps.some((step) => step.name === "neotoma.db" && step.status === "exists")).toBe(
      true
    );
    expect(
      result.steps.some((step) => step.name === "neotoma.prod.db" && step.status === "exists")
    ).toBe(true);
  });

  it("marks existing db files as done with --force", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-force-"));
    const dataDir = path.join(root, "data");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "neotoma.db"), "");
    await writeFile(path.join(dataDir, "neotoma.prod.db"), "");

    const { stdout } = await execAsync(
      `${CLI_PATH} init --yes --force --data-dir "${dataDir}" --skip-env --json`,
      {
        env: baseEnv(home),
      }
    );
    const result = JSON.parse(stdout) as {
      steps: Array<{ name: string; status: string }>;
    };

    expect(result.steps.some((step) => step.name === "neotoma.db" && step.status === "done")).toBe(
      true
    );
    expect(
      result.steps.some((step) => step.name === "neotoma.prod.db" && step.status === "done")
    ).toBe(true);
  });

  it("does not create project .env when --skip-env is set", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-skip-env-"));
    const repoRoot = path.join(root, "repo");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    await mkdir(repoRoot, { recursive: true });
    await setupTempNeotomaRepo(repoRoot);

    await execAsync(`${CLI_PATH} init --yes --skip-db --skip-env`, {
      cwd: repoRoot,
      env: baseEnv(home, { NEOTOMA_REPO_ROOT: repoRoot }),
    });

    await expect(stat(path.join(repoRoot, ".env"))).rejects.toBeDefined();
  });

  it("reports auth next steps for dev_local and key_derived modes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-auth-"));
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });

    const { stdout: devLocalStdout } = await execAsync(
      `${CLI_PATH} init --yes --skip-db --skip-env --auth-mode dev_local --json`,
      {
        env: baseEnv(home),
      }
    );
    const devLocalResult = JSON.parse(devLocalStdout) as { next_steps: string[] };
    expect(devLocalResult.next_steps.join(" ")).toMatch(/Using local mode/i);

    const { stdout: keyDerivedStdout } = await execAsync(
      `${CLI_PATH} init --yes --skip-db --skip-env --auth-mode key_derived --json`,
      {
        env: baseEnv(home),
      }
    );
    const keyDerivedResult = JSON.parse(keyDerivedStdout) as { next_steps: string[] };
    expect(keyDerivedResult.next_steps.join(" ")).toMatch(/Enable key-derived auth/i);
  });

  it("includes canonical init guidance in json mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-user-env-"));
    const dataDir = path.join(root, "data");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });

    const { stdout } = await execAsync(`${CLI_PATH} init --yes --skip-db --data-dir "${dataDir}" --json`, {
      env: baseEnv(home),
    });
    const result = JSON.parse(stdout) as { next_steps: string[] };
    expect(result.next_steps.join(" ")).toMatch(/Start the API/i);
    expect(result.next_steps.join(" ")).toMatch(/mcp config/i);
  });

  it("prefers directory-local checkout over saved config repo root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-local-over-config-"));
    const localRepoRoot = path.join(root, "local-repo");
    const configuredRepoRoot = path.join(root, "configured-repo");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    await mkdir(localRepoRoot, { recursive: true });
    await mkdir(configuredRepoRoot, { recursive: true });
    await setupTempNeotomaRepo(localRepoRoot);
    await setupTempNeotomaRepo(configuredRepoRoot);
    await writeCliConfig(home, { project_root: configuredRepoRoot, repo_root: configuredRepoRoot });

    await execAsync(`${CLI_PATH} init --yes --skip-db --skip-env --json`, {
      cwd: localRepoRoot,
      env: baseEnv(home),
    });

    await expect(stat(path.join(localRepoRoot, "data"))).resolves.toBeDefined();
    await expect(stat(path.join(configuredRepoRoot, "data"))).rejects.toBeDefined();
  });

  it("prefers NEOTOMA_REPO_ROOT over directory-local checkout", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-env-over-local-"));
    const localRepoRoot = path.join(root, "local-repo");
    const envRepoRoot = path.join(root, "env-repo");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    await mkdir(localRepoRoot, { recursive: true });
    await mkdir(envRepoRoot, { recursive: true });
    await setupTempNeotomaRepo(localRepoRoot);
    await setupTempNeotomaRepo(envRepoRoot);

    await execAsync(`${CLI_PATH} init --yes --skip-db --skip-env --json`, {
      cwd: localRepoRoot,
      env: baseEnv(home, { NEOTOMA_REPO_ROOT: envRepoRoot }),
    });

    await expect(stat(path.join(envRepoRoot, "data"))).resolves.toBeDefined();
    await expect(stat(path.join(localRepoRoot, "data"))).rejects.toBeDefined();
  });

  it("falls back to saved config repo root when not in a checkout", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-config-fallback-"));
    const configuredRepoRoot = path.join(root, "configured-repo");
    const home = path.join(root, "home");
    const outsideDir = path.join(root, "outside");
    await mkdir(home, { recursive: true });
    await mkdir(configuredRepoRoot, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await setupTempNeotomaRepo(configuredRepoRoot);
    await writeCliConfig(home, { project_root: configuredRepoRoot, repo_root: configuredRepoRoot });

    await execAsync(`${CLI_PATH} init --yes --skip-db --skip-env --json`, {
      cwd: outsideDir,
      env: baseEnv(home),
    });

    await expect(stat(path.join(configuredRepoRoot, "data"))).resolves.toBeDefined();
  });

  it("shows configuration box data via init configuration command", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-configuration-command-"));
    const repoRoot = path.join(root, "repo");
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    await mkdir(repoRoot, { recursive: true });
    await setupTempNeotomaRepo(repoRoot);

    await execAsync(`${CLI_PATH} init --yes --skip-db --skip-env --json`, {
      cwd: repoRoot,
      env: baseEnv(home, { NEOTOMA_REPO_ROOT: repoRoot }),
    });

    const { stdout } = await execAsync(`${CLI_PATH} init configuration --json`, {
      cwd: repoRoot,
      env: baseEnv(home, { NEOTOMA_REPO_ROOT: repoRoot }),
    });
    const result = JSON.parse(stdout) as { configuration_lines: string[] };
    expect(Array.isArray(result.configuration_lines)).toBe(true);
    expect(result.configuration_lines.join(" ")).toMatch(/env configured/i);
  });

  it("applies scope and setup flags in non-interactive mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-nonint-flags-"));
    const repoRoot = path.join(root, "repo");
    const home = path.join(root, "home");
    const dataDir = path.join(root, "data");
    await mkdir(home, { recursive: true });
    await mkdir(repoRoot, { recursive: true });
    await setupTempNeotomaRepo(repoRoot);

    const { stdout } = await execAsync(
      `${CLI_PATH} init --yes --skip-db --skip-env --data-dir "${dataDir}" --scope skip --configure-mcp no --configure-cli no --openai-api-key "sk-test-key" --json`,
      {
        cwd: repoRoot,
        env: baseEnv(home, { NEOTOMA_REPO_ROOT: repoRoot }),
      }
    );

    const result = JSON.parse(stdout) as {
      success: boolean;
      data_dir: string;
      steps: Array<{ name: string; status: string }>;
    };
    expect(result.success).toBe(true);
    expect(result.data_dir).toBe(dataDir);
    expect(result.steps.some((step) => step.name === "database" && step.status === "skipped")).toBe(true);
  });

  it("validates invalid optional flag values", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-invalid-flag-"));
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });

    await expect(
      execAsync(`${CLI_PATH} init --yes --skip-db --skip-env --scope banana --json`, {
        env: baseEnv(home),
      })
    ).rejects.toThrow(/Invalid --scope/);
  });
});
