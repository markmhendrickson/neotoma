import { describe, it, expect, vi, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

// We import the module under test directly so we can test logic without
// spawning a child process for every assertion.
import {
  semverGte,
  readReporterConfig,
  writeReporterConfig,
  buildEnvBlock,
  runReporterSetup,
  REPORTER_CONFIG_FILENAME,
  REPORTER_MIN_VERSION,
} from "../../src/cli/reporter_setup.js";

// ── semverGte ──────────────────────────────────────────────────────────────

describe("semverGte", () => {
  it("returns true when installed equals required", () => {
    expect(semverGte("0.12.0", "0.12.0")).toBe(true);
  });

  it("returns true when installed is greater (patch)", () => {
    expect(semverGte("0.12.1", "0.12.0")).toBe(true);
  });

  it("returns true when installed is greater (minor)", () => {
    expect(semverGte("0.13.0", "0.12.0")).toBe(true);
  });

  it("returns true when installed is greater (major)", () => {
    expect(semverGte("1.0.0", "0.12.0")).toBe(true);
  });

  it("returns false when installed is below required (patch)", () => {
    expect(semverGte("0.11.9", "0.12.0")).toBe(false);
  });

  it("returns false when installed is below required (minor)", () => {
    expect(semverGte("0.11.0", "0.12.0")).toBe(false);
  });

  it("returns false when installed is below required (major)", () => {
    expect(semverGte("0.0.1", "0.12.0")).toBe(false);
  });
});

// ── readReporterConfig / writeReporterConfig ───────────────────────────────

describe("readReporterConfig", () => {
  it("returns empty object when file does not exist", async () => {
    const result = await readReporterConfig("/nonexistent/.neotoma/reporter.json");
    expect(result).toEqual({});
  });

  it("returns parsed config when file exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const p = path.join(dir, "reporter.json");
      await fs.writeFile(p, JSON.stringify({ reporter_git_sha: "abc123", default_visibility: "public" }), "utf8");
      const result = await readReporterConfig(p);
      expect(result.reporter_git_sha).toBe("abc123");
      expect(result.default_visibility).toBe("public");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("writeReporterConfig", () => {
  it("creates parent directories and writes JSON", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const p = path.join(dir, ".neotoma", "reporter.json");
      await writeReporterConfig(p, { reporter_git_sha: "sha-abc", default_visibility: "private" });
      const raw = await fs.readFile(p, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.reporter_git_sha).toBe("sha-abc");
      expect(parsed.default_visibility).toBe("private");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// ── buildEnvBlock ──────────────────────────────────────────────────────────

describe("buildEnvBlock", () => {
  it("includes export lines for configured fields", () => {
    const block = buildEnvBlock(
      { reporter_git_sha: "abc", reporter_app_version: "1.2.3", default_visibility: "public" },
      ".neotoma/reporter.json"
    );
    expect(block).toContain("NEOTOMA_REPORTER_GIT_SHA");
    expect(block).toContain("abc");
    expect(block).toContain("NEOTOMA_REPORTER_APP_VERSION");
    expect(block).toContain("1.2.3");
    expect(block).toContain("NEOTOMA_REPORTER_DEFAULT_VISIBILITY");
    expect(block).toContain("public");
  });

  it("omits lines for unconfigured fields", () => {
    const block = buildEnvBlock({}, ".neotoma/reporter.json");
    expect(block).not.toContain("NEOTOMA_REPORTER_GIT_SHA");
    expect(block).not.toContain("NEOTOMA_REPORTER_APP_VERSION");
  });
});

// ── runReporterSetup ───────────────────────────────────────────────────────

describe("runReporterSetup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a version_check step", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const report = await runReporterSetup({ cwd: dir, dryRun: true });
      const versionStep = report.steps.find((s) => s.step === "version_check");
      expect(versionStep).toBeDefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("emits a config_write step with skipped=true in dry-run mode", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const report = await runReporterSetup({
        cwd: dir,
        dryRun: true,
        gitSha: "test-sha",
        appVersion: "1.0.0",
        defaultVisibility: "public",
        tool: "claude-code",
      });
      const configStep = report.steps.find((s) => s.step === "config_write");
      expect(configStep).toBeDefined();
      expect(configStep?.skipped).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("writes reporter.json when not dry-run", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      await runReporterSetup({
        cwd: dir,
        dryRun: false,
        gitSha: "sha-xyz",
        appVersion: "0.13.0",
        defaultVisibility: "private",
        // No tool to avoid running preflight against real filesystem
        tool: null,
      });
      const configPath = path.join(dir, REPORTER_CONFIG_FILENAME);
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.reporter_git_sha).toBe("sha-xyz");
      expect(parsed.reporter_app_version).toBe("0.13.0");
      expect(parsed.default_visibility).toBe("private");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("skips config_write when nothing changed", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const configPath = path.join(dir, REPORTER_CONFIG_FILENAME);
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ reporter_git_sha: "sha-abc", default_visibility: "public" }) + "\n",
        "utf8"
      );
      const report = await runReporterSetup({
        cwd: dir,
        dryRun: false,
        gitSha: "sha-abc",
        defaultVisibility: "public",
        tool: null,
      });
      const configStep = report.steps.find((s) => s.step === "config_write");
      expect(configStep?.skipped).toBe(true);
      expect(configStep?.changed).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reports smoke_test_command in output", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const report = await runReporterSetup({ cwd: dir, dryRun: true, tool: null });
      expect(report.smoke_test_command).toContain("issues create --dry-run");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reports min_version constant in version check details on version failure", async () => {
    // When installed version is not detectable, version_ok should be false.
    // The step details should reference REPORTER_MIN_VERSION.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const report = await runReporterSetup({ cwd: dir, dryRun: true, tool: null });
      const versionStep = report.steps.find((s) => s.step === "version_check");
      // Whether ok or not, details always carry the required version.
      expect(versionStep?.details).toMatchObject({ required: REPORTER_MIN_VERSION });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("sets print-block mode: config_write skipped=true, details contain config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-reporter-test-"));
    try {
      const report = await runReporterSetup({
        cwd: dir,
        dryRun: false,
        printBlock: true,
        gitSha: "sha-print",
        tool: null,
      });
      const configStep = report.steps.find((s) => s.step === "config_write");
      expect(configStep?.skipped).toBe(true);
      const details = configStep?.details as Record<string, unknown> | undefined;
      const config = details?.config as Record<string, unknown> | undefined;
      expect(config?.reporter_git_sha).toBe("sha-print");
      // File should NOT have been written
      await expect(
        fs.access(path.join(dir, REPORTER_CONFIG_FILENAME))
      ).rejects.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
