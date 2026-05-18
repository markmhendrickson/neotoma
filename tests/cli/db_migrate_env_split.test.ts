import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// We test inspectEnvSplit, migrateEnvSplit, and detectEnvSplitWarning with
// real (empty) SQLite files. The tables don't exist in empty files, so every
// COUNT returns 0 — which is exactly the "empty DB" branch we want to exercise
// for most tests. For the "has data" branches, we inject pre-populated DBs via
// a minimal better-sqlite3 / node:sqlite helper, or simply verify behaviour
// against mock counts by overriding inspectEnvSplit internals.
//
// We avoid spinning up the Neotoma API; all tests operate on raw files.

describe("inspectEnvSplit", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neotoma-env-split-test-"));
  });

  afterEach(() => {
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns no_data when neither file exists", async () => {
    const { inspectEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const report = inspectEnvSplit(dataDir);
    expect(report.status).toBe("no_data");
    expect(report.dev.exists).toBe(false);
    expect(report.prod.exists).toBe(false);
  });

  it("returns dev_empty_prod_empty when both files exist but have no tables", async () => {
    const { inspectEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    // Write empty files (not valid SQLite, but inspectDb catches and returns 0s).
    writeFileSync(join(dataDir, "neotoma.db"), "");
    writeFileSync(join(dataDir, "neotoma.prod.db"), "");
    const report = inspectEnvSplit(dataDir);
    expect(report.status).toBe("dev_empty_prod_empty");
    expect(report.dev.exists).toBe(true);
    expect(report.prod.exists).toBe(true);
    expect(report.dev.observation_count).toBe(0);
    expect(report.prod.observation_count).toBe(0);
  });

  it("returns dev_empty_prod_empty when only prod file exists (empty)", async () => {
    const { inspectEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    writeFileSync(join(dataDir, "neotoma.prod.db"), "");
    const report = inspectEnvSplit(dataDir);
    // prod exists but is empty, dev does not exist → both have 0 data rows.
    // The implementation returns dev_empty_prod_empty when at least one file exists.
    expect(report.status).toBe("dev_empty_prod_empty");
    expect(report.dev.exists).toBe(false);
    expect(report.prod.exists).toBe(true);
  });

  it("returns prod_only when prod has data and dev is absent", async () => {
    // We can only produce "has data" rows by opening a real SQLite DB with the
    // observations table. Use the sqlite_driver to create a minimal DB.
    const { inspectEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    // Patch: inspectEnvSplit calls inspectDb internally. We can't mock internal
    // functions easily, but we CAN create a real SQLite DB using better-sqlite3
    // or node:sqlite (whichever is available in the test environment).
    const prodPath = join(dataDir, "neotoma.prod.db");
    await seedMinimalDb(prodPath, 3, 2);
    const report = inspectEnvSplit(dataDir);
    expect(report.status).toBe("prod_only");
    expect(report.prod.observation_count).toBe(3);
    expect(report.prod.source_count).toBe(2);
    expect(report.dev.exists).toBe(false);
  });

  it("returns dev_only when dev has data and prod is absent", async () => {
    const { inspectEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const devPath = join(dataDir, "neotoma.db");
    await seedMinimalDb(devPath, 5, 1);
    const report = inspectEnvSplit(dataDir);
    expect(report.status).toBe("dev_only");
    expect(report.dev.observation_count).toBe(5);
    expect(report.dev.source_count).toBe(1);
    expect(report.rename_target).toBe(join(dataDir, "neotoma.prod.db"));
    expect(report.backup_path).toMatch(/neotoma\.db\.bak\.\d+$/);
  });

  it("returns both_have_data when both files have observations", async () => {
    const { inspectEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    await seedMinimalDb(join(dataDir, "neotoma.db"), 4, 1);
    await seedMinimalDb(join(dataDir, "neotoma.prod.db"), 2, 1);
    const report = inspectEnvSplit(dataDir);
    expect(report.status).toBe("both_have_data");
  });
});

describe("migrateEnvSplit", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neotoma-env-split-migrate-test-"));
  });

  afterEach(() => {
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  it("no_data: reports nothing to migrate and takes no action", async () => {
    const { migrateEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const output: string[] = [];
    const result = await migrateEnvSplit({ dataDir, dryRun: false, yes: false, write: (s) => output.push(s) });
    expect(result.action_taken).toBe("none");
    expect(result.renamed).toBe(false);
    expect(output.join("")).toContain("no user data");
  });

  it("prod_only: reports no migration needed", async () => {
    const { migrateEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    await seedMinimalDb(join(dataDir, "neotoma.prod.db"), 3, 1);
    const output: string[] = [];
    const result = await migrateEnvSplit({ dataDir, dryRun: false, yes: false, write: (s) => output.push(s) });
    expect(result.action_taken).toBe("none");
    expect(output.join("")).toContain("No migration needed");
  });

  it("both_have_data: refuses and prints instructions", async () => {
    const { migrateEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    await seedMinimalDb(join(dataDir, "neotoma.db"), 4, 1);
    await seedMinimalDb(join(dataDir, "neotoma.prod.db"), 2, 1);
    const output: string[] = [];
    const result = await migrateEnvSplit({ dataDir, dryRun: false, yes: true, write: (s) => output.push(s) });
    expect(result.action_taken).toBe("none");
    expect(result.renamed).toBe(false);
    const text = output.join("");
    expect(text).toContain("BOTH databases");
    expect(text).toContain("Automatic migration is not safe");
  });

  it("dev_only --dry-run: reports plan without writing files", async () => {
    const { migrateEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const devPath = join(dataDir, "neotoma.db");
    await seedMinimalDb(devPath, 7, 2);
    const output: string[] = [];
    const result = await migrateEnvSplit({ dataDir, dryRun: true, yes: false, write: (s) => output.push(s) });
    expect(result.action_taken).toBe("dry_run_would_rename");
    expect(result.renamed).toBe(false);
    expect(result.backup_written).toBe(false);
    expect(existsSync(devPath)).toBe(true); // original untouched
    expect(existsSync(join(dataDir, "neotoma.prod.db"))).toBe(false);
    const text = output.join("");
    expect(text).toContain("--dry-run");
    expect(text).toContain("neotoma.prod.db");
  });

  it("dev_only without --yes: reports plan without writing files", async () => {
    const { migrateEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const devPath = join(dataDir, "neotoma.db");
    await seedMinimalDb(devPath, 3, 1);
    const output: string[] = [];
    const result = await migrateEnvSplit({ dataDir, dryRun: false, yes: false, write: (s) => output.push(s) });
    expect(result.action_taken).toBe("none");
    expect(result.renamed).toBe(false);
    expect(existsSync(devPath)).toBe(true);
  });

  it("dev_only --yes: writes backup and renames dev to prod", async () => {
    const { migrateEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const devPath = join(dataDir, "neotoma.db");
    const prodPath = join(dataDir, "neotoma.prod.db");
    await seedMinimalDb(devPath, 5, 2);
    const output: string[] = [];
    const result = await migrateEnvSplit({ dataDir, dryRun: false, yes: true, write: (s) => output.push(s) });
    expect(result.action_taken).toBe("renamed");
    expect(result.renamed).toBe(true);
    expect(result.backup_written).toBe(true);
    // Dev file should be gone, prod file should exist.
    expect(existsSync(devPath)).toBe(false);
    expect(existsSync(prodPath)).toBe(true);
    // Backup should exist.
    expect(result.backup_path).toBeDefined();
    expect(existsSync(result.backup_path!)).toBe(true);
    const text = output.join("");
    expect(text).toContain("Migration complete");
    expect(text).toContain("neotoma.prod.db");
  });

  it("dev_only --yes: idempotent — second run reports prod_only", async () => {
    const { migrateEnvSplit } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const devPath = join(dataDir, "neotoma.db");
    await seedMinimalDb(devPath, 5, 2);
    await migrateEnvSplit({ dataDir, dryRun: false, yes: true, write: () => {} });
    // Second run: dev is gone, prod has data.
    const output: string[] = [];
    const result2 = await migrateEnvSplit({ dataDir, dryRun: false, yes: true, write: (s) => output.push(s) });
    expect(result2.action_taken).toBe("none");
    expect(result2.status).toBe("prod_only");
    expect(output.join("")).toContain("No migration needed");
  });
});

describe("detectEnvSplitWarning", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neotoma-env-split-warn-test-"));
  });

  afterEach(() => {
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  });

  it("has_split=false when no dev DB exists", async () => {
    const { detectEnvSplitWarning } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    const warning = detectEnvSplitWarning(dataDir);
    expect(warning.has_split).toBe(false);
    expect(warning.suggested_action).toBeNull();
  });

  it("has_split=false when dev DB is empty", async () => {
    const { detectEnvSplitWarning } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    writeFileSync(join(dataDir, "neotoma.db"), "");
    const warning = detectEnvSplitWarning(dataDir);
    expect(warning.has_split).toBe(false);
  });

  it("has_split=true when dev has data and prod is absent", async () => {
    const { detectEnvSplitWarning } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    await seedMinimalDb(join(dataDir, "neotoma.db"), 4, 2);
    const warning = detectEnvSplitWarning(dataDir);
    expect(warning.has_split).toBe(true);
    expect(warning.dev_observations).toBe(4);
    expect(warning.dev_sources).toBe(2);
    expect(warning.prod_observations).toBe(0);
    expect(warning.suggested_action).toContain("migrate-env-split");
  });

  it("has_split=false when both have data (not a clean rename case)", async () => {
    const { detectEnvSplitWarning } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    await seedMinimalDb(join(dataDir, "neotoma.db"), 2, 1);
    await seedMinimalDb(join(dataDir, "neotoma.prod.db"), 3, 1);
    const warning = detectEnvSplitWarning(dataDir);
    // Both have data — has_split is false (not the "wrong env" pattern).
    expect(warning.has_split).toBe(false);
  });

  it("has_split=false when only prod has data", async () => {
    const { detectEnvSplitWarning } = await import("../../src/cli/commands/db_migrate_env_split.ts");
    await seedMinimalDb(join(dataDir, "neotoma.prod.db"), 3, 1);
    const warning = detectEnvSplitWarning(dataDir);
    expect(warning.has_split).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper: seed a minimal SQLite DB with the tables that inspectDb queries.
// Uses whichever SQLite driver is available (node:sqlite or better-sqlite3).
// ---------------------------------------------------------------------------

async function seedMinimalDb(
  dbPath: string,
  observations: number,
  sources: number,
): Promise<void> {
  const { createRequire } = await import("node:module");
  const nodeRequire = createRequire(import.meta.url);

  type MinimalDb = {
    exec: (sql: string) => void;
    prepare: (sql: string) => { run: (...p: unknown[]) => void };
    close?: () => void;
  };

  let db: MinimalDb;
  try {
    const native = nodeRequire("node:sqlite") as { DatabaseSync: new (path: string) => MinimalDb };
    db = new native.DatabaseSync(dbPath);
  } catch {
    const bsq = nodeRequire("better-sqlite3") as new (path: string) => MinimalDb;
    db = new bsq(dbPath);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        entity_id TEXT,
        observed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS entity_snapshots (
        entity_id TEXT PRIMARY KEY,
        updated_at TEXT
      );
    `);

    const insertObs = db.prepare("INSERT INTO observations (id, entity_id, observed_at) VALUES (?, ?, ?)");
    for (let i = 0; i < observations; i++) {
      insertObs.run(`obs-${i}`, `entity-${i}`, new Date().toISOString());
    }

    const insertSrc = db.prepare("INSERT INTO sources (id, created_at) VALUES (?, ?)");
    for (let i = 0; i < sources; i++) {
      insertSrc.run(`src-${i}`, new Date().toISOString());
    }

    if (observations > 0) {
      const insertSnap = db.prepare("INSERT INTO entity_snapshots (entity_id, updated_at) VALUES (?, ?)");
      insertSnap.run("entity-0", new Date().toISOString());
    }
  } finally {
    db.close?.();
  }
}
