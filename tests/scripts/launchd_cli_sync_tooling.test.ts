import { describe, expect, it, vi } from "vitest";

import {
  buildLaunchdCliSyncEnv,
  resolveLaunchdCliSyncTooling,
} from "../../scripts/lib/launchd_cli_sync_tooling.js";

describe("resolveLaunchdCliSyncTooling", () => {
  it("prefers the npm CLI script from the invoking shell", () => {
    const tooling = resolveLaunchdCliSyncTooling({
      execPath: "/Users/me/.nvm/versions/node/v20.20.0/bin/node",
      npmExecPath: "/Users/me/.nvm/versions/node/v20.20.0/lib/node_modules/npm/bin/npm-cli.js",
      pathExists: (value) =>
        value === "/Users/me/.nvm/versions/node/v20.20.0/bin/node" ||
        value === "/Users/me/.nvm/versions/node/v20.20.0/lib/node_modules/npm/bin/npm-cli.js",
      execFile: vi.fn(),
    });

    expect(tooling).toEqual({
      nodePath: "/Users/me/.nvm/versions/node/v20.20.0/bin/node",
      npmCliPath: "/Users/me/.nvm/versions/node/v20.20.0/lib/node_modules/npm/bin/npm-cli.js",
      npmBinPath: "",
    });
  });

  it("falls back to an absolute npm binary when npm_execpath is unavailable", () => {
    const execFile = vi.fn(() => "/Users/me/.nvm/versions/node/v20.20.0/bin/npm\n");

    const tooling = resolveLaunchdCliSyncTooling({
      execPath: "/Users/me/.nvm/versions/node/v20.20.0/bin/node",
      npmExecPath: "",
      env: { PATH: "/Users/me/.nvm/versions/node/v20.20.0/bin:/usr/bin:/bin" },
      pathExists: (value) =>
        value === "/Users/me/.nvm/versions/node/v20.20.0/bin/node" ||
        value === "/Users/me/.nvm/versions/node/v20.20.0/bin/npm",
      execFile,
    });

    expect(execFile).toHaveBeenCalledWith("/bin/sh", ["-lc", "command -v npm"], {
      encoding: "utf8",
      env: { PATH: "/Users/me/.nvm/versions/node/v20.20.0/bin:/usr/bin:/bin" },
    });
    expect(tooling).toEqual({
      nodePath: "/Users/me/.nvm/versions/node/v20.20.0/bin/node",
      npmCliPath: "",
      npmBinPath: "/Users/me/.nvm/versions/node/v20.20.0/bin/npm",
    });
  });
});

describe("buildLaunchdCliSyncEnv", () => {
  it("omits empty tooling values", () => {
    expect(
      buildLaunchdCliSyncEnv({
        nodePath: "/Users/me/.nvm/versions/node/v20.20.0/bin/node",
        npmCliPath: "",
        npmBinPath: "/Users/me/.nvm/versions/node/v20.20.0/bin/npm",
      }),
    ).toEqual({
      NEOTOMA_LAUNCHD_NODE: "/Users/me/.nvm/versions/node/v20.20.0/bin/node",
      NEOTOMA_LAUNCHD_NPM_BIN: "/Users/me/.nvm/versions/node/v20.20.0/bin/npm",
    });
  });
});
