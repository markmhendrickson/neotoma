import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCli } from "../../src/cli/index.ts";

async function runNeotomaCli(
  argvSuffix: string[],
  env: Record<string, string | undefined>,
): Promise<{ exitCode: number; stdout: string; stderr: string; error?: unknown }> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"),
    );
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"),
    );
    return true;
  });

  const prevExit = process.exitCode;
  process.exitCode = undefined;

  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  let caught: unknown;
  try {
    await runCli(["node", "neotoma", ...argvSuffix]);
  } catch (err) {
    caught = err;
  }

  const exitCode =
    process.exitCode !== undefined && process.exitCode !== 0
      ? process.exitCode
      : caught
        ? 1
        : (process.exitCode ?? 0);
  process.exitCode = prevExit;

  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();

  return {
    exitCode,
    stdout: stdoutParts.join(""),
    stderr: stderrParts.join(""),
    error: caught,
  };
}

describe("CLI backup verify (smoke)", () => {
  const backupRoots: string[] = [];

  afterAll(async () => {
    await Promise.all(
      backupRoots.map((dir) =>
        fs.rm(dir, { recursive: true, force: true }).catch(() => {
          /* ignore */
        }),
      ),
    );
  });

  it("backup verify <dir> --json after backup create", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-backup-verify-"));
    backupRoots.push(parent);

    const create = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {});
    expect(create.exitCode, create.stderr + create.stdout).toBe(0);
    const created = JSON.parse(create.stdout) as { backup_dir?: string };
    expect(created.backup_dir).toMatch(/neotoma-backup-/);

    const verify = await runNeotomaCli(["--json", "backup", "verify", created.backup_dir!], {});
    expect(verify.exitCode, verify.stderr + verify.stdout).toBe(0);
    const report = JSON.parse(verify.stdout) as { status?: string };
    expect(report.status).toBe("valid");
  });
});
