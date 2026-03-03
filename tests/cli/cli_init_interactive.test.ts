import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

type CliModule = {
  runCli: (argv: string[]) => Promise<void>;
  resolveInitDataDirDefaults: (params: {
    repoRoot: string | null;
    envPath: string | null;
    homeDir?: string;
    cwd?: string;
    processEnvDataDir?: string;
  }) => Promise<{
    defaultDataDir: string;
    defaultDataDirCandidate: string;
    detectedInitializedDataDir: string | null;
    configuredEnvDataDir: string | null;
  }>;
};

type ReadlineMockState = {
  prompts: string[];
};

function mockReadline(
  answers: string[],
  options: { autoConfirmReinit?: boolean } = {}
): ReadlineMockState {
  const state: ReadlineMockState = { prompts: [] };
  let answerIndex = 0;
  const autoConfirmReinit = options.autoConfirmReinit ?? true;
  vi.doMock("node:readline", () => ({
    createInterface: () => {
      let closeHandler: (() => void) | undefined;
      return {
        on: (event: string, handler: () => void) => {
          if (event === "close") closeHandler = handler;
        },
        question: (question: string, cb: (value: string) => void) => {
          state.prompts.push(question);
          if (autoConfirmReinit && /already initialized/i.test(question)) {
            cb("y");
            return;
          }
          const answer = answers[answerIndex] ?? "";
          answerIndex += 1;
          if (answer === "__EOF__") {
            closeHandler?.();
            return;
          }
          cb(answer);
        },
        close: () => {
          closeHandler?.();
        },
      };
    },
  }));
  return state;
}

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-init-interactive-home-"));
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

async function withTempCwd<T>(callback: (cwd: string) => Promise<T>): Promise<T> {
  const previousCwd = process.cwd();
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-init-interactive-cwd-"));
  process.chdir(cwd);
  try {
    return await callback(cwd);
  } finally {
    process.chdir(previousCwd);
  }
}

async function writeCliConfig(homeDir: string, config: Record<string, unknown>): Promise<void> {
  const configDir = path.join(homeDir, ".config", "neotoma");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify(config, null, 2));
}

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

function forceStdoutTty(value: boolean): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    get: () => value,
  });
  return () => {
    if (descriptor) Object.defineProperty(process.stdout, "isTTY", descriptor);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
  };
}

async function expectExitZero(run: () => Promise<void>): Promise<void> {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__EXIT_${code ?? 0}__`);
  }) as (code?: string | number | null | undefined) => never);
  await expect(run()).rejects.toThrow(/__EXIT_0__/);
  expect(exitSpy).toHaveBeenCalledWith(0);
  exitSpy.mockRestore();
}

describe("CLI init interactive flows", () => {
  it("prompts before re-running init when Neotoma is already initialized", async () => {
    await withTempHome(async (homeDir) => {
      await withTempCwd(async () => {
        const existingDataDir = path.join(homeDir, "neotoma", "data");
        await fs.mkdir(existingDataDir, { recursive: true });
        await fs.writeFile(path.join(existingDataDir, "neotoma.db"), "");
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline(["n"], { autoConfirmReinit: false });
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() => runCli(["node", "cli", "init", "--skip-db", "--skip-env"]));
        } finally {
          restoreTty();
        }
        expect(flow.prompts.join(" ")).toMatch(/already initialized/i);
        expect(flow.prompts.join(" ")).toMatch(/Run init again\?/i);
      });
    });
  });

  it("applies the default plan on Enter", async () => {
    await withTempHome(async () => {
      await withTempCwd(async () => {
        const restoreTty = forceStdoutTty(true);
        mockReadline([""]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() => runCli(["node", "cli", "init", "--skip-db", "--skip-env"]));
        } finally {
          restoreTty();
        }
      });
    });
  });

  it("supports personalize path and custom data directory prompt", async () => {
    await withTempHome(async () => {
      await withTempCwd(async (cwd) => {
        const restoreTty = forceStdoutTty(true);
        mockReadline(["p", "custom-data"]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() =>
            runCli(["node", "cli", "init", "--skip-db", "--skip-env", "--auth-mode", "dev_local"])
          );
        } finally {
          restoreTty();
        }
        await expect(fs.stat(path.join(cwd, "custom-data"))).resolves.toBeDefined();
      });
    });
  });

  it("prompts for current-directory targets when npm package is detected without checkout", async () => {
    await withTempHome(async () => {
      await withTempCwd(async (cwd) => {
        await fs.writeFile(
          path.join(cwd, "package.json"),
          JSON.stringify(
            {
              name: "neotoma-tests",
              dependencies: {
                neotoma: "^0.0.0-test",
              },
            },
            null,
            2
          )
        );
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline(["n", ""]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() => runCli(["node", "cli", "init", "--skip-db", "--skip-env"]));
        } finally {
          restoreTty();
        }
        const prompts = flow.prompts.join(" ");
        expect(prompts).toMatch(/Detected installed npm package/i);
        expect(prompts).toMatch(/Data and env targets will be resolved in the next steps/i);
        await expect(fs.stat(path.join(cwd, "data"))).rejects.toBeDefined();
      });
    });
  });

  it("prompts for current-directory targets when fallback root comes from saved config", async () => {
    await withTempHome(async (homeDir) => {
      const configuredRepoRoot = path.join(homeDir, "configured-neotoma");
      await fs.mkdir(path.join(configuredRepoRoot, "src", "cli"), { recursive: true });
      await fs.writeFile(
        path.join(configuredRepoRoot, "package.json"),
        JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
      );
      await fs.writeFile(path.join(configuredRepoRoot, "src", "cli", "index.ts"), "// marker\n");
      await writeCliConfig(homeDir, { project_root: configuredRepoRoot, repo_root: configuredRepoRoot });

      await withTempCwd(async (cwd) => {
        await fs.writeFile(
          path.join(cwd, "package.json"),
          JSON.stringify(
            {
              name: "neotoma-tests",
              dependencies: {
                neotoma: "^0.0.0-test",
              },
            },
            null,
            2
          )
        );
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline(["n", ""]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() => runCli(["node", "cli", "init", "--skip-db", "--skip-env"]));
        } finally {
          restoreTty();
        }
        const prompts = flow.prompts.join(" ");
        expect(prompts).toMatch(/Detected installed npm package/i);
        expect(prompts).toMatch(/Data and env targets will be resolved in the next steps/i);
        await expect(fs.stat(path.join(cwd, "data"))).rejects.toBeDefined();
      });
    });
  });

  it("quits cleanly on plan cancel", async () => {
    await withTempHome(async (homeDir) => {
      await withTempCwd(async () => {
        const restoreTty = forceStdoutTty(true);
        mockReadline(["q"]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() => runCli(["node", "cli", "init", "--skip-db", "--skip-env"]));
        } finally {
          restoreTty();
        }
        await expect(fs.stat(path.join(homeDir, "neotoma", "data"))).rejects.toBeDefined();
      });
    });
  });

  it("shows source path prompt only in --advanced mode", async () => {
    await withTempHome(async () => {
      await withTempCwd(async () => {
        const restoreTty = forceStdoutTty(true);
        const defaultFlow = mockReadline([""]);
        const defaultCli = await loadCli();
        try {
          await expectExitZero(() =>
            defaultCli.runCli(["node", "cli", "init", "--skip-db", "--skip-env", "--auth-mode", "dev_local"])
          );
        } finally {
          restoreTty();
        }
        expect(defaultFlow.prompts.join(" ")).not.toMatch(/Path to Neotoma source checkout/i);
        expect(defaultFlow.prompts.join(" ")).not.toMatch(/Apply MCP \+ CLI updates to:/i);
      });
    });

    await withTempHome(async () => {
      await withTempCwd(async () => {
        const restoreTty = forceStdoutTty(true);
        const advancedFlow = mockReadline(["", "", ""]);
        const advancedCli = await loadCli();
        try {
          await expectExitZero(() =>
            advancedCli.runCli(["node", "cli", "init", "--advanced", "--skip-db", "--auth-mode", "dev_local"])
          );
        } finally {
          restoreTty();
        }
        expect(advancedFlow.prompts.join(" ")).toMatch(/Path to Neotoma source checkout/i);
        expect(advancedFlow.prompts.join(" ")).toMatch(/Apply MCP \+ CLI updates to:/i);
        expect(
          advancedFlow.prompts.filter((prompt) => /Path to Neotoma source checkout/i.test(prompt)).length
        ).toBe(1);
        expect(
          advancedFlow.prompts.filter((prompt) => /Apply MCP \+ CLI updates to:/i.test(prompt)).length
        ).toBe(1);
        const sourcePromptIndex = advancedFlow.prompts.findIndex((prompt) =>
          /Path to Neotoma source checkout/i.test(prompt)
        );
        const scopePromptIndex = advancedFlow.prompts.findIndex((prompt) =>
          /Apply MCP \+ CLI updates to:/i.test(prompt)
        );
        expect(sourcePromptIndex).toBeGreaterThanOrEqual(0);
        expect(scopePromptIndex).toBeGreaterThanOrEqual(0);
        expect(sourcePromptIndex).toBeLessThan(scopePromptIndex);
      });
    });
  });

  it("skips MCP and CLI prompts when scope is set to skip", async () => {
    await withTempHome(async () => {
      await withTempCwd(async () => {
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline(["", "", "2"]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() =>
            runCli(["node", "cli", "init", "--advanced", "--skip-db", "--skip-env", "--auth-mode", "dev_local"])
          );
        } finally {
          restoreTty();
        }
        const prompts = flow.prompts.join(" ");
        expect(prompts).toMatch(/Apply MCP \+ CLI updates to:/i);
        expect(prompts).not.toMatch(/Configure MCP servers for:/i);
        expect(prompts).not.toMatch(/Configure MCP configuration \(add\/update MCP servers\)\?/i);
        expect(prompts).not.toMatch(/Configure CLI instructions/i);
      });
    });
  });

  it("shows MCP configuration yes/no prompt in advanced mode", async () => {
    await withTempHome(async () => {
      await withTempCwd(async () => {
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline(["", "", "n", "n"]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() =>
            runCli(["node", "cli", "init", "--advanced", "--skip-db", "--skip-env", "--auth-mode", "dev_local"])
          );
        } finally {
          restoreTty();
        }
        const prompts = flow.prompts.join(" ");
        expect(prompts).toMatch(/Configure MCP configuration \(add\/update MCP servers\)\? \[Y\/n\]:/i);
      });
    });
  });

  it("skips scope and MCP/CLI prompts when provided via flags", async () => {
    await withTempHome(async () => {
      await withTempCwd(async () => {
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline([""]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() =>
            runCli([
              "node",
              "cli",
              "init",
              "--advanced",
              "--skip-db",
              "--skip-env",
              "--auth-mode",
              "dev_local",
              "--scope",
              "skip",
              "--configure-mcp",
              "no",
              "--configure-cli",
              "no",
            ])
          );
        } finally {
          restoreTty();
        }
        const prompts = flow.prompts.join(" ");
        expect(prompts).not.toMatch(/Apply MCP \+ CLI updates to:/i);
        expect(prompts).not.toMatch(/Configure MCP configuration \(add\/update MCP servers\)\?/i);
        expect(prompts).not.toMatch(/Configure CLI instructions/i);
      });
    });
  });

  it("uses current directory targets from flag without prompting", async () => {
    await withTempHome(async () => {
      await withTempCwd(async (cwd) => {
        await fs.writeFile(
          path.join(cwd, "package.json"),
          JSON.stringify(
            {
              name: "neotoma-tests",
              dependencies: {
                neotoma: "^0.0.0-test",
              },
            },
            null,
            2
          )
        );
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline([""]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() =>
            runCli([
              "node",
              "cli",
              "init",
              "--skip-db",
              "--skip-env",
              "--use-current-dir-targets",
              "yes",
            ])
          );
        } finally {
          restoreTty();
        }
        const prompts = flow.prompts.join(" ");
        expect(prompts).not.toMatch(/Detected installed npm package/i);
        await expect(fs.stat(path.join(cwd, "data"))).resolves.toBeDefined();
      });
    });
  });

  it("writes openai key from flag without prompting for it", async () => {
    await withTempHome(async (homeDir) => {
      await withTempCwd(async () => {
        const previousOpenAi = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        const restoreTty = forceStdoutTty(true);
        const flow = mockReadline([""]);
        const { runCli } = await loadCli();
        try {
          await expectExitZero(() =>
            runCli([
              "node",
              "cli",
              "init",
              "--skip-db",
              "--openai-api-key",
              "test-openai-key",
            ])
          );
        } finally {
          restoreTty();
          if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
          else process.env.OPENAI_API_KEY = previousOpenAi;
        }
        const prompts = flow.prompts.join(" ");
        expect(prompts).not.toMatch(/OPENAI_API_KEY value/i);
        const envPath = path.join(homeDir, ".config", "neotoma", ".env");
        const envText = await fs.readFile(envPath, "utf-8");
        expect(envText).toMatch(/OPENAI_API_KEY=test-openai-key/);
      });
    });
  });

  it("prefers NEOTOMA_DATA_DIR from selected env file", async () => {
    await withTempHome(async (homeDir) => {
      const envDir = path.join(homeDir, ".config", "neotoma");
      const envPath = path.join(envDir, ".env");
      const configuredDataDir = path.join(homeDir, "Documents", "data");
      await fs.mkdir(envDir, { recursive: true });
      await fs.writeFile(envPath, `NEOTOMA_DATA_DIR=${configuredDataDir}\n`);

      const { resolveInitDataDirDefaults } = await loadCli();
      const defaults = await resolveInitDataDirDefaults({
        repoRoot: null,
        envPath,
        homeDir,
        cwd: homeDir,
      });

      expect(defaults.configuredEnvDataDir).toBe(configuredDataDir);
      expect(defaults.defaultDataDir).toBe(configuredDataDir);
    });
  });
});
