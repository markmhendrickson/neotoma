/**
 * Tests for `neotoma doctor`, `neotoma setup`, and permission-file writers.
 *
 * These tests exercise the pure functional surface (permission patchers,
 * setup runner with injected runners, doctor snapshot shape). They do not
 * exec the bundled CLI because these commands land before a release.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  patchClaudeCodeProject,
  patchCursorAllowlist,
  patchCodexConfig,
  writePermissionsForTool,
  toolFromString,
} from "../../src/cli/permissions.ts";
import { runSetup } from "../../src/cli/setup.ts";
import { runDoctor } from "../../src/cli/doctor.ts";

async function mkTmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

describe("permissions.patchClaudeCodeProject", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkTmp("ntm-claude");
  });
  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("creates .claude/settings.local.json with neotoma wildcard allow entries", async () => {
    const patch = await patchClaudeCodeProject(cwd);
    expect(patch.changed).toBe(true);
    expect(patch.created).toBe(true);
    const parsed = JSON.parse(patch.after) as { permissions: { allow: string[] } };
    expect(parsed.permissions.allow).toContain("Bash(neotoma:*)");
    expect(parsed.permissions.allow).toContain("Bash(npm install -g neotoma:*)");
  });

  it("is idempotent — a second patch reports no change", async () => {
    await patchClaudeCodeProject(cwd);
    const second = await patchClaudeCodeProject(cwd);
    expect(second.changed).toBe(false);
  });

  it("merges entries without clobbering existing allow list", async () => {
    const target = path.join(cwd, ".claude", "settings.local.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      `${JSON.stringify({ permissions: { allow: ["Bash(git:*)"] } }, null, 2)}\n`
    );
    const patch = await patchClaudeCodeProject(cwd);
    const parsed = JSON.parse(patch.after) as { permissions: { allow: string[] } };
    expect(parsed.permissions.allow).toEqual(
      expect.arrayContaining(["Bash(git:*)", "Bash(neotoma:*)", "Bash(npm install -g neotoma:*)"])
    );
  });

  it("respects --dry-run and does not touch disk", async () => {
    const patch = await patchClaudeCodeProject(cwd, { dryRun: true });
    expect(patch.changed).toBe(true);
    await expect(fs.stat(patch.path)).rejects.toThrow();
  });
});

describe("permissions.patchCursorAllowlist", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkTmp("ntm-cursor");
  });
  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("writes .cursor/allowlist.json with neotoma entries", async () => {
    const patch = await patchCursorAllowlist(cwd);
    expect(patch.changed).toBe(true);
    const parsed = JSON.parse(patch.after) as { allow: string[] };
    expect(parsed.allow).toContain("neotoma *");
    expect(parsed.allow).toContain("npm install -g neotoma");
  });

  it("is idempotent on re-run", async () => {
    await patchCursorAllowlist(cwd);
    const second = await patchCursorAllowlist(cwd);
    expect(second.changed).toBe(false);
  });
});

describe("permissions.patchCodexConfig", () => {
  let home: string;
  let prevHome: string | undefined;
  beforeEach(async () => {
    home = await mkTmp("ntm-codex-home");
    prevHome = process.env.HOME;
    process.env.HOME = home;
  });
  afterEach(async () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(home, { recursive: true, force: true });
  });

  it("creates ~/.codex/config.toml with [approvals] block", async () => {
    const patch = await patchCodexConfig();
    expect(patch.changed).toBe(true);
    expect(patch.after).toContain("[approvals]");
    expect(patch.after).toContain("neotoma *");
  });

  it("does not duplicate block when already present", async () => {
    await patchCodexConfig();
    const second = await patchCodexConfig();
    expect(second.changed).toBe(false);
  });
});

describe("permissions.toolFromString", () => {
  it("accepts common casings", () => {
    expect(toolFromString("claude-code")).toBe("claude-code");
    expect(toolFromString("ClaudeCode")).toBe("claude-code");
    expect(toolFromString("cursor")).toBe("cursor");
    expect(toolFromString("CODEX")).toBe("codex");
    expect(toolFromString("nope")).toBeNull();
  });
});

describe("permissions.writePermissionsForTool", () => {
  let cwd: string;
  let home: string;
  let prevHome: string | undefined;
  beforeEach(async () => {
    cwd = await mkTmp("ntm-perm-all-cwd");
    home = await mkTmp("ntm-perm-all-home");
    prevHome = process.env.HOME;
    process.env.HOME = home;
  });
  afterEach(async () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(cwd, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  it("returns no patches for openclaw (native plugin path)", async () => {
    const patches = await writePermissionsForTool("openclaw", cwd);
    expect(patches).toEqual([]);
  });

  it("writes only the project-scope claude file by default", async () => {
    const patches = await writePermissionsForTool("claude-code", cwd);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.path.endsWith(".claude/settings.local.json")).toBe(true);
  });

  it("writes both scopes when --scope both is requested", async () => {
    const patches = await writePermissionsForTool("claude-code", cwd, { scope: "both" });
    expect(patches).toHaveLength(2);
  });
});

describe("runSetup", () => {
  let cwd: string;
  let home: string;
  let prevHome: string | undefined;
  beforeEach(async () => {
    cwd = await mkTmp("ntm-setup-cwd");
    home = await mkTmp("ntm-setup-home");
    prevHome = process.env.HOME;
    process.env.HOME = home;
  });
  afterEach(async () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(cwd, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  it("returns a report with all four steps and honors --dry-run", async () => {
    const report = await runSetup({
      tool: "cursor",
      dryRun: true,
      cwd,
      runners: {
        init: async () => ({ id: "init", ok: true, changed: false, skipped: true, reason: "dry-run" }),
        mcpConfigure: async () => ({ id: "mcp-configure", ok: true, changed: false, skipped: true, reason: "dry-run" }),
        cliInstructionsConfigure: async () => ({
          id: "cli-instructions",
          ok: true,
          changed: false,
          skipped: true,
          reason: "dry-run",
        }),
      },
    });
    const stepIds = report.steps.map((s) => s.id);
    expect(stepIds).toEqual(["init", "mcp-configure", "cli-instructions", "permissions"]);
    expect(report.dry_run).toBe(true);
    expect(report.tool).toBe("cursor");
    expect(report.overall_ok).toBe(true);
  });

  it("writes permission files when dryRun is false", async () => {
    const report = await runSetup({
      tool: "claude-code",
      dryRun: false,
      cwd,
      runners: {
        init: async () => ({ id: "init", ok: true, changed: false, skipped: true, reason: "stub" }),
        mcpConfigure: async () => ({ id: "mcp-configure", ok: true, changed: false, skipped: true, reason: "stub" }),
        cliInstructionsConfigure: async () => ({
          id: "cli-instructions",
          ok: true,
          changed: false,
          skipped: true,
          reason: "stub",
        }),
      },
    });
    expect(report.permission_patches.length).toBeGreaterThan(0);
    const claudePath = path.join(cwd, ".claude", "settings.local.json");
    const body = await fs.readFile(claudePath, "utf8");
    expect(body).toContain("Bash(neotoma:*)");
  });
});

describe("runDoctor", () => {
  it("returns a snapshot with all top-level keys", async () => {
    const cwd = await mkTmp("ntm-doctor-cwd");
    try {
      const report = await runDoctor({ cwd });
      expect(report).toHaveProperty("neotoma");
      expect(report).toHaveProperty("data");
      expect(report).toHaveProperty("api");
      expect(report).toHaveProperty("mcp_servers_detected");
      expect(report).toHaveProperty("cli_instructions");
      expect(report).toHaveProperty("permission_files");
      expect(report).toHaveProperty("suggested_next_step");
      expect(typeof report.neotoma.installed).toBe("boolean");
      expect(typeof report.neotoma.node_on_path).toBe("boolean");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it("includes a mirror block with inside_git_repo / gitignored shape", async () => {
    const cwd = await mkTmp("ntm-doctor-mirror-cwd");
    const repoRoot = await mkTmp("ntm-doctor-mirror-repo");
    const mirrorDir = path.join(repoRoot, "data", "mirror");
    const originalMirrorEnabled = process.env.NEOTOMA_MIRROR_ENABLED;
    const originalMirrorPath = process.env.NEOTOMA_MIRROR_PATH;
    try {
      await fs.mkdir(path.join(repoRoot, ".git"), { recursive: true });
      await fs.mkdir(mirrorDir, { recursive: true });
      process.env.NEOTOMA_MIRROR_ENABLED = "false";
      process.env.NEOTOMA_MIRROR_PATH = mirrorDir;

      const report = await runDoctor({ cwd });

      expect(report).toHaveProperty("mirror");
      expect(report.mirror.enabled).toBe(false);
      expect(report.mirror.path).toBe(path.resolve(mirrorDir));
      expect(report.mirror.inside_git_repo).toBe(true);
      expect(report.mirror.git_repo_root).toBe(repoRoot);
      expect(report.mirror.gitignored).toBe(false);
      expect(report.mirror.eligible_for_offer).toBe(true);
    } finally {
      if (originalMirrorEnabled === undefined) delete process.env.NEOTOMA_MIRROR_ENABLED;
      else process.env.NEOTOMA_MIRROR_ENABLED = originalMirrorEnabled;
      if (originalMirrorPath === undefined) delete process.env.NEOTOMA_MIRROR_PATH;
      else process.env.NEOTOMA_MIRROR_PATH = originalMirrorPath;
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("mirror.eligible_for_offer is false when mirror is enabled", async () => {
    const cwd = await mkTmp("ntm-doctor-mirror-on-cwd");
    const mirrorDir = await mkTmp("ntm-doctor-mirror-on");
    const originalMirrorEnabled = process.env.NEOTOMA_MIRROR_ENABLED;
    const originalMirrorPath = process.env.NEOTOMA_MIRROR_PATH;
    try {
      process.env.NEOTOMA_MIRROR_ENABLED = "true";
      process.env.NEOTOMA_MIRROR_PATH = mirrorDir;

      const report = await runDoctor({ cwd });

      expect(report.mirror.enabled).toBe(true);
      expect(report.mirror.eligible_for_offer).toBe(false);
    } finally {
      if (originalMirrorEnabled === undefined) delete process.env.NEOTOMA_MIRROR_ENABLED;
      else process.env.NEOTOMA_MIRROR_ENABLED = originalMirrorEnabled;
      if (originalMirrorPath === undefined) delete process.env.NEOTOMA_MIRROR_PATH;
      else process.env.NEOTOMA_MIRROR_PATH = originalMirrorPath;
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(mirrorDir, { recursive: true, force: true });
    }
  });
});
