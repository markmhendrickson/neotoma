import { exec } from "node:child_process";
import { mkdtemp, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);
const CLI_PATH = `node "${path.join(process.cwd(), "dist", "cli", "index.js")}"`;

function isolatedEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    NEOTOMA_REPO_ROOT: "",
    NEOTOMA_DATA_DIR: "",
    ...extra,
  };
}

describe("Integration: init bootstrap operability", () => {
  it("bootstraps a local setup usable by follow-up infrastructure commands", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-bootstrap-"));
    const home = path.join(root, "home");
    const dataDir = path.join(root, "data");
    await mkdir(home, { recursive: true });

    const { stdout: initStdout } = await execAsync(
      `${CLI_PATH} init --yes --skip-db --data-dir "${dataDir}" --json`,
      {
        env: isolatedEnv(home),
      }
    );
    const initResult = JSON.parse(initStdout) as {
      success: boolean;
      data_dir: string;
    };
    expect(initResult.success).toBe(true);
    expect(initResult.data_dir).toBe(dataDir);
    await expect(stat(path.join(dataDir, "sources"))).resolves.toBeDefined();
    await expect(stat(path.join(dataDir, "logs"))).resolves.toBeDefined();

    const { stdout: storageStdout } = await execAsync(`${CLI_PATH} storage info --json`, {
      env: isolatedEnv(home, { NEOTOMA_DATA_DIR: dataDir }),
    });
    const storageInfo = JSON.parse(storageStdout) as {
      storage_paths?: { data_dir?: string; sqlite_db?: string };
    };
    expect(storageInfo.storage_paths?.data_dir).toContain(path.basename(dataDir));
    expect(storageInfo.storage_paths?.sqlite_db).toBeDefined();

    const { stdout: authStdout } = await execAsync(`${CLI_PATH} auth status --json`, {
      env: isolatedEnv(home, { NEOTOMA_DATA_DIR: dataDir }),
    });
    const authStatus = JSON.parse(authStdout) as { auth_mode?: string; base_url?: string };
    expect(authStatus.auth_mode).toBeDefined();
    expect(authStatus.base_url).toMatch(/^http/);

    const { stdout: apiStdout } = await execAsync(`${CLI_PATH} api status --json`, {
      env: isolatedEnv(home, { NEOTOMA_DATA_DIR: dataDir }),
    });
    const apiStatus = JSON.parse(apiStdout) as { status?: string; url?: string };
    expect(apiStatus.status).toMatch(/up|down/);
    expect(apiStatus.url).toMatch(/^http/);
  });
});
