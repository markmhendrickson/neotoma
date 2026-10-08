import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCli } from "../../src/cli/index.ts";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.ts";

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

  it("backup verify <dir> --json after backup create", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-backup-verify-"));
    backupRoots.push(parent);

    const create = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {});
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

  async function createBackupInput(prefix: string): Promise<{ parent: string; dataDir: string }> {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    backupRoots.push(parent);
    const dataDir = path.join(parent, "data");
    await fs.mkdir(dataDir, { recursive: true });
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(path.join(dataDir, "neotoma.db"));
    try {
      db.exec("create table test_data(value text); insert into test_data values ('ready');");
    } finally {
      db.close();
    }
    return { parent, dataDir };
  }

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
      .mockResolvedValue([{ integrity_check: "row 3 missing" }]);
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
        hint?: { code?: string; failure_kind?: string };
      };
      expect(envelope.error).toContain('integrity_check on the snapshot returned "row 3 missing"');
      expect(envelope.hint).toEqual({ code: "INTEGRITY_FAILED", failure_kind: "integrity_failed" });
    } finally {
      pragma.mockRestore();
    }
  });

  it.each([
    ["empty", []],
    ["malformed", [{ integrity_check: "ok" }, { integrity_check: "ok" }]],
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
      } finally {
        pragma.mockRestore();
      }
    }
  );

  it("fails closed when the verification driver throws and shell-quotes an output-derived path", async () => {
    const { parent, dataDir } = await createBackupInput("neotoma-backup-instrument-$()-");
    const pragma = vi
      .spyOn(AsyncSqliteDatabase.prototype, "pragma")
      .mockRejectedValue(new Error("simulated verification driver failure"));
    try {
      const run = await runNeotomaCli(["--json", "backup", "create", "--output", parent], {
        NEOTOMA_DATA_DIR: dataDir,
      });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain("could not obtain an integrity result");
      expect(run.stderr).not.toContain("SQLite may be corrupted.");
      expect(run.stderr).toContain(`sqlite3 '${parent}`);
      expect(run.stderr).toContain("$()-");
      expect(run.stderr).toContain('neotoma.db\' \\"PRAGMA integrity_check;\\"');
      expect(run.stderr).not.toContain(`sqlite3 \"${parent}`);
    } finally {
      pragma.mockRestore();
    }
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

    const { default: Database } = await import("better-sqlite3");
    const dbPath = path.join(dataDir, "neotoma.prod.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode=WAL");
    db.exec("create table t(x)");
    const insert = db.prepare("insert into t values (?)");

    // Checkpoint once so the main file holds a small prefix, then commit a large
    // batch that lives ONLY in the WAL — the state that made the two-file copy tear.
    for (let i = 0; i < 50; i++) insert.run(i);
    db.pragma("wal_checkpoint(TRUNCATE)");
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
    const snapshot = new Database(path.join(created.backup_dir!, "neotoma.prod.db"), {
      readonly: true,
    });
    try {
      const integrity = snapshot.pragma("integrity_check") as Array<Record<string, unknown>>;
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
