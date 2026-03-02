import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

type CliModule = {
  runCli: (argv: string[]) => Promise<void>;
};

type ReadlineMockState = {
  prompts: string[];
};

function mockReadline(answers: string[]): ReadlineMockState {
  const state: ReadlineMockState = { prompts: [] };
  let answerIndex = 0;
  vi.doMock("node:readline", () => ({
    createInterface: () => {
      let closeHandler: (() => void) | undefined;
      return {
        on: (event: string, handler: () => void) => {
          if (event === "close") closeHandler = handler;
        },
        question: (question: string, cb: (value: string) => void) => {
          state.prompts.push(question);
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
        expect(defaultFlow.prompts.join(" ")).not.toMatch(/Neotoma path/i);
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
        expect(advancedFlow.prompts.join(" ")).toMatch(/Neotoma path/i);
      });
    });
  });
});
