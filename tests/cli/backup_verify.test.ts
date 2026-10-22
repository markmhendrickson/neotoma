import { afterAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { runCli } from "../../src/cli/index.ts";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.ts";

type FixtureSqliteStatement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};

type FixtureSqliteDatabase = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): FixtureSqliteStatement;
};

const nodeRequire = createRequire(import.meta.url);

function activeSqliteDriverName(): "node:sqlite" | "better-sqlite3" {
  try {
    return typeof nodeRequire("node:sqlite").DatabaseSync === "function"
      ? "node:sqlite"
      : "better-sqlite3";
  } catch {
    return "better-sqlite3";
  }
}

function createFixtureSqliteDatabase(databasePath: string): FixtureSqliteDatabase {
  if (activeSqliteDriverName() === "node:sqlite") {
    const native = nodeRequire("node:sqlite") as {
      DatabaseSync: new (path: string, options?: Record<string, unknown>) => FixtureSqliteDatabase;
    };
    return new native.DatabaseSync(databasePath);
  }
  const BetterSqlite = nodeRequire("better-sqlite3") as new (
    path: string,
    options?: Record<string, unknown>
  ) => FixtureSqliteDatabase;
  return new BetterSqlite(databasePath);
}

if (process.env.NEOTOMA_REQUIRE_NATIVE_SQLITE === "1") {
  try {
    const nodeRequire = createRequire(import.meta.url);
    if (typeof nodeRequire("node:sqlite").DatabaseSync !== "function") {
      throw new Error("DatabaseSync is not available");
    }
  } catch (error) {
    throw new Error(
      "NEOTOMA_REQUIRE_NATIVE_SQLITE=1 requires node:sqlite DatabaseSync; native backup coverage cannot be skipped.",
      { cause: error }
    );
  }
}

async function runNeotomaCli(
  argvSuffix: string[],
  env: Record<string, string | undefined>,
  runCliFn: (argv: string[]) => Promise<void> = runCli
): Promise<{ exitCode: number; stdout: string; stderr: string; error?: unknown }> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")
    );
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")
    );
    return true;
  });

  const prevExit = process.exitCode;
  process.exitCode = undefined;

  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries({ NEOTOMA_ENV: "development", ...env })) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  let caught: unknown;
  try {
    await runCliFn(["node", "neotoma", ...argvSuffix]);
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
        })
      )
    );
  });

  it("fails a pre-snapshot filesystem error without path-borne corruption advice in human and JSON output", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-backup-fs-entrance-"));
    backupRoots.push(parent);
    const outputFile = path.join(parent, "sqlite_corrupt-output");
    await fs.writeFile(outputFile, "not a directory");

    for (const mode of ["human", "json"] as const) {
      const argv = ["--import", "tsx", "src/cli/bootstrap.ts"];
      if (mode === "json") argv.push("--json");
      argv.push("backup", "create", "--output", outputFile);
      const run = spawnSync(process.execPath, argv, {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NEOTOMA_ENV: "development",
          NEOTOMA_DATA_DIR: path.join(parent, "data"),
        },
      });
      expect(run.status, run.stderr).toBe(1);
      expect(run.stderr).toContain("Backup operation failed");
      expect(run.stderr).not.toContain("recover-db");
      expect(run.stderr).not.toContain("SQLite may be corrupted");
      expect(run.stderr).not.toContain("ENOTDIR");
      if (mode === "json") {
        const envelope = JSON.parse(run.stderr) as { error: string; hint?: unknown };
        expect(envelope.hint).toBeUndefined();
      }
    }
  });

  it("does not infer corruption when backup restore cannot create its target directory", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-backup-fs-restore-"));
    backupRoots.push(parent);
    const source = path.join(parent, "source");
    await fs.mkdir(source);
    const db = createFixtureSqliteDatabase(path.join(source, "neotoma.db"));
    db.exec("create table test_data(value text)");
    db.close();
    await fs.writeFile(
      path.join(source, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "neotoma.db" } })
    );
    const targetFile = path.join(parent, "sqlite_corrupt-target");
    await fs.writeFile(targetFile, "not a directory");

    for (const mode of ["human", "json"] as const) {
      const argv = ["--import", "tsx", "src/cli/bootstrap.ts"];
      if (mode === "json") argv.push("--json");
      argv.push("backup", "restore", "--from", source, "--target", targetFile);
      const run = spawnSync(process.execPath, argv, {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NEOTOMA_ENV: "development",
          NEOTOMA_DATA_DIR: path.join(parent, "data"),
        },
      });
      expect(run.status, run.stderr).toBe(1);
      expect(run.stderr).toContain("Backup operation failed");
      expect(run.stderr).not.toContain("recover-db");
      expect(run.stderr).not.toContain("SQLite may be corrupted");
      expect(run.stderr).not.toContain("ENOTDIR");
      if (mode === "json") {
        const envelope = JSON.parse(run.stderr) as { error: string; hint?: unknown };
        expect(envelope.hint).toBeUndefined();
      }
    }
  });

  it.each(["missing", "malformed", "unreadable", "invalid"] as const)(
    "exits unsuccessfully when restore manifest is %s",
    async (manifestState) => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-restore-manifest-"));
      backupRoots.push(parent);
      const source = path.join(parent, "source");
      const target = path.join(parent, "target");
      await fs.mkdir(source);
      const manifestPath = path.join(source, "manifest.json");
      if (manifestState === "malformed") await fs.writeFile(manifestPath, "{not-json");
      if (manifestState === "unreadable") await fs.mkdir(manifestPath);
      if (manifestState === "invalid") {
        await fs.writeFile(manifestPath, JSON.stringify({ contents: null }));
      }

      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/bootstrap.ts",
          "--json",
          "backup",
          "restore",
          "--from",
          source,
          "--target",
          target,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, NEOTOMA_ENV: "development" },
        }
      );
      expect(run.status, run.stderr + run.stdout).toBe(1);
      expect(JSON.parse(run.stderr)).toHaveProperty("error");
      expect(run.stdout).not.toContain('"status":"restored"');
      await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    }
  );

  it("exits successfully after restoring a healthy manifest and database", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-restore-healthy-"));
    backupRoots.push(parent);
    const source = path.join(parent, "source");
    const target = path.join(parent, "target");
    await fs.mkdir(source);
    const db = createFixtureSqliteDatabase(path.join(source, "neotoma.db"));
    db.exec("create table test_data(value text); insert into test_data values ('ready');");
    db.close();
    await fs.writeFile(
      path.join(source, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "neotoma.db" } })
    );

    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/bootstrap.ts",
        "--json",
        "backup",
        "restore",
        "--from",
        source,
        "--target",
        target,
      ],
      { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NEOTOMA_ENV: "development" } }
    );
    expect(run.status, run.stderr + run.stdout).toBe(0);
    expect(JSON.parse(run.stdout)).toHaveProperty("status", "restored");
    const restored = createFixtureSqliteDatabase(path.join(target, "neotoma.db"));
    try {
      expect(restored.prepare("select value from test_data").get()).toEqual({ value: "ready" });
    } finally {
      restored.close();
    }
  });

  it("backup verify <dir> --json after backup create", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-verify-");

    const create = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
      NEOTOMA_DATA_DIR: dataDir,
      NEOTOMA_ENV: "development",
    });
    expect(create.exitCode, create.stderr + create.stdout).toBe(0);
    const created = JSON.parse(create.stdout) as { backup_dir?: string; verified?: boolean };
    expect(created.backup_dir).toMatch(/neotoma-backup-/);
    expect(created.verified).toBe(true);
    expect(create.stderr).not.toContain("SQLite may be corrupted");

    const verify = await runNeotomaCli(["--json", "backup", "verify", created.backup_dir!], {});
    expect(verify.exitCode, verify.stderr + verify.stdout).toBe(0);
    const report = JSON.parse(verify.stdout) as { status?: string };
    expect(report.status).toBe("valid");
  });

  it.each(["corrupt", "checksum", "undersized", "missing-member", "malformed-manifest"] as const)(
    "refuses a %s backup before creating or changing a restore target",
    async (defect) => {
      const { parent, dataDir } = await createBackupInput(`neotoma-backup-restore-${defect}-`);
      const created = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
      });
      expect(created.exitCode, created.stderr + created.stdout).toBe(0);
      const backupDir = (JSON.parse(created.stdout) as { backup_dir: string }).backup_dir;
      const snapshotPath = path.join(backupDir, "neotoma.db");
      const manifestPath = path.join(backupDir, "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        contents: Record<string, string>;
        checksums: Record<string, string>;
      };
      if (defect === "corrupt") {
        await fs.truncate(snapshotPath, 4096);
        const bytes = await fs.readFile(snapshotPath);
        manifest.checksums["neotoma.db"] =
          "sha256:" + createHash("sha256").update(bytes).digest("hex");
      } else if (defect === "checksum") {
        manifest.checksums["neotoma.db"] = `sha256:${"0".repeat(64)}`;
      } else if (defect === "undersized") {
        await fs.truncate(snapshotPath, 512);
      } else if (defect === "missing-member") {
        manifest.contents.sources = "sources/";
      } else {
        await fs.writeFile(manifestPath, JSON.stringify({ contents: null }));
      }
      if (defect !== "malformed-manifest") {
        await fs.writeFile(manifestPath, JSON.stringify(manifest));
      }

      const verify = await runNeotomaCli(["--json", "backup", "verify", backupDir], {});
      expect(verify.exitCode, verify.stderr + verify.stdout).toBe(1);
      if (defect === "corrupt") {
        expect(JSON.parse(verify.stderr)).toMatchObject({
          hint: { code: "INTEGRITY_FAILED", failure_kind: "integrity_failed" },
        });
        expect(verify.stderr).toContain("SQLite may be corrupted");
      }

      const freshTarget = path.join(parent, "fresh-target");
      const fresh = await runNeotomaCli(
        ["--json", "backup", "restore", "--from", backupDir, "--target", freshTarget],
        {}
      );
      expect(fresh.exitCode, fresh.stderr + fresh.stdout).toBe(1);
      expect(fresh.stdout).not.toContain('"status":"restored"');
      if (defect === "corrupt") {
        expect(JSON.parse(fresh.stderr)).toMatchObject({
          hint: { code: "INTEGRITY_FAILED", failure_kind: "integrity_failed" },
        });
        expect(fresh.stderr).toContain("SQLite may be corrupted");
      }
      await expect(fs.access(freshTarget)).rejects.toMatchObject({ code: "ENOENT" });

      const existingTarget = path.join(parent, "existing-target");
      await fs.mkdir(existingTarget);
      const originalDb = await fs.readFile(path.join(dataDir, "neotoma.db"));
      await fs.writeFile(path.join(existingTarget, "neotoma.db"), originalDb);
      await fs.writeFile(path.join(existingTarget, "sentinel"), "keep me");
      const existing = await runNeotomaCli(
        ["--json", "backup", "restore", "--from", backupDir, "--target", existingTarget],
        {}
      );
      expect(existing.exitCode, existing.stderr + existing.stdout).toBe(1);
      expect(await fs.readFile(path.join(existingTarget, "neotoma.db"))).toEqual(originalDb);
      expect(await fs.readFile(path.join(existingTarget, "sentinel"), "utf8")).toBe("keep me");
    }
  );

  it.each([[], [{ wrong_column: "ok" }]])(
    "refuses restore when the integrity instrument returns %j without claiming corruption",
    async (rows) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-restore-instrument-");
      const created = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
      });
      expect(created.exitCode, created.stderr + created.stdout).toBe(0);
      const backupDir = (JSON.parse(created.stdout) as { backup_dir: string }).backup_dir;
      const target = path.join(parent, "target");
      const pragma = vi.spyOn(AsyncSqliteDatabase.prototype, "pragma").mockResolvedValue(rows);
      try {
        for (const command of ["verify", "restore"] as const) {
          const argv =
            command === "verify"
              ? ["--json", "backup", "verify", backupDir]
              : ["--json", "backup", "restore", "--from", backupDir, "--target", target];
          const run = await runNeotomaCli(argv, {});
          expect(run.exitCode, run.stderr + run.stdout).toBe(1);
          const envelope = JSON.parse(run.stderr) as {
            hint?: { code?: string; failure_kind?: string };
          };
          expect(envelope.hint).toMatchObject({
            code: "VERIFY_INSTRUMENT_FAILURE",
            failure_kind: "verify_instrument_failure",
          });
          expect(run.stderr).not.toContain("SQLite may be corrupted");
          expect(run.stderr).not.toContain("recover-db");
        }
        await expect(fs.access(target)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        pragma.mockRestore();
      }
    }
  );

  it.each(["sources", "logs"] as const)(
    "rejects a %s symlink at the input root before certifying a backup",
    async (directory) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-create-root-link-");
      const outside = path.join(parent, "outside");
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, "outside.txt"), "outside");
      await fs.symlink(outside, path.join(dataDir, directory));

      const created = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
        NEOTOMA_ENV: "development",
      });
      expect(created.exitCode, created.stdout + created.stderr).toBe(1);
      expect(created.stdout).not.toContain('"verified": true');
      expect(created.stderr).not.toContain("SQLite may be corrupted");
    }
  );

  it.each(["sources", "logs"] as const)(
    "rejects a symlink nested under input %s before certifying a backup",
    async (directory) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-create-nested-link-");
      const input = path.join(dataDir, directory);
      await fs.mkdir(path.join(input, "nested"), { recursive: true });
      await fs.writeFile(path.join(input, "healthy.txt"), "healthy");
      const outside = path.join(parent, "outside.txt");
      await fs.writeFile(outside, "outside");
      await fs.symlink(outside, path.join(input, "nested", "external.txt"));

      const created = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
        NEOTOMA_ENV: "development",
      });
      expect(created.exitCode, created.stdout + created.stderr).toBe(1);
      expect(created.stdout).not.toContain('"verified": true');
      expect(created.stderr).not.toContain("SQLite may be corrupted");
    }
  );

  it.each(["sources", "logs"] as const)(
    "rejects a %s input that is not a directory",
    async (directory) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-create-not-directory-");
      await fs.writeFile(path.join(dataDir, directory), "not a directory");
      const created = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
        NEOTOMA_ENV: "development",
      });
      expect(created.exitCode, created.stdout + created.stderr).toBe(1);
      expect(created.stderr).toContain("not a real directory");
    }
  );

  it("creates, verifies, and restores real source and log directories", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-create-directories-");
    await fs.mkdir(path.join(dataDir, "sources", "nested"), { recursive: true });
    await fs.mkdir(path.join(dataDir, "logs"), { recursive: true });
    await fs.writeFile(path.join(dataDir, "sources", "nested", "source.txt"), "source");
    await fs.writeFile(path.join(dataDir, "logs", "events.log"), "event");

    const created = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
      NEOTOMA_DATA_DIR: dataDir,
      NEOTOMA_ENV: "development",
    });
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    const backup = JSON.parse(created.stdout) as {
      backup_dir: string;
      verified: boolean;
      contents: Record<string, string>;
    };
    expect(backup.verified).toBe(true);
    expect(backup.contents.sources).toBe("sources/");
    expect(backup.contents.logs).toBe("logs/");
    const verified = await runNeotomaCli(["--json", "backup", "verify", backup.backup_dir], {});
    expect(verified.exitCode, verified.stdout + verified.stderr).toBe(0);
    expect((JSON.parse(verified.stdout) as { status: string }).status).toBe("valid");
    const target = path.join(parent, "restored");
    const restored = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backup.backup_dir, "--target", target],
      {}
    );
    expect(restored.exitCode, restored.stdout + restored.stderr).toBe(0);
    expect(await fs.readFile(path.join(target, "sources", "nested", "source.txt"), "utf8")).toBe(
      "source"
    );
    expect(await fs.readFile(path.join(target, "logs", "events.log"), "utf8")).toBe("event");
  });

  it.each([undefined, null, {}])(
    "refuses restore when manifest contents have no database (%s)",
    async (contents) => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-backup-restore-empty-"));
      backupRoots.push(parent);
      const backup = path.join(parent, "backup");
      await fs.mkdir(backup);
      await fs.writeFile(path.join(backup, "manifest.json"), JSON.stringify({ contents }));
      const target = path.join(parent, "target");
      const restored = await runNeotomaCli(
        ["--json", "backup", "restore", "--from", backup, "--target", target],
        {}
      );
      expect(restored.exitCode, restored.stdout + restored.stderr).toBe(1);
      expect(restored.stdout).not.toContain('"status":"restored"');
      await expect(fs.access(target)).rejects.toMatchObject({ code: "ENOENT" });
    }
  );

  it("refuses restore when a referenced directory is missing", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-restore-missing-dir-");
    const backup = path.join(parent, "backup");
    await fs.mkdir(backup);
    await fs.copyFile(path.join(dataDir, "neotoma.db"), path.join(backup, "neotoma.db"));
    await fs.writeFile(
      path.join(backup, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "neotoma.db", sources: "sources/" } })
    );
    const target = path.join(parent, "target");
    const restored = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backup, "--target", target],
      {}
    );
    expect(restored.exitCode, restored.stdout + restored.stderr).toBe(1);
    expect(restored.stdout).not.toContain('"status":"restored"');
    await expect(fs.access(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports a failed restore copy instead of restored", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-restore-copy-error-");
    const backup = path.join(parent, "backup");
    await fs.mkdir(backup);
    await fs.copyFile(path.join(dataDir, "neotoma.db"), path.join(backup, "neotoma.db"));
    await fs.writeFile(
      path.join(backup, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "neotoma.db" } })
    );
    const target = path.join(parent, "target");
    await fs.mkdir(path.join(target, "neotoma.db"), { recursive: true });
    const restored = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backup, "--target", target],
      {}
    );
    expect(restored.exitCode, restored.stdout + restored.stderr).toBe(1);
    expect(restored.stderr).toContain("Backup restore failed while copying files");
    expect(restored.stdout).not.toContain('"status":"restored"');
  });

  it.each(["traversal", "absolute", "symlink"] as const)(
    "does not validate an external database referenced by %s",
    async (kind) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-containment-");
      const outside = path.join(dataDir, "neotoma.db");
      const backupDir = path.join(parent, "backup");
      await fs.mkdir(backupDir);
      const dbName =
        kind === "traversal" ? "../data/neotoma.db" : kind === "absolute" ? outside : "external.db";
      if (kind === "symlink") await fs.symlink(outside, path.join(backupDir, dbName));
      const dbBytes = await fs.readFile(outside);
      await fs.writeFile(
        path.join(backupDir, "manifest.json"),
        JSON.stringify({
          contents: { neotoma_db: dbName },
          checksums: { [dbName]: "sha256:" + createHash("sha256").update(dbBytes).digest("hex") },
        })
      );

      const verified = await runNeotomaCli(["--json", "backup", "verify", backupDir], {});
      expect(verified.error).toBeUndefined();
      expect(verified.stdout + verified.stderr).toContain("outside backup directory");
      expect(verified.exitCode, verified.stdout + verified.stderr).toBe(1);
      const report = JSON.parse(verified.stdout) as { status: string; issues?: string[] };
      expect(report.status).toBe("invalid");
      expect(report.issues?.join(" ")).toContain("outside backup directory");
      expect(verified.stderr).not.toContain("VERIFY_INSTRUMENT_FAILURE");
    }
  );

  it("rejects a directory symlink to external files in verification and restore", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-dir-containment-");
    const backupDir = path.join(parent, "backup");
    const outsideDir = path.join(parent, "outside-sources");
    const target = path.join(parent, "target");
    await fs.mkdir(backupDir);
    await fs.mkdir(outsideDir);
    await fs.writeFile(path.join(outsideDir, "outside.txt"), "external");
    await fs.copyFile(path.join(dataDir, "neotoma.db"), path.join(backupDir, "neotoma.db"));
    await fs.symlink(outsideDir, path.join(backupDir, "sources"));
    await fs.writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "neotoma.db", sources: "sources/" } })
    );

    const verified = await runNeotomaCli(["--json", "backup", "verify", backupDir], {});
    expect(verified.error).toBeUndefined();
    expect(verified.exitCode, verified.stdout + verified.stderr).toBe(1);
    expect((JSON.parse(verified.stdout) as { issues: string[] }).issues.join(" ")).toContain(
      "outside backup directory"
    );

    const restored = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backupDir, "--target", target],
      {}
    );
    expect(restored.exitCode, restored.stdout + restored.stderr).toBe(1);
    expect(await fs.stat(target).catch(() => null)).toBeNull();
  });

  it("rejects a referenced directory containing an external symlink", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-nested-symlink-");
    const backupDir = path.join(parent, "backup");
    const target = path.join(parent, "target");
    await fs.mkdir(path.join(backupDir, "sources"), { recursive: true });
    await fs.copyFile(path.join(dataDir, "neotoma.db"), path.join(backupDir, "neotoma.db"));
    await fs.symlink(
      path.join(dataDir, "neotoma.db"),
      path.join(backupDir, "sources", "external.db")
    );
    await fs.writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "neotoma.db", sources: "sources/" } })
    );

    const verified = await runNeotomaCli(["--json", "backup", "verify", backupDir], {});
    expect(verified.exitCode, verified.stdout + verified.stderr).toBe(1);
    expect((JSON.parse(verified.stdout) as { issues: string[] }).issues.join(" ")).toContain(
      "referenced directory contains a symlink"
    );

    const restored = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backupDir, "--target", target],
      {}
    );
    expect(restored.exitCode, restored.stdout + restored.stderr).toBe(1);
    expect(await fs.stat(path.join(target, "neotoma.db")).catch(() => null)).toBeNull();
  });

  it("does not restore an external database or write through a target symlink", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-restore-containment-");
    const backupDir = path.join(parent, "backup");
    const target = path.join(parent, "target");
    await fs.mkdir(backupDir);
    await fs.writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "../data/neotoma.db" } })
    );

    const external = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backupDir, "--target", target],
      {}
    );
    expect(external.exitCode, external.stdout + external.stderr).toBe(1);
    expect(await fs.stat(target).catch(() => null)).toBeNull();

    await fs.copyFile(path.join(dataDir, "neotoma.db"), path.join(backupDir, "neotoma.db"));
    await fs.writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify({ contents: { neotoma_db: "neotoma.db" } })
    );
    await fs.mkdir(target);
    await fs.symlink(path.join(dataDir, "neotoma.db"), path.join(target, "neotoma.db"));
    const before = await fs.readFile(path.join(dataDir, "neotoma.db"));
    const unsafeTarget = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backupDir, "--target", target],
      {}
    );
    expect(unsafeTarget.exitCode, unsafeTarget.stdout + unsafeTarget.stderr).toBe(1);
    expect(await fs.readFile(path.join(dataDir, "neotoma.db"))).toEqual(before);
  });

  it("restores a contained legacy database and real WAL", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-local-legacy-");
    const backupDir = path.join(parent, "backup");
    const target = path.join(parent, "target");
    const sourceDbPath = path.join(dataDir, "neotoma.db");
    const sourceDb = createFixtureSqliteDatabase(sourceDbPath);
    sourceDb.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
    sourceDb.exec("insert into test_data values ('from-wal')");
    await fs.mkdir(path.join(backupDir, "sources"), { recursive: true });
    await fs.copyFile(sourceDbPath, path.join(backupDir, "neotoma.db"));
    const mainOnlyDb = createFixtureSqliteDatabase(path.join(backupDir, "neotoma.db"));
    try {
      const rows = mainOnlyDb.prepare("select value from test_data order by rowid").all() as Array<{
        value: string;
      }>;
      expect(rows.map((row) => row.value)).toEqual(["ready"]);
    } finally {
      mainOnlyDb.close();
    }
    await fs.copyFile(`${sourceDbPath}-wal`, path.join(backupDir, "neotoma.db-wal"));
    await fs.writeFile(path.join(backupDir, "sources", "source.txt"), "source-content");
    await fs.writeFile(
      path.join(backupDir, "manifest.json"),
      JSON.stringify({
        db_snapshot_method: "file_copy",
        contents: {
          neotoma_db: "neotoma.db",
          wal: "neotoma.db-wal",
          sources: "sources/",
        },
      })
    );

    const verified = await runNeotomaCli(["--json", "backup", "verify", backupDir], {});
    expect(verified.exitCode, verified.stdout + verified.stderr).toBe(0);
    expect((JSON.parse(verified.stdout) as { status: string }).status).toBe("valid");

    const restored = await runNeotomaCli(
      ["--json", "backup", "restore", "--from", backupDir, "--target", target],
      {}
    );
    sourceDb.close();
    expect(restored.exitCode, restored.stdout + restored.stderr).toBe(0);
    const restoredDb = createFixtureSqliteDatabase(path.join(target, "neotoma.db"));
    try {
      const rows = restoredDb.prepare("select value from test_data order by rowid").all() as Array<{
        value: string;
      }>;
      expect(rows.map((row) => row.value)).toEqual(["ready", "from-wal"]);
    } finally {
      restoredDb.close();
    }
    expect(await fs.readFile(path.join(target, "sources", "source.txt"), "utf8")).toBe(
      "source-content"
    );
  });

  for (const snapshotMethod of ["file_copy", undefined]) {
    it(`refuses an unpaired legacy WAL before restore (${snapshotMethod ?? "older manifest"})`, async () => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-unpaired-wal-");
      const backupDir = path.join(parent, "backup");
      const target = path.join(parent, "target");
      const sourceDbPath = path.join(dataDir, "neotoma.db");
      const sourceDb = createFixtureSqliteDatabase(sourceDbPath);
      try {
        sourceDb.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
        sourceDb.exec("insert into test_data values ('only-in-wal')");
        await fs.mkdir(backupDir);
        await fs.copyFile(sourceDbPath, path.join(backupDir, "neotoma.db"));
        await fs.copyFile(`${sourceDbPath}-wal`, path.join(backupDir, "unpaired.wal"));
        await fs.writeFile(
          path.join(backupDir, "manifest.json"),
          JSON.stringify({
            ...(snapshotMethod && { db_snapshot_method: snapshotMethod }),
            contents: { neotoma_db: "neotoma.db", wal: "unpaired.wal" },
          })
        );

        const verified = await runNeotomaCli(["--json", "backup", "verify", backupDir], {});
        expect(verified.exitCode, verified.stdout + verified.stderr).toBe(1);
        const result = JSON.parse(verified.stdout) as { status: string; issues?: string[] };
        expect(result.status).toBe("invalid");
        expect(result.issues?.join(" ")).toContain("contents.wal");

        const restored = await runNeotomaCli(
          ["--json", "backup", "restore", "--from", backupDir, "--target", target],
          {}
        );
        expect(restored.exitCode, restored.stdout + restored.stderr).toBe(1);
        expect((JSON.parse(restored.stderr) as { error: string }).error).toContain("contents.wal");
        await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        sourceDb.close();
      }
    });
  }

  it("refuses a separate WAL on a self-contained vacuum_into snapshot", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-vacuum-wal-");
    const backupDir = path.join(parent, "backup");
    const target = path.join(parent, "target");
    const sourceDbPath = path.join(dataDir, "neotoma.db");
    const sourceDb = createFixtureSqliteDatabase(sourceDbPath);
    try {
      sourceDb.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
      sourceDb.exec("insert into test_data values ('only-in-wal')");
      await fs.mkdir(backupDir);
      await fs.copyFile(sourceDbPath, path.join(backupDir, "neotoma.db"));
      await fs.copyFile(`${sourceDbPath}-wal`, path.join(backupDir, "neotoma.db-wal"));
      await fs.writeFile(
        path.join(backupDir, "manifest.json"),
        JSON.stringify({
          db_snapshot_method: "vacuum_into",
          contents: { neotoma_db: "neotoma.db", wal: "neotoma.db-wal" },
        })
      );

      const verified = await runNeotomaCli(["--json", "backup", "verify", backupDir], {});
      expect(verified.exitCode, verified.stdout + verified.stderr).toBe(1);
      const result = JSON.parse(verified.stdout) as { status: string; issues?: string[] };
      expect(result.status).toBe("invalid");
      expect(result.issues?.join(" ")).toContain("vacuum_into");

      const restored = await runNeotomaCli(
        ["--json", "backup", "restore", "--from", backupDir, "--target", target],
        {}
      );
      expect(restored.exitCode, restored.stdout + restored.stderr).toBe(1);
      expect((JSON.parse(restored.stderr) as { error: string }).error).toContain("vacuum_into");
      await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      sourceDb.close();
    }
  });

  async function createBackupInput(prefix: string): Promise<{ parent: string; dataDir: string }> {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    backupRoots.push(parent);
    const dataDir = path.join(parent, "data");
    await fs.mkdir(dataDir, { recursive: true });
    const db = createFixtureSqliteDatabase(path.join(dataDir, "neotoma.db"));
    try {
      db.exec("create table test_data(value text); insert into test_data values ('ready');");
    } finally {
      db.close();
    }
    return { parent, dataDir };
  }

  it(`rejects a real corrupt source database through backup create (${activeSqliteDriverName()})`, async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-real-corrupt-source-");
    await fs.truncate(path.join(dataDir, "neotoma.db"), 4096);

    const run = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
      NEOTOMA_DATA_DIR: dataDir,
      NEOTOMA_ENV: "development",
    });

    expect(run.exitCode).toBe(1);
    const envelope = JSON.parse(run.stderr) as {
      error: string;
      hint?: { code?: string; failure_kind?: string; message?: string };
    };
    expect(envelope.error).toContain("source database integrity check failed");
    expect(envelope.hint).toEqual({
      code: "INTEGRITY_FAILED",
      failure_kind: "integrity_failed",
      message:
        "SQLite may be corrupted. Run `neotoma storage recover-db` first, then " +
        "`neotoma storage recover-db --recover` after stopping Neotoma.",
    });
  });

  it(`rejects a real corrupt snapshot through backup verify (${activeSqliteDriverName()})`, async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-real-corrupt-snapshot-");
    const created = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
      NEOTOMA_DATA_DIR: dataDir,
      NEOTOMA_ENV: "development",
    });
    expect(created.exitCode, created.stderr + created.stdout).toBe(0);
    const { backup_dir: backupDir } = JSON.parse(created.stdout) as { backup_dir: string };
    const snapshotPath = path.join(backupDir, "neotoma.db");

    await fs.truncate(snapshotPath, 4096);
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      checksums: Record<string, string>;
    };
    const corruptSnapshot = await fs.readFile(snapshotPath);
    manifest.checksums["neotoma.db"] =
      "sha256:" + createHash("sha256").update(corruptSnapshot).digest("hex");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const verified = await runNeotomaCli(["--json", "backup", "verify", backupDir], {
      NEOTOMA_ENV: "development",
    });
    expect(verified.exitCode).toBe(1);
    const envelope = JSON.parse(verified.stderr) as {
      error: string;
      hint?: { code?: string; failure_kind?: string; message?: string };
    };
    expect(envelope.error).toContain("snapshot integrity check failed");
    expect(envelope.hint).toEqual({
      code: "INTEGRITY_FAILED",
      failure_kind: "integrity_failed",
      message:
        "SQLite may be corrupted. Run `neotoma storage recover-db` first, then " +
        "`neotoma storage recover-db --recover` after stopping Neotoma.",
    });
  });

  it("reports a genuine non-ok integrity result as corruption in human and JSON output", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-integrity-failure-");
    // Import a fresh CLI module so the prior smoke test's --json option cannot
    // leak through Commander's process-global option state.
    await vi.resetModules();
    const { AsyncSqliteDatabase: isolatedDriver } =
      await import("../../src/repositories/sqlite/sqlite_driver.ts");
    const { runCli: isolatedRunCli } = await import("../../src/cli/index.ts");
    const pragma = vi
      .spyOn(isolatedDriver.prototype, "pragma")
      .mockResolvedValue([{ integrity_check: "SENSITIVE_PRAGMA_ROW" }]);
    try {
      // Run the human command before any --json invocation: Commander retains
      // global options when runCli is exercised in-process by this test helper.
      const human = await runNeotomaCli(
        ["backup", "create", "--output", parent],
        {
          NEOTOMA_DATA_DIR: dataDir,
        },
        isolatedRunCli
      );
      expect(human.exitCode).toBe(1);
      expect(human.stderr).toContain("SQLite may be corrupted.");
      expect(human.stderr).toContain("neotoma storage recover-db");

      const json = await runNeotomaCli(
        ["--json", "backup", "create", "--output", parent],
        {
          NEOTOMA_DATA_DIR: dataDir,
        },
        isolatedRunCli
      );
      expect(json.exitCode).toBe(1);
      const envelope = JSON.parse(json.stderr) as {
        error: string;
        hint?: { code?: string; failure_kind?: string; message?: string };
      };
      expect(envelope.error).toContain("snapshot integrity check failed");
      expect(envelope.error).not.toContain("SENSITIVE_PRAGMA_ROW");
      expect(envelope.hint).toEqual({
        code: "INTEGRITY_FAILED",
        failure_kind: "integrity_failed",
        message:
          "SQLite may be corrupted. Run `neotoma storage recover-db` first, then " +
          "`neotoma storage recover-db --recover` after stopping Neotoma.",
      });
      expect(json.stderr).not.toContain("SENSITIVE_PRAGMA_ROW");
    } finally {
      pragma.mockRestore();
    }
  });

  it("reports multiple valid non-ok integrity rows as corruption in JSON output", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-multi-integrity-failure-");
    const pragma = vi
      .spyOn(AsyncSqliteDatabase.prototype, "pragma")
      .mockResolvedValue([
        { integrity_check: "SENSITIVE_PRAGMA_ROW_ONE" },
        { integrity_check: "SENSITIVE_PRAGMA_ROW_TWO" },
      ]);
    try {
      const run = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
      });
      expect(run.exitCode).toBe(1);
      const envelope = JSON.parse(run.stderr) as {
        error: string;
        hint?: { code?: string; failure_kind?: string; message?: string };
      };
      expect(envelope.error).toContain("snapshot integrity check failed");
      expect(envelope.error).not.toContain("SENSITIVE_PRAGMA_ROW_ONE");
      expect(envelope.error).not.toContain("SENSITIVE_PRAGMA_ROW_TWO");
      expect(envelope.hint).toEqual({
        code: "INTEGRITY_FAILED",
        failure_kind: "integrity_failed",
        message:
          "SQLite may be corrupted. Run `neotoma storage recover-db` first, then " +
          "`neotoma storage recover-db --recover` after stopping Neotoma.",
      });
    } finally {
      pragma.mockRestore();
    }
  });

  it.each([
    ["empty", []],
    ["malformed", [{ integrity_check: "ok" }, { integrity_check: "ok" }]],
    ["legacy no result sentinel", [{ integrity_check: "no result" }]],
  ])(
    "fails closed on a %s verification result without claiming corruption",
    async (_kind, result) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-instrument-failure-");
      const pragma = vi.spyOn(AsyncSqliteDatabase.prototype, "pragma").mockResolvedValue(result);
      try {
        const run = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
          NEOTOMA_DATA_DIR: dataDir,
        });
        expect(run.exitCode).toBe(1);
        const envelope = JSON.parse(run.stderr) as {
          error: string;
          hint?: { code?: string; failure_kind?: string };
        };
        expect(envelope.error).toContain("could not obtain an integrity result");
        expect(envelope.error).not.toContain("corrupt");
        expect(envelope.hint).toEqual({
          code: "VERIFY_INSTRUMENT_FAILURE",
          failure_kind: "verify_instrument_failure",
        });
        expect(run.stderr).not.toContain("recover-db");
      } finally {
        pragma.mockRestore();
      }
    }
  );

  it.each([
    ["empty", []],
    ["malformed", [{ integrity_check: "ok" }, { integrity_check: "ok" }]],
  ])(
    "does not infer corruption from a sqlite_corrupt output path on %s readback",
    async (_kind, result) => {
      const { parent, dataDir } = await createBackupInput(
        "neotoma-backup-sqlite_corrupt-instrument-"
      );
      // A fresh Commander instance is needed so the human invocation is not
      // affected by --json from earlier in-process CLI tests.
      await vi.resetModules();
      const { AsyncSqliteDatabase: isolatedDriver } =
        await import("../../src/repositories/sqlite/sqlite_driver.ts");
      const { runCli: isolatedRunCli } = await import("../../src/cli/index.ts");
      const pragma = vi.spyOn(isolatedDriver.prototype, "pragma").mockResolvedValue(result);
      try {
        const human = await runNeotomaCli(
          ["backup", "create", "--output", parent],
          { NEOTOMA_DATA_DIR: dataDir },
          isolatedRunCli
        );
        const json = await runNeotomaCli(
          ["--json", "backup", "create", "--output", parent],
          { NEOTOMA_DATA_DIR: dataDir },
          isolatedRunCli
        );
        const envelope = JSON.parse(json.stderr) as {
          error: string;
          hint?: { code?: string; failure_kind?: string; message?: string };
        };

        expect(human.exitCode).toBe(1);
        expect(human.stderr).toContain("could not obtain an integrity result");
        expect(human.stderr).not.toContain("SQLite may be corrupted");
        expect(human.stderr).not.toContain("recover-db");
        expect(json.exitCode).toBe(1);
        expect(envelope.error).toContain("could not obtain an integrity result");
        expect(envelope.hint).toEqual({
          code: "VERIFY_INSTRUMENT_FAILURE",
          failure_kind: "verify_instrument_failure",
        });
        expect(json.stderr).not.toContain("SQLite may be corrupted");
        expect(json.stderr).not.toContain("recover-db");
      } finally {
        pragma.mockRestore();
      }
    }
  );

  it("fails closed when the verification driver throws and shell-quotes an output-derived path", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-instrument-$()-");
    const pragma = vi
      .spyOn(AsyncSqliteDatabase.prototype, "pragma")
      .mockRejectedValue(new Error("SENSITIVE_DRIVER_EXCEPTION"));
    try {
      const run = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
      });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("could not obtain an integrity result");
      expect(run.stderr).not.toContain("SENSITIVE_DRIVER_EXCEPTION");
      expect(run.stderr).not.toContain("SQLite may be corrupted.");
      expect(run.stderr).toContain(`sqlite3 '${parent}`);
      expect(run.stderr).toContain("$()-");
      expect(run.stderr).toContain('neotoma.db\' \\"PRAGMA integrity_check;\\"');
      expect(run.stderr).not.toContain(`sqlite3 "${parent}`);
    } finally {
      pragma.mockRestore();
    }
  });

  it.each([
    [
      "better-sqlite3",
      Object.assign(new Error("SENSITIVE_DRIVER_EXCEPTION"), { code: "SQLITE_CORRUPT" }),
    ],
    [
      "node:sqlite",
      Object.assign(new Error("SENSITIVE_DRIVER_EXCEPTION"), {
        code: "ERR_SQLITE_ERROR",
        errcode: 11,
      }),
    ],
  ])(
    "classifies a structured %s corruption verification throw as an integrity failure",
    async (_driver, driverError) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-corrupt-throw-");
      const pragma = vi
        .spyOn(AsyncSqliteDatabase.prototype, "pragma")
        .mockRejectedValue(driverError);
      try {
        const run = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
          NEOTOMA_DATA_DIR: dataDir,
        });
        expect(run.exitCode).toBe(1);
        const envelope = JSON.parse(run.stderr) as {
          error: string;
          hint?: { code?: string; failure_kind?: string; message?: string };
        };
        expect(envelope.error).toContain("snapshot integrity check failed");
        expect(envelope.error).not.toContain("SQLITE_CORRUPT");
        expect(envelope.error).not.toContain("SENSITIVE_DRIVER_EXCEPTION");
        expect(envelope.hint).toEqual({
          code: "INTEGRITY_FAILED",
          failure_kind: "integrity_failed",
          message:
            "SQLite may be corrupted. Run `neotoma storage recover-db` first, then " +
            "`neotoma storage recover-db --recover` after stopping Neotoma.",
        });
        expect(run.stderr).not.toContain("SENSITIVE_DRIVER_EXCEPTION");
      } finally {
        pragma.mockRestore();
      }
    }
  );

  it.each([
    ["untyped message", new Error("SQLITE_CORRUPT: SENSITIVE_DRIVER_EXCEPTION")],
    [
      "non-corruption code",
      Object.assign(new Error("SQLITE_CANTOPEN: SENSITIVE_DRIVER_EXCEPTION"), {
        code: "SQLITE_CANTOPEN",
      }),
    ],
    [
      "non-corruption native code",
      Object.assign(new Error("SENSITIVE_DRIVER_EXCEPTION"), {
        code: "ERR_SQLITE_ERROR",
        errcode: 14,
      }),
    ],
  ])(
    "treats a %s throw as an instrument failure despite sqlite_corrupt in the output path",
    async (_kind, driverError) => {
      const { parent, dataDir } = await createBackupInput("neotoma-backup-sqlite_corrupt-throw-");
      await vi.resetModules();
      const { AsyncSqliteDatabase: isolatedDriver } =
        await import("../../src/repositories/sqlite/sqlite_driver.ts");
      const { runCli: isolatedRunCli } = await import("../../src/cli/index.ts");
      const pragma = vi.spyOn(isolatedDriver.prototype, "pragma").mockRejectedValue(driverError);
      try {
        const human = await runNeotomaCli(
          ["backup", "create", "--output", parent],
          { NEOTOMA_DATA_DIR: dataDir },
          isolatedRunCli
        );
        const json = await runNeotomaCli(
          ["--json", "backup", "create", "--output", parent],
          { NEOTOMA_DATA_DIR: dataDir },
          isolatedRunCli
        );
        const envelope = JSON.parse(json.stderr) as {
          error: string;
          hint?: { code?: string; failure_kind?: string };
        };

        expect(human.exitCode).toBe(1);
        expect(human.stderr).toContain("could not obtain an integrity result");
        expect(human.stderr).not.toContain("SQLite may be corrupted");
        expect(human.stderr).not.toContain("recover-db");
        expect(human.stderr).not.toContain("SENSITIVE_DRIVER_EXCEPTION");
        expect(json.exitCode).toBe(1);
        expect(envelope.error).toContain("could not obtain an integrity result");
        expect(envelope.hint).toEqual({
          code: "VERIFY_INSTRUMENT_FAILURE",
          failure_kind: "verify_instrument_failure",
        });
        expect(json.stderr).not.toContain("SQLite may be corrupted");
        expect(json.stderr).not.toContain("recover-db");
        expect(json.stderr).not.toContain("SENSITIVE_DRIVER_EXCEPTION");
      } finally {
        pragma.mockRestore();
      }
    }
  );

  it("does not infer corruption from an unreadable source path", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "neotoma-backup-sqlite_corrupt-source-")
    );
    backupRoots.push(parent);
    const dataDir = path.join(parent, "missing-data");
    await vi.resetModules();
    const { runCli: isolatedRunCli } = await import("../../src/cli/index.ts");
    const human = await runNeotomaCli(
      ["backup", "create", "--output", parent],
      { NEOTOMA_DATA_DIR: dataDir },
      isolatedRunCli
    );
    const json = await runNeotomaCli(
      ["--json", "backup", "create", "--output", parent],
      { NEOTOMA_DATA_DIR: dataDir },
      isolatedRunCli
    );
    const envelope = JSON.parse(json.stderr) as { error: string; hint?: unknown };
    expect(human.exitCode).toBe(1);
    expect(human.stderr).toContain("not found, not readable, or could not be snapshotted");
    expect(human.stderr).not.toContain("recover-db");
    expect(json.exitCode).toBe(1);
    expect(envelope.error).toContain("not found, not readable, or could not be snapshotted");
    expect(envelope.hint).toBeUndefined();
    expect(json.stderr).not.toContain("recover-db");
  });

  it("keeps a non-corruption snapshot driver error private despite a sqlite_corrupt path", async () => {
    const { parent, dataDir } = await createBackupInput(
      "neotoma-backup-sqlite_corrupt-source-open-"
    );
    await vi.resetModules();
    const { AsyncSqliteDatabase: isolatedDriver } =
      await import("../../src/repositories/sqlite/sqlite_driver.ts");
    const { runCli: isolatedRunCli } = await import("../../src/cli/index.ts");
    const exec = vi
      .spyOn(isolatedDriver.prototype, "exec")
      .mockRejectedValue(
        Object.assign(new Error("SENSITIVE_DRIVER_EXCEPTION"), { code: "SQLITE_CANTOPEN" })
      );
    try {
      const human = await runNeotomaCli(
        ["backup", "create", "--output", parent],
        { NEOTOMA_DATA_DIR: dataDir },
        isolatedRunCli
      );
      const json = await runNeotomaCli(
        ["--json", "backup", "create", "--output", parent],
        { NEOTOMA_DATA_DIR: dataDir },
        isolatedRunCli
      );
      const envelope = JSON.parse(json.stderr) as { error: string; hint?: unknown };
      expect(human.exitCode).toBe(1);
      expect(human.stderr).toContain("not found, not readable, or could not be snapshotted");
      expect(human.stderr).not.toContain("SENSITIVE_DRIVER_EXCEPTION");
      expect(human.stderr).not.toContain("recover-db");
      expect(json.exitCode).toBe(1);
      expect(envelope.error).toContain("not found, not readable, or could not be snapshotted");
      expect(json.stderr).not.toContain("SENSITIVE_DRIVER_EXCEPTION");
      expect(envelope.hint).toBeUndefined();
      expect(json.stderr).not.toContain("recover-db");
    } finally {
      exec.mockRestore();
    }
  });

  it("does not infer corruption from a missing manifest path in backup verify", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "neotoma-backup-sqlite_corrupt-manifest-")
    );
    backupRoots.push(parent);
    await vi.resetModules();
    const { runCli: isolatedRunCli } = await import("../../src/cli/index.ts");
    const human = await runNeotomaCli(["backup", "verify", parent], {}, isolatedRunCli);
    const json = await runNeotomaCli(["--json", "backup", "verify", parent], {}, isolatedRunCli);
    const envelope = JSON.parse(json.stderr) as { error: string; hint?: unknown };
    expect(human.exitCode).toBe(1);
    expect(human.stderr).toContain("No manifest.json found");
    expect(human.stderr).not.toContain("recover-db");
    expect(json.exitCode).toBe(1);
    expect(envelope.error).toContain("No manifest.json found");
    expect(envelope.hint).toBeUndefined();
    expect(json.stderr).not.toContain("recover-db");
  });

  // Regression for #2075. The old implementation copied the DB and its -wal as two
  // independent fs.copyFile calls. Any write committing between the two copies left
  // the WAL's frame checksums invalid against the main file's header, so restoring
  // the pair failed with SQLITE_CORRUPT — while the command still reported
  // verified: true, because verification only checked the file was over 1KB.
  //
  // This exercises exactly that interleaving: a database whose committed rows live
  // mostly in an uncheckpointed WAL, with a writer actively committing while the
  // backup runs. It must produce a single self-contained, openable snapshot.
  it("produces an uncorrupted snapshot when writes commit during the backup (#2075)", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-backup-concurrent-"));
    backupRoots.push(parent);
    const dataDir = path.join(parent, "data");
    await fs.mkdir(dataDir, { recursive: true });

    const dbPath = path.join(dataDir, "neotoma.prod.db");
    const db = createFixtureSqliteDatabase(dbPath);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("create table t(x)");
    const insert = db.prepare("insert into t values (?)");

    // Checkpoint once so the main file holds a small prefix, then commit a large
    // batch that lives ONLY in the WAL — the state that made the two-file copy tear.
    for (let i = 0; i < 50; i++) insert.run(i);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    for (let i = 50; i < 5000; i++) insert.run(i);

    // Keep committing while the backup runs.
    let next = 5000;
    const writer = setInterval(() => {
      try {
        for (let i = 0; i < 200; i++) insert.run(next++);
      } catch {
        /* database closed — test finished */
      }
    }, 5);

    let created: { backup_dir?: string; verified?: boolean };
    try {
      const create = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_ENV: "production",
        NEOTOMA_DATA_DIR: dataDir,
      });
      expect(create.exitCode, create.stderr + create.stdout).toBe(0);
      created = JSON.parse(create.stdout) as { backup_dir?: string; verified?: boolean };
    } finally {
      clearInterval(writer);
      db.close();
    }

    expect(created.verified).toBe(true);

    // VACUUM INTO yields one self-contained file: there must be no -wal sidecar,
    // because a sidecar is what reintroduces the tearing window.
    const manifest = JSON.parse(
      await fs.readFile(path.join(created.backup_dir!, "manifest.json"), "utf-8")
    ) as { contents?: Record<string, string>; db_snapshot_method?: string };
    expect(manifest.db_snapshot_method).toBe("vacuum_into");
    expect(manifest.contents?.wal).toBeUndefined();

    // The snapshot must actually open and be internally consistent. Before the fix
    // this threw SQLITE_CORRUPT: "database disk image is malformed".
    const snapshot = createFixtureSqliteDatabase(path.join(created.backup_dir!, "neotoma.prod.db"));
    try {
      const integrity = snapshot.prepare("PRAGMA integrity_check").all() as Array<
        Record<string, unknown>
      >;
      expect(String(Object.values(integrity[0])[0])).toBe("ok");
      // A consistent point-in-time cut: at least everything committed before the
      // backup started, and never more than was ever written.
      const { c } = snapshot.prepare("select count(*) c from t").get() as { c: number };
      expect(c).toBeGreaterThanOrEqual(5000);
      expect(c).toBeLessThanOrEqual(next);
    } finally {
      snapshot.close();
    }
  });
});
